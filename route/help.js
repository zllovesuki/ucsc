var express = require('express'),
    router = express.Router();

router.get('/', function(req, res, next) {
    return res.status(200).send({
        ok: true,
        endpoints: {
            '/base': 'Get basic data (term list, rmp mapping, subjects, majors/minors, and historic data)',
            '/timestamp/base': 'Get timestamp for basic data',
            '/term/:termId': 'Get list of classes and courseInfo for the term',
            '/timestamp/term/:termId': 'Get timestamp the classes and courseInfo for the term',
            '/rmp/:tid': 'Get RateMyProfessors stats (exclude all ratings)'
        }
    })
})

module.exports = router;
