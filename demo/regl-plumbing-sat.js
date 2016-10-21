
const resl = require('resl');
const regl = require('regl')({
  extensions: ['OES_texture_float']
});
let {Pipeline} = require('../regl-plumbing.js');

let pipeline = new Pipeline({regl, resl});

let src = pipeline.n('resl-texture');

let degamma = pipeline.n('degamma');
let regamma = pipeline.n('regamma');
let sat = pipeline.n('sat');
let canvas = pipeline.n('canvas');

src.i.flipY = true;
src.i.src = 'https://raw.githubusercontent.com/realazthat/glsl-gaussian/master/assets/Storm%20Cell%20Over%20the%20Southern%20Appalachian%20Mountains-dsc_2303_0-256x256.png';

let gamma = pipeline.dynamic(2.2);
window.gamma = gamma;

degamma.i.in = src.o;
degamma.i.gamma = gamma;

sat.i.in = degamma.o.out;
sat.i.samples = 16;
sat.i.out.type = 'float32';

regamma.i.in = sat.o.out;
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

