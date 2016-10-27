
const resl = require('resl');
const regl = require('regl')({
  extensions: ['OES_texture_float', 'OES_texture_float_linear']
});
let {Pipeline} = require('../regl-plumbing.js');

let pipeline = new Pipeline({regl, resl});

let src = pipeline.n('resl-texture');

let degamma = pipeline.n('degamma');
let regamma = pipeline.n('regamma');
let gaussian = pipeline.n('gaussian-blur-adv');
let canvas = pipeline.n('canvas');

src.i.flipY = true;
src.i.src = 'https://raw.githubusercontent.com/realazthat/glsl-gaussian/master/assets/Storm%20Cell%20Over%20the%20Southern%20Appalachian%20Mountains-dsc_2303_0-256x256.png';

window.props = {};
window.props.gamma = pipeline.dynamic(2.2);

degamma.i.in = src.o;
degamma.i.gamma = window.props.gamma;
degamma.i.out.type = 'float32';

window.props.sigma = pipeline.dynamic(5);

gaussian.i.in = degamma.o.out;
gaussian.i.samples = 16;
gaussian.i.sigma = window.props.sigma;

regamma.i.in = gaussian.o.out;
regamma.i.gamma = window.props.gamma;
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

