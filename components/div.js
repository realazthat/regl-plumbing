
const {Component} = require('../regl-plumbing-component.js');
const common = require('../regl-plumbing-common.js');
const quad = require('glsl-quad');
const nunjucks = require('nunjucks');
const $ = require('jquery');
let texture2DiChannel0 = require('./lib/texture2DiChannel0.js');


class Canvas extends Component {
  constructor ({pipeline}) {
    super({pipeline});
    this.compileSync = true;
    this.executeSync = true;
    this.reentrant = false;


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
    uniform vec4 iChannelBorder[1];
    ${texture2DiChannel0}

    void mainImage (out vec4 fragColor, in vec2 fragCoord) {

      vec2 dst_vxy = iViewport.xy;
      vec2 dst_vwh = iViewport.zw;
      vec2 dst_xy = fragCoord.xy;
      vec2 dst_uv = (dst_xy - dst_vxy)/dst_vwh;

      vec2 vxy = iChannelViewport[0].xy;
      vec2 vwh = iChannelViewport[0].zw;
      vec2 src_xy = mix(vxy, vxy+vwh, dst_uv);
      vec2 src_uv = src_xy / iChannelResolution[0].xy;

      fragColor = texture2DiChannel0(src_uv);
    }

    varying vec2 v_uv;

    void main() {
      vec2 fragCoord = gl_FragCoord.xy;
      mainImage(gl_FragColor, fragCoord);
    }
    `;

    // TODO: fix iChannel0 PAR
    let PAR = 1.0;

    let iChannel0 = context.shallow(context.i.in);

    let iChannelViewport0 = [0, 0, 0, 0];
    let iChannelResolution0 = [0, 0, 0];
    iChannelViewport0[0] = context.map(iChannel0.viewport.xy, (xy) => xy[0]);
    iChannelViewport0[1] = context.map(iChannel0.viewport.xy, (xy) => xy[1]);
    iChannelViewport0[2] = context.map(iChannel0.viewport.wh, (wh) => wh[0]);
    iChannelViewport0[3] = context.map(iChannel0.viewport.wh, (wh) => wh[1]);
    iChannelResolution0[0] = context.map(iChannel0.resolution.wh, (wh) => wh[0]);
    iChannelResolution0[1] = context.map(iChannel0.resolution.wh, (wh) => wh[1]);
    iChannelResolution0[2] = PAR;

    let iViewport = function (context) {
      let target = componentContext.resolve(componentContext.i.target);
      let canvas = componentContext.resolve(componentContext.i.canvas, 'body > canvas');
      let $canvas = $(canvas);
      let $target = $(target);

      const pixelRatio = context.pixelRatio;
      $canvas.css('height', '100%');
      $canvas.css('width', '100%');
      $canvas.attr('width', Math.ceil(context.pixelRatio * window.innerWidth));
      $canvas.attr('height', Math.ceil(context.pixelRatio * window.innerHeight));

      // TODO take into account scroll bars

      // const width = window.innerWidth;
      // const height = window.innerHeight;

      // const cwidth = $canvas.width();
      const cheight = $canvas.height();
      // const crect = $canvas.get(0).getBoundingClientRect();

      // const width = cwidth;
      // const height = Math.ceil(cheight);
      const height = cheight;

      const rect = $target.get(0).getBoundingClientRect();

      // TODO: get the intersection of crect and rect.
      const vpx = Math.floor(pixelRatio * rect.left);
      const vpy = Math.floor(pixelRatio * (height - rect.bottom));
      // FIXME: TODO, the plus one is to cover it because there are weird corner cases
      const vpw = Math.ceil(pixelRatio * (rect.right - rect.left)) + 1;

      // FIXME: TODO, the plus one is to cover it because there are weird corner cases
      const vph = Math.ceil(pixelRatio * (rect.bottom - rect.top)) + 1;

      // console.log('window.innerHeight:', window.innerHeight, 'window.clientHeight:', window.clientHeight, 'height:', height, 'rect:', rect, 'crect:', crect, 'vpy:', vpy, 'vph:', vph, 'pixelRatio:', pixelRatio);

      return [vpx, vpy, vpw, vph];
    };

    // regl's context and the component context names conflict inside the callback functions
    let componentContext = context;
    let uniforms = {
      iChannel0: context.map(iChannel0.regl.texture),
      'iResolution': function (context) { return [context.drawingBufferWidth, context.drawingBufferHeight, context.pixelRatio]; },
      'iViewport': iViewport,
      'iChannelViewport[0]': iChannelViewport0,
      'iChannelResolution[0]': iChannelResolution0,
      u_clip_y: +1
    };

    for (let channel of [0, 1, 2, 3]) {
      uniforms[`iChannelViewport[${channel}]`] = [0, 0, 0, 0];
      uniforms[`iChannelResolution[${channel}]`] = [0, 0, 0];
      uniforms[`iChannelBorder[${channel}]`] = [0, 0, 0, 1];
    }

    uniforms['iChannelViewport[0]'] = iChannelViewport0;
    uniforms['iChannelResolution[0]'] = iChannelResolution0;
    uniforms['iChannelBorder[0]'] = context.map(iChannel0.viewport.border);

    // if any uniform values have anything dynamic in them, make the entire uniform value dynamic
    for (let key of Object.keys(uniforms)) {
      let value = uniforms[key];

      if (common.vtHasFunctions({value, recursive: true})) {
        uniforms[key] = function (...args) {
          return common.vtEvaluateFunctions({value, args});
        };
      }
    }

    frag = nunjucks.renderString(frag, {iChannel0});

    let cmd = context.pipeline.regl({
      frag,
      vert,
      attributes: {
        a_position: quad.verts
      },
      elements: quad.indices,
      uniforms,
      viewport: function (context) {
        let xywh = iViewport(context);

        return {x: xywh[0], y: xywh[1], width: xywh[2], height: xywh[3]};
      },
      scissor: {
        enable: true,
        box: function (context) {
          let xywh = iViewport(context);

          return {x: xywh[0], y: xywh[1], width: xywh[2], height: xywh[3]};
        }
      }

    });

    context.data.cmd = cmd;

    return {};
  }

  execute ({context}) {
    context.data.cmd();
  }

  destroy ({context}) {
    // TODO: destroy command?
    context.data.cmd = null;
    delete context.data.cmd;
  }

}

module.exports = Canvas;
