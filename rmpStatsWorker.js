var Promise = require('bluebird');
var r = require('rethinkdb');
var job = require('./fetcher');
var knox = require('knox');
var config = require('./config');
var path = require('path');
var fs = require('fs')
var Etcd3 = require('etcd3').Etcd3
var etcdClient = new Etcd3({
    hosts: process.env.ENDPOINTS.split(',')
})
var tcpPing = require('tcp-ping')

var s3 = knox.createClient(Object.assign(config.s3, {
    style: 'path'
}));
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

var ping = function(server, port) {
    return new Promise(function(resolve, reject) {
        tcpPing.ping({
            address: server,
            port: port,
            timeout: 500,
            attempts: 3
        }, function(err, data) {
            if (err) return reject(err)

            if (isNaN(data.avg)) return resolve(false)

            return resolve(data.avg)
        })
    });
}

var findBestServer = function(servers, port) {
    var bestAvg = 1000
    var best = null
    return Promise.map(servers, function(server) {
        return ping(server, port).then(function(avg) {
            if (avg !== false && avg < bestAvg) {
                best = server
                bestAvg = avg
            }
        })
    })
    .then(function() {
        return best
    })
}

var upload2S3 = function(source) {
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
                resolve()
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
        return upload2S3(file);
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
        s3.getFile('rmp/scores/' + tid + '.json', function(err, res) {
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
    console.log('Comparing S3 with RMP...')
    rmp = {};
    return Promise.all([
        s3ReadHandler('rmp.json'),
        s3ReadHandler('terms.json')
    ]).spread(function(mapping, json) {
        return Promise.map(json, function(term) {
            return s3ReadHandler('terms/' + term.code + '.json').then(function(courses) {
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
    }).then(function() {
        return etcdClient.getAll().prefix('/announce/services/rethinkdb').strings().then(function(keys) {
            return findBestServer(Object.values(keys), 28015).then(function(best) {
                msg.ack()
                if (best === null) {
                    console.error('No available Andromeda servers available!')
                    return;
                }
                r.connect({
                    host: workaround[best],
                    port: 28015,
                    ssl: {
                        ca: [ fs.readFileSync('./ssl/ca.pem') ]
                    }
                }).then(function(conn) {
                    r.conn = conn
                    uploadEverything2Andromeda().then(function() {
                        r.conn.close()
                    })
                })
            })
        }).catch(function(e) {
            console.error('Cannot connect to Andromeda!')
            console.error(e)
        })
    })
}

checkForChanges().then(function() {
    console.log('Next data fetch is 7 days later.')
    setTimeout(function() {
        checkForChanges()
    }, 604800 * 1000) // check for changes every 7 days
})
