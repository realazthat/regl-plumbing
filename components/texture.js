
const {Component} = require('../regl-plumbing-component.js');

class Texture extends Component {
  constructor ({pipeline}) {
    super({pipeline});
    this.compileSync = true;
    this.executeSync = true;
    this.reentrant = true;
    Object.freeze(this);
  }

  compile ({context}) {
    // resolve the inputs statically
    let inputs = context.resolve(context.i);
    let {resolution, format = 'rgba', type = 'uint8', min = 'nearest', mag = 'nearest', wrapT = 'clamp', wrapS = 'clamp',
                     mipmap = false, data = null} = inputs;

    let viewport = {wh: resolution.wh, xy: [0, 0]};

    let params = {
      width: resolution.wh[0],
      height: resolution.wh[0],
      format,
      type,
      min,
      mag,
      wrapS,
      wrapT,
      mipmap
    };

    if (data !== null) {
      params.data = data;
    }

    let texture = this.pipeline.regl.texture(params);

    return {
      regl: {
        texture
      },
      resolution,
      viewport,
      format,
      type,
      min,
      mag,
      wrapS,
      wrapT,
      mipmap: mipmap !== false
    };
  }
}

module.exports = Texture;
