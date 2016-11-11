
let inbound = `

  bool inbound(vec2 pos, vec4 viewport){
    vec2 lower = iChannelViewport[0].xy;
    vec2 upper = lower + iChannelViewport[0].zw;

    return !any(lessThan(pos, lower)) && !any(greaterThanEqual(pos, upper));
  }
  
`;

module.exports = inbound;
