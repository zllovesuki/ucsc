var Promise = require('bluebird')
var r = require('rethinkdb')
var fs = require('fs')
var path = require('path')
var config = require('./config')
var Etcd3 = require('etcd3').Etcd3
var etcdClient = new Etcd3({
    hosts: process.env.ENDPOINTS.split(',')
})
var tcpPing = require('tcp-ping')
var stan = require('node-nats-streaming').connect('persistent-queue', 'ucsc-file2db', {
    'servers': config.nats
})
var ON_DEATH = require('death')({uncaughtException: true})
var subscription = null

var db = __dirname + '/db',
    dbPath = path.resolve(db)

var upload = function(source) {
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

var uploadEverything = function() {
    var files = walk(dbPath);
    return Promise.map(files, function(file) {
        return upload(file);
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

stan.on('error', function(e) {
    console.error('STAN returns an error!')
    console.error(e)
    process.exit(1)
})

stan.on('connect', function() {
    var opts = stan.subscriptionOptions();
    opts.setDurableName('ucsc-file2db-durable-queue');
    opts.setManualAckMode(true);
    opts.setAckWait(60 * 1000); //60s
    subscription = stan.subscribe('requestSanity', opts);
    subscription.on('message', function(msg) {

        // sanity is asking us to check

        console.log('Sanity requested. Updating Andromeda.')

        etcdClient.getAll().prefix('/announce/services/rethinkdb').strings().then(function(keys) {
            return findBestServer(Object.values(keys), 28015).then(function(best) {
                msg.ack()
                if (best === null) {
                    console.error('No available Andromeda servers available!')
                    return;
                }
                r.connect({
                    host: best,
                    port: 28015,
                    ssl: {
                        ca: [ fs.readFileSync('./ssl/ca.pem') ]
                    }
                }).then(function(conn) {
                    r.conn = conn
                    uploadEverything().then(function() {
                        r.conn.close()
                    })
                })
            })
        }).catch(function(e) {
            console.error('Cannot connect to Andromeda!')
            console.error(e)
            process.exit(1)
        })

    })
})

ON_DEATH(function(signal, err) {
    if (subscription !== null) {
        subscription.unsubscribe();
        subscription.on('unsubscribed', function() {
            stan.close();
            stan.on('close', function() {
                process.exit()
            });
        });
    }
})
