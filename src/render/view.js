// Plan view framing: which scale and offset show the whole construction.
// Pure, so it can be tested without a canvas. Screen = world * scale + offset.

export const DEFAULT_SCALE = 80;
export const MIN_SCALE = 20;
const MAX_SCALE = 120;

export function fitViewFor(structure, width, height) {
  const rooms = [...structure.rooms.values()];
  if (rooms.length === 0 || width <= 0 || height <= 0) {
    return { scale: DEFAULT_SCALE, offsetX: width / 2, offsetY: height / 2 };
  }
  const xs = rooms.map((r) => r.x);
  const ys = rooms.map((r) => r.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  // Two grid units of margin on every side, so the outer rooms are not cut off. Each axis is fitted to its
  // own side of the canvas: a wide building on a wide canvas uses the width.
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min(width / (maxX - minX + 4), height / (maxY - minY + 4))));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return { scale, offsetX: width / 2 - cx * scale, offsetY: height / 2 - cy * scale };
}

// Snaps a coordinate to the nearest grid step. A step of 0 means no snapping.
export function snapTo(value, step = 0.5) {
  if (!step) return Math.round(value * 100) / 100;
  return Math.round(value / step) * step;
}

// Progress of a short transition, 0 to 1. With reduced motion there is no
// transition at all: the view is simply at its end state.
export function transitionProgress(elapsed, duration, reduced = false) {
  if (reduced || duration <= 0) return 1;
  return Math.min(1, Math.max(0, elapsed / duration));
}
