
// const assert = require('assert');
const common = require('./regl-plumbing-common.js');
const util = require('./regl-plumbing-util.js');

class Component {
  constructor ({pipeline}) {
    this.pipeline = pipeline;
    this.compileSync = true;
    this.executeSync = true;
    this.reentrant = false;
    this.safe = false;
  }

  compile ({context}) {
    throw common.PipelineError('Must implement compile(); borked your component man');
  }

  destroy ({context}) {
    throw common.PipelineError('Must implement destroy(); borked your component man');
  }

  execute ({context}) {

  }
}

class Group extends Component {
  constructor ({pipeline}) {
    super({pipeline});
    this.compileSync = true;
    this.executeSync = true;
    this.reentrant = false;
  }

  destroy ({context}) {
    if (context.data.nodes) {
      context.data.nodes.forEach(({name, node}) => { node.destroy(); });

      util.clear(context.data.nodes);
    }

    if (context.data.chainArgs) {
      util.clear(context.data.chainArgs);
    }

    if (context.data.group) {
      util.clear(context.data.group);
    }
  }

  compile ({context}) {
    let {pipeline} = this;

    context.data.nodes = [];
    let nodes = context.data.nodes;

    context.data.chainArgs = {};
    let chainArgs = context.data.chainArgs;

    let elements = [];
    if (context.available(context.i.elements)) {
      elements = context.resolve(context.i.elements);
    } else {
      elements = this.elements();
    }

    context.data.elements = [{name: 'entry', component: 'pass'}].concat(elements).concat([{name: 'exit', component: 'pass'}]);
    elements = context.data.elements;

    let chain = this.chain;

    if (context.available(context.i.chain)) {
      chain = context.resolve(context.i.chain);
    }

    context.data.elements.forEach(function ({name, component}) {
      let node = pipeline.n(component);

      nodes.push({name, node});
    });

    nodes.forEach(function ({name, node}) {
      chainArgs[name] = node;
    });

    chain.apply(this, [chainArgs]);

    chainArgs.entry.i.__unbox__().setValue(context.i.__unbox__().getValue({runtime: 'static'}));

    let jobs = nodes.map(function ({name, node}) {
      let job = () => node.compile({recursive: false});
      return job;
    });

    // FIXME: why doesn't node.compile() return this correctly?
    jobs.push(() => {
      return chainArgs.exit.o.__unbox__().getValue({runtime: 'static'});
    });

    let result = util.allSync(jobs);

    return result;
  }

  execute ({context}) {
    let jobs = context.data.nodes.map(function ({name, node}) {
      let job = () => node.execute({recursive: false});
      return job;
    });

    return util.allSync(jobs);
  }

  elements () {
    throw new common.PipelineError('Must implement elements(); borked your Group component man');
  }

  chain ({entry, stuff, exit}) {
    throw new common.PipelineError('Must implement chain(); borked your Group component man');
  }

}

module.exports = {Component, Group};
