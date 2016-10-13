
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

function computeDigraph (node0) {
  let digraph = {
    ins: new Map(),
    outs: new Map(),
    nodes: new Set()
  };

  function addNode (node) {
    if (!digraph.nodes.has(node)) {
      digraph.nodes.add(node);
      digraph.ins.set(node, new Set());
      digraph.outs.set(node, new Set());
    }
  }

  addNode(node0);
  let tovisit = [node0];
  let seen = new Set([node0]);

  while (tovisit.length > 0) {
    let node = tovisit.pop();
    assert(digraph.nodes.has(node));

    let parents = node.inSNodes();

    parents.forEach((pnode) => addNode(pnode));

    let ins = digraph.ins.get(node);
    parents.forEach((pnode) => {
      ins.add(pnode);
      digraph.outs.get(pnode).add(node);
    });

    let newNodes = parents.filter((pnode) => !seen.has(pnode));

    newNodes.forEach((pnode) => tovisit.push(pnode));
  }

  return digraph;
}

function * ordering (node0) {
  assert(node0 instanceof SugarNode);

  // let digraph0 = computeDigraph(node0);
  let digraph = computeDigraph(node0);

  let rootsSet = new Set(Array.from(digraph.nodes).filter((node) => digraph.ins.get(node).size === 0));
  let roots = Array.from(rootsSet);
  let seen = new Set(roots);

  while (roots.length > 0) {
    let current = roots.pop();
    rootsSet.delete(current);

    // this is a current root, so it should have no dependents
    assert(digraph.ins.get(current).size === 0);

    yield current;

    let outs = Array.from(digraph.outs.get(current));

    // remove the forward edges
    digraph.outs.get(current).clear();

    for (let child of outs) {
      seen.add(child);

      // remove the back edge
      digraph.ins.get(child).delete(current);

      if (digraph.ins.get(child).size === 0) {
        roots.push(child);
        rootsSet.add(child);
      }
    }
  }

  for (let node of digraph.nodes) {
    assert(digraph.ins.get(node).size === 0);
    assert(digraph.outs.get(node).size === 0);
  }
}

class SugarNode {
  constructor ({pipeline, component}) {
    this.pipeline = pipeline;
    this.component = component;
    this.cached = {};
    this.compiling = false;
    this.executing = false;
    this.i = new Proxy(new nodeinput.NodeInputContext({pipeline, node: this.__box__()}), util.accessHandler);
    this.o = new Proxy(new nodeoutput.NodeOutputContext({pipeline, node: this.__box__()}), util.accessHandler);

    this.context = null;

    this._dirty = true;

    Object.seal(this);
  }

  __box__ () {
    return new Proxy(this, util.accessHandler);
  }

  get dirty () {
    assert(this._dirty === true || this._dirty === false);
    return this._dirty;
  }

  set dirty (color) {
    this._dirty = color;
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

  clearCompile () {
    let snode = this;

    _.unset(snode.cached, 'out');

    snode.compiling = false;
    snode.context = null;
    snode._dirty = true;
  }

  /**
   * Compile the node.

   * Values can be specified via the `SugarNode.i.value = ...` syntax.
   *
   *
   * To set dynamic values, you can do something like:
   * `let myDynamicValue = pipeline.dynamic(50);` then `SugarNode.i.value = myDynamicValue;`,
   * then `SugarNode.compile({...})`, later updating `myDynamicValue`
   * with `myDynamicValue.update(51)`, and updating each frame as necessary.
   *
   * Alternatively, `let myDynamicValue = 50; SugarNode.i.value = () => myDynamicValue;`,
   * then `SugarNode.compile({...})`, later updating `myDynamicValue`
   * with `myDynamicValue = 51`, and updating each frame as necessary.
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
   * * `let theDynamicTexture = pipeline.dynamic(myreglTexture);`
   * * `b.i = {texture: theDynamicTexture};`
   * * `b.i.texture = theDynamicTexture;`
   * * `b.i.texture = function() { return myreglTexture; };`
   * * `b.i.texture = () => a.o.texture;`
   * * `b.i({texture: theDynamicTexture});`
   * * `...`
   * * `b.compile();`
   *
   * Note that not all arguments are allowed to be dynamic; it depends on the component.
   *
   * If an argument is not available at compile time,
   * and the component resolves it at compile time, then it will throw an error.
   */
  compile ({recursive}) {
    assert(recursive === true || recursive === false);
    let snode = this;
    let {pipeline} = snode;

    if (recursive) {
      let nodes = Array.from(ordering(snode));

      nodes.forEach((node) => { node.clearCompile(); });
      nodes.forEach((node) => { node.compiling = true; });

      let jobs = nodes.map(function (node) {
        let job = () => node.compile({recursive: false});
        return job;
      });
      return util.allSync(jobs);
    }

    assert(Object.isFrozen(snode.component));

    snode.clearCompile();
    snode.compiling = true;

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
        allowedTypes: [execinput.ExecutionInputSubcontext],
        allowedTests: [common.vtIsFunction]
      });

