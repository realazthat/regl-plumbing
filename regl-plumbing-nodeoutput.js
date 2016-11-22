
module.exports = {};

const assert = require('assert');
const clone = require('clone');
const Type = require('type-of-is');
const common = require('./regl-plumbing-common.js');
const util = require('./regl-plumbing-util.js');
const main = require('./regl-plumbing.js');

const dynamic = require('./regl-plumbing-dynamic.js');

class NodeOutputContext {
  constructor ({pipeline, node, rootNode = null, path = []}) {
    assert(rootNode instanceof NodeOutputContext || rootNode === null);
    assert(node instanceof main.private.SugarNode);
    this.pipeline = pipeline;
    this._root = rootNode === null ? this : rootNode;
    this._node = node;
    this._staticValue = null;
    this._staticValueUpdated = 0;
    this._dynamicValue = null;
    this._dynamicValueUpdated = 0;
    this._path = clone(path);
  }

  static init ({pipeline, node, rootNode = null, path = []}) {
    let noc = new NodeOutputContext({pipeline, node, rootNode, path});
    let proxy = new Proxy(noc, util.accessHandler);

    noc.proxy = proxy;
    noc._root = noc._root.__box__();
    noc._node = noc._node.__box__();

    assert(noc._root instanceof NodeOutputContext);
    assert(noc._node instanceof main.private.SugarNode);
    assert(noc.rootNode() instanceof NodeOutputContext);

    Object.seal(noc);

    return proxy;
  }

  __box__ () {
    return util.__box__.apply(this);
  }

  __unbox__ () {
    return util.__unbox__.apply(this);
  }

  node () {
    let rthis = this.__unbox__();
    assert(rthis._node instanceof main.private.SugarNode);
    return rthis._node;
  }

  rootNode () {
    let rthis = this.__unbox__();
    assert(rthis._root instanceof NodeOutputContext);
    return rthis._root;
  }

  __hasitem__ (subscript) {
    let rthis = this.__unbox__();
    return util.__hasitem__.apply(rthis, [subscript]);
  }

  __getitem__ (subscript) {
    let rthis = this.__unbox__();

    if (!rthis.__hasitem__(subscript)) {
      return undefined;
    }

    // if (rthis.hasOwnProperty(subscript) || Object.getPrototypeOf(rthis).hasOwnProperty(subscript)) {
    //   return rthis[subscript];
    // }

    let path = Array.from(rthis._path).concat([subscript]);

    let {pipeline} = rthis;

    return NodeOutputContext.init({pipeline, node: rthis.node(), rootNode: rthis.rootNode(), path});
  }

  checkStaticValue ({value}) {
    common.checkLeafs({
      value,
      allowedTypes: [dynamic.Dynamic]
    });

    return {value};
  }

  getValue ({runtime}) {
    assert(runtime === 'static' || runtime === 'dynamic');
    let rthis = this.__unbox__();

    return rthis.evaluate({runtime, recursive: true, resolve: false});
  }

  setValue (value) {
    let rthis = this.__unbox__();
    assert(rthis.rootNode() === rthis.__box__());
    assert(rthis._path.length === 0);

    let {pipeline} = rthis;

    ({value} = rthis.checkStaticValue({value}));

    let t = pipeline.private.time();
    rthis._staticValue = value;
    rthis._staticValueUpdated = t;
    rthis._dynamicValue = null;
    rthis._dynamicValueUpdated = t;
  }

  __setitem__ (subscript, value) {
    // TODO: make this throw an exception
    assert(Type.is(subscript, String));

    throw new common.PipelineError('No one ever told you to call `node.out.something = something;`; it made no sense, what were you thinking??');
    // this.__getitem__(subscript).__unbox__().setValue(value);

    // return true;
  }

  // check this._staticValue
  checkStaticResolvedValue (value) {
    /*
    value = util.maptree({
      value,
      leafVisitor: function({value,path}){
        assert(!common.vtIsNode({value}));

        if (common.vtIsTerminalValue({value})) {
          // good
        } else if (value instanceof dynamic.Dynamic) {
          // good
        } else if (Type.is(value, Function)) {
          // bad
          throw new common.PipelineError('once processed statically, the value tree should not contain Function types;'
                                  + ' they should have been replaced by Dynamic types');
        } else if (value instanceof NodeOutputContext) {
          // bad
          throw new common.PipelineError('once processed statically, the value tree should not contain NodeOutputContext types;'
                                  + ' they should have been replaced by static or Dynamic types');
        } else {
          let t = Type.string(value);
          throw new common.PipelineError(`value contains an unknown type ${t}`);
        }

        return value;
      }
    });
    */

    common.checkLeafs({
      value,
      allowedTypes: [dynamic.Dynamic]
    });

    return value;
  }

  // check this._staticValue
  checkDynamicResolvedValue (value) {
    common.checkLeafs({
      value,
      allowedTypes: []
    });

    return value;
  }

  compute ({runtime}) {
    let rthis = this.__unbox__();
    assert(runtime === 'static' || runtime === 'dynamic');
    // assert(rthis.executionContext.runtime === runtime);
    assert(rthis.rootNode() === rthis.__box__());

    let {pipeline} = this;

    function leafVisitor ({value}) {
      if (common.vtIsValuePlaceHolder({value})) {
        return common.vtEvaluatePlaceHolder({value, runtime, recursive: true, resolve: false});
      }

      // check that this is not a Function that is also a class
      // for example a regl texture, which is a function
      if (common.vtIsTerminalValue({value})) {
        return value;
      }

      throw new common.PipelineError(`Don't know how to evaluate this node in the output argument tree ${value}`);
    }

    if (runtime === 'static') {
      // let _staticValue = util.maptree({value: rthis._staticValue, leafVisitor});
      let _staticValue = rthis._staticValue;
      _staticValue = rthis.checkStaticResolvedValue(_staticValue);
      rthis._staticValue = _staticValue;
      rthis._staticValueUpdated = pipeline.private.time();
    } else if (runtime === 'dynamic') {
      let _dynamicValue = util.maptree({value: rthis._staticValue, leafVisitor});
      _dynamicValue = rthis.checkDynamicResolvedValue(_dynamicValue);
      rthis._dynamicValue = _dynamicValue;
      rthis._dynamicValueUpdated = pipeline.private.time();
    }
  }

