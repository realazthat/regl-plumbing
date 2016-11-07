
const {Group} = require('../regl-plumbing-component.js');
const nunjucks = require('nunjucks');

const template = `
  uniform vec4 color;

  void mainImage (out vec4 fragColor, in vec2 fragCoord) {

    fragColor = vec4(1);
    fragColor.{{components}} = color.{{components}};
  }

`;

class Constant extends Group {
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
    compiler.i.components = entry.o.components;
    compiler.i.compile = pipeline.func(function ({context}) {
      let out = context.out({inTex: context.i.in, outTex: context.i.out});
      let components = context.shallow(context.i.components, 'rgb');

      let code = nunjucks.renderString(template, {components});
      return {out, code};
    });

    shadertoy.i.out = compiler.o.out;
    shadertoy.i.code = compiler.o.code;
    shadertoy.i.uniforms.color = entry.o.color;

    exit.i.out = shadertoy.o.out;
  }
}

module.exports = Constant;
