var r = require('rethinkdb'),
    config = require('./config');

r.connect({
    host: config.host,
    port: 28015
})
.then(function(conn) {
    r.conn = conn;
    var app = require('./app')(r);
    var port = 2008;
    var server = app.listen(port);
    console.log('Process ' + process.pid + ' is listening on port ' + port + ' to incoming API requests.')
})
