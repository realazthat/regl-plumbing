
module.exports = {};

const _ = require('lodash');
const assert = require('assert');
const util = require('./regl-plumbing-util.js');
const common = require('./regl-plumbing-common.js');
const nodeinput = require('./regl-plumbing-nodeinput.js');
const nodeoutput = require('./regl-plumbing-nodeoutput.js');
const execution = require('./regl-plumbing-execution.js');
const execinput = require('./regl-plumbing-execinput.js');
const dynamic = require('./regl-plumbing-dynamic.js');

const EventEmitter = require('events');

class SugarNode {
  constructor ({pipeline, component}) {
    this.pipeline = pipeline;
    this.component = component;
    this.cached = {};
    this.compiling = false;
    this.i = new Proxy(new nodeinput.NodeInputContext({pipeline, node: this}), util.accessHandler);
    this.o = new Proxy(new nodeoutput.NodeOutputContext({pipeline}), util.accessHandler);

    this.context = null;
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

    if (subscript in this) {
      this[subscript] = value;
      return true;
    }

    throw new common.PipelineError('No one gave you permission to call `SugarNode.something = value`');
  }

  inSNodes () {
    return this.i.__unbox__().computeInSNodes();
  }

  /**
   * Compile the node, with arguments specified with `args`.
   *
   * `args` should be a dictionary of values.

   * Values can also be specified via the `SugarNode.i.value = ...` syntax.
   *
   * Using compile adds to and overrides those values.
   *
   * Values needing to be set dynamically at runtime should
   * be specified with `SugarNode.execute({key: value ...})` call.
   *
   * Alternatively, you can specify dynamic runtime arguments by calling
   * `SugarNode.compile()` with a dictionary like `{key: function() { return 50; })}`;
   * functions are automatically dynamic. Another way is to do something like:
   * `let myDynamicValue = pipeline.dynamic({func: function() { return 50; })});` and
   * then `SugarNode.compile({key: myDynamicValue})`, later updating `myDynamicValue`
   * with `myDynamicValue.setValue(50)`, and updating each frame as necessary.
   *
   * You can also use another node's output arguments as the input values.
   * So for example if you have node `a` and want to use `a.o.texture` as the
   * input a second node, `b`, you can do `b.i.texture = a.o.texture`. This will
   * be static or dynamic, depending on the output of `a.o.texture`. Other ways
   * of writing the same thing:
   *
   * * `b.i = {texture: a.o.texture};`
   * * `b.i.texture = a.o.texture;`
   * * `b.i({texture: a.o.texture});`
   * * `b.compile({texture: a.o.texture});`
   *
   * To force it to be dynamic:
   *
   * * `let theDynamicTexture = pipeline.dynamic({value: a.o.texture});`
   * * `b.i = {texture: theDynamicTexture};`
   * * `b.i.texture = theDynamicTexture;`
   * * `b.i.texture = function() { return a.o.texture; };`
   * * `b.i.texture = () => a.o.texture;`
   * * `b.i({texture: theDynamicTexture});`
   * * `b.compile({texture: theDynamicTexture});`
   * * or don't set it via `b.i`, nor via `b.compile()` and instead set it
   *   at runtime with `execute({texture: a.resolve(a.o.texture)})`.
   *
   * Note that not all arguments are allowed to be dynamic; it depends on the component.
   *
   * If an argument is not available at compile time,
   * and the component resolves it at compile time, then it will throw an error.
   */
  compile (args = undefined) {
    assert(args === undefined);

    let snode = this;
    let {pipeline} = snode;

    _.unset(snode.cached, 'out');

    snode.compiling = true;

    // snode.i(args);
    let i = snode.i.__unbox__();
    i.compute({runtime: 'static'});

    let context = new Proxy(new execution.ExecutionContext({pipeline, nodeInputContext: snode.i, runtime: 'static'}),
                                           util.accessHandler);
    // this.__unbox__().context = context;
    this.context = context;

    function finished (out) {
      _.set(snode.cached, 'out', out);

      common.checkLeafs({
        value: out,
        allowedTypes: [dynamic.Dynamic, execinput.ExecutionInputSubcontext],
        allowedTests: [({value}) => common.vtIsFunction({value})]
      });

      out = util.maptree({
        value: out,
        leafVisitor: function ({value}) {
          if (common.vtIsFunction({value})) {
            return new dynamic.Dynamic({func: value});
          }

          if (value instanceof execinput.ExecutionInputSubcontext) {
            return common.vtEvaluatePlaceHolder({value, runtime: 'static', recursive: true, resolve: false});
          }

          return value;
        }
      });

      common.checkLeafs({
        value: out,
        allowedTypes: [dynamic.Dynamic]
      });

      console.log('snode.component:', snode.component);
      console.log('snode.i:', snode.i);
      console.log('out:', out);
      snode.o.__unbox__().setValue(out);
      snode.o.__unbox__().compute({runtime: 'static'});

      snode.compiling = false;
      snode.pipeline.emit('node-compiled', {snode: snode});
    }

    let result = snode.component.compile({context});
    if (result instanceof Promise) {
      return result.then(function (out) {
        finished(out);
      });
    }
    finished(result);
  }

  execute (args = {}) {
    let snode = this;

    if (!_.has(snode.cached, 'out')) {
      throw new common.PipelineError('You must compile this component first before executing it');
    }

    snode.context.__unbox__().runtime = 'dynamic';
    snode.i.__unbox__().compute({runtime: 'dynamic'});

    snode.component.execute({context: this.context});

    snode.o.__unbox__().compute({runtime: 'dynamic'});
  }
}

class Pipeline extends EventEmitter {
  constructor ({regl, resl}) {
    super();
    this.regl = regl;
    this.resl = resl;

    this._components = new Map();
    this._components.set('resl-texture', require('./components/resl-texture.js'));
    this._components.set('texture', require('./components/texture.js'));
    this._components.set('framebuffer', require('./components/framebuffer.js'));
    this._components.set('shadertoy', require('./components/shadertoy.js'));
    this._components.set('mts-scramble', require('./components/mts-scramble.js'));
    this._components.set('canvas', require('./components/canvas.js'));
    this._components.set('pass', require('./components/pass.js'));
  }

  /**
   * Creates and returns a node with the specified `component`.
   * Returns a value representing a node, of type of `SugarNode`.
   */
  n (component) {
    let pipeline = this;

    if (!pipeline._components.has(component)) {
      throw new common.PipelineError(`No such component ${JSON.stringify(component)}`);
    }

    const ComponentClass = pipeline._components.get(component);
    return new Proxy(new SugarNode({pipeline, component: new ComponentClass({pipeline})}), util.accessHandler);
  }
}

module.exports.Pipeline = Pipeline;
module.exports.PipelineError = common.PipelineError;
module.exports.private = {SugarNode};
