
module.exports = {};

const assert = require('assert');
const Type = require('type-of-is');
const _ = require('lodash');
const common = require('./regl-plumbing-common.js');
const main = require('./regl-plumbing.js');
const util = require('./regl-plumbing-util.js');
const clone = require('clone');

const nodeoutput = require('./regl-plumbing-nodeoutput.js');
const dynamic = require('./regl-plumbing-dynamic.js');

/**
 * Set by: user to constant.
 * Set by: user to function.
 * Set by: user to Dynamic.
 * Set by: user to NoteOutputContext.
 * Evaluated by: internal.
 */
class NodeInputContext extends Function {
  constructor ({pipeline, node, rootNode = null, path = []}) {
    assert(pipeline !== undefined);
    assert(node instanceof main.private.SugarNode);
    assert(rootNode === null || (rootNode instanceof NodeInputContext));

    super();
    this.pipeline = pipeline;
    this._path = clone(path);
    this._node = node;
    this._root = (rootNode === null) ? this : rootNode;

    this._injections = [];
    this._injectionsUpdated = 0;
    this._staticValueUpdated = 0;
    this._dynamicValueUpdated = 0;

    this._staticValue = {};
    this._dynamicValue = {};
  }

  static init ({pipeline, node, rootNode = null, path = []}) {
    let nic = new NodeInputContext({pipeline, node, rootNode, path});
    let proxy = new Proxy(nic, util.accessHandler);

    nic.proxy = proxy;

    nic._node = nic._node.__box__();
    nic._root = nic._root.__box__();
    assert(nic._node instanceof main.private.SugarNode);
    assert(nic._root instanceof NodeInputContext);
    assert(nic.rootNode() instanceof NodeInputContext);

    Object.seal(nic);
    return proxy;
  }

  __box__ () {
    return util.__box__.apply(this);
  }

  __unbox__ () {
    assert(!('__proxy__' in this));
    return this;
  }

  __hasitem__ (subscript) {
    return util.__hasitem__.apply(this, [subscript]);
  }

  __getitem__ (subscript) {
    let rthis = this.__unbox__();
    let {pipeline} = rthis;

    if (!rthis.__hasitem__(subscript)) {
      return undefined;
    }

    // if (rthis.hasOwnProperty(subscript) || Object.getPrototypeOf(rthis).hasOwnProperty(subscript)) {
    //   return rthis[subscript];
    // }

    let path = Array.from(rthis._path).concat([subscript]);

    return NodeInputContext.init({pipeline, node: rthis._node, rootNode: rthis.rootNode(), path});
  }

  node () {
    let rthis = this.__unbox__();
    assert(rthis._node instanceof main.private.SugarNode);
    return rthis._node;
  }

  rootNode () {
    let rthis = this.__unbox__();
    assert(rthis._root instanceof NodeInputContext);

    return rthis._root;
  }

  /**
   * Returns true if there are any `Dynamic` *function* values in the input.
   */
  hasFunctionInputs () {
    let rthis = this.__unbox__();
    return util.reducetree({
      value: rthis._injections,
      visitor: function ({value}) {
        if (value instanceof dynamic.Dynamic) {
          if (value.func) {
            return true;
          }
        }

        if (common.vtIsNode({value})) {
          for (let key of Object.keys(value)) {
            assert(value[key] === true || value[key] === false);
            if (value[key]) {
              return true;
            }
          }
        }
        return false;
      }
    });
  }

  /**
   * Returns the time of the latest change of dynamic input values.
   */
  dynamicInputValuesChanged () {
    let rthis = this.__unbox__();
    return util.reducetree({
      value: rthis._injections,
      visitor: function ({value}) {
        if (value instanceof dynamic.Dynamic) {
          return value.changed;
        }

        let result = 0;
        if (common.vtIsNode({value})) {
          for (let key of Object.keys(value)) {
            result = Math.max(result, value[key]);
          }
        }
        return result;
      }
    });
  }

  computeInSNodes () {
    let pthis = this.__box__();
    let rthis = this.__unbox__();
    assert(pthis === rthis.rootNode().__box__());
    let nodeinputcontext = rthis;

    let results = [];

    rthis._injections.forEach(function ({path, value}) {
      // sanity
      value = nodeinputcontext.checkInjectionValue(value);
      util.maptree({
        value,
        leafVisitor: function ({value}) {
          if (value instanceof nodeoutput.NodeOutputContext) {
            results.push(value.__unbox__().node());
          }
        }
      });
    });

    return results;
  }

