// Room architecture. buildRoom turns a room spec into real geometry: a floor
// slab with inlays and wayfinding lines, layered walls with true openings,
// door casings, pilasters, panelled bays, cornices, a coffered, vaulted or
// groined ceiling, and the features of the room's style (arcades, colossal
// piers, gear trains, split light, oculus). Everything that is static is merged
// per material; gears, dust and lamps that move are separate and animated.
//
// The room's local frame is described in frames.js. The graph decides which
// faces have doors; nothing here decides topology.

import {
  Group, Mesh, Points, BufferGeometry, Float32BufferAttribute, PointsMaterial, Shape, ExtrudeGeometry,
  Matrix4, Vector3, Euler, Quaternion, Sprite, SpriteMaterial, AdditiveBlending, Color,
  CylinderGeometry, Path,
} from '../vendor/three/three.module.js';
import { Builder } from './builder.js';
import { glowTexture, shaftMaterial } from './materials.js';
import { KIND_PROFILE } from './styles.js';
import { FACES, FACE_NORMAL, WALL_T, DOOR_W, DOOR_H, halfWidth, doorFrame } from './frames.js';

const T = WALL_T;
const FACE_THETA = Object.fromEntries(FACES.map((f) => [f, Math.atan2(FACE_NORMAL[f][0], FACE_NORMAL[f][2])]));

export function roomHeight(style, kind, size) {
  const profile = KIND_PROFILE[kind] ?? KIND_PROFILE.chamber;
  return style.height * profile.heightScale * (0.9 + 0.1 * size);
}

// A gear: a toothed disc with spokes cut out, as an extrusion.
export function gearGeometry(teeth = 14, rOuter = 1, rRoot = 0.84, depth = 0.2, spokes = 5) {
  const s = new Shape();
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const p = [
      [rRoot, a], [rOuter, a + step * 0.2], [rOuter, a + step * 0.5], [rRoot, a + step * 0.7],
    ];
    p.forEach(([r, ang], j) => {
      const x = Math.cos(ang) * r; const y = Math.sin(ang) * r;
      if (i === 0 && j === 0) s.moveTo(x, y); else s.lineTo(x, y);
    });
  }
  s.closePath();
  // Spoke windows: circular sectors between the hub and the rim.
  const hub = rRoot * 0.28; const rim = rRoot * 0.78;
  for (let k = 0; k < spokes; k++) {
    const a0 = (k / spokes) * Math.PI * 2 + 0.14;
    const a1 = ((k + 1) / spokes) * Math.PI * 2 - 0.14;
    const h = new Path();
    h.absarc(0, 0, rim, a0, a1, false);
    h.absarc(0, 0, hub, a1, a0, true);
    h.closePath();
    s.holes.push(h);
  }
  const g = new ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 1, curveSegments: 6 });
  g.translate(0, 0, -depth / 2);
  return g;
}

function ringShape(width, spring, thick, squash) {
  const ro = width / 2;
  const ri = ro - thick;
  const s = new Shape();
  s.moveTo(-ro, 0); s.lineTo(-ro, spring); s.absarc(0, spring, ro, Math.PI, 0, true); s.lineTo(ro, 0); s.lineTo(ri, 0);
  s.lineTo(ri, spring); s.absarc(0, spring, ri, 0, Math.PI, false); s.lineTo(-ri, 0); s.lineTo(-ro, 0);
  return s;
}

