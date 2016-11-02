var Promise = require('bluebird');
var job = require('./fetcher');
var knox = require('knox');
var config = require('./config');
var path = require('path');
var fs = require('fs')
var pm2 = require('pm2')

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

var uploadMappings = function() {
    console.log('Uploading RMP mappings')
    var files = [
        path.join(dbPath, 'rmp.json'),
        path.join(dbPath, 'timestamp', 'rmp.json')
    ]
    return Promise.mapSeries(files, function(file) {
        return upload(file);
    })
}

var shouldStartFresh = function() {
    console.log('Check if S3 has data...')
    return new Promise(function(resolve, reject) {
        s3.getFile('/rmp.json', function(err, res) {
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

var dirtyGC = function() {
    console.log('We will exit with code 1 and let the deamon restart us (basically a garbage collection)...')
    process.exit(1)
}

var downloadNewMappings = function() {
    /*
        TODO: locking
    */
    return job.saveRateMyProfessorsMappings(s3ReadHandler)
    .then(uploadMappings)
    .then(dirtyGC)
    .catch(function(e) {
        console.error('Error thrown in checkForNewMappings', e)
        console.log('Continue...')
    }).finally(function() {
        console.log('Next data fetch is 14 days later.')
        setTimeout(function() {
            downloadNewMappings()
        }, 1209600 * 1000) // download mappings every 14 days
    })
}

var startStatsWorker = function() {
    console.log('Starting stats worker')
    return new Promise(function(resolve, reject) {
        pm2.connect(function(err) {
            if (err) {
                return reject(err);
            }
            pm2.start(__dirname + '/rmpStatsWorker.json', function(err, apps) {
                if (err) {
                    return reject(err);
                }
                return resolve();
            })
        })
    });
}

shouldStartFresh().then(function(weShould) {
    if (weShould) {
        // initialize everything
        console.log('No mappings found on S3, fetching fresh data...')
        // download everything...
        // then uploading everything
        return downloadNewMappings();
    }else{
        console.log('Mappings already populated on S3.')
        console.log('Next data fetch is 14 days later.')
        startStatsWorker().then(function() {
            setTimeout(function() {
                downloadNewMappings()
            }, 1209600 * 1000) // delay the fetching to 14 days later
        })
    }
}).catch(function(e) {
    console.error('S3 Client returns Error', e)
})