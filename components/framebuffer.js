
const {Component} = require('../regl-plumbing-component.js');

class Framebuffer extends Component {
  constructor ({pipeline}) {
    super({pipeline});
    this.compileSync = true;
    this.executeSync = true;
    this.reentrant = true;
  }

  compile ({context}) {
    let texture = context.resolve(context.i.texture.regl.texture);
    let depth = context.resolve(context.i.depth);
    let stencil = context.resolve(context.i.stencil);

    let framebuffer = this.pipeline.regl.framebuffer({
      color: texture,
      depth,
      stencil
    });

    return {
      regl: {
        framebuffer: framebuffer,
        texture: context.map(context.i.texture.regl.texture)
      },
      resolution: context.map(context.i.texture.resolution),
      viewport: context.i.texture.viewport,
      format: context.map(context.i.texture.format),
      type: context.map(context.i.texture.type),
      min: context.map(context.i.texture.min),
      mag: context.map(context.i.texture.mag),
      mipmap: context.map(context.i.texture.mag)
    };
  }

  execute ({compiled}) {

  }
}

module.exports = Framebuffer;
