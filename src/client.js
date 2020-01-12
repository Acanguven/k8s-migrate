const Client = require('kubernetes-client').Client;
const Request = require('kubernetes-client/backends/request');


class K8SClient {
  constructor({host, token, username, password}) {
    this.host = host;
    this.token = token;
    this.username = username;
    this.password = password;

    this.client = new Client({
      backend: new Request({
        url: this.host,
        auth: {
          username: this.username,
          bearer: this.token,
          password: this.password
        },
        insecureSkipTlsVerify: true
      }), version: '1.13'
    });
  }

  async fetchNamespaces() {
    return this.client.api.v1.namespaces.get();
  }
}

module.exports = K8SClient;
