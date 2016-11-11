
let texture2DiChannel0 = `

  float repeat(float u) {
    // http://requirebin.com/?gist=deb1a751c59fe9d2b8e08b9ab042a6d4
    return mod(u,1.0);
  }

  float mirror(float u) {
    // http://requirebin.com/?gist=deb1a751c59fe9d2b8e08b9ab042a6d4

    u = mod(u, 2.0);
    
    return u > 1.0 ? 2.0 - u : u;
  }


  vec4 texture2DiChannel0(vec2 texture_uv) {

    vec2 lower = iChannelViewport[0].xy;
    vec2 upper = lower + iChannelViewport[0].zw;
    vec2 lower_uv = lower / iChannelResolution[0].xy;
    vec2 upper_uv = upper / iChannelResolution[0].xy;

    vec2 viewport_uv = (texture_uv - lower_uv)/(upper_uv - lower_uv);


    {% set SSAME = (iChannel0.wrapS === iChannel0.viewport.wrapS and iChannel0.viewport.xy[0] === 0 and iChannel0.viewport.wh[0] === iChannel0.resolution.wh[0]) %}
    {% set TSAME = (iChannel0.wrapT === iChannel0.viewport.wrapT and iChannel0.viewport.xy[1] === 0 and iChannel0.viewport.wh[1] === iChannel0.resolution.wh[1]) %}

    {% if iChannel0.viewport.wrapS === 'clamp' and not SSAME %}
    viewport_uv.x = clamp(viewport_uv.x, 0.0, 1.0);
    {% endif %}

    {% if iChannel0.viewport.wrapT === 'clamp' and not TSAME %}
    viewport_uv.y = clamp(viewport_uv.y, 0.0, 1.0);
    {% endif %}

    {% if iChannel0.viewport.wrapS === 'repeat' and not SSAME %}
    viewport_uv.x = repeat(viewport_uv.x);
    {% endif %}
    
    {% if iChannel0.viewport.wrapT === 'repeat' and not TSAME %}
    viewport_uv.y = repeat(viewport_uv.y);
    {% endif %}

    {% if iChannel0.viewport.wrapS === 'mirror' and not SSAME %}
    viewport_uv.x = mirror(viewport_uv.x);
    {% endif %}
    
    {% if iChannel0.viewport.wrapT === 'mirror' and not TSAME %}
    viewport_uv.y = mirror(viewport_uv.y);
    {% endif %}

    {% if iChannel0.viewport.wrapS === 'border' %}
    if (viewport_uv.x < 0.0 || viewport_uv.x >= 1.0) {
      return border_color;
    }
    {% endif %}
    
    {% if iChannel0.viewport.wrapT === 'border' %}
    if (viewport_uv.y < 0.0 || viewport_uv.y >= 1.0) {
      return border_color;
    }
    {% endif %}


    texture_uv = lower_uv + mix(lower_uv, upper_uv, viewport_uv);

    return texture2D(iChannel0, texture_uv);
  }

`;

module.exports = texture2DiChannel0;