  evaluate ({runtime, recursive, resolve, path, missing = util.NOVALUE}) {
    let rthis = this.__unbox__();
    assert(runtime === 'static' || runtime === 'dynamic');
    assert(recursive === true || recursive === false);
    assert(resolve === true || resolve === false);
    // assert(resolve || runtime === 'static');
    assert(recursive === true);

    // TODO: remove this
    assert(missing !== undefined);

    // TODO: remove this
    assert(path === undefined);

    let nodeOutputContext = rthis;

    path = rthis._path;

    let value = runtime === 'static' ? rthis.rootNode().__unbox__()._staticValue : rthis.rootNode().__unbox__()._dynamicValue;

    if (runtime === 'static') {
      if (value === null) {
        throw new common.PipelineError(`Cannot evaluate \`${path.join('.')}\` as the value of this NodeOutputContext` +
                                        ' was never transferred over from the execution context .... woops?');
      }

      value = nodeOutputContext.checkStaticResolvedValue(value);
      let cur = value;

      for (let part of path) {
        // if (cur === undefined) {
        //   throw new common.PipelineError(`Cannot resolve ${this._path.join('.')} at static time; no such output, is this value connected?`)
        // }

        if (cur instanceof dynamic.Dynamic && resolve === true) {
          throw new common.PipelineError(`Cannot evaluate \`${path.join('.')}\` at static time; requires dynamic evaluation.`);
        }

        if (cur instanceof dynamic.Dynamic && resolve === false) {
          return function () {
            return nodeOutputContext.evaluate({runtime: 'dynamic', recursive, resolve: true, missing});
          };
        }

        if (!(cur instanceof Object) || !cur.hasOwnProperty(part)) {
          if (missing !== util.NOVALUE) {
            return missing;
          }
          throw new common.NoSuchPathError(`Cannot evaluate \`${path.join('.')}\` at static time; no such output, is this value connected?`);
        }
        cur = cur[part];
      }

      if (resolve) {
        let errors = common.checkLeafs({
          value: cur,
          allowedTypes: [],
          raiseError: false
        });
        if (errors) {
          throw new common.PipelineError(`Cannot evaluate \`${path.join('.')}\` at static time; requires dynamic evaluation;` +
                                         ` ${Object.keys(errors).join(',')} are invalid types`);
        }
      } else {
        common.checkLeafs({
          value: cur,
          allowedTypes: [dynamic.Dynamic]
        });

        cur = util.maptree({
          value: cur,
          leafVisitor: function ({value}) {
            if (value instanceof dynamic.Dynamic) {
              return function () {
                return value.evaluate();
              };
            }

            return value;
          }
        });

        common.checkLeafs({
          value: cur,
          allowedTypes: [],
          allowedTests: [common.vtIsFunction]
        });
      }

      return cur;
    }

    if (runtime === 'dynamic') {
      if (value === null) {
        throw new common.PipelineError(`Cannot evaluate \`${path.join('.')}\` as the this NodeOutputContext` +
                                       ' never had `compute({runtime: \'dynamic\'})` executed on it. whoops?');
      }

      let cur = value;

      for (let part of path) {
        // if (cur === undefined) {
        //   throw new common.PipelineError(`Cannot resolve ${this._path.join('.')} at runtime time; no such output, is this value connected?`)
        // }

        // the _dynamicValue tree shouldn't have any dynamics left, they
        // should have been evaluated, thats the point of the _dynamicValue.
        assert(!(cur instanceof dynamic.Dynamic));
        assert(!(Type.is(cur, dynamic.Dynamic)));
        assert(!(Type.instance(cur, dynamic.Dynamic)));

        if (!cur.hasOwnProperty(part)) {
          if (missing !== util.NOVALUE) {
            return missing;
          }

          throw new common.NoSuchPathError(`Cannot evaluate \`${path.join('.')}\` at runtime=dynamic; no such output, is this value connected?`);
        }
        cur = cur[part];
      }

      common.checkLeafs({
        value: cur,
        allowedTypes: []
      });
      return cur;
    }
  }

  saveState () {
    let rthis = this.__unbox__();
    assert(rthis.rootNode() === rthis.__box__());

    let {pipeline} = this;
    let {msgpack} = pipeline;

    let state = {};

    // state._staticValueUpdated = rthis._staticValueUpdated;
    // state._dynamicValueUpdated = rthis._dynamicValueUpdated;
    // state._staticValue = rthis._staticValue;
    state._dynamicValue = rthis._dynamicValue;

    ({value: state} = msgpack.wrap({value: state, raise: true}));

    return msgpack.encode(state);
  }

  loadState (buffer) {
    let rthis = this.__unbox__();
    assert(rthis.rootNode() === rthis.__box__());

    let {pipeline} = rthis;
    let {msgpack} = pipeline;

    let state = msgpack.encode(buffer);

    // rthis._staticValueUpdated = state._staticValueUpdated;
    rthis._dynamicValueUpdated = state._dynamicValueUpdated;
    // state._staticValue = rthis._staticValue;
    rthis._dynamicValue = state._dynamicValue;
  }
}

module.exports.NodeOutputContext = NodeOutputContext;
