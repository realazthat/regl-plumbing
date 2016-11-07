
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
    this._staticValueUpdated = 0;
    this._dynamicValueUpdated = 0;
    this._staticValue = {};
    this._dynamicValue = {};

    assert(this.rootNode() instanceof NodeInputContext);

    Object.seal(this);
  }

  __hasitem__ (subscript) {
    return util.__hasitem__.apply(this, [subscript]);
  }

  __getitem__ (subscript) {
    if (!this.__hasitem__(subscript)) {
      return undefined;
    }

    if (this.hasOwnProperty(subscript) || Object.getPrototypeOf(this).hasOwnProperty(subscript)) {
      return this[subscript];
    }

    let path = Array.from(this._path).concat([subscript]);

    return new Proxy(new NodeInputContext({pipeline: this.pipeline, node: this._node, rootNode: this.rootNode(), path}),
                     util.accessHandler);
  }

  node () {
    assert(this._node instanceof main.private.SugarNode);
    return this._node;
  }

  rootNode () {
    assert(this._root instanceof NodeInputContext);

    return this._root;
  }

  computeInSNodes () {
    assert(this === this.rootNode());
    let nodeinputcontext = this;

    let results = [];

    this._injections.forEach(function ({path, value}) {
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

  // check this._injection[i].value prior to insertion
  checkInjectionValueInput (value) {
    common.checkLeafs({
      value,
      allowedTypes: [dynamic.Dynamic, nodeoutput.NodeOutputContext],
      allowedTests: [common.vtIsFunction]
    });

    return this.checkInjectionValue(value);
  }

  // check this._injection[i].value post insertion
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
    assert(runtime === 'static' || runtime === 'dynamic');

    return this.evaluate({runtime, recursive: true, resolve: false});
  }

  setValue (value) {
    value = this.checkInjectionValueInput(value);

    this.rootNode()._injections.push({path: this._path, value});

    this.pipeline.emit('node-changed', {snode: this._node});
    this.pipeline.emit('node-input-changed', {snode: this._node});
  }

  __setitem__ (subscript, value) {
    // let path = Array.from(this._path).concat([subscript]);

    this.__getitem__(subscript).__unbox__().setValue(value);

    return true;
  }

  compute ({runtime}) {
    assert(runtime === 'dynamic' || runtime === 'static');
    assert(this.rootNode() === this);

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
      this.rootNode()._injections.sort(function (lhs, rhs) {
        return (lhs.length - rhs.length);
      });

      let injections = this.rootNode()._injections.map(({path, value}) => {
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

      result = this.rootNode()._staticValue;

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

      result = this.checkDynamicResolvedValue(result);
    }

    if (runtime === 'static') {
      this.rootNode()._staticValue = this.checkStaticResolvedValue(result);
      this.rootNode()._staticValueUpdated = common.time();
    } else if (runtime === 'dynamic') {
      this.rootNode()._dynamicValue = this.checkDynamicResolvedValue(result);
      this.rootNode()._dynamicValueUpdated = common.time();
    } else {
      assert(false);
    }
  }

  available ({runtime, terminalDynamic}) {
    assert(runtime === 'dynamic' || runtime === 'static');
    assert(terminalDynamic === true || terminalDynamic === false);

    let path = this._path;

    let nodeInputContext = this;

    if (runtime === 'static') {
      let value = nodeInputContext.rootNode()._staticValue;

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
      let value = nodeInputContext.rootNode()._dynamicValue;

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

  __box__ () {
    return new Proxy(this, util.accessHandler);
  }

  make ({path}) {
    let cur = this.rootNode().__box__();

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

    let nodeInputContext = this;

    if (nodeInputContext.node().context.runtime() === 'static' && runtime === 'dynamic') {
      throw new common.PipelineError('Cannot evaluate this dynamically when you are in static mode.');
    }

    path = nodeInputContext._path;

    if (runtime === 'static') {
      common.checkLeafs({value: nodeInputContext.rootNode()._staticValue, allowedTypes: [dynamic.Dynamic]});

      let value = nodeInputContext.rootNode()._staticValue;

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
      common.checkLeafs({value: nodeInputContext.rootNode()._dynamicValue, allowedTypes: []});

      let value = nodeInputContext.rootNode()._dynamicValue;

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
    if (this !== this.rootNode()) {
      throw new common.PipelineError('Can only use the call method to set arguments directly on node.i');
    }

    this.setValue(args);
  }
}

module.exports.NodeInputContext = NodeInputContext;
