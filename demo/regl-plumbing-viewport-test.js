
const resl = require('resl');
const regl = require('regl')({
  extensions: ['OES_texture_float', 'OES_texture_float_linear']
});
let {Pipeline} = require('../regl-plumbing.js');

let pipeline = new Pipeline({regl, resl});

let src = pipeline.n('resl-texture');
let large = pipeline.n('texture');

let degamma = pipeline.n('degamma');
let regamma = pipeline.n('regamma');
// let constant = pipeline.n('constant');
let gaussian = pipeline.n('gaussian-blur-sep');
let canvas = pipeline.n('canvas');

src.i.flipY = true;
src.i.src = 'https://raw.githubusercontent.com/realazthat/glsl-gaussian/master/assets/Storm%20Cell%20Over%20the%20Southern%20Appalachian%20Mountains-dsc_2303_0-256x256.png';

// let [width, height] = [4,4];
let [width, height] = [1024, 1024];
large.i.resolution.wh = [width, height];

window.props = {};
window.props.gamma = pipeline.dynamic(2.2);
window.props.color = pipeline.dynamic([0, 0, 0, 1]);
window.props.xy = pipeline.dynamic([0, 0]);

degamma.i.in = src.o;
degamma.i.gamma = window.props.gamma;
degamma.i.out.type = 'uint8';

// constant.i.in = degamma.o.out;
// constant.i.color = window.props.color;
// constant.i.out = large.o;
// constant.i.out.viewport.xy = window.props.xy;
// constant.i.out.viewport.wh = [256, 256];

gaussian.i.in = degamma.o.out;
gaussian.i.radius = 10;
gaussian.i.sigma = 4;
gaussian.i.out = large.o;
gaussian.i.out.viewport.xy = window.props.xy;
gaussian.i.out.viewport.wh = [(width / 4) | 0, (height / 4) | 0];

regamma.i.in = gaussian.o.out;
regamma.i.in.viewport = large.o.viewport;
regamma.i.gamma = window.props.gamma;
regamma.i.out.type = 'uint8';

canvas.i.in = regamma.o.out;

regl.frame(function ({time, drawingBufferWidth, drawingBufferHeight}) {
  if (canvas.executing) {
    return;
  }

  if (canvas.dirty && !canvas.compiling) {
    canvas.compile({recursive: true});
  }

  if (canvas.compiling) {
    return;
  }

  // let xy = [(time*drawingBufferWidth) % drawingBufferWidth, (time*drawingBufferHeight) % drawingBufferHeight];
  let xy = [(width / 2) | 0, (height / 2) | 0];
  window.props.xy.update({value: xy});
  canvas.execute({recursive: true});
});

