var ucsc = require('./index');
var Promise = require('bluebird');
var util = require('util');

ucsc.getCourse(2168, 21168).then(function(course) {
    console.log(util.inspect(course, {showHidden: false, depth: null}));
})
