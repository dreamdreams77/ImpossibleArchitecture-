// First-person view: what a traveller standing in a room sees, looking along
// their heading. The model is pure (and tested): three walls are visible, the
// one ahead and the two beside it. The one behind is the way they came.
//
// Each wall shows one of four things:
//   wall     - solid, nothing beyond
//   passage  - an open passage, with the room beyond and the heading they would
//              arrive with
//   shut     - a gated passage whose plate is not lit on this walk
//   blocked  - a one-way passage seen from its closed side
//
// The drawing is a one-point perspective: the far wall is the wall ahead, and
// the side walls recede to it. Nothing here alters topology or traversal.

import { rotateFace } from '../topology/graph.js';
import { FACE_DIR, polygon, strokeQuad, shorten, vignette } from './util.js';


// Which compass face is ahead, to the right and to the left of a heading.
export function wallFaces(heading) {
  return {
    front: heading,
    right: rotateFace(heading, 1),
    left: rotateFace(heading, -1),
  };
}

export function firstPersonModel(structure, view, plates = []) {
  const { room, heading, lit = 0, delivered = 0 } = view;
  if (!structure.rooms.has(room)) return null;
  const faces = wallFaces(heading);
  const walls = {};
  for (const side of ['front', 'left', 'right']) {
    walls[side] = wallEntry(structure, room, faces[side], lit, plates, delivered);
  }
  return {
    room,
    label: structure.rooms.get(room).label || room,
    heading,
    walls,
  };
}

// A sentence describing what the walker sees, for screen readers.
export function describeFirstPerson(model) {
  if (!model) return 'No room to stand in.';
  const sides = [['Ahead', model.walls.front], ['On the left', model.walls.left], ['On the right', model.walls.right]];
  const parts = sides.map(([where, w]) => {
    if (w.kind === 'wall') return `${where}, a solid wall.`;
    if (w.kind === 'blocked') return `${where}, a one-way passage to ${w.label} that cannot be used from here.`;
    if (w.kind === 'shut') {
      return w.after != null
        ? `${where}, a gate to ${w.label}, shut until crate ${w.after + 1} is delivered.`
        : `${where}, a gate to ${w.label}, shut until plate ${w.gate + 1} is lit.`;
    }
    return `${where}, a passage to ${w.label}, arriving facing ${w.arrival}.`;
  });
  return `In ${model.label}, facing ${model.heading}. ${parts.join(' ')}`;
}

// Which part of the first-person view a click at horizontal position `x` means.
// The outer thirds turn towards the side walls; the middle walks forward.
export function fpZoneFor(x, width) {
  if (width <= 0) return 'forward';
  const f = x / width;
  if (f < 0.3) return 'left';
  if (f > 0.7) return 'right';
  return 'forward';
}

function wallEntry(structure, room, face, lit, plates, delivered = 0) {
  const exit = structure.exit(room, face);
  if (!exit) return { face, kind: 'wall' };
  const dest = structure.rooms.get(exit.room);
  const base = {
    face,
    room: exit.room,
    label: dest.label || dest.id,
    arrival: exit.entryHeading,
    turns: exit.transform.turns,
    mirror: exit.transform.mirror,
  };
  if (exit.blocked) return { ...base, kind: 'blocked' };
  if (exit.gate !== null) {
    const open = (lit & (1 << exit.gate)) !== 0;
    const plate = plates[exit.gate];
    return { ...base, kind: open ? 'passage' : 'shut', gate: exit.gate, plateHeading: plate?.heading ?? null };
  }
  if (exit.opensAfter != null) {
    const open = (delivered & (1 << exit.opensAfter)) !== 0;
    return { ...base, kind: open ? 'passage' : 'shut', gate: null, after: exit.opensAfter, plateHeading: null };
  }
  return { ...base, kind: 'passage' };
}

// ---- drawing -------------------------------------------------------------

// Bilinear point on a quad given as [topNear, topFar, bottomFar, bottomNear]:
// u runs from the near edge to the far edge, v from top to bottom.
function quadPoint(q, u, v) {
  const top = { x: q[0].x + (q[1].x - q[0].x) * u, y: q[0].y + (q[1].y - q[0].y) * u };
  const bottom = { x: q[3].x + (q[2].x - q[3].x) * u, y: q[3].y + (q[2].y - q[3].y) * u };
  return { x: top.x + (bottom.x - top.x) * v, y: top.y + (bottom.y - top.y) * v };
}

