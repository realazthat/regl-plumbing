const resl = require('resl');
const regl = require('regl')({
  extensions: ['OES_texture_float', 'OES_texture_float_linear']
});
const {Pipeline} = require('../regl-plumbing.js');
const $ = require('jquery');
const quad = require('glsl-quad');

// make a div, and put it somewhere on the screen.
let $div = $('<div id="mydiv">');

$div.css('position', 'absolute')
    .css('width', '100px')
    .css('height', '100px')
    .css('top', '150px')
    .css('left', '150px')
    // paint the div black so we can see if it leaks through somehow
    .css('background-color', 'black')
    .appendTo('body');

// get access to the canvas regl created
let $canvas = $('body > canvas');

$canvas.css('z-index', '1000')
        .css('position', 'fixed')
        .css('top', '0px')
        .css('height', '100%')
        .css('touch-action', 'none')
        .css('pointer-events', 'none');

let pipeline = new Pipeline({regl, resl});

let src = pipeline.n('resl-texture');
let degamma = pipeline.n('degamma');
let regamma = pipeline.n('regamma');
let div = pipeline.n('div');

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

// connect the div component
div.i.in = regamma.o.out;
div.i.target = $div;
div.i.canvas = $canvas;

Promise.resolve(div.compile({recursive: true}))
  .then(function () {
    function draw () {
      console.log('drawing');
      div.execute({recursive: true, sync: true});
    }
    $canvas.on('resize', draw);
    $($div).on('resize', draw);
    $(window).on('resize', draw);
    $(window).on('scroll', draw);
    $canvas.on('scroll', draw);
    $(window).on('click', draw);
    draw();
  });
