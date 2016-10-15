var Promise = require('bluebird');
var job = require('./fetcher');
var knox = require('knox');
var config = require('./config');
var path = require('path');
var fs = require('fs')

var s3 = knox.createClient(config.s3);

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
                return resolve();
            })
        })
    });
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

var uploadOneTerm = function(code) {
    console.log('Uploading term', code)
    var files = [
        path.join(dbPath, 'offered', 'spring.json'),
        path.join(dbPath, 'offered', 'summer.json'),
        path.join(dbPath, 'offered', 'fall.json'),
        path.join(dbPath, 'offered', 'winter.json'),
        path.join(dbPath, 'courses', code + '.json'),
        path.join(dbPath, 'timestamp', 'courses', code + '.json'),
        path.join(dbPath, 'terms', code + '.json'),
        path.join(dbPath, 'timestamp', 'terms', code + '.json'),
        path.join(dbPath, 'index', code + '.json'),
        path.join(dbPath, 'timestamp', 'index', code + '.json'),
        path.join(dbPath, 'terms.json'),
        path.join(dbPath, 'timestamp', 'terms.json')
    ]
    return Promise.mapSeries(files, function(file) {
        return upload(file);
    })
}

var shouldStartFresh = function() {
    console.log('Check if S3 has data...')
    return new Promise(function(resolve, reject) {
        s3.getFile('/terms.json', function(err, res) {
            if (err) {
                reject(err);
            }
            if (res.statusCode == 404) {
                // we should fetch all files
                return resolve(true);
            }
            return resolve(false);
        })
    })
}

var getTermsJsonOnS3 = function() {
    return new Promise(function(resolve, reject) {
        s3.getFile('/terms.json', function(err, res) {
            if (err) {
                reject(err);
            }
            var data = '';
            res.on('data', function(chunk) {
                data += chunk;
            })
            res.on('end', function() {
                return resolve(JSON.parse(data));
            })
        })
    });
}

var dirtyGC = function() {
    console.log('We will exit with code 1 and let the deamon restart us (basically a garbage collection)...')
    process.exit(1)
}

var checkForNewTerm = function() {
    /*
        TODO: locking
    */
    console.log('Checking for new terms on pisa');
    return Promise.all([
        getTermsJsonOnS3(),
        job.ucsc.getTerms()
    ]).spread(function(s3Terms, pisaTerms) {
        // Sort s3Terms desc by code
        s3Terms.sort(function(a, b) { return b.code - a.code });
        // Sort pisaTerms desc by code
        pisaTerms.sort(function(a, b) { return b.code - a.code });
        // Now you see me...
        var localNewTerm = s3Terms[0].code;
        var remoteNewTerm = pisaTerms[0].code;
        var remoteNewTermName = pisaTerms[0].name;
        var todoTerm = localNewTerm;
        if (localNewTerm >= remoteNewTerm) {
            console.log('No new terms found.')
            console.log('But we will update the latest term on S3...')
        }else{
            // now we should fetch the new term
            console.log('Found a new term!', 'Fetching term', remoteNewTermName, '...');
            todoTerm = remoteNewTerm;
        }
        return job.saveTermsList()
        .then(function() {
            return job.saveCourseInfo(todoTerm)
        })
        .then(job.buildIndex)
        .then(job.calculateTermsStats)
        .then(function() {
            return uploadOneTerm(todoTerm)
        })
    }).catch(function(e) {
        console.error('Error thrown in checkForNewTerm', e)
        console.log('Continue...')
    }).finally(function() {
        setTimeout(function() {
            checkForNewTerm()
        }, 302400 * 1000) // check for new term every 3.5 days
    })
}

shouldStartFresh().then(function(weShould) {
    if (weShould) {
        // initialize everything
        console.log('No data found on S3, fetching fresh data...')
        // download everything...
        // then uploading everything
        return job.saveTermsList()
        .then(job.saveCourseInfo)
        .then(job.buildIndex)
        .then(job.calculateTermsStats)
        .then(job.saveGEDesc)
        .then(job.saveMaps)
        .then(uploadEverything)
        .then(dirtyGC)
    }else{
        console.log('Data already populated on S3.')
    }
}).then(function() {
    checkForNewTerm();
}).catch(function(e) {
    console.error('S3 Client returns Error', e)
})
