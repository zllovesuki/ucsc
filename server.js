var r = require('rethinkdb'),
    config = require('./config'),
    discover = require('./lib/discover'),
    endpoint = false;

discover().then(function(ip) {
    if (ip !== null) {
        config.rethinkdb.host = ip;
    }
    r.connect(config.rethinkdb)
    .then(function(conn) {
        r.conn = conn;
        var app = require('./app')(r, endpoint);
        var port = 2009;
        var server = app.listen(port);
        console.log('Process ' + process.pid + ' is listening on port ' + port + ' to incoming API requests.')
    })
})
