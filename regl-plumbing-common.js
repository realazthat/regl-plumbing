
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

global.__time = 0;

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
  global.__time += 1;
  return global.__time;
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

function vtEvaluateFunctions ({value, args}) {
  assert(args instanceof Array);

  if (vtIsFunction({value})) {
    return value(...args);
  }

  return util.maptree({
    value,
    leafVisitor: function ({value}) {
      if (vtIsFunction({value})) {
        return value(...args);
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

function readPixels ({regl, texture, viewport = null}) {
  assert(vtIsReglValue({value: texture}));

  let framebuffer = regl.framebuffer({
    color: texture,
    depth: false,
    stencil: false
  });

  let result = {};

  if (viewport === null) {
    result.buffer = regl.read({framebuffer});
  } else {
    result.buffer = regl.read({x: viewport.xy[0], y: viewport.xy[1], width: viewport.wh[0], height: viewport.wh[1], framebuffer});
  }

  framebuffer.destroy();

  return result.buffer;
}

// wraps a texture in a class so that msgpack can know to serialize this specially
// (since msgpack works by trying to serialize classes and us registering those classes
// for specialized serialization)
class ReglTextureWrapper {
  constructor (value) {
    this.value = value;
  }
}

// see `common.func()`.
class FunctionWrapper extends Function {
  constructor (f) {
    super();

    this.f = f;

    Object.seal(this);
  }
}

// this will wrap a function in a class/object that will behave like the
// function, but it will be of a different class (which inherits from Function)
// that is not of type Function, so that it isn't intepreted as a dynamic value.
function func (f) {
  let handler = {
    apply: function (obj, thisArg, argumentsList) {
      return obj.f.apply(thisArg, argumentsList);
    }
  };

  return new Proxy(new FunctionWrapper(f), handler);
}

// a submodule for texture-related stuff
const texture = {
  // color components
  components: {
    invalid: function invalid ({components, lvalue = true, raise = false}) {
      let colors = new Set(['r', 'g', 'b', 'a']);

      let issues = [];
      // if "broken" is set to true, then an error occured that was so bad, no more checking should be done.
      let broken = false;

      if (!broken && !Type.is(components, String)) {
        issues.push(`Color components is of wrong type, type="${Type.string(components)}, should be String"`);
        broken = true;
      }

      if (!broken && components.length === 0) {
        issues.push('Color components cannot be empty');
      }

      let characters = Array.from(components);

      for (let char of characters) {
        if (!broken && !colors.has(char)) {
          issues.push(`Invalid color components, components="${components}", only r,g,b,a are valid colors`);
        }
      }

      if (!broken && lvalue) {
        let seen = new Set([]);
        for (let char of characters) {
          if (seen.has(char)) {
            issues.push(`Invalid color components, components="${components}", l-value of swizzle cannot have duplicate components`);
          }

          seen.add(char);
        }
      }

      if (raise && issues.length > 0) {
        throw new common.PipelineError(issues.join('\n'));
      }

      return issues;
    }
  },
  template: {
    // base template (default) texture
    base: {
      type: 'uint8',
      format: 'rgba',
      min: 'nearest',
      mag: 'nearest',
      wrapT: 'clamp',
      wrapS: 'clamp',
      mipmap: false,
      resolution: {wh: [1, 1]},
      viewport: {
        xy: [0, 0],
        wh: [1, 1],
        wrapS: 'none',
        wrapT: 'none',
        border: [0, 0, 0, 1]
      }
    },

    invalid: function ({template, raise = false}) {
      const mipmaps = new Set([true, false]);
      const mins = new Set(['nearest', 'linear',
                            'mipmap', 'linear mipmap linear',
                            'nearest mipmap linear',
                            'linear mipmap nearest',
                            'nearest mipmap nearest']);
      const mags = new Set(['nearest', 'linear']);
      const wraps = new Set(['repeat', 'clamp', 'mirror']);
      const types = new Set(['int8', 'int16', 'uint8', 'uint16', 'int32', 'uint32', 'float16', 'float32']);
      const formats = new Set(['alpha', 'luminance', 'luminance alpha', 'rgb', 'rgba', 'rgba4', 'rgb5 a1', 'rgb565',
                               'srgb', 'srgba', 'depth', 'depth stencil', 'rgb s3tc dxt1', 'rgba s3tc dxt1',
                               'rgba s3tc dxt3', 'rgba s3tc dxt5', 'rgb atc', 'rgba atc explicit alpha',
                               'rgba atc interpolated alpha', 'rgb pvrtc 4bppv1', 'rgb pvrtc 2bppv1',
                               'rgba pvrtc 4bppv1', 'rgba pvrtc 2bppv1', 'rgb etc1']);
      const vpwraps = new Set(['none', 'repeat', 'clamp', 'mirror', 'border']);
      let issues = [];

      if (!types.has(template.type)) {
        issues.push(`missing or invalid type, type=${template.type}, valid types=${Array.from(types).join(',')}`);
      }
      if (!formats.has(template.format)) {
        issues.push(`missing or invalid format, format=${template.format}, valid formats=${Array.from(formats).join(',')}`);
      }
      if (!wraps.has(template.wrapT)) {
        issues.push(`missing or invalid wrapT, wrapT=${template.wrapT}, valid wraps=${Array.from(wraps).join(',')}`);
      }
      if (!wraps.has(template.wrapS)) {
        issues.push(`missing or invalid wrapS, wrapS=${template.wrapS}, valid wraps=${Array.from(wraps).join(',')}`);
      }
      if (!mipmaps.has(template.mipmap)) {
        issues.push(`missing or invalid mipmap, mipmap=${template.mipmap}, valid mipmaps=${Array.from(mipmaps).join(',')}`);
      }
      if (!mins.has(template.min)) {
        issues.push(`missing or invalid min, min=${template.min}, valid mins=${Array.from(mins).join(',')}`);
      }
      if (!mags.has(template.min)) {
        issues.push(`missing or invalid mag, mag=${template.mag}, valid mags=${Array.from(mags).join(',')}`);
      }

      function checkWH (wh) {
        return (Type.is(wh, Array) &&
                wh.length === 2 &&
                wh.every((v) => v >= 0 && Number.isInteger(v)));
      }

      function checkXY (xy) {
        return (Type.is(xy, Array) &&
                xy.length === 2 &&
                xy.every((v) => Number.isInteger(v)));
      }

      if (!Type.is(template.resolution, Object) ||
          !template.resolution.hasOwnProperty('wh') ||
          !checkWH(template.resolution.wh)) {
        issues.push(`missing or invalid resolution, resolution=${JSON.stringify(template.resolution)}`);
      }

      if (!Type.is(template.viewport, Object) ||
          !template.viewport.hasOwnProperty('wh') ||
          !template.viewport.hasOwnProperty('xy') ||
          !checkWH(template.viewport.wh) ||
          !checkXY(template.viewport.xy)) {
        issues.push(`missing or invalid viewport, viewport=${JSON.stringify(template.viewport)}`);
      }

      if (!vpwraps.has(template.viewport.wrapS)) {
        issues.push(`missing or invalid viewport.wrapS, wrapS=${JSON.stringify(template.viewport.wrapS)}` +
                    `, valid wraps=${Array.from(vpwraps).join(',')}`);
      }

      if (!vpwraps.has(template.viewport.wrapT)) {
        issues.push(`missing or invalid viewport.wrapT, wrapT=${JSON.stringify(template.viewport.wrapT)}` +
                    `, valid wraps=${Array.from(vpwraps).join(',')}`);
      }

      if (!Type.instance(template.viewport.border, Array) || template.viewport.border.length !== 4) {
        issues.push(`missing or invalid border, border=${JSON.stringify(template.viewport.border)}`);
      }

      if (raise && issues.length > 0) {
        throw new common.PipelineError(issues.join('\n'));
      }

      return issues;
    }
  },

  // returns true if a texture's viewport covers the entire image exactly
  fitted: function fitted ({texture}) {
    assert(common.texture.template.invalid({template: texture, raise: true}).length === 0);

    return (texture.viewport.xy[0] === 0 &&
            texture.viewport.xy[1] === 0 &&
            texture.viewport.wh[0] === texture.resolution.wh[0] &&
            texture.viewport.wh[1] === texture.resolution.wh[1]);
  },

  read: readPixels
};

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

module.exports.ReglTextureWrapper = ReglTextureWrapper;

module.exports.time = time;
module.exports.func = func;

module.exports.PipelineError = PipelineError;
module.exports.NoSuchPathError = NoSuchPathError;

module.exports.hasPath = hasPath;
module.exports.getPath = getPath;
module.exports.setPath = setPath;

module.exports.texture = texture;
