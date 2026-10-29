// Isometric model view: the construction as blocks on a floor. Rooms stand at
// their plan positions; portals arc between the faces they join. The view can
// be turned about the vertical axis, and a walker can be shown moving along a
// route, so a building that looks flat on the plan can be seen to fold and loop.
//
// Projection is pure and tested. Drawing uses the theme palette.

import { vignette } from './util.js';

const COS = Math.cos(Math.PI / 6);
const SIN = Math.sin(Math.PI / 6);
const BLOCK = 0.8;   // room footprint, in grid units
const HEIGHT = 0.9;  // room height, in grid units
const FACE_VEC = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };

// Isometric projection of a grid point (x, y, z) at `scale` pixels per unit.
// Screen y grows downwards, so z (height) lifts a point upwards on screen.
export function isoProject(x, y, z, scale) {
  return { x: (x - y) * COS * scale, y: (x + y) * SIN * scale - z * scale };
}

// Turns a grid point about the origin by `angle` radians.
function rotateGrid(x, y, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: x * c - y * s, y: x * s + y * c };
}

// Maps grid coordinates to screen pixels for a whole construction. The view is
// turned by `angle`, scaled so the construction fits the canvas, and centred.
function makeProjector(structure, width, height, angle = 0, zoom = 1) {
  const rooms = [...structure.rooms.values()];
  const rot = (x, y) => rotateGrid(x, y, angle);
  let scale = (Math.min(width, height) / 6) * zoom;
  let cx = width / 2;
  let cy = height / 2;
  if (rooms.length > 0) {
    const flat = rooms.map((r) => {
      const q = rot(r.x, r.y);
      return isoProject(q.x, q.y, 0, 1);
    });
    const xs = flat.map((p) => p.x);
    const ys = flat.map((p) => p.y);
    // Margins for the block's footprint and height, so nothing is cut off.
    const exW = Math.max(...xs) - Math.min(...xs) + 2 * BLOCK;
    const exH = Math.max(...ys) - Math.min(...ys) + BLOCK + HEIGHT;
    scale = Math.max(12, Math.min(110, Math.min((width * 0.9) / exW, (height * 0.9) / exH))) * zoom;
    const placed = rooms.map((r) => {
      const q = rot(r.x, r.y);
      return isoProject(q.x, q.y, 0, scale);
    });
    const px = placed.map((p) => p.x);
    const py = placed.map((p) => p.y);
    cx = width / 2 - (Math.min(...px) + Math.max(...px)) / 2;
    cy = height / 2 - (Math.min(...py) + Math.max(...py)) / 2;
  }
  const at = (x, y, z = 0) => {
    const q = rot(x, y);
    const p = isoProject(q.x, q.y, z, scale);
    return { x: p.x + cx, y: p.y + cy };
  };
  // Depth for back-to-front drawing: nearer rooms have larger rotated x + y.
  const depth = (x, y) => {
    const q = rot(x, y);
    return q.x + q.y;
  };
  return { scale, at, depth };
}

// Screen position of each room's floor centre.
export function modelLayout(structure, width, height, angle = 0, zoom = 1) {
  const P = makeProjector(structure, width, height, angle, zoom);
  const pts = new Map();
  for (const r of structure.rooms.values()) pts.set(r.id, P.at(r.x, r.y, 0));
  return { scale: P.scale, pts };
}

export function drawModel(ctx, structure, { width: W, height: H }, T, time = 0, { angle = 0, walker = null, zoom = 1, selected = null } = {}) {
  ctx.save();
  ctx.fillStyle = T.paper;
  ctx.fillRect(0, 0, W, H);
  const P = makeProjector(structure, W, H, angle, zoom);
  const rooms = [...structure.rooms.values()].sort((a, b) => P.depth(a.x, a.y) - P.depth(b.x, b.y));

  // Blocks, back to front, each on a soft shadow so the floor reads as a floor.
  for (const r of rooms) {
    drawShadow(ctx, P.scale, P.at(r.x, r.y));
    drawBlock(ctx, r, P, T, r.id === selected);
  }
  for (const p of structure.portals.values()) {
    drawArc(ctx, structure, p, P, T, time);
  }
  if (walker && walker.trail?.length) drawWalkerAt(ctx, structure, walker, P, T, time);
  vignette(ctx, W, H, 0.35);
  ctx.restore();
}

