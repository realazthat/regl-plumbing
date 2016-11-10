
const {Component} = require('../regl-plumbing-component.js');

class ReslTexture extends Component {
  constructor ({pipeline}) {
    super({pipeline});
    this.compileSync = false;
    this.executeSync = true;
    this.reentrant = true;
    Object.freeze(this);
  }

  compile ({context}) {
    let {pipeline} = this;
    let input = context.resolve(context.i);

    let {src, flipY = true, format = 'rgba', type = 'uint8', min = 'nearest', mag = 'nearest', mipmap = false,
         wrapS = 'clamp', wrapT = 'clamp'} = input;

    let viewport = context.shallow(context.i.viewport, {});

    return new Promise(function (resolve, reject) {
      let params = {src};

      pipeline.resl({
        manifest: {
          texture: {
            src: src,
            type: 'image',
            parser: (data) => {
              params.data = data;
              params.width = data.width;
              params.height = data.height;
              params.min = min;
              params.mag = mag;
              params.format = format;
              params.type = type;
              params.flipY = flipY;
              params.mipmap = mipmap;
              params.wrapS = wrapS;
              params.wrapT = wrapT;

              return pipeline.regl.texture(params);
            }
          }
        },
        onDone: ({texture}) => {
          viewport = {
            xy: viewport.hasOwnProperty('xy') ? viewport.xy : [0, 0],
            wh: viewport.hasOwnProperty('wh') ? viewport.wh : [texture.width, texture.height],
            wrapS: viewport.hasOwnProperty('wrapS') ? viewport.wrapS : 'none',
            wrapT: viewport.hasOwnProperty('wrapT') ? viewport.wrapT : 'none',
            border: viewport.hasOwnProperty('border') ? viewport.border : [0, 0, 0, 1]
          };

          let resolution = {wh: [texture.width, texture.height]};
          return resolve({
            regl: {
              texture
            },
            resolution,
            viewport,
            format: format,
            type: type,
            min: min,
            mag: mag,
            wrapT: wrapT,
            wrapS: wrapS,
            mipmap: mipmap !== false
          });
        },
        onProgress: (progress, message) => {
        },
        onError: (err) => {
          return reject(err);
        }
      });
    });
  }
}

module.exports = ReslTexture;
