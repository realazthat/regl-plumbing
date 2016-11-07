
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

    vec2 src_uv0 = src_pos0/iChannelResolution[0].xy;
    vec4 src_color0 = texture2D(iChannel0, src_uv0);

    highp float _2PIsqrt = sqrt(2.0*PI);
    highp float sigma_squared = sigma*sigma;
    highp float w[{{radius}} + 1];
    for (int i = 0; i <= {{radius}}; ++i) {
      highp float wi = exp(-float(i*i)/(2.0*sigma_squared)) / (_2PIsqrt*sigma);
      w[i] = wi;
    }


    vec4 result = vec4(0);
    float wsum = 0.0;

    // get the center pixel
    {
      float w0 = w[0];
      result += (src_color0 * w0);
      wsum += w0;
    }

    int count = 1;
    for (int i = 1; i <= {{radius}}; ++i) {
      float wi = w[i];

      for (int sign = -1; sign <= +1; sign += 2) {
        vec2 src_pos = src_pos0 + vec2(i*sign)*direction;


        if (!pos_inbounds(src_pos, iChannelViewport[0])) {
          // TODO: allow for different wrap behaviors here
          // * clamp
          // * repeat
          // * border color
          continue;
        }
        wsum += wi;

        count += 1;

        vec2 src_uv = src_pos / iChannelResolution[0].xy;

        vec4 src_color = texture2D(iChannel0, src_uv);

        result += (src_color*wi);
      }

    }

    fragColor = vec4(1);

    // fragColor = src_color0;
    fragColor.{{components}} = (result/wsum).{{components}};
    // fragColor = vec4(w[1]/wsum,1,1,1);
    // fragColor = result;
    // fragColor = vec4(float(count)/255.0,1,1,1);

    // fragColor = vec4(1,1,1,1);

    // if (!pos_inbounds(src_pos0, iChannelViewport[0])) {
    //   fragColor = vec4(0,0,0,1);
    // }

  }
`;

class GaussianBlurSepPass extends Group {
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
    compiler.i.components = entry.o.components;

    compiler.i.compile = pipeline.func(function ({context}) {
      let out = context.out({inTex: context.i.in, outTex: context.i.out});
      let direction = context.resolve(context.i.direction);
      let radius = context.resolve(context.i.radius);
      let sigma = context.map(context.i.sigma);
      let components = context.shallow(context.i.components, 'rgb');

      if (direction === 'horizontal') {
        direction = [1, 0];
      } else if (direction === 'vertical') {
        direction = [0, 1];
      } else {
        throw new pipeline.PipelineError(`gaussian.direction must be one of vertical or horizontal, "${direction}" is an invalid choice`);
      }

      let code = nunjucks.renderString(template, {radius: radius, components});

      return {code, out, sigma, direction};
    });
    compiler.i.execute = pipeline.func(function ({context}) {

    });

    shadertoy.i.iChannel0 = entry.o.in;
    shadertoy.i.out = compiler.o.out;
    shadertoy.i.code = compiler.o.code;
    shadertoy.i.uniforms.sigma = compiler.o.sigma;
    shadertoy.i.uniforms.direction = compiler.o.direction;

    exit.i.out = shadertoy.o.out;
  }
}

module.exports = GaussianBlurSepPass;
