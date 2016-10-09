
const {Component} = require('../component.js');

class PassComponent extends Component {
  constructor ({pipeline}) {
    super({pipeline});
    this.compileSync = true;
    this.executeSync = true;
    this.reentrant = true;
  }

  compile ({context}) {
    return context.i;
  }
}

module.exports = PassComponent;
