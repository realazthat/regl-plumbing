
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

  static init ({pipeline, executionContext, nodeInputContext, path}) {
    let eic = new ExecutionInputSubcontext({pipeline, executionContext, nodeInputContext, path});
    let proxy = new Proxy(eic, util.accessHandler);
    eic.proxy = proxy;

    eic.executionContext = eic.executionContext.__box__();
    eic.nodeInputContext = eic.nodeInputContext.__box__();

    assert(eic.nodeInputContext instanceof nodeinput.NodeInputContext);
    assert(eic.executionContext instanceof execution.ExecutionContext);
    Object.seal(eic);

    return proxy;
  }

  __box__ () {
    return util.__box__.apply(this);
  }

  __unbox__ () {
    return util.__unbox__.apply(this);
  }

  evaluate ({runtime, recursive, resolve, missing = util.NOVALUE}) {
    assert(runtime === 'static' || runtime === 'dynamic');
    assert(recursive === true || recursive === false);
    assert(resolve === true || resolve === false);

    let result = this.nodeInputContext.__unbox__().evaluate({runtime, recursive, resolve, missing});

    return result;
  }

  available ({runtime, terminalDynamic}) {
    assert(runtime === 'dynamic' || runtime === 'static');

    let result = this.nodeInputContext.__unbox__().available({runtime, terminalDynamic});

    return result;
  }

  __hasitem__ (subscript) {
    return util.__hasitem__.apply(this, [subscript]);
  }

  __getitem__ (subscript) {
    let rthis = this.__unbox__();

    if (!rthis.__hasitem__(subscript)) {
      return undefined;
    }

    // if (rthis.hasOwnProperty(subscript) || Object.getPrototypeOf(rthis).hasOwnProperty(subscript)) {
    //   return rthis[subscript];
    // }

    let {pipeline} = rthis;
    let path = Array.from(rthis._path).concat([subscript]);

    let executionContext = rthis.executionContext;
    let nodeInputContext = rthis.nodeInputContext[subscript];

    return ExecutionInputSubcontext.init({pipeline, executionContext, nodeInputContext, path});
  }

  getValue ({runtime}) {
    let rthis = this.__unbox__();
    assert(runtime === 'static' || runtime === 'dynamic');

    return rthis.evaluate({runtime, recursive: true, resolve: false});
  }

  setValue (value) {
    throw new common.PipelineError('Cannot set a value on an ExecutionInputSubcontext');
  }

  __setitem__ (subscript, value) {
    let rthis = this.__unbox__();
    rthis.__getitem__(subscript).setValue(value);
    return true;
  }

}

module.exports.ExecutionInputSubcontext = ExecutionInputSubcontext;
