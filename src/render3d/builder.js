// Geometry builder: collects primitives per material and layer, bakes their
// transforms, assigns world-space (metre) UVs and a height-based ambient
// occlusion term into vertex colours, then merges everything into one mesh per
// material. A room of several hundred primitives costs a dozen draw calls.

import {
  BoxGeometry, CylinderGeometry, PlaneGeometry, ExtrudeGeometry, BufferGeometry, Float32BufferAttribute,
  Matrix4, Mesh, Group, Euler, Vector3, Quaternion, Shape, TorusGeometry,
} from '../vendor/three/three.module.js';
import { mergeGeometries } from '../vendor/three/BufferGeometryUtils.js';

const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _s = new Vector3(1, 1, 1);
const _p = new Vector3();

export class Builder {
  constructor(lib, height) {
    this.lib = lib;
    this.height = height;
    this.parts = new Map(); // `${layer}|${mat}` -> geometries
  }

  // Generic: `geometry` is cloned, transformed by `matrix`, and filed under `mat`.
  add(mat, geometry, matrix, { layer = 'shell', uv = 'world', ao = true, center = null, radius = 1 } = {}) {
    const g = (geometry.index ? geometry.toNonIndexed() : geometry.clone());
    g.applyMatrix4(matrix);
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    const repeat = this.lib[mat].userData.repeat ?? 0.4;
    const uvs = new Float32Array(pos.count * 2);
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i); const y = pos.getY(i); const z = pos.getZ(i);
      if (uv === 'world') {
        const ax = Math.abs(nor.getX(i)); const ay = Math.abs(nor.getY(i)); const az = Math.abs(nor.getZ(i));
        if (ay >= ax && ay >= az) { uvs[i * 2] = x * repeat; uvs[i * 2 + 1] = z * repeat; }
        else if (ax >= az) { uvs[i * 2] = z * repeat; uvs[i * 2 + 1] = y * repeat; }
        else { uvs[i * 2] = x * repeat; uvs[i * 2 + 1] = y * repeat; }
      } else {
        const c = center ?? _p.set(0, 0, 0);
        uvs[i * 2] = Math.atan2(x - c.x, z - c.z) * radius * repeat;
        uvs[i * 2 + 1] = y * repeat;
      }
      let k = 1;
      if (ao) {
        const H = this.height;
        k = 0.58 + 0.42 * smooth(0, 1.6, y);
        k *= 1 - 0.28 * smooth(H - 1.4, H, y);
      }
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
    }
    g.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    g.setAttribute('color', new Float32BufferAttribute(col, 3));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    const key = `${layer}|${mat}`;
    if (!this.parts.has(key)) this.parts.set(key, []);
    this.parts.get(key).push(g);
    return this;
  }

  // Axis-aligned box centred at (x,y,z), optionally turned about y.
  box(mat, w, h, d, x, y, z, ry = 0, opts) {
    _e.set(0, ry, 0);
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s);
    return this.add(mat, new BoxGeometry(w, h, d), _m, opts);
  }

  // A box given by its min/max corners, for walls and slabs.
  span(mat, x0, y0, z0, x1, y1, z1, opts) {
    return this.box(mat, x1 - x0, y1 - y0, z1 - z0, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, 0, opts);
  }

  cylinder(mat, rTop, rBot, h, x, y, z, seg = 24, opts = {}) {
    _m.makeTranslation(x, y, z);
    return this.add(mat, new CylinderGeometry(rTop, rBot, h, seg, 1, false), _m,
      { ...opts, uv: 'cyl', center: new Vector3(x, y, z), radius: Math.max(rTop, rBot) });
  }

  torus(mat, radius, tube, x, y, z, rx = Math.PI / 2, opts = {}) {
    _e.set(rx, 0, 0);
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s);
    return this.add(mat, new TorusGeometry(radius, tube, 8, 48), _m, { ...opts, uv: 'cyl', center: new Vector3(x, y, z), radius });
  }

  plane(mat, w, h, x, y, z, rx = 0, ry = 0, opts) {
    _e.set(rx, ry, 0);
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s);
    return this.add(mat, new PlaneGeometry(w, h), _m, opts);
  }

  // An arch-topped opening shape, extruded `depth` along z (centred), standing on y=0.
  arch(mat, width, springY, depth, x, y, z, ry = 0, opts) {
    const r = width / 2;
    const s = new Shape();
    s.moveTo(-r, 0);
    s.lineTo(-r, springY);
    s.absarc(0, springY, r, Math.PI, 0, true);
    s.lineTo(r, 0);
    s.lineTo(-r, 0);
    const g = new ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 14 });
    g.translate(0, 0, -depth / 2);
    _e.set(0, ry, 0);
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s);
    return this.add(mat, g, _m, opts);
  }

  // Merges to one mesh per (layer, material). Roof-layer meshes are tagged so the
  // cutaway can hide them.
  build() {
    const group = new Group();
    for (const [key, geos] of this.parts) {
      const [layer, mat] = key.split('|');
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      const mesh = new Mesh(merged, this.lib[mat]);
      mesh.userData.layer = layer;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }
    return group;
  }
}

function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
