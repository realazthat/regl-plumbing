
module.exports = {};

const assert = require('assert');
const clone = require('clone');
const Type = require('type-of-is');
const common = require('./regl-plumbing-common.js');
const util = require('./regl-plumbing-util.js');

const nodeoutput = require('./regl-plumbing-nodeoutput.js');
const dynamic = require('./regl-plumbing-dynamic.js');

class NodeOutputContext {
  constructor ({pipeline, rootNode = null, path = []}) {
    assert(rootNode instanceof nodeoutput.NodeOutputContext || rootNode === null);
    this.pipeline = pipeline;
    this._root = rootNode === null ? this : rootNode;
    this._staticValue = null;
    this._dynamicValue = null;
    this._path = clone(path);

    assert(this.rootNode() instanceof nodeoutput.NodeOutputContext);
  }

  rootNode () {
    assert(this._root instanceof nodeoutput.NodeOutputContext);
    return this._root;
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

    let {pipeline} = this;

    return new Proxy(new NodeOutputContext({pipeline, rootNode: this.rootNode(), path}), util.accessHandler);
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

    return this.evaluate({runtime, recursive: true, resolve: false});
  }

  setValue (value) {
    assert(this.rootNode() === this);
    assert(this._path.length === 0);

    ({value} = this.checkStaticValue({value}));

    this._staticValue = value;
    this._dynamicValue = null;
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
    assert(runtime === 'static' || runtime === 'dynamic');
    // assert(this.executionContext.runtime === runtime);
    assert(this.rootNode() === this);

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
      // let _staticValue = util.maptree({value: this._staticValue, leafVisitor});
      let _staticValue = this._staticValue;
      _staticValue = this.checkStaticResolvedValue(_staticValue);
      this._staticValue = _staticValue;
    } else if (runtime === 'dynamic') {
      let _dynamicValue = util.maptree({value: this._staticValue, leafVisitor});
      _dynamicValue = this.checkDynamicResolvedValue(_dynamicValue);
      this._dynamicValue = _dynamicValue;
    }
  }

  evaluate ({runtime, recursive, resolve, path}) {
    assert(runtime === 'static' || runtime === 'dynamic');
    assert(recursive === true || recursive === false);
    assert(resolve === true || resolve === false);
    // assert(resolve || runtime === 'static');
    assert(recursive === true);
    assert(path === undefined);

    let nodeOutputContext = this;

    path = this._path;

    let value = runtime === 'static' ? this.rootNode()._staticValue : this.rootNode()._dynamicValue;

    if (runtime === 'static') {
      if (value === null) {
        throw new common.PipelineError(`Cannot evaluate \`${path.join('.')}\` as the value of this NodeOutputContext` +
                                        ' was never transferred over from the execution context .... woops?');
      }

      value = nodeOutputContext.checkStaticResolvedValue(value);
      let cur = value;

      for (let part of path) {
        // if (cur === undefined) {
        //   throw new common.PipelineError(`Cannot resolve ${this._path.join('.')} at static time; no such input, is this value connected?`)
        // }

        if (cur instanceof dynamic.Dynamic && resolve === true) {
          throw new common.PipelineError(`Cannot evaluate \`${path.join('.')}\` at static time; requires dynamic evaluation.`);
        }

        if (cur instanceof dynamic.Dynamic && resolve === false) {
          return cur;
        //   return function() { return nodeOutputContext.evaluate({runtime: 'dynamic', recursive, resolve: true})};
        }

        if (!(cur instanceof Object) || !cur.hasOwnProperty(part)) {
          throw new common.NoSuchPathError(`Cannot evaluate \`${path.join('.')}\` at static time; no such input, is this value connected?`);
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
        //   throw new common.PipelineError(`Cannot resolve ${this._path.join('.')} at runtime time; no such input, is this value connected?`)
        // }

        // the _dynamicValue tree shouldn't have any dynamics left, they
        // should have been evaluated, thats the point of the _dynamicValue.
        assert(!(cur instanceof dynamic.Dynamic));
        assert(!(Type.is(cur, dynamic.Dynamic)));
        assert(!(Type.instance(cur, dynamic.Dynamic)));

        if (!cur.hasOwnProperty(part)) {
          throw new common.PipelineError(`Cannot evaluate \`${path.join('.')}\` at runtime time; no such input, is this value connected?`);
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

}

module.exports.NodeOutputContext = NodeOutputContext;
