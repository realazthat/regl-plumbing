const createContext = require('gl');
const createREGL = require('regl');

const tape = require('tape');
const tapePromise = require('tape-promise').default;
const test = tapePromise(tape); // decorate tape

const range = require('range');

const {Pipeline} = require('../regl-plumbing.js');
const common = require('../regl-plumbing-common.js');
const util = require('../regl-plumbing-util.js');

test('gaussian-blur-sep', function (t) {
  const gl = createContext(16, 16, { preserveDrawingBuffer: true });
  const regl = createREGL(
    {
      gl: gl,
      optionalExtensions: []
    });

  let pipeline = new Pipeline({regl, resl: null});

  let width = 16;
  let height = 16;
  let channels = 4;
  let center = [(width / 2) | 0, (height / 2) | 0];
  let radius = 3;
  let buffer = new Uint8Array(width * height * channels);

  for (let x = 0; x < width; ++x) {
    for (let y = 0; y < height; ++y) {
      for (let channel = 0; channel < channels; ++channel) {
        buffer[y * width * channels + x * channels + channel] = 0;
      }
    }
  }

  let jobs = [];

  for (let components of ['rgb', 'rgba']) {
    let sigma = pipeline.dynamic(5);

    // set the center pixel to all-white
    for (let channel = 0; channel < channels; ++channel) {
      buffer[(center[1] * width * channels) + (center[0] * channels) + channel] = 255;
    }

    let gaussian = pipeline.n('gaussian-blur-sep');
    let texture = pipeline.n('texture');

    texture.i.resolution = {wh: [width, height]};
    texture.i.data = buffer;

    gaussian.i.in = texture.o;
    gaussian.i.components = components;
    gaussian.i.sigma = sigma;
    gaussian.i.radius = radius;

    let bgcolor = [0, 0, 0, 0];

    // if the components selected are 'rgb', then the alpha channel will be 255
    bgcolor[3] = components === 'rgb' ? 255 : 0;

    jobs.push(function job () {
      return Promise.resolve(gaussian.compile({recursive: true}))
      .then(function () {
        for (let testSigma of [0.5, 0.8].concat(range.range(1, 10, 1))) {
          sigma.update({value: testSigma});

          gaussian.execute({recursive: true, sync: true});
          t.assert(gaussian.isCompiled());
          t.false(gaussian.compiling);
          t.false(gaussian.executing);

          let resultTexture = gaussian.o.__unbox__().getValue({runtime: 'dynamic'}).out.regl.texture;

          let result = common.texture.read({regl, texture: resultTexture});

          t.equal(result.length, buffer.length);

          for (let x = 0; x < width; ++x) {
            for (let y = 0; y < height; ++y) {
              let index0 = y * width * channels + x * channels;

              // is this pixel inside the radius
              let inside = (Math.abs(x - center[0]) <= radius) && (Math.abs(y - center[1]) <= radius);

              if (inside) {
                continue;
              }

              let resultColor = [0, 0, 0, 0];
              for (let channel = 0; channel < channels; ++channel) {
                resultColor[channel] = result[index0 + channel];
              }
              t.deepEquals(resultColor, bgcolor,
                            `Result background at x,y=${x},${y} should be black, and is ${JSON.stringify(resultColor)}.`);
            }
          }

          let kernel = [];
          let kernelWidth = radius * 2 + 1;
          let kernelHeight = radius * 2 + 1;

          for (let ry = -radius; ry <= radius; ++ry) {
            for (let rx = -radius; rx <= radius; ++rx) {
              const PI = 3.14159265359;
              let s = sigma.evaluate();
              let weight = Math.exp(-(rx * rx + ry * ry) / (2.0 * s * s)) / (2.0 * PI * s * s);

              let kernelIndex = (ry + radius) * kernelWidth + (rx + radius);
              t.assert(kernel.length === kernelIndex);
              kernel.push(0);
              kernel[kernelIndex] = weight;
            }
          }

          t.equal(kernel.length, kernelWidth * kernelWidth);

          for (let y = 0; y < kernelHeight; ++y) {
            let row = kernel.slice(y * (radius * 2 + 1), (y + 1) * (radius * 2 + 1));
            row = row.map((weight) => weight.toFixed(6));
            t.comment(`${JSON.stringify(row)}`);
          }

          for (let y = 0; y < height; ++y) {
            for (let x = 0; x < width; ++x) {
              let index0 = (y * width * channels) + (x * channels);

              // is this pixel inside the radius
              let inside = (Math.abs(x - center[0]) <= radius) && (Math.abs(y - center[1]) <= radius);

              if (!inside) {
                continue;
              }

              let color = [0, 0, 0, 0];
              let wsum = 0;
              let neighborhood = [];
              for (let ry = -radius; ry <= radius; ++ry) {
                for (let rx = -radius; rx <= radius; ++rx) {
                  let nx = x + rx;
                  let ny = y + ry;

                  if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
                    neighborhood.push(0);
                    continue;
                  }

                  let nindex0 = (ny * width * channels) + (nx * channels);

                  let kernelIndex = (ry + radius) * kernelWidth + (rx + radius);

                  let weight = kernel[kernelIndex];

                  let color0 = range.range(4).map((channel) => buffer[nindex0 + channel]);

                  for (let channel = 0; channel < channels; ++channel) {
                    color[channel] += color0[channel] * weight;
                  }
                  // t.comment(`x: ${x}, y: ${y}, rx: ${rx}, ry: ${ry}, nx: ${nx}, ny: ${ny}, nindex0: ${nindex0}, n_color[red]: ${color0[0]}`);
                  // t.comment(`conv_color[red]: ${color[0]}, sigma: ${sigma.evaluate()}, weight: ${weight.toFixed(6)}`);

                  neighborhood.push(buffer[nindex0 + 0]);
                  wsum += weight;
                }
              }
              // t.comment(`color sum: ${JSON.stringify(color)}, wsum: ${wsum}`);
              // t.comment(`color: ${JSON.stringify(color.map((c) => c / wsum))}`);

              for (let y = 0; y < kernelHeight; ++y) {
                let row = neighborhood.slice(y * (radius * 2 + 1), (y + 1) * (radius * 2 + 1));
                row = row.map((weight) => weight.toFixed(6));
                // t.comment(`red neighborhood: ${JSON.stringify(row)}`);
              }

              // t.comment('');

              let resultColor = [0, 0, 0, 0];
              for (let channel = 0; channel < channels; ++channel) {
                color[channel] /= wsum;
                // clamp it
                color[channel] = Math.max(Math.min(255, color[channel]), 0);
                // turn it into an integer
                color[channel] = Math.round(color[channel]) | 0;

                resultColor[channel] = result[index0 + channel];
              }

              // if the components selected are 'rgb', then the alpha channel will be 255
              color[3] = components === 'rgb' ? 255 : color[3];

              for (let channel = 0; channel < channels; ++channel) {
                t.assert(Math.abs(resultColor[channel] - color[channel]) < 2,
                        `Result color at x,y=${x},${y} with sigma ${sigma.evaluate()} should match the expected convolution result,` +
                        ` result: ${JSON.stringify(resultColor)}, color: ${JSON.stringify(color)}`);
              }
            }
          }
        }
      });
    });
  }

  return util.allSync(jobs);
});

