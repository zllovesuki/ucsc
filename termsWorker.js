var Promise = require('bluebird');
var job = require('./fetcher');
var config = require('./config');
var path = require('path');
var fs = require('fs')
var ServiceBroker = require('moleculer').ServiceBroker
var ON_DEATH = require('death')({uncaughtException: true});
const VigilReporter = require("vigil-reporter").VigilReporter

var broker = new ServiceBroker({
    namespace: "production-0.14.x",
    logger: {
        type: "Console",
        level: "error"
    },
    heartbeatInterval: 10,
    heartbeatTimeout: 30,
    registry: {
        strategy: 'Latency',
        strategyOptions: {
            sampleCount: 15,
            lowLatency: 20,
            collectCount: 10,
            pingInterval: 15
        }
    },
    retryPolicy: {
        enabled: true,
        retries: 3,
        delay: 250,
        maxDelay: 2000,
        factor: 2,
        check: err => err
    },
    requestTimeout: 30 * 1000,
    transporter: {
        type: 'NATS',
        options: {
            urls: config.andromeda,
            tls: {
                ca: [ fs.readFileSync('./ssl/ca.pem') ],
                cert: fs.readFileSync('./ssl/client.pem'),
                key: fs.readFileSync('./ssl/client-key.pem')
            },
            yieldTime: 20
        }
    },
    validator: true
})

var db = __dirname + '/db',
    dbPath = path.resolve(db);

var upload = function(source) {
    return broker.call('db-slugsurvival-data.save', {
        key: source.substring(db.length + 1).slice(0, -5),
        value: fs.readFileSync(source).toString('utf-8')
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
        path.join(dbPath, 'offered', 'ge_spring.json'),
        path.join(dbPath, 'offered', 'ge_summer.json'),
        path.join(dbPath, 'offered', 'ge_fall.json'),
        path.join(dbPath, 'offered', 'ge_winter.json'),
        path.join(dbPath, 'terms.json'),
        path.join(dbPath, 'timestamp', 'terms.json'),
        path.join(dbPath, 'major-minor.json'),
        path.join(dbPath, 'timestamp', 'major-minor.json'),
        path.join(dbPath, 'final.json'),
        path.join(dbPath, 'timestamp', 'final.json'),
        path.join(dbPath, 'subjects.json'),
        path.join(dbPath, 'timestamp', 'subjects.json')
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

var getTermsJsonOnAndromeda = function() {
    return broker.call('db-slugsurvival-data.fetch', {
        key: 'terms'
    })
}

var shouldStartFresh = function() {
    console.log('Check if Andromeda has data...')
    return getTermsJsonOnAndromeda().then(function() {
        return false
    }).catch(function(e) {
        if (e.message.indexOf('Not Found') !== -1) return true
        console.error('Error thrown from Andromeda')
        throw e
    })
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

var broadcastUpdate = Promise.method(function () {
    console.log('Braodcasting slugsurvival-data.update')
    return broker.broadcast('slugsurvival-data.update')
})

var checkForNewTerm = function() {
    /*
        TODO: locking
    */
    console.log('Checking for new terms on pisa');
    return getTermsJsonOnAndromeda().then(function(s3Terms) {
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
            return job.saveSubjects()
            .then(function() {
                return job.saveTermsList(todoTerms)
            })
            .then(function() {
                return job.saveCourseInfo(todoTerms)
            })
            .then(job.calculateTermsStats)
            .then(job.calculateGETermsStats)
            //.then(job.saveMajorsMinors)
            .then(job.saveFinalSchedules)
            .then(function() {
                return Promise.map(todoTerms, uploadOneTerm, { concurrency: 3 })
                .then(uploadExtra)
                .catch(function(e) {
                    console.error('Error thrown in onDemandUpload (existed)', e)
                })
            })
            .then(broadcastUpdate)
            .catch(function(e) {
                console.error('Error thrown in tryBroadcasting', e)
            })
        })
    }).catch(function(e) {
        console.error('Error thrown in checkForNewTerm', e)
        console.log('Continue...')
    }).finally(function() {
        setTimeout(function() {
            checkForNewTerm()
        }, 64800 * 1000) // check for new term every 18 hours
    })
}

broker.start().then(function() {
    var vigilReporter = new VigilReporter({
        url: config.vigil_endpoint,
        token: config.vigil_token,
        probe_id: config.vigil_probe_id,
        node_id: config.vigil_node_id,
        replica_id: config.vigil_id,
        interval: 30,
        tuning: {
            use_active_memory: true
        }
    });
}).then(shouldStartFresh).then(function(weShould) {
    if (weShould) {
        // initialize everything
        console.log('No data found on Andromeda, fetching fresh data...')
        // download everything...
        // then uploading everything
        return job.saveSubjects()
        .then(job.saveTermsList)
        .then(job.saveCourseInfo)
        .then(job.calculateTermsStats)
        .then(job.saveGEDesc)
        .then(job.calculateGETermsStats)
        //.then(job.saveMaps)
        //.then(job.saveMajorsMinors)
        .then(job.saveFinalSchedules)
        .then(function() {
            var onDemandUpload = function() {
                return uploadEverything()
            }
            var tryUploading = function() {
                return onDemandUpload()
                .catch(function(e) {
                    console.error('Error thrown in onDemandUpload (fresh)', e)
                    console.log('Retrying...')
                    return tryUploading()
                })
            }
            return tryUploading()
        })
        .then(dirtyGC)
        .catch(function(e) {
            console.error('Error thrown in startFresh', e)
            process.exit(1)
        })
    }else{
        console.log('Data already populated on Andromeda.')
    }
}).then(function() {
    checkForNewTerm();
})

ON_DEATH(function(signal, err) {
    broker.stop().then(function() {
        process.exit(0)
    })
})
