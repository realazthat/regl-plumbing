
const {Group} = require('../regl-plumbing-component.js');
const util = require('../regl-plumbing-util.js');

function logb (base, v) {
  return Math.log(v) / Math.log(base);
}

class SAT extends Group {
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

    compiler.i.out = entry.o.out;

    compiler.i.compile = pipeline.func(function ({context}) {
      context.data.nodes = [];

      let resolution = context.resolve(context.i.in.resolution);
      let res = Math.max(resolution.wh[0], resolution.wh[1]);
      let samples = context.resolve(context.i.samples);
      let out = context.out({inTex: context.i.in, outTex: context.i.out});

      // samples^passes >= res
      // passes * log_2 samples >= res
      // passes >= res / (log_2 samples)
      let passes = Math.ceil(logb(samples, res)) | 0;

      let satpasses = [];
      let lastTexture = context.shallow(context.i.in);

      for (let direction of ['vertical', 'horizontal']) {
        for (let pass = 0; pass < passes; ++pass) {
          let satpass = pipeline.n('sat-pass');
          satpasses.push(satpass);

          satpass.i.pass = pass;
          satpass.i.in = lastTexture;
          satpass.i.direction = direction;
          satpass.i.samples = samples;

          let lastPass = pass === passes - 1 && direction === 'horizontal';

          if (lastPass) {
            satpass.i.out = out;
          } else {
            satpass.i.out.type = 'float32';
          }

          lastTexture = satpass.o.out;
        }
      }

      // remember all the nodes in the subgraph that this node is responsible for
      satpasses.forEach(function (node) {
        context.data.nodes.push(node);
      });

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

module.exports = SAT;
