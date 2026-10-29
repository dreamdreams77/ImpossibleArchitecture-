// Pure geometry for the plan view and the graph overlay. No canvas here, so
// hit-testing and layout can be unit tested.

// A room's size and turn are physical: they decide how the room is drawn in the
// plan. The faces a portal attaches to are logical and never move, so turning a
// room turns its drawing, not its connections.
export const ROOM_HALF = 0.42;          // half-size of a standard room in world units
const FACE_OFFSET = 0.42;        // distance from room centre to face anchor

const FACE_DIR = {
  N: { x: 0, y: -1 },
  E: { x: 1, y: 0 },
  S: { x: 0, y: 1 },
  W: { x: -1, y: 0 },
};

// Half-size of a room in the plan, scaled by its size (1 when absent).
export function roomHalf(room) {
  return ROOM_HALF * (room.size ?? 1);
}

// The direction of a face as drawn: its logical direction turned clockwise by the
// room's quarter-turns. Turning a room by one quarter moves its N face to the E.
export function faceDir(room, face) {
  let d = FACE_DIR[face];
  for (let i = 0; i < (room.turn ?? 0) % 4; i++) d = { x: -d.y + 0, y: d.x + 0 }; // + 0 clears any -0
  return d;
}

export function faceAnchor(room, face) {
  const d = faceDir(room, face);
  const k = FACE_OFFSET * (room.size ?? 1);
  return { x: room.x + d.x * k, y: room.y + d.y * k };
}

// Returns { type: 'face', room, face } for the nearest face within radius,
// else { type: 'room', id } if inside a room, else null.
export function hitTest(structure, wx, wy, { faceRadius = 0.22 } = {}) {
  let best = null;
  let bestD = Infinity;
  for (const room of structure.rooms.values()) {
    for (const face of ['N', 'E', 'S', 'W']) {
      const a = faceAnchor(room, face);
      const d = Math.hypot(wx - a.x, wy - a.y);
      if (d <= faceRadius && d < bestD) {
        best = { type: 'face', room: room.id, face };
        bestD = d;
      }
    }
  }
  if (best) return best;
  for (const room of structure.rooms.values()) {
    const h = roomHalf(room);
    if (Math.abs(wx - room.x) <= h && Math.abs(wy - room.y) <= h) {
      return { type: 'room', id: room.id };
    }
  }
  return null;
}

// Hit-test a portal by distance to its quadratic curve, sampled coarsely.
export function portalHit(structure, wx, wy, tolerance = 0.12) {
  for (const p of structure.portals.values()) {
    const a = structure.rooms.get(p.a.room);
    const b = structure.rooms.get(p.b.room);
    const pts = portalCurve(a, p.a.face, b, p.b.face, p.id);
    for (let i = 0; i < pts.length - 1; i++) {
      if (distToSegment(wx, wy, pts[i], pts[i + 1]) <= tolerance) {
        return { type: 'portal', id: p.id };
      }
    }
  }
  return null;
}

// A portal is drawn as a quadratic curve bowing away from the plan. Its
// control point is offset perpendicular to the chord so that portals between
// the same pair of rooms, or self-loops, remain distinguishable.
export function portalCurve(roomA, faceA, roomB, faceB, id = '') {
  const pa = faceAnchor(roomA, faceA);
  const pb = faceAnchor(roomB, faceB);
  if (roomA.id === roomB.id) {
    // Self-loop: bulge out from the room, to the side of the shared room.
    const d = faceDir(roomA, faceA);
    const c = { x: roomA.x + d.x * 2.2, y: roomA.y + d.y * 2.2 };
    return sampleQuad(pa, c, pb, 14);
  }
  const mx = (pa.x + pb.x) / 2;
  const my = (pa.y + pb.y) / 2;
  const dx = pb.x - pa.x;
  const dy = pb.y - pa.y;
  const len = Math.hypot(dx, dy) || 1;
  const sign = hashSign(id);
  const bow = Math.min(0.9, len * 0.18) * sign;
  const c = { x: mx - (dy / len) * bow, y: my + (dx / len) * bow };
  return sampleQuad(pa, c, pb, 24);
}

function hashSign(s) {
  let h = 0;
  for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return h % 2 === 0 ? 1 : -1;
}

function sampleQuad(p0, p1, p2, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push({
      x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
      y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
    });
  }
  return out;
}

function distToSegment(px, py, a, b) {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const wx = px - a.x;
  const wy = py - a.y;
  const L = vx * vx + vy * vy || 1;
  let t = (wx * vx + wy * vy) / L;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a.x + t * vx), py - (a.y + t * vy));
}

// Layout for the abstract graph overlay: rooms placed on a circle in id order.
// The overlay shows topology, not geometry, so this layout deliberately
// ignores the apparent plan positions.
export function graphLayout(structure, radius = 1) {
  const ids = [...structure.rooms.keys()];
  const n = ids.length;
  const out = new Map();
  ids.forEach((id, i) => {
    const angle = (i / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2;
    out.set(id, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
  });
  return out;
}

// Polyline for each step of a route, oriented in the direction walked. The
// trail gives the rooms visited, so for each portal we know which end the
// traveller entered from. Returns [{ pts, fromRoom, toRoom, portalId }].
export function routeSegments(structure, trail, portalIds) {
  const out = [];
  portalIds.forEach((pid, i) => {
    const p = structure.portals.get(pid);
    if (!p) return;
    const forward = p.a.room === trail[i];
    const from = forward ? p.a : p.b;
    const to = forward ? p.b : p.a;
    const ra = structure.rooms.get(from.room);
    const rb = structure.rooms.get(to.room);
    const pts = portalCurve(ra, from.face, rb, to.face, p.id);
    out.push({ pts, fromRoom: from.room, toRoom: to.room, portalId: pid });
  });
  return out;
}

// Position along the route at `progress` in [0, segments.length]. The integer
// part selects a segment and the fraction moves along its curve.
export function pointAlong(segments, progress) {
  if (segments.length === 0) return null;
  const clamped = Math.max(0, Math.min(progress, segments.length));
  const i = Math.min(Math.floor(clamped), segments.length - 1);
  const frac = clamped - i;
  const pts = segments[i].pts;
  const f = frac * (pts.length - 1);
  const j = Math.min(Math.floor(f), pts.length - 2);
  const u = f - j;
  const a = pts[j];
  const b = pts[j + 1];
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, segment: i };
}
