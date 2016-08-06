var ucsc = require('./index');
var Promise = require('bluebird');
var util = require('util');
var fs = require('fs');

function write(name, json) {
    return new Promise(function(resolve, reject) {
        fs.writeFile(name, json, function(err) {
            if (err) {
                return reject(err);
            }
            return resolve();
        });
    })
}

var courseListTimestamp = {};
var foundTime = {};

var termsToSkip = {
    lessThan: '2168',
    equal: []
}

ucsc.getTerms()
.then(function(terms) {
    return Promise.map(terms, function(term) {
        if ( term.code < termsToSkip.lessThan || (termsToSkip.equal && termsToSkip.equal).indexOf(term.code) !== -1 ) {
            console.log('Skipping', term.name, 'as specified')
            return;
        }
        foundTime[term.code] = false;
        return ucsc.getCourses(term.code, 3000).then(function(courses) {
            return Promise.map(Object.keys(courses), function(subject) {
                return Promise.map(courses[subject], function(course) {
                    if (foundTime[term.code]) {
                        return;
                    }
                    if (course.num) {
                        console.log('Term', term.name, 'fetching start and end date')
                        var getCourse = function(term, course) {
                            return ucsc.getCourse(term.code, course.num)
                            .then(function(courseInfo) {
                                foundTime[term.code] = true;
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
                courseListTimestamp[term.code] = Math.round(+new Date()/1000)
                return write('./db/terms/' + term.code + '.json', JSON.stringify(courses))
                .then(function() {
                    console.log(term.name, 'saved to', './db/terms/' + term.code + '.json');
                })
                .then(function() {
                    return write('./db/timestamp/terms/' + term.code + '.json', JSON.stringify(courseListTimestamp[term.code]))
                })
            })
        })
        .then(function() {
            return write('./db/terms.json', JSON.stringify(terms))
            .then(function() {
                return write('./db/timestamp/terms.json', JSON.stringify(Math.round(+new Date()/1000)));
            })
        })
        .catch(function(e) {
            console.error(e);
            console.error('Error saving', term.name)
        })
    }, { concurrency: 1 })
})
