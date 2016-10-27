
const {Group} = require('../regl-plumbing-component.js');
const util = require('../regl-plumbing-util.js');

// function logb (base, v) {
//   return Math.log(v) / Math.log(base);
// }

class GaussianBlurAdv extends Group {
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
      }
    ];
  }

  chain ({entry, compiler, exit}) {
    let {pipeline} = this;

    compiler.i.samples = entry.o.samples;
    compiler.i.in = entry.o.in;
    compiler.i.sigma = entry.o.sigma;

    compiler.i.out = entry.o.out;

    compiler.i.compile = pipeline.func(function ({context}) {
      context.data.nodes = [];

      // let resolution = context.resolve(context.i.in.resolution);
      let samples = context.resolve(context.i.samples);
      let out = context.out({inTex: context.i.in, outTex: context.i.out});

      // http://www.peterkovesi.com/papers/FastGaussianSmoothing.pdf
      let sigma = context.map(context.i.sigma);
      let passes = 3;
      let n = passes;
      // let radii = [];
      let kernelWindows = [];

      // this is the ideal width/height of the kernel to obtain the sigma that we want.
      let wIdeal = context.map({sigma}, ({sigma}) => Math.sqrt(((12.0 * sigma * sigma) / n) + 1));

      // function oddFloor (value) {
      //   if (value < 1) {
      //     return 0;
      //   }
      //   value |= 0;
      //   value -= 1 | 0;
      //   value /= 2 | 0;
      //   value |= 0;
      //   value *= 2 | 0;
      //   value += 1 | 0;
      //   value |= 0;
      //   return value;
      // }

      // this is the implementation of the paper
      // let wL = context.map(wIdeal, (wIdeal) => oddFloor(wIdeal) | 0);
      // let wU = context.map(wIdeal, (wL) => (wL + 2) | 0);

      // let m = context.map({wL, sigma, n}, ({wL, sigma, n}) => (12 * sigma * sigma - n * wL * wL - 4 * n * wL - 3 * n) / (-4 * wL - 4));
      // m = Math.round(m) | 0;

      // for (let pass = 0; pass < passes; ++pass) {
      //   kernelWindows.push( context.map({pass, m, wL, wU}, ({pass, m, wL, wU}) => (pass < m ? wL : wU)) );
      // }

      // lets just use wIdeal the entire time, and use fractional radii (which will abuse interpolation within the SAT)
      for (let pass = 0; pass < passes; ++pass) {
        kernelWindows.push(context.map(wIdeal, (wIdeal) => wIdeal));
      }

      let lastTexture = context.shallow(context.i.in);

      let lastPass = passes - 1;
      for (let pass = 0; pass < passes; ++pass) {
        let sat = pipeline.n('sat');
        context.data.nodes.push(sat);

        sat.i.in = lastTexture;
        sat.i.out.type = 'float32';
        sat.i.out.mag = 'linear';
        sat.i.samples = samples;

        let advbox = pipeline.n('box-blur-adv');
        context.data.nodes.push(advbox);
        advbox.i.sat = sat.o.out;
        advbox.i.window = kernelWindows[pass];
        // advbox.i.window = context.map(radii[pass], (radius) => 2*radius + 1);

        if (pass === lastPass) {
          advbox.i.out = out;
        } else {
          advbox.i.out.type = 'float32';
          advbox.i.out.mag = 'nearest';
        }

        lastTexture = advbox.o.out;
      }

      // turn them into compile jobs
      let jobs = context.data.nodes.map(function (node) {
        let job = () => node.compile({recursive: false});
        return job;
      });

      // also add one last job that returns the result of this compile function
      jobs.push(function () {
        let result = lastTexture.__unbox__().getValue({runtime: 'static'});
        return {out: result};
      });

      return util.allSync(jobs);
    });

    compiler.i.destroy = pipeline.func(function ({context}) {
      if (context.data.nodes) {
        context.data.nodes.forEach((node) => {
          node.destroy();
        });

        context.data.nodes = [];
      }
    });

    compiler.i.execute = pipeline.func(function ({context}) {
      let jobs = context.data.nodes.map((node) => {
        let job = () => {
          return node.execute({recursive: false});
        };
        return job;
      });

      return util.allSync(jobs);
    });

    exit.i.out = compiler.o.out;
  }
}

module.exports = GaussianBlurAdv;
