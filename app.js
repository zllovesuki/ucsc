module.exports = function() {
	var Promise = require('bluebird'),
        express = require('express'),
		path = require('path'),
		cors = require('cors'),
        config = require('./config'),
        Minio = require('minio'),
        version = require('./version.json'),
		app = express(),
        fetch = require('./route/fetch'),
        help = require('./route/help');

    app.use(function(req, res, next){
        // backward compatibility
		req.minioClient = new Minio.Client({
            endPoint: config.s3.endpoint,
            port: (typeof config.s3.port === 'undefined' ? 443 : config.s3.port),
            secure: typeof config.s3.secure === 'undefined' ? true : config.s3.secure,
            accessKey: config.s3.key,
            secretKey: config.s3.secret
        })
        req.getObject = function(path) {
            return new Promise(function(resolve, reject) {
                req.minioClient.getObject(config.s3.bucket, path, function(err, dataStream) {
                    if (err) {
                        return reject(err)
                    }
                    let data = ''
                    dataStream.on('data', function(chunk) {
                        data += chunk
                    })
                    dataStream.on('end', function() {
                        resolve(data)
                    })
                })
            });
        }
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

    app.use('/help', help);

    app.use('/healthz', function(req, res, next) {
        res.status(200).send('ok')
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
