var ucsc = require('./index');
var Promise = require('bluebird');
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

    /*
        General course list
    */
    courseListTimestamp: {},
    foundTime: {},
    saveTermsList: function(skipLessThan) {
        skipLessThan = (typeof skipLessThan === 'undefined' ? 0 : skipLessThan);
        return ucsc.getTerms().then(function(terms) {
            return Promise.map(terms, function(term) {
                if ( term.code < skipLessThan ) {
                    console.log('Skipping', term.name, 'as specified')
                    return;
                }
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
                                        console.log('Term', term.name, 'course number', course.num, 'fetched')
                                        delete courseInfo.md;
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
                    }, { concurrency: 2 }).then(function() {
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
                                course.c = subject + ' ' + course.c.split(/(\d+)/).filter(Boolean).join(" ");
                                //course.lo = course.loc;
                                course.n = course.n.split(/(?=[A-Z])/).map(function(el) { return el.trim(); }).join(" ")
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

            var list = [
                {
                    spring: self.coursesSpring
                },
                {
                    summer: self.coursesSummer
                },
                {
                    fall: self.coursesFall
                },
                {
                    winter: self.coursesWinter
                }
            ];

            list.forEach(function(obj) {
                for (var quarter in obj) {
                    /*
                    var table = new Table({
                        head: ['Quarter', 'Course', 'Frequency', 'Years'],
                        colWidths: [15, 15, 15, 100]
                    });
                    for (var code in obj[quarter]) {
                        var year = Object.keys(obj[quarter][code]);
                        table.push([quarter, code, year.length + '/' + years.length, year.join(', ')])
                        //console.log(code, 'was offered', year.length, year.length > 1 ? 'times' : 'time' , 'in', quarter, 'in the past', years.length, 'years', '->', year.join(', '));
                    }
                    write('./db/offered/display/' + quarter, table.toString());
                    */
                    self.write('./db/offered/' + quarter + '.json', obj[quarter]);
                }
            })
        })
    },

    rmp: {},
    mapping: {},
    saveRateMyProfessorsMappings: function() {
        return self.read('./db/terms.json').then(function(json) {
            return Promise.map(json, function(term) {
                return self.read('./db/terms/' + term.code + '.json').then(function(courses) {
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
                                    ucsc.getRateMyProfessorScoresByLastName(lastNameVariation(course.ins.l)),
                                    // try again with "display name"
                                    ucsc.getRateMyProfessorScoresByLastName(course.ins.d[0]),
                                    // try again with first + last
                                    ucsc.getRateMyProfessorScoresByFullName(course.ins.f, course.ins.l)
                                ]).spread(function(scoreObjA, scoreObjB, scoreObjC) {
                                    if (lastNameVariation(course.ins.l) !== null && scoreObjA !== null) {
                                        // We are not going to check first name similarity again, because we are confident that the variation is very rare
                                        console.log('Found a good match based on last name variation', lastNameVariation(course.ins.l), ':', course.ins.l);
                                        return {
                                            tid: scoreObjA.tid
                                        }
                                    }else if (scoreObjB !== null) {
                                        console.log('Found a good match based on display name', course.ins.d[0]);
                                        return {
                                            tid: scoreObjB.tid
                                        }
                                    }else if (scoreObjC !== null) {
                                        console.log('Found a good match based on full name', course.ins.f, course.ins.l);
                                        return {
                                            tid: scoreObjC.tid
                                        }
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
                                return ucsc.getRateMyProfessorScoresByLastName(course.ins.l).then(function(scoreObj) {
                                    console.log('Search by last name', course.ins.l);
                                    if (scoreObj !== null) {
                                        var resultLastName = scoreObj.name.substring(0, scoreObj.name.indexOf(',')).toLowerCase();
                                        var resultFirstname = scoreObj.name.substring(scoreObj.name.indexOf(',') + 2).toLowerCase();
                                        if (course.ins.l.toLowerCase() == resultLastName
                                        && stringSimilarity.compareTwoStrings(course.ins.f.toLowerCase(), resultFirstname) > 0.5) {
                                            // we shall call it a match
                                            console.log('Found a good match based on last name', course.ins.l, 'Results', resultFirstname, resultLastName, ';', 'Current', course.ins.f, course.ins.l);
                                            console.log('Saving tid', 'for', course.ins.f, course.ins.l, scoreObj.tid);
                                            self.mapping[course.ins.f + course.ins.l] = scoreObj.tid;
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
                return self.write('./db/rmp.json', mapping)
                .then(function() {
                    return self.write('./db/timestamp/rmp.json', JSON.stringify(Math.round(+new Date()/1000)));
                })
            })
        })
    }

}
