
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
    let {pipeline} = this;

    let resolution = context.resolve(context.i.resolution);
    let format = context.resolve(context.i.format, 'rgba');
    let type = context.resolve(context.i.type, 'uint8');
    let min = context.resolve(context.i.min, 'nearest');
    let mag = context.resolve(context.i.mag, 'nearest');
    let wrapS = context.resolve(context.i.wrapS, 'clamp');
    let wrapT = context.resolve(context.i.wrapT, 'clamp');
    let mipmap = context.resolve(context.i.mipmap, false);
    let data = context.resolve(context.i.data, null);

    let viewport = context.shallow(context.i.viewport, {});

    viewport = {
      xy: viewport.hasOwnProperty('xy') ? viewport.xy : [0, 0],
      wh: viewport.hasOwnProperty('wh') ? viewport.wh : resolution.wh,
      wrapS: viewport.hasOwnProperty('wrapS') ? viewport.wrapS : 'none',
      wrapT: viewport.hasOwnProperty('wrapT') ? viewport.wrapT : 'none',
      border: viewport.hasOwnProperty('border') ? viewport.border : [0, 0, 0, 1]
    };

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

    let texture = pipeline.regl.texture(params);

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
