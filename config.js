module.exports = {
    andromeda: process.env.ANDROMEDA ? process.env.ANDROMEDA.split(',') : require('./config/config.json').andromeda,
    vigil_endpoint: process.env.VIGIL_ENDPOINT ? process.env.VIGIL_ENDPOINT : require('./config/config').vigil_endpoint,
    vigil_token: process.env.VIGIL_TOKEN ? process.env.VIGIL_TOKEN : require('./config/config').vigil_token,
    vigil_probe_id: process.env.VIGIL_PROBE_ID ? process.env.VIGIL_PROBE_ID : require('./config/config').vigil_probe_id,
    vigil_node_id : process.env.VIGIL_NODE_ID ? process.env.VIGIL_NODE_ID : require('./config/config').vigil_node_id,
    vigil_id: process.env.VIGIL_ID ? process.env.VIGIL_ID : require('./config/config').vigil_id
}
