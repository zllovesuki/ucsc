var r = require('rethinkdb'),
    config = require('./config'),
    discover = require('./lib/discover'),
    endpoint = false;

discover().then(function(ip) {
    if (ip !== null) {
        config.host = ip;
    }
    r.connect({
        host: config.host,
        port: 28015
    })
    .then(function(conn) {
        r.conn = conn;
        var app = require('./app')(r, endpoint);
        var port = 2009;
        var server = app.listen(port);
        console.log('Process ' + process.pid + ' is listening on port ' + port + ' to incoming API requests.')
    })
})
