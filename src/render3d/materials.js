// The material library. One set of physically based materials per style, built
// from procedural textures and cached. Every surface response (roughness,
// metalness, bump, reflection strength, emission) comes from the style data.
//
// UVs are authored in metres by the geometry builder; `repeat` on a surface is
// "texture tiles per metre", so texel density is the same on every wall.

import {
  MeshStandardMaterial, CanvasTexture, RepeatWrapping, SRGBColorSpace, NoColorSpace,
  DoubleSide, Color, MeshBasicMaterial, AdditiveBlending,
} from '../vendor/three/three.module.js';
import { GENERATORS, gradientTexture, softDot } from './textures.js';
import { STYLES } from './styles.js';

const cache = new Map();
const sprites = {};

function tex(canvas, color) {
  const t = new CanvasTexture(canvas);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = color ? SRGBColorSpace : NoColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

function surface(spec, rough = 1) {
  const gen = GENERATORS[spec.gen];
  const { map, bump, rough: rmap } = gen(spec.args);
  const m = new MeshStandardMaterial({
    map: tex(map, true),
    bumpMap: tex(bump, false),
    bumpScale: spec.gen === 'brushedMetal' ? 0.6 : 1.4,
    roughnessMap: tex(rmap, false),
    roughness: rough,
    metalness: spec.metalness ?? 0,
    envMapIntensity: spec.env ?? 0.5,
    side: DoubleSide,
    vertexColors: true,
  });
  m.userData.repeat = spec.repeat ?? 0.4;
  return m;
}

function plainEmissive(color, intensity, extra = {}) {
  const m = new MeshStandardMaterial({
    color: new Color(color).multiplyScalar(0.15),
    emissive: new Color(color),
    emissiveIntensity: intensity,
    roughness: 0.6,
    metalness: 0,
    side: DoubleSide,
    vertexColors: true,
    ...extra,
  });
  m.userData.repeat = 1;
  return m;
}

export function materialsFor(style) {
  if (cache.has(style.key)) return cache.get(style.key);
  const lib = {
    floor: surface(style.floor),
    wall: surface(style.wall),
    inset: surface(style.inset),
    trim: surface(style.trim),
    ceiling: surface(style.ceiling),
    beam: surface(style.beam),
    metal: surface(style.metal, 1),
    inlay: new MeshStandardMaterial({
      color: new Color(style.inlay.color), metalness: style.inlay.metal, roughness: 0.28,
      envMapIntensity: 1.2, side: DoubleSide, vertexColors: true,
    }),
    lamp: plainEmissive(style.lamp, 5),
    accent: plainEmissive(style.accent, 2.6),
    glass: new MeshStandardMaterial({
      color: new Color('#9fc4d4'), roughness: 0.05, metalness: 0, transparent: true, opacity: 0.22,
      envMapIntensity: 1.6, side: DoubleSide, vertexColors: true, depthWrite: false,
    }),
    window: plainEmissive(style.lamp, 3.2),
    dark: new MeshStandardMaterial({
      color: new Color('#0b0b0d'), roughness: 0.35, metalness: 0.6, envMapIntensity: 0.9,
      side: DoubleSide, vertexColors: true,
    }),
    // The cool half of a two-truths room, and the warm half's lamp.
    coolWall: style.features.includes('split') ? surface(style.inset) : null,
  };
  lib.metalDark = lib.metal.clone();
  lib.metalDark.color = new Color('#6b6b6b');
  lib.metalDark.userData.repeat = lib.metal.userData.repeat;
  lib.coolWall ??= lib.inset;
  cache.set(style.key, lib);
  return lib;
}

// Glow sprites share a texture across styles.
export function glowTexture() {
  sprites.dot ??= tex(softDot(), true);
  return sprites.dot;
}

export function glowMaterial(color, opacity = 0.5) {
  sprites.dot ??= tex(softDot(), true);
  return new MeshBasicMaterial({
    map: sprites.dot, color: new Color(color), transparent: true, opacity, depthWrite: false,
    blending: AdditiveBlending, side: DoubleSide, fog: false,
  });
}

export function shaftMaterial(color, opacity = 0.22) {
  sprites.shaft ??= tex(gradientTexture(128, true), true);
  return new MeshBasicMaterial({
    map: sprites.shaft, color: new Color(color), transparent: true, opacity, depthWrite: false,
    blending: AdditiveBlending, side: DoubleSide, fog: false,
  });
}

export function disposeMaterials() {
  for (const lib of cache.values()) for (const m of Object.values(lib)) {
    if (!m) continue;
    for (const k of ['map', 'bumpMap', 'roughnessMap']) m[k]?.dispose?.();
    m.dispose();
  }
  cache.clear();
}

export { STYLES };
