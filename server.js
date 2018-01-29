var app = require('./app')();
var port = 2009;
var server = app.listen(port);
console.log('Process ' + process.pid + ' is listening on port ' + port + ' to incoming API requests.')
