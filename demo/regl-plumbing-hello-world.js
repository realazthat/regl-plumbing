
const resl = require('resl');
const regl = require('regl')();
let {Pipeline} = require('../regl-plumbing.js');

let pipeline = new Pipeline({regl, resl});

let src = pipeline.n('resl-texture');
let degamma = pipeline.n('degamma');
let regamma = pipeline.n('regamma');
let scramble = pipeline.n('mts-scramble');
let canvas = pipeline.n('canvas');

src.i.flipY = true;
src.i.src = 'https://raw.githubusercontent.com/realazthat/glsl-gaussian/master/assets/Storm%20Cell%20Over%20the%20Southern%20Appalachian%20Mountains-dsc_2303_0-256x256.png';

let gamma = pipeline.dynamic(2.2);
window.gamma = gamma;

degamma.i.in = src.o;
degamma.i.gamma = gamma;

scramble.i.in = degamma.o.out;
scramble.i.iSubpassShape = [3, 2];

regamma.i.in = scramble.o.out;
regamma.i.gamma = gamma;

canvas.i.in = regamma.o.out;
// canvas.i.in = src.o;

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

