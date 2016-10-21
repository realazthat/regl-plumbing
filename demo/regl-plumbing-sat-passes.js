
const resl = require('resl');
const regl = require('regl')({
  extensions: ['OES_texture_float']
});
let {Pipeline} = require('../regl-plumbing.js');

let pipeline = new Pipeline({regl, resl});

let src = pipeline.n('resl-texture');

let degamma = pipeline.n('degamma');
let regamma = pipeline.n('regamma');
let satpass0 = pipeline.n('sat-pass');
let satpass1 = pipeline.n('sat-pass');
let satpass2 = pipeline.n('sat-pass');
let satpass3 = pipeline.n('sat-pass');
let canvas = pipeline.n('canvas');

src.i.flipY = true;
src.i.src = 'https://raw.githubusercontent.com/realazthat/glsl-gaussian/master/assets/Storm%20Cell%20Over%20the%20Southern%20Appalachian%20Mountains-dsc_2303_0-256x256.png';

let gamma = pipeline.dynamic(2.2);
window.gamma = gamma;

degamma.i.in = src.o;
degamma.i.gamma = gamma;

satpass0.i.in = degamma.o.out;
satpass0.i.out.type = 'float32';
satpass0.i.direction = 'vertical';
satpass0.i.samples = 16;
satpass0.i.pass = 0;

satpass1.i.in = satpass0.o.out;
satpass3.i.out.type = 'float32';
satpass1.i.direction = 'vertical';
satpass1.i.samples = 16;
satpass1.i.pass = 1;

satpass2.i.in = satpass1.o.out;
satpass2.i.out.type = 'float32';
satpass2.i.direction = 'horizontal';
satpass2.i.samples = 16;
satpass2.i.pass = 0;

satpass3.i.in = satpass2.o.out;
satpass3.i.out.type = 'float32';
satpass3.i.direction = 'horizontal';
satpass3.i.samples = 16;
satpass3.i.pass = 1;

regamma.i.in = satpass3.o.out;
regamma.i.gamma = gamma;
regamma.i.out.type = 'uint8';

canvas.i.in = regamma.o.out;

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

