
const {Component} = require('../regl-plumbing-component.js');

// const Type = require('type-of-is');

class FComponent extends Component {
  constructor ({pipeline}) {
    super({pipeline});
    this.compileSync = true;
    this.executeSync = true;
    this.reentrant = true;
    this.safe = false;
    Object.freeze(this);
  }

  compile ({context}) {
    let {compile, execute} = context.resolve(context.i);

    // if (Type.is(compile, String)) {
    //   compile = eval(compile);
    // }

    // if (Type.is(execute, String)) {
    //   execute = eval(execute);
    // }

    context.data.execute = execute;

    if (compile) {
      let args = [{context}];
      return compile.apply(this, args);
    }
  }

  execute ({context}) {
    let {execute} = context.data;

    if (execute) {
      let args = [{context}];
      return execute.apply(this, args);
    }
  }
}

module.exports = FComponent;
