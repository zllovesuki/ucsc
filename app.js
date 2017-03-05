module.exports = function(r) {
	var express = require('express'),
		path = require('path'),
		cors = require('cors'),
        config = require('./config'),
        version = require('./version.json'),
		app = express(),
        fetch = require('./route/fetch'),
        help = require('./route/help'),
        apicache = require('apicache'),
        redis = require('redis');

    app.use(function(req, res, next){
		req.r = r;
		next();
	});

    var cacheWithRedis = apicache.options({
        redisClient: redis.createClient({
            host: config.redis || 'localhost'
        })
    }).middleware;

    var cache200 = cacheWithRedis('60 minutes', function(req, res) {
        return req.method === 'GET' && res.statusCode === 200
    })

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

    app.use('/', cors(corsDelegation), cache200, fetch);
    app.use('/help', help);

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
