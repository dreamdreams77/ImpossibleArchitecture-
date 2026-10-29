// Sightline cards: a perspective view of what each face of a room leads to.
//
// The model is pure (and tested): for each compass face, either a wall, or a
// passage with the room beyond, the heading a traveller would arrive with, and
// the passage's quarter-turns and mirror.
//
// The drawing gives each passage a one-point perspective: floor, ceiling and
// side walls recede from the cell's edge to a far wall at the vanishing point.
// The far wall carries the destination's name and an arrow for the arrival
// heading, which is the point of the view: the corridor looks like an ordinary
// corridor, but the heading it delivers may differ from the way it was entered.
// Quarter-turns appear as pips on the far wall; a reflecting passage has a
// dashed far wall. Nothing here alters topology.

import { sightlines } from '../topology/traversal.js';
import { FACE_DIR, polygon, shorten } from './util.js';

// Layout: a 3x3 grid with the room in the centre and each face in the cell on
// its compass side, so the view reads like the plan around the room.
const GRID_POS = { N: [1, 0], W: [0, 1], E: [2, 1], S: [1, 2] };

export function sightCardModel(structure, roomId) {
  if (!structure.rooms.has(roomId)) return null;
  return sightlines(structure, roomId).map((sl) => {
    if (sl.wall) return { face: sl.face, kind: 'wall', blocked: Boolean(sl.blocked) };
    const dest = structure.rooms.get(sl.room);
    return {
      face: sl.face,
      kind: 'passage',
      room: sl.room,
      label: dest.label || dest.id,
      arrival: sl.arrival,
      gated: sl.gated,
      turns: sl.turns,
      mirror: sl.mirror,
    };
  });
}

export function drawSightCards(ctx, model, { width, height }, T, roomLabel = '') {
  ctx.save();
  ctx.fillStyle = T.paper;
  ctx.fillRect(0, 0, width, height);
  if (!model) {
    ctx.restore();
    return;
  }
  const cw = width / 3;
  const ch = height / 3;
  for (const m of model) {
    const [gx, gy] = GRID_POS[m.face];
    drawCell(ctx, m, m.face, gx * cw, gy * ch, cw, ch, T);
  }
  drawCentre(ctx, cw, ch, roomLabel, T);
  ctx.restore();
}

function drawCentre(ctx, cw, ch, roomLabel, T) {
  ctx.save();
  ctx.fillStyle = T.floor;
  ctx.fillRect(cw, ch, cw, ch);
  ctx.strokeStyle = T.wall;
  ctx.strokeRect(cw + 0.5, ch + 0.5, cw - 1, ch - 1);
  ctx.fillStyle = T.ink;
  ctx.font = '12px ui-monospace, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(shorten(roomLabel, 10), cw * 1.5, ch * 1.5 + 4);
  ctx.restore();
}

function drawCell(ctx, m, face, x, y, w, h, T) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 1, y + 1, w - 2, h - 2);
  ctx.clip();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = T.wall;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  if (!m || m.kind === 'wall') {
    drawWall(ctx, face, x, y, w, h, T, m?.blocked);
  } else {
    drawCorridor(ctx, m, face, x, y, w, h, T);
  }
  ctx.restore();
}

// A wall: a solid bar on the side it closes, and its label.
function drawWall(ctx, face, x, y, w, h, T, blocked = false) {
  ctx.fillStyle = T.wall;
  ctx.globalAlpha = 0.55;
  const d = FACE_DIR[face];
  const bar = 6;
  if (d[0] !== 0) ctx.fillRect(d[0] > 0 ? x + w - bar : x, y, bar, h);
  else ctx.fillRect(x, d[1] > 0 ? y + h - bar : y, w, bar);
  ctx.globalAlpha = 1;
  ctx.fillStyle = T.inkDim;
  ctx.font = '11px ui-monospace, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(blocked ? `${face}: one way` : `${face}: wall`, x + w / 2, y + h / 2 + 4);
}

