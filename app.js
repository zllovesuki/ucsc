module.exports = function(r) {
	var express = require('express'),
		path = require('path'),
		cors = require('cors'),
        config = require('./config'),
        pkg = require('./package.json'),
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

    app.use('/', cors(corsDelegation), fetch);
    app.use('/help', help);

	// catch 404 and forward to error handler
	app.use(function(req, res, next) {
		res.status(200).send({ok: true, message: 'UCSC Courses Data API', version: pkg.version});
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
