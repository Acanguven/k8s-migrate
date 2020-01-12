const fs = require('fs');
const path = require('path');
const os = require('os');

const SAVE_PATH = path.join(os.tmpdir(), './k8s-migrate.json');


const save = () => {
  fs.writeFileSync(SAVE_PATH, JSON.stringify(configuration), "utf8");
};

const set = (field, value) => {
  configuration[field] = value;
  save();
};

const get = (field) => {
  return configuration[field];
};


const load = () => {
  try {
    return JSON.parse(fs.readFileSync(SAVE_PATH, "utf8"));
  } catch (e) {
    return {};
  }
};

const configuration = load();

module.exports = {
  set,
  get
};
