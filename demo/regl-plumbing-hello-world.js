
const resl = require('resl');
const regl = require('regl')();
let {Pipeline} = require('../regl-plumbing.js');

let pipeline = new Pipeline({regl, resl});

let src = pipeline.n('resl-texture');
let texture0 = pipeline.n('texture');
let texture1 = pipeline.n('texture');
let texture2 = pipeline.n('texture');
let fbo0 = pipeline.n('framebuffer');
let fbo1 = pipeline.n('framebuffer');
let fbo2 = pipeline.n('framebuffer');
let degamma = pipeline.n('degamma');
let regamma = pipeline.n('regamma');
let scramble = pipeline.n('mts-scramble');
let canvas = pipeline.n('canvas');

src.i.flipY = true;
src.i.src = 'https://raw.githubusercontent.com/realazthat/glsl-gaussian/master/assets/Storm%20Cell%20Over%20the%20Southern%20Appalachian%20Mountains-dsc_2303_0-256x256.png';
texture0.i.resolution = src.o.resolution;
texture1.i.resolution = src.o.resolution;
texture2.i.resolution = src.o.resolution;
fbo0.i.texture = texture0.o;
fbo0.i.depth = false;
fbo0.i.stencil = false;

fbo1.i.texture = texture1.o;
fbo1.i.depth = false;
fbo1.i.stencil = false;

fbo2.i.texture = texture2.o;
fbo2.i.depth = false;
fbo2.i.stencil = false;

let gamma = pipeline.dynamic(2.2);
window.gamma = gamma;

degamma.i.texture = src.o;
degamma.i.gamma = gamma;
degamma.i.framebuffer = fbo0.o;

scramble.i.texture = degamma.o.framebuffer;
scramble.i.framebuffer = fbo1.o;
scramble.i.iSubpassShape = [3, 2];

regamma.i.texture = scramble.o.framebuffer;
regamma.i.gamma = gamma;
regamma.i.framebuffer = fbo2.o;

canvas.i.texture = regamma.o.framebuffer;
// canvas.i.texture = src.o;

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

