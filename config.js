module.exports = {
    nats: process.env.NATS ? process.env.NATS.split(',') : require('./config/config.json').nats,
    s3: process.env.S3 ? JSON.parse(process.env.S3) : require('./config/config.json').s3
}