// A passage as a one-point perspective. The near rectangle is the cell's edge;
// the far wall sits at the vanishing point in the middle of the cell.
function drawCorridor(ctx, m, face, x, y, w, h, T) {
  const margin = 5;
  const nx0 = x + margin;
  const ny0 = y + margin;
  const nx1 = x + w - margin;
  const ny1 = y + h - margin;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const fx0 = cx - w * 0.21;
  const fx1 = cx + w * 0.21;
  const fy0 = cy - h * 0.21;
  const fy1 = cy + h * 0.21;

  // Floor, ceiling and side walls recede to the far wall.
  polygon(ctx, [[nx0, ny1], [nx1, ny1], [fx1, fy1], [fx0, fy1]], T.floor, 0.9);
  polygon(ctx, [[nx0, ny0], [nx1, ny0], [fx1, fy0], [fx0, fy0]], 'rgba(0,0,0,0.35)', 1);
  polygon(ctx, [[nx0, ny0], [fx0, fy0], [fx0, fy1], [nx0, ny1]], T.wall, 0.12);
  polygon(ctx, [[nx1, ny0], [fx1, fy0], [fx1, fy1], [nx1, ny1]], T.wall, 0.12);

  // Edge lines of the corridor.
  ctx.strokeStyle = T.wall;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1;
  for (const [a, b] of [[[nx0, ny0], [fx0, fy0]], [[nx1, ny0], [fx1, fy0]], [[nx0, ny1], [fx0, fy1]], [[nx1, ny1], [fx1, fy1]]]) {
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Far wall: the room beyond. A reflecting passage gets a dashed outline.
  ctx.fillStyle = T.floor;
  ctx.fillRect(fx0, fy0, fx1 - fx0, fy1 - fy0);
  ctx.strokeStyle = m.mirror ? T.portalMirror : T.portal;
  ctx.lineWidth = 1.5;
  ctx.setLineDash(m.mirror ? [3, 3] : []);
  ctx.strokeRect(fx0, fy0, fx1 - fx0, fy1 - fy0);
  ctx.setLineDash([]);

  // The destination's name, high on the far wall.
  ctx.fillStyle = T.ink;
  ctx.font = '10px ui-monospace, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(shorten(m.label, 9), cx, fy0 + 10);

  // The arrival heading, as an arrow across the far wall. This is what the
  // corridor delivers, which may differ from the direction it was entered.
  const d = FACE_DIR[m.arrival];
  const len = Math.min(fx1 - fx0, fy1 - fy0) * 0.28;
  ctx.strokeStyle = T.route;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - d[0] * len, cy + 6 - d[1] * len);
  ctx.lineTo(cx + d[0] * len, cy + 6 + d[1] * len);
  ctx.stroke();
  arrowHead(ctx, cx + d[0] * len, cy + 6 + d[1] * len, d, T.route);

  // Quarter-turns as pips along the bottom of the far wall.
  ctx.fillStyle = T.portal;
  for (let i = 0; i < m.turns; i++) {
    ctx.beginPath();
    ctx.arc(cx + (i - (m.turns - 1) / 2) * 6, fy1 - 5, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }

  // Vanishing point.
  ctx.fillStyle = T.inkDim;
  ctx.beginPath(); ctx.arc(cx, cy, 1.2, 0, Math.PI * 2); ctx.fill();

  // A gate: a bar across the near edge that faces the room.
  if (m.gated) {
    ctx.strokeStyle = T.gate;
    ctx.lineWidth = 3;
    const f = FACE_DIR[face];
    ctx.beginPath();
    if (f[0] !== 0) {
      const gx = f[0] > 0 ? nx1 - 1 : nx0 + 1;
      ctx.moveTo(gx, ny0); ctx.lineTo(gx, ny1);
    } else {
      const gy = f[1] > 0 ? ny1 - 1 : ny0 + 1;
      ctx.moveTo(nx0, gy); ctx.lineTo(nx1, gy);
    }
    ctx.stroke();
  }
}

function arrowHead(ctx, x, y, d, color) {
  const size = 4;
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y);
  // Perpendicular offsets for the two barbs.
  const px = -d[1];
  const py = d[0];
  ctx.lineTo(x - d[0] * size * 1.6 + px * size, y - d[1] * size * 1.6 + py * size);
  ctx.lineTo(x - d[0] * size * 1.6 - px * size, y - d[1] * size * 1.6 - py * size);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

