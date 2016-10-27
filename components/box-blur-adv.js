
const {Group} = require('../regl-plumbing-component.js');
const Type = require('type-of-is');
const nunjucks = require('nunjucks');

const template = `

  uniform vec2 window;

  vec2 dst2src(vec2 dst_pos){
    // uv within the destination viewport
    vec2 dst_uv = (dst_pos - iViewport.xy)/iViewport.zw;


    return mix(iChannelViewport[0].xy, iChannelViewport[0].xy + iChannelViewport[0].zw, dst_uv);
  }

  bool pos_inbounds(vec2 src_pos, vec4 viewport) {
    vec2 lower = viewport.xy;
    vec2 upper = (viewport.xy + viewport.zw);
    return !any(lessThan(src_pos, lower)) && !any(greaterThanEqual(src_pos, upper));
  }

  bool uv_inbounds(vec2 src_uv, vec4 viewport, vec2 resolution) {

    vec2 lower = viewport.xy/resolution;
    vec2 upper = (viewport.xy + viewport.zw)/resolution;
    return !any(lessThan(src_uv, lower)) && !any(greaterThanEqual(src_uv, upper));
  }

  vec4 texture2DiChannel0(vec2 uv) {
    vec2 resolution = iChannelResolution[0].xy;
    vec4 viewport = iChannelViewport[0];
    vec2 pixel_delta = vec2(1)/resolution;
    uv = clamp(uv, -pixel_delta/2.0, 1.0 - pixel_delta/2.0);
    if (!uv_inbounds(uv, viewport, resolution)) {
      return vec4(0);
    }

    vec2 vp_lower = viewport.xy / iChannelResolution[0].xy;
    vec2 vp_upper = (viewport.xy + viewport.zw) / iChannelResolution[0].xy;
    uv = mix(vp_lower, vp_upper, uv);

    return texture2D(iChannel0, uv);
  }


  float compute_area(vec2 src_lower_pos, vec2 src_upper_pos, vec4 viewport) {
    vec2 lower = viewport.xy;
    vec2 upper = lower + viewport.zw;

    src_lower_pos = clamp(src_lower_pos - vec2(0.5), lower, upper);
    src_upper_pos = clamp(src_upper_pos + vec2(0.5), lower, upper);

    return (src_upper_pos.x - src_lower_pos.x) * (src_upper_pos.y - src_lower_pos.y);
  }

  void mainImage (out vec4 fragColor, in vec2 fragCoord) {

    vec2 dst_pos = vec2(fragCoord);
    vec2 src_pos = dst2src(dst_pos);


    vec2 radius = (window - 1.0) / 2.0;

    vec2 uva = (src_pos - radius - 1.0) / iChannelResolution[0].xy;
    vec2 uvc = (src_pos + radius) / iChannelResolution[0].xy;
    vec2 uvb = vec2(uvc.x, uva.y);
    vec2 uvd = vec2(uva.x, uvc.y);


    vec2 spd = vec2(1)/iChannelResolution[0].xy;
    vec4 max_color = texture2D(iChannel0, iChannelResolution[0].xy - spd/2.0);
    vec4 this_color = texture2D(iChannel0, src_pos/iChannelResolution[0].xy);

    vec4 a = texture2DiChannel0(uva);
    vec4 b = texture2DiChannel0(uvb);
    vec4 c = texture2DiChannel0(uvc);
    vec4 d = texture2DiChannel0(uvd);

    vec4 total = c - b - d + a;

    float kernel_area = (window.x*window.y);

    {% if areaBehavior == 'clamp-area' %}
    float actual_kernel_area = compute_area(src_pos - radius, src_pos + radius, iChannelViewport[0]);
    {% else %}
    float actual_kernel_area = kernel_area;
    {% endif %}

    vec4 result = total / actual_kernel_area;

    fragColor = result;

  }
`;

class BoxBlurAdv extends Group {
  constructor ({pipeline}) {
    super({
      pipeline
    });

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
    let {pipeline} = this;

    compiler.i.sat = entry.o.sat;
    compiler.i.wrapA = entry.o.wrapA;
    compiler.i.window = entry.o.window;
    compiler.i.out = entry.o.out;

    compiler.i.compile = pipeline.func(function ({context}) {
      let wrapA = context.shallow(context.i.wrapA, 'clamp-area');

      let out = context.out({inTex: context.i.sat, outTex: context.i.out});

      let kernelWindow = context.map(context.i.window, (kernelWindow) => Type.is(kernelWindow, Array) ? kernelWindow : [kernelWindow, kernelWindow]);

      let code = nunjucks.renderString(template, {areaBehavior: wrapA});

      return {code, out, window: kernelWindow};
    });

    compiler.i.execute = pipeline.func(function ({context}) {
      let kernelWindow = context.resolve(context.i.window);
      let sat = context.resolve(context.i.sat);

      if (sat.mag !== 'linear' && !Number.isInteger(kernelWindow)) {
        throw new pipeline.PipelineError('Using a non-integer kernel window, but the SAT input is not using linear interpolation for mag');
      }
    });

    shadertoy.i.iChannel0 = entry.o.sat;
    shadertoy.i.out = compiler.o.out;
    shadertoy.i.code = compiler.o.code;
    shadertoy.i.uniforms.window = compiler.o.window;

    exit.i.out = shadertoy.o.out;
  }
}

module.exports = BoxBlurAdv;
