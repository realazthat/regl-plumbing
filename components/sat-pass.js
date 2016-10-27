
const {Group} = require('../regl-plumbing-component.js');

const nunjucks = require('nunjucks');


const template = `
  uniform ivec2 direction;
  uniform int pass;

  vec2 dst2src(vec2 dst_pos){
    // uv within the destination viewport
    vec2 dst_uv = (dst_pos - iViewport.xy)/iViewport.zw;


    return mix(iChannelViewport[0].xy, iChannelViewport[0].xy + iChannelViewport[0].zw, dst_uv);
  }


  vec4 pyramid_addition(vec4 t[{{samples}}]) {
    {% set levels = samples.toString(2).length %}
    {% for level in range(levels) %}
      {% set level_stride = (2 ** (level+1)) %}
      {% set level_samples = (samples // level_stride) %}

      {% for i in range(level_samples) %}
        t[{{i * level_stride}}] += t[{{i * level_stride + (level_stride // 2)}}];
      {% endfor %}
    {% endfor %}

    return t[0];
  }

  void mainImage (out vec4 fragColor, in vec2 fragCoord) {

    vec2 dst_pos0 = vec2(fragCoord);

    vec4 t[{{samples}}];

    for (int i = 0; i < {{samples}}; ++i) {
      int d = i * int(pow(float({{samples}}), float(pass)));

      vec2 dst_pos = dst_pos0 - vec2(d)*vec2(direction);
      vec2 src_pos = dst2src(dst_pos);

      vec2 src_uv = src_pos / iChannelResolution[0].xy;
      vec4 color = texture2D(iChannel0, src_uv);

      if (any(lessThan(src_pos, iChannelViewport[0].xy)) || any(greaterThanEqual(src_pos, iChannelViewport[0].xy + iChannelViewport[0].zw))){
        color = vec4(0);
      }

      t[i] = color;
    }

    vec4 result = pyramid_addition(t);
    // vec4 result = vec4(0);
    // for (int i = 0; i < {{samples}}; ++i) {
    //   result += t[i];
    // }

    fragColor = result;
  }
`;

class SATPass extends Group {
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

    compiler.i.samples = entry.o.samples;
    compiler.i.direction = entry.o.direction;
    compiler.i.pass = entry.o.pass;
    compiler.i.in = entry.o.in;
    compiler.i.out = entry.o.out;
    compiler.i.compile = pipeline.func(function compile ({context}) {
      let samples = context.resolve(context.i.samples);
      let direction = context.resolve(context.i.direction);

      let out = context.out({inTex: context.i.in, outTex: context.i.out});

      // let format = context.resolve(context.i.framebuffer.format);
      let type = context.resolve(out.type);

      if (type !== 'float32') {
        throw new pipeline.PipelineError('SAT should prolly be using float32 render targets for precision');
      }

      // let pass = context.resolve(context.i.pass);

      if (direction === 'vertical') {
        direction = [0, 1];
      } else if (direction === 'horizontal') {
        direction = [1, 0];
      }

      let code = nunjucks.renderString(template, {samples});

      return {
        code,
        direction,
        out
      };
    });

    shadertoy.i.iChannel0 = entry.o.in;
    shadertoy.i.out = compiler.o.out;
    shadertoy.i.uniforms.direction = compiler.o.direction;
    shadertoy.i.uniforms.pass = entry.o.pass;
    shadertoy.i.code = compiler.o.code;

    exit.i.out = shadertoy.o.out;
  }
}

module.exports = SATPass;
