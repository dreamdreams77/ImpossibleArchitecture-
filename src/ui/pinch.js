// Two-finger gestures. A tracker follows the pointers on one canvas and reports,
// for each move while two are down, how far the pair's span changed (zoom) and
// how far its midpoint moved (pan). Pure logic, so it can be tested without a DOM.

export function createPinch() {
  const points = new Map();
  let last = null;

  const span = () => {
    const [a, b] = [...points.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  };

  return {
    // Register a pointer. Returns true when a pinch is now in progress.
    down(id, x, y) {
      points.set(id, { x, y });
      last = points.size === 2 ? span() : null;
      return points.size >= 2;
    },
    // Returns { factor, dx, dy, cx, cy } while two pointers are down and the
    // span is measurable; otherwise null.
    move(id, x, y) {
      if (!points.has(id)) return null;
      points.set(id, { x, y });
      if (points.size !== 2) return null;
      const now = span();
      const prev = last;
      last = now;
      if (!prev || prev.dist === 0 || now.dist === 0) return null;
      return { factor: now.dist / prev.dist, dx: now.cx - prev.cx, dy: now.cy - prev.cy, cx: now.cx, cy: now.cy };
    },
    up(id) {
      points.delete(id);
      last = points.size === 2 ? span() : null;
    },
    active() {
      return points.size >= 2;
    },
  };
}
