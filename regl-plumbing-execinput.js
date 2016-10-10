
module.exports = {};

const assert = require('assert');
const clone = require('clone');
const Type = require('type-of-is');
const nodeinput = require('./regl-plumbing-nodeinput.js');
const execution = require('./regl-plumbing-execution.js');
const common = require('./regl-plumbing-common.js');
const util = require('./regl-plumbing-util.js');

class ExecutionInputSubcontext {
  constructor ({pipeline, executionContext, nodeInputContext, path}) {
    assert(nodeInputContext instanceof nodeinput.NodeInputContext);
    assert(executionContext instanceof execution.ExecutionContext);
    assert(Type.is(path, Array));

    this.pipeline = pipeline;
    this.executionContext = executionContext;
    this.nodeInputContext = nodeInputContext;
    this._path = clone(path);
  }

  evaluate ({runtime, recursive, resolve}) {
    assert(runtime === 'static' || runtime === 'dynamic');
    assert(recursive === true || recursive === false);
    assert(resolve === true || resolve === false);

    let result = this.nodeInputContext.__unbox__().evaluate({runtime, recursive, resolve});

    return result;
  }

  available ({runtime}) {
    assert(runtime === 'dynamic' || runtime === 'static');

    let result = this.nodeInputContext.__unbox__().available({runtime});

    return result;
  }

  __hasitem__ (subscript) {
    return util.__hasitem__.apply(this, [subscript]);
  }

  __getitem__ (subscript) {
    if (!this.__hasitem__(subscript)) {
      return undefined;
    }

    if (this.hasOwnProperty(subscript) || Object.getPrototypeOf(this).hasOwnProperty(subscript)) {
      return this[subscript];
    }

    let pipeline = this.pipeline;
    let path = Array.from(this._path).concat([subscript]);

    let executionContext = this.executionContext;
    let nodeInputContext = this.nodeInputContext[subscript];

    return new Proxy(new ExecutionInputSubcontext({pipeline, executionContext, nodeInputContext, path}), util.accessHandler);
  }

  getValue ({runtime}) {
    assert(runtime === 'static' || runtime === 'dynamic');

    return this.evaluate({runtime, recursive: true, resolve: false});
  }

  setValue (value) {
    throw new common.PipelineError('Cannot set a value on an ExecutionInputSubcontext');
  }

  __setitem__ (subscript, value) {
    this.__getitem__(subscript).setValue(value);
    return true;
  }

}

module.exports.ExecutionInputSubcontext = ExecutionInputSubcontext;
