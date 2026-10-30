// Canvas drawing. A pure function of view state: it reads the session and
// paints it, and mutates nothing in the topology.
//
// Architectural conventions used here: walls are drawn as thick lines broken
// where a passage opens, floors carry a fine hatch, portals are drawn as glowing
// curves, gates as bars across their doorway. The test route is shown as a
// numbered path with the heading held in each room. A walking traveller can be
// animated along the route.

import { roomHalf, faceDir, faceAnchor, portalCurve, graphLayout, routeSegments, pointAlong } from './geometry.js';
import { themeFor } from './themes.js';
import { FACE_DIR } from './util.js';
import { bodyContext, litBits, gridSize } from '../topology/blocks.js';

const DOOR_HALF = 0.16; // half-width of a door opening, in world units

export function drawPlan(ctx, view, session, { width, height }, time = 0) {
  const T = themeFor(session.themeName);
  const { scale, offsetX, offsetY } = view;
  const toScreen = (x, y) => ({ x: offsetX + x * scale, y: offsetY + y * scale });

  ctx.save();
  drawBackdrop(ctx, T, width, height);
  drawGrid(ctx, view, width, height, T);

  const s = session.structure;
  const route = session.routeHighlight;

  // Floors and walls first, so portals and gates sit above the architecture.
  for (const r of s.rooms.values()) drawRoom(ctx, s, r, toScreen, scale, T, session);

  // Portals.
  for (const p of s.portals.values()) drawPortal(ctx, s, p, toScreen, T, session, time);

  // Plates.
  for (const plate of session.active?.plates ?? []) drawPlate(ctx, s, plate, toScreen, scale, T, time);

  // Pads: a dashed ring round each room that sets crates down.
  for (const id of session.active?.pads ?? []) {
    const r = s.rooms.get(id);
    if (r) drawPad(ctx, r, toScreen, scale, T);
  }

  // Physical challenges: the grid, pillars, weight plates, blocks and the body.
  if (session.active?.physical) drawBodyLayer(ctx, s, session, toScreen, scale, T);

  // Crates, where the walk has them.
  drawCrates(ctx, s, session.cratePositions(), toScreen, scale, T);

  // Connect-tool anchors.
  if (session.tool === 'connect') drawAnchors(ctx, s, toScreen, T, session);

  // Route overlay and traveller.
  if (route && route.portals && route.portals.length) {
    drawRoute(ctx, s, route, toScreen, scale, T);
  }
  if (session.walk && route) {
    drawWalker(ctx, s, route, session.walk, toScreen, T);
  }

  ctx.restore();
}

function drawBackdrop(ctx, T, width, height) {
  ctx.fillStyle = T.paper;
  ctx.fillRect(0, 0, width, height);
  // A soft vignette keeps the eye in the middle of the plan.
  const g = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.2, width / 2, height / 2, Math.max(width, height) * 0.7);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
}

function drawGrid(ctx, view, width, height, T) {
  const { scale, offsetX, offsetY } = view;
  const startX = ((offsetX % scale) + scale) % scale;
  const startY = ((offsetY % scale) + scale) % scale;
  ctx.lineWidth = 1;
  for (let x = startX; x < width; x += scale) {
    ctx.strokeStyle = Math.abs(Math.round((x - offsetX) / scale)) % 5 === 0 ? T.gridStrong : T.grid;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
  }
  for (let y = startY; y < height; y += scale) {
    ctx.strokeStyle = Math.abs(Math.round((y - offsetY) / scale)) % 5 === 0 ? T.gridStrong : T.grid;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
  }
}

