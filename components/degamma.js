
const {Group} = require('../regl-plumbing-component.js');


const code = `

  uniform float gamma;


  void mainImage (out vec4 fragColor, in vec2 fragCoord) {

    vec2 src_pos = vec2(iChannelViewport[0].xy) + vec2(fragCoord);

    vec2 src_uv = vec2(src_pos) / vec2(iChannelResolution[0].xy);

    fragColor = pow(texture2D(iChannel0, src_uv), vec4(gamma));
  }

`;

class Degamma extends Group {
  constructor ({pipeline}) {
    super({
      pipeline,
      group: [
        {
          name: 'shadertoy',
          component: 'shadertoy'
        }
      ]
    });

    this.compileSync = true;
    this.executeSync = true;
    this.reentrant = true;
    Object.freeze(this);
  }

  chain ({entry, shadertoy, exit}) {
    shadertoy.i.iChannel0 = entry.o.texture;
    shadertoy.i.framebuffer = entry.o.framebuffer;
    shadertoy.i.uniforms = {gamma: entry.o.gamma};
    shadertoy.i.code = code;

    exit.i.framebuffer = shadertoy.o.framebuffer;
  }
}

module.exports = Degamma;
