
const {Group} = require('../regl-plumbing-component.js');
const nunjucks = require('nunjucks');

const template = `
  uniform float minimum;
  uniform float maximum;

  void mainImage (out vec4 fragColor, in vec2 fragCoord) {

    vec2 dst_uv = fragCoord.xy / iResolution.xy;

    vec2 src_pos = mix(iChannelViewport[0].xy, iChannelViewport[0].xy+iChannelViewport[0].zw, dst_uv);

    vec2 src_uv = vec2(src_pos) / vec2(iChannelResolution[0].xy);



    vec4 value = texture2D(iChannel0, src_uv);

    vec4 delta = vec4(maximum - minimum);
    vec4 t = (value - minimum) / delta;

    value = mix(vec4(0), vec4(1), t);

    fragColor.a = 1.0;
    fragColor.{{components}} = value.{{components}};
  }

`;

class Normalize extends Group {
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
    let {pipeline} = this;

    compiler.i.in = entry.o.in;
    compiler.i.out = entry.o.out;
    compiler.i.min = entry.o.min;
    compiler.i.max = entry.o.max;
    compiler.i.components = entry.o.components;
    compiler.i.compile = pipeline.func(function ({context}) {
      let out = context.out({inTex: context.i.in, outTex: context.i.out});
      let components = context.shallow(context.i.components, 'rgb');

      let minimum = context.shallow(context.i.min, 0.0);
      let maximum = context.shallow(context.i.max, 1.0);

      let code = nunjucks.renderString(template, {components});

      return {out, code, minimum, maximum};
    });

    shadertoy.i.iChannel0 = entry.o.in;
    shadertoy.i.out = compiler.o.out;
    shadertoy.i.code = compiler.o.code;
    shadertoy.i.uniforms.minimum = compiler.o.minimum;
    shadertoy.i.uniforms.maximum = compiler.o.maximum;

    exit.i.out = shadertoy.o.out;
  }
}

module.exports = Normalize;
