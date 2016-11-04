var ucsc = require('./index')
var util = require('util')

ucsc.getTranscriptHTML(process.env.username, process.env.password).then(function(html) {
    console.log(util.inspect(ucsc.parseTranscriptHTML(html), {showHidden: false, depth: null}))
})