function drawShadow(ctx, scale, centre) {
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.ellipse(centre.x, centre.y, scale * 0.5, scale * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBlock(ctx, room, P, T, selected = false) {
  const h = BLOCK / 2;
  const corner = (dx, dy, z) => P.at(room.x + dx, room.y + dy, z);
  const top = [corner(-h, -h, HEIGHT), corner(h, -h, HEIGHT), corner(h, h, HEIGHT), corner(-h, h, HEIGHT)];
  const east = [corner(h, -h, 0), corner(h, h, 0), corner(h, h, HEIGHT), corner(h, -h, HEIGHT)];
  const south = [corner(-h, h, 0), corner(h, h, 0), corner(h, h, HEIGHT), corner(-h, h, HEIGHT)];
  fillPoly(ctx, south, T.wall, 0.35);
  fillPoly(ctx, east, T.wall, 0.22);
  fillPoly(ctx, top, T.floor, 1);
  ctx.strokeStyle = T.wall;
  ctx.lineWidth = 1;
  strokePoly(ctx, top);
  if (selected) {
    ctx.strokeStyle = T.selected;
    ctx.lineWidth = 2.5;
    strokePoly(ctx, top);
  }
  const c = corner(0, 0, HEIGHT);
  ctx.fillStyle = T.ink;
  ctx.font = `${Math.max(9, P.scale * 0.22)}px ui-monospace, Menlo, monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(room.label || room.id, c.x, c.y + 4);
}

// The arc for a portal: from the centre of one face to the other, rising
// between them. Mirror portals are dashed, fixed ones heavier. One-way
// passages carry a chevron pointing the only way across; gated passages a bar.
function drawArc(ctx, structure, p, P, T, time) {
  const a = faceCentre(structure.rooms.get(p.a.room), p.a.face, P);
  const b = faceCentre(structure.rooms.get(p.b.room), p.b.face, P);
  const lift = Math.hypot(a.x - b.x, a.y - b.y) * 0.25 + P.scale * 0.3;
  const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - lift };
  ctx.save();
  ctx.strokeStyle = p.transform.mirror ? T.portalMirror : T.portal;
  ctx.lineWidth = p.fixed ? 2.2 : 1.6;
  ctx.setLineDash(p.transform.mirror ? [5, 4] : []);
  ctx.shadowColor = T.glow;
  ctx.shadowBlur = 6 + 2 * Math.sin(time / 500);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.quadraticCurveTo(c.x, c.y, b.x, b.y);
  ctx.stroke();
  ctx.restore();

  // Points on the curve at a quarter and at the middle (quadratic Bezier).
  const at = (t) => ({
    x: (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * c.x + t * t * b.x,
    y: (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * c.y + t * t * b.y,
  });
  if (p.oneWay) {
    const from = p.oneWay === 'a' ? a : b;
    const to = p.oneWay === 'a' ? b : a;
    drawChevron(ctx, at(0.5), { x: to.x - from.x, y: to.y - from.y }, T.gate, P.scale);
  }
  if ((p.gate !== null && p.gate !== undefined) || p.opensAfter != null) {
    const m = at(0.3);
    ctx.save();
    ctx.strokeStyle = T.gate;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(m.x - P.scale * 0.1, m.y + P.scale * 0.1);
    ctx.lineTo(m.x + P.scale * 0.1, m.y - P.scale * 0.1);
    ctx.stroke();
    ctx.restore();
  }
}

function drawChevron(ctx, at, dir, color, scale) {
  const len = Math.hypot(dir.x, dir.y) || 1;
  const ux = dir.x / len;
  const uy = dir.y / len;
  const s = Math.max(3, scale * 0.08);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(at.x - ux * s - uy * s, at.y - uy * s + ux * s);
  ctx.lineTo(at.x + ux * s, at.y + uy * s);
  ctx.lineTo(at.x - ux * s + uy * s, at.y - uy * s - ux * s);
  ctx.stroke();
  ctx.restore();
}

// Where a face of a room meets the middle of its height, in screen space.
function faceCentre(room, face, P) {
  const [dx, dy] = FACE_VEC[face];
  return P.at(room.x + dx * BLOCK / 2, room.y + dy * BLOCK / 2, HEIGHT / 2);
}

// The walker: a dot moving from room to room along the route's trail. `progress`
// runs from 0 at the start of the trail to its last room, as in the plan view.
function drawWalkerAt(ctx, structure, walker, P, T, time) {
  const n = walker.trail.length;
  const pos = Math.min(Math.max(walker.progress ?? 0, 0), n - 1);
  const i = Math.min(Math.floor(pos), n - 1);
  const j = Math.min(i + 1, n - 1);
  const f = pos - i;
  const from = structure.rooms.get(walker.trail[i]);
  const to = structure.rooms.get(walker.trail[j]);
  if (!from || !to) return;
  const a = P.at(from.x, from.y, HEIGHT + 0.2);
  const b = P.at(to.x, to.y, HEIGHT + 0.2);
  const x = a.x + (b.x - a.x) * f;
  const y = a.y + (b.y - a.y) * f;
  const pulse = 1 + 0.15 * Math.sin(time / 180);
  ctx.save();
  ctx.fillStyle = T.route;
  ctx.shadowColor = T.route;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(3, P.scale * 0.1) * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function fillPoly(ctx, pts, color, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  tracePoly(ctx, pts);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function strokePoly(ctx, pts) {
  tracePoly(ctx, pts);
  ctx.closePath();
  ctx.stroke();
}

function tracePoly(ctx, pts) {
  ctx.beginPath();
  pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
}

// The turn the model starts with, and the reset for the F key.
export const DEFAULT_ANGLE = 0.5;

// One frame of coasting after a drag: the spin carries the angle on and decays.
// A spin too small to see stops, so the model settles rather than creeping.
export function coastAngle(angle, spin) {
  const next = spin * 0.92;
  return { angle: angle + spin, spin: Math.abs(next) < 0.001 ? 0 : next };
}

// A plain-language line for the model's canvas label.
export function describeModel(structure) {
  const rooms = structure.rooms.size;
  const portals = structure.portals.size;
  const noun = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  return `Isometric model: ${noun(rooms, 'room')}, ${noun(portals, 'portal')}. Drag, or use the left and right arrow keys, to turn it. F returns it to its first turn.`;
}