  // check this._injections[i].value prior to insertion
  checkInjectionValueInput (value) {
    let rthis = this.__unbox__();
    common.checkLeafs({
      value,
      allowedTypes: [dynamic.Dynamic, nodeoutput.NodeOutputContext],
      allowedTests: [common.vtIsFunction]
    });

    return rthis.checkInjectionValue(value);
  }

  // check this._injections[i].value post insertion
  checkInjectionValue (value) {
    common.checkLeafs({
      value,
      allowedTypes: [dynamic.Dynamic, nodeoutput.NodeOutputContext],
      allowedTests: [common.vtIsFunction]
    });

    return value;
  }

  // check this._staticValue
  checkStaticResolvedValue (value) {
    common.checkLeafs({value, allowedTypes: [dynamic.Dynamic]});

    return value;
  }

  // check this._dynamicValue
  checkDynamicResolvedValue (value) {
    common.checkLeafs({value, allowedTypes: []});

    return value;
  }

  getValue ({runtime}) {
    let rthis = this.__unbox__();
    assert(runtime === 'static' || runtime === 'dynamic');

    return rthis.evaluate({runtime, recursive: true, resolve: false});
  }

  setValue (value) {
    let rthis = this.__unbox__();
    let {pipeline} = rthis;

    value = rthis.checkInjectionValueInput(value);

    rthis.rootNode().__unbox__()._injections.push({path: rthis._path, value});
    rthis._injectionsUpdated = pipeline.private.time();

    pipeline.emit('node-changed', {snode: rthis.node()});
    pipeline.emit('node-input-changed', {snode: rthis.node()});
  }

  __setitem__ (subscript, value) {
    let rthis = this.__unbox__();

    rthis.__getitem__(subscript).__unbox__().setValue(value);

    return true;
  }

  compute ({runtime}) {
    let pthis = this.__box__();
    let rthis = this.__unbox__();
    let {pipeline} = rthis;

    assert(runtime === 'dynamic' || runtime === 'static');
    assert(rthis.rootNode().__box__() === pthis);

    function evaloutputs ({value}) {
      if (common.vtIsValuePlaceHolder({value})) {
        value = common.vtEvaluatePlaceHolder({value, runtime, recursive: true, resolve: false, missing: common.DISCONNECTED});
        return value;
      }

      return value;
    }

    function wrapFuncs ({value}) {
      if (common.vtIsFunction({value})) {
        return new dynamic.Dynamic({func: value});
      }
      return value;
    }

    function resolveDynamics ({value}) {
      if (value instanceof dynamic.Dynamic) {
        return value.evaluate();
      }
      return value;
    }

    function injectedStuffToStaticStuff ({value}) {
      common.checkLeafs({
        value,
        allowedTypes: [dynamic.Dynamic, nodeoutput.NodeOutputContext],
        allowedTests: [common.vtIsFunction, ({value}) => value === common.DISCONNECTED]
      });

      value = util.maptree({
        value,
        leafVisitor: evaloutputs
      });

      common.checkLeafs({
        value,
        allowedTypes: [dynamic.Dynamic],
        allowedTests: [common.vtIsFunction, ({value}) => value === common.DISCONNECTED]
      });

      value = util.maptree({
        value,
        leafVisitor: wrapFuncs
      });

      common.checkLeafs({
        value,
        allowedTypes: [dynamic.Dynamic],
        allowedTests: [({value}) => value === common.DISCONNECTED]
      });

      return value;
    }

    let result;

    if (runtime === 'static') {
      // sort it shortest-to-longest
      rthis.rootNode().__unbox__()._injections.sort(function (lhs, rhs) {
        return (lhs.length - rhs.length);
      });

      let injections = rthis.rootNode().__unbox__()._injections.map(({path, value}) => {
        value = injectedStuffToStaticStuff({value});
        return {path, value};
      });

      if (injections.length === 0) {
        result = undefined;
      } else if (injections.length === 1) {
        let {path, value} = injections[0];
        if (path.length === 0) {
          result = value;
        } else {
          result = {};
          _.set(result, path, value);
        }
      } else {
        result = {};
        for (let {path, value} of injections) {
          _.set(result, path, value);
        }
      }

      // remove all DISCONNECTED stuff from the tree
      result = common.collapseDisconnecteds({value: result});

      if (result === common.DISCONNECTED) {
        result = {};
      }
    } else {
      // runtime is 'dynamic'

      result = rthis.rootNode().__unbox__()._staticValue;

      common.checkLeafs({
        value: result,
        allowedTypes: [dynamic.Dynamic],
        allowedTests: []
      });

      result = util.maptree({
        value: result,
        leafVisitor: resolveDynamics
      });

      common.checkLeafs({
        value: result,
        allowedTypes: [],
        allowedTests: []
      });

      result = rthis.checkDynamicResolvedValue(result);
    }

    if (runtime === 'static') {
      rthis.rootNode().__unbox__()._staticValue = rthis.checkStaticResolvedValue(result);
      rthis.rootNode().__unbox__()._staticValueUpdated = pipeline.private.time();
    } else if (runtime === 'dynamic') {
      rthis.rootNode().__unbox__()._dynamicValue = rthis.checkDynamicResolvedValue(result);
      rthis.rootNode().__unbox__()._dynamicValueUpdated = pipeline.private.time();
    } else {
      assert(false);
    }
  }

