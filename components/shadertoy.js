
const {Component} = require('../regl-plumbing-component.js');
const common = require('../regl-plumbing-common.js');
const quad = require('glsl-quad');


class Shadertoy extends Component {
  constructor ({pipeline}) {
    super({pipeline});
    this.compileSync = true;
    this.executeSync = true;
    this.reentrant = true;
    Object.freeze(this);
  }

  compile ({context}) {
    /**
     * A value is either:
     * 1. the actual resolved value,
     * 2. the actual resolved tree (dictionary), but possibly containing unresolved/disconnected terminals
     * 3. an unresolved terminal
     *    1. An instance of Dynamic
     *    2. An instance of DynamicPath
     * 4. A resolved terminal of type
          * Disconnected
     *
     */

    let code = context.resolve(context.i.code);
    let uniforms = context.shallow(context.i.uniforms, {});

    // let {iChannel0, iChannel1, iChannel2, iChannel3, code, framebuffer, uniforms = {}} = context.i;



    // FIXME: pixel aspect ratio
    let PAR = 1.0;
    let iResolution = [0, 0, PAR];
    let iViewport = [0, 0, 0, 0];

    // if `context.i.out` is set, use that,
    // otherwise, make an output texture by cloning the input texture
    // while overriding any properties set in `context.i.out`.
    let out = context.out({inTex: context.i.iChannel0, outTex: context.i.out});

    iResolution[0] = context.map(out.resolution.wh, (wh) => wh[0]);
    iResolution[1] = context.map(out.resolution.wh, (wh) => wh[1]);
    iViewport[0] = context.map(out.viewport, (viewport) => viewport.xy[0]);
    iViewport[1] = context.map(out.viewport, (viewport) => viewport.xy[1]);
    iViewport[2] = context.map(out.viewport, (viewport) => viewport.wh[0]);
    iViewport[3] = context.map(out.viewport, (viewport) => viewport.wh[1]);

    uniforms.iResolution = iResolution;
    uniforms.iViewport = iViewport;
    // uniforms.iChannelResolution = iChannelResolution;
    // uniforms.iChannelViewport = iChannelViewport;

    for (let channel of [0, 1, 2, 3]) {
      uniforms[`iChannelViewport[${channel}]`] = [0, 0, 0, 0];
      uniforms[`iChannelResolution[${channel}]`] = [0, 0, 0];
    }

    for (let channel in [0, 1, 2, 3]) {
      if (!context.available(context.i[`iChannel${channel}`])) {
        continue;
      }

      uniforms[`iChannel${channel}`] = context.map(context.i[`iChannel${channel}`].regl.texture);
      uniforms[`iChannelResolution[${channel}]`] = context.map(context.i[`iChannel${channel}`].resolution.wh, (wh) => Array.from(wh).concat([PAR]));

      let iChannelViewportI = [0, 0, 0, 0];
      iChannelViewportI[0] = context.map(context.i[`iChannel${channel}`].viewport.xy[0]);
      iChannelViewportI[1] = context.map(context.i[`iChannel${channel}`].viewport.xy[1]);
      iChannelViewportI[2] = context.map(context.i[`iChannel${channel}`].viewport.wh[0]);
      iChannelViewportI[3] = context.map(context.i[`iChannel${channel}`].viewport.wh[1]);

      uniforms[`iChannelViewport[${channel}]`] = iChannelViewportI;
    }

    // if any uniform values have anything dynamic in them, make the entire uniform value dynamic
    for (let key of Object.keys(uniforms)) {
      let value = uniforms[key];

      if (common.vtHasFunctions({value, recursive: true})) {
        uniforms[key] = function (...args) {
          return common.vtEvaluateFunctions({value, args});
        };
      }
    }

    let vert = `
    precision highp float;

    attribute vec2 a_position;
    varying vec2 v_uv;

    void main() {
      v_uv = (a_position + 1.0) / 2.0;
      gl_Position = vec4(a_position,0,1);
    }
    `;

    let frag = `
    precision highp float;

    uniform vec3 iResolution;
    uniform vec4 iViewport;

    uniform sampler2D iChannel0;
    uniform sampler2D iChannel1;
    uniform sampler2D iChannel2;
    uniform sampler2D iChannel3;
    uniform vec3 iChannelResolution[4];
    uniform vec4 iChannelViewport[4];

    ${code}

    varying vec2 v_uv;

    void main(){
      vec2 fragCoord = gl_FragCoord.xy;
      //vec2 fragCoord = v_uv*iResolution.xy;

      mainImage(gl_FragColor, fragCoord);
    }
    `;

    let cmd = context.pipeline.regl({
      frag,
      vert,
      attributes: {
        a_position: quad.verts
      },
      elements: quad.indices,
      uniforms,
      viewport: {
        x: iViewport[0],
        y: iViewport[1],
        width: iViewport[2],
        height: iViewport[3]
      },
      framebuffer: context.map(out, (outTex) => context.framebuffer(outTex))
    });

    context.data.cmd = cmd;

    return {
      out
    };
  }

  destroy ({context}) {
    if (context.data.cmd) {
      context.data.cmd.destroy();
    }
  }

  execute ({context}) {
    context.data.cmd();
  }
}

module.exports = Shadertoy;
