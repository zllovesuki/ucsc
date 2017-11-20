var endpointChanged = false

module.exports = function(r, endpoint) {
	var Promise = require('bluebird'),
        express = require('express'),
		path = require('path'),
		cors = require('cors'),
        config = require('./config'),
        discover = require('./lib/discover'),
        version = require('./version.json'),
		app = express(),
        fetch = require('./route/fetch'),
        help = require('./route/help');

    app.use(function(req, res, next){
		req.r = r;
		next();
	});

    var corsDelegation = function(req, callback) {
        var corsOptions;
        if (config.corsWhitelist.length === 0 || config.corsWhitelist.indexOf(req.header('Origin')) !== -1) {
            corsOptions = { origin: true };
        }else{
            corsOptions = { origin: false };
        }
        callback(null, corsOptions);
    }

    // r.db('ucsc').table('2168').group('courseNum').count().ungroup().orderBy(r.desc("reduction"))

    app.use('/help', help);

    app.use('/healthz', function(req, res, next) {
        var r = req.r;
        if (endpointChanged) {
            return next(new Error('Endpoint changed.'))
        }
        Promise.all([
            discover(),
            r.db('data').table('flat', {
                readMode: 'majority'
            }).limit(1).run(r.conn)
        ]).spread(function(ip, flat) {
            if (endpoint !== false && ip !== endpoint) {
                endpointChanged = true;
                throw new Error('Endpoint changed.')
            }
            return res.status(200).send('ok')
        }).catch(function(e) {
            next(e)
        })
    });

    app.use('/', cors(corsDelegation), fetch);

	// catch 404 and forward to error handler
	app.use(function(req, res, next) {
		res.status(200).send({ok: true, message: 'UCSC Courses Data API', version: version});
	});

	// production error handler
	// no stacktraces leaked to user
	app.use(function(err, req, res, next) {
		res.status(err.status || 500);
		res.send({
			ok: false,
			errName: err.name,
			message: err.message
		});
	});

	return app;
};
