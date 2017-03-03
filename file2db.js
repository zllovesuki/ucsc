var config = require('./config');
var path = require('path');
var fs = require('fs')
var r = require('rethinkdb')

var db = __dirname + '/db',
    dbPath = path.resolve(db);

var upload = function(source) {
    return r.db('data').table('flat').insert({
        key: source.substring(source.indexOf('db') + 2).slice(0, -5),
        value: fs.readFileSync(source).toString('utf-8')
    }, {
        conflict: 'replace'
    }).run(r.conn).then(function(resilt) {
        console.log(source, 'saved to database')
    })
}

var walk = function(dir) {
    var results = []
    var list = fs.readdirSync(dir)
    list.forEach(function(file) {
        file = dir + '/' + file
        var stat = fs.statSync(file)
        if (stat && stat.isDirectory()) results = results.concat(walk(file))
        else results.push(file)
    })
    return results
} // http://stackoverflow.com/questions/5827612/node-js-fs-readdir-recursive-directory-search

var uploadEverything = function() {
    /*

        THIS SHOULD ONLY BE CALLED UPON INITIALIZATION, ONCE ONLY

    */

    var files = walk(dbPath);
    return Promise.map(files, function(file) {
        return upload(file);
    }, { concurrency: 10 })
}
