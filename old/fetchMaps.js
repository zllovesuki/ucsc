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

ucsc.getMaps().then(function(locations) {
    return write('./db/locations.json', JSON.stringify(locations)).then(function() {
        console.log('Map locations saved to', './db/locations.json');
    })
    .then(function() {
        return write('./db/timestamp/locations.json', Math.round(+new Date()/1000))
    })
})
