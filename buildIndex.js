var elasticlunr = require('elasticlunr');
var Promise = require('bluebird');
var util = require('util');
var fs = require('fs');

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

var index = {};
var reducedIndex = {};
var indexTimestamp = {};

return read('./db/terms.json').then(function(json) {
    return Promise.map(json, function(term) {
        return read('./db/terms/' + term.code + '.json').then(function(courses) {
            index[term.code] = elasticlunr();

            index[term.code].addField('c');
            index[term.code].addField('n');
            //index[term.code].addField('lo');
            index[term.code].addField('f');
            index[term.code].addField('la');
            index[term.code].addField('d');
            index[term.code].setRef('b');
            index[term.code].saveDocument(false);

            return Promise.map(Object.keys(courses), function(subject) {
                return Promise.map(courses[subject], function(course) {
                    if (course.num) {
                        course.c = subject + ' ' + course.c.split(/(\d+)/).filter(Boolean).join(" ");
                        //course.lo = course.loc;
                        course.n = course.n.split(/(?=[A-Z])/).map(function(el) { return el.trim(); }).join(" ")
                        course.f = course.ins.f;
                        course.la = course.ins.l;
                        course.d = course.ins.d[0];
                        course.b = course.num;
                        index[term.code].addDoc(course);
                    }else{
                        console.log('No course number found, skipping...')
                    }
                }, { concurrency: 50 })
            }, { concurrency: 2 }).then(function() {
                indexTimestamp[term.code] = Math.round(+new Date()/1000)
                console.log('Saving term index', term.name)
                return write('./db/index/' + term.code + '.json', JSON.stringify(index[term.code].toJSON()))
                .then(function() {
                    return write('./db/timestamp/index/' + term.code + '.json', JSON.stringify(indexTimestamp[term.code])).then(function() {
                        delete index[term.code];
                    })
                })
            })
        })
    }, { concurrency: 1 })
})
