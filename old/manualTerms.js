var Promise = require('bluebird');
var ucsc = require('./index');
var knox = require('knox');
var config = require('./config');
var path = require('path');
var fs = require('fs')
var r = require('rethinkdb')

var s3 = knox.createClient(Object.assign(config.s3, {
    style: 'path'
}));
var db = __dirname + '/db',
    dbPath = path.resolve(db);

var upload = function(source) {
    return new Promise(function(resolve, reject) {
        console.log('Uploading', source)
        fs.stat(source, function(err, stat) {
            var fileStream = fs.createReadStream(source);
            s3.putStream(fileStream, source.substring(source.indexOf('db') + 2), {
                'Content-Length': stat.size,
                'Content-Type': 'application/json'
            }, function(err, res) {
                if (err) {
                    return reject(err);
                }
                console.log(source, 'uploaded')
                r.table('flat').insert({
                    key: source.substring(source.indexOf('db') + 2).slice(0, -5),
                    value: fs.readFileSync(source).toString('utf-8')
                }, {
                    conflict: 'replace'
                }).run(r.conn).then(function(resilt) {
                    console.log(source, 'saved to database')
                    return resolve();
                }).catch(function(e) {
                    return reject(e)
                })
            })
        })
    });
}

var write = function(name, object) {
    return new Promise(function(resolve, reject) {
        fs.writeFile(name, JSON.stringify(object), function(err) {
            if (err) {
                return reject(err);
            }
            return resolve();
        });
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

var uploadExtra = function() {
    console.log('Uploading extras')
    var files = [
        path.join(dbPath, 'offered', 'spring.json'),
        path.join(dbPath, 'offered', 'summer.json'),
        path.join(dbPath, 'offered', 'fall.json'),
        path.join(dbPath, 'offered', 'winter.json'),
        path.join(dbPath, 'terms.json'),
        path.join(dbPath, 'timestamp', 'terms.json'),
        path.join(dbPath, 'major-minor.json'),
        path.join(dbPath, 'timestamp', 'major-minor.json'),
        path.join(dbPath, 'final.json'),
        path.join(dbPath, 'timestamp', 'final.json')
    ]
    return Promise.mapSeries(files, function(file) {
        return upload(file);
    })
}

var uploadOneTerm = function(code) {
    console.log('Uploading term', code)
    var files = [
        path.join(dbPath, 'courses', code + '.json'),
        path.join(dbPath, 'timestamp', 'courses', code + '.json'),
        path.join(dbPath, 'terms', code + '.json'),
        path.join(dbPath, 'timestamp', 'terms', code + '.json')
    ]
    return Promise.mapSeries(files, function(file) {
        return upload(file);
    })
}

r.connect(config.rethinkdb).then(function(conn) {
    r.conn = conn;
    var termRef = null
    var foundTime = {}
    var profMap = {}
    var courseListTimestamp = {}
    var subjectMap = require('./db/subjects.json').reduce(function(subjectMap, row) {
        subjectMap[row.code] = row.name
        return subjectMap
    }, {})

    return ucsc.getTerms().then(function(terms) {
        var termRef = terms.sort(function(a, b) {
            if (a.code < b.code) return 1
            else if (a.code > b.code) return -1
            else return 0
        })[0].code - 10

        return Promise.map(terms, function(term) {
            foundTime[term.code] = false;
            return ucsc.getCourses(term.code, 3000).then(function(courses) {
                return Promise.map(Object.keys(courses), function(subject) {
                    return Promise.map(courses[subject], function(course) {
                        if (foundTime[term.code]) {
                            return;
                        }
                        if (course.num) {
                            console.log('Term', term.name, 'fetching start and end date')
                            var getCourse = function(term, course) {
                                return ucsc.getCourse(term.code, course.num)
                                .then(function(courseInfo) {
                                    if (courseInfo.md.start === 'N/A') return;
                                    foundTime[term.code] = true;
                                    term.date = courseInfo.md;
                                })
                            };
                            return getCourse(term, course)
                            .catch(function(e) {
                                console.log('Retrying', term.name, 'course number', course.num)
                                return getCourse(term, course)
                            })
                        }else{
                            console.log('No course number found, skipping...')
                        }
                    }, { concurrency: 1 })
                }, { concurrency: 1 })
                .then(function() {
                    if (term.code < termRef) return
                    // A Cluster of Fucks to overcome the problem of pisa no longer display first/last name for professor
                    console.log('Additional step: attempt to map displayName to First/Last name via Campus Directory')
                    for (var subject in courses) {
                        if (typeof profMap[subject] === 'undefined') profMap[subject] = {}
                        for (var i = 0; i < courses[subject].length; i++) {
                            if (typeof courses[subject][i].ins === 'undefined') continue;
                            if (typeof courses[subject][i].ins.d === 'undefined' || courses[subject][i].ins.d[0] === 'Staff') continue;
                            if (typeof courses[subject][i].ins.l !== 'undefined') continue;
                            if (typeof profMap[subject][courses[subject][i].ins.d[0]] !== 'undefined') continue;

                            profMap[subject][courses[subject][i].ins.d[0]] = null
                        }
                    }

                    return Promise.map(Object.keys(profMap), function(subject) {
                        return Promise.map(Object.keys(profMap[subject]), function(profDisplayName) {
                            if (!!profMap[subject][profDisplayName]) return;

                            return ucsc.searchFacultyOnDirectoryByLastname(
                                profDisplayName.slice(0, profDisplayName.indexOf(',')),
                                profDisplayName.slice(profDisplayName.indexOf(',') + 1),
                                subjectMap[subject]
                            )
                            .then(function(result) {
                                if (result.bestGuess.name) {
                                    profMap[subject][profDisplayName] = result.bestGuess.name
                                }
                            })
                        }, { concurrency: 1 })
                    }, { concurrency: 1 })
                    .then(function() {
                        for (var subject in courses) {
                            for (var i = 0; i < courses[subject].length; i++) {
                                if (typeof courses[subject][i].ins === 'undefined') continue;
                                if (typeof courses[subject][i].ins.d === 'undefined' || courses[subject][i].ins.d[0] === 'Staff') continue;
                                if (typeof courses[subject][i].ins.l !== 'undefined') continue;

                                if (profMap[subject][courses[subject][i].ins.d[0]] === null) {
                                    profMap[subject][courses[subject][i].ins.d[0]] = false
                                }
                                if (!!!profMap[subject][courses[subject][i].ins.d[0]]) continue

                                courses[subject][i].ins.l = profMap[subject][courses[subject][i].ins.d[0]].split(' ').slice(-1)[0]
                                courses[subject][i].ins.f = profMap[subject][courses[subject][i].ins.d[0]].split(' ').slice(0, -1)[0]
                            }
                        }
                    })
                })
                .then(function() {
                    courseListTimestamp[term.code] = Math.round(+new Date()/1000)
                    return write('./db/terms/' + term.code + '.json', courses)
                    .then(function() {
                        console.log(term.name, 'saved to', './db/terms/' + term.code + '.json');
                    })
                    .then(function() {
                        return write('./db/timestamp/terms/' + term.code + '.json', courseListTimestamp[term.code])
                    })
                })
            })
            .then(function() {
                return write('./db/terms.json', terms)
                .then(function() {
                    return write('./db/timestamp/terms.json', Math.round(+new Date()/1000));
                })
            })
            .catch(function(e) {
                console.error(e);
                console.error('Error saving', term.name)
            })
        }, { concurrency: 1 })
    }).then(function() {
        courseListTimestamp = {};
        foundTime = {};
        r.conn.close()

        var uploadTerms = [
            2178,
            2174
        ]
        return Promise.map(uploadTerms, uploadOneTerm, { concurrency: 3 })
    })
})
