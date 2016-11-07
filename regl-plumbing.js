
module.exports = {};

const canonicalJSON = require('canonical-json');
const assert = require('assert');
const util = require('./regl-plumbing-util.js');
const common = require('./regl-plumbing-common.js');
const nodeinput = require('./regl-plumbing-nodeinput.js');
const nodeoutput = require('./regl-plumbing-nodeoutput.js');
const execution = require('./regl-plumbing-execution.js');
const execinput = require('./regl-plumbing-execinput.js');
const dynamic = require('./regl-plumbing-dynamic.js');
const {Component, Group} = require('./regl-plumbing-component.js');

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

    if (snode.context !== null) {
      snode.component.destroy({context: snode.context});
    }

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
  compile ({recursive, sync = false}) {
    assert(recursive === true || recursive === false);
    assert(sync === true || sync === false);
    let snode = this;
    let {pipeline} = snode;

    if (recursive) {
      let nodes = Array.from(ordering(snode));

      nodes.forEach((node) => { node.clearCompile(); });
      nodes.forEach((node) => { node.compiling = true; });

      let jobs = nodes.map(function (node) {
        let job = () => node.compile({recursive: false, sync});
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

    snode.context = context;

    function finished (out) {
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

    if (sync && result instanceof Promise) {
      throw new common.PipelineError(`Component ${snode.component.name()} is compile async, but this node was requested to compile sync; you cannot compile this node as sync`);
    }

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

  /**
   * Execute this node. Note that the node must be properly compiled first.
   *
   * @param recursive  If true, execute this node and all dependent nodes in proper order.
   *                   Note that all dependent nodes must have been properly compiled, or this
   *                   will throw an error.
   *                   If false, only execute this node.
   * @param sync       If true, ensures that this execute() function returns only after
   *                   execution is complete and will not return a Promise.
   *                   If false, then `execute()` may return a Promise.
   *
   *
   * @see SugarNode.compile()
   */
  execute ({recursive, sync = false}) {
    assert(recursive === true || recursive === false);
    assert(sync === true || sync === false);
    let snode = this;

    if (recursive) {
      // collect all the necessary (dependent) nodes
      let nodes = Array.from(ordering(snode));

      // nodes.forEach((node) => {node.clearExecute()});

      // mark all relevant nodes as executing before we even begin
      nodes.forEach((node) => { node.executing = true; });

      // put all the nodes into a job queue to be executed.
      // this hairbrained convoluted thing is required just in case one of the `execute()`
      // calls returns a Promise, and this is the only way to execute promises in order.
      let jobs = nodes.map(function (node) {
        let job = () => node.execute({recursive: false, sync});
        return job;
      });

      // execute the list of jobs in order, whether they are sync or async.
      let result = util.allSync(jobs);

      // return any resulting promise
      return result;
    }

    // console.log(`executing ${snode.component.name()}`);

    if (!(snode.isCompiled())) {
      throw new common.PipelineError('You must compile this component first before executing it');
    }

    // mark the node as executing, if it isn't already marked as such
    snode.executing = true;

    // put the execution context in dynamic mode
    snode.context.__unbox__().runtime('dynamic');

    // make sure the dynamic inputs are available to the execution by (re)evaluating them
    snode.i.__unbox__().compute({runtime: 'dynamic'});

    // console.log('dynamic value:', snode.i.__unbox__().getValue({runtime: 'dynamic'}));

    let result = snode.component.execute({context: this.context});

    if (sync && result instanceof Promise) {
      throw new common.PipelineError(`Component ${snode.component.name()} is executing async, but this node was requested to run sync; you cannot run this node as sync`);
    }

    function complete () {
      // after execution, (re)evaluate the dynamic outputs
      snode.o.__unbox__().compute({runtime: 'dynamic'});

      // console.log('dynamic out value:', snode.o.__unbox__().getValue({runtime: 'dynamic'}));

      // make the node as execution complete
      snode.executing = false;
    }

    if (result instanceof Promise) {
      // `Component.execute()` doesn't return anything useful, but it might return a promise;
      // if so we'll return that here so it can be chained properly.
      return result.then(complete);
    } else {
      complete();
    }
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
    assert(common.texture.template.invalid({template, raise: true}).length === 0);

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
    // this.addComponent('unroller', require('./components/unroller.js'));
    // this.addComponent('switch', require('./components/switch.js'));
    this.addComponent('fcomponent', require('./components/fcomponent.js'));
    this.addComponent('pass', require('./components/pass.js'));

    // core components
    this.addComponent('shadertoy', require('./components/shadertoy.js'));
    this.addComponent('framebuffer', require('./components/framebuffer.js'));
    this.addComponent('texture', require('./components/texture.js'));
    this.addComponent('resl-texture', require('./components/resl-texture.js'));
    this.addComponent('canvas', require('./components/canvas.js'));

    // other components
    this.addComponent('mts-scramble', require('./components/mts-scramble.js'));
    this.addComponent('degamma', require('./components/degamma.js'));
    this.addComponent('regamma', require('./components/regamma.js'));
    this.addComponent('sat-pass', require('./components/sat-pass.js'));
    this.addComponent('sat', require('./components/sat.js'));
    this.addComponent('box-blur-adv', require('./components/box-blur-adv.js'));
    this.addComponent('gaussian-blur-adv', require('./components/gaussian-blur-adv.js'));
    this.addComponent('gaussian-blur-sep-pass', require('./components/gaussian-blur-sep-pass.js'));
    this.addComponent('gaussian-blur-sep', require('./components/gaussian-blur-sep.js'));
    this.addComponent('numerify', require('./components/numerify.js'));
    this.addComponent('delta', require('./components/delta.js'));
    this.addComponent('normalize', require('./components/normalize.js'));
    this.addComponent('constant', require('./components/constant.js'));

    this._textureMgr = new TextureManager({pipeline: this});
    this._fboMgr = new FBOManager({pipeline: this});
    Object.freeze(this);
  }

  addComponent (id, ctor) {
    if (this._components.has(id)) {
      throw new common.PipelineError(`Cannot add component with id "${id}", a component with that id already exists`);
    }

    this._components.set(id, ctor);
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
module.exports.Component = Component;
module.exports.Group = Group;