  available ({runtime, terminalDynamic}) {
    assert(runtime === 'dynamic' || runtime === 'static');
    assert(terminalDynamic === true || terminalDynamic === false);

    let rthis = this.__unbox__();
    let path = rthis._path;

    let nodeInputContext = rthis;

    if (runtime === 'static') {
      let value = nodeInputContext.rootNode().__unbox__()._staticValue;

      common.checkLeafs({value, allowedTypes: [dynamic.Dynamic]});

      let cur = value;

      for (let part of path) {
        if (cur instanceof dynamic.Dynamic) {
          return false;
        }

        if (!(cur instanceof Object) || !cur.hasOwnProperty(part)) {
          return false;
        }
        cur = cur[part];
      }

      common.checkLeafs({value: cur, allowedTypes: [dynamic.Dynamic]});

      if (cur instanceof dynamic.Dynamic) {
        return terminalDynamic;
      }

      return true;
    } else if (runtime === 'dynamic') {
      let value = nodeInputContext.rootNode().__unbox__()._dynamicValue;

      common.checkLeafs({value, allowedTypes: []});

      let cur = value;

      for (let part of path) {
        // the _dynamicValue tree shouldn't have any dynamics left, they
        // should have been evaluated, thats the point of the _dynamicValue.
        assert(!(cur instanceof dynamic.Dynamic));

        if (!(cur instanceof Object) || !cur.hasOwnProperty(part)) {
          return false;
        }
        cur = cur[part];
      }

      common.checkLeafs({value: cur, allowedTypes: []});

      return true;
    } else {
      assert(false);
    }
  }

  make ({path}) {
    let rthis = this.__unbox__();
    let cur = rthis.rootNode().__box__();

    for (let part of path) {
      cur = cur.__unbox__().__getitem__(part);
    }

    return cur;
  }

