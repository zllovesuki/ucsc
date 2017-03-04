var Promise = require('bluebird');
var job = require('./fetcher');
var knox = require('knox');
var config = require('./config');
var path = require('path');
var fs = require('fs')
var r = require('rethinkdb')

var s3 = knox.createClient(Object.assign(config.s3, {
    style: 'path'
}));
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
                r.db('data').table('flat').insert({
                    key: source.substring(source.indexOf('db') + 2).slice(0, -5),
                    value: fs.readFileSync(source).toString('utf-8')
                }, {
                    conflict: 'replace'
                }).run(r.conn).then(function(resilt) {
                    console.log(source, 'saved to database')
                    return resolve();
                }).catch(function(e) {
                    return reject(e)
                })
            })
        })
    });
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

var uploadEverything = function() {
    /*

        THIS SHOULD ONLY BE CALLED UPON INITIALIZATION, ONCE ONLY

    */

    var files = walk(dbPath);
    return Promise.map(files, function(file) {
        return upload(file);
    }, { concurrency: 10 })
}

var uploadExtra = function() {
    console.log('Uploading extras')
    var files = [
        path.join(dbPath, 'offered', 'spring.json'),
        path.join(dbPath, 'offered', 'summer.json'),
        path.join(dbPath, 'offered', 'fall.json'),
        path.join(dbPath, 'offered', 'winter.json'),
        path.join(dbPath, 'terms.json'),
        path.join(dbPath, 'timestamp', 'terms.json'),
        path.join(dbPath, 'major-minor.json'),
        path.join(dbPath, 'timestamp', 'major-minor.json'),
        path.join(dbPath, 'final.json'),
        path.join(dbPath, 'timestamp', 'final.json')
    ]
    return Promise.mapSeries(files, function(file) {
        return upload(file);
    })
}

var uploadOneTerm = function(code) {
    console.log('Uploading term', code)
    var files = [
        path.join(dbPath, 'courses', code + '.json'),
        path.join(dbPath, 'timestamp', 'courses', code + '.json'),
        path.join(dbPath, 'terms', code + '.json'),
        path.join(dbPath, 'timestamp', 'terms', code + '.json')
    ]
    return Promise.mapSeries(files, function(file) {
        return upload(file);
    })
}

var shouldStartFresh = function() {
    console.log('Check if S3 has data...')
    return new Promise(function(resolve, reject) {
        s3.getFile('terms.json', function(err, res) {
            if (err) {
                reject(err);
            }
            if (res.statusCode == 404) {
                // we should fetch all files
                return resolve(true);
            }
            return resolve(false);
        })
    })
}

var getTermsJsonOnS3 = function() {
    return new Promise(function(resolve, reject) {
        s3.getFile('terms.json', function(err, res) {
            if (err) {
                reject(err);
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

var dirtyGC = function() {
    console.log('We will exit with code 1 and let the deamon restart us (basically a garbage collection)...')
    process.exit(1)
}

// Date calculated based on @ucsc/dates.js

var delta = function(termCode) {
    switch (termCode[termCode.length - 1]) {
        case '0': // Winter
        return {
            deadline: 21,
            enrollment: 63 // use the upper bound
        };

        case '2': // Spring
        return {
            deadline: 18,
            enrollment: 35 // use the upper bound
        };

        case '8': // Fall
        return {
            deadline: 20,
            enrollment: 129
        };

        case '4': // Summer
        return {
            deadline: 7,
            enrollment: 0
        };
    }
}

var checkForNewTerm = function() {
    /*
        TODO: locking
    */
    console.log('Checking for new terms on pisa');
    return getTermsJsonOnS3().then(function(s3Terms) {
        s3Terms.sort(function(a, b) { return b.code - a.code });

        var todoTerms = [];
        var localNewTerm = '';
        var remoteNewTerm = null;
        var deadline = null;
        var next = new Date();
        var today = new Date();
        var daysDeltaLocal = {};

        return Promise.map(s3Terms, function(term) {
            localNewTerm = term.code;
            if (!term.date || !term.date.start) {
                console.log('No start date for ' + term.code + ', skipping')
                return;
            }
            deadline = new Date(term.date.start);
            next = new Date(term.date.start);
            daysDeltaLocal = delta(localNewTerm);
            deadline.setDate(deadline.getDate() + daysDeltaLocal.deadline);
            next.setDate(next.getDate() + daysDeltaLocal.deadline + 2);
            if (today.getTime() < next.getTime()) {
                console.log('We will update the term ' + localNewTerm + '.')
                todoTerms.push(localNewTerm.toString());
            }
        }, { concurrency: 1 })
        .then(function() {
            todoTerms.sort(function(a, b) { return b - a });

            if (todoTerms.length > 0) {
                remoteNewTerm = job.ucsc.calculateNextTermCode(todoTerms[0]).toString();
            }else{
                remoteNewTerm = job.ucsc.calculateNextTermCode(s3Terms[0].code).toString();
            }
            return job.ucsc.getCourses(remoteNewTerm, 25)
        })
        .then(function(remoteCourses) {
            if (remoteNewTerm !== null && Object.keys(remoteCourses).length > 0) {
                console.log('We will fetch the term ' + remoteNewTerm + '.')
                todoTerms.push(remoteNewTerm.toString());
            }
        })
        .then(function() {
            return job.saveTermsList(todoTerms)
            .then(function() {
                return job.saveCourseInfo(todoTerms)
            })
            .then(function() {
                return Promise.map(todoTerms, uploadOneTerm, { concurrency: 3 })
            })
            .then(job.calculateTermsStats)
            .then(job.saveMajorsMinors)
            .then(job.saveFinalSchedules)
            .then(uploadExtra)
        })
    }).catch(function(e) {
        console.error('Error thrown in checkForNewTerm', e)
        console.log('Continue...')
    }).finally(function() {
        setTimeout(function() {
            checkForNewTerm()
        }, 21600 * 1000) // check for new term every 6 hours
    })
}

r.connect({
    host: config.host,
    port: 28015
}).then(function(conn) {
    r.conn = conn;
    shouldStartFresh().then(function(weShould) {
        if (weShould || !!process.env.FRESH) {
            // initialize everything
            if (!!process.env.FRESH) console.log('Forced fresh start')
            else console.log('No data found on S3, fetching fresh data...')
            // download everything...
            // then uploading everything
            return job.saveTermsList()
            .then(job.saveCourseInfo)
            .then(job.calculateTermsStats)
            .then(job.saveGEDesc)
            .then(job.saveMaps)
            .then(job.saveSubjects)
            .then(job.saveMajorsMinors)
            .then(job.saveFinalSchedules)
            .then(uploadEverything)
            .then(dirtyGC)
        }else{
            console.log('Data already populated on S3.')
        }
    }).then(function() {
        checkForNewTerm();
    })
}).catch(function(e) {
    console.error(e)
})