// `progress` (0..1) eases a view change: the new view dissolves in and settles
// from a slight zoom. At 1 the view is drawn as is.
// kind 'step': a move eases in from a slight zoom. kind 'turn': the view slides
// sideways (dir -1 from the left, +1 from the right) while it fades in.
export function drawFirstPerson(ctx, model, { width: W, height: H }, T, time = 0, { progress = 1, kind = 'step', dir = 0 } = {}) {
  ctx.save();
  // Opaque background first, so a fading view never shows the one before it.
  ctx.fillStyle = T.paper;
  ctx.fillRect(0, 0, W, H);
  if (progress < 1) {
    const left = 1 - progress;
    if (kind === 'turn') {
      ctx.globalAlpha = 0.5 + 0.5 * progress;
      ctx.translate(dir * left * W * 0.08, 0);
    } else {
      ctx.globalAlpha = 0.4 + 0.6 * progress;
      const k = 0.86 + 0.14 * progress;
      ctx.translate(W / 2, H / 2);
      ctx.scale(k, k);
      ctx.translate(-W / 2, -H / 2);
    }
  }
  if (!model) {
    ctx.restore();
    return;
  }
  const fx0 = W * 0.3;
  const fx1 = W * 0.7;
  const fy0 = H * 0.26;
  const fy1 = H * 0.74;
  const p = (x, y) => ({ x, y });
  const quads = {
    left: [p(0, 0), p(fx0, fy0), p(fx0, fy1), p(0, H)],
    right: [p(W, 0), p(fx1, fy0), p(fx1, fy1), p(W, H)],
    front: [p(fx0, fy0), p(fx1, fy0), p(fx1, fy1), p(fx0, fy1)],
  };

  // Ceiling and floor recede to the far wall.
  polygon(ctx, [p(0, 0), p(W, 0), p(fx1, fy0), p(fx0, fy0)], 'rgba(0,0,0,0.35)', 1);
  polygon(ctx, [p(0, H), p(W, H), p(fx1, fy1), p(fx0, fy1)], T.floor, 0.9);
  // Side walls, then the wall ahead.
  polygon(ctx, quads.left, T.wall, 0.12);
  polygon(ctx, quads.right, T.wall, 0.12);
  polygon(ctx, quads.front, T.floor, 1);
  ctx.strokeStyle = T.wall;
  ctx.lineWidth = 1;
  for (const k of ['left', 'right', 'front']) strokeQuad(ctx, quads[k]);
  // Masonry courses on each wall, so the walls read as built, not as flat colour.
  for (const k of ['left', 'right', 'front']) drawCourses(ctx, quads[k], T);
  // A soft pool of light on the floor in front of each open passage.
  // and a fainter one on the ceiling above it.
  if (model.walls) {
    for (const k of ['left', 'right', 'front']) {
      if (model.walls[k]?.kind !== 'passage') continue;
      drawLightPool(ctx, quads[k], T, W, 0.98, 0.22);
      drawLightPool(ctx, quads[k], T, W, 0.02, 0.1);
    }
  }

  if (!model.walls) {
    ctx.restore();
    return;
  }
  // Openings sit in the middle of each wall; the side walls use depth u, the
  // wall ahead uses width u.
  const spots = {
    front: { q: quads.front, u0: 0.3, u1: 0.7, v0: 0.3, v1: 1 },
    left: { q: quads.left, u0: 0.32, u1: 0.68, v0: 0.22, v1: 1 },
    right: { q: quads.right, u0: 0.32, u1: 0.68, v0: 0.22, v1: 1 },
  };
  for (const side of ['left', 'right', 'front']) {
    const w = model.walls[side];
    const spot = spots[side];
    if (w.kind === 'wall') {
      const c = quadPoint(spot.q, 0.5, 0.45);
      ctx.fillStyle = T.inkDim;
      ctx.font = `${Math.max(10, W / 60)}px ui-monospace, Menlo, monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(`${w.face}: wall`, c.x, c.y);
      continue;
    }
    drawOpening(ctx, w, spot, T, W, time);
  }

  // Compass and room, in the top-left corner.
  ctx.fillStyle = T.ink;
  ctx.font = `${Math.max(11, W / 56)}px ui-monospace, Menlo, monospace`;
  ctx.textAlign = 'left';
  ctx.fillText(`${model.label} · facing ${model.heading}`, 12, 22);
  vignette(ctx, W, H, 0.5);
  ctx.restore();
}

function drawOpening(ctx, w, spot, T, W, time) {
  const corners = [
    quadPoint(spot.q, spot.u0, spot.v0),
    quadPoint(spot.q, spot.u1, spot.v0),
    quadPoint(spot.q, spot.u1, spot.v1),
    quadPoint(spot.q, spot.u0, spot.v1),
  ];
  const top = quadPoint(spot.q, 0.5, spot.v0);
  const bottom = quadPoint(spot.q, 0.5, spot.v1);
  const mid = quadPoint(spot.q, 0.5, (spot.v0 + spot.v1) / 2);
  const fs = Math.max(10, W / 62);

  // The opening itself: a dark void, a glimpse of the room beyond.
  ctx.save();
  ctx.beginPath();
  corners.forEach((c, i) => (i ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y)));
  ctx.closePath();
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.fill();
  ctx.strokeStyle = w.kind === 'blocked' ? T.gate : w.mirror ? T.portalMirror : T.portal;
  ctx.lineWidth = 1.5;
  ctx.setLineDash(w.mirror ? [4, 4] : []);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  ctx.save();
  ctx.fillStyle = T.ink;
  ctx.font = `${fs}px ui-monospace, Menlo, monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(shorten(w.label, 12), mid.x, top.y + fs + 6);

  if (w.kind === 'passage') {
    // The heading this passage delivers, as an arrow inside the opening.
    const d = FACE_DIR[w.arrival];
    const len = Math.min(Math.abs(corners[1].x - corners[0].x), Math.abs(corners[3].y - corners[0].y)) * 0.22;
    const pulse = 0.85 + 0.15 * Math.sin(time / 400);
    // A warm glow spilling out of the open passage, breathing with the arrow.
    const reach = Math.abs(corners[1].x - corners[0].x) * 0.9;
    ctx.save();
    ctx.globalAlpha = 0.28 * pulse;
    const glow = ctx.createRadialGradient(mid.x, mid.y, 0, mid.x, mid.y, reach);
    glow.addColorStop(0, w.mirror ? T.portalMirror : T.portal);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(mid.x - reach, mid.y - reach, reach * 2, reach * 2);
    ctx.restore();
    ctx.strokeStyle = T.route;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(mid.x - d[0] * len * pulse, mid.y - d[1] * len * pulse);
    ctx.lineTo(mid.x + d[0] * len * pulse, mid.y + d[1] * len * pulse);
    ctx.stroke();
    ctx.fillStyle = T.route;
    ctx.beginPath();
    ctx.arc(mid.x + d[0] * len * pulse, mid.y + d[1] * len * pulse, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = T.inkDim;
    ctx.font = `${Math.max(9, fs - 2)}px ui-monospace, Menlo, monospace`;
    ctx.fillText(`arrive ${w.arrival}`, mid.x, bottom.y - 8);
    for (let i = 0; i < w.turns; i++) {
      ctx.fillStyle = T.portal;
      ctx.beginPath();
      ctx.arc(mid.x + (i - (w.turns - 1) / 2) * 7, bottom.y - 22, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // Shut or one-way: a bar across the threshold.
    ctx.strokeStyle = T.gate;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(corners[3].x, corners[3].y - 4);
    ctx.lineTo(corners[2].x, corners[2].y - 4);
    ctx.stroke();
    ctx.fillStyle = T.gate;
    ctx.font = `${Math.max(9, fs - 2)}px ui-monospace, Menlo, monospace`;
    const note = w.kind === 'blocked'
      ? 'one way'
      : w.after != null ? `shut · after crate ${w.after + 1}` : `shut · plate ${w.gate + 1}`;
    ctx.fillText(note, mid.x, mid.y + fs + 14);
  }
  ctx.restore();
}

// The light from an open passage, spilling onto the floor (v near 1) or the
// ceiling (v near 0) beside its wall.
function drawLightPool(ctx, q, T, W, v, alpha) {
  const c = quadPoint(q, 0.5, v);
  const r = W * 0.16;
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.scale(1, 0.35);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, T.portal);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Faint masonry on one wall: horizontal courses, with vertical joints staggered
// from one course to the next. Drawn under the openings, which cover it.
function drawCourses(ctx, q, T) {
  const rows = 6;
  const cols = 4;
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.strokeStyle = T.wall;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let r = 1; r < rows; r++) {
    const a = quadPoint(q, 0, r / rows);
    const b = quadPoint(q, 1, r / rows);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  for (let r = 0; r < rows; r++) {
    const offset = r % 2 ? 0.5 / cols : 0;
    for (let c = 0; c <= cols; c++) {
      const u = c / cols + offset;
      if (u <= 0 || u >= 1) continue; // the edges are already stroked
      const a = quadPoint(q, u, r / rows);
      const b = quadPoint(q, u, (r + 1) / rows);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
  }
  ctx.stroke();
  ctx.restore();
}

// The first-person view's transitions: a move, or a turn on the spot. Keys are
// 'room|heading|steps' as built by the UI.
const FACE_ORDER = ['N', 'E', 'S', 'W'];
// Same room and heading, one more step taken: a move. Same room, new heading: a turn.
export function transitionKind(prevKey, key) {
  if (!prevKey || prevKey === 'empty' || key === 'empty') return 'step';
  const [pr, ph] = prevKey.split('|');
  const [nr, nh] = key.split('|');
  return pr === nr && ph !== nh ? 'turn' : 'step';
}
// +1 for a slide from the right (turned left), -1 for one from the left (turned right).
export function turnDirection(prevKey, key) {
  const a = FACE_ORDER.indexOf(prevKey.split('|')[1]);
  const b = FACE_ORDER.indexOf(key.split('|')[1]);
  if (a < 0 || b < 0) return 0;
  return (b - a + 4) % 4 === 1 ? -1 : 1;
}
