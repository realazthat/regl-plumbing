
module.exports = {};

const common = module.exports;

const assert = require('assert');

const isPlainObject = require('is-plain-object');
const Type = require('type-of-is');
const _ = require('lodash');

const nodeinput = require('./regl-plumbing-nodeinput.js');
const nodeoutput = require('./regl-plumbing-nodeoutput.js');
const execution = require('./regl-plumbing-execution.js');
const execinput = require('./regl-plumbing-execinput.js');
const execoutput = require('./regl-plumbing-execoutput.js');
const dynamic = require('./regl-plumbing-dynamic.js');
const util = require('./regl-plumbing-util.js');
const main = require('./regl-plumbing.js');

const ExtendableError = require('es6-error');

// const common = module.exports;

window.__time = 0;

function getPath (value, path, def) {
  if (path.length === 0) {
    return value;
  }

  return _.get(value, path, def);
}

function hasPath (value, path, def) {
  if (path.length === 0) {
    return true;
  }

  return _.has(value, path, def);
}

function setPath (obj, path, value) {
  if (path.length === 0) {
    return value;
  }

  _.set(obj, path, value);
  return obj;
}

function time () {
  window.__time += 1;
  return window.__time;
}

class PipelineError extends ExtendableError {

}

class NoSuchPathError extends PipelineError {

}

function vtIsNode ({value}) {
  return isPlainObject(value) || Type.is(value, Array);
}

function vtIsValuePlaceHolder ({value}) {
  if (value instanceof nodeinput.NodeInputContext) {
    return true;
  }

  if (value instanceof nodeoutput.NodeOutputContext) {
    return true;
  }

  if (value instanceof dynamic.Dynamic) {
    return true;
  }

  if (value instanceof execinput.ExecutionInputSubcontext) {
    return true;
  }

  if (value instanceof execoutput.ExecutionOutputSubcontext) {
    return true;
  }

  return false;
}

/**
 * `value` - The value to evaluate. Valid value types are:
 *    * `Number`
 *    * `String`
 *    * `Dynamic`
 *    * `NodeInputContext`
 *    * `NodeOutputContext`
 *    * `ExecutionInputSubcontext`
 *    * `ExecutionOutputSubcontext`
 *    * Anything else not one of:
 *      * `Function` (types that inherit from `Function` are fine though)
 *    * Additionally, there are special "tree" types, which are recursed:
   *    * `Array` (containing only valid value types)
   *    * `Dictionaries` (containing only valid value types)
 * `runtime` - The runtime currently in.
 *    * A value of 'static' indicates that the dynamic values should be left as `Dynamic` values.
 *    * A value of 'dynamic' will resolve the dynamic values.
 * `recursive` - If the value should be resolved recursively down the tree (down through dictionaries or arrays);
 * `resolve` - requires the final result to not contain `Dynamic`s even if in static mode; if true will resolve them.
 */
function vtEvaluatePlaceHolder ({value, runtime, recursive, resolve, missing = util.NOVALUE}) {
  assert(runtime === 'static' || runtime === 'dynamic');
  assert(recursive === true || recursive === false);
  assert(resolve === true || resolve === false);

  if (vtIsTerminalValue({value})) {
    return value;
  }

  assert(!Type.is(value, Function));

  // assert(vtIsValuePlaceHolder({value}));

  if (recursive && vtIsNode({value})) {
    if (isPlainObject({value})) {
      let result = {};
      for (let key of Object.keys(value)) {
        result[key] = vtEvaluatePlaceHolder({value: value[key], runtime, recursive, resolve, missing});
      }
      return result;
    } else if (Type.is(value, Array)) {
      let result = [];
      for (let key of Object.keys(value)) {
        result.push(vtEvaluatePlaceHolder({value: value[key], runtime, recursive, resolve, missing}));
      }
      return result;
    }
    assert(false);
  }

  if (value instanceof dynamic.Dynamic) {
    if (runtime === 'dynamic' || resolve) {
      return value.evaluate({runtime, recursive, resolve});
    }
    return value;
  } else if (vtIsValuePlaceHolder({value})) {
    return value.__unbox__().evaluate({runtime, recursive, resolve, missing});
  } else {
    assert(false);
  }
}

