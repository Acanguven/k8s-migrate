const Listr = require('listr');

const WARNINGS = [];

const migrate = async (sourceClient, targetClient, namespace) => {
  const SOURCE_NAMESPACE = namespace;
  const TARGET_NAMESPACE = namespace;

  console.log(`Migrating ${namespace} from ${sourceClient.host} to ${targetClient.host}`);


  const tasks = new Listr([
    {
      title: `Creating namespace ${TARGET_NAMESPACE}`,
      task: async (ctx, task) => {
        return await targetClient.client.api.v1.namespaces.post({
          body: {
            apiVersion: 'v1',
            kind: 'Namespace',
            metadata: {
              name: TARGET_NAMESPACE
            }
          }
        })
          .catch(e => {
            if (e.message.includes('already exists')) {
              return task.skip('Namespace already exists');
            }
            throw e;
          });
      }
    },
    {
      title: 'Migrating ConfigMaps',
      task: async (ctx, task) => {
        const existingConfigMaps = await sourceClient.client.api.v1.namespaces(SOURCE_NAMESPACE).configmaps.get();
        const configMapNames = existingConfigMaps.body.items.map(item => ({
          name: item.metadata.name,
          data: item.data
        }));

        return new Listr(configMapNames.map(sourceConfigMap => {
          return {
            title: `Migrate configmap ${sourceConfigMap.name}`,
            task: async () => {
              await targetClient.client.api.v1.namespaces(TARGET_NAMESPACE).configmaps.post({
                body: {
                  apiVersion: 'v1',
                  kind: 'ConfigMap',
                  metadata: {
                    name: sourceConfigMap.name,
                    namespace: TARGET_NAMESPACE
                  },
                  data: sourceConfigMap.data
                }
              })
                .catch(async err => {
                  if (err.message.includes('already exists')) {
                    return await targetClient.client.api.v1.namespaces(TARGET_NAMESPACE).configmaps(sourceConfigMap.name).put({
                      body: {
                        apiVersion: 'v1',
                        kind: 'ConfigMap',
                        metadata: {
                          name: sourceConfigMap.name,
                          namespace: TARGET_NAMESPACE
                        },
                        data: sourceConfigMap.data
                      }
                    })
                      .catch(err => {
                        WARNINGS.push(`Failed to update configmap ${sourceConfigMap.name}, reason: ${err.message}`);
                        task.skip(`Failed to update configmap ${sourceConfigMap.name}: ${err.message}`);
                      })
                  } else {
                    WARNINGS.push(`Failed to migrate configmap ${sourceConfigMap.name}, reason: ${err.message}`);
                    task.skip(err.message);
                  }
                })
            }
          }
        }), {concurrent: true});
      }
    },
    {
      title: 'Migrating Secret',
      task: async () => {
        const existingSecrets = await sourceClient.client.api.v1.namespaces(SOURCE_NAMESPACE).secrets.get();
        const secrets = existingSecrets.body.items.map(item => ({
          name: item.metadata.name,
          data: item.data,
          type: item.type
        }));

        return new Listr(secrets.map(sourceSecret => {
          return {
            title: `Migrate secret ${sourceSecret.name}`,
            task: async (ctx, task) => {
              await targetClient.client.api.v1.namespaces(TARGET_NAMESPACE).secrets.post({
                body: {
                  apiVersion: 'v1',
                  kind: 'Secret',
                  metadata: {
                    name: sourceSecret.name,
                    namespace: TARGET_NAMESPACE
                  },
                  data: sourceSecret.data,
                  type: sourceSecret.type
                }
              })
                .catch(async err => {
                  if (err.message.includes('already exists')) {
                    return await targetClient.client.api.v1.namespaces(TARGET_NAMESPACE).secrets(sourceSecret.name).put({
                      body: {
                        metadata: {
                          name: sourceSecret.name,
                        },
                        data: sourceSecret.data
                      }
                    })
                      .catch((err) => {
                        WARNINGS.push(`Failed to update secret ${sourceSecret.name}, reason: ${err.message}`);
                        task.skip(`Failed to update secret ${sourceSecret.name}: ${err.message}`);
                      });
                  } else {
                    WARNINGS.push(`Failed to migrate secret ${sourceSecret.name}, reason: ${err.message}`);
                    task.skip(`Failed to create secret ${sourceSecret.name}: ${err.message}`);
                  }
                });
            }
          }
        }), {concurrent: true});
      }
    },
    {
      title: 'Migrating Services',
      task: async () => {
        const existingServices = await sourceClient.client.api.v1.namespaces(SOURCE_NAMESPACE).services.get();

        const services = existingServices.body.items.map(item => {
          const sourceServiceData = {
            resourceVersion: item.metadata.resourceVersion,
            name: item.metadata.name.replace('preprod', 'prod'),
            spec: item.spec
          };
          delete sourceServiceData.spec.clusterIP;
          return sourceServiceData;
        });

        return new Listr(services.map(sourceService => {
          return {
            title: `Migrate service ${sourceService.name}`,
            task: async (ctx, task) => {
              await targetClient.client.api.v1.namespaces(TARGET_NAMESPACE).services.post({
                body: {
                  apiVersion: 'v1',
                  kind: 'Service',
                  metadata: {
                    name: sourceService.name,
                    namespace: TARGET_NAMESPACE
                  },
                  spec: sourceService.spec
                }
              })
                .catch(async err => {
                  if (err.message.includes('already exists')) {
                    return await targetClient.client.api.v1.namespaces(TARGET_NAMESPACE).services(sourceService.name).put({
                      body: {
                        metadata: {
                          resourceVersion: sourceService.resourceVersion,
                          name: sourceService.name,
                        },
                        spec: sourceService.spec
                      }
                    })
                      .catch((err) => {
                        WARNINGS.push(`Failed to update service ${sourceService.name}, reason: ${err.message}`);
                        task.skip(`Failed to update service ${sourceService.name}: ${err.message}`);
                      });
                  } else {
                    WARNINGS.push(`Failed to migrate service ${sourceService.name}, reason: ${err.message}`);
                    task.skip(`Failed to create service ${sourceService.name}: ${err.message}`);
                  }
                });
            }
          }
        }), {concurrent: true});
      }
    },
    {
      title: 'Migrating Deployments',
      task: async () => {
        const existingDeployments = await sourceClient.client.apis.apps.v1.namespaces(SOURCE_NAMESPACE).deployments.get();
        const deployments = existingDeployments.body.items.map(item => ({
          name: item.metadata.name,
          labels: item.metadata.labels,
          spec: item.spec
        }));

        return new Listr(deployments.map(sourceDeployment => {
          return {
            title: `Migrate deployment ${sourceDeployment.name}`,
            task: async (ctx, task) => {
              await targetClient.client.apis.extensions.v1beta1.namespaces(SOURCE_NAMESPACE).deployments.post({
                body: {
                  apiVersion: 'extensions/v1beta1',
                  kind: 'Deployment',
                  metadata: {
                    name: sourceDeployment.name,
                    namespace: TARGET_NAMESPACE,
                    labels: sourceDeployment.labels
                  },
                  spec: sourceDeployment.spec
                }
              })
                .catch(async err => {
                  if (err.message.includes('already exists')) {
                    return await targetClient.client.apis.extensions.v1beta1.namespaces(SOURCE_NAMESPACE).deployments(sourceDeployment.name).put({
                      body: {
                        metadata: {
                          resourceVersion: sourceDeployment.resourceVersion,
                          name: sourceDeployment.name,
                        },
                        spec: sourceDeployment.spec
                      }
                    })
                      .catch((err) => {
                        WARNINGS.push(`Failed to update deployment ${sourceDeployment.name}, reason: ${err.message}`);
                        task.skip(`Failed to update deployment ${sourceDeployment.name}: ${err.message}`);
                      });
                  } else {
                    WARNINGS.push(`Failed to migrate deployment ${sourceDeployment.name}, reason: ${err.message}`);
                    task.skip(`Failed to create deployment ${sourceDeployment.name}: ${err.message}`);
                  }
                });
            }
          }
        }), {concurrent: true});
      }
    },
    // {
    //   title: 'Publish package',
    //   task: () => {
    //   }
    // }
  ]);

  await tasks
    .run()
    .catch(err => {
      console.error(err);
    });

  console.log(`Migration complete${WARNINGS.length > 0 ? ` with ${WARNINGS.length} errors!` : ' succesfully!'}`);

  WARNINGS.forEach(log => console.error(log + '\n'));
};


module.exports = migrate;
