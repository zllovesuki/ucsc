var ucsc = require('./index');
var Promise = require('bluebird');
var util = require('util');

ucsc.getRateMyProfessorScoresByLastName('Katznelson').then(function(scores) {
    console.log(util.inspect(scores, {showHidden: false, depth: null}));
})

/*ucsc.getRateMyProfessorRatingsByLastName('Katznelson').then(function(ratings) {
    console.log(ratings);
})*/
