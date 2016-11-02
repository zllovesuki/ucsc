var ucsc = require('./index');
var Promise = require('bluebird');
var stringSimilarity = require('string-similarity');
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
            return Promise.map(json, function(term) {saveRateMyProfessorsMappings
                return self.read('./db/terms/' + term.code + '.json').then(function(courses) {
                    self.index[term.code] = elasticlunr();

                    self.index[term.code].addField('c');
                    self.index[term.code].addField('n');
                    self.index[term.code].addField('f');
                    self.index[term.code].addField('la');
                    self.index[term.code].addField('d');
                    self.index[term.code].setRef('b');
                    selsaveRateMyProfessorsMappingsf.index[term.code].saveDocument(false);

                    return Promise.map(Object.keys(courses), function(subject) {
                        return Promise.map(courses[subject], function(course) {
                            if (course.num) {
                                course.c = subject + ' ' + course.c;
                                //course.lo = course.loc;
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

    rmp: {},
    mapping: {},
    saveRateMyProfessorsMappings: function(s3ReadHandler) {
        return Promise.all([
            s3ReadHandler('/terms.json'),
            self.read('./tidManualMappings.json')
        ]).spread(function(json, manual) {
            return Promise.map(json, function(term) {
                return s3ReadHandler('/terms/' + term.code + '.json').then(function(courses) {
                    return Promise.map(Object.keys(courses), function(subject) {
                        return Promise.map(courses[subject], function(course) {
                            if (!(course.ins.f && course.ins.l)) {
                                console.log('No ins name found, skipping...')
                                return;
                            }
                            if (typeof self.rmp[course.ins.f + course.ins.l] !== 'undefined') return;
                            self.rmp[course.ins.f + course.ins.l] = true;
                            var fetch = function() {
                                console.log('Trying alternative methods for', course.ins.f, course.ins.l, 'since ratings are not found on RMP based on last name');
                                var lastNameVariation = function(lastName) {
                                    var index;
                                    // Fehren-Schmitz
                                    if ( (index = lastName.indexOf('-')) !== -1) {
                                        return lastName.substring(index + 1);
                                    }
                                    // Martinez Leal
                                    if ( (index = lastName.indexOf(' ')) !== -1) {
                                        return lastName.substring(index + 1);
                                    }
                                    return null;
                                }
                                return Promise.all([
                                    // try again with last name variation
                                    ucsc.getObjByLastName(lastNameVariation(course.ins.l)),
                                    // try again with "display name"
                                    ucsc.getObjByLastName(course.ins.d[0]),
                                    // try again with first + last
                                    ucsc.getObjByFullName(course.ins.f, course.ins.l)
                                ]).spread(function(objA, objB, objC) {
                                    if (lastNameVariation(course.ins.l) !== null && objA !== null) {
                                        // We are not going to check first name similarity again, because we are confident that the variation is very rare
                                        console.log('Found a good match based on last name variation', lastNameVariation(course.ins.l), ':', course.ins.l);
                                        return objA
                                    }else if (objB !== null) {
                                        console.log('Found a good match based on display name', course.ins.d[0]);
                                        return objB
                                    }else if (objC !== null) {
                                        console.log('Found a good match based on full name', course.ins.f, course.ins.l);
                                        return objC
                                    }else{
                                        console.log('Ratings for', course.ins.f, course.ins.l, 'not found on RMP based on last name and full name, not even display name');
                                        return null;
                                    }
                                })
                                .then(function(obj) {
                                    if (obj === null) return;
                                    console.log('Saving tid', 'for', course.ins.f, course.ins.l, obj.tid);
                                    self.mapping[course.ins.f + course.ins.l] = obj.tid;
                                })
                            }
                            var fetchScores = function() {
                                var manualList = self.intersect(course.ins.d, Object.keys(manual));
                                if (manualList.length > 0) {
                                    console.log('Using manual overrides for', course.ins.f, course.ins.l, 'with', manual[manualList[0]]);
                                    self.mapping[course.ins.f + course.ins.l] = manual[manualList[0]];
                                    return;
                                }
                                return ucsc.getObjByLastName(course.ins.l).then(function(obj) {
                                    console.log('Search by last name', course.ins.l);
                                    if (obj !== null) {
                                        var resultLastName = obj.name.substring(0, obj.name.indexOf(',')).toLowerCase();
                                        var resultFirstname = obj.name.substring(obj.name.indexOf(',') + 2).toLowerCase();
                                        if (course.ins.l.toLowerCase() == resultLastName
                                        && stringSimilarity.compareTwoStrings(course.ins.f.toLowerCase(), resultFirstname) > 0.5) {
                                            // we shall call it a match
                                            console.log('Found a good match based on last name', course.ins.l, 'Results', resultFirstname, resultLastName, ';', 'Current', course.ins.f, course.ins.l);
                                            console.log('Saving tid', 'for', course.ins.f, course.ins.l, obj.tid);
                                            self.mapping[course.ins.f + course.ins.l] = obj.tid;
                                        }else{
                                            return fetch();
                                        }
                                    }else{
                                        //console.log('Ratings for', course.ins.f, course.ins.l, 'not found on RMP based on last name');
                                        return fetch();
                                    }
                                })
                                .catch(function(e) {
                                    console.log('Retrying', course.ins.f, course.ins.l)
                                    console.error(e);
                                    return fetchScores();
                                })
                            }
                            return fetchScores();
                        }, { concurrency: 10 })
                    }, { concurrency: 2 })
                })
            }, { concurrency: 1 })
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
