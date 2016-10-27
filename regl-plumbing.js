
module.exports = {};

const canonicalJSON = require('canonical-json');
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

    if (snode.context !== null) {
      snode.component.destroy({context});
    }

    let context = new Proxy(new execution.ExecutionContext({pipeline, nodeInputContext: snode.i, runtime: 'static'}),
                                           util.accessHandler);

    snode.context = context;

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

class TextureManager {
  constructor ({pipeline}) {
    this.pipeline = pipeline;

    // template => [reglTexture]
    this.free = new Map();

    // node => {reglTexture => template}
    this.owned = new Map();

    Object.freeze(this);
  }

  key ({template}) {
    // TODO: strip viewport
    return canonicalJSON(template);
  }

  get ({template, node}) {
    let {pipeline} = this;
    let key = this.key({template});

    if (!this.free.has(key)) {
      this.free.set(key, []);
    }

    if (!this.owned.has(node)) {
      this.owned.set(node, new Map());
    }

    let frees = this.free.get(key);

    let reglTexture = null;
    if (frees.length > 0) {
      reglTexture = frees.pop();
    } else {
      reglTexture = pipeline.regl.texture({
        format: template.format,
        type: template.type,
        width: template.resolution.wh[0],
        height: template.resolution.wh[1],
        min: template.min,
        mag: template.mag,
        wrapT: template.wrapT,
        wrapS: template.wrapS,
        mipmap: template.mipmap
      });
    }

    this.owned.get(node).set(reglTexture, template);

    return reglTexture;
  }

  releaseNode ({node}) {
    if (!this.owned.has(node)) {
      return;
    }

    for (let reglTexture of this.owned.get(node)) {
      this.release({node, reglTexture});
    }
  }

  release ({node, reglTexture = null}) {
    assert(this.owned.has(node));
    assert(this.owned.get(node).has(reglTexture));

    let template = this.owned.get(node).get(reglTexture);
    let key = this.key({template});

    if (!this.free.has(key)) {
      this.free.set(key, []);
    }

    this.free.get(key).push(reglTexture);
    this.owned.get(node).delete(reglTexture);
  }
}

class FBOManager {
  constructor ({pipeline}) {
    this.pipeline = pipeline;

    // [reglTexture]
    this.free = [];

    // node => {reglTexture}
    this.owned = new Map();

    Object.freeze(this);
  }

  get ({reglTexture, node}) {
    if (!this.owned.has(node)) {
      this.owned.set(node, new Set());
    }

    let fbo = null;
    if (this.free.length > 0) {
      fbo = this.free.pop();
      fbo({color: reglTexture, depth: false, stencil: false});
    } else {
      fbo = this.pipeline.regl.framebuffer({
        color: reglTexture,
        depth: false,
        stencil: false
      });
    }

    this.owned.get(node).add(fbo);

    return fbo;
  }

  release ({fbo, node}) {
    assert(this.owned.has(node));
    assert(this.owned.get(node).has(fbo));

    this.free.push(fbo);
    this.owned.get(node).delete(fbo);
  }

  releaseNode ({node}) {
    if (!this.owned.has(node)) {
      return;
    }

    for (let fbo of this.owned.get(node)) {
      this.release({fbo, node});
    }
  }
}

class Pipeline extends EventEmitter {
  constructor ({regl, resl}) {
    super();
    this.regl = regl;
    this.resl = resl;

    this.PipelineError = common.PipelineError;

    this._components = new Map();

    // fundamental "meta" components
    this._components.set('unroller', require('./components/unroller.js'));
    this._components.set('switch', require('./components/switch.js'));
    this._components.set('fcomponent', require('./components/fcomponent.js'));
    this._components.set('pass', require('./components/pass.js'));

    // core components
    this._components.set('shadertoy', require('./components/shadertoy.js'));
    this._components.set('framebuffer', require('./components/framebuffer.js'));
    this._components.set('texture', require('./components/texture.js'));
    this._components.set('resl-texture', require('./components/resl-texture.js'));
    this._components.set('canvas', require('./components/canvas.js'));

    // other components
    this._components.set('mts-scramble', require('./components/mts-scramble.js'));
    this._components.set('degamma', require('./components/degamma.js'));
    this._components.set('regamma', require('./components/regamma.js'));
    this._components.set('sat-pass', require('./components/sat-pass.js'));
    this._components.set('sat', require('./components/sat.js'));
    this._components.set('box-blur-adv', require('./components/box-blur-adv.js'));
    this._components.set('gaussian-blur-adv', require('./components/gaussian-blur-adv.js'));
    this._components.set('gaussian-blur-sep-pass', require('./components/gaussian-blur-sep-pass.js'));
    this._components.set('gaussian-blur-sep', require('./components/gaussian-blur-sep.js'));
    this._components.set('numerify', require('./components/numerify.js'));
    this._components.set('delta', require('./components/delta.js'));
    this._components.set('normalize', require('./components/normalize.js'));

    this._textureMgr = new TextureManager({pipeline: this});
    this._fboMgr = new FBOManager({pipeline: this});
    Object.freeze(this);
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

  // allocates a regl texture for specified node
  texture ({template, node}) {
    this._textureMgr.releaseNode({node});
    return this._textureMgr.get({node, template});
  }

  framebuffer ({reglTexture, node}) {
    this._fboMgr.releaseNode({node});
    return this._fboMgr.get({reglTexture, node});
  }
}

module.exports.Pipeline = Pipeline;
module.exports.PipelineError = common.PipelineError;
module.exports.private = {SugarNode};