      function prep ({value}) {
        value = util.maptree({
          value,
          leafVisitor: function ({value}) {
            if (value instanceof execinput.ExecutionInputSubcontext) {
              return common.vtEvaluatePlaceHolder({value, runtime: 'static', recursive: true, resolve: false});
            }

            return value;
          }
        });
        value = util.maptree({
          value,
          leafVisitor: function ({value}) {
            if (common.vtIsFunction({value})) {
              return new dynamic.Dynamic({func: value});
            }

            return value;
          }
        });
        return value;
      }

      out = prep({value: out});

      common.checkLeafs({
        value: out,
        allowedTypes: [dynamic.Dynamic],
        allowedTests: []
      });

      snode.o.__unbox__().setValue(out);
      snode.o.__unbox__().compute({runtime: 'static'});

      snode.compiling = false;
      snode._dirty = false;
      snode.pipeline.emit('node-compiled', {snode: snode});
      assert(snode.isCompiled());
    }

    let result = snode.component.compile({context});
    if (result instanceof Promise) {
      return result.then(function (out) {
        return finished(out);
      });
    }
    return finished(result);
  }

  isCompiled () {
    let snode = this;
    return snode.compiling === false && snode.context instanceof execution.ExecutionContext;
  }

  execute ({recursive}) {
    assert(recursive === true || recursive === false);
    let snode = this;

    if (recursive) {
      let nodes = Array.from(ordering(snode));

      // nodes.forEach((node) => {node.clearExecute()});
      nodes.forEach((node) => { node.executing = true; });

      let jobs = nodes.map(function (node) {
        let job = () => node.execute({recursive: false});
        return job;
      });
      let result = util.allSync(jobs);
      return result;
    }

    if (!(snode.isCompiled())) {
      throw new common.PipelineError('You must compile this component first before executing it');
    }

    snode.context.__unbox__().runtime('dynamic');
    snode.i.__unbox__().compute({runtime: 'dynamic'});

    snode.component.execute({context: this.context});

    snode.o.__unbox__().compute({runtime: 'dynamic'});
    snode.executing = false;
  }
}

class Pipeline extends EventEmitter {
  constructor ({regl, resl}) {
    super();
    this.regl = regl;
    this.resl = resl;

    this._components = new Map();
    this._components.set('fcomponent', require('./components/fcomponent.js'));
    this._components.set('resl-texture', require('./components/resl-texture.js'));
    this._components.set('texture', require('./components/texture.js'));
    this._components.set('framebuffer', require('./components/framebuffer.js'));
    this._components.set('shadertoy', require('./components/shadertoy.js'));
    this._components.set('mts-scramble', require('./components/mts-scramble.js'));
    this._components.set('canvas', require('./components/canvas.js'));
    this._components.set('pass', require('./components/pass.js'));
    this._components.set('degamma', require('./components/degamma.js'));
    this._components.set('regamma', require('./components/regamma.js'));
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

  dynamic (value) {
    return new dynamic.Dynamic({value: value});
  }

  func (f) {
    return common.func(f);
  }
}

module.exports.Pipeline = Pipeline;
module.exports.PipelineError = common.PipelineError;
module.exports.private = {SugarNode};
