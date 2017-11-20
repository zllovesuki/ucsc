var Promise = require('bluebird')
var superagent = require('superagent')
var fs = require('fs')

var ca = null;
var token = null;

var KUBERNETES_SERVICE_HOST = process.env.KUBERNETES_SERVICE_HOST || 'api.cluster.computer';
var KUBERNETES_SERVICE_PORT = process.env.KUBERNETES_SERVICE_PORT || '443';
var POD_NAMESPACE = process.env.POD_NAMESPACE || 'default';
var RETHINK_NAMESPACE = process.env.RETHINK_NAMESPACE || 'database';
var RETHINK_CLUSTER = process.env.RETHINK_CLUSTER || 'rethinkdb';
var POD_NAME = process.env.POD_NAME || 'somethinglongandnotthere';

var loadCredentials = function() {
    ca = fs.readFileSync('/var/run/secrets/kubernetes.io/serviceaccount/ca.crt')
    token = fs.readFileSync('/var/run/secrets/kubernetes.io/serviceaccount/token').toString('utf-8')
    return Promise.resolve()
}

var getSelf = function() {
    return new Promise(function(resolve, reject) {
        superagent.get('https://' + KUBERNETES_SERVICE_HOST + ':' + KUBERNETES_SERVICE_PORT + '/api/v1/namespaces/' + POD_NAMESPACE + '/pods/' + POD_NAME)
        .set('Authorization', 'Bearer ' + token)
        .ca(ca)
        .end(function(err, res) {
            if (err) {
                return reject(err)
            }
            resolve(JSON.parse(res.text))
        })
    });
}

var getEndpoints = function() {
    return new Promise(function(resolve, reject) {
        superagent.get('https://' + KUBERNETES_SERVICE_HOST + ':' + KUBERNETES_SERVICE_PORT + '/api/v1/namespaces/' + RETHINK_NAMESPACE + '/endpoints/' + RETHINK_CLUSTER)
        .set('Authorization', 'Bearer ' + token)
        .ca(ca)
        .end(function(err, res) {
            if (err) {
                return reject(err)
            }
            resolve(JSON.parse(res.text))
        })
    });
}

module.exports = function() {
    if (!process.env.KUBERNETES_SERVICE_HOST) return Promise.resolve(null);
    return loadCredentials().then(function() {
        return Promise.all([
            getSelf(),
            getEndpoints()
        ]).spread(function(self, endpoints) {
            var endpoint = null;
            endpoints.subsets.forEach(function(set) {
                set.addresses.forEach(function(address) {
                    if (address.nodeName === self.spec.nodeName) endpoint = address.ip
                })
            })
            return endpoint
        })
    }).catch(function(e) {
        console.error(e)
        return null;
    })
}
