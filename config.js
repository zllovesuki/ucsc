module.exports = {
    corsWhitelist: process.env.CORS ? process.env.CORS.split(',') : [],
    host: process.env.RETHINKDB_HOST || require('./config/config.json').host,
    s3: process.env.S3 ? JSON.parse(process.env.S3) : require('./config/config.json').s3
}