export function buildRoom(spec, lib) {
  const { style, kind = 'chamber', size = 1, doors = {}, physical = false, solids = [] } = spec;
  const profile = KIND_PROFILE[kind] ?? KIND_PROFILE.chamber;
  const hw = halfWidth(size);
  const H = roomHeight(style, kind, size);
  const has = new Set(style.features);
  const b = new Builder(lib, H, hw);
  const group = new Group();
  group.name = `room:${spec.id}`;
  const animated = [];
  const lights = [];
  const split = has.has('split');
  const dw = DOOR_W;
  const dh = DOOR_H;
  // Rooms of one style are not copies of each other: a few features vary with the room's identity.
  const seed = hash(spec.id);
  const ceilingVariant = kind === 'chamber' || kind === 'atrium' ? seed % 3 : 0; // coffers, radial ribs, louvres
  const floorVariant = (seed >> 3) % 3;                                           // rings, diagonals, cross-hatch
  const furnish = !physical && (seed >> 5) % 2 === 0;

  // ---- wall-aligned box: a along the wall, y up, d outward from the interior plane.
  const wallMat = (face, wx) => {
    if (!split) return 'wall';
    if (face === 'E') return 'coolWall';
    if (face === 'W') return 'wall';
    return wx < 0 ? 'wall' : 'coolWall';
  };
  function lbox(face, mat, a0, a1, y0, y1, d0, d1, opts) {
    const th = FACE_THETA[face];
    const cx = (a0 + a1) / 2; const cz = hw + (d0 + d1) / 2;
    const wx = cx * Math.cos(th) + cz * Math.sin(th);
    const wz = -cx * Math.sin(th) + cz * Math.cos(th);
    const m = typeof mat === 'function' ? mat(face, wx) : mat;
    b.box(m, a1 - a0, y1 - y0, d1 - d0, wx, (y0 + y1) / 2, wz, th, opts);
  }
  // Same, for geometry built in wall coordinates (arches), placed at (a, y, d).
  function lplace(face, mat, geometry, a, y, d, opts) {
    const th = FACE_THETA[face];
    const cz = hw + d;
    const wx = a * Math.cos(th) + cz * Math.sin(th);
    const wz = -a * Math.sin(th) + cz * Math.cos(th);
    const m = new Matrix4().compose(new Vector3(wx, y, wz), new Quaternion().setFromEuler(new Euler(0, th, 0)), new Vector3(1, 1, 1));
    b.add(typeof mat === 'function' ? mat(face, wx) : mat, geometry, m, opts);
  }

  // ---- floor
  b.span('floor', -hw - T, -0.5, -hw - T, hw + T, 0, hw + T);
  const inset1 = 0.55; const inset2 = 1.0;
  const ring = (inset, w, mat = 'inlay') => {
    const e = hw - inset;
    b.span(mat, -e - w, 0, -e - w, e + w, 0.012, -e);
    b.span(mat, -e - w, 0, e, e + w, 0.012, e + w);
    b.span(mat, -e - w, 0, -e, -e, 0.012, e);
    b.span(mat, e, 0, -e, e + w, 0.012, e);
  };
  ring(inset1, 0.12);
  ring(inset2, 0.04);
  if (has.has('rings')) {
    // Recurrence: rings repeating towards the centre.
    for (let r = 2.2; r < hw - 1.2; r += 0.9) ring(hw - r, 0.035, 'inlay');
  }
  b.torus('inlay', 1.5, 0.05, 0, 0.012, 0, Math.PI / 2, { ao: false });
  b.torus('inlay', 0.55, 0.035, 0, 0.012, 0, Math.PI / 2, { ao: false });
  // Wayfinding: a line from the medallion to each doorway.
  for (const f of FACES) {
    if (!doors[f]) continue;
    const th = FACE_THETA[f];
    const len = hw - 1.5;
    const cz = 1.5 + len / 2;
    b.box('inlay', 0.08, 0.012, len, cz * Math.sin(th), 0.006, cz * Math.cos(th), th, { ao: false });
  }
  if (floorVariant === 1) {
    // Diagonals: inlay lines at 45 degrees across the floor.
    for (let k = -2; k <= 2; k++) {
      const off = k * (hw * 0.62);
      b.box('inlay', 2 * hw * 1.5, 0.012, 0.045, off * 0.7071, 0.006, -off * 0.7071, Math.PI / 4, { ao: false });
    }
  } else if (floorVariant === 2) {
    // Cross-hatch: a fine square lattice.
    for (let k = -3; k <= 3; k++) {
      const o = k * (hw / 3.6);
      b.span('inlay', -hw + 0.6, 0, o - 0.015, hw - 0.6, 0.01, o + 0.015, { ao: false });
      b.span('inlay', o - 0.015, 0, -hw + 0.6, o + 0.015, 0.01, hw - 0.6, { ao: false });
    }
  }
  // Furniture and sculpture keep to the corners, clear of the walker's lines to the doors.
  if (furnish && !has.has('gears')) {
    const cx = hw - 1.5;
    for (const [sx, sz, kindOf] of [[-1, 1, 'bench'], [1, -1, 'plinth']]) {
      const x = sx * cx; const z = sz * cx;
      if (kindOf === 'bench') {
        b.box('trim', 1.7, 0.1, 0.5, x, 0.46, z);
        b.box('metal', 0.08, 0.42, 0.42, x - 0.7, 0.21, z);
        b.box('metal', 0.08, 0.42, 0.42, x + 0.7, 0.21, z);
      } else {
        b.box('trim', 0.7, 0.9, 0.7, x, 0.45, z);
        b.box('metal', 0.78, 0.06, 0.78, x, 0.93, z);
        // A sculpture in a glass case.
        b.box('accent', 0.22, 0.22, 0.22, x, 1.18, z, Math.PI / 4, { ao: false });
        b.box('glass', 0.5, 0.55, 0.5, x, 1.24, z, 0, { ao: false });
      }
    }
  }
  // The plate pad lives at the centre; leave the medallion otherwise clear.

  // ---- walls
  for (const f of FACES) {
    const door = doors[f];
    const full = hw + T;
    if (door) {
      lbox(f, wallMat, -full, -dw / 2, 0, H, 0, T);
      lbox(f, wallMat, dw / 2, full, 0, H, 0, T);
      lbox(f, wallMat, -dw / 2, dw / 2, dh, H, 0, T);
      // Tunnel linings: the reveal reads as a real thickness.
      lbox(f, 'trim', -dw / 2, -dw / 2 + 0.05, 0, dh, 0, T);
      lbox(f, 'trim', dw / 2 - 0.05, dw / 2, 0, dh, 0, T);
      lbox(f, 'trim', -dw / 2, dw / 2, dh - 0.05, dh, 0, T);
      lbox(f, 'trim', -dw / 2, dw / 2, -0.5, 0.035, 0, T);
      // Layered casing proud of the interior face.
      lbox(f, 'trim', -dw / 2 - 0.42, -dw / 2, 0, dh + 0.42, -0.1, 0);
      lbox(f, 'trim', dw / 2, dw / 2 + 0.42, 0, dh + 0.42, -0.1, 0);
      lbox(f, 'trim', -dw / 2 - 0.42, dw / 2 + 0.42, dh, dh + 0.42, -0.1, 0);
      lbox(f, 'metal', -dw / 2 - 0.12, -dw / 2, 0, dh + 0.12, -0.17, -0.1, { ao: false });
      lbox(f, 'metal', dw / 2, dw / 2 + 0.12, 0, dh + 0.12, -0.17, -0.1, { ao: false });
      lbox(f, 'metal', -dw / 2 - 0.12, dw / 2 + 0.12, dh, dh + 0.12, -0.17, -0.1, { ao: false });
      // Lintel keystone block.
      lbox(f, 'trim', -0.3, 0.3, dh + 0.42, dh + 0.78, -0.16, 0);
    } else {
      lbox(f, wallMat, -full, full, 0, H, 0, T);
    }
    // Base and chair rail.
    const segs = door ? [[-hw, -dw / 2 - 0.42], [dw / 2 + 0.42, hw]] : [[-hw, hw]];
    for (const [a0, a1] of segs) {
      lbox(f, 'trim', a0, a1, 0, 0.3, -0.07, 0);
      lbox(f, 'trim', a0, a1, 0.3, 0.34, -0.1, 0);
      lbox(f, 'trim', a0, a1, 1.05, 1.11, -0.05, 0);
    }
    // Corner piers with base and capital blocks.
    for (const s of [-1, 1]) {
      const a0 = s < 0 ? -hw : hw - 0.5;
      const a1 = s < 0 ? -hw + 0.5 : hw;
      lbox(f, 'trim', a0, a1, 0.3, H - 0.4, -0.14, 0);
      lbox(f, 'trim', a0 - (s < 0 ? 0 : 0.08), a1 + (s < 0 ? 0.08 : 0), 0, 0.42, -0.2, 0);
      lbox(f, 'trim', a0 - (s < 0 ? 0 : 0.08), a1 + (s < 0 ? 0.08 : 0), H - 0.7, H - 0.4, -0.2, 0);
    }
    // Cornice.
    lbox(f, 'trim', -hw, hw, H - 0.18, H, -0.42, 0);
    lbox(f, 'trim', -hw, hw, H - 0.36, H - 0.18, -0.24, 0);
    lbox(f, 'metal', -hw, hw, H - 0.4, H - 0.36, -0.2, 0, { ao: false });
    // Bays between the piers.
    const hi = hw - 0.5;
    const bays = [];
    if (door) {
      const edge = dw / 2 + 0.42 + 0.35;
      if (hi - edge > 0.9) { bays.push([-hi, -edge]); bays.push([edge, hi]); }
    } else {
      const n = Math.max(1, Math.round((2 * hi) / 3.4));
      const w = (2 * hi) / n;
      for (let i = 0; i < n; i++) bays.push([-hi + i * w + 0.12, -hi + (i + 1) * w - 0.12]);
    }
    for (const [a0, a1] of bays) {
      const w = a1 - a0;
      if (has.has('arcade') && w > 1.4) {
        const ww = Math.min(w - 0.5, 2.4);
        const ac = (a0 + a1) / 2;
        const spring = Math.min(H * 0.5, 3.2);
        const shape = new Shape();
        const r = ww / 2;
        shape.moveTo(-r, 0); shape.lineTo(-r, spring); shape.absarc(0, spring, r, Math.PI, 0, true); shape.lineTo(r, 0); shape.lineTo(-r, 0);
        const g = new ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false, curveSegments: 14 });
        g.translate(0, 0, -0.06);
        lplace(f, 'inset', g, ac, 0.34, -0.06);
        // Arch ring in trim.
        const rg = new ExtrudeGeometry(ringShape(ww + 0.32, spring, 0.16), { depth: 0.2, bevelEnabled: false, curveSegments: 14 });
        rg.translate(0, 0, -0.1);
        lplace(f, 'trim', rg, ac, 0.34, -0.12);
        // Engaged columns either side.
        for (const s of [-1, 1]) {
          const cx = ac + s * (ww / 2 + 0.28);
          const th = FACE_THETA[f];
          const cz = hw - 0.12;
          b.cylinder('trim', 0.16, 0.18, spring + 0.1, cx * Math.cos(th) + cz * Math.sin(th), 0.34 + (spring + 0.1) / 2, -cx * Math.sin(th) + cz * Math.cos(th), 14);
        }
      } else {
        const y0 = 1.25; const y1 = H - 1.1;
        if (y1 - y0 > 1) {
          lbox(f, 'inset', a0, a1, y0, y1, -0.05, 0);
          const fw = 0.1;
          lbox(f, 'trim', a0 - fw, a1 + fw, y0 - fw, y0, -0.1, 0);
          lbox(f, 'trim', a0 - fw, a1 + fw, y1, y1 + fw, -0.1, 0);
          lbox(f, 'trim', a0 - fw, a0, y0, y1, -0.1, 0);
          lbox(f, 'trim', a1, a1 + fw, y0, y1, -0.1, 0);
        }
      }
    }
  }

  // ---- style features on the walls
  if (has.has('clerestory')) {
    for (const f of FACES) {
      const a0 = -hw + 0.9; const a1 = hw - 0.9;
      const y0 = H - 1.9; const y1 = H - 0.85;
      lbox(f, 'window', a0, a1, y0, y1, -0.03, 0, { ao: false });
      const n = Math.max(2, Math.round((a1 - a0) / 1.1));
      for (let i = 0; i <= n; i++) {
        const a = a0 + ((a1 - a0) * i) / n;
        lbox(f, 'trim', a - 0.04, a + 0.04, y0 - 0.06, y1 + 0.06, -0.08, 0);
      }
      lbox(f, 'trim', a0 - 0.06, a1 + 0.06, y0 - 0.1, y0 - 0.02, -0.12, 0);
      lbox(f, 'trim', a0 - 0.06, a1 + 0.06, y1 + 0.02, y1 + 0.1, -0.12, 0);
    }
  }

  if (!physical && (has.has('colossal') || profile.columns)) {
    const e = hw - 1.55;
    const w = has.has('colossal') ? 1.5 : 0.9;
    const top = profile.mezzanine ? H : H - 0.4;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * e; const z = sz * e;
      b.box('trim', w, top - 0.5, w, x, 0.5 + (top - 0.5) / 2, z);
      b.box('trim', w + 0.3, 0.5, w + 0.3, x, 0.25, z);
      b.box('trim', w + 0.5, 0.35, w + 0.5, x, top - 0.18, z);
      b.box('metal', w + 0.1, 0.06, w + 0.1, x, 0.52, z, 0, { ao: false });
      // Fluting: shallow vertical grooves on each face as dark inset strips.
      for (let k = -1; k <= 1; k += 1) {
        b.box('inset', 0.06, top - 1.6, w + 0.02, x + k * w * 0.28, 0.8 + (top - 1.6) / 2, z);
        b.box('inset', w + 0.02, top - 1.6, 0.06, x, 0.8 + (top - 1.6) / 2, z + k * w * 0.28);
      }
    }
  }

  // ---- mezzanine gallery (atria)
  if (profile.mezzanine) {
    const y = H * 0.56;
    const inner = hw - 1.3;
    b.span('floor', -hw, y - 0.3, -hw, hw, y, -inner);
    b.span('floor', -hw, y - 0.3, inner, hw, y, hw);
    b.span('floor', -hw, y - 0.3, -inner, -inner, y, inner);
    b.span('floor', inner, y - 0.3, -inner, hw, y, inner);
    b.span('inlay', -inner - 0.03, y, -inner - 0.03, inner + 0.03, y + 0.015, -inner + 0.0);
    // Railings.
    const rh = 1.05;
    for (const s of [-1, 1]) {
      b.span('metal', -inner, y + rh, s * inner - 0.03, inner, y + rh + 0.05, s * inner + 0.03);
      b.span('metal', s * inner - 0.03, y + rh, -inner, s * inner + 0.03, y + rh + 0.05, inner);
      for (let k = 0; k <= 12; k++) {
        const t = -inner + (2 * inner * k) / 12;
        b.box('metal', 0.03, rh, 0.03, t, y + rh / 2, s * inner, 0, { ao: false });
        b.box('metal', 0.03, rh, 0.03, s * inner, y + rh / 2, t, 0, { ao: false });
      }
    }
    // Brackets under the slab.
    for (let k = -2; k <= 2; k++) {
      const t = (k * inner) / 2.4;
      b.box('trim', 0.3, 0.5, 0.9, t, y - 0.55, -hw + 0.45);
      b.box('trim', 0.3, 0.5, 0.9, t, y - 0.55, hw - 0.45);
    }
  }

  // ---- solid cells of a physical room: pillars on the grid, so what blocks the body is seen
  const cellsAcross = Math.round(hw * 2);
  for (const [cx, cz] of solids) {
    const x = cx + 0.5 - cellsAcross / 2; const z = cz + 0.5 - cellsAcross / 2;
    b.box('trim', 0.94, H - 0.5, 0.94, x, 0.5 + (H - 0.5) / 2, z);
    b.box('trim', 1.0, 0.4, 1.0, x, 0.2, z);
    b.box('metal', 1.0, 0.1, 1.0, x, H - 0.4, z, 0, { ao: false });
  }

  // ---- ceiling (roof layer, hidden by the cutaway)
  const roof = { layer: 'roof' };
  b.span('ceiling', -hw - T, H, -hw - T, hw + T, H + 0.45, hw + T, roof);
  const nb = Math.max(2, Math.round((2 * hw) / 2.6));
  const bs = (2 * hw) / nb;
  if (profile.ribs === 'vault') {
    // Barrel vault: arched ribs every bay, squashed to the room's height.
    const rise = Math.min(H * 0.3, hw * 0.5);
    for (let i = 0; i <= nb; i++) {
      const z = -hw + i * bs;
      const g = new ExtrudeGeometry(ringShape(2 * hw, 0.001, 0.4), { depth: 0.34, bevelEnabled: false, curveSegments: 18 });
      g.translate(0, 0, -0.17);
      const m = new Matrix4().compose(new Vector3(0, H - rise, z), new Quaternion(), new Vector3(1, rise / hw, 1));
      b.add('beam', g, m, roof);
    }
    b.span('metal', -hw, H - 0.03, -hw, hw, H, hw, { layer: 'roof', ao: false });
  } else if (profile.ribs === 'groin') {
    for (let i = 0; i <= nb; i++) {
      const t = -hw + i * bs;
      b.span('beam', -hw, H - 0.7, t - 0.22, hw, H, t + 0.22, roof);
      b.span('beam', t - 0.22, H - 0.7, -hw, t + 0.22, H, hw, roof);
    }
    for (const s of [-1, 1]) for (const z of [-1, 1]) b.box('beam', 1.1, H, 1.1, s * (hw - 0.55), H / 2, z * (hw - 0.55));
  } else if (ceilingVariant === 1) {
    // Radial ribs fanning from the lamp, closed by a ring.
    const ribs = 12;
    for (let i = 0; i < ribs; i++) {
      const a = (i / ribs) * Math.PI;
      b.box('beam', 2 * hw * 1.42, 0.5, 0.3, 0, H - 0.25, 0, a, roof);
    }
    b.torus('beam', hw * 0.55, 0.14, 0, H - 0.3, 0, Math.PI / 2, roof);
    b.torus('metal', hw * 0.9, 0.06, 0, H - 0.2, 0, Math.PI / 2, { layer: 'roof', ao: false });
  } else if (ceilingVariant === 2) {
    // Louvres: close-set fins with light slots between them.
    const fins = Math.round(hw * 2.4);
    for (let i = 0; i <= fins; i++) {
      const z = -hw + (i * 2 * hw) / fins;
      b.span('beam', -hw, H - 0.55, z - 0.06, hw, H - 0.1, z + 0.06, roof);
    }
    for (const sx of [-1, 1]) b.span('metal', sx * hw - 0.08, H - 0.6, -hw, sx * hw + 0.08, H - 0.05, hw, { layer: 'roof', ao: false });
  } else {
    for (let i = 0; i <= nb; i++) {
      const t = -hw + i * bs;
      b.span('beam', -hw, H - 0.6, t - 0.17, hw, H, t + 0.17, roof);
      b.span('beam', t - 0.12, H - 0.42, -hw, t + 0.12, H, hw, roof);
    }
  }
  // Lightwell: a framed emissive panel with a trim collar.
  const lw = has.has('oculus') ? 0 : Math.min(2.4, hw * 0.55);
  if (lw > 0) {
    b.span('trim', -lw - 0.22, H - 0.7, -lw - 0.22, lw + 0.22, H - 0.5, lw + 0.22, roof);
    b.span('lamp', -lw, H - 0.55, -lw, lw, H - 0.5, lw, { layer: 'roof', ao: false });
    b.span('glass', -lw, H - 0.62, -lw, lw, H - 0.6, lw, { layer: 'roof', ao: false });
    for (const s of [-1, 1]) {
      b.span('trim', -lw - 0.22, H - 0.7, s * lw - 0.04, lw + 0.22, H - 0.45, s * lw + 0.04, roof);
      b.span('trim', s * lw - 0.04, H - 0.7, -lw - 0.22, s * lw + 0.04, H - 0.45, lw + 0.22, roof);
    }
  }
  if (has.has('oculus')) {
    const r = Math.min(2.4, hw * 0.45);
    const disc = new CylinderGeometry(r, r, 0.04, 40);
    b.add('lamp', disc, new Matrix4().makeTranslation(0, H - 0.2, 0), { layer: 'roof', ao: false, uv: 'cyl', center: new Vector3(), radius: r });
    b.torus('trim', r + 0.15, 0.18, 0, H - 0.25, 0, Math.PI / 2, roof);
    b.torus('metal', r + 0.38, 0.05, 0, H - 0.3, 0, Math.PI / 2, { layer: 'roof', ao: false });
  }

  // ---- mechanical features
  if (has.has('rails')) {
    for (const s of [-1, 1]) {
      const z = s * hw * 0.42;
      b.span('metal', -hw, H - 1.0, z - 0.2, hw, H - 0.94, z + 0.2, roof);
      b.span('metal', -hw, H - 0.94, z - 0.04, hw, H - 0.5, z + 0.04, roof);
      b.span('metal', -hw, H - 0.56, z - 0.2, hw, H - 0.5, z + 0.2, roof);
      for (let i = 0; i < 5; i++) b.box('metalDark', 0.3, 0.7, 0.34, -hw + 1.2 + i * ((2 * hw - 2.4) / 4), H - 0.75, z, 0, roof);
    }
    // Pipes along the north and south walls.
    for (const f of ['N', 'S']) {
      for (let k = 0; k < 2; k++) {
        const th = FACE_THETA[f];
        const cz = hw - 0.28 - k * 0.3;
        b.cylinder('metalDark', 0.1, 0.1, 2 * hw - 1.2, cz * Math.sin(th), H - 1.5 - k * 0.1, cz * Math.cos(th), 14);
      }
    }
    // Hoist block that travels along the first rail.
    const hoist = new Group();
    const hb = new Builder(lib, H);
    hb.box('metal', 0.5, 0.35, 0.5, 0, 0, 0);
    hb.box('metalDark', 0.08, 1.8, 0.08, 0, -1.0, 0);
    hb.box('accent', 0.4, 0.14, 0.4, 0, -2.0, 0, 0, { ao: false });
    hoist.add(hb.build());
    hoist.position.set(0, H - 1.25, -hw * 0.42);
    hoist.userData.roof = true;
    group.add(hoist);
    let hoistPhase = 0;
    animated.push((t, c) => { hoistPhase += c.dt * (0.35 + 1.1 * c.energy); hoist.position.x = Math.sin(hoistPhase) * (hw - 1.6); });
  }

  const gearGroups = [];
  if (has.has('gears')) {
    const faces = FACES.filter((f) => !doors[f]);
    const use = faces.length ? faces : ['N'];
    let n = 0;
    for (const f of use.slice(0, 2)) {
      const th = FACE_THETA[f];
      const mk = (r, teeth, y, a, dir, speed) => {
        const mesh = new Mesh(gearGeometry(teeth, r, r * 0.84, 0.22, 5), lib.metal);
        mesh.position.set(a * Math.cos(th) + (hw - 0.4) * Math.sin(th), y, -a * Math.sin(th) + (hw - 0.4) * Math.cos(th));
        mesh.rotation.y = th + Math.PI; // faces into the room
        const holder = new Group();
        holder.position.copy(mesh.position);
        mesh.position.set(0, 0, 0);
        holder.rotation.y = th + Math.PI;
        holder.add(mesh);
        group.add(holder);
        gearGroups.push(mesh);
        animated.push((t, c) => { mesh.rotation.z += dir * c.dt * speed * (0.25 + 1.6 * c.energy); });
        return mesh;
      };
      mk(1.5, 20, 2.6, -0.9 + n, 1, 0.22);
      mk(0.95, 12, 2.6 + 1.0, 1.15 + n, -1, 0.22 * 20 / 12);
      n += 0;
      // Axle bosses.
      lbox(f, 'metalDark', -0.9 - 0.18, -0.9 + 0.18, 2.42, 2.78, -0.3, 0);
    }
  }

  if (has.has('seam')) {
    // The seam of two truths: a single luminous line across floor, walls and ceiling.
    const w = 0.05;
    b.span('accent', -w, 0.012, -hw, w, 0.02, hw, { ao: false });
    for (const s of [-1, 1]) {
      b.span('accent', -w, 0, s * hw - 0.02 * s, w, H, s * hw - 0.045 * s, { ao: false });
    }
    b.span('accent', -w, H - 0.02, -hw, w, H - 0.01, hw, { layer: 'roof', ao: false });
  }

  // ---- lights, sprites and dust
  const lampY = H * (profile.heightScale < 0.8 ? 0.72 : 0.78);
  const lampSprites = [];
  const addGlow = (x, y, z, color, scale, opacity) => {
    const s = new Sprite(new SpriteMaterial({
      map: glowTexture(), color: new Color(color), blending: AdditiveBlending, transparent: true,
      depthWrite: false, opacity, fog: false,
    }));
    s.scale.set(scale, scale, 1);
    s.position.set(x, y, z);
    s.userData.roof = y > H * 0.7;
    group.add(s);
    lampSprites.push(s);
    return s;
  };
  if (split) {
    lights.push({ x: -hw * 0.5, y: lampY, z: 0, color: style.warm, intensity: style.lampIntensity * 0.9 });
    lights.push({ x: hw * 0.5, y: lampY, z: 0, color: style.cool, intensity: style.lampIntensity * 0.9 });
    addGlow(-hw * 0.5, H - 0.9, 0, style.warm, 1.6, 0.5);
    addGlow(hw * 0.5, H - 0.9, 0, style.cool, 1.6, 0.5);
  } else {
    lights.push({ x: 0, y: lampY, z: 0, color: style.lamp, intensity: style.lampIntensity * (0.8 + 0.2 * size) });
    if (lw > 0 || has.has('oculus')) addGlow(0, H - 0.8, 0, style.lamp, Math.max(2.5, hw * 0.6), 0.55);
  }
  lights.push({ x: 0, y: Math.min(1.4, H * 0.3), z: 0, color: style.accent, intensity: style.lampIntensity * 0.12 });

  if (has.has('pendants')) {
    const pg = new Builder(lib, H, hw);
    const pos = [[-hw * 0.5, -hw * 0.5], [hw * 0.5, -hw * 0.5], [-hw * 0.5, hw * 0.5], [hw * 0.5, hw * 0.5]];
    for (const [x, z] of pos) {
      pg.cylinder('metal', 0.015, 0.015, 1.4, x, H - 0.7, z, 6, { ao: false });
      pg.cylinder('metal', 0.1, 0.38, 0.34, x, H - 1.55, z, 20, { ao: false });
      pg.cylinder('lamp', 0.3, 0.3, 0.04, x, H - 1.7, z, 18, { ao: false });
      addGlow(x, H - 1.9, z, style.lamp, 1.7, 0.5);
    }
    const pm = pg.build();
    pm.children.forEach((m) => { m.userData.layer = 'roof'; });
    group.add(pm);
  }

  // Sun shaft: an additive column from the light source to the floor.
  if (lw > 0 || has.has('oculus')) {
    const r = has.has('oculus') ? Math.min(2.4, hw * 0.45) : lw;
    const col = new Color(style.sun.color);
    const sh = new Group();
    const shaftH = H - 0.5;
    for (let i = 0; i < 2; i++) {
      const m = new Mesh(new CylinderGeometry(r * 0.92, r * 1.45, shaftH, 28, 1, true), shaftMaterial(col, has.has('oculus') ? 0.2 : 0.12));
      m.rotation.y = i * 0.5;
      sh.add(m);
    }
    sh.position.set(0, shaftH / 2, 0);
    sh.userData.roof = false;
    sh.renderOrder = 4;
    group.add(sh);
  }

  // Dust motes drifting in the volume of the room.
  const dustN = Math.round(70 * (style.dust ?? 0.5) * size);
  if (dustN > 0) {
    const pos = new Float32Array(dustN * 3);
    const seed = new Float32Array(dustN * 3);
    let s = hash(spec.id);
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    for (let i = 0; i < dustN; i++) {
      seed[i * 3] = rnd(); seed[i * 3 + 1] = rnd(); seed[i * 3 + 2] = rnd();
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    const pm = new PointsMaterial({
      map: glowTexture(), size: 0.09, transparent: true, opacity: 0.55, depthWrite: false,
      blending: AdditiveBlending, color: new Color(style.lamp), sizeAttenuation: true, fog: false,
    });
    const points = new Points(geo, pm);
    points.frustumCulled = false;
    group.add(points);
    animated.push((t, c) => {
      const a = geo.attributes.position;
      for (let i = 0; i < dustN; i++) {
        const sx = seed[i * 3]; const sy = seed[i * 3 + 1]; const sz = seed[i * 3 + 2];
        a.setXYZ(i,
          (sx * 2 - 1) * (hw - 0.4) + Math.sin(t * 0.13 + sx * 40) * 0.5,
          ((sy + t * 0.012 * (0.4 + sz)) % 1) * (H - 0.3) + 0.15,
          (sz * 2 - 1) * (hw - 0.4) + Math.cos(t * 0.11 + sz * 40) * 0.5);
      }
      a.needsUpdate = true;
    });
  }

  // ---- finalise
  group.add(b.build());
  group.traverse((o) => { if (o.isMesh && o.material && !o.material.transparent) { o.castShadow = true; o.receiveShadow = true; } });
  const frames = {};
  for (const f of FACES) frames[f] = doorFrame(f, hw);
  // Roof-flagged children (hoist, sprites above head height) are hidden in the cutaway.
  return {
    group, half: hw, height: H, frames, lights, animated, dw, dh,
    hasMachinery: has.has('gears') || has.has('rails'),
    roofObjects: () => {
      const out = [];
      group.traverse((o) => { if (o.userData.layer === 'roof' || o.userData.roof === true) out.push(o); });
      return out;
    },
  };
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
