
const {Group} = require('../regl-plumbing-component.js');

const nunjucks = require('nunjucks');


const template = `

    uniform float multiplier;
    uniform vec2 destination_cell_size;

    vec2 dst2src(vec2 dst_pos){
      // uv within the destination viewport
      vec2 dst_uv = (dst_pos - iViewport.xy)/iViewport.zw;


      return mix(iChannelViewport[0].xy, iChannelViewport[0].xy + iChannelViewport[0].zw, dst_uv);
    }

    void mainImage (out vec4 fragColor, in vec2 fragCoord) {

      vec2 dst_pos = fragCoord;
      vec2 dst_uv = (dst_pos - iViewport.xy) / iViewport.zw;
      vec2 src_pos = dst2src(dst_pos);
      vec2 src_uv = src_pos / iChannelResolution[0].xy;


      vec2 src_view_lower = iChannelViewport[0].xy;
      vec2 src_view_wh = iChannelViewport[0].zw;
      vec2 src_view_upper = src_view_lower + src_view_wh;


      // width of 4. 4 = 3 pixels for the digit, one pixel for white space.
      const vec2 digit_size = vec2(4,7);
      // hardcoded expected size in pixels of the digits texture.
      const vec2 digit_texture_size = vec2(64, 64);
      // the size, in pixels, of the source texture.
      // const vec2 source_size = {sourceSize};
      // the size of each cell in the destination texture.
      // const vec2 destination_cell_size = {destinationCellSize};
      // the size of the destination texture.
      // const vec2 destination_size = {destinationSize};
      // the size required for displaying the source image, given the destination cell size.
      vec2 destination_view_size = src_view_wh * destination_cell_size;




      highp vec2 screen_rel_pixel = floor(dst_pos);
      highp vec2 screen_rel_cell = floor(screen_rel_pixel / destination_cell_size);
      highp vec2 screen_rel_cell_lower_pixel = screen_rel_cell * destination_cell_size;
      highp vec2 screen_rel_cell_upper_pixel = screen_rel_cell_lower_pixel + destination_cell_size;
      highp vec2 screen_rel_cell_center_pixel = screen_rel_cell_lower_pixel + (destination_cell_size / 2.0);
      highp vec2 cell_rel_offset_pixel = screen_rel_pixel - screen_rel_cell_lower_pixel;
      highp vec2 src_view_uv = (screen_rel_cell + .5)/src_view_wh;
      vec2 source_uv = mix(src_view_lower, src_view_upper, src_view_uv) / iChannelResolution[0].xy;
      fragColor = vec4(1,1,1,1);
      if (any(greaterThan(screen_rel_pixel, destination_view_size)))
        return;
      if (any(lessThan(cell_rel_offset_pixel, vec2(1))) || any(greaterThan(cell_rel_offset_pixel, destination_cell_size)))
      {
        fragColor = vec4(0,0,1,1);
        return;
      }
      vec4 source_pixel = texture2D(iChannel0, source_uv);
      vec4 denormed_source_value = source_pixel*multiplier;
      float cell_rel_right_offset_pixel = destination_cell_size.x - 1.0 - cell_rel_offset_pixel.x;
      int digit_index = int(floor(cell_rel_right_offset_pixel / digit_size.x));
      int digit_rel_x = int(digit_size.x) - int(floor(mod(cell_rel_right_offset_pixel, digit_size.x)));
      /// center of cell, plus half digit hight.
      int cell_rel_digit_bottom_y = int((destination_cell_size.y / 2.0) + digit_size.y / 2.0);
      int cell_rel_dist_from_digit_bottom = cell_rel_digit_bottom_y - int(cell_rel_offset_pixel.y);
      int sigdigits = int(floor(denormed_source_value.{{component}} / pow(10.0, float(digit_index))));
      if (sigdigits == 0)
          return;
      int digit = int(mod(float(sigdigits), 10.0));
      vec2 digits_uv = vec2(float(digit)*digit_size.x, digit_size.y - float(cell_rel_dist_from_digit_bottom)) / digit_texture_size;
      float cell_top_border = floor((destination_cell_size.y - digit_size.y) / 2.0);
      // digits_uv = (vec2((digit*int(digit_size.x)) + digit_rel_x,  destination_cell_size.y -  cell_top_border - cell_rel_offset_pixel.y) + vec2(.5))/digit_texture_size;
      digits_uv = (vec2((digit*int(digit_size.x)) + digit_rel_x, cell_rel_offset_pixel.y - cell_top_border) + vec2(.5))/digit_texture_size;
      fragColor = texture2D(iChannel1, digits_uv);
    }

`;



const dataUri = `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqa
                 XHeAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAAEnQAABJ0
                 Ad5mH3gAAADPSURBVHhe7ZRBCsMwEMT6kB77/5/1DSktsyEsMTVtfJIEjlg2vuj
                 g2wbHADEWA8RYDBBjMUCMxQAxFgPEWAwQYzFAjMUAMRYDxFgMEGMxQIzFADEWA8
                 RYDBBjMUCMxQAxFgPEWAwQYzFAjMUAMRYDxFgMEGMxQIzFADEWA8RYDBBjMUCMx
                 QDvz/P+2M+Rmvv+bO7u+3/mlewBji5m55GLPhff7o/uXclUgLfrXDEXo32fVzId
                 4IzR/0W//+t+JZe8AcVo3+didr+STwAu2/YCo1QMoniycvMAAAAASUVORK5CYII
                 =`.replace(/\s*/g, '');

class Numerify extends Group {
  constructor ({pipeline}) {
    super({
      pipeline
    });

    this.compileSync = true;
    this.executeSync = true;
    this.reentrant = true;
    this.safe = true;

    Object.freeze(this);
  }

  elements () {
    return [
      {
        name: 'digits',
        component: 'resl-texture'
      },
      {
        name: 'compiler',
        component: 'fcomponent'
      },
      {
        name: 'shadertoy',
        component: 'shadertoy'
      }
    ];
  }

  chain ({entry, digits, compiler, shadertoy, exit}) {
    let {pipeline} = this;

    digits.i.flipY = true;
    digits.i.src = dataUri;

    compiler.i.in = entry.o.in;
    compiler.i.out = entry.o.out;
    compiler.i.color = entry.o.color;

    compiler.i.compile = pipeline.func(function ({context}) {
      let out = context.out({inTex: context.i.in, outTex: context.i.out});
      let color = context.resolve(context.i.color);

      if (color !== 'r' && color !== 'g' && color !== 'b' && color !== 'a') {
        throw new pipeline.PipelineError(`numerify.i.color must be one of r,g,b,a, not "${color}"`);
      }

      let code = nunjucks.renderString(template, {component: color});

      return {out, code};
    });

    shadertoy.i.iChannel0 = entry.o.in;
    shadertoy.i.iChannel1 = digits.o;
    shadertoy.i.out = compiler.o.out;
    shadertoy.i.code = compiler.o.code;
    shadertoy.i.uniforms.multiplier = entry.o.multiplier;
    shadertoy.i.uniforms.destination_cell_size = entry.o.cell;

    exit.i.out = shadertoy.o.out;
  }
}

module.exports = Numerify;
