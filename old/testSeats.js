var ucsc = require('./index');
var Promise = require('bluebird');
var util = require('util');

ucsc.getSeats(2168, 21304).then(function(course) {
    console.log(util.inspect(course, {showHidden: false, depth: null}));
})
