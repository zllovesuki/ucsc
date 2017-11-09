var express = require('express'),
    router = express.Router();

router.get('/timestamp/base', function(req, res, next) {
    var r = req.r;
    r.db('data').table('flat').getAll(
        '/timestamp/terms',
        '/timestamp/rmp',
        '/timestamp/subjects',
        '/timestamp/major-minor'
    ).run(r.conn).then(function(cursor) {
        return cursor.toArray();
    }).then(function(results) {
        if (results.length > 0) {
            res.setHeader('Content-Type', 'application/json');
            res.send(results.reduce(function(array, result) {
                array[result.key.slice(result.key.lastIndexOf('/') + 1)] = JSON.parse(result.value);
                return array;
            }, {}))
        }else{
            var error = new Error('Not found');
            error.responseCode = 404;
            next(error)
        }
    })
})

router.get('/base', function(req, res, next) {
    var r = req.r;
    r.db('data').table('flat').getAll(
        '/final',
        '/terms',
        '/rmp',
        '/subjects',
        '/major-minor',
        '/offered/spring',
        '/offered/summer',
        '/offered/fall',
        '/offered/winter',
        '/offered/ge_spring',
        '/offered/ge_summer',
        '/offered/ge_fall',
        '/offered/ge_winter'
    ).run(r.conn).then(function(cursor) {
        return cursor.toArray();
    }).then(function(results) {
        if (results.length === 13) {
            res.setHeader('Content-Type', 'application/json');
            res.send(results.reduce(function(array, result) {
                array[result.key.slice(result.key.lastIndexOf('/') + 1)] = JSON.parse(result.value);
                return array;
            }, {}))
        }else{
            var error = new Error('Not found');
            error.responseCode = 404;
            next(error)
        }
    })
})

router.get('/timestamp/term/:termId', function(req, res, next) {
    var r = req.r;
    var termId = req.params.termId || '';
    termId = termId.slice(-5) === '.json' ? termId.slice(0, -5) : termId;
    r.db('data').table('flat').getAll(
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
    r.db('data').table('flat').getAll(
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
    r.db('data').table('flat').get('/' + filename).run(r.conn).then(function(result) {
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
    r.db('data').table('flat').getAll(
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
