
const {Group} = require('../regl-plumbing-component.js');

class Resample extends Group {
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
      }
    ];
  }

  chain ({entry, compiler, exit}) {
    const {pipeline} = this;

    compiler.i.in = entry.o.in;
    compiler.i.out = entry.o.out;
    compiler.i.sigmaRadiusFactor = entry.o.sigmaRadiusFactor;
    compiler.i.method = entry.o.method;

    compiler.i.compile = pipeline.func(function ({context}) {
      // get the static data about the input texture
      let inTex = context.shallow(context.i.in);
      // obtain the output texture
      let outTex = context.out({inTex: context.i.in, outTex: context.i.out});
      let sigmaRadiusFactor = context.resolve(context.i.sigmaRadiusFactor, 3);
      let method = context.resolve(context.i.method, 'center');

      // get the input viewport size
      let inWH = context.resolve(inTex.viewport.wh);

      // get the output viewport size
      let outWH = context.resolve(outTex.viewport.wh);

      // see if any axis needs downsampling
      let downsample = inWH[0] > outWH[0] || inWH[1] > outWH[1];

      // see if any axis needs upsampling
      // let upsample = inWH[0] < outWH[0] || inWH[1] < outWH[1];

      context.data.nodes = [];

      if (downsample) {
        let gaussian = pipeline.n('gaussian-blur-sep');
        let subsample = pipeline.n('subsample');
        context.data.nodes.push(gaussian);
        context.data.nodes.push(subsample);

        let factor = [inWH[0] / outWH[0], inWH[1] / outWH[1]];

        let sigma = [Math.sqrt(factor[0]), Math.sqrt(factor[1])];

        gaussian.i.in = inTex;
        gaussian.i.radius = sigma.map((s) => Math.ceil(s * sigmaRadiusFactor) | 0);
        gaussian.i.sigma = sigma;

        subsample.i.in = gaussian.o.out;
        subsample.i.out = outTex;
        subsample.i.area = factor;
        subsample.i.method = method;
      } else {
        let copy = pipeline.n('copy');
        context.data.nodes.push(copy);

        copy.i.in = inTex;
        copy.i.out = outTex;
      }

      context.data.nodes.forEach((node) => node.compile({recursive: false, sync: true}));

      return {out: outTex};
    });

    compiler.i.execute = pipeline.func(function ({context}) {
      context.data.nodes.forEach((node) => node.execute({recursive: false, sync: true}));
    });

    compiler.i.destroy = pipeline.func(function ({context}) {
      if (!(context.data.nodes instanceof Array)) {
        return;
      }
      context.data.nodes.forEach((node) => node.destroy());
      context.data.nodes = [];
    });

    exit.i.out = compiler.o.out;
  }
}

module.exports = Resample;
