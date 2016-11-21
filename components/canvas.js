
const {Component} = require('../regl-plumbing-component.js');
const common = require('../regl-plumbing-common.js');
const quad = require('glsl-quad');

class Canvas extends Component {
  constructor ({pipeline}) {
    super({pipeline});
    this.compileSync = true;
    this.executeSync = true;
    this.reentrant = true;


    Object.freeze(this);
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
    

    uniform sampler2D iChannel0;
    uniform vec4 iViewport;
    uniform vec3 iResolution;
    uniform vec4 iChannelViewport[1];
    uniform vec3 iChannelResolution[1];

    void mainImage (out vec4 fragColor, in vec2 fragCoord) {


      vec2 dst_vxy = iViewport.xy;
      vec2 dst_vwh = iViewport.zw;
      vec2 dst_xy = fragCoord.xy;
      vec2 dst_uv = (dst_xy - dst_vxy)/dst_vwh;

      vec2 vxy = iChannelViewport[0].xy;
      vec2 vwh = iChannelViewport[0].zw;
      vec2 src_xy = mix(vxy, vxy+vwh, dst_uv);
      vec2 src_uv = src_xy / iChannelResolution[0].xy;

      fragColor = texture2D(iChannel0, src_uv);
    }

    varying vec2 v_uv;

    void main() {
      vec2 fragCoord = gl_FragCoord.xy;
      mainImage(gl_FragColor, fragCoord);
    }
    `;

    // Pixel aspect ratio
    let PAR = 1.0;

    let iChannelViewport0 = [0, 0, 0, 0];
    let iChannelResolution0 = [0, 0, 0];
    iChannelViewport0[0] = context.map(context.i.in.viewport.xy, (xy) => xy[0]);
    iChannelViewport0[1] = context.map(context.i.in.viewport.xy, (xy) => xy[1]);
    iChannelViewport0[2] = context.map(context.i.in.viewport.wh, (wh) => wh[0]);
    iChannelViewport0[3] = context.map(context.i.in.viewport.wh, (wh) => wh[1]);
    iChannelResolution0[0] = context.map(context.i.in.resolution.wh, (wh) => wh[0]);
    iChannelResolution0[1] = context.map(context.i.in.resolution.wh, (wh) => wh[1]);
    iChannelResolution0[2] = PAR;

    let uniforms = {
      iChannel0: context.map(context.i.in.regl.texture),
      'iResolution': function (context) { return [context.drawingBufferWidth, context.drawingBufferHeight, PAR]; },
      'iViewport': function (context) { return [0, 0, context.drawingBufferWidth, context.drawingBufferHeight]; },
      'iChannelViewport[0]': iChannelViewport0,
      'iChannelResolution[0]': iChannelResolution0,
      u_clip_y: +1
    };

    for (let channel of [0, 1, 2, 3]) {
      uniforms[`iChannelViewport[${channel}]`] = [0, 0, 0, 0];
      uniforms[`iChannelResolution[${channel}]`] = [0, 0, 0];
    }

    uniforms['iChannelViewport[0]'] = iChannelViewport0;
    uniforms['iChannelResolution[0]'] = iChannelResolution0;

    // if any uniform values have anything dynamic in them, make the entire uniform value dynamic
    for (let key of Object.keys(uniforms)) {
      let value = uniforms[key];

      if (common.vtHasFunctions({value, recursive: true})) {
        uniforms[key] = function (...args) {
          return common.vtEvaluateFunctions({value, args});
        };
      }
    }

    let cmd = context.pipeline.regl({
      frag,
      vert,
      attributes: {
        a_position: quad.verts
      },
      elements: quad.indices,
      uniforms
    });

    context.data.cmd = cmd;

    return null;
  }

  execute ({context}) {
    context.data.cmd();
  }

}

module.exports = Canvas;
