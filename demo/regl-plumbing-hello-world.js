
const resl = require('resl');
const regl = require('regl')();
let {Pipeline} = require('../regl-plumbing.js');

let pipeline = new Pipeline({regl, resl});

let src = pipeline.n('resl-texture');
let texture = pipeline.n('texture');
let fbo = pipeline.n('framebuffer');
let scramble = pipeline.n('mts-scramble');
let canvas = pipeline.n('canvas');

src.i.flipY = true;
src.i.src = 'https://raw.githubusercontent.com/realazthat/glsl-gaussian/master/assets/Storm%20Cell%20Over%20the%20Southern%20Appalachian%20Mountains-dsc_2303_0-256x256.png';
texture.i.resolution = src.o.resolution;
fbo.i.texture = texture.o;
fbo.i.depth = false;
fbo.i.stencil = false;
scramble.i.texture = src.o;
scramble.i.framebuffer = fbo.o;
scramble.i.iSubpassShape = [3, 2];

// canvas.i.texture = scramble.o.framebuffer;
canvas.i.texture = src.o;

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

