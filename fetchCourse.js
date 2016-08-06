var ucsc = require('./index');
var Promise = require('bluebird');
var util = require('util');
var fs = require('fs');

var read = function(name) {
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
}

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

var coursesInfo = {};
var coursesTimestamp = {};

var termsToSkip = {
    lessThan: '2168',
    equal: []
}

return read('./db/terms.json').then(function(json) {
    return Promise.map(json, function(term) {
        if ( term.code < termsToSkip.lessThan || (termsToSkip.equal && termsToSkip.equal).indexOf(term.code) !== -1 ) {
            console.log('Skipping', term.name, 'as specified')
            return;
        }
        coursesInfo[term.code] = {};
        return read('./db/terms/' + term.code + '.json').then(function(courses) {
            return Promise.map(Object.keys(courses), function(subject) {
                return Promise.map(courses[subject], function(course) {
                    if (course.num) {
                        console.log('Term', term.name, 'course number', course.num, 'fetching...')
                        var getCourse = function(term, course) {
                            return ucsc.getCourse(term.code, course.num)
                            .then(function(courseInfo) {
                                console.log('Term', term.name, 'course number', course.num, 'fetched')
                                delete courseInfo.md;
                                coursesInfo[term.code][course.num] = courseInfo;
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
                coursesTimestamp[term.code] = Math.round(+new Date()/1000)
                return write('./db/courses/' + term.code + '.json', JSON.stringify(coursesInfo[term.code]))
                .then(function() {
                    delete coursesInfo[term.code];
                    return write('./db/timestamp/courses/' + term.code + '.json', JSON.stringify(coursesTimestamp[term.code]))
                })
            })
        })
    }, { concurrency: 1 })
})
