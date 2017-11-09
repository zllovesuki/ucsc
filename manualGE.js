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

var uploadExtra = function() {
    console.log('Uploading extras')
    var files = [
        path.join(dbPath, 'offered', 'ge_spring.json'),
        path.join(dbPath, 'offered', 'ge_summer.json'),
        path.join(dbPath, 'offered', 'ge_fall.json'),
        path.join(dbPath, 'offered', 'ge_winter.json')
    ]
    return Promise.mapSeries(files, function(file) {
        return upload(file);
    })
}

r.connect({
    host: config.host,
    port: 28015
}).then(function(conn) {
    r.conn = conn;
    return job.calculateGETermsStats().then(uploadExtra)
})
