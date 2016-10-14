var ucsc = require('./index');
var Promise = require('bluebird');
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
    }

}
