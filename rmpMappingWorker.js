var Promise = require('bluebird');
var job = require('./fetcher');
var config = require('./config');
var path = require('path');
var fs = require('fs')
var pm2 = require('pm2')
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
            urls: config.andromeda,
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

var upload = function(source) {
    return broker.call('db-slugsurvival-data.save', {
        key: source.substring(db.length + 1).slice(0, -5),
        value: fs.readFileSync(source).toString('utf-8')
    })
}

var andromedaReadHandler = function(key) {
    return broker.call('db-slugsurvival-data.fetch', {
        key: key
    })
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
    return job.saveRateMyProfessorsMappings(andromedaReadHandler)
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

broker.start().then(downloadNewMappings).then(startStatsWorker)
