module.exports = {
    nats: process.env.NATS ? process.env.NATS.split(',') : require('./config/config.json').nats,
    andromeda: process.env.ANDROMEDA ? process.env.ANDROMEDA.split(',') : require('./config/config.json').andromeda
}