  evaluate ({runtime, recursive, resolve, path, missing = util.NOVALUE}) {
    assert(runtime === 'dynamic' || runtime === 'static');
    assert(recursive === true || recursive === false);
    assert(resolve === true || resolve === false);

    // TODO: remove this, its temporary to make sure we changed all the evaluate() calls
    assert(missing !== undefined);

    // !resolve => runtime === 'static'
    // assert(resolve || runtime === 'static');
    assert(path === undefined);

    let nodeInputContext = this.__unbox__();

    if (nodeInputContext.node().context.runtime() === 'static' && runtime === 'dynamic') {
      throw new common.PipelineError('Cannot evaluate this dynamically when you are in static mode.');
    }

    path = nodeInputContext._path;

    if (runtime === 'static') {
      common.checkLeafs({value: nodeInputContext.rootNode().__unbox__()._staticValue, allowedTypes: [dynamic.Dynamic]});

      let value = nodeInputContext.rootNode().__unbox__()._staticValue;

      let cur = value;

      for (let part of path) {
        if (cur instanceof dynamic.Dynamic && resolve === true) {
          throw new common.PipelineError(`Cannot evaluate \`${path.join('.')}\` at static time; requires dynamic evaluation.`);
        }
        if (cur instanceof dynamic.Dynamic && resolve === false) {
          return function () { return nodeInputContext.evaluate({runtime: 'dynamic', recursive: true, resolve: true, missing}); };
        }
        if (!(cur instanceof Object) || !cur.hasOwnProperty(part)) {
          if (missing !== util.NOVALUE) {
            return missing;
          }
          throw new common.NoSuchPathError(`Cannot evaluate \`${path.join('.')}\` at static time; no such input, is this value connected?`);
        }
        cur = cur[part];
      }

      if (resolve && recursive) {
        let errors = common.checkLeafs({value: cur, allowedTypes: [], raiseError: false});
        if (errors) {
          throw new common.PipelineError(`Cannot evaluate \`${path.join('.')}\` at static time; requires dynamic evaluation;` +
                                         ` ${Object.keys(errors).join(',')} are invalid types`);
        }
      } else {
        common.checkLeafs({value: cur, allowedTypes: [dynamic.Dynamic]});

        cur = util.maptree({
          value: cur,
          leafVisitor: function ({value, path}) {
            if (value instanceof dynamic.Dynamic) {
              let valuePath = clone(nodeInputContext._path).concat(path);
              return function () {
                let nic = nodeInputContext.make({path: valuePath});
                return nic.__unbox__().evaluate({runtime: 'dynamic', recursive: true, resolve: true, missing});
              };
            }
            return value;
          }
        });

        common.checkLeafs({value: cur, allowedTypes: [], allowedTests: [common.vtIsFunction]});
      }

      return cur;
    } else if (runtime === 'dynamic') {
      common.checkLeafs({value: nodeInputContext.rootNode().__unbox__()._dynamicValue, allowedTypes: []});

      let value = nodeInputContext.rootNode().__unbox__()._dynamicValue;

      common.checkLeafs({value: value, allowedTypes: []});

      let cur = value;

      for (let part of path) {
        // the _dynamicValue tree shouldn't have any dynamics left, they
        // should have been evaluated, thats the point of the _dynamicValue.
        assert(!(cur instanceof dynamic.Dynamic));
        assert(!(Type.is(cur, dynamic.Dynamic)));
        assert(!(Type.instance(cur, dynamic.Dynamic)));

        if (!(cur instanceof Object) || !cur.hasOwnProperty(part)) {
          if (missing !== util.NOVALUE) {
            return missing;
          }
          throw new common.NoSuchPathError(`Cannot evaluate \`${path.join('.')}\` at runtime time; no such input, is this value connected?`);
        }
        cur = cur[part];
      }

      common.checkLeafs({value: cur, allowedTypes: []});

      return cur;
    }
    assert(false);
  }

  __call__ (args = {}) {
    let rthis = this.__unbox__();
    if (rthis !== rthis.rootNode().__unbox__()) {
      throw new common.PipelineError('Can only use the call method to set arguments directly on node.i');
    }

    rthis.setValue(args);
  }

  saveState () {
    assert(this.rootNode().__box__() === this.__box__());

    let rthis = this.__unbox__();
    let {pipeline} = rthis;
    let {msgpack} = pipeline;

    let state = {};

    state._staticValueUpdated = rthis._staticValueUpdated;
    state._dynamicValueUpdated = rthis._dynamicValueUpdated;
    // state._staticValue = rthis._staticValue;
    state._dynamicValue = rthis._dynamicValue;

    ({value: state} = msgpack.wrap({value: state, raise: true}));

    return msgpack.encode(state);
  }

  loadState (buffer) {
    assert(this.rootNode().__box__() === this.__box__());

    let rthis = this.__unbox__();
    let {pipeline} = rthis;
    let {msgpack} = pipeline;

    let state = msgpack.encode(buffer);

    // rthis._staticValueUpdated = state._staticValueUpdated;
    // rthis._dynamicValueUpdated = state._dynamicValueUpdated;
    rthis._dynamicValueUpdated = common.time();
    // state._staticValue = rthis._staticValue;
    rthis._dynamicValue = state._dynamicValue;
  }
}

module.exports.NodeInputContext = NodeInputContext;
