
const {Group} = require('../regl-plumbing-component.js');


const code = `
  uniform float gamma;

  void mainImage (out vec4 fragColor, in vec2 fragCoord) {

    vec2 src_pos = vec2(iChannelViewport[0].xy) + vec2(fragCoord);

    vec2 src_uv = vec2(src_pos) / vec2(iChannelResolution[0].xy);

    fragColor = pow(texture2D(iChannel0, src_uv), vec4(1.0)/vec4(gamma));
  }

`;

class Regamma extends Group {
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

    compiler.i.compile = pipeline.func(function ({context}) {
      let out = context.out({inTex: context.i.in, outTex: context.i.out});

      return {
        out
      };
    });

    shadertoy.i.iChannel0 = entry.o.in;
    shadertoy.i.out = compiler.o.out;
    shadertoy.i.uniforms = {gamma: entry.o.gamma};
    shadertoy.i.code = code;

    exit.i.out = shadertoy.o.out;
  }
}

module.exports = Regamma;
