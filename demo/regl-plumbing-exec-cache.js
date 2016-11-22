const assert = require('assert');
const resl = require('resl');
const regl = require('regl')({
  extensions: ['OES_texture_float', 'OES_texture_float_linear']
});
const {Pipeline} = require('../regl-plumbing.js');
const quad = require('glsl-quad');

let pipeline = new Pipeline({regl, resl});

let src = pipeline.n('resl-texture');
let degamma = pipeline.n('degamma');
let regamma = pipeline.n('regamma');
let canvas = pipeline.n('canvas');

let gamma = 2.2;

src.i.flipY = true;
// use the standard arrows bitmap
src.i.src = quad.bitmaps.directions.uri;

degamma.i.in = src.o;
degamma.i.gamma = gamma;
degamma.i.out.min = 'linear';
degamma.i.out.mag = 'linear';
degamma.i.out.type = 'float32';

regamma.i.in = degamma.o.out;
regamma.i.gamma = gamma;
regamma.i.out = 'uint8';
regamma.i.out.min = 'nearest';
regamma.i.out.mag = 'nearest';

canvas.i.in = regamma.o.out;

assert('__proxy__' in src);
assert('__proxy__' in degamma);
assert('__proxy__' in regamma);
assert('__proxy__' in canvas);
let relevants = new Set([src, degamma, regamma, canvas]);

// let us see which nodes execute
pipeline.on('node-executed', ({snode}) => {
  snode = snode.__box__();
  assert('__proxy__' in snode);
  if (relevants.has(snode)) {
    console.log(`${snode.component.name()} executed!`);
  }
});

Promise.resolve(canvas.compile({recursive: true}))
  .then(function () {
    // execute everything
    console.log('execute everything:');
    canvas.execute({recursive: true, sync: true});

    // only canvas itself should execute a second time (because it is not reentrant)
    console.log('only canvas itself should execute now (because it is not reentrant):');
    canvas.execute({recursive: true, sync: true});

    // nothing should execute here
    console.log('nothing should execute here:');
    degamma.execute({recursive: false, sync: true});

    // only degamma itself should execute here
    console.log('only degamma itself should execute here:');
    degamma.execute({recursive: false, sync: true, force: true});

    // only {regamma, canvas} itself should execute this time
    console.log('only {regamma, canvas} itself should execute this time:');
    canvas.execute({recursive: true, sync: true});
  });