function vtHasFunctions ({value}) {
  if (vtIsFunction({value})) {
    return true;
  }

  return util.reducetree({
    value,
    visitor: function ({value}) {
      if (vtIsFunction({value})) {
        return true;
      }
      if (vtIsNode({value})) {
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

function vtEvaluateFunctions ({value}) {
  if (vtIsFunction({value})) {
    return value();
  }

  return util.maptree({
    value,
    leafVisitor: function ({value}) {
      if (vtIsFunction({value})) {
        return value();
      }

      return value;
    }
  });
}

function vtIsFunction ({value}) {
  return value instanceof Function && Type.is(value, Function) && !specialTerminalTests.some((test) => test({value}));
}

function vtIsTerminalValue ({value}) {
  if (specialTerminalTests.some((test) => test({value}))) {
    return true;
  }

  return !vtIsNode({value}) && !vtIsValuePlaceHolder({value}) && !vtIsFunction({value});
}

function vtIsDynamic ({value, recursive}) {
  assert(recursive === true || recursive === false);

  if (value instanceof dynamic.Dynamic) {
    return true;
  }

  if (vtIsTerminalValue({value})) {
    return false;
  }

  if (vtIsFunction({value})) {
    return true;
  }

  if (vtIsValuePlaceHolder({value})) {
    return true;
  }

  if (!recursive) {
    return false;
  }

  if (vtIsNode({value})) {
    return util.reducetree({value, visitor: function ({value, path}) {
      if (vtIsDynamic({value, recursive: false})) {
        return true;
      }
      if (vtIsNode({value})) {
        for (let key of Object.keys(value)) {
          assert(value[key] === true || value[key] === false);
          if (value[key]) {
            return true;
          }
        }
      }
      return false;
    }});
  }

  return false;
}

// function checkOnlyDynamics ({value}) {
//   value = util.maptree({
//     value,
//     leafVisitor: function ({value}) {
//       assert(!common.vtIsNode({value}));

//       if (!common.vtIsValuePlaceHolder({value}) || common.vtIsTerminalValue({value})) {
//         return value;
//       }

//       if (value instanceof NodeInputContext
//           || value instanceof NodeOutputContext
//           || value instanceof ExecutionOutputSubcontext
//           || value instanceof ExecutionContext
//           || value instanceof execinput.ExecutionInputSubcontext
//           || value instanceof execoutput.ExecutionOutputSubcontext
//           || Type.is(value, Function))
//       {
//         // bad
//         throw new common.PipelineError('How did this happen???');
//       }

//       if (value instanceof Dynamic) {
//         return value;
//       }
//     }
//   });
// }

// function checkOnlyFunctions ({value}) {
//   value = util.maptree({
//     value,
//     leafVisitor: function ({value}) {
//       assert(!common.vtIsNode({value}));

//       if (!common.vtIsValuePlaceHolder({value}) || common.vtIsTerminalValue({value})) {
//         return value;
//       }

//       if (value instanceof NodeInputContext
//           || value instanceof NodeOutputContext
//           || value instanceof ExecutionOutputSubcontext
//           || value instanceof ExecutionContext
//           || value instanceof execinput.ExecutionInputSubcontext
//           || value instanceof execoutput.ExecutionOutputSubcontext
//           || value instanceof Dynamic)
//       {
//         // bad
//         throw new common.PipelineError('How did this happen???');
//       }

//       if (Type.is(value, Function)) {
//         return value;
//       }
//       return value;
//     }
//   });
// }

// function checkOnlyNone ({value}) {
//   value = util.maptree({
//     value,
//     leafVisitor: function ({value}) {
//       assert(!common.vtIsNode({value}));

//       if (!common.vtIsValuePlaceHolder({value}) || common.vtIsTerminalValue({value})) {
//         return value;
//       }

//       if (value instanceof nodeinput.NodeInputContext
//           || value instanceof nodeoutput.NodeOutputContext
//           || value instanceof execoutput.ExecutionOutputSubcontext
//           || value instanceof execution.ExecutionContext
//           || value instanceof execinput.ExecutionInputSubcontext
//           || value instanceof execoutput.ExecutionOutputSubcontext
//           || value instanceof dynamic.Dynamic
//           || Type.is(value, Function))
//       {
//         // bad
//         throw new common.PipelineError('How did this happen???');
//       }

//       return value;
//     }
//   });
// }

class DISCONNECTEDT {

}

const DISCONNECTED = new DISCONNECTEDT();

function getDefaultDeniedTypes () {
  return [
    dynamic.Dynamic,
    nodeinput.NodeInputContext,
    nodeoutput.NodeOutputContext,
    execinput.ExecutionInputSubcontext,
    execoutput.ExecutionOutputSubcontext,
    execution.ExecutionContext,
    main.private.SugarNode
  ];
}

let defaultDeniedTests = [
  vtIsFunction,
  ({value}) => value === util.NOVALUE,
  ({value}) => value === util.DISCONNECTED
];

function vtIsReglValue ({value}) {
  return value !== undefined && value !== null && value.hasOwnProperty instanceof Function && value.hasOwnProperty('_reglType');
}

let specialTerminalTests = [
  vtIsReglValue
];

let defaultAllowedTests = [
  // ({value}) => vtIsTerminalValue({value})
];

function checkLeafs ({
  value,
  deniedTypes = getDefaultDeniedTypes(), deniedTests = defaultDeniedTests,
  allowedTypes = [], allowedTests = defaultAllowedTests,
  raiseError = true}) {
  let errors = {};

  value = util.maptree({
    value,
    leafVisitor: function ({value, path}) {
      assert(!vtIsNode({value}));

      if (!deniedTypes.some((type) => value instanceof type) && !deniedTests.some((test) => test({value}))) {
        return value;
      }

      for (let test of allowedTests) {
        if (test({value})) {
          return value;
        }
      }

      for (let type of allowedTypes) {
        if (value instanceof type) {
          return value;
        }
      }

      // bad
      let t = Type.string(value);

      if (raiseError) {
        throw new PipelineError(`How did this happen? What have you done this time? Somehow got something of type ${t} but that shouldn't really be possible here`);
      } else {
        errors[path.join('.')] = t;
      }

      return value;
    }
  });

  if (Object.keys(errors).length === 0) {
    return undefined;
  }
  return errors;
}

function collapseDisconnecteds ({value}) {
  value = util.maptree({
    value,
    leafVisitor: function ({value, path}) {
      return value;
    },
    postVisitor: function ({value, path}) {
      if (Type.is(value, Object) && Object.keys(value).length === 1) {
        let k = Object.keys(value)[1];
        let v = value[k];

        if (v === common.DISCONNECTED) {
          return common.DISCONNECTED;
        }
      }

      if (Type.is(value, Array) && value.length === 1) {
        let v = value[0];

        if (v === common.DISCONNECTED) {
          return common.DISCONNECTED;
        }
      }

      if (Type.is(value, Object)) {
        let result = {};
        for (let k of Object.keys(value)) {
          if (value[k] === common.DISCONNECTED) {
            continue;
          }
          result[k] = value[k];
        }
        return result;
      }

      if (Type.is(value, Array)) {
        return value.filter((child) => child !== common.DISCONNECTED);
      }

      return value;
    }
  });

  checkLeafs({
    value,
    deniedTypes: [],
    deniedTests: [ ({value}) => value === common.DISCONNECTED ]
  });

  return value;
}

class FunctionWrapper extends Function {
  constructor (f) {
    super();

    this.f = f;

    Object.seal(this);
  }
}

function func (f) {
  let handler = {
    apply: function (obj, thisArg, argumentsList) {
      return obj.f.apply(thisArg, argumentsList);
    }
  };

  return new Proxy(new FunctionWrapper(f), handler);
}

module.exports.vtIsFunction = vtIsFunction;
module.exports.vtHasFunctions = vtHasFunctions;
module.exports.vtEvaluateFunctions = vtEvaluateFunctions;
module.exports.vtIsDynamic = vtIsDynamic;
module.exports.vtIsNode = vtIsNode;
module.exports.vtIsTerminalValue = vtIsTerminalValue;
module.exports.vtIsValuePlaceHolder = vtIsValuePlaceHolder;
module.exports.vtEvaluatePlaceHolder = vtEvaluatePlaceHolder;
module.exports.vtIsReglValue = vtIsReglValue;

module.exports.DISCONNECTED = DISCONNECTED;
module.exports.collapseDisconnecteds = collapseDisconnecteds;

module.exports.checkLeafs = checkLeafs;
module.exports.specialTerminalTests = specialTerminalTests;

module.exports.time = time;
module.exports.func = func;

module.exports.PipelineError = PipelineError;
module.exports.NoSuchPathError = NoSuchPathError;

module.exports.hasPath = hasPath;
module.exports.getPath = getPath;
module.exports.setPath = setPath;
