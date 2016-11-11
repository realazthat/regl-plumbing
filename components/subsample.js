
const {Group} = require('../regl-plumbing-component.js');
const nunjucks = require('nunjucks');
let inbound = require('./lib/inbound.js');
let texture2DiChannel0 = require('./lib/texture2DiChannel0.js');

let singleSampleTemplate = `
  
  uniform vec4 border_color;
  uniform vec2 sample_area;

  ${texture2DiChannel0}

  void mainImage(out vec4 fragColor, in vec2 fragCoord) {

    vec2 dst_pos = vec2(fragCoord);

    vec2 dst_uv = (dst_pos - iViewport.xy)/iViewport.zw;

    vec2 src_pos = mix(iChannelViewport[0].xy,iChannelViewport[0].xy+iChannelViewport[0].zw,dst_uv);


    vec2 src_center_sample_pos = src_pos;

    vec2 half_sample_area = sample_area/vec2(2);

    vec2 src_ll_sample_pos = src_center_sample_pos - half_sample_area + vec2(1.0/2.0);
    vec2 src_ur_sample_pos = src_ll_sample_pos + sample_area - vec2(1);
    vec2 src_ul_sample_pos = vec2(src_ll_sample_pos.x, src_ur_sample_pos.y);
    vec2 src_lr_sample_pos = vec2(src_ur_sample_pos.x, src_ll_sample_pos.y);

    {% if method === 'lower-left' %}
    vec2 src_sample_pos = src_ll_sample_pos;
    {% elif method === 'upper-right' %}
    vec2 src_sample_pos = src_ur_sample_pos;
    {% elif method === 'upper-left' %}
    vec2 src_sample_pos = src_ul_sample_pos;
    {% elif method === 'lower-right' %}
    vec2 src_sample_pos = src_lr_sample_pos;
    {% elif method === 'center' %}
    vec2 src_sample_pos = src_center_sample_pos;
    {% endif %}

    vec2 src_sample_uv = src_sample_pos/iChannelResolution[0].xy;

    fragColor = texture2DiChannel0(src_sample_uv);
  }

`;

let averageSampleTemplate = `
  
  uniform vec4 border_color;
  uniform vec2 sample_area;

  ${texture2DiChannel0}

  ${inbound}

  void mainImage (out vec4 fragColor, in vec2 fragCoord) {

    vec2 dst_pos = vec2(fragCoord);

    vec2 dst_uv = (dst_pos - iViewport.xy)/iViewport.zw;

    vec2 src_pos = mix(iChannelViewport[0].xy,iChannelViewport[0].xy+iChannelViewport[0].zw,dst_uv);


    vec2 src_center_sample_pos = src_pos;

    vec2 half_sample_area = sample_area/vec2(2);

    vec2 src_ll_sample_pos = src_center_sample_pos - half_sample_area + vec2(1.0/2.0);

    vec4 result = vec4(0);
    int count = 0;

    {% set width = sample_area[0] %}
    {% set height = sample_area[1] %}
    {% for x in range(width) %}
    {% for y in range(height) %}
    {
      vec2 src_sample_xy_pos = src_ll_sample_pos + vec2({{x}},{{y}});

      {% if method === 'bounded-average' %}
      if (inbound(src_sample_xy_pos, iChannelViewport[0])) {
        vec2 src_sample_xy_uv = src_sample_xy_pos / iChannelResolution[0].xy;
        count += 1;
        result += texture2D(iChannel0, src_sample_xy_uv);
      }
      {% else %}
      vec2 src_sample_xy_uv = src_sample_xy_pos / iChannelResolution[0].xy;
      count += 1;
      result += texture2DiChannel0(src_sample_xy_uv);
      {% endif %}
    }
    {% endfor %}
    {% endfor %}
    

    result /= float(count);

    fragColor = vec4(1);
    fragColor.{{components}} = result.{{components}};

    // fragColor = vec4(src_ll_sample_pos/iChannelResolution[0].xy,0,1);
  }

`;
class Subsample extends Group {
  constructor ({pipeline}) {
    super({pipeline});
    this.compileSync = true;
    this.executeSync = true;
    this.reentrant = true;
    Object.freeze(this);
  }

  elements () {
    return [
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

  chain ({entry, compiler, shadertoy, exit}) {
    const {pipeline} = this;

    compiler.i.in = entry.o.in;
    compiler.i.out = entry.o.out;
    compiler.i.area = entry.o.area;
    compiler.i.method = entry.o.method;
    compiler.i.components = entry.o.components;
    compiler.i.compile = pipeline.func(function ({context}) {
      let method = context.resolve(context.i.method);
      let components = context.resolve(context.i.components, 'rgb');

      let out = context.out({inTex: context.i.in, outTex: context.i.out});

      let inWH = context.resolve(context.i.in.viewport.wh);
      let outWH = context.resolve(out.viewport.wh);
      let area = [inWH[0] / outWH[0], inWH[1] / outWH[1]];
      area = context.resolve(context.i.area, area);
      area = [area[0] | 0, area[1] | 0];

      let code = null;

      let methods = new Set(['lower-left', 'lower-right', 'upper-left', 'upper-right', 'center', 'bounded-average', 'average']);

      if (!methods.has(method)) {
        throw new pipeline.PipelineError(`Invalid subsampling method, must be one of ${JSON.stringify(Array.from(methods))}, method=${method}`);
      }

      let mag = context.resolve(context.i.in.mag);

      if (method === 'center' && mag !== 'linear') {
        throw new pipeline.PipelineError('Cannot use method="center", the input texture must have mag="linear" to use method="center"');
      }

      if (method === 'lower-left' ||
          method === 'lower-right' ||
          method === 'upper-left' ||
          method === 'upper-right' ||
          method === 'center') {
        code = nunjucks.renderString(singleSampleTemplate, {
          method, sample_area: area, components, iChannel0: context.shallow(context.i.in)
        });
      } else if (method === 'average' || method === 'bounded-average') {
        code = nunjucks.renderString(averageSampleTemplate, {method, sample_area: area, components, iChannel0: context.shallow(context.i.in)});
      }

      return {code, out, area};
    });

    shadertoy.i.iChannel0 = entry.o.in;
    shadertoy.i.code = compiler.o.code;
    shadertoy.i.out = compiler.o.out;
    shadertoy.i.uniforms.border_color = entry.o.in.viewport.border;
    shadertoy.i.uniforms.sample_area = compiler.o.area;

    exit.i.out = shadertoy.o.out;
  }
}

module.exports = Subsample;
