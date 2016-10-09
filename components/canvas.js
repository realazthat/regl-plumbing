
const {Component} = require('../component.js');
const quad = require('glsl-quad');

class Canvas extends Component {
  constructor ({pipeline}) {
    super({pipeline});
    this.compileSync = true;
    this.executeSync = true;
    this.reentrant = true;
  }

  compile ({context}) {
    let vert = `
    precision highp float;

    attribute vec2 a_position;
    varying vec2 v_uv;
    uniform float u_clip_y;

    void main() {
      v_uv = a_position * vec2(1, u_clip_y);
      v_uv = (v_uv + 1.0) / 2.0;

      gl_Position = vec4(a_position,0,1);
    }
    `;

    let frag = `
    precision highp float;
    
    vec2 lerp(vec2 a, vec2 b, vec2 t) {
      return a + (b-a)*t;
    }

    uniform sampler2D iChannel0;
    uniform vec4 iChannelViewport[4];
    uniform vec3 iChannelResolution[4];

    void mainImage (out vec4 fragColor, in vec2 fragCoord) {

      vec2 dst_uv = fragCoord.xy;

      vec2 vxy = iChannelViewport[0].xy;
      vec2 vwh = iChannelViewport[0].zw;
      vec2 src_xy = lerp(vxy, vxy+vwh, dst_uv);
      vec2 src_uv = src_xy / iChannelResolution[0].xy;

      fragColor = texture2D(iChannel0, src_uv);
    }

    varying vec2 v_uv;

    void main() {
      mainImage(gl_FragColor, v_uv);
    }
    `;

    // Pixel aspect ratio
    let PAR = 1.0;

    let iChannelViewport0 = [0, 0, 0, 0];
    let iChannelResolution0 = [0, 0, 0];
    iChannelViewport0[0] = context.map(context.i.texture.viewport.xy, (xy) => xy[0]);
    iChannelViewport0[1] = context.map(context.i.texture.viewport.xy, (xy) => xy[1]);
    iChannelViewport0[2] = context.map(context.i.texture.viewport.wh, (wh) => wh[0]);
    iChannelViewport0[3] = context.map(context.i.texture.viewport.wh, (wh) => wh[1]);
    iChannelResolution0[0] = context.map(context.i.texture.resolution.wh, (wh) => wh[0]);
    iChannelResolution0[1] = context.map(context.i.texture.resolution.wh, (wh) => wh[1]);
    iChannelResolution0[2] = PAR;

    let uniforms = {
      iChannel0: context.map(context.i.texture.regl.texture),
      u_clip_y: -1
    };

    for (let channel of [0, 1, 2, 3]) {
      uniforms[`iChannelViewport[${channel}]`] = [0, 0, 0, 0];
      uniforms[`iChannelResolution[${channel}]`] = [0, 0, 0];
    }

    uniforms['iChannelViewport[0]'] = iChannelViewport0;
    uniforms['iChannelResolution[0]'] = iChannelResolution0;

    let cmd = context.pipeline.regl({
      frag,
      vert,
      attributes: {
        a_position: quad.verts
      },
      elements: quad.indices,
      uniforms
      // viewport: {
      //   x: iViewport[0],
      //   y: iViewport[1],
      //   width: iViewport[2],
      //   height: iViewport[3]
      // }
    });

    context.data.cmd = cmd;

    return null;
  }

  execute ({context}) {
    context.data.cmd();
  }

}

module.exports = Canvas;
