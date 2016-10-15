var Promise = require('bluebird');
var job = require('./fetcher');
var knox = require('knox');
var config = require('./config');
var path = require('path');
var fs = require('fs')

var s3 = knox.createClient(config.s3);

var db = __dirname + '/db',
    dbPath = path.resolve(db);

var upload = function(source) {
    return new Promise(function(resolve, reject) {
        console.log('Uploading', source)
        fs.stat(source, function(err, stat) {
            var fileStream = fs.createReadStream(source);
            s3.putStream(fileStream, source.substring(source.indexOf('db') + 2), {
                'Content-Length': stat.size,
                'Content-Type': 'application/json'
            }, function(err, res) {
                if (err) {
                    return reject(err);
                }
                console.log(source, 'uploaded')
                return resolve();
            })
        })
    });
}

var uploadOneTid = function(tid) {
    console.log('Uploading tid', tid)
    var files = [
        path.join(dbPath, 'rmp', 'ratings', tid + '.json'),
        path.join(dbPath, 'rmp', 'scores', tid + '.json'),
        path.join(dbPath, 'rmp', 'stats', tid + '.json'),
        path.join(dbPath, 'timestamp', 'rmp', tid + '.json'),
    ]
    return Promise.mapSeries(files, function(file) {
        return upload(file);
    })
}

var s3ReadHandler = function(source) {
    return new Promise(function(resolve, reject) {
        s3.getFile(source, function(err, res) {
            if (err) {
                return reject(err);
            }
            if (res.statusCode == 404) {
                return reject('Not Found')
            }
            var data = '';
            res.on('data', function(chunk) {
                data += chunk;
            })
            res.on('end', function() {
                return resolve(JSON.parse(data));
            })
        })
    });
}

var getScoresOnS3 = function(tid) {
    return new Promise(function(resolve, reject) {
        s3.getFile('/tmp/scores/' + tid + '.json', function(err, res) {
            if (err) {
                reject(err);
            }
            if (res.statusCode == 404) {
                return resolve(false);
            }
            var data = '';
            res.on('data', function(chunk) {
                data += chunk;
            })
            res.on('end', function() {
                return resolve(JSON.parse(data));
            })
        })
    });
}

var calculateStats = function(ratings) {
    var clarity = 0;
    var easy = 0;
    var overall = 0;
    var quality = 0;

    for (var i = 0, length = ratings.length; i < length; i++) {
        clarity += ratings[i].rClarity;
        easy += ratings[i].rEasy;
        overall += ratings[i].rOverall;
        if (typeof quality[ratings[i].quality] === 'undefined') quality[ratings[i].quality] = 1;
        quality[ratings[i].quality]++;
    }
    if (ratings.length > 0) {
        clarity /= ratings.length;
        easy /= ratings.length;
        overall /= ratings.length;
    }

    return {
        clarity: clarity,
        easy: easy,
        overall: overall,
        quality: quality
    }
}

var dirtyGC = function() {
    console.log('We will exit with code 1 and let the deamon restart us (basically a garbage collection)...')
    process.exit(1)
}

var rmp = {};

var checkForChanges = function() {
    /*
        TODO: locking
    */
    rmp = {};
    return Promise.all([
        s3ReadHandler('/rmp.json'),
        s3ReadHandler('/terms.json')
    ]).spread(function(mapping, json) {
        return Promise.map(json, function(term) {
            return s3ReadHandler('/terms/' + term.code + '.json').then(function(courses) {
                return Promise.map(Object.keys(courses), function(subject) {
                    return Promise.map(courses[subject], function(course) {
                        if (!(course.ins.f && course.ins.l)) {
                            //console.log('No ins name found, skipping...')
                            return;
                        }
                        if (typeof mapping[course.ins.f + course.ins.l] === 'undefined') {
                            //console.log('No mappings found, skipping...')
                            return;
                        }
                        var tid = mapping[course.ins.f + course.ins.l];
                        if (typeof rmp[course.ins.f + course.ins.l] !== 'undefined') return;
                        rmp[course.ins.f + course.ins.l] = true;
                        return Promise.all([
                            getScoresOnS3(tid),
                            job.ucsc.getRateMyProfessorScoresByTid(tid)
                        ]).spread(function(s3Scores, rmpScores) {
                            if (typeof s3Scores.count === 'undefined' && typeof rmpScores.scores.count === 'undefined') {
                                // not found on s3 or no ratings, and rmp returns no new data
                                return;
                            }
                            if (typeof s3Scores.count !== 'undefined' && typeof rmpScores.scores.count === 'undefined') {
                                // weird, s3 has count but new data has no dat, we will skip it
                                return;
                            }
                            if (s3Scores.count == rmpScores.scores.count) {
                                // same amount of ratings, we will skip
                                return;
                            }
                            console.log('Fetching', tid)
                            // either not found, or count differs, let's fetch
                            return job.ucsc.getRateMyProfessorRatingsByTid(tid)
                            .then(function(rmpRatings) {
                                console.log('Saving', tid)
                                return job.write('./db/rmp/stats/' + tid + '.json', calculateTermsStats(rmpRatings.ratings))
                                .then(function() {
                                    return job.write('./db/rmp/ratings/' + tid + '.json', rmpRatings.ratings)
                                })
                                .then(function() {
                                    return job.write('./db/rmp/scores/' + tid + '.json', rmpScores.scores)
                                })
                                .then(function() {
                                    return job.write('./db/timestamp/rmp/' + tid + '.json', Math.round(+new Date()/1000))
                                })
                            })
                            .then(function() {
                                return uploadOneTid(tid);
                            })
                        })
                    }, { concurrency: 10 })
                }, { concurrency: 2 })
            })
        }, { concurrency: 1 })
    })
}

checkForChanges().then(function() {
    setTimeout(function() {
        checkForChanges()
    }, 1209600 * 1000) // check for changes every 14 days
})
