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

var read = function(name) {
    return new Promise(function(resolve ,reject) {
        fs.readFile(name, {
            encoding: 'utf-8'
        }, function(err, data) {
            if (err) {
                return reject(err);
            }
            return resolve(JSON.parse(data));
        })
    })
}

var clarity = {};
var easy = {};
var overall = {};
var quality = {};

return read('./db/rmp.json').then(function(json) {
    return Promise.map(Object.keys(json), function(name) {
        var tid = json[name]
        clarity[tid] = 0;
        easy[tid] = 0;
        overall[tid] = 0;
        quality[tid] = {};
        return read('./db/rmp/ratings/' + tid + '.json').then(function(ratings) {
            for(var i = 0, length = ratings.length; i < length; i++) {
                clarity[tid] += ratings[i].rClarity;
                easy[tid] += ratings[i].rEasy;
                overall[tid] += ratings[i].rOverall;
                if (typeof quality[tid][ratings[i].quality] === 'undefined') quality[tid][ratings[i].quality] = 1;
                quality[tid][ratings[i].quality]++;
            }
            if (ratings.length > 0) {
                clarity[tid] /= ratings.length;
                easy[tid] /= ratings.length;
                overall[tid] /= ratings.length;
            }
        })
        .then(function() {
            return write('./db/rmp/stats/' + tid + '.json', JSON.stringify({
                clarity: clarity[tid],
                easy: easy[tid],
                overall: overall[tid],
                quality: quality[tid]
            }))
        })
    })
})
