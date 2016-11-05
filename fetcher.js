var ucsc = require('./index');
var Promise = require('bluebird');
var FuzzySet = require('fuzzyset.js');
var elasticlunr = require('elasticlunr');
var fs = require('fs');

var self = module.exports = {

    /*
        Expose API
    */
    ucsc: ucsc,

    /*
        Common functions
    */
    read: function(name) {
        return new Promise(function(resolve ,reject) {
            fs.readFile(name, {
                encoding: 'utf-8'
            }, function(err, data) {
                if (err) {
                    return reject(err);
                }
                return resolve(JSON.parse(data));
            })
        })
    },
    write: function(name, object) {
        return new Promise(function(resolve, reject) {
            fs.writeFile(name, JSON.stringify(object), function(err) {
                if (err) {
                    return reject(err);
                }
                return resolve();
            });
        })
    },
    intersect: function(a, b) {
        var t;
        if (b.length > a.length) t = b, b = a, a = t; // indexOf to loop over shorter
        return a
            .filter(function(e) {
                return b.indexOf(e) !== -1;
            })
            .filter(function(e, i, c) { // extra step to remove duplicates
                return c.indexOf(e) === i;
            });
    }, // http://stackoverflow.com/questions/16227197/compute-intersection-of-two-arrays-in-javascript

    /*
        General course list
    */
    courseListTimestamp: {},
    foundTime: {},
    saveTermsList: function(termCodeToAppend) {
        termCodeToAppend = (typeof termCodeToAppend === 'undefined' ? null : termCodeToAppend)
        return ucsc.getTerms().then(function(terms) {
            if (termCodeToAppend !== null) {
                if (terms.filter(function(el) {
                    return el.code == termCodeToAppend
                }).length === 0) {
                    terms.unshift({
                        code: termCodeToAppend.toString(),
                        name: ucsc.calculateTermName(termCodeToAppend)
                    })
                }
            }
            return Promise.map(terms, function(term) {
                self.foundTime[term.code] = false;
                return ucsc.getCourses(term.code, 3000).then(function(courses) {
                    return Promise.map(Object.keys(courses), function(subject) {
                        return Promise.map(courses[subject], function(course) {
                            if (self.foundTime[term.code]) {
                                return;
                            }
                            if (course.num) {
                                console.log('Term', term.name, 'fetching start and end date')
                                var getCourse = function(term, course) {
                                    return ucsc.getCourse(term.code, course.num)
                                    .then(function(courseInfo) {
                                        self.foundTime[term.code] = true;
                                        term.date = courseInfo.md;
                                    })
                                };
                                return getCourse(term, course)
                                .catch(function(e) {
                                    console.log('Retrying', term.name, 'course number', course.num)
                                    return getCourse(term, course)
                                })
                            }else{
                                console.log('No course number found, skipping...')
                            }
                        }, { concurrency: 1 })
                    }, { concurrency: 1 })
                    .then(function() {
                        self.courseListTimestamp[term.code] = Math.round(+new Date()/1000)
                        return self.write('./db/terms/' + term.code + '.json', courses)
                        .then(function() {
                            console.log(term.name, 'saved to', './db/terms/' + term.code + '.json');
                        })
                        .then(function() {
                            return self.write('./db/timestamp/terms/' + term.code + '.json', self.courseListTimestamp[term.code])
                        })
                    })
                })
                .then(function() {
                    return self.write('./db/terms.json', terms)
                    .then(function() {
                        return self.write('./db/timestamp/terms.json', Math.round(+new Date()/1000));
                    })
                })
                .catch(function(e) {
                    console.error(e);
                    console.error('Error saving', term.name)
                })
            }, { concurrency: 1 })
        }).then(function() {
            self.courseListTimestamp = {};
            self.foundTime = {};
        })
    },

    /*
        Course info (description, pre-req, sections, etc)
    */
    coursesInfo: {},
    courseInfoTimestamp: {},
    saveCourseInfo: function(skipLessThan) {
        return self.read('./db/terms.json').then(function(json) {
            return Promise.map(json, function(term) {
                if ( term.code < skipLessThan ) {
                    console.log('Skipping', term.name, 'as specified')
                    return;
                }
                self.coursesInfo[term.code] = {};
                return self.read('./db/terms/' + term.code + '.json').then(function(courses) {
                    return Promise.map(Object.keys(courses), function(subject) {
                        return Promise.map(courses[subject], function(course) {
                            if (course.num) {
                                console.log('Term', term.name, 'course number', course.num, 'fetching...')
                                var getCourse = function(term, course) {
                                    return ucsc.getCourse(term.code, course.num)
                                    .then(function(courseInfo) {
                                        if (courseInfo === false) {
                                            console.error('Term', term.name, 'course number', course.num, 'malformed, saved as false');
                                        }else{
                                            console.log('Term', term.name, 'course number', course.num, 'fetched');
                                            delete courseInfo.md;
                                        }
                                        self.coursesInfo[term.code][course.num] = courseInfo;
                                    })
                                };
                                return getCourse(term, course)
                                .catch(function(e) {
                                    console.log('Retrying', term.name, 'course number', course.num)
                                    return getCourse(term, course)
                                })
                            }else{
                                console.log('No course number found, skipping...')
                            }
                        }, { concurrency: 50 })
                    }, { concurrency: 2 })
                    .then(function() {
                        console.log('Saving term', term.name)
                        self.courseInfoTimestamp[term.code] = Math.round(+new Date()/1000)
                        return self.write('./db/courses/' + term.code + '.json', self.coursesInfo[term.code])
                        .then(function() {
                            delete self.coursesInfo[term.code];
                            return self.write('./db/timestamp/courses/' + term.code + '.json', self.courseInfoTimestamp[term.code])
                        })
                    })
                })
            }, { concurrency: 1 })
        }).then(function() {
            self.courseInfoTimestamp = {};
            self.coursesInfo = {};
        })
    },

    /*
        Index of course
    */
    index: {},
    indexTimestamp: {},
    buildIndex: function() {
        return self.read('./db/terms.json').then(function(json) {
            return Promise.map(json, function(term) {
                return self.read('./db/terms/' + term.code + '.json').then(function(courses) {
                    self.index[term.code] = elasticlunr();

                    self.index[term.code].addField('c');
                    self.index[term.code].addField('n');
                    self.index[term.code].addField('f');
                    self.index[term.code].addField('la');
                    self.index[term.code].addField('d');
                    self.index[term.code].setRef('b');
                    self.index[term.code].saveDocument(false);

                    return Promise.map(Object.keys(courses), function(subject) {
                        return Promise.map(courses[subject], function(course) {
                            if (course.num) {
                                course.c = subject + ' ' + course.c;
                                //course.lo = course.loc;
                                course.c = course.c.split(/(\d+)/).map(function(el) { return el.replace(/\s+/g, ''); }).join(' ')
                                course.n = course.n;
                                course.f = course.ins.f;
                                course.la = course.ins.l;
                                course.d = course.ins.d[0];
                                course.b = course.num;
                                self.index[term.code].addDoc(course);
                            }else{
                                console.log('No course number found, skipping...')
                            }
                        }, { concurrency: 50 })
                    }, { concurrency: 2 }).then(function() {
                        self.indexTimestamp[term.code] = Math.round(+new Date()/1000)
                        console.log('Saving term index', term.name)
                        return self.write('./db/index/' + term.code + '.json', self.index[term.code].toJSON())
                        .then(function() {
                            return self.write('./db/timestamp/index/' + term.code + '.json', self.indexTimestamp[term.code]).then(function() {
                                delete self.index[term.code];
                            })
                        })
                    })
                })
            }, { concurrency: 1 })
        }).then(function() {
            self.indexTimestamp = {};
            self.index = {};
        })
    },

    /*
        GE Code and their descriptions
    */
    saveGEDesc: function() {
        return ucsc.getGEDesc().then(function(ge) {
            return self.write('./db/ge.json', ge).then(function() {
                console.log('GE descriptions saved to', './db/ge.json');
            })
        })
    },

    /*
        Map coordinates
    */
    saveMaps: function() {
        return ucsc.getMaps().then(function(locations) {
            return self.write('./db/locations.json', locations).then(function() {
                console.log('Map locations saved to', './db/locations.json');
            })
            .then(function() {
                return self.write('./db/timestamp/locations.json', Math.round(+new Date()/1000))
            })
        })
    },

    /*
        Subject list
    */
    saveSubjects: function() {
        return ucsc.getSubjects().then(function(subjects) {
            return self.write('./db/subjects.json', subjects).then(function() {
                console.log('Subject list saved to', './db/subjects.json');
            })
            .then(function() {
                return self.write('./db/timestamp/subjects.json', Math.round(+new Date()/1000))
            })
        })
    },

    /*
        Course offering frequency
    */
    coursesSpring: {},
    coursesSummer: {},
    coursesFall: {},
    coursesWinter: {},
    calculateTermsStats: function() {
        return self.read('./db/terms.json').then(function(json) {
            return Promise.map(json, function(term) {
                return self.read('./db/terms/' + term.code + '.json').then(function(courses) {
                    return Promise.map(Object.keys(courses), function(subject) {
                        return Promise.map(courses[subject], function(course) {
                            var code = subject + ' ' + course.c;
                            var year = '20' + term.code.substring(1, 3);
                            switch (term.code[term.code.length - 1]) {
                                case '0': // Winter

                                if (typeof self.coursesWinter[code] === 'undefined') self.coursesWinter[code] = {};
                                if (typeof self.coursesWinter[code][year] === 'undefined') self.coursesWinter[code][year] = 1;
                                else self.coursesWinter[code][year]++;

                                break;

                                case '2': // Spring

                                if (typeof self.coursesSpring[code] === 'undefined') self.coursesSpring[code] = {};
                                if (typeof self.coursesSpring[code][year] === 'undefined') self.coursesSpring[code][year] = 1;
                                else self.coursesSpring[code][year]++;

                                break;

                                case '4': // Summer

                                if (typeof self.coursesSummer[code] === 'undefined') self.coursesSummer[code] = {};
                                if (typeof self.coursesSummer[code][year] === 'undefined') self.coursesSummer[code][year] = 1;
                                else self.coursesSummer[code][year]++;

                                break;

                                case '8': // Fall

                                if (typeof self.coursesFall[code] === 'undefined') self.coursesFall[code] = {};
                                if (typeof self.coursesFall[code][year] === 'undefined') self.coursesFall[code][year] = 1;
                                else self.coursesFall[code][year]++;

                                break;
                            }
                        })
                    })
                })
            })
        }).then(function() {

            /*
            var years = ['2004', '2005', '2006', '2007', '2008', '2009', '2010', '2011', '2012', '2013', '2014', '2015', '2016'].map(function(el) {
                return parseInt(el);
            })

            var Table = require('cli-table');
            */

            var list = {
                spring: self.coursesSpring,
                summer: self.coursesSummer,
                fall: self.coursesFall,
                winter: self.coursesWinter,
            };

            return Promise.map(Object.keys(list), function(quarter) {
                return self.write('./db/offered/' + quarter + '.json', list[quarter]);
            })
        }).then(function() {
            self.coursesSpring = {};
            self.coursesSummer = {};
            self.coursesFall = {};
            self.coursesWinter = {};
        })
    },

    instructors: [],
    mapping: {},
    strip: function(string) {
        return string.replace(/\s+/g, "").replace(/-/g, "").replace(/\./g, "");
    },
    getLastName: function(string) {
        return string.slice(0, string.indexOf(', '))
    },
    getFirstName: function(string) {
        return string.slice(string.indexOf(', ') + 2);
    },
    getCapsInFirstName: function(string) {
        return string.replace(/[a-z]/g, '')
    },
    saveRateMyProfessorsMappings: function(s3ReadHandler) {
        return s3ReadHandler('/terms.json').then(function(json) {
            return Promise.map(json, function(term) {
                return s3ReadHandler('/terms/' + term.code + '.json').then(function(courses) {
                    Object.keys(courses).forEach(function(subject) {
                        courses[subject].forEach(function(course) {
                            if (!(course.ins.f && course.ins.l)) {
                                return;
                            }
                            self.instructors.push({
                                d: course.ins.d.filter(function(el) { return el.indexOf(course.ins.l) !== -1 })[0],
                                f: course.ins.f,
                                l: course.ins.l
                            })
                        })
                    })
                })
            }, { concurrency: 1 })
            .then(function() {
                self.instructors = self.instructors.filter(function (o, i, s) {
                    return s.findIndex(function (t) {
                        return t.l === o.l && t.f === o.f;
                    }) === i;
                });

                var fuzzy = null;

                var derOneL = null;
                var derOneFL = null;

                return Promise.map(self.instructors, function(ins) {
                    return Promise.all([
                        ucsc.getObjByLastName(ins.l),
                        ucsc.getObjByLastName(ins.l.replace(/\s+/g, "").replace(/-/g, "")),
                        ucsc.getObjByFullName(ins.f, ins.l),
                        ucsc.getObjByFullName(ins.f, ins.l.replace(/\s+/g, "").replace(/-/g, ""))
                    ]).spread(function(l, nl, fl, fnl) {
                        console.log(ins.l + ', ' + ins.f + ':')
                        if (l === null && nl !== null) {
                            // sub striped last name
                            l = nl;
                        }
                        if (fl === null && fnl !== null) {
                            // sub striped full name
                            fl = fnl;
                        }
                        if (fl !== null) {
                            // fl[0]
                            for (var i = 0, length = fl.length; i < length; i++) {
                                // It's better than we don't match than matching the wrong person
                                if (fl[i].school.toLowerCase().indexOf('santa cruz') === -1) continue;
                                derOneFL = i;
                            }
                            if (derOneFL !== null) {
                                self.mapping[ins.f + ins.l] = fl[derOneFL].tid;
                                console.log('perfect')
                            }
                        }else if (l !== null) {
                            for (var i = 0, length = l.length; i < length; i++) {
                                // It's better than we don't match than matching the wrong person
                                if (l[i].school.toLowerCase().indexOf('santa cruz') === -1) continue;

                                // make sure that the last name is the same
                                if (self.strip(self.getLastName(l[i].name)) == self.strip(ins.l)
                                    && (
                                        // either the first three characters of the first name are the same
                                        self.strip(self.getFirstName(l[i].name)).slice(0, 3).toLowerCase() == self.strip(ins.f).slice(0, 3).toLowerCase()
                                        || (
                                            // or the CAPS are the same
                                            self.strip(self.getCapsInFirstName(ins.f)).length > 1
                                            && self.strip(self.getCapsInFirstName(self.getFirstName(l[i].name))) == self.strip(self.getCapsInFirstName(ins.f))
                                        )
                                    )
                                ) {
                                    derOneL = i;
                                }else{
                                    fuzzy = FuzzySet([self.strip(ins.f)]).get(self.strip(self.getFirstName(l[i].name)));
                                    if (self.strip(self.getLastName(l[i].name)) == self.strip(ins.l) && fuzzy !== null && fuzzy[0][0] > 0.5) {
                                        derOneL = i;
                                    }
                                }
                            }
                            if (derOneL !== null) {
                                self.mapping[ins.f + ins.l] = l[derOneL].tid;
                                console.log('match')
                            }else{
                                console.log('rejected')
                            }
                        }
                        if (derOneFL === null && derOneL === null) console.log('skipped')

                        if (fl !== null && derOneFL !== null) console.log('First Last: ' + ins.l + ', ' + ins.f, fl[derOneFL]);
                        if (l !== null && derOneL !== null) console.log('Last:       ' + ins.l, l[derOneL]);
                        console.log('---')
                        console.log('')
                        derOneL = null;
                        derOneFL = null;
                    })
                }, { concurrency: 1 })
            })
            .then(function() {
                console.log('Saving mappings')
                return self.write('./db/rmp.json', self.mapping)
                .then(function() {
                    return self.write('./db/timestamp/rmp.json', Math.round(+new Date()/1000));
                })
            })
        })
    }

}
