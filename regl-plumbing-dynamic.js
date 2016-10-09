
module.exports = {};

const common = require('./regl-plumbing-common.js');

class Dynamic {
  constructor ({value = null, func = null} = {}) {
    this.value = value;
    this.func = func;
    this.changed = common.time();
  }

  evaluate () {
    if (this.func) {
      this.value = this.func();
      this.changed = common.time();
    }

    return this.value;
  }

  update ({value}) {
    this.value = value;
    this.changed = common.time();
  }
}

module.exports.Dynamic = Dynamic;
