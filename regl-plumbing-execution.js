
module.exports = {};

const assert = require('assert');

const nodeinput = require('./regl-plumbing-nodeinput.js');
const execinput = require('./regl-plumbing-execinput.js');
// const execoutput = require('./regl-plumbing-execoutput.js');
const dynamic = require('./regl-plumbing-dynamic.js');
const common = require('./regl-plumbing-common.js');
const util = require('./regl-plumbing-util.js');
const _ = require('lodash');

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

  saveState () {
    let {pipeline} = this;
    let {msgpack} = pipeline;

    let state = {};

    state._runtime = this._runtime;
    state.data = this.data;

    ({value: state} = msgpack.wrap({value: state, raise: true}));

    return msgpack.encode(state);
  }

  loadState ({buffer}) {
    let {pipeline} = this;
    let {msgpack} = pipeline;

    let state = msgpack.decode(buffer);

    // TODO: turn this into an exception
    assert(state._runtime === 'static' || state._runtime === 'dynamic');

    this._runtime = state._runtime;
    this.data = state.data;
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

  node () {
    return this.nodeInputContext.__unbox__().node();
  }

  framebuffer (outTex) {
    let {pipeline} = this;
    let context = this;

    return context.map(outTex.regl.texture, (reglTexture) => {
      return pipeline.framebuffer({node: context.node(), reglTexture: reglTexture});
    });
  }

  map (value, func = ((value) => value)) {
    let context = this;

    common.checkLeafs({
      value,
      allowedTypes: [dynamic.Dynamic, execinput.ExecutionInputSubcontext],
      allowedTests: [common.vtIsFunction]
    });

    value = util.maptree({
      value,
      leafVisitor: function ({value}) {
        if (value instanceof execinput.ExecutionInputSubcontext) {
          if (context.runtime() === 'static') {
            return value.evaluate({runtime: 'static', recursive: true, resolve: false});
          } else if (context.runtime() === 'dynamic') {
            return value.evaluate({runtime: 'dynamic', recursive: true, resolve: true});
          } else {
            assert(false);
          }
        }
        return value;
      }
    });

    common.checkLeafs({
      value,
      allowedTypes: [dynamic.Dynamic],
      allowedTests: [common.vtIsFunction]
    });

    // now run the transform function on the result
    if (common.vtIsDynamic({value, recursive: true})) {
      return function () {
        let result = util.maptree({
          value,
          leafVisitor: function ({value}) {
            if (value instanceof dynamic.Dynamic) {
              return value.evaluate();
            }

            if (common.vtIsFunction({value})) {
              return value();
            }

            return value;
          }
        });

        common.checkLeafs({
          value: result,
          allowedTypes: [],
          allowedTests: []
        });

        result = func(result);
        return result;
      };
    } else {
      value = func(value);
      return value;
    }
  }

  resolve (value, missing = util.NOVALUE) {
    let context = this;

    common.checkLeafs({value,
      allowedTypes: [execinput.ExecutionInputSubcontext, dynamic.Dynamic],
      allowedTests: [common.vtIsFunction]});

    class THISNOVALUET {

    }
    let THISNOVALUE = new THISNOVALUET();

    value = util.maptree({
      value,
      leafVisitor: function ({value}) {
        if (value instanceof execinput.ExecutionInputSubcontext) {
          // TODO: turn this into an exception
          // english: you can only "resolve" things with this context that belong to this context.
          assert(value.executionContext === context.__unbox__());

          return context.resolveSubcontext(value, THISNOVALUE);
        }

        return value;
      }
    });

    if (util.mapsearch({value, needle: THISNOVALUE})) {
      if (missing !== util.NOVALUE) {
        return missing;
      }

      throw new common.PipelineError('Cannot resolve value, it doesn\'t exist or has something dynamic');
    }

    common.checkLeafs({value,
      allowedTypes: [dynamic.Dynamic],
      allowedTests: [common.vtIsFunction]});

    value = util.maptree({
      value,
      leafVisitor: function ({value}) {
        if (common.vtIsFunction({value})) {
          return value();
        }

        if (value instanceof dynamic.Dynamic) {
          return value.evaluate();
        }
        return value;
      }
    });
    
    common.checkLeafs({value, allowedTypes: []});

    return value;
  }

  resolveSubcontext (inputSubcontext, missing = util.NOVALUE) {
    let {ExecutionInputSubcontext} = execinput;
    assert(inputSubcontext instanceof ExecutionInputSubcontext);
    assert(this.runtime() === 'static' || this.runtime() === 'dynamic');

    inputSubcontext = inputSubcontext.__unbox__();

    let value = inputSubcontext.evaluate({runtime: this.runtime(), recursive: true, resolve: true, missing});

    common.checkLeafs({value, allowedTypes: []});

    return value;
  }

  shallow (inputSubcontext, defaultValue = util.NOVALUE) {
    let {pipeline} = this;

    let {ExecutionInputSubcontext} = execinput;
    assert(inputSubcontext instanceof ExecutionInputSubcontext);
    assert(this.runtime() === 'static' || this.runtime() === 'dynamic');

    let context = this;

    if (defaultValue !== util.NOVALUE && !context.available(inputSubcontext)) {
      if (context.dynamicallyAvailable(inputSubcontext)) {
        throw new pipeline.PipelineError('context.shallow(thing) but thing is not static');
      }

      return defaultValue;
    }

    inputSubcontext = inputSubcontext.__unbox__();
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

    return inputSubcontext.available({runtime: this.runtime(), terminalDynamic: false});
  }

  dynamicallyAvailable (inputSubcontext) {
    let {ExecutionInputSubcontext} = execinput;
    assert(inputSubcontext instanceof ExecutionInputSubcontext);
    assert(this.runtime() === 'static' || this.runtime() === 'dynamic');

    inputSubcontext = inputSubcontext.__unbox__();

    return inputSubcontext.available({runtime: this.runtime(), terminalDynamic: true});
  }

  texture ({cascade}) {
    let context = this;
    let {pipeline} = this;

    let template = {};

    for (let sheet of cascade) {
      template = _.merge(template, sheet);
    }

    // if ('regl' in template) {
    //   delete template.regl;
    // }

    if (template.regl === undefined ||
        !common.vtIsReglValue({value: template.regl.texture})) {
      template.regl = {
        texture: pipeline.texture({template, node: context.node()})
      };
    }

    assert(common.texture.template.invalid({template, raise: true}).length === 0);

    return template;
  }

  out ({inTex, outTex, missing = common.texture.template.base, clone = false}) {
    assert(inTex instanceof execinput.ExecutionInputSubcontext);
    assert(outTex instanceof execinput.ExecutionInputSubcontext);

    let context = this;
    let {pipeline} = this;

    inTex = context.shallow(inTex, missing);

    let template = {
      type: inTex.type,
      format: inTex.format,
      min: inTex.min,
      mag: inTex.mag,
      wrapT: inTex.wrapT,
      wrapS: inTex.wrapS,
      mipmap: inTex.mipmap,
      resolution: inTex.resolution,
      viewport: inTex.viewport
    };

    if (!clone && context.dynamicallyAvailable(outTex.regl.texture)) {
      return context.shallow(outTex);
    }

    if (!context.available(outTex)) {
      template.regl = {
        texture: pipeline.texture({template, node: context.node()})
      };

      return template;
    }

    outTex = context.shallow(outTex);

    template = _.merge(template, outTex);

    // for (let key of Object.keys(outTex)) {
    //   template[key] = _.merge(template[key], outTex[key]);
    // }

    assert(common.texture.template.invalid({template, raise: true}).length === 0);

    template.regl = {
      texture: pipeline.texture({template, node: context.node()})
    };

    return template;
  }
}

module.exports.ExecutionContext = ExecutionContext;
