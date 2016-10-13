
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
    let input = context.resolve(context.i);

    let {src, flipY = true, format = 'rgba', type = 'uint8', min = 'nearest', mag = 'nearest', mipmap = false,
         wrapS = 'clamp', wrapT = 'clamp'} = input;

    let component = this;

    return new Promise(function (resolve, reject) {
      let params = {src};

      component.pipeline.resl({
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

              return component.pipeline.regl.texture(params);
            }
          }
        },
        onDone: ({texture}) => {
          let viewport = {
            xy: [0, 0],
            wh: [texture.width, texture.height]
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
