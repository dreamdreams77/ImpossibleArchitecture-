// Post-processing for the final image: restrained bloom, ACES tone mapping, a
// per-chapter colour grade and a vignette. The scene (including every recursive
// portal pass, which stays linear) is drawn into a half-float target; this module
// turns that target into the picture on screen. Nothing here touches the graph.

import {
  WebGLRenderTarget, HalfFloatType, LinearFilter, Scene, OrthographicCamera, Mesh, PlaneGeometry,
  ShaderMaterial, Vector2, Vector3,
} from '../vendor/three/three.module.js';

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const BRIGHT = /* glsl */`
uniform sampler2D tScene; uniform float threshold; uniform float knee; varying vec2 vUv;
void main(){
  vec3 c = texture2D(tScene, vUv).rgb;
  float l = max(c.r, max(c.g, c.b));
  float soft = clamp(l - threshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-4);
  float w = max(soft, l - threshold) / max(l, 1e-4);
  gl_FragColor = vec4(c * w, 1.0);
}`;

// Separable 9-tap gaussian.
const BLUR = /* glsl */`
uniform sampler2D tMap; uniform vec2 dir; varying vec2 vUv;
void main(){
  vec3 s = texture2D(tMap, vUv).rgb * 0.2270270270;
  s += texture2D(tMap, vUv + dir * 1.3846153846).rgb * 0.3162162162;
  s += texture2D(tMap, vUv - dir * 1.3846153846).rgb * 0.3162162162;
  s += texture2D(tMap, vUv + dir * 3.2307692308).rgb * 0.0702702703;
  s += texture2D(tMap, vUv - dir * 3.2307692308).rgb * 0.0702702703;
  gl_FragColor = vec4(s, 1.0);
}`;

const COMPOSE = /* glsl */`
uniform sampler2D tScene; uniform sampler2D tBloom0; uniform sampler2D tBloom1; uniform sampler2D tBloom2;
uniform float bloom; uniform float exposure; uniform vec3 lift; uniform vec3 gain; uniform vec3 tint;
uniform float saturation; uniform float contrast; uniform float vignette; uniform float seed; uniform vec2 res;
varying vec2 vUv;
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
vec3 toSrgb(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + seed) * 43758.5453); }
void main(){
  vec3 c = texture2D(tScene, vUv).rgb;
  vec3 b = texture2D(tBloom0, vUv).rgb * 0.5 + texture2D(tBloom1, vUv).rgb * 0.35 + texture2D(tBloom2, vUv).rgb * 0.25;
  c += b * bloom;
  c *= exposure;
  c = aces(c);
  // Grade: lift the shadows, gain the highlights, tint, contrast around mid-grey, then saturation.
  c = pow(max(c * gain + lift * (1.0 - c), 0.0), vec3(1.0));
  c *= tint;
  c = (c - 0.5) * contrast + 0.5;
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(luma), c, saturation);
  vec2 q = vUv - 0.5;
  float v = 1.0 - vignette * smoothstep(0.25, 0.85, length(q * vec2(res.x / res.y, 1.0)));
  c *= v;
  c = toSrgb(clamp(c, 0.0, 1.0));
  c += (hash(vUv * res) - 0.5) / 255.0; // dither: no banding in the dark gradients
  gl_FragColor = vec4(c, 1.0);
}`;

export const DEFAULT_GRADE = Object.freeze({ lift: [0.01, 0.01, 0.012], gain: [1, 1, 1], tint: [1, 1, 1], saturation: 1.05, contrast: 1.04, vignette: 0.28, exposure: 1.0 });

