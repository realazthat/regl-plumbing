
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
  }

  static init ({pipeline, runtime, nodeInputContext}) {
    let ec = new ExecutionContext({pipeline, runtime, nodeInputContext});
    let proxy = new Proxy(ec, util.accessHandler);

    ec.proxy = proxy;
    ec.nodeInputContext = ec.nodeInputContext.__box__();
    ec.i = execinput.ExecutionInputSubcontext.init({pipeline,
                                                    executionContext: proxy,
                                                    nodeInputContext: ec.nodeInputContext,
                                                    path: []});

    // this.o = new Proxy(new execoutput.ExecutionOutputSubcontext({pipeline, executionContext: this, path: []}), util.accessHandler);
    ec.data = {};

    Object.seal(ec);

    assert(ec.runtime() === 'static' || ec.runtime() === 'dynamic');
    assert(ec.nodeInputContext instanceof nodeinput.NodeInputContext);
    return proxy;
  }

  __box__ () {
    return util.__box__.apply(this);
  }

  __unbox__ () {
    return util.__unbox__.apply(this);
  }

  saveState () {
    let rthis = this.__unbox__();

    let {pipeline} = rthis;
    let {msgpack} = pipeline;

    let state = {};

    state._runtime = rthis._runtime;
    state.data = rthis.data;

    ({value: state} = msgpack.wrap({value: state, raise: true}));

    return msgpack.encode(state);
  }

  loadState ({buffer}) {
    let rthis = this.__unbox__();

    let {pipeline} = rthis;
    let {msgpack} = pipeline;

    let state = msgpack.decode(buffer);

    // TODO: turn this into an exception
    assert(state._runtime === 'static' || state._runtime === 'dynamic');

    rthis._runtime = state._runtime;
    rthis.data = state.data;
  }

  runtime (runtime = util.NOVALUE) {
    let rthis = this.__unbox__();

    if (runtime !== util.NOVALUE) {
      assert(runtime === 'static' || runtime === 'dynamic');

      rthis._runtime = runtime;

      return rthis._runtime;
    }

    assert(rthis._runtime === 'static' || rthis._runtime === 'dynamic');

    return rthis._runtime;
  }

  __setitem__ (subscript, value) {
    let rthis = this.__unbox__();
    if (subscript === 'i') {
      rthis.i.setValue(value);
      return true;
    }

    if (subscript === 'o') {
      rthis.o.setValue(value);
      return true;
    }

    return false;
  }

  node () {
    let rthis = this.__unbox__();
    return rthis.nodeInputContext.__unbox__().node();
  }

  framebuffer (outTex) {
    let rthis = this.__unbox__();
    let {pipeline} = rthis;
    let context = rthis;

    return context.map(outTex.regl.texture, (reglTexture) => {
      return pipeline.framebuffer({node: context.node(), reglTexture: reglTexture});
    });
  }

  map (value, func = ((value) => value)) {
    let rthis = this.__unbox__();
    let context = rthis;

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
            return value.__unbox__().evaluate({runtime: 'static', recursive: true, resolve: false});
          } else if (context.runtime() === 'dynamic') {
            return value.__unbox__().evaluate({runtime: 'dynamic', recursive: true, resolve: true});
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
    let rthis = this.__unbox__();
    let context = rthis;

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
          assert(value.__unbox__().executionContext === context.__box__());

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
    let rthis = this.__unbox__();
    let {ExecutionInputSubcontext} = execinput;
    assert(inputSubcontext instanceof ExecutionInputSubcontext);
    assert(rthis.runtime() === 'static' || rthis.runtime() === 'dynamic');

    inputSubcontext = inputSubcontext.__unbox__();

    let value = inputSubcontext.evaluate({runtime: rthis.runtime(), recursive: true, resolve: true, missing});

    common.checkLeafs({value, allowedTypes: []});

    return value;
  }

  shallow (inputSubcontext, defaultValue = util.NOVALUE) {
    let rthis = this.__unbox__();
    let {pipeline} = rthis;

    let {ExecutionInputSubcontext} = execinput;
    assert(inputSubcontext instanceof ExecutionInputSubcontext);
    assert(rthis.runtime() === 'static' || rthis.runtime() === 'dynamic');

    let context = rthis;

    if (defaultValue !== util.NOVALUE && !context.available(inputSubcontext)) {
      if (context.dynamicallyAvailable(inputSubcontext)) {
        throw new pipeline.PipelineError('context.shallow(thing) but thing is not static');
      }

      return defaultValue;
    }

    inputSubcontext = inputSubcontext.__unbox__();
    let value = inputSubcontext.evaluate({runtime: rthis.runtime(), recursive: false, resolve: true});

    common.checkLeafs({
      value,
      allowedTypes: [],
      allowedTests: [common.vtIsFunction]
    });

    return value;
  }

  available (inputSubcontext) {
    let rthis = this.__unbox__();
    let {ExecutionInputSubcontext} = execinput;
    assert(inputSubcontext instanceof ExecutionInputSubcontext);
    assert(rthis.runtime() === 'static' || rthis.runtime() === 'dynamic');

    inputSubcontext = inputSubcontext.__unbox__();

    return inputSubcontext.available({runtime: rthis.runtime(), terminalDynamic: false});
  }

  dynamicallyAvailable (inputSubcontext) {
    let rthis = this.__unbox__();
    let {ExecutionInputSubcontext} = execinput;
    assert(inputSubcontext instanceof ExecutionInputSubcontext);
    assert(rthis.runtime() === 'static' || rthis.runtime() === 'dynamic');

    inputSubcontext = inputSubcontext.__unbox__();

    return inputSubcontext.available({runtime: rthis.runtime(), terminalDynamic: true});
  }

  texture ({cascade}) {
    let rthis = this.__unbox__();
    let context = rthis;
    let {pipeline} = rthis;

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

    common.texture.template.invalid({template, raise: true});

    return template;
  }

  out ({inTex, outTex, missing = common.texture.template.base, clone = false}) {
    let rthis = this.__unbox__();
    assert(inTex instanceof execinput.ExecutionInputSubcontext);
    assert(outTex instanceof execinput.ExecutionInputSubcontext);

    let context = rthis;
    let {pipeline} = rthis;

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

    common.texture.template.invalid({template, raise: true});

    template.regl = {
      texture: pipeline.texture({template, node: context.node()})
    };

    return template;
  }
}

module.exports.ExecutionContext = ExecutionContext;
