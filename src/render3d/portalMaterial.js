// The doorway surface. In walk mode it shows the destination room, rendered by
// the world renderer into a texture from the same camera (the destination room is
// placed behind the doorway, clipped at its surface), sampled in screen space.
// Around that view the shader draws the language of the connection:
//
//   rim colour   what kind of passage it is (see DOOR_COLORS in world.js)
//   swirl        the passage turns you: arms = quarter turns
//   shimmer      the passage mirrors space
//   gate bars    shut until a plate is lit or a crate delivered
//   chevrons     one way: drifting in the direction you may go
//
// In the architect's overview there is no view, only the glowing doorway.

import { ShaderMaterial, Color, Vector2, DoubleSide } from '../vendor/three/three.module.js';
import { DOOR_W, DOOR_H } from './frames.js';

const vertex = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const fragment = /* glsl */`
uniform sampler2D map;
uniform vec2 res;
uniform float mode;      // 0 view, 1 fog fallback, 2 overview glow
uniform float time;
uniform float mirror;
uniform float twist;     // quarter turns, 0..3
uniform float overlay;   // 0 none, 1 gate bars, 2 one-way refusal
uniform float arrow;     // 0 none, 1 chevrons pointing out of the room, -1 pointing in
uniform float fade;      // 0..1, darkening with recursion depth
uniform float debugTint; // recursion depth heat, 0 off
uniform float flash;     // crossing pulse
uniform vec3 rim;
uniform vec3 fogColor;
uniform vec3 heat;
varying vec2 vUv;

const vec2 SIZE = vec2(${DOOR_W.toFixed(3)}, ${DOOR_H.toFixed(3)});

void main() {
  vec2 p = vec2((vUv.x - 0.5) * SIZE.x, vUv.y * SIZE.y); // metres from the doorway's centre line / floor
  float ex = SIZE.x * 0.5 - abs(p.x);
  float ey = min(p.y, SIZE.y - p.y);
  float edge = max(min(ex, ey), 0.0);
  vec3 col;
  float alpha = 1.0;

  if (mode < 0.5) {
    vec2 suv = gl_FragCoord.xy / res;
    col = texture2D(map, suv).rgb;
    col *= 1.0 - 0.5 * fade;
  } else if (mode < 1.5) {
    float g = smoothstep(0.0, 3.2, p.y);
    col = mix(fogColor * 0.5, fogColor * 1.6, g);
    col *= 1.0 - 0.4 * fade;
  } else {
    float g = smoothstep(0.0, 3.2, p.y);
    col = rim * (0.12 + 0.2 * g);
    alpha = 0.55;
  }

  // Edge glow, breathing slowly. Wider for the colour that carries meaning.
  float breathe = 0.7 + 0.3 * sin(time * 1.6 + p.y * 2.0);
  float glow = exp(-edge * 16.0);
  col += rim * glow * 0.9 * breathe;
  col += rim * exp(-edge * 60.0) * 2.2;

  // A turning passage: spiral arms of light round the edge.
  if (twist > 0.5) {
    vec2 q = vec2(p.x, p.y - SIZE.y * 0.5);
    float ang = atan(q.y, q.x);
    float arms = sin(ang * twist * 2.0 + time * 1.4 - edge * 7.0) * 0.5 + 0.5;
    col += rim * arms * exp(-edge * 4.5) * 0.85;
  }
  // A mirroring passage: bands of colour sliding across the surface.
  if (mirror > 0.5) {
    float band = sin((p.x + p.y * 0.6) * 5.0 - time * 1.8);
    float sheen = smoothstep(0.82, 1.0, band);
    col += mix(vec3(0.55, 0.35, 1.0), vec3(0.3, 0.8, 1.0), 0.5 + 0.5 * sin(p.y * 3.0 + time)) * sheen * 0.35;
  }
  // One-way: chevrons drifting the way you may go.
  if (arrow != 0.0) {
    float ya = p.y * 1.7 - time * 0.9 * arrow;
    vec2 c = vec2(abs(p.x) * 1.0, fract(ya) - 0.5 + abs(p.x) * 0.55 * arrow);
    float chev = smoothstep(0.07, 0.0, abs(c.y)) * smoothstep(0.55, 0.15, abs(p.x));
    col += rim * chev * 0.55 * (arrow > 0.0 ? 1.0 : 0.7);
  }
  // Gate bars and one-way refusal sit over a dimmed view.
  if (overlay > 0.5 && overlay < 1.5) {
    col *= 0.35;
    float bars = smoothstep(0.06, 0.03, abs(fract(p.x * 2.4 + 0.5) - 0.5));
    float cross = smoothstep(0.05, 0.02, abs(fract((p.y + p.x * 0.3) * 1.6) - 0.5));
    col += rim * (bars * 0.9 + cross * 0.25) * (0.7 + 0.3 * sin(time * 3.0));
    alpha = 1.0;
  } else if (overlay > 1.5) {
    col *= 0.3;
    float bars = smoothstep(0.05, 0.02, abs(fract(p.y * 2.0 + 0.3 * sin(p.x * 4.0 + time)) - 0.5));
    col += rim * bars * 0.5;
  }
  col += rim * flash * 0.8 * glow;
  col = mix(col, heat, debugTint * 0.35);

  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function makePortalMaterial() {
  return new ShaderMaterial({
    uniforms: {
      map: { value: null },
      res: { value: new Vector2(1, 1) },
      mode: { value: 1 },
      time: { value: 0 },
      mirror: { value: 0 },
      twist: { value: 0 },
      overlay: { value: 0 },
      arrow: { value: 0 },
      fade: { value: 0 },
      debugTint: { value: 0 },
      flash: { value: 0 },
      rim: { value: new Color('#6fd6ff') },
      fogColor: { value: new Color('#202030') },
      heat: { value: new Color('#ff3366') },
    },
    vertexShader: vertex,
    fragmentShader: fragment,
    side: DoubleSide,
    transparent: true,
    toneMapped: true,
  });
}
