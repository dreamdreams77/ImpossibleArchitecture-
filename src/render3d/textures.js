// Procedural surface textures. Every map is generated in the browser from a
// seed, so the repository ships no image assets and each theme gets surfaces of
// its own. Noise is tileable, so a texture repeats without visible seams.
//
// Each generator returns { map, bump, rough } canvases: albedo, a height map for
// bump detail and a roughness variation map (green channel, as three.js reads it).

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Tileable value noise: a lattice of `period` cells that wraps, smooth-interpolated.
function latticeNoise(size, period, seed) {
  const r = rng(seed);
  const grid = new Float32Array(period * period);
  for (let i = 0; i < grid.length; i++) grid[i] = r();
  const out = new Float32Array(size * size);
  const s = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) {
    const fy = (y / size) * period;
    const y0 = Math.floor(fy) % period;
    const y1 = (y0 + 1) % period;
    const ty = s(fy - Math.floor(fy));
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * period;
      const x0 = Math.floor(fx) % period;
      const x1 = (x0 + 1) % period;
      const tx = s(fx - Math.floor(fx));
      const a = grid[y0 * period + x0] * (1 - tx) + grid[y0 * period + x1] * tx;
      const b = grid[y1 * period + x0] * (1 - tx) + grid[y1 * period + x1] * tx;
      out[y * size + x] = a * (1 - ty) + b * ty;
    }
  }
  return out;
}

export function fbm(size, seed, base = 4, octaves = 5, gain = 0.5) {
  const out = new Float32Array(size * size);
  let amp = 1;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const n = latticeNoise(size, base << o, seed + o * 101);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    total += amp;
    amp *= gain;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function clamp255(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

// Paints a grey height field and an rgb albedo from per-pixel callbacks.
function paint(size, pixel) {
  const map = canvas(size);
  const bump = canvas(size);
  const rough = canvas(size);
  const mi = map.getContext('2d').createImageData(size, size);
  const bi = bump.getContext('2d').createImageData(size, size);
  const ri = rough.getContext('2d').createImageData(size, size);
  const out = { r: 0, g: 0, b: 0, h: 0.5, rough: 0.6 };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      pixel(x, y, out);
      const i = (y * size + x) * 4;
      mi.data[i] = clamp255(out.r);
      mi.data[i + 1] = clamp255(out.g);
      mi.data[i + 2] = clamp255(out.b);
      mi.data[i + 3] = 255;
      const h = clamp255(out.h * 255);
      bi.data[i] = bi.data[i + 1] = bi.data[i + 2] = h;
      bi.data[i + 3] = 255;
      const ro = clamp255(out.rough * 255);
      ri.data[i] = ri.data[i + 2] = 0;
      ri.data[i + 1] = ro;
      ri.data[i + 3] = 255;
    }
  }
  map.getContext('2d').putImageData(mi, 0, 0);
  bump.getContext('2d').putImageData(bi, 0, 0);
  rough.getContext('2d').putImageData(ri, 0, 0);
  return { map, bump, rough };
}

const mix = (a, b, t) => a + (b - a) * t;

// Ashlar stone: coursed blocks with joints, per-block tone, grain and veins.
export function stone({ base = '#b8ad98', joint = '#6d655a', size = 256, seed = 1, courses = 4, blocks = 2, vein = 0.35, polish = 0.4 } = {}) {
  const c = hexToRgb(base);
  const j = hexToRgb(joint);
  const grain = fbm(size, seed, 8, 5);
  const wide = fbm(size, seed + 7, 3, 3);
  const veins = fbm(size, seed + 13, 4, 4);
  const r = rng(seed + 99);
  const tone = [];
  for (let i = 0; i < courses * (blocks + 1) * 2; i++) tone.push((r() - 0.5) * 0.22);
  const ch = size / courses;
  return paint(size, (x, y, o) => {
    const course = Math.floor(y / ch);
    const bw = size / blocks;
    const off = (course % 2) * (bw / 2);
    const bx = Math.floor((x + off) / bw);
    const t = tone[(course * (blocks + 1) + (bx % (blocks + 1))) % tone.length];
    const i = y * size + x;
    let k = 1 + t + (grain[i] - 0.5) * 0.28 + (wide[i] - 0.5) * 0.18;
    const vv = Math.abs(veins[i] - 0.5);
    if (vv < 0.025) k -= (0.025 - vv) * 8 * vein;
    // Joints: a recessed line at course and block boundaries.
    const dy = Math.min(y % ch, ch - (y % ch));
    const dx = Math.min((x + off) % bw, bw - ((x + off) % bw));
    const d = Math.min(dy, dx);
    let h = 0.55 + (grain[i] - 0.5) * 0.25;
    let jm = 0;
    if (d < 2.4) { jm = 1 - d / 2.4; h -= jm * 0.45; }
    o.r = mix(c[0] * k, j[0], jm * 0.8);
    o.g = mix(c[1] * k, j[1], jm * 0.8);
    o.b = mix(c[2] * k, j[2], jm * 0.8);
    o.h = h;
    o.rough = mix(0.82 - polish * 0.5, 0.95, jm) + (grain[i] - 0.5) * 0.18;
  });
}

