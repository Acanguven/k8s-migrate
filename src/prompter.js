#!/usr/bin/env node

const inquirer = require('inquirer');
const k8SClient = require('./client');
const migrator = require('./migrator');
const {set, get} = require('./storage');

const askText = async (question) => {
  const {answer} = await inquirer
    .prompt({
      name: 'answer',
      message: question,
      type: 'text',
    });

  return answer;
};

const fetchK8SInfo = async (k8sType) => {
  const previousHosts = get('previousHosts') || [];


  if (previousHosts.length > 0) {
    const {isPreviousHost} = await inquirer
      .prompt({
        name: 'isPreviousHost',
        message: `${k8sType} K8S host:`,
        choices: ['Create New', ...previousHosts],
        type: 'list',
      });

    if (isPreviousHost !== 'Create New') {
      return get(isPreviousHost);
    }
  }

  const {host} = await inquirer
    .prompt(
      {
        name: 'host',
        message: `K8s ${k8sType} you want to migrate:(https://10.2.80.107:664):`,
        type: 'text',
      }
    );

  const {authorization} = await inquirer
    .prompt({
      name: 'authorization',
      message: `${k8sType} Authorization type:`,
      choices: ['None', 'Token', 'Username - Password'],
      type: 'list',
    });

  let token, username, password;

  if (authorization === 'Token') {
    token = await askText(`${k8sType} token:`);
  } else if (authorization === 'Username - Password') {
    username = await askText(`Username:`);
    password = await askText(`Password:`);
  }


  return {
    host,
    token,
    username,
    password
  }
};

const start = async () => {
  console.clear();
  const source_configuration = await fetchK8SInfo('Source');
  const sourceClient = new k8SClient(source_configuration);

  const sourceNamespaces = await sourceClient
    .fetchNamespaces()
    .then((response) => {
      set(source_configuration.host, source_configuration);
      const previousHosts = get('previousHosts') || [];
      if (!previousHosts.includes(source_configuration.host)) {
        previousHosts.push(source_configuration.host);
        set('previousHosts', previousHosts);
        console.info('K8S saved for future usages');
      }

      return response.body.items.map(namespace => namespace.metadata.name);
    })
    .catch(err => {
      console.log('Failed to connect source k8s', err.message);
      process.exit(1);
    });

  const target_configuration = await fetchK8SInfo('Target');
  const targetClient = new k8SClient(target_configuration);

  targetClient
    .fetchNamespaces()
    .then(() => {
      set(target_configuration.host, target_configuration);
      const previousHosts = get('previousHosts') || [];
      if (!previousHosts.includes(target_configuration.host)) {
        previousHosts.push(target_configuration.host);
        set('previousHosts', previousHosts);
        console.info('K8S saved for future usages');
      }
    })
    .catch(err => {
      console.log('Failed to connect target k8s', err.message);
      process.exit(1);
    });

  const {namespace} = await inquirer.prompt({
    name: 'namespace',
    type: 'list',
    message: 'Which namespace you want to migrate',
    choices: sourceNamespaces
  });

  migrator(sourceClient, targetClient, namespace);
};


start();
