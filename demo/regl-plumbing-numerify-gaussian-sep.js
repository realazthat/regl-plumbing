
const resl = require('resl');
const regl = require('regl')({
  extensions: ['OES_texture_float', 'OES_texture_float_linear']
});
let {Pipeline} = require('../regl-plumbing.js');

let pipeline = new Pipeline({regl, resl});

let texture = pipeline.n('texture');
let vgaussian = pipeline.n('gaussian-blur-sep-pass');
let hgaussian = pipeline.n('gaussian-blur-sep-pass');
let numerify = pipeline.n('numerify');
let canvas = pipeline.n('canvas');

let [width, height] = [5, 5];
let center = [(width / 2) | 0, (height / 2) | 0];
let channels = 4;

let buffer = new Uint8Array(width * height * channels);

for (let y = 0; y < height; ++y) {
  for (let x = 0; x < width; ++x) {
    for (let channel = 0; channel < channels; ++channel) {
      let index0 = y * width * channels + x * channels;
      buffer[index0 * channels + channel] = 0;
    }
  }
}

for (let channel = 0; channel < channels; ++channel) {
  let centerIndex0 = center[1] * width * channels + center[0] * channels;
  buffer[centerIndex0 + channel] = 255;
}

texture.i.resolution = {wh: [width, height]};
texture.i.data = buffer;

hgaussian.i.in = texture.o;
hgaussian.i.radius = 2;
hgaussian.i.sigma = 0.8;
hgaussian.i.direction = 'horizontal';
vgaussian.i.in = hgaussian.o.out;
vgaussian.i.radius = 2;
vgaussian.i.sigma = 0.8;
vgaussian.i.direction = 'vertical';

numerify.i.in = vgaussian.o.out;
numerify.i.color = 'r';
numerify.i.cell = [16, 16];
numerify.i.multiplier = 255;
numerify.i.out.resolution.wh = [16 * width, 16 * height];
numerify.i.out.viewport.xy = [0, 0];
numerify.i.out.viewport.wh = [16 * width, 16 * height];

canvas.i.in = numerify.o.out;

regl.frame(function () {
  if (canvas.executing) {
    return;
  }

  if (canvas.dirty && !canvas.compiling) {
    canvas.compile({recursive: true});
  }

  if (canvas.compiling) {
    return;
  }

  canvas.execute({recursive: true});
});