// Board-formed concrete: pores, formwork seams, tie holes and cloud staining.
export function concrete({ base = '#8d8a84', size = 256, seed = 2, panel = 128 } = {}) {
  const c = hexToRgb(base);
  const cloud = fbm(size, seed, 3, 5);
  const fine = fbm(size, seed + 5, 32, 3);
  const r = rng(seed + 31);
  const pores = new Float32Array(size * size);
  for (let n = 0; n < size * 6; n++) {
    const px = Math.floor(r() * size);
    const py = Math.floor(r() * size);
    const rad = 0.6 + r() * 1.6;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const d = Math.hypot(dx, dy);
      if (d < rad) pores[((py + dy + size) % size) * size + ((px + dx + size) % size)] = 1 - d / rad;
    }
  }
  return paint(size, (x, y, o) => {
    const i = y * size + x;
    let k = 0.88 + (cloud[i] - 0.5) * 0.4 + (fine[i] - 0.5) * 0.12 - pores[i] * 0.25;
    let h = 0.55 + (fine[i] - 0.5) * 0.2 - pores[i] * 0.35;
    const sx = Math.min(x % panel, panel - (x % panel));
    const sy = Math.min(y % panel, panel - (y % panel));
    if (Math.min(sx, sy) < 1.6) { k *= 0.78; h -= 0.3; }
    // Tie holes at the panel quarter points.
    const hx = (x % panel) - panel / 2;
    const hy = (y % panel) - panel / 2;
    if (Math.hypot(Math.abs(hx) - panel * 0.28, Math.abs(hy) - panel * 0.28) < 2.6) { k *= 0.55; h -= 0.4; }
    o.r = c[0] * k; o.g = c[1] * k; o.b = c[2] * k;
    o.h = h;
    o.rough = 0.88 + (cloud[i] - 0.5) * 0.15;
  });
}

// Brushed metal: horizontal streaks, with optional plate seams and rivets.
export function brushedMetal({ base = '#9aa0a6', size = 256, seed = 3, seams = 2, rivets = true, wear = 0.3 } = {}) {
  const c = hexToRgb(base);
  const streak = new Float32Array(size * size);
  const r = rng(seed);
  for (let y = 0; y < size; y++) {
    const row = r();
    for (let x = 0; x < size; x++) streak[y * size + x] = row * 0.6 + r() * 0.4;
  }
  const cloud = fbm(size, seed + 3, 3, 4);
  const ph = size / seams;
  return paint(size, (x, y, o) => {
    const i = y * size + x;
    // Blur the streaks horizontally for a drawn-grain look.
    const s = (streak[i] + streak[y * size + ((x + 1) % size)] + streak[y * size + ((x + size - 1) % size)]) / 3;
    let k = 0.9 + (s - 0.5) * 0.34 + (cloud[i] - 0.5) * wear * 0.6;
    let h = 0.55 + (s - 0.5) * 0.1;
    let seam = 0;
    const sy = Math.min(y % ph, ph - (y % ph));
    const sx = Math.min(x % ph, ph - (x % ph));
    if (Math.min(sy, sx) < 1.5) { seam = 1; k *= 0.6; h -= 0.35; }
    if (rivets) {
      const rx = (x % (ph / 4)) - ph / 8;
      const ry = (y % ph);
      if ((ry < 8 || ry > ph - 8) && Math.hypot(rx, Math.min(ry, ph - ry) - 4) < 2.2) { k *= 1.25; h += 0.3; }
    }
    o.r = c[0] * k; o.g = c[1] * k; o.b = c[2] * k;
    o.h = h;
    o.rough = 0.32 + (s - 0.5) * 0.25 + seam * 0.3 + (cloud[i] - 0.5) * wear * 0.5;
  });
}

