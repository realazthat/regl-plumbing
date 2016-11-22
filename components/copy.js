
const {Group} = require('../regl-plumbing-component.js');
const common = require('../regl-plumbing-common.js');
const nunjucks = require('nunjucks');
let texture2DiChannel0 = require('./lib/texture2DiChannel0.js');

let template = `
  ${texture2DiChannel0}

  void mainImage (out vec4 fragColor, in vec2 fragCoord) {
    vec2 dst_pos = vec2(fragCoord);

    vec2 dst_uv = (dst_pos - iViewport.xy)/iViewport.zw;

    vec2 src_pos = mix(iChannelViewport[0].xy,iChannelViewport[0].xy+iChannelViewport[0].zw,dst_uv);

    vec2 src_uv = src_pos / iChannelResolution[0].xy;

    fragColor = vec4(1);
    fragColor.{{components}} = texture2DiChannel0(src_uv).{{components}};
  }

`;

class Copy extends Group {
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
    compiler.i.compile = pipeline.func(function ({context}) {
      let iChannel0 = context.shallow(context.i.in);
      let components = context.resolve(context.i.components, 'rgb');

      common.texture.components.invalid({components, lvalue: true, raise: true});

      let code = nunjucks.renderString(template, {
        iChannel0, components
      });

      return {iChannel0, code, components};
    });

    shadertoy.i.iChannel0 = compiler.o.iChannel0;
    shadertoy.i.out = entry.o.out;
    shadertoy.i.code = compiler.o.code;

    exit.i.out = shadertoy.o.out;
  }

}

module.exports = Copy;
