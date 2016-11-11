const resl = require('resl');
const regl = require('regl')({
  extensions: ['OES_texture_float', 'OES_texture_float_linear']
});
let {Pipeline} = require('../regl-plumbing.js');

let pipeline = new Pipeline({regl, resl});

let src = pipeline.n('resl-texture');
let degamma = pipeline.n('degamma');
let resample = pipeline.n('resample');
let regamma = pipeline.n('regamma');
let canvas = pipeline.n('canvas');

let gamma = 2.2;
// let method = 'lower-left';
let method = 'center';
// let method = 'average';
// let method = 'bounded-average';

src.i.flipY = true;
src.i.src = 'http://i.imgur.com/qvHfKLS.png';

degamma.i.in = src.o;
degamma.i.gamma = gamma;
degamma.i.out.min = 'linear';
degamma.i.out.mag = 'nearest';
// degamma.i.out.min = 'linear';
// degamma.i.out.mag = 'linear';
degamma.i.out.type = 'float32';

let [width, height] = [4096, 4096];
// let [width, height] = [32, 32];

resample.i.in = degamma.o.out;
resample.i.method = method;
resample.i.out.resolution.wh = [width, height];
resample.i.out.viewport.xy = [0, 0];
resample.i.out.viewport.wh = [width, height];
resample.i.out.min = 'nearest';
resample.i.out.mag = 'nearest';

regamma.i.in = resample.o.out;
regamma.i.gamma = gamma;
regamma.i.out = 'uint8';

canvas.i.in = regamma.o.out;

Promise.resolve(canvas.compile({recursive: true}))
  .then(function () {
    canvas.execute({recursive: true, sync: true});
  });
