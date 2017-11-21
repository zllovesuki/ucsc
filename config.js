module.exports = {
    corsWhitelist: process.env.CORS ? process.env.CORS.split(',') : [],
    rethinkdb: process.env.RETHINKDB ? JSON.parse(process.env.RETHINKDB) : require('./config/config.json').rethinkdb,
    s3: process.env.S3 ? JSON.parse(process.env.S3) : require('./config/config.json').s3
}
