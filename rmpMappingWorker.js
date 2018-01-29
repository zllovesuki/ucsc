var Promise = require('bluebird');
var job = require('./fetcher');
var knox = require('knox');
var config = require('./config');
var path = require('path');
var fs = require('fs')
var pm2 = require('pm2')

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
                resolve()
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

var downloadNewMappings = function() {
    /*
        TODO: locking
    */
    console.log('Download new mappings...')
    return job.saveRateMyProfessorsMappings(s3ReadHandler)
    .then(function() {
        var onDemandUpload = function() {
            return uploadMappings()
        }
        var tryUploading = function() {
            return onDemandUpload()
            .catch(function(e) {
                console.error('Error thrown in onDemandUpload', e)
                console.log('Retrying...')
                return tryUploading()
            })
        }
        return tryUploading()
    })
    .catch(function(e) {
        console.error('Error thrown in checkForNewMappings', e)
        console.log('Continue...')
    }).finally(function() {
        console.log('Next data fetch is 7 days later.')
        setTimeout(function() {
            downloadNewMappings()
        }, 604800 * 1000) // download mappings every 7 days
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

downloadNewMappings().then(startStatsWorker)
