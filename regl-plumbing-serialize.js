
const assert = require('assert');
const Type = require('type-of-is');
const common = require('./regl-plumbing-common.js');
const dynamic = require('./regl-plumbing-dynamic.js');
const util = require('./regl-plumbing-util.js');

module.exports = function ({regl}) {
  const msgpack = require('msgpack5')();
  msgpack.register(
      0x41,
      Uint8Array,
      function encode (buffer) {
        return buffer;
      },
      function decode (buffer) {
        return buffer;
      });

  msgpack.register(
      0x42,
      dynamic.Dynamic,
      function encode (value) {
        if (value.func) {
          throw new common.PipelineError('Cannot dynamic.Dynamic.func');
        }

        return {value: value.value, changed: value.changed};
      },
      function decode ({value, changed}) {
        return new dynamic.Dynamic({value, changed});
      });

  msgpack.register(
      0x43,
      common.ReglTextureWrapper,
      function encode (value) {
        let {width, height, type, format, mipmap, min, mag, wrapS, wrapT} = value;
        let data = common.texture.read({regl, texture: value});

        return msgpack.encode({width, height, type, format, mipmap, min, mag, wrapS, wrapT, data});
      },
      function decode (buffer) {
        let {width, height, type, format, mipmap, min, mag, wrapS, wrapT, data} = msgpack.decode(buffer);
        return regl.texture({
          width, height, type, format, mipmap, min, mag, wrapS, wrapT, data
        });
      });

  msgpack.check = check;
  msgpack.wrap = wrap;

  return msgpack;
};

function check ({value}) {
  let {issues} = wrap({value, raise: false});
  return issues.length === 0;
}

function wrap ({value, raise = false}) {
  let TypedArrays = [ Int8Array,
                      Uint8Array,
                      Uint8ClampedArray,
                      Int16Array,
                      Uint16Array,
                      Int32Array,
                      Uint32Array,
                      Float32Array,
                      Float64Array];
  let goodTypes = [String, Number];

  // FIXME: reglTexture2D?
  let goodTests = [({value}) => (common.vtIsReglValue({value}) && value._reglType === 'reglTexture2D') ? common.ReglTextureWrapper : false];

  let issues = [];
  ({value, issues} = util.reducetree({
    value,
    visitor: function visitor ({value, path}) {
      let issues = [];

      for (let type of goodTypes) {
        if (Type.is(value, type)) {
          return {value, issues: []};
        }
      }

      for (let type of TypedArrays) {
        if (Type.is(value, type)) {
          return Buffer(value);
        }
      }

      for (let test of goodTests) {
        let Wrapper = test({value});
        if (Wrapper === false) {
          continue;
        }

        value = new Wrapper(value);
        return {value, issues: []};
      }

      if (value instanceof dynamic.Dynamic) {
        if (value.func) {
          issues.push(`At path="${path.join('.')}": Cannot serialize a dynamic.Dynamic` +
                      ` value if it is function-based: ${value.func}`);
          return {value: null, issues};
        }
        return {value, issues: []};
      }

      if (value instanceof Function) {
        issues.push(`At path="${path.join('.')}": Cannot serialize a Function`);
        return {value: null, issues};
      }

      if (common.vtIsNode({value})) {
        for (let key of Object.keys(value)) {
          let {issues: valueIssues} = value[key];
          assert(Type.is(valueIssues, Array));
          if (valueIssues.length > 0) {
            issues = issues.concat(valueIssues);
          }
        }

        if (issues.length > 0) {
          return {value: null, issues};
        }

        return {value, issues};
      }

      issues.push(`At path="${path.join('.')}": Cannot serialize a value of unknown type=${Type.string(value)}`);

      return {value: null, issues};
    }
  }));

  if (raise && issues.length > 0) {
    throw new common.PipelineError(issues.join('\n'));
  }

  return {value, issues};
}

module.exports.check = check;
module.exports.wrap = wrap;
