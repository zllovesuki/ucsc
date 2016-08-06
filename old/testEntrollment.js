var ucsc = require('./index');
var Promise = require('bluebird');
var util = require('util');

ucsc.getEnrollment(2168, 21106).then(function(course) {
    console.log(util.inspect(course, {showHidden: false, depth: null}));
})
