var Promise = require('bluebird')
var request = require('request');
var helper = require('./helper')

var getOfferedURL = function(quarter) {
    return 'https://ucsc-data.s3.fmt01.sdapi.net/offered/' + quarter + '.json';
}

var getFlatTermListURL = function() {
    return 'http://ucsc-data.s3.fmt01.sdapi.net/terms.json';
}

var fetch = function(url) {
    return new Promise(function(resolve, reject) {
        request({
            method: 'GET',
            url: url
        }, function(err, resp, body) {
            if (err) return reject(err);
            return resolve(JSON.parse(body))
        })
    });
}

Promise.all([
    fetch(getFlatTermListURL()),
    fetch(getOfferedURL('spring')),
    fetch(getOfferedURL('summer')),
    fetch(getOfferedURL('fall')),
    fetch(getOfferedURL('winter'))
]).spread(function(flatTermsList, spring, summer, fall, winter) {
    var historicData = {};
    historicData.spring = spring;
    historicData.summer = summer;
    historicData.fall = fall;
    historicData.winter = winter;
    var predictions = helper.windowFrequency(flatTermsList, historicData, 4);
    var classes = Object.keys(predictions).reduce(function(array, quarter) {
        array = array.concat(predictions[quarter]);
        return array;
    }, []).filter(function(item, pos, self) {
        return self.indexOf(item) == pos;
    })
    console.log(JSON.stringify(classes))
})
