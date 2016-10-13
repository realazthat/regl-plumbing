
const {Component} = require('../regl-plumbing-component.js');

class PassComponent extends Component {
  constructor ({pipeline}) {
    super({pipeline});
    this.compileSync = true;
    this.executeSync = true;
    this.reentrant = true;
    Object.freeze(this);
  }

  compile ({context}) {
    return context.i;
  }
}

module.exports = PassComponent;
