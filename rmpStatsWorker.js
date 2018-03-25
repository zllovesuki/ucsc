var Promise = require('bluebird');
var r = require('rethinkdb');
var job = require('./fetcher');
var config = require('./config');
var path = require('path');
var fs = require('fs')
var ServiceBroker = require('moleculer').ServiceBroker

var broker = new ServiceBroker({
    logger: console,
    logLevel: 'warn',
    requestTimeout: 5 * 1000,
    requestRetry: 2,
    serializer: 'ProtoBuf',
    transporter: {
        type: 'NATS',
        options: {
            urls: config.andromeda
            tls: {
                ca: [ fs.readFileSync('./ssl/ca.pem') ],
                cert: fs.readFileSync('./ssl/client.pem'),
                key: fs.readFileSync('./ssl/client-key.pem')
            },
            yieldTime: 50
        }
    },
    validation: true
})
var db = __dirname + '/db',
    dbPath = path.resolve(db);

// RethinkDB driver tls requires hostname because of my cert... doing some dumb things right now
var workaround = JSON.parse(process.env.WORKAROUND)

var upload2Andromeda = function(source) {
    return r.db('slugsurvival').table('data').insert({
        key: source.substring(db.length + 1).slice(0, -5),
        value: fs.readFileSync(source).toString('utf-8')
    }, {
        conflict: 'replace'
    }).run(r.conn).then(function(resilt) {
        console.log(source, 'saved to database')
    })
}

var walk = function(dir) {
    var results = []
    var list = fs.readdirSync(dir)
    list.forEach(function(file) {
        file = dir + '/' + file
        var stat = fs.statSync(file)
        if (stat && stat.isDirectory()) results = results.concat(walk(file))
        else results.push(file)
    })
    return results
} // http://stackoverflow.com/questions/5827612/node-js-fs-readdir-recursive-directory-search

var uploadEverything2Andromeda = function() {
    var files = walk(dbPath);
    return Promise.map(files, function(file) {
        return upload2Andromeda(file);
    }, { concurrency: 10 })
}

var upload2Andromeda = function(source) {
    return broker.call('db-slugsurvival-data.save', {
        key: source.substring(db.length + 1).slice(0, -5),
        value: fs.readFileSync(source).toString('utf-8')
    })
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
        return upload2Andromeda(file);
    })
}

var andromedaReadHandler = function(key) {
    return broker.call('db-slugsurvival-data.fetch', {
        key: key
    })
}

var calculateStats = function(ratings) {
    var clarity = 0;
    var easy = 0;
    var overall = 0;
    var quality = {};

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

var rmp = {};

var checkForChanges = function() {
    /*
        TODO: locking
    */
    console.log('Comparing Andromeda with RMP...')
    rmp = {};
    return Promise.all([
        andromedaReadHandler('rmp'),
        andromedaReadHandler('terms')
    ]).spread(function(mapping, json) {
        return Promise.map(json, function(term) {
            return andromedaReadHandler('terms/' + term.code).then(function(courses) {
                return Promise.map(Object.keys(courses), function(subject) {
                    var onDemandUpload = function() {
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
                                andromedaReadHandler('rmp/scores/' + tid),
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
                                    return job.write('./db/rmp/stats/' + tid + '.json', calculateStats(rmpRatings.ratings))
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
                    }
                    var tryUploading = function() {
                        return onDemandUpload()
                        .catch(function(e) {
                            console.error('Error thrown in onDemandUpload (' + subject + ')', e)
                            console.log('Retrying...')
                            return tryUploading()
                        })
                    }
                    return tryUploading()
                }, { concurrency: 2 })
            })
        }, { concurrency: 1 })
    })
}

broker.start().then(function() {
    console.log('Connected to Andromeda.')
    checkForChanges().then(function() {
        console.log('Next data fetch is 7 days later.')
        setTimeout(function() {
            checkForChanges()
        }, 604800 * 1000) // check for changes every 7 days
    })
})
