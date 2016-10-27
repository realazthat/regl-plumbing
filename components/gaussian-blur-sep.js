
const {Group} = require('../regl-plumbing-component.js');
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
        name: 'hgaussian',
        component: 'gaussian-blur-sep-pass'
      },
      {
        name: 'vgaussian',
        component: 'gaussian-blur-sep-pass'
      }
    ];
  }

  chain ({entry, compiler, hgaussian, vgaussian, exit}) {
    let {pipeline} = this;

    compiler.i.in = entry.o.in;
    compiler.i.out = entry.o.out;

    compiler.i.compile = pipeline.func(function ({context}) {
      // we want a buffer just like `out` for the first step.
      let out = context.out({inTex: context.i.in, outTex: context.i.out, clone: true});

      return {out};
    });

    hgaussian.i.in = entry.o.in;
    hgaussian.i.direction = 'horizontal';
    hgaussian.i.sigma = entry.o.sigma;
    hgaussian.i.radius = entry.o.radius;
    hgaussian.i.out = compiler.o.out;

    vgaussian.i.in = hgaussian.o.out;
    vgaussian.i.direction = 'vertical';
    vgaussian.i.sigma = entry.o.sigma;
    vgaussian.i.radius = entry.o.radius;
    vgaussian.i.out = entry.o.out;

    exit.i.out = vgaussian.o.out;
  }
}

module.exports = GaussianBlurSep;