// A room: hatched floor, a wall broken at every face that has a passage, and a
// dashed inner line that reads as the section cut through the wall.
// What each kind of room adds to its floor. Chambers are plain. A corridor has a
// central band, an atrium a dashed inner court, and a cellar a darker floor.
function drawRoomKind(ctx, kind, x0, y0, size, T) {
  if (kind === 'chamber') return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, size, size);
  ctx.clip();
  if (kind === 'corridor') {
    ctx.fillStyle = T.accent;
    ctx.globalAlpha = 0.16;
    ctx.fillRect(x0, y0 + size * 0.36, size, size * 0.28);
  } else if (kind === 'atrium') {
    ctx.strokeStyle = T.accent;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 1.6;
    ctx.strokeRect(x0 + size * 0.2, y0 + size * 0.2, size * 0.6, size * 0.6);
  } else if (kind === 'cellar') {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(x0, y0, size, size);
    ctx.strokeStyle = T.accent;
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 1;
    for (let k = -size; k < size * 2; k += 9) {
      ctx.beginPath();
      ctx.moveTo(x0 + k, y0);
      ctx.lineTo(x0 + k + size, y0 + size);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawRoom(ctx, s, r, toScreen, scale, T, session) {
  const c = toScreen(r.x, r.y);
  const half = roomHalf(r) * scale;
  const x0 = c.x - half;
  const y0 = c.y - half;
  const size = half * 2;
  const selected = session.selection?.type === 'room' && session.selection.id === r.id;

  // A soft shadow under the room, so it sits on the page rather than in it.
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = scale * 0.22;
  ctx.shadowOffsetY = scale * 0.07;
  ctx.fillStyle = T.floor;
  ctx.fillRect(x0, y0, size, size);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, size, size);
  ctx.fillStyle = T.floor;
  ctx.fill();
  ctx.clip();
  ctx.strokeStyle = T.hatch;
  ctx.lineWidth = 1;
  for (let k = -size; k < size * 2; k += 7) {
    ctx.beginPath();
    ctx.moveTo(x0 + k, y0 + size);
    ctx.lineTo(x0 + k + size, y0);
    ctx.stroke();
  }
  ctx.restore();

  drawRoomKind(ctx, r.kind ?? 'chamber', x0, y0, size, T);

  // Walls with door openings.
  const openFaces = new Set(['N', 'E', 'S', 'W'].filter((f) => s.portalAt(r.id, f)));
  ctx.strokeStyle = selected ? T.selected : T.wall;
  ctx.lineWidth = selected ? 3 : 2.2;
  const corners = {
    NW: [x0, y0], NE: [x0 + size, y0], SE: [x0 + size, y0 + size], SW: [x0, y0 + size],
  };
  // Each face is drawn on the screen side its turned direction points to.
  const screenSide = {
    N: [corners.NW, corners.NE], E: [corners.NE, corners.SE],
    S: [corners.SE, corners.SW], W: [corners.SW, corners.NW],
  };
  const sides = ['N', 'E', 'S', 'W'].map((face) => {
    const d = faceDir(r, face);
    const key = d.x === 0 ? (d.y < 0 ? 'N' : 'S') : (d.x > 0 ? 'E' : 'W');
    return [face, ...screenSide[key]];
  });
  for (const [face, a, b] of sides) {
    if (!openFaces.has(face)) {
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      continue;
    }
    // Two wall segments either side of the door.
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const d = [(b[0] - a[0]) / (2 * roomHalf(r) * scale), (b[1] - a[1]) / (2 * roomHalf(r) * scale)];
    const door = DOOR_HALF * scale;
    const p1 = [mid[0] - d[0] * door * 2, mid[1] - d[1] * door * 2];
    const p2 = [mid[0] + d[0] * door * 2, mid[1] + d[1] * door * 2];
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p2[0], p2[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  }

  // Cutaway inset.
  ctx.setLineDash([3, 4]);
  ctx.strokeStyle = T.inkDim;
  ctx.lineWidth = 1;
  ctx.strokeRect(x0 + 6, y0 + 6, size - 12, size - 12);
  ctx.setLineDash([]);

  ctx.fillStyle = T.ink;
  ctx.font = '12px ui-monospace, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(r.label || r.id, c.x, c.y + 4);
}

function drawPortal(ctx, s, p, toScreen, T, session, time) {
  const a = s.rooms.get(p.a.room);
  const b = s.rooms.get(p.b.room);
  const pts = portalCurve(a, p.a.face, b, p.b.face, p.id).map((q) => toScreen(q.x, q.y));
  const selected = session.selection?.type === 'portal' && session.selection.id === p.id;
  const color = p.transform.mirror ? T.portalMirror : T.portal;

  // Glow underlay.
  strokePath(ctx, pts, { color: T.glow, width: selected ? 10 : 7 });
  // Mirror portals show a reflected echo: the space on the far side is flipped.
  if (p.transform.mirror) {
    const echo = pts.map((q, i) => {
      const n = pts[Math.min(i + 1, pts.length - 1)];
      const m = pts[Math.max(i - 1, 0)];
      const tx = n.x - m.x;
      const ty = n.y - m.y;
      const len = Math.hypot(tx, ty) || 1;
      return { x: q.x - (ty / len) * 6, y: q.y + (tx / len) * 6 };
    });
    strokePath(ctx, echo, { color, width: 1, alpha: 0.5, dash: [3, 4] });
  }
  // Core line.
  strokePath(ctx, pts, { color, width: selected ? 3 : 1.6, dash: p.transform.mirror ? [6, 5] : null });
  drawArrow(ctx, pts[pts.length - 2], pts[pts.length - 1], color);
  if (p.oneWay) drawOneWay(ctx, pts, p.oneWay, T.gate);

  // Gate glyph: a bar across the doorway at the a end, labelled with its plate
  // (or, for a delivery gate, with the crate it waits for).
  if (p.gate !== null && p.gate !== undefined || p.opensAfter != null) {
    const g = pts[1];
    ctx.save();
    ctx.strokeStyle = T.gate;
    ctx.lineWidth = 3;
    const dir = faceDir(s.rooms.get(p.a.room), p.a.face);
    const perp = [-dir.y, dir.x];
    const len = 10;
    ctx.beginPath();
    ctx.moveTo(g.x - perp[0] * len, g.y - perp[1] * len);
    ctx.lineTo(g.x + perp[0] * len, g.y + perp[1] * len);
    ctx.stroke();
    ctx.fillStyle = T.gate;
    ctx.font = '10px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    const tag = p.gate !== null && p.gate !== undefined ? `gate ${p.gate + 1}` : `after crate ${p.opensAfter + 1}`;
    ctx.fillText(tag, g.x, g.y - len - 4);
    ctx.restore();
  }

  // Turn pips near the middle.
  const mid = pts[Math.floor(pts.length / 2)];
  for (let i = 0; i < p.transform.turns; i++) {
    ctx.fillStyle = T.portal;
    ctx.beginPath();
    ctx.arc(mid.x + (i - (p.transform.turns - 1) / 2) * 7, mid.y - 12, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  // Fixed passages are marked with a small diamond so they read as architecture.
  if (p.fixed) {
    ctx.fillStyle = T.inkDim;
    ctx.beginPath();
    ctx.moveTo(mid.x, mid.y + 12 - 4); ctx.lineTo(mid.x + 4, mid.y + 12); ctx.lineTo(mid.x, mid.y + 16); ctx.lineTo(mid.x - 4, mid.y + 12);
    ctx.closePath(); ctx.fill();
  }
}

function drawPad(ctx, r, toScreen, scale, T) {
  const c = toScreen(r.x, r.y);
  const rad = roomHalf(r) * scale + 9;
  ctx.save();
  ctx.strokeStyle = T.accent;
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 4]);
  ctx.strokeRect(c.x - rad, c.y - rad, rad * 2, rad * 2);
  ctx.restore();
}

// A crate is a small square in its room. Crates sharing a room sit side by side,
// and a carried crate is drawn outlined in the accent colour, so the walk shows
// what the traveller is holding.
function drawCrates(ctx, s, crates, toScreen, scale, T) {
  const count = new Map();
  for (const crate of crates) count.set(crate.room, (count.get(crate.room) ?? 0) + 1);
  const seenIn = new Map();
  crates.forEach((crate) => {
    const r = s.rooms.get(crate.room);
    if (!r) return;
    const k = seenIn.get(crate.room) ?? 0;
    seenIn.set(crate.room, k + 1);
    const c = toScreen(r.x, r.y);
    const half = 0.12 * scale;
    const cx = c.x + (k - (count.get(crate.room) - 1) / 2) * half * 2.6;
    const cy = c.y + half * 1.2;
    ctx.save();
    ctx.fillStyle = T.inkDim;
    ctx.strokeStyle = crate.carried ? T.accent : T.ink;
    ctx.lineWidth = crate.carried ? 2.5 : 1.2;
    ctx.fillRect(cx - half, cy - half, half * 2, half * 2);
    ctx.strokeRect(cx - half, cy - half, half * 2, half * 2);
    ctx.restore();
  });
}

function drawPlate(ctx, s, plate, toScreen, scale, T, time) {
  const r = s.rooms.get(plate.room);
  if (!r || plate.mode === 'weight') return; // weight plates sit on one cell: see drawBodyLayer
  const c = toScreen(r.x, r.y);
  const d = faceDir(r, plate.heading);
  const rad = roomHalf(r) * scale + 6;
  const pulse = 0.5 + 0.5 * Math.sin(time / 500);
  ctx.save();
  ctx.strokeStyle = T.accent;
  ctx.globalAlpha = 0.55 + 0.45 * pulse;
  ctx.lineWidth = 2;
  // Toggle plates are dashed: they change state rather than latch.
  if (plate.mode === 'toggle') ctx.setLineDash([4, 5]);
  ctx.beginPath(); ctx.arc(c.x, c.y, rad, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(c.x + d[0] * (rad - 8), c.y + d[1] * (rad - 8));
  ctx.lineTo(c.x + d[0] * (rad + 6), c.y + d[1] * (rad + 6));
  ctx.stroke();
  ctx.restore();
}

function drawAnchors(ctx, s, toScreen, T, session) {
  for (const r of s.rooms.values()) {
    for (const face of ['N', 'E', 'S', 'W']) {
      const a = toScreen(faceAnchor(r, face).x, faceAnchor(r, face).y);
      const pending = session.pendingFace?.room === r.id && session.pendingFace?.face === face;
      ctx.fillStyle = pending ? T.pending : T.inkDim;
      ctx.beginPath();
      ctx.arc(a.x, a.y, pending ? 6 : 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// The test route: a dashed path through each passage, numbered in order, and a
// small arrow in each room showing the heading the traveller holds there.
function drawRoute(ctx, s, route, toScreen, scale, T) {
  const segs = routeSegments(s, route.trail, route.portals);
  ctx.save();
  for (const seg of segs) {
    const pts = seg.pts.map((q) => toScreen(q.x, q.y));
    strokePath(ctx, pts, { color: T.route, width: 3, dash: [2, 6] });
  }
  segs.forEach((seg, i) => {
    const mid = toScreen(seg.pts[Math.floor(seg.pts.length / 2)].x, seg.pts[Math.floor(seg.pts.length / 2)].y);
    ctx.fillStyle = T.route;
    ctx.beginPath(); ctx.arc(mid.x, mid.y, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = T.paper;
    ctx.font = '11px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String(i + 1), mid.x, mid.y + 4);
  });
  // Heading held in each room of the route (the impossible-perspective cue).
  (route.headings ?? []).forEach((h, i) => {
    const room = s.rooms.get(route.trail[i]);
    if (!room) return;
    const c = toScreen(room.x, room.y);
    drawHeadingArrow(ctx, c, h, scale * 0.28, T.route, 0.9);
  });
  ctx.restore();
}

// The traveller: a glowing marker that follows the route, with the heading it
// holds at its current room. The heading can change at every portal.
function drawWalker(ctx, s, route, walk, toScreen, T) {
  const segs = routeSegments(s, route.trail, route.portals);
  const pos = pointAlong(segs, walk.progress);
  if (!pos) return;
  const p = toScreen(pos.x, pos.y);
  const heading = route.headings[Math.min(Math.floor(walk.progress), route.headings.length - 1)];
  ctx.save();
  const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 16);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.4, T.route);
  g.addColorStop(1, 'rgba(127,214,164,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(p.x, p.y, 16, 0, Math.PI * 2); ctx.fill();
  drawHeadingArrow(ctx, p, heading, 14, '#ffffff', 1);
  ctx.restore();
}

// An arrow from a centre point in a compass direction, scaled to `len`.
function drawHeadingArrow(ctx, c, heading, len, color, alpha) {
  const d = FACE_DIR[heading];
  if (!d) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  const tx = c.x + d[0] * len;
  const ty = c.y + d[1] * len;
  ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(tx, ty); ctx.stroke();
  drawArrow(ctx, { x: c.x, y: c.y }, { x: tx, y: ty }, color);
  ctx.restore();
}

function strokePath(ctx, pts, { color, width, alpha = 1, dash = null }) {
  if (!pts.length) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath();
  pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
  ctx.stroke();
  ctx.restore();
}

// One-way passages carry double chevrons at their midpoint, pointing in the
// only direction the passage may be crossed.
function drawOneWay(ctx, pts, oneWay, color) {
  const from = oneWay === 'a' ? pts[0] : pts[pts.length - 1];
  const to = oneWay === 'a' ? pts[pts.length - 1] : pts[0];
  const mid = pts[Math.floor(pts.length / 2)];
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  for (const off of [-4, 4]) {
    const cx = mid.x + ux * off;
    const cy = mid.y + uy * off;
    ctx.beginPath();
    ctx.moveTo(cx - ux * 4 - uy * 4, cy - uy * 4 + ux * 4);
    ctx.lineTo(cx + ux * 2, cy + uy * 2);
    ctx.lineTo(cx - ux * 4 + uy * 4, cy - uy * 4 - ux * 4);
    ctx.stroke();
  }
  ctx.restore();
}

function drawArrow(ctx, from, to, color) {
  if (!from || !to) return;
  const ang = Math.atan2(to.y - from.y, to.x - from.x);
  const len = 9;
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - len * Math.cos(ang - 0.4), to.y - len * Math.sin(ang - 0.4));
  ctx.lineTo(to.x - len * Math.cos(ang + 0.4), to.y - len * Math.sin(ang + 0.4));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// The graph overlay: rooms as nodes on a circle, portals as edges. The
// developer view of the topology, independent of plan positions.
export function drawGraph(ctx, structure, selection, { width, height }, themeName = 'slate') {
  const T = themeFor(themeName);
  ctx.save();
  ctx.fillStyle = T.paper;
  ctx.fillRect(0, 0, width, height);
  const cx = width / 2;
  const cy = height / 2;
  const R = Math.min(width, height) * 0.36;
  const layout = graphLayout(structure, R);
  const pos = (id) => ({ x: cx + layout.get(id).x, y: cy + layout.get(id).y });

  for (const p of structure.portals.values()) {
    const a = pos(p.a.room);
    const b = pos(p.b.room);
    ctx.strokeStyle = p.transform.mirror ? T.portalMirror : T.portal;
    ctx.lineWidth = selection?.type === 'portal' && selection.id === p.id ? 3 : 1.4;
    if (p.a.room === p.b.room) {
      ctx.beginPath(); ctx.arc(a.x + 18, a.y - 18, 14, 0, Math.PI * 2); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    ctx.fillStyle = T.inkDim;
    ctx.font = '11px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    const gate = p.gate !== null && p.gate !== undefined ? ` ⚿${p.gate + 1}` : p.opensAfter != null ? ` ⚿c${p.opensAfter + 1}` : '';
    const label = `${p.a.face}→${p.b.face}${p.transform.turns ? ` ↻${p.transform.turns}` : ''}${p.transform.mirror ? ' ⇋' : ''}${gate}`;
    ctx.fillText(label, mx, my - 4);
  }

  for (const r of structure.rooms.values()) {
    const p = pos(r.id);
    const selected = selection?.type === 'room' && selection.id === r.id;
    ctx.fillStyle = T.floor;
    ctx.strokeStyle = selected ? T.selected : T.wall;
    ctx.lineWidth = selected ? 2.5 : 1.2;
    ctx.beginPath(); ctx.arc(p.x, p.y, 16, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = T.ink;
    ctx.font = '11px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(r.label || r.id, p.x, p.y + 30);
  }
  ctx.restore();
}

// The grid of a physical challenge, drawn in each room: pillars, weight plates (lit while held down),
// targets, blocks, and the body with the way it faces. Cells are the engine's own cells.
function drawBodyLayer(ctx, s, session, toScreen, scale, T) {
  const chapter = session.active;
  const body = session.fp;
  const ctxB = bodyContext(chapter);
  const lit = body ? litBits(body, ctxB) : 0;
  const blocks = body ? body.blocks : (chapter.blocks ?? []);
  const targets = chapter.goal?.kind === 'place' ? chapter.goal.targets ?? [] : [];
  ctx.save();
  for (const r of s.rooms.values()) {
    const n = gridSize(r);
    const half = roomHalf(r) * scale;
    const c = toScreen(r.x, r.y);
    const cs = (2 * half) / n;
    const cell = (cx, cz) => ({ x: c.x - half + (cx + 0.5) * cs, y: c.y - half + (cz + 0.5) * cs });
    ctx.strokeStyle = T.inkDim;
    ctx.globalAlpha = 0.18;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < n; i++) {
      ctx.moveTo(c.x - half + i * cs, c.y - half); ctx.lineTo(c.x - half + i * cs, c.y + half);
      ctx.moveTo(c.x - half, c.y - half + i * cs); ctx.lineTo(c.x + half, c.y - half + i * cs);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    for (const key of ctxB.solids.get(r.id) ?? []) {
      const [cx, cz] = key.split(',').map(Number);
      const p = cell(cx, cz);
      ctx.fillStyle = T.inkDim;
      ctx.fillRect(p.x - cs / 2 + 1, p.y - cs / 2 + 1, cs - 2, cs - 2);
    }
    for (const w of ctxB.weights.filter((q) => q.room === r.id)) {
      const p = cell(w.cell[0], w.cell[1]);
      const on = (lit & (1 << w.index)) !== 0;
      ctx.strokeStyle = on ? T.route : T.accent;
      ctx.lineWidth = on ? 2.5 : 1.6;
      ctx.strokeRect(p.x - cs / 2 + 2, p.y - cs / 2 + 2, cs - 4, cs - 4);
      if (on) { ctx.fillStyle = T.route; ctx.globalAlpha = 0.25; ctx.fillRect(p.x - cs / 2 + 2, p.y - cs / 2 + 2, cs - 4, cs - 4); ctx.globalAlpha = 1; }
    }
    for (const t of targets.filter((q) => q.room === r.id)) {
      const p = cell(t.cell[0], t.cell[1]);
      ctx.strokeStyle = T.accent;
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(p.x, p.y, cs * 0.42, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    for (const b of blocks.filter((q) => q.room === r.id)) {
      const p = cell(b.cell[0], b.cell[1]);
      ctx.fillStyle = T.ink;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(p.x - cs * 0.4, p.y - cs * 0.4, cs * 0.8, cs * 0.8);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = T.accent;
      ctx.lineWidth = 1.4;
      ctx.strokeRect(p.x - cs * 0.4, p.y - cs * 0.4, cs * 0.8, cs * 0.8);
    }
    if (body && body.room === r.id) {
      const p = cell(body.cell[0], body.cell[1]);
      const d = faceDir(r, body.heading);
      ctx.fillStyle = T.selected;
      ctx.beginPath(); ctx.arc(p.x, p.y, cs * 0.34, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = T.selected;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + d[0] * cs * 0.8, p.y + d[1] * cs * 0.8); ctx.stroke();
    }
  }
  ctx.restore();
}
