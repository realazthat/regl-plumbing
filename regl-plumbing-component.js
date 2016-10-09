
// const assert = require('assert');
const common = require('./regl-plumbing-common.js');

class Component {
  constructor ({pipeline}) {
    this.pipeline = pipeline;
    this.compileSync = true;
    this.executeSync = true;
    this.reentrant = false;
  }

  compile (args = {}) {
    throw common.PipelineError('Must implement compile(); borked your component man');
  }

  execute (args = {}) {

  }
}

// class GroupContext {
//   constructor({pipeline}){
//     this.i = new Proxy(new NodeOutputContext({pipeline}), util.accessHandler);
//   }

//   __hasitem__(subscript) {
//     if (!Type.is(subscript, String)) {
//       return false;
//     }

//     if (subscript === 'i') {
//       return true;
//     }

//     return false;
//   }

//   __setitem__(subscript,value) {
//     this[subscript].setValue(value);
//   }
// }

class Group extends Component {
  constructor ({pipeline, group}) {
    super({pipeline});
    this.compileSync = true;
    this.executeSync = true;
    this.reentrant = false;

    this.group = [{name: 'entry', component: 'pass'}].concat(group).concat([{name: 'exit', component: 'pass'}]);
    this.group = this.group.map(function ({name, component}) {
      return {name, node: pipeline.n(component)};
    });

    let chainArgs = this.chainArgs = {};
    this.group.forEach(function ({name, node}) {
      chainArgs[name] = node;
    });

    this.chain(chainArgs);
  }

  compile ({context}) {
    this.chainArgs.entry.i.__unbox__().setValue(context.i.__unbox__().getValue({runtime: 'static'}));

    this.group.forEach(function ({name, node}) {
      node.compile();
    });

    return this.chainArgs.exit.o.__unbox__().getValue({runtime: 'static'});
  }

  execute ({context}) {
    this.group.forEach(function ({name, node}) {
      node.execute();
    });
  }

  chain ({group}) {
    throw common.PipelineError('Must implement chain(); borked your Group component man');
  }

}

module.exports = {Component, Group};
