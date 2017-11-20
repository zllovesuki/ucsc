var Promise = require('bluebird'),
    r = require('rethinkdb'),
	config = require('./config'),
    discover = require('./lib/discover'),
    express = require('express'),
    app = express();

var ready = false;

var endpoint = false;
var endpointChanged = false;

var lastConnected = false;
var lastConnectedChanged = false;

discover().then(function(ip) {
    if (ip === null) throw new Error('Cluster not ready.')

    endpoint = ip

    var compareTimeConnected = function(conn) {
        return r.db('rethinkdb')
        .table('server_status').pluck({
            'id': true,
            'network': {
                'time_connected': true
            }
        })
        .run(conn)
        .then(function(cursor) {
            return cursor.toArray()
        })
        .then(function(results) {
            var now = results.map(function(result) {
                return result.id + ':' + result.network.time_connected;
            }).join(';')
            if (lastConnected === false) {
                lastConnected = now;
            }
            if (now !== lastConnected) {
                lastConnectedChanged = true;
            }
            setTimeout(compareTimeConnected, 1000 * 10);
        })
    }

    return Promise.all([
        r.connect({
            host: config.host
        }),
        r.connect({
            host: ip
        })
    ]).spread(function(sourceConn, destConn) {

        compareTimeConnected(destConn)

        app.use(function(req, res, next) {
            if (lastConnectedChanged) {
                return next(new Error('Configuration changed.'))
            }
            if (endpointChanged) {
                return next(new Error('Endpoint changed.'))
            }
            discover().then(function(ip) {
                if (endpoint !== false && ip !== endpoint) {
                    endpointChanged = true;
                    throw new Error('Endpoint changed.')
                }
                return res.status(200).send({
                    endpoint: ip,
                    lastConnected: lastConnected
                })
            }).catch(function(e) {
                next(e)
            })
        });

        app.use(function(err, req, res, next) {
            res.status(err.status || 500);
            res.send({
                ok: false,
                errName: err.name,
                message: err.message
            });
        });

        app.listen(1999);

        r.table('data')
        .table('flat')
        .changes({
            includeInitial: true,
            includeStates: true
        })
        .run(sourceConn)
        .then(function(sourceCursor) {
            var fetchNext = function(err, result) {
                if (err) {
                    endpointChanged = true
                    throw err
                }

                if (result.state === 'initializing') {
                    console.log('Initializing feeds.')
                    return sourceCursor.next(fetchNext);
                }
                if (result.state === 'ready') {
                    ready = true;
                    console.log('Feeds ready.')
                    return sourceCursor.next(fetchNext);
                }

                if (!ready) {
                    return r.db('data')
                    .table('flat')
                    .insert(result.new_val)
                    .run(destConn)
                    .then(function() {
                        return sourceCursor.next(fetchNext)
                    })
                }

                if (result.new_val === null && result.old_val !== null) {
                    // delete
                    return r.db('data')
                    .table('flat')
                    .get(result.old_val.key)
                    .delete()
                    .run(destConn)
                    .then(function() {
                        return sourceCursor.next(fetchNext)
                    })
                }
                if (result.new_val !== null && result.old_val !== null) {
                    // update
                    return r.db('data')
                    .table('flat')
                    .insert(result.new_val, {
                        conflict: 'replace'
                    })
                    .run(destConn)
                    .then(function() {
                        return sourceCursor.next(fetchNext)
                    })
                }
                if (result.new_val !== null && result.old_val === null) {
                    // create
                    return r.db('data')
                    .table('flat')
                    .insert(result.new_val)
                    .run(destConn)
                    .then(function() {
                        return sourceCursor.next(fetchNext)
                    })
                }
            }
            sourceCursor.next(fetchNext);
        })
        .catch(function(e) {
            console.error(e)
            process.exit(1)
        })
    })
})
