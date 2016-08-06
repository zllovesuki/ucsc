var Promise = require('bluebird');
var cheerio = require('cheerio');
var request = require('request');
var UglifyJS = require('uglify-js');

request.get('http://maps.ucsc.edu/content/all-classrooms', function(err, response, body) {
    var $ = cheerio.load(body);
    var scripts = $('script');
    var parsed;
    var locations = []
    for (var i = 0, length = scripts.length; i < length; i++) {
        if (scripts[i].children.length > 0) {
            if (scripts[i].children[0].data.indexOf('features') !== -1) {
                var script = scripts[i].children[0].data;
                script = script.substring(31).slice(0, -2);
                script = JSON.parse(script);
                locations = script.leaflet[0].features;
            }
        }
    }
    if (locations.length > 0) {
        for (var i = 0, length = locations.length; i < length; i++) {
            delete locations[i].type;
            delete locations[i].popup;
        }
        console.log(locations);
    }
})
