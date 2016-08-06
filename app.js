module.exports = function() {
    var express = require('express'),
        path = require('path'),
        config = require('./config.js'),
        pkg = require('./package.json'),
        cors = require('cors'),
        fs = require('fs'),
        app = express();

    app.enable('trust proxy');
    app.set('trust proxy', 'loopback, linklocal, uniquelocal');

    app.use(cors({
        maxAge: 86400
    }));

    var root;

    app.use(express.static(path.join(__dirname, 'db')));

    app.get('/', function(req, res, next) {
        return res.send({
            'msg': 'UCSC Course Data',
            'version': pkg.version
        })
    });

    app.use('*', function(req, res, next) {
      return res.status(404).send({
          message: 'Not found',
      });
    });

    return app;
};