export class Post {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new Scene();
    this.camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new Mesh(new PlaneGeometry(2, 2), null);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    this.targets = null;
    this.size = new Vector2(0, 0);
    this.samples = 4;
    this.mk = (frag, uniforms) => new ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, toneMapped: false });
    this.bright = this.mk(BRIGHT, { tScene: { value: null }, threshold: { value: 1.0 }, knee: { value: 0.5 } });
    this.blur = this.mk(BLUR, { tMap: { value: null }, dir: { value: new Vector2() } });
    this.compose = this.mk(COMPOSE, {
      tScene: { value: null }, tBloom0: { value: null }, tBloom1: { value: null }, tBloom2: { value: null },
      bloom: { value: 0.3 }, exposure: { value: 1 }, lift: { value: new Vector3() }, gain: { value: new Vector3(1, 1, 1) },
      tint: { value: new Vector3(1, 1, 1) }, saturation: { value: 1 }, contrast: { value: 1 }, vignette: { value: 0.3 },
      seed: { value: 0 }, res: { value: new Vector2(1, 1) },
    });
  }

  // (Re)allocates the scene target and the bloom chain for the drawing buffer size.
  resize(w, h, samples) {
    if (this.targets && this.size.x === w && this.size.y === h && this.samples === samples) return;
    this.dispose();
    this.size.set(w, h);
    this.samples = samples;
    const mk = (tw, th, s = 0) => {
      const t = new WebGLRenderTarget(Math.max(2, tw | 0), Math.max(2, th | 0), { type: HalfFloatType, samples: s, depthBuffer: s > 0 || tw === w });
      t.texture.minFilter = t.texture.magFilter = LinearFilter;
      return t;
    };
    this.targets = {
      scene: mk(w, h, samples),
      a: [mk(w / 2, h / 2), mk(w / 4, h / 4), mk(w / 8, h / 8)],
      b: [mk(w / 2, h / 2), mk(w / 4, h / 4), mk(w / 8, h / 8)],
    };
  }

  get sceneTarget() { return this.targets.scene; }

  fullscreen(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
  }

  // Draws the scene target to the screen. `grade` is a style's grade; `bloom` 0 skips the chain.
  render(grade = DEFAULT_GRADE, { bloom = 0.3, threshold = 1.0, time = 0 } = {}) {
    const t = this.targets;
    const g = { ...DEFAULT_GRADE, ...grade };
    let b0 = t.a[0]; let b1 = t.a[1]; let b2 = t.a[2];
    if (bloom > 0) {
      this.bright.uniforms.tScene.value = t.scene.texture;
      this.bright.uniforms.threshold.value = threshold;
      this.fullscreen(this.bright, t.a[0]);
      for (let i = 0; i < 3; i++) {
        if (i > 0) { // downsample the previous level by drawing it into the smaller target
          this.blur.uniforms.tMap.value = t.a[i - 1].texture;
          this.blur.uniforms.dir.value.set(0, 0);
          this.fullscreen(this.blur, t.a[i]);
        }
        this.blur.uniforms.tMap.value = t.a[i].texture;
        this.blur.uniforms.dir.value.set(1 / t.a[i].width, 0);
        this.fullscreen(this.blur, t.b[i]);
        this.blur.uniforms.tMap.value = t.b[i].texture;
        this.blur.uniforms.dir.value.set(0, 1 / t.a[i].height);
        this.fullscreen(this.blur, t.a[i]);
      }
    }
    const u = this.compose.uniforms;
    u.tScene.value = t.scene.texture;
    u.tBloom0.value = b0.texture; u.tBloom1.value = b1.texture; u.tBloom2.value = b2.texture;
    u.bloom.value = bloom;
    u.exposure.value = g.exposure;
    u.lift.value.set(...g.lift); u.gain.value.set(...g.gain); u.tint.value.set(...g.tint);
    u.saturation.value = g.saturation; u.contrast.value = g.contrast; u.vignette.value = g.vignette;
    u.seed.value = (time * 17.0) % 100;
    u.res.value.set(this.size.x, this.size.y);
    this.fullscreen(this.compose, null);
  }

  dispose() {
    if (!this.targets) return;
    this.targets.scene.dispose();
    for (const x of [...this.targets.a, ...this.targets.b]) x.dispose();
    this.targets = null;
  }
}
