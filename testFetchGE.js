var ucsc = require('./index');
var Promise = require('bluebird');
var util = require('util');

ucsc.getGEDesc().then(function(ge) {
    console.log(util.inspect(ge, {showHidden: false, depth: null}));
})
