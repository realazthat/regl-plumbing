
module.exports = {};

const assert = require('assert');

const nodeinput = require('./regl-plumbing-nodeinput.js');
const execinput = require('./regl-plumbing-execinput.js');
// const execoutput = require('./regl-plumbing-execoutput.js');
// const dynamic = require('./regl-plumbing-dynamic.js');
const common = require('./regl-plumbing-common.js');
const util = require('./regl-plumbing-util.js');

class ExecutionContext {
  constructor ({pipeline, runtime, nodeInputContext}) {
    assert(runtime === 'static' || runtime === 'dynamic');
    assert(nodeInputContext instanceof nodeinput.NodeInputContext);

    this.pipeline = pipeline;
    this._runtime = runtime;
    this.nodeInputContext = nodeInputContext;
    this.i = new Proxy(new execinput.ExecutionInputSubcontext({pipeline, executionContext: this, nodeInputContext,
                                                     path: [], dynamic: false, disconnected: false,
                                                     terminal: false}), util.accessHandler);
    // this.o = new Proxy(new execoutput.ExecutionOutputSubcontext({pipeline, executionContext: this, path: []}), util.accessHandler);
    this.data = {};

    Object.seal(this);
  }

  runtime (runtime = util.NOVALUE) {
    if (runtime !== util.NOVALUE) {
      assert(runtime === 'static' || runtime === 'dynamic');

      this._runtime = runtime;

      return this._runtime;
    }

    assert(this._runtime === 'static' || this._runtime === 'dynamic');

    return this._runtime;
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

    if (this.runtime() === 'static') {
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
    } else if (this.runtime() === 'dynamic') {
      let value = inputSubcontext.evaluate({runtime: 'dynamic', recursive: true, resolve: true});

      value = func(value);
      return value;
    } else {
      assert(false);
    }
  }

  resolve (inputSubcontext) {
    let {ExecutionInputSubcontext} = execinput;
    assert(inputSubcontext instanceof ExecutionInputSubcontext);
    assert(this.runtime() === 'static' || this.runtime() === 'dynamic');

    inputSubcontext = inputSubcontext.__unbox__();

    let value = inputSubcontext.evaluate({runtime: this.runtime(), recursive: true, resolve: true});

    common.checkLeafs({value, allowedTypes: []});

    return value;
  }

  shallow (inputSubcontext, defaultValue = util.NOVALUE) {
    let {ExecutionInputSubcontext} = execinput;
    assert(inputSubcontext instanceof ExecutionInputSubcontext);
    assert(this.runtime() === 'static' || this.runtime() === 'dynamic');

    inputSubcontext = inputSubcontext.__unbox__();

    if (!inputSubcontext.available({runtime: this.runtime()}) && defaultValue !== util.NOVALUE) {
      return defaultValue;
    }

    let value = inputSubcontext.evaluate({runtime: this.runtime(), recursive: false, resolve: true});

    common.checkLeafs({
      value,
      allowedTypes: [],
      allowedTests: [common.vtIsFunction]
    });

    return value;
  }

  available (inputSubcontext) {
    let {ExecutionInputSubcontext} = execinput;
    assert(inputSubcontext instanceof ExecutionInputSubcontext);
    assert(this.runtime() === 'static' || this.runtime() === 'dynamic');

    inputSubcontext = inputSubcontext.__unbox__();

    return inputSubcontext.available({runtime: this.runtime()});
  }
}

module.exports.ExecutionContext = ExecutionContext;
