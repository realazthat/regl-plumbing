
const {Group} = require('../component.js');



const funcs = {
  'scramble_space_to_synth_space': `
    highp ivec2 scramble_space_to_synth_space(
                    highp ivec2 scrambled_pos,
                    highp ivec2 subpass_shape,
                    highp ivec2 synth_size)
    {
        
      ivec2 scrambled_subpass_section_shape = ivec2(ceil(vec2(synth_size)/vec2(subpass_shape)));
      
      // the subpass this pixel is in simply depends on which section of the scrambled screen it is in.
      ivec2 subpass = scrambled_pos / scrambled_subpass_section_shape;
      
      // now that we know the subpass, we must calculate where the subpass is operating on
      // in the synth grid.
      // so first off, we need the location of the scrambled_pos within its section of the scrambled screen.
      // we could do that if a % operator was available, but it isn't, so we can use the \`subpass\`
      // result to multiply it back up and subtract to get the remainder.
      
      ivec2 scrambled_section_lower = subpass*scrambled_subpass_section_shape;
      ivec2 synth_subpass_lower = (scrambled_pos - scrambled_section_lower) * subpass_shape;
      
      return synth_subpass_lower + subpass;
    }

`
};

const code = `

  uniform ivec2 iSubpassShape;

  ${funcs.scramble_space_to_synth_space}

  void mainImage (out vec4 fragColor, in vec2 fragCoord) {
    // input viewport and output viewport are the same size.

    ivec2 synth_pos = scramble_space_to_synth_space(ivec2(fragCoord), iSubpassShape, ivec2(iChannelResolution[0].xy));

    ivec2 src_pos = ivec2(iChannelViewport[0].xy) + synth_pos;

    vec2 src_uv = vec2(src_pos) / vec2(iChannelResolution[0].xy);

    fragColor = texture2D(iChannel0, src_uv);
  }

`;

class Scramble extends Group {
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
  }

  chain ({entry, shadertoy, exit}) {
    shadertoy.i.iChannel0 = entry.o.texture;
    shadertoy.i.framebuffer = entry.o.framebuffer;
    shadertoy.i.uniforms = {iSubpassShape: entry.o.iSubpassShape};
    shadertoy.i.code = code;

    exit.i.framebuffer = shadertoy.o.framebuffer;
  }
}

module.exports = Scramble;
