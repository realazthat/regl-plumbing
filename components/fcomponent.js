
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
    let {compile} = context.shallow(context.i);

    // if (Type.is(compile, String)) {
    //   compile = eval(compile);
    // }

    // if (Type.is(execute, String)) {
    //   execute = eval(execute);
    // }

    // context.data.execute = execute;

    if (compile) {
      let args = [{context}];
      return compile.apply(this, args);
    }
  }

  execute ({context}) {
    if (context.available(context.i.execute)) {
      let execute = context.resolve(context.i.execute);

      if (execute) {
        let args = [{context}];
        return execute.apply(this, args);
      }
    }
  }
}

module.exports = FComponent;
