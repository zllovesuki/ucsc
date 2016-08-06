var ucsc = require('./index');
var Promise = require('bluebird');
var util = require('util');
var fs = require('fs');

function write(name, json) {
    return new Promise(function(resolve, reject) {
        fs.writeFile(name, json, function(err) {
            if (err) {
                return reject(err);
            }
            return resolve();
        });
    })
}

var courseListTimestamp = {};

ucsc.getGEDesc().then(function(ge) {
    return write('./db/ge.json', JSON.stringify(ge)).then(function() {
        console.log('GE descriptions saved to', './db/ge.json');
    })
})
