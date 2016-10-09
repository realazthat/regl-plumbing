
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

  rootNode () {
    assert(this._root instanceof NodeInputContext);

    return this._root;
  }

  computeInSNodes () {
    assert(this === this.rootNode());

    let results = [];

    this._injection.forEach(function ({path, value}) {
      // sanity
      value = this.checkInjectionValue(value);
      common.maptree({
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
      allowedTests: [(value) => !common.vtIsFunction({value})]
    });

    util.maptree({
      value,
      leafVisitor: function ({value}) {
        if (common.vtIsFunction({value})) {
          assert(!common.vtIsTerminalValue({value}));

          return new dynamic.Dynamic({func: value});
        }

        return value;
      }
    });

    return this.checkInjectionValue(value);
  }

  // check this._injection[i].value post insertion
  checkInjectionValue (value) {
    common.checkLeafs({
      value,
      allowedTypes: [dynamic.Dynamic, nodeoutput.NodeOutputContext],
      allowedTests: []
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

    function leafVisitor ({value}) {
      assert(!common.vtIsNode({value}));

      // check that this is not a Function that is also a class
      // for example a regl texture, which is a function
      if (common.vtIsTerminalValue({value})) {
        return value;
      }

      if (common.vtIsValuePlaceHolder({value})) {
        value = common.vtEvaluatePlaceHolder({value, runtime, recursive: true, resolve: false});
        return value;
      }

      // check if its a node; this shouldn't happen in a leaf visitor but whatever
      // if (common.vtIsNode({value})) {
      //   return value;
      // }

      throw new common.PipelineError(`Don't know how to evaluate this node in the input argument tree ${value}`);
    }

    // console.log('this._args:',this._args);

    // console.log('value:',value);

    // sort it shortest-to-longest
    this.rootNode()._injections.sort(function (lhs, rhs) {
      return (lhs.length - rhs.length);
    });

    let result;
    if (this.rootNode()._injections.length === 0) {
      result = undefined;
    } else if (this.rootNode()._injections.length === 1) {
      let {path, value} = this.rootNode()._injections[0];
      value = util.maptree({value, leafVisitor});
      if (path.length === 0) {
        result = value;
      } else {
        result = {};
        _.set(result, path, value);
      }
    } else {
      result = {};
      for (let {path, value} of this.rootNode()._injections) {
        value = util.maptree({value, leafVisitor});
        _.set(result, path, value);
      }
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

  evaluate ({runtime, recursive, resolve, path}) {
    assert(runtime === 'dynamic' || runtime === 'static');
    assert(recursive === true || recursive === false);
    assert(resolve === true || resolve === false);
    // !resolve => runtime === 'static'
    // assert(resolve || runtime === 'static');
    assert(path === undefined);

    path = this._path;

    let nodeInputContext = this;

    if (runtime === 'static') {
      common.checkLeafs({value: this.rootNode()._staticValue, allowedTypes: [dynamic.Dynamic]});

      let value = this.rootNode()._staticValue;

      let cur = value;

      for (let part of path) {
        if (cur instanceof dynamic.Dynamic && resolve === true) {
          throw new common.PipelineError(`Cannot evaluate \`${path.join('.')}\` at static time; requires dynamic evaluation.`);
        }
        if (cur instanceof dynamic.Dynamic && resolve === false) {
          return function () { return nodeInputContext.evaluate({runtime: 'dynamic', recursive: true, resolve: true}); };
        }
        if (!(cur instanceof Object) || !cur.hasOwnProperty(part)) {
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
        // TODO: should prolly make all these Functions ...
        common.checkLeafs({value: cur, allowedTypes: [dynamic.Dynamic]});
      }

      return cur;
    } else if (runtime === 'dynamic') {
      common.checkLeafs({value: this.rootNode()._dynamicValue, allowedTypes: []});

      let value = this.rootNode()._dynamicValue;

      common.checkLeafs({value: value, allowedTypes: []});

      let cur = value;

      for (let part of path) {
        // the _dynamicValue tree shouldn't have any dynamics left, they
        // should have been evaluated, thats the point of the _dynamicValue.
        assert(!(cur instanceof dynamic.Dynamic));
        assert(!(Type.is(cur, dynamic.Dynamic)));
        assert(!(Type.instance(cur, dynamic.Dynamic)));

        if (!(cur instanceof Object) || !cur.hasOwnProperty(part)) {
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
    // let injections = this.rootNode()._injections;

    // console.log('nodeinput.__call__.args: ', args);

    // util.maptree({value: args, leafVisitor: function({value, path}){
    //     injections.push({path: clone(path),value});
    //     return value;
    //   }
    // });
    // console.log('injections: ', injections);
  }
}

module.exports.NodeInputContext = NodeInputContext;
