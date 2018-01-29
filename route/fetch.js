var Promise = require('bluebird'),
    express = require('express'),
    router = express.Router();

router.get('/timestamp/base', function(req, res, next) {
    Promise.all([
        req.getObject('timestamp/terms.json'),
        req.getObject('timestamp/rmp.json'),
        req.getObject('timestamp/subjects.json'),
        req.getObject('timestamp/major-minor.json')
    ]).then(function(results) {
        res.setHeader('Content-Type', 'application/json');
        res.send({
            terms: JSON.parse(results[0]),
            rmp: JSON.parse(results[1]),
            subjects: JSON.parse(results[2]),
            'major-minor': JSON.parse(results[3])
        })
    }).catch(function() {
        var error = new Error('Internal Server Error');
        error.responseCode = 500;
        next(error)
    })
})

router.get('/base', function(req, res, next) {
    Promise.all([
        req.getObject('final.json'),
        req.getObject('terms.json'),
        req.getObject('rmp.json'),
        req.getObject('subjects.json'),
        req.getObject('major-minor.json'),
        req.getObject('offered/spring.json'),
        req.getObject('offered/summer.json'),
        req.getObject('offered/fall.json'),
        req.getObject('offered/winter.json'),
        req.getObject('offered/ge_spring.json'),
        req.getObject('offered/ge_summer.json'),
        req.getObject('offered/ge_fall.json'),
        req.getObject('offered/ge_winter.json')
    ]).then(function(results) {
        res.setHeader('Content-Type', 'application/json');
        res.send({
            final: JSON.parse(results[0]),
            terms: JSON.parse(results[1]),
            rmp: JSON.parse(results[2]),
            subjects: JSON.parse(results[3]),
            'major-minor': JSON.parse(results[4]),
            spring: JSON.parse(results[5]),
            summer: JSON.parse(results[6]),
            fall: JSON.parse(results[7]),
            winter: JSON.parse(results[8]),
            ge_spring: JSON.parse(results[9]),
            ge_summer: JSON.parse(results[10]),
            ge_fall: JSON.parse(results[11]),
            ge_winter: JSON.parse(results[12])
        })
    }).catch(function() {
        var error = new Error('Internal Server Error');
        error.responseCode = 500;
        next(error)
    })
})

router.get('/timestamp/term/:termId', function(req, res, next) {
    var r = req.r;
    var termId = req.params.termId || '';
    termId = termId.slice(-5) === '.json' ? termId.slice(0, -5) : termId;
    r.table('flat').getAll(
        '/timestamp/terms/' + termId,
        '/timestamp/courses/' + termId
    ).run(r.conn).then(function(cursor) {
        return cursor.toArray();
    }).then(function(results) {
        if (results.length > 0) {
            res.setHeader('Content-Type', 'application/json');
            res.send(results.reduce(function(array, result) {
                if (result.key.indexOf('terms') !== -1) array.term = JSON.parse(result.value);
                if (result.key.indexOf('courses') !== -1) array.courses = JSON.parse(result.value);
                return array;
            }, {}))
        }else{
            var error = new Error('Not found');
            error.responseCode = 404;
            next(error)
        }
    })
})

router.get('/term/:termId', function(req, res, next) {
    var r = req.r;
    var termId = req.params.termId || '';
    termId = termId.slice(-5) === '.json' ? termId.slice(0, -5) : termId;
    r.table('flat').getAll(
        '/terms/' + termId,
        '/courses/' + termId
    ).run(r.conn).then(function(cursor) {
        return cursor.toArray();
    }).then(function(results) {
        if (results.length > 0) {
            res.setHeader('Content-Type', 'application/json');
            res.send(results.reduce(function(array, result) {
                if (result.key.indexOf('terms') !== -1) array.term = JSON.parse(result.value);
                if (result.key.indexOf('courses') !== -1) array.courses = JSON.parse(result.value);
                return array;
            }, {}))
        }else{
            var error = new Error('Not found');
            error.responseCode = 404;
            next(error)
        }
    })
})

router.get('/:filename', function(req, res, next) {
    var r = req.r;
    var filename = req.params.filename || '';
    filename = filename.slice(-5) === '.json' ? filename.slice(0, -5) : filename;
    r.table('flat').get('/' + filename).run(r.conn).then(function(result) {
        if (result !== null) {
            res.setHeader('Content-Type', 'application/json');
            res.send(JSON.parse(result.value));
        }else{
            var error = new Error('Not found');
            error.responseCode = 404;
            next(error)
        }
    })
})

router.get('/rmp/:tid', function(req, res, next) {
    var r = req.r;
    var tid = req.params.tid || '';
    tid = tid.slice(-5) === '.json' ? tid.slice(0, -5) : tid;
    r.table('flat').getAll(
        //'/rmp/ratings/' + tid,
        '/rmp/scores/' + tid,
        '/rmp/stats/' + tid
    ).run(r.conn).then(function(cursor) {
        return cursor.toArray();
    }).then(function(results) {
        if (results.length > 0) {
            res.setHeader('Content-Type', 'application/json');
            res.send(results.reduce(function(array, result) {
                array[result.key.slice(5).slice(0, result.key.slice(5).lastIndexOf('/'))] = JSON.parse(result.value);
                return array;
            }, {}))
        }else{
            var error = new Error('Not found');
            error.responseCode = 404;
            next(error)
        }
    })
})

module.exports = router;
