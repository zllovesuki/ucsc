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
    profMap: {},
    subjectMap: {},
    termRef: null,
    saveTermsList: function(termCodesToAppend) {
        self.subjectMap = require('./db/subjects.json').reduce(function(subjectMap, row) {
            subjectMap[row.code] = row.name
            return subjectMap
        }, {})
        var getProfMapCache = function() {
            return self.read('./db/profMapCache.json')
            .then(function(cache) {
                console.log('profDisplayName cache loaded.')
                self.profMap = cache
            })
            .catch(function() {
                console.log('profDisplayName cache not found.')
                self.profMap = {}
            })
        }
        return Promise.all([
            ucsc.getTerms(),
            getProfMapCache()
        ]).spread(function(terms, idc) {
            if (typeof termCodesToAppend !== 'undefined') {
                termCodesToAppend.forEach(function(termCodeToAppend) {
                    if (terms.filter(function(el) {
                        return el.code == termCodeToAppend
                    }).length === 0) {
                        terms.unshift({
                            code: termCodeToAppend,
                            name: ucsc.calculateTermName(termCodeToAppend)
                        })
                    }
                })
            }

            self.termRef = terms.sort(function(a, b) {
                if (a.code < b.code) return 1
                else if (a.code > b.code) return -1
                else return 0
            })[0].code - 10

            if (terms.length < 4) {
                console.error('Potential poisonus terms list results detected, forced exit.')
                console.log(terms)
                return Promise.reject(new Error('Rejecting poisonus results.'))
            }

            return Promise.map(terms, function(term) {
                self.foundTime[term.code] = false;
                var getCourses = function() {
                    return ucsc.getCourses(term.code, 3000).then(function(courses) {
                        if (courses.length < 4) {
                            console.error('Potential poisonus course list results detected, forced exit.')
                            console.log(terms)
                            return Promise.reject(new Error('Rejecting poisonus results.'))
                        }
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
                                            if (courseInfo.md.start === 'N/A') return;
                                            self.foundTime[term.code] = true;
                                            term.date = courseInfo.md;
                                        })
                                    };
                                    return getCourse(term, course)
                                    .catch(function(e) {
                                        console.error(e)
                                        console.error('Error trying for', term.name, 'course number', course.num, 'skipping...')
                                    })
                                }else{
                                    console.log('No course number found, skipping...')
                                }
                            }, { concurrency: 1 })
                        }, { concurrency: 1 })
                        .then(function() {
                            if (term.code < self.termRef) return
                            // A Cluster of Fucks to overcome the problem of pisa no longer display first/last name for professor
                            console.log('Additional step: attempt to map displayName to First/Last name via Campus Directory')
                            for (var subject in courses) {
                                if (typeof self.profMap[subject] === 'undefined') self.profMap[subject] = {}
                                for (var i = 0; i < courses[subject].length; i++) {
                                    if (typeof courses[subject][i].ins === 'undefined') continue;
                                    if (typeof courses[subject][i].ins.d === 'undefined' || courses[subject][i].ins.d[0] === 'Staff') continue;
                                    if (typeof courses[subject][i].ins.l !== 'undefined') continue;
                                    if (typeof self.profMap[subject][courses[subject][i].ins.d[0]] !== 'undefined') continue;

                                    self.profMap[subject][courses[subject][i].ins.d[0]] = null
                                }
                            }

                            return Promise.map(Object.keys(self.profMap), function(subject) {
                                return Promise.map(Object.keys(self.profMap[subject]), function(profDisplayName) {
                                    if (!!self.profMap[subject][profDisplayName]) return;

                                    return ucsc.searchFacultyOnDirectoryByLastname(
                                        profDisplayName.slice(0, profDisplayName.indexOf(',')),
                                        profDisplayName.slice(profDisplayName.indexOf(',') + 1),
                                        self.subjectMap[subject]
                                    )
                                    .then(function(result) {
                                        if (result.bestGuess.name) {
                                            self.profMap[subject][profDisplayName] = result.bestGuess.name
                                        }
                                    })
                                    .catch(function(e) {
                                        console.error(e)
                                        console.error('Error fetching from directory for', profDisplayName)
                                    })
                                }, { concurrency: 1 })
                            }, { concurrency: 1 })
                            .then(function() {
                                for (var subject in courses) {
                                    for (var i = 0; i < courses[subject].length; i++) {
                                        if (typeof courses[subject][i].ins === 'undefined') continue;
                                        if (typeof courses[subject][i].ins.d === 'undefined' || courses[subject][i].ins.d[0] === 'Staff') continue;
                                        if (typeof courses[subject][i].ins.l !== 'undefined') continue;

                                        if (self.profMap[subject][courses[subject][i].ins.d[0]] === null) {
                                            self.profMap[subject][courses[subject][i].ins.d[0]] = false
                                        }
                                        if (!!!self.profMap[subject][courses[subject][i].ins.d[0]]) continue

                                        courses[subject][i].ins.l = self.profMap[subject][courses[subject][i].ins.d[0]].split(' ').slice(-1)[0]
                                        courses[subject][i].ins.f = self.profMap[subject][courses[subject][i].ins.d[0]].split(' ').slice(0, -1)[0]
                                    }
                                }
                            })
                        })
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
                        .then(function() {
                            return self.write('./db/profMapCache.json', self.profMap)
                        })
                    })
                }
                return getCourses()
                .catch(function(e) {
                    console.error(e);
                    console.error('Error saving', term.name)
                    console.log('Retrying', term.name, '(' + term.code + ')')
                    return getCourses()
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
    saveCourseInfo: function(doTerms) {
        return self.read('./db/terms.json').then(function(json) {
            return Promise.map(json, function(term) {
                if ( typeof doTerms !== 'undefined' && doTerms.indexOf(term.code) === -1 ) {
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
                        }, { concurrency: 25 })
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
            if (subjects.length < 4) {
                console.error('Potential poisonus subject list results detected, forced exit.')
                console.log(terms)
                return Promise.reject(new Error('Rejecting poisonus results.'))
            }
            return self.write('./db/subjects.json', subjects).then(function() {
                console.log('Subject list saved to', './db/subjects.json');
            })
            .then(function() {
                return self.write('./db/timestamp/subjects.json', Math.round(+new Date()/1000))
            })
        })
    },

    geSpring: {},
    geSummer: {},
    geFall: {},
    geWinter: {},
    flatCourses: {},
    calculateGETermsStats: function() {
        return Promise.all([
            self.read('./db/terms.json'),
            self.read('./db/ge.json')
        ]).spread(function(json, geMap) {
            return Promise.map(json, function(term) {
                return Promise.all([
                    self.read('./db/terms/' + term.code + '.json'),
                    self.read('./db/courses/' + term.code + '.json')
                ]).spread(function(courses, courseInfo) {
                    self.flatCourses[term.code] = {}
                    var obj = {}
                    Object.keys(courses).forEach(function(subject) {
                        courses[subject].forEach(function(course) {
                            obj = course;
                            obj.c = [subject, course.c].join(' ');
                            self.flatCourses[term.code][course.num] = obj;
                        })
                    })
                    var course = {}, code = '', year = '', ge = []
                    for (var courseNum in courseInfo) {
                        course = self.flatCourses[term.code][courseNum]
                        if (typeof course === 'undefined') continue
                        code = course.c + ' - ' + course.s;
                        year = '20' + term.code.substring(1, 3);
                        courseInfo[courseNum].ge.forEach(function(geCode) {

                            if (typeof geMap[geCode] === 'undefined') return

                            switch (term.code[term.code.length - 1]) {
                                case '0': // Winter

                                if (typeof self.geWinter[geCode] === 'undefined') self.geWinter[geCode] = {}
                                if (typeof self.geWinter[geCode][code] === 'undefined') self.geWinter[geCode][code] = {}
                                if (typeof self.geWinter[geCode][code][year] === 'undefined') self.geWinter[geCode][code][year] = 1
                                else self.geWinter[geCode][code][year]++

                                break;

                                case '2': // Spring

                                if (typeof self.geSpring[geCode] === 'undefined') self.geSpring[geCode] = {}
                                if (typeof self.geSpring[geCode][code] === 'undefined') self.geSpring[geCode][code] = {}
                                if (typeof self.geSpring[geCode][code][year] === 'undefined') self.geSpring[geCode][code][year] = 1
                                else self.geSpring[geCode][code][year]++

                                break;

                                case '4': // Summer

                                if (typeof self.geSummer[geCode] === 'undefined') self.geSummer[geCode] = {}
                                if (typeof self.geSummer[geCode][code] === 'undefined') self.geSummer[geCode][code] = {}
                                if (typeof self.geSummer[geCode][code][year] === 'undefined') self.geSummer[geCode][code][year] = 1
                                else self.geSummer[geCode][code][year]++

                                break;

                                case '8': // Fall

                                if (typeof self.geFall[geCode] === 'undefined') self.geFall[geCode] = {}
                                if (typeof self.geFall[geCode][code] === 'undefined') self.geFall[geCode][code] = {}
                                if (typeof self.geFall[geCode][code][year] === 'undefined') self.geFall[geCode][code][year] = 1
                                else self.geFall[geCode][code][year]++

                                break;
                            }
                        })
                    }
                    self.flatCourses[term.code] = {}
                })
            })
        }).then(function() {
            var list = {
                spring: self.geSpring,
                summer: self.geSummer,
                fall: self.geFall,
                winter: self.geWinter,
            };

            return Promise.map(Object.keys(list), function(quarter) {
                return self.write('./db/offered/ge_' + quarter + '.json', list[quarter]);
            })
        }).then(function() {
            self.geSpring = {};
            self.geSummer = {};
            self.geFall = {};
            self.geWinter = {};
            self.flatCourses = {}
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
                    for (var subject in courses) {
                        courses[subject].forEach(function(course) {
                            var code = subject + ' ' + course.c + ' - ' + course.s;
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
                    }
                })
            })
        }).then(function() {
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
    saveRateMyProfessorsMappings: function(andromedaReadHandler) {
        self.instructors = []
        self.mapping = {}
        return andromedaReadHandler('terms').then(function(json) {
            self.termRef = json.sort(function(a, b) {
                if (a.code < b.code) return 1
                else if (a.code > b.code) return -1
                else return 0
            })[0].code - 10
            return Promise.map(json, function(term) {
                if (term.code < self.termRef) return
                return andromedaReadHandler('terms/' + term.code).then(function(courses) {
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
            }, { concurrency: 3 })
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
    },

    saveMajorsMinors: function() {
        return ucsc.getMajorMinor().then(function(list) {
            console.log('Saving list of majors/minors')
            return self.write('./db/major-minor.json', list)
            .then(function() {
                return self.write('./db/timestamp/major-minor.json', Math.round(+new Date()/1000));
            })
        })
    },

    saveFinalSchedules: function() {
        return ucsc.getFinalSchedule().then(function(finals) {
            console.log('Saving final schedules')
            return self.write('./db/final.json', finals)
            .then(function() {
                return self.write('./db/timestamp/final.json', Math.round(+new Date()/1000));
            })
        })
    }

}
