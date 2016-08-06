var ucsc = require('./index');
var util = require('util');

ucsc.getTerms().then(function(terms) {
    console.log(terms);
    ucsc.getCourses(2168, 3000).then(function(courses) {
        console.log(util.inspect(courses, {showHidden: false, depth: null}));
    })
})
