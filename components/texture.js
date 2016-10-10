
const {Component} = require('../regl-plumbing-component.js');

class Texture extends Component {
  constructor ({pipeline}) {
    super({pipeline});
    this.compileSync = true;
    this.executeSync = true;
    this.reentrant = true;
  }

  compile ({context}) {
    // resolve the inputs statically
    let inputs = context.resolve(context.i);
    let {resolution, format = 'rgba', type = 'uint8', min = 'nearest', mag = 'nearest', mipmap = false} = inputs;

    let viewport = {wh: resolution.wh, xy: [0, 0]};

    let texture = this.pipeline.regl.texture({
      width: resolution.wh[0],
      height: resolution.wh[0],
      format,
      type,
      min,
      mag,
      mipmap
    });

    return {
      regl: {
        texture
      },
      resolution,
      viewport,
      format: format,
      type: type,
      min: min,
      mag: mag,
      mipmap: mipmap !== false
    };
  }
}

module.exports = Texture;
