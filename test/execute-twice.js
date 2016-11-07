const createContext = require('gl');
const createREGL = require('regl');

const tape = require('tape');
const tapePromise = require('tape-promise').default;
const test = tapePromise(tape); // decorate tape

const {Pipeline} = require('../regl-plumbing.js');
const common = require('../regl-plumbing-common.js');

function lerp (a, b, t) {
  return a + (b - a) * t;
}

test('execute-twice', function (t) {
  const gl = createContext(16, 16, { preserveDrawingBuffer: true });
  const regl = createREGL(
    {
      gl: gl,
      optionalExtensions: []
    });

  let pipeline = new Pipeline({regl, resl: null});

  let width = 2;
  let height = 2;
  let channels = 4;

  let constant = pipeline.n('constant');

  let white = [1, 1, 1, 1];
  let red = [1, 0, 0, 1];
  let green = [0, 1, 0, 1];
  let blue = [0, 0, 1, 1];
  let gray = [0.5, 0.5, 0.5, 1];
  let alpha = [0.5, 0.5, 0.5, 0.5];

  let color = pipeline.dynamic(white);

  constant.i.color = color;
  constant.i.components = 'rgba';
  constant.i.out.resolution.wh = [width, height];
  constant.i.out.viewport.xy = [0, 0];
  constant.i.out.viewport.wh = [width, height];

  return Promise.resolve(constant.compile({recursive: true}))
    .then(function () {
      for (let testColor of [white, red, green, blue, gray, alpha]) {
        let testColor8 = testColor.map((v) => Math.round(lerp(0, 255, v)) | 0);
        color.update({value: testColor});

        constant.execute({recursive: true, sync: true});
        t.assert(constant.isCompiled());
        t.false(constant.compiling);
        t.false(constant.executing);

        let resultTexture = constant.o.__unbox__().getValue({runtime: 'dynamic'}).out.regl.texture;

        let result = common.texture.read({regl, texture: resultTexture});

        t.equal(result.length, width * height * channels);
        t.comment(`result: ${JSON.stringify(Array.from(result))}`);

        for (let x = 0; x < width; ++x) {
          for (let y = 0; y < height; ++y) {
            let index0 = y * width * channels + x * channels;

            let resultColor = [0, 0, 0, 0];
            for (let channel = 0; channel < channels; ++channel) {
              resultColor[channel] = result[index0 + channel];
            }

            t.deepEquals(resultColor, testColor8,
                          `Result background at x,y=${x},${y} should be ${JSON.stringify(testColor8)}` +
                          `, and is ${JSON.stringify(resultColor)}.`);
          }
        }
      }
    });
});

