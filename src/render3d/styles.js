// Architectural styles. A style is data: surfaces, light, scale and the list of
// features the room builder adds. Six styles carry the six disciplines of the
// campaign; each chapter names a theme and `styleFor` maps it to a style, so a
// new chapter is a data change.
//
// Surface specs name a generator in textures.js plus its parameters, and a
// material response. Colours are hex strings; light colours are linear-ish hex.

export const STYLES = Object.freeze({
  // I. First Connection: minimal, precise, monumental and legible.
  threshold: {
    key: 'threshold',
    grade: { lift: [0.008, 0.01, 0.014], tint: [1, 1, 1.01], saturation: 1.0, contrast: 1.03, vignette: 0.22, exposure: 1.05 },
    name: 'First Connection',
    height: 5.2,
    floor: { gen: 'tile', args: { base: '#a9a292', grout: '#6c675b', count: 4, seed: 11 }, repeat: 0.5, metalness: 0.0, env: 0.5 },
    inlay: { color: '#8a8372', metal: 0.7 },
    wall: { gen: 'plaster', args: { base: '#bdb9ae', seed: 12 }, repeat: 0.35, metalness: 0, env: 0.2 },
    inset: { gen: 'plaster', args: { base: '#a9a496', seed: 13 }, repeat: 0.35, metalness: 0, env: 0.2 },
    trim: { gen: 'stone', args: { base: '#e6e0d2', joint: '#9d968a', courses: 2, blocks: 1, seed: 14, polish: 0.7 }, repeat: 0.45, metalness: 0, env: 0.4 },
    ceiling: { gen: 'plaster', args: { base: '#e8e4da', seed: 15 }, repeat: 0.3, metalness: 0, env: 0.1 },
    beam: { gen: 'concrete', args: { base: '#b9b5ab', seed: 16 }, repeat: 0.5, metalness: 0, env: 0.1 },
    metal: { gen: 'brushedMetal', args: { base: '#b7bcc2', seed: 17 }, repeat: 0.6, metalness: 0.9, env: 1.0 },
    accent: '#6fb4d8',
    lamp: '#fff2dc',
    lampIntensity: 11,
    sky: '#cfe0ee',
    ground: '#8a8478',
    ambient: 0.9,
    sun: { color: '#fff1d6', intensity: 2.4, dir: [-0.5, 1, -0.35] },
    fog: { color: '#8e9aa6', density: 0.016 },
    background: '#8e9aa6',
    exposure: 1.0,
    features: ['clerestory', 'skylight'],
    dust: 0.5,
  },

  // II. The Architecture of Return: arcades and recurrence.
  return: {
    key: 'return',
    grade: { lift: [0.012, 0.008, 0.005], tint: [1.02, 1.0, 0.97], saturation: 0.98, contrast: 1.06, vignette: 0.34, exposure: 0.72 },
    name: 'Architecture of Return',
    height: 5.6,
    floor: { gen: 'stone', args: { base: '#a58a64', joint: '#4f4130', courses: 4, blocks: 4, seed: 21, polish: 0.5 }, repeat: 0.4, metalness: 0, env: 0.5 },
    inlay: { color: '#d9a14f', metal: 0.9 },
    wall: { gen: 'stone', args: { base: '#b79d77', joint: '#5d4d38', courses: 6, blocks: 3, seed: 22 }, repeat: 0.3, metalness: 0, env: 0.2 },
    inset: { gen: 'stone', args: { base: '#8f7752', joint: '#433726', courses: 8, blocks: 3, seed: 23 }, repeat: 0.3, metalness: 0, env: 0.15 },
    trim: { gen: 'stone', args: { base: '#cdb48a', joint: '#6d5a40', courses: 2, blocks: 1, seed: 24, polish: 0.8 }, repeat: 0.5, metalness: 0, env: 0.4 },
    ceiling: { gen: 'plaster', args: { base: '#6e5a42', seed: 25 }, repeat: 0.3, metalness: 0, env: 0.1 },
    beam: { gen: 'stone', args: { base: '#7a6446', joint: '#3d3022', courses: 2, blocks: 1, seed: 26 }, repeat: 0.5, metalness: 0, env: 0.1 },
    metal: { gen: 'brushedMetal', args: { base: '#d1a24f', seed: 27, wear: 0.6 }, repeat: 0.6, metalness: 1.0, env: 1.0 },
    accent: '#f0b45a',
    lamp: '#ffc77a',
    lampIntensity: 26,
    sky: '#7a5f43',
    ground: '#2f241a',
    ambient: 0.55,
    sun: { color: '#ffb56b', intensity: 1.7, dir: [0.8, 0.7, 0.4] },
    fog: { color: '#35291d', density: 0.028 },
    background: '#2a2016',
    exposure: 1.05,
    features: ['arcade', 'pendants', 'rings'],
    dust: 1.0,
  },

  // III. Rooms That Should Not Fit: colossal interiors, small doors.
  monument: {
    key: 'monument',
    grade: { lift: [0.012, 0.01, 0.02], tint: [0.97, 0.97, 1.05], saturation: 1.08, contrast: 1.08, vignette: 0.36, exposure: 1.05 },
    name: 'Rooms That Should Not Fit',
    height: 11,
    floor: { gen: 'polishedDark', args: { base: '#171428', fleck: '#9a8fd0', seed: 31 }, repeat: 0.25, metalness: 0.2, env: 1.2 },
    inlay: { color: '#b9a2dc', metal: 0.9 },
    wall: { gen: 'concrete', args: { base: '#5a5078', seed: 32, panel: 64 }, repeat: 0.18, metalness: 0, env: 0.3 },
    inset: { gen: 'concrete', args: { base: '#3d3558', seed: 33, panel: 64 }, repeat: 0.18, metalness: 0, env: 0.3 },
    trim: { gen: 'stone', args: { base: '#9d90c2', joint: '#3b3358', courses: 2, blocks: 1, seed: 34, polish: 0.8 }, repeat: 0.3, metalness: 0, env: 0.6 },
    ceiling: { gen: 'concrete', args: { base: '#2c2542', seed: 35, panel: 64 }, repeat: 0.18, metalness: 0, env: 0.1 },
    beam: { gen: 'concrete', args: { base: '#463d66', seed: 36, panel: 128 }, repeat: 0.3, metalness: 0, env: 0.2 },
    metal: { gen: 'brushedMetal', args: { base: '#a9a0c8', seed: 37 }, repeat: 0.5, metalness: 0.95, env: 1.2 },
    accent: '#e48fb5',
    lamp: '#d9c8ff',
    lampIntensity: 60,
    sky: '#6b5fa0',
    ground: '#120f20',
    ambient: 0.5,
    sun: { color: '#cdbfff', intensity: 3.2, dir: [-0.25, 1, 0.15] },
    fog: { color: '#1b1630', density: 0.02 },
    background: '#161126',
    exposure: 1.1,
    features: ['colossal', 'oculus'],
    dust: 1.4,
  },

  // IV. The Mechanical Interior: rails, gears, work lights.
  mechanical: {
    key: 'mechanical',
    grade: { lift: [0.012, 0.006, 0.002], tint: [1.04, 0.99, 0.93], saturation: 1.02, contrast: 1.1, vignette: 0.38, exposure: 0.9 },
    name: 'The Mechanical Interior',
    height: 6.2,
    floor: { gen: 'grating', args: { base: '#53473f', seed: 41, cells: 8 }, repeat: 0.5, metalness: 0.55, env: 1.0 },
    inlay: { color: '#e08a3c', metal: 0.8 },
    wall: { gen: 'brushedMetal', args: { base: '#6c5546', seed: 42, seams: 2, wear: 0.7 }, repeat: 0.22, metalness: 0.75, env: 0.7 },
    inset: { gen: 'brushedMetal', args: { base: '#40342d', seed: 43, seams: 4, wear: 0.8 }, repeat: 0.22, metalness: 0.7, env: 0.5 },
    trim: { gen: 'brushedMetal', args: { base: '#b8794a', seed: 44, seams: 1 }, repeat: 0.6, metalness: 0.95, env: 1.0 },
    ceiling: { gen: 'brushedMetal', args: { base: '#2f2824', seed: 45, seams: 2 }, repeat: 0.25, metalness: 0.8, env: 0.4 },
    beam: { gen: 'brushedMetal', args: { base: '#7a6a5c', seed: 46, seams: 2 }, repeat: 0.5, metalness: 0.9, env: 0.8 },
    metal: { gen: 'brushedMetal', args: { base: '#c28553', seed: 47, wear: 0.5 }, repeat: 0.6, metalness: 1.0, env: 1.2 },
    accent: '#ff9a3c',
    lamp: '#ffb25a',
    lampIntensity: 34,
    sky: '#3a2a20',
    ground: '#120d0a',
    ambient: 0.45,
    sun: { color: '#ff9f55', intensity: 0.9, dir: [0.5, 1, -0.6] },
    fog: { color: '#1d1511', density: 0.032 },
    background: '#150f0c',
    exposure: 1.1,
    features: ['rails', 'gears', 'steam'],
    dust: 0.8,
  },

  // V. The Structure With Two Truths: one room, two readings.
  twotruths: {
    key: 'twotruths',
    grade: { lift: [0.008, 0.01, 0.01], tint: [1, 1, 1], saturation: 1.04, contrast: 1.05, vignette: 0.28, exposure: 1.0 },
    name: 'The Structure With Two Truths',
    height: 5.8,
    floor: { gen: 'tile', args: { base: '#e9e4d6', checker: '#17191d', grout: '#555', count: 8, seed: 51 }, repeat: 0.25, metalness: 0.05, env: 0.9 },
    inlay: { color: '#7fd3b8', metal: 0.9 },
    wall: { gen: 'plaster', args: { base: '#e3d3b0', seed: 52 }, repeat: 0.3, metalness: 0, env: 0.2 },
    inset: { gen: 'plaster', args: { base: '#4d8179', seed: 53 }, repeat: 0.3, metalness: 0, env: 0.2 },
    trim: { gen: 'stone', args: { base: '#f0ece0', joint: '#a8a294', courses: 2, blocks: 1, seed: 54, polish: 0.8 }, repeat: 0.45, metalness: 0, env: 0.5 },
    ceiling: { gen: 'plaster', args: { base: '#d8d2c4', seed: 55 }, repeat: 0.3, metalness: 0, env: 0.1 },
    beam: { gen: 'concrete', args: { base: '#847e72', seed: 56 }, repeat: 0.5, metalness: 0, env: 0.1 },
    metal: { gen: 'brushedMetal', args: { base: '#b9c4c0', seed: 57 }, repeat: 0.6, metalness: 0.9, env: 1.0 },
    accent: '#7fd3b8',
    lamp: '#fff0d0',
    lampIntensity: 26,
    sky: '#9fb8b2',
    ground: '#3d4a47',
    ambient: 0.65,
    sun: { color: '#fff0d0', intensity: 1.6, dir: [-0.6, 1, 0.2] },
    fog: { color: '#2b3836', density: 0.02 },
    background: '#222c2a',
    exposure: 1.0,
    features: ['split', 'seam'],
    warm: '#ffd9a0',
    cool: '#86e0d0',
    dust: 0.6,
  },

  // VI. The Last Construction: the whole vocabulary at once.
  final: {
    key: 'final',
    grade: { lift: [0.01, 0.008, 0.006], tint: [1.02, 1.0, 0.97], saturation: 1.0, contrast: 1.1, vignette: 0.32, exposure: 0.95 },
    name: 'The Last Construction',
    height: 9,
    floor: { gen: 'polishedDark', args: { base: '#0f1114', fleck: '#d6a545', seed: 61 }, repeat: 0.25, metalness: 0.3, env: 1.4 },
    inlay: { color: '#e6b650', metal: 1.0 },
    wall: { gen: 'stone', args: { base: '#2a2c33', joint: '#0c0d10', courses: 6, blocks: 3, seed: 62, polish: 0.8 }, repeat: 0.25, metalness: 0.1, env: 0.6 },
    inset: { gen: 'polishedDark', args: { base: '#0b0c10', fleck: '#6a7080', seed: 63 }, repeat: 0.3, metalness: 0.3, env: 1.0 },
    trim: { gen: 'brushedMetal', args: { base: '#d6a545', seed: 64, seams: 1, wear: 0.3 }, repeat: 0.6, metalness: 1.0, env: 1.3 },
    ceiling: { gen: 'polishedDark', args: { base: '#14151a', fleck: '#d6a545', seed: 65 }, repeat: 0.25, metalness: 0.3, env: 0.8 },
    beam: { gen: 'brushedMetal', args: { base: '#8a7a56', seed: 66, seams: 2 }, repeat: 0.5, metalness: 0.95, env: 1.0 },
    metal: { gen: 'brushedMetal', args: { base: '#e2b457', seed: 67, wear: 0.3 }, repeat: 0.6, metalness: 1.0, env: 1.4 },
    accent: '#f2c879',
    lamp: '#fff4dd',
    lampIntensity: 70,
    sky: '#5d6f8f',
    ground: '#0a0b0d',
    ambient: 0.5,
    sun: { color: '#fff1d0', intensity: 3.6, dir: [0.35, 1, -0.2] },
    fog: { color: '#0d0f14', density: 0.016 },
    background: '#0b0c10',
    exposure: 1.15,
    features: ['arcade', 'colossal', 'rails', 'gears', 'oculus', 'rings', 'seam'],
    cool: '#9fd8ff',
    warm: '#ffd9a0',
    dust: 1.6,
  },
});

const BY_THEME = { slate: 'threshold', ash: 'return', dusk: 'monument', copper: 'mechanical', verdigris: 'twotruths' };
const BY_CHAPTER = ['threshold', 'return', 'monument', 'mechanical', 'twotruths', 'final'];

// The style for a challenge: its chapter (1 to 6) decides, so the six disciplines
// each keep one look. With no chapter (free construction) the 2D theme decides.
export function styleFor(themeName, chapterId = null, chapter = null) {
  if (chapter >= 1 && chapter <= BY_CHAPTER.length) return STYLES[BY_CHAPTER[chapter - 1]];
  return STYLES[BY_THEME[themeName] ?? 'threshold'];
}

// Room kinds reshape the shared vocabulary: how tall, how heavy, what overhead.
export const KIND_PROFILE = Object.freeze({
  chamber: { heightScale: 1, ribs: 'coffer', mezzanine: false, columns: 0 },
  corridor: { heightScale: 0.7, ribs: 'vault', mezzanine: false, columns: 0 },
  atrium: { heightScale: 1.5, ribs: 'coffer', mezzanine: true, columns: 4 },
  cellar: { heightScale: 0.62, ribs: 'groin', mezzanine: false, columns: 0 },
});
