
module.exports = {};

const assert = require('assert');

const nodeinput = require('./regl-plumbing-nodeinput.js');
const execinput = require('./regl-plumbing-execinput.js');
const execoutput = require('./regl-plumbing-execoutput.js');
// const dynamic = require('./regl-plumbing-dynamic.js');
const common = require('./regl-plumbing-common.js');
const util = require('./regl-plumbing-util.js');

class ExecutionContext {
  constructor ({pipeline, runtime, nodeInputContext}) {
    assert(runtime === 'static' || runtime === 'dynamic');
    assert(nodeInputContext instanceof nodeinput.NodeInputContext);

    this.pipeline = pipeline;
    this.runtime = runtime;
    this.nodeInputContext = nodeInputContext;
    let {ExecutionInputSubcontext} = execinput;
    let {ExecutionOutputSubcontext} = execoutput;
    this.i = new Proxy(new ExecutionInputSubcontext({pipeline, executionContext: this, nodeInputContext,
                                                     path: [], dynamic: false, disconnected: false,
                                                     terminal: false}), util.accessHandler);
    this.o = new Proxy(new ExecutionOutputSubcontext({pipeline, executionContext: this, path: []}), util.accessHandler);
    this.data = {};
  }

  __setitem__ (subscript, value) {
    if (subscript === 'i') {
      this.i.setValue(value);
      return true;
    }

    if (subscript === 'o') {
      this.o.setValue(value);
      return true;
    }

    return false;
  }

  map (inputSubcontext, func = ((value) => value)) {
    let {ExecutionInputSubcontext} = execinput;
    assert(inputSubcontext instanceof ExecutionInputSubcontext);
    inputSubcontext = inputSubcontext.__unbox__();

    if (this.runtime === 'static') {
      let value = inputSubcontext.evaluate({runtime: 'static', recursive: true, resolve: false});

      if (common.vtIsDynamic({value, recursive: true})) {
        return function () {
          let value = inputSubcontext.evaluate({runtime: 'dynamic', recursive: true, resolve: true});
          value = func(value);
          return value;
        };
      } else {
        value = func(value);
        return value;
      }
    } else if (this.runtime === 'dynamic') {
      let value = inputSubcontext.evaluate({runtime: 'dynamic', recursive: true, resolve: true});

      value = func(value);
      return value;
    }
  }

  resolve (inputSubcontext) {
    let {ExecutionInputSubcontext} = execinput;
    assert(inputSubcontext instanceof ExecutionInputSubcontext);
    assert(this.runtime === 'static' || this.runtime === 'dynamic');

    inputSubcontext = inputSubcontext.__unbox__();

    if (inputSubcontext._disconnected) {
      throw new common.PipelineError(`value at ${inputSubcontext._path.join('.')} is disconnected`);
    }

    let value = inputSubcontext.evaluate({runtime: this.runtime, recursive: true, resolve: true});

    common.checkLeafs({value, allowedTypes: []});

    return value;
  }

  shallow (inputSubcontext, defaultValue = util.NOVALUE) {
    let {ExecutionInputSubcontext} = execinput;
    assert(inputSubcontext instanceof ExecutionInputSubcontext);
    assert(this.runtime === 'static' || this.runtime === 'dynamic');

    inputSubcontext = inputSubcontext.__unbox__();

    if (inputSubcontext._disconnected) {
      throw new common.PipelineError(`value at ${inputSubcontext._path.join('.')} is disconnected`);
    }

    try {
      let value = inputSubcontext.evaluate({runtime: this.runtime, recursive: false, resolve: true});

      common.checkLeafs({
        value,
        allowedTypes: [],
        allowedTests: [(value) => !common.vtIsFunction({value})]
      });

      return value;
    } catch (e) {
      if (e instanceof common.NoSuchPathError) {
        if (defaultValue === util.NOVALUE) {
          throw e;
        }
        return defaultValue;
      }
    }
  }

  available (inputSubcontext) {
    let {ExecutionInputSubcontext} = execinput;
    assert(inputSubcontext instanceof ExecutionInputSubcontext);
    assert(this.runtime === 'static' || this.runtime === 'dynamic');

    inputSubcontext = inputSubcontext.__unbox__();

    if (inputSubcontext._disconnected) {
      throw new common.PipelineError(`value at ${inputSubcontext._path.join('.')} is disconnected`);
    }

    try {
      inputSubcontext.evaluate({runtime: this.runtime, recursive: false, resolve: true});

      return true;
    } catch (e) {
      if (e instanceof common.NoSuchPathError) {
        return false;
      }
    }
  }
}

module.exports.ExecutionContext = ExecutionContext;
