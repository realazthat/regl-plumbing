
const {Group} = require('../regl-plumbing-component.js');
const nunjucks = require('nunjucks');

const template = `
  
  void mainImage (out vec4 fragColor, in vec2 fragCoord) {

    vec2 dst_uv = fragCoord.xy / iResolution.xy;

    vec2 lsrc_pos = mix(iChannelViewport[0].xy, iChannelViewport[0].xy+iChannelViewport[0].zw, dst_uv);

    vec2 lsrc_uv = vec2(lsrc_pos) / vec2(iChannelResolution[0].xy);

    vec2 rsrc_pos = mix(iChannelViewport[1].xy, iChannelViewport[1].xy+iChannelViewport[1].zw, dst_uv);

    vec2 rsrc_uv = vec2(rsrc_pos) / vec2(iChannelResolution[0].xy);

    fragColor.a = 1.0;
    fragColor.{{components}} = abs(texture2D(iChannel0, lsrc_uv).{{components}} - texture2D(iChannel1, rsrc_uv).{{components}});
  }

`;

class Delta extends Group {
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

    compiler.i.x = entry.o.x;
    compiler.i.y = entry.o.y;
    compiler.i.out = entry.o.out;
    compiler.i.components = entry.o.components;
    compiler.i.compile = pipeline.func(function ({context}) {
      let out = context.out({inTex: context.i.x, outTex: context.i.out});
      let components = context.shallow(context.i.components, 'rgb');

      let code = nunjucks.renderString(template, {components});
      return {out, code};
    });

    shadertoy.i.iChannel0 = entry.o.x;
    shadertoy.i.iChannel1 = entry.o.y;
    shadertoy.i.out = compiler.o.out;
    shadertoy.i.code = compiler.o.code;

    exit.i.out = shadertoy.o.out;
  }
}

module.exports = Delta;