// Ceramic tile with grout lines and per-tile glaze variation.
export function tile({ base = '#d9d3c4', grout = '#7a756a', size = 256, seed = 4, count = 4, checker = null } = {}) {
  const c = hexToRgb(base);
  const g = hexToRgb(grout);
  const c2 = checker ? hexToRgb(checker) : null;
  const cloud = fbm(size, seed, 4, 4);
  const r = rng(seed + 17);
  const tones = Array.from({ length: count * count }, () => (r() - 0.5) * 0.12);
  const ts = size / count;
  return paint(size, (x, y, o) => {
    const i = y * size + x;
    const tx = Math.floor(x / ts);
    const ty = Math.floor(y / ts);
    const dx = Math.min(x % ts, ts - (x % ts));
    const dy = Math.min(y % ts, ts - (y % ts));
    const d = Math.min(dx, dy);
    const col = c2 && (tx + ty) % 2 ? c2 : c;
    const k = 1 + tones[ty * count + tx] + (cloud[i] - 0.5) * 0.08;
    let gm = 0;
    let h = 0.6;
    if (d < 1.8) { gm = 1 - d / 1.8; h = 0.6 - gm * 0.4; }
    else if (d < 4) h = 0.6 + (d - 1.8) * 0.02; // bevelled edge
    o.r = mix(col[0] * k, g[0], gm); o.g = mix(col[1] * k, g[1], gm); o.b = mix(col[2] * k, g[2], gm);
    o.h = h;
    o.rough = mix(0.16 + (cloud[i] - 0.5) * 0.12, 0.9, gm);
  });
}

// Painted plaster: soft cloudy variation, faint trowel marks, scuffing near the base.
export function plaster({ base = '#d6d0c4', size = 256, seed = 5, scuff = 0.5 } = {}) {
  const c = hexToRgb(base);
  const cloud = fbm(size, seed, 2, 5);
  const fine = fbm(size, seed + 9, 24, 3);
  return paint(size, (x, y, o) => {
    const i = y * size + x;
    const low = Math.max(0, (y / size - 0.7) / 0.3);
    const k = 0.94 + (cloud[i] - 0.5) * 0.18 + (fine[i] - 0.5) * 0.06 - low * scuff * (0.1 + (fine[i] - 0.5) * 0.2);
    o.r = c[0] * k; o.g = c[1] * k; o.b = c[2] * k;
    o.h = 0.5 + (fine[i] - 0.5) * 0.3;
    o.rough = 0.8 + (cloud[i] - 0.5) * 0.2;
  });
}

// Dark polished stone with inclusions; strongly reflective.
export function polishedDark({ base = '#15171c', fleck = '#8892a6', size = 256, seed = 6 } = {}) {
  const c = hexToRgb(base);
  const f = hexToRgb(fleck);
  const cloud = fbm(size, seed, 3, 5);
  const vein = fbm(size, seed + 21, 5, 4);
  const r = rng(seed + 3);
  const flecks = new Float32Array(size * size);
  for (let n = 0; n < size * 5; n++) flecks[Math.floor(r() * size * size)] = 0.4 + r() * 0.6;
  return paint(size, (x, y, o) => {
    const i = y * size + x;
    const v = Math.abs(vein[i] - 0.5) < 0.012 ? 1 : 0;
    const k = 1 + (cloud[i] - 0.5) * 0.9 + v * 0.8;
    const fl = flecks[i];
    o.r = c[0] * k + f[0] * fl * 0.5; o.g = c[1] * k + f[1] * fl * 0.5; o.b = c[2] * k + f[2] * fl * 0.5;
    o.h = 0.5 + (cloud[i] - 0.5) * 0.08;
    o.rough = 0.12 + (cloud[i] - 0.5) * 0.12 + v * 0.1;
  });
}

// Floor grating: dark steel with square apertures.
export function grating({ base = '#2a2623', size = 256, seed = 7, cells = 8 } = {}) {
  const c = hexToRgb(base);
  const cloud = fbm(size, seed, 4, 3);
  const cs = size / cells;
  return paint(size, (x, y, o) => {
    const i = y * size + x;
    const mx = x % cs;
    const my = y % cs;
    const hole = mx > cs * 0.2 && mx < cs * 0.8 && my > cs * 0.2 && my < cs * 0.8;
    const k = 0.9 + (cloud[i] - 0.5) * 0.4;
    if (hole) { o.r = 6; o.g = 5; o.b = 5; o.h = 0.05; o.rough = 0.9; }
    else { o.r = c[0] * k; o.g = c[1] * k; o.b = c[2] * k; o.h = 0.7; o.rough = 0.45 + (cloud[i] - 0.5) * 0.3; }
  });
}

// A horizontal vertical-fade used for light-shaft and glow billboards.
export function gradientTexture(size = 128, vertical = true) {
  const c = canvas(size);
  const g = c.getContext('2d');
  const grad = vertical ? g.createLinearGradient(0, 0, 0, size) : g.createLinearGradient(0, 0, size, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.65)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

// Soft round sprite for dust and lamp glow.
export function softDot(size = 64) {
  const c = canvas(size);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

export const GENERATORS = { stone, concrete, brushedMetal, tile, plaster, polishedDark, grating };
