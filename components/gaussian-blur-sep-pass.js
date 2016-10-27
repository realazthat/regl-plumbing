
const {Group} = require('../regl-plumbing-component.js');
const nunjucks = require('nunjucks');

const template = `
  uniform float sigma;
  uniform vec2 direction;

  const float PI = 3.14159265359;

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


  void mainImage (out vec4 fragColor, in vec2 fragCoord) {

    vec2 dst_pos = vec2(fragCoord);
    vec2 src_pos0 = dst2src(dst_pos);



    // vec4 t[{{samples}}];
    float wsum = 0.0;
    float w[{{samples}}];
    for (int i = -{{radius}}; i < {{radius}}; ++i) {
      vec2 src_pos = src_pos0 + vec2(i)*direction;

      if (!pos_inbounds(src_pos, iChannelViewport[0])) {
        w[{{radius}} + i] = 0.0;
        continue;
      }

      float wi = (1.0/(sqrt(2.0*PI)*sigma)) * exp(-float(i*i)/(2.0*sigma*sigma));
      w[{{radius}} + i] = wi;
      wsum += wi;
    }

    vec4 result = vec4(0);

    for (int i = -{{radius}}; i < {{radius}}; ++i) {
      vec2 src_pos = src_pos0 + vec2(i)*direction;

      vec2 src_uv = src_pos / iChannelResolution[0].xy;

      vec4 src_color = texture2D(iChannel0, src_uv);

      float wi = w[{{radius}} + i];
      result += (src_color*wi)/wsum;
    }

    fragColor = result;

  }
`;

class GaussianBlurSep extends Group {
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

    compiler.i.in = entry.o.in;
    compiler.i.radius = entry.o.radius;
    compiler.i.sigma = entry.o.sigma;
    compiler.i.direction = entry.o.direction;
    compiler.i.out = entry.o.out;

    compiler.i.compile = pipeline.func(function ({context}) {
      let out = context.out({inTex: context.i.in, outTex: context.i.out});
      let direction = context.resolve(context.i.direction);
      let radius = context.resolve(context.i.radius);
      let sigma = context.map(context.i.sigma);

      if (direction === 'horizontal') {
        direction = [1, 0];
      } else if (direction === 'vertical') {
        direction = [0, 1];
      } else {
        throw new pipeline.PipelineError(`gaussian.direction must be one of vertical or horizontal, "${direction}" is an invalid choice`);
      }

      let code = nunjucks.renderString(template, {radius: radius, samples: radius * 2 + 1});

      return {code, out, sigma, direction};
    });

    shadertoy.i.iChannel0 = entry.o.in;
    shadertoy.i.out = compiler.o.out;
    shadertoy.i.code = compiler.o.code;
    shadertoy.i.uniforms.sigma = compiler.o.sigma;
    shadertoy.i.uniforms.direction = compiler.o.direction;

    exit.i.out = shadertoy.o.out;
  }
}

module.exports = GaussianBlurSep;
