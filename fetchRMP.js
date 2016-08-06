var stringSimilarity = require('string-similarity');
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

var rmp = {};
var mapping = {};

return read('./db/terms.json').then(function(json) {
    return Promise.map(json, function(term) {
        return read('./db/terms/' + term.code + '.json').then(function(courses) {
            return Promise.map(Object.keys(courses), function(subject) {
                return Promise.map(courses[subject], function(course) {
                    if (!(course.ins.f && course.ins.l)) {
                        console.log('No ins name found, skipping...')
                        return;
                    }
                    if (typeof rmp[course.ins.f + course.ins.l] !== 'undefined') return;
                    rmp[course.ins.f + course.ins.l] = true;
                    var fetch = function() {
                        console.log('Trying alternative methods for ', course.ins.f, course.ins.l, ' since ratings are not found on RMP based on last name');
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
                                return ucsc.getRateMyProfessorRatingsByLastName(lastNameVariation(course.ins.l)).then(function(ratingsObj) {
                                    return {
                                        tid: ratingsObj.tid,
                                        scores: scoreObjA.scores,
                                        ratings: ratingsObj.ratings
                                    }
                                })
                            }else if (scoreObjB !== null) {
                                console.log('Found a good match based on display name', course.ins.d[0]);
                                return ucsc.getRateMyProfessorRatingsByLastName(course.ins.d[0]).then(function(ratingsObj) {
                                    return {
                                        tid: ratingsObj.tid,
                                        scores: scoreObjB.scores,
                                        ratings: ratingsObj.ratings
                                    }
                                })
                            }else if (scoreObjC !== null) {
                                console.log('Found a good match based on full name', course.ins.f, course.ins.l);
                                return ucsc.getRateMyProfessorRatingsByFullName(course.ins.f, course.ins.l).then(function(ratingsObj) {
                                    return {
                                        tid: ratingsObj.tid,
                                        scores: scoreObjC.scores,
                                        ratings: ratingsObj.ratings
                                    }
                                })
                            }else{
                                console.log('Ratings for', course.ins.f, course.ins.l, 'not found on RMP based on last name and full name, not even display name');
                                return null;
                            }
                        })
                        .then(function(obj) {
                            if (obj === null) return;
                            console.log('Saving tid', 'for', course.ins.f, course.ins.l, obj.tid);
                            mapping[course.ins.f + course.ins.l] = obj.tid;
                            return write('./db/rmp/ratings/' + obj.tid + '.json', JSON.stringify(obj.ratings))
                            .then(function() {
                                return write('./db/rmp/scores/' + obj.tid + '.json', JSON.stringify(obj.scores))
                            })
                            .then(function() {
                                return write('./db/timestamp/rmp/' + obj.tid + '.json', JSON.stringify(Math.round(+new Date()/1000)))
                            })
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
                                    return ucsc.getRateMyProfessorRatingsByLastName(course.ins.l).then(function(ratingsObj) {
                                        console.log('Saving tid', 'for', course.ins.f, course.ins.l, ratingsObj.tid);
                                        mapping[course.ins.f + course.ins.l] = ratingsObj.tid;
                                        return write('./db/rmp/ratings/' + ratingsObj.tid + '.json', JSON.stringify(ratingsObj.ratings))
                                        .then(function() {
                                            return write('./db/rmp/scores/' + ratingsObj.tid + '.json', JSON.stringify(scoreObj.scores))
                                        })
                                        .then(function() {
                                            return write('./db/timestamp/rmp/' + ratingsObj.tid + '.json', JSON.stringify(Math.round(+new Date()/1000)))
                                        })
                                    })
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
        return write('./db/rmp.json', JSON.stringify(mapping))
        .then(function() {
            return write('./db/timestamp/rmp.json', JSON.stringify(Math.round(+new Date()/1000)));
        })
    })
})
