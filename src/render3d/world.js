// The world renderer. It draws the authoritative graph; it never decides it.
//
// Each room of the structure is a real piece of architecture (rooms.js) in its
// own local frame. Two views read the same rooms:
//
//   walk      the traveller stands in one room. Every doorway shows the room
//             beyond it, rendered for real into a texture: the destination
//             room is placed behind the doorway (its own doorway coinciding
//             with this one, turned and mirrored as the portal says), clipped
//             at the doorway's surface by an oblique near plane, and drawn from
//             the traveller's own camera. Doorways inside that view are
//             rendered the same way, to a bounded depth, so a corridor that
//             returns to itself recedes into itself.
//
//   overview  the architect's model: rooms at their plan positions, cut at a
//             horizontal section plane, and a glowing arc for every logical
//             connection, so plan distance and graph distance can disagree in
//             plain sight.

import * as THREE from '../vendor/three/three.module.js';
import { materialsFor } from './materials.js';
import { styleFor } from './styles.js';
import { buildRoom } from './rooms.js';
import { makePortalMaterial } from './portalMaterial.js';
import { Post } from './post.js';
import {
  FACES, DOOR_W, DOOR_H, halfWidth, doorFrame, portalLocalTransform, planeBeyond, obliqueProjection,
  headingYaw,
} from './frames.js';

export const DOOR_COLORS = Object.freeze({
  plain: '#6fd6ff',
  oneWay: '#ffb347',
  mirror: '#c58bff',
  twist: '#7dffb0',
  gate: '#ff6a5a',
  open: '#9dffc0',
  refuse: '#ff7a3c',
});

const OVERVIEW_GRADE = { lift: [0.006, 0.008, 0.012], gain: [1, 1, 1.02], tint: [1, 1, 1], saturation: 1.05, contrast: 1.05, vignette: 0.32, exposure: 1.0 };
const HEAT = ['#33ff88', '#ffe14d', '#ff9a3c', '#ff3355'];
const ROOM_SPACING = 46;

// Graphics presets. `shadows` is the point-light shadow map size (0 = off) and `shadowDepth` the
// deepest recursion level that casts them; `bloom` is the bloom strength (0 = off); `samples` is the
// multisampling of the main image; `scales` shrink each recursion level's render target.
export const QUALITY = {
  high: { maxDepth: 4, samples: 4, scales: [1, 0.8, 0.62, 0.5, 0.4], maxPasses: 22, pixelRatio: 2, children: [3, 2, 2, 1, 1], shadows: 1024, shadowDepth: 1, bloom: 0.32, dust: 1 },
  medium: { maxDepth: 2, samples: 2, scales: [1, 0.65, 0.5], maxPasses: 10, pixelRatio: 1.5, children: [3, 2, 1], shadows: 512, shadowDepth: 0, bloom: 0.22, dust: 0.6 },
  low: { maxDepth: 1, samples: 0, scales: [1, 0.5], maxPasses: 4, pixelRatio: 1, children: [2, 1], shadows: 0, shadowDepth: 0, bloom: 0, dust: 0.3 },
};

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

const v3 = () => new THREE.Vector3();

export class WorldRenderer {
  constructor(canvas, { quality = 'high', debug = false } = {}) {
    this.canvas = canvas;
    this.quality = QUALITY[quality] ? quality : 'high';
    this.q = QUALITY[this.quality];
    this.debug = debug;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    // Tone mapping, grading and the sRGB encode happen in the post chain, so the scene stays linear
    // through every recursive pass and the portals blend correctly.
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.post = new Post(this.renderer);
    this.renderer.info.autoReset = false;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2('#101018', 0.02);
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.05, 220);
    this.camera.matrixAutoUpdate = false;
    this.camera.matrixWorldAutoUpdate = false;

    this.hemi = new THREE.HemisphereLight('#ffffff', '#222222', 0.6);
    this.sun = new THREE.DirectionalLight('#ffffff', 1);
    this.points = [0, 1, 2].map(() => {
      const l = new THREE.PointLight('#ffffff', 0, 40, 2);
      this.scene.add(l);
      return l;
    });
    this.scene.add(this.hemi, this.sun, this.sun.target);

    this.envs = new Map();
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.rooms = new Map();    // id -> entry
    this.doors = new Map();    // `${portalId}:${end}` -> door
    this.structure = null;
    this.context = null;
    this.state = { lit: 0, delivered: 0, crates: [], selection: null, routePortals: new Set(), flash: 0 };
    this.layoutMode = 'walk';
    this.positions = new Map(); // id -> Vector3 (current layout)
    this.pool = new Map();
    this.size = { w: 1, h: 1 };
    this.time = 0;
    this.frame = 0;
    this.stats = { passes: 0, byDepth: [], drawCalls: 0, triangles: 0, rooms: 0, doors: 0, ms: 0 };
    this.plain = false;
    this.cutY = 2.7;
    this.cutaway = true;
    this.linkGroup = new THREE.Group();
    this.linkGroup.visible = false;
    this.scene.add(this.linkGroup);
    // Labels and the selection frame draw in a second, unclipped pass over the model.
    this.overlay = new THREE.Scene();
    this.labelGroup = new THREE.Group();
    this.labelGroup.visible = false;
    this.overlay.add(this.labelGroup);
    this.ground = this._makeGround();
    this.ground.visible = false;
    this.scene.add(this.ground);
    this.planScale = 15;
    this.planOrigin = { x: 0, y: 0 };
    this.linkPicks = [];
    // Construction in the model: a marker on every free face, and a preview of a join.
    this.markerGroup = new THREE.Group();
    this.markerGroup.visible = false;
    this.scene.add(this.markerGroup);
    this.previewGroup = new THREE.Group();
    this.scene.add(this.previewGroup);
    this.markers = [];
    this.markerState = { pending: null, hover: null };
    this.sealed = [];
    this.selectionRing = this._makeSelectionRing();
    this.selectionRing.visible = false;
    this.overlay.add(this.selectionRing);
    this.linksDirty = true;
    this._tmp = { frustum: new THREE.Frustum(), pv: new THREE.Matrix4(), m: new THREE.Matrix4(), c: v3(), n: v3(), cam: v3(), fwd: v3() };
  }

  // ---- sizing ------------------------------------------------------------

  setSize(w, h, devicePixelRatio = 1) {
    const ratio = Math.min(devicePixelRatio, this.q.pixelRatio);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(Math.max(1, w), Math.max(1, h), false);
    this.size = { w: Math.max(1, w), h: Math.max(1, h) };
    this.camera.aspect = this.size.w / this.size.h;
    this.camera.updateProjectionMatrix();
    for (const rt of this.pool.values()) rt.dispose();
    this.pool.clear();
    const buf = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.post.resize(buf.x, buf.y, this.q.samples);
  }

  setQuality(name) {
    if (!QUALITY[name] || name === this.quality) return;
    this.quality = name;
    this.q = QUALITY[name];
    this.setSize(this.size.w, this.size.h, window.devicePixelRatio || 1);
  }

  // ---- environment maps --------------------------------------------------

  _envFor(style) {
    if (this.envs.has(style.key)) return this.envs.get(style.key);
    const scene = new THREE.Scene();
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(20, 24, 16),
      new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true }),
    );
    const pos = dome.geometry.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const top = new THREE.Color(style.sky).multiplyScalar(1.4);
    const mid = new THREE.Color(style.fog.color).lerp(new THREE.Color(style.sky), 0.35);
    const low = new THREE.Color(style.ground).multiplyScalar(0.6);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const t = pos.getY(i) / 20;
      if (t > 0) c.copy(mid).lerp(top, Math.pow(t, 0.7)); else c.copy(mid).lerp(low, Math.min(1, -t * 1.4));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    dome.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
    scene.add(dome);
    const lamp = new THREE.Color(style.lamp).multiplyScalar(9);
    const boxes = [[0, 14, 0, 9, 0.4, 9], [-15, 6, 4, 0.4, 5, 9], [15, 7, -6, 0.4, 5, 7], [2, 4, 16, 10, 4, 0.4]];
    for (const [x, y, z, w, h, d] of boxes) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: lamp }));
      m.position.set(x, y, z);
      scene.add(m);
    }
    const tex = this.pmrem.fromScene(scene, 0.03).texture;
    scene.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
    this.envs.set(style.key, tex);
    return tex;
  }

  // ---- building the world from a structure --------------------------------

  // `ctx`: { chapterId, themeName, plates, cargo, pads }
  sync(structure, ctx = {}) {
    this.structure = structure;
    this.context = ctx;
    this.sealed = ctx.sealed ?? [];
    const style = styleFor(ctx.themeName, ctx.chapterId, ctx.discipline);
    this.style = style;
    const lib = materialsFor(style);
    const seen = new Set();
    for (const [id, r] of structure.rooms) {
      seen.add(id);
      const doors = {};
      for (const f of FACES) if (structure.portalAt(id, f)) doors[f] = true;
      const sig = `${style.key}|${r.kind ?? 'chamber'}|${r.size ?? 1}|${FACES.map((f) => (doors[f] ? 1 : 0)).join('')}`;
      let entry = this.rooms.get(id);
      if (!entry || entry.sig !== sig) {
        if (entry) this._disposeRoom(entry);
        const built = buildRoom({ id, style, kind: r.kind ?? 'chamber', size: r.size ?? 1, doors }, lib);
        const holder = new THREE.Group();
        holder.matrixAutoUpdate = false;
        holder.add(built.group);
        holder.visible = false;
        this.scene.add(holder);
        entry = { id, sig, built, holder, style, fixtures: null, label: null, doorMeshes: new Map(), animFrame: -1, roofList: built.roofObjects() };
        this.rooms.set(id, entry);
      }
      entry.room = r;
      entry.style = style;
    }
    for (const [id, entry] of [...this.rooms]) {
      if (!seen.has(id)) { this._disposeRoom(entry); this.rooms.delete(id); }
    }
    this._buildDoors();
    this._layout();
    this._buildLabels();
    this._buildFixtures();
    this.linksDirty = true;
    this._buildMarkers();
  }

  _disposeRoom(entry) {
    this.scene.remove(entry.holder);
    entry.holder.traverse((o) => { o.geometry?.dispose?.(); });
    if (entry.label) { entry.label.material.map?.dispose(); entry.label.material.dispose(); this.labelGroup.remove(entry.label); }
  }

  _buildDoors() {
    for (const d of this.doors.values()) { d.mesh.parent?.remove(d.mesh); d.mesh.material.dispose(); }
    this.doors.clear();
    for (const e of this.rooms.values()) e.doorMeshes.clear();
    for (const p of this.structure.portals.values()) {
      for (const end of ['a', 'b']) {
        const me = p[end]; const other = p[end === 'a' ? 'b' : 'a'];
        const A = this.rooms.get(me.room); const B = this.rooms.get(other.room);
        if (!A || !B) continue;
        const exit = this.structure.exit(me.room, me.face);
        const halfA = A.built.half; const halfB = B.built.half;
        const T = portalLocalTransform({ faceA: me.face, halfA, faceB: other.face, halfB, mirror: !!p.transform.mirror });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_W, DOOR_H), makePortalMaterial());
        const frame = doorFrame(me.face, halfA);
        mesh.matrixAutoUpdate = false;
        mesh.matrix.copy(frame).multiply(new THREE.Matrix4().makeTranslation(0, DOOR_H / 2, 0));
        mesh.frustumCulled = false;
        mesh.renderOrder = 2;
        A.built.group.add(mesh);
        const door = {
          id: `${p.id}:${end}`, portalId: p.id, end, room: me.room, face: me.face, destRoom: other.room, destFace: other.face,
          otherId: `${p.id}:${end === 'a' ? 'b' : 'a'}`, mesh, frame, local: T, place: T.clone().invert(),
          turns: p.transform.turns ?? 0, mirror: !!p.transform.mirror,
          gate: exit?.gate ?? null, opensAfter: exit?.opensAfter ?? null, blocked: !!exit?.blocked,
          oneWay: p.oneWay ?? null, allowedOut: p.oneWay == null ? null : p.oneWay === end,
        };
        this.doors.set(door.id, door);
        A.doorMeshes.set(me.face, door);
      }
    }
    this._refreshDoorState();
  }

  _refreshDoorState() {
    const { lit, delivered } = this.state;
    for (const d of this.doors.values()) {
      let shut = false;
      if (d.gate !== null) shut = (lit & (1 << d.gate)) === 0;
      else if (d.opensAfter != null) shut = (delivered & (1 << d.opensAfter)) === 0;
      d.shut = shut;
      if (d.slide === undefined) d.slide = shut ? 0 : 1; // a gate already open at load does not play
      const u = d.mesh.material.uniforms;
      u.mirror.value = d.mirror ? 1 : 0;
      u.twist.value = d.turns;
      u.arrow.value = d.allowedOut == null ? 0 : d.allowedOut ? 1 : 0;
      u.overlay.value = d.blocked ? 2 : (shut || d.slide < 0.995) && (d.gate !== null || d.opensAfter != null) ? 1 : 0;
      let color = DOOR_COLORS.plain;
      if (d.blocked) color = DOOR_COLORS.refuse;
      else if (shut) color = DOOR_COLORS.gate;
      else if (d.mirror) color = DOOR_COLORS.mirror;
      else if (d.turns) color = DOOR_COLORS.twist;
      else if (d.allowedOut) color = DOOR_COLORS.oneWay;
      else if (d.gate !== null || d.opensAfter != null) color = DOOR_COLORS.open;
      u.rim.value.set(this.state.routePortals.has(d.portalId) ? '#ffffff' : color);
    }
  }

  // Gates slide: bars draw back when a gate opens and close again if it shuts.
  _slideGates(dt) {
    let moving = false;
    for (const d of this.doors.values()) {
      if (d.gate === null && d.opensAfter == null) continue;
      const target = d.shut ? 0 : 1;
      if (d.slide === target) continue;
      d.slide += Math.sign(target - d.slide) * Math.min(Math.abs(target - d.slide), dt * 1.4);
      d.mesh.material.uniforms.retract.value = d.slide;
      moving = true;
    }
    if (moving) this._refreshDoorState();
  }

  // ---- layout -------------------------------------------------------------

  setLayout(mode) {
    if (mode === this.layoutMode && this.positions.size === this.rooms.size) return;
    this.layoutMode = mode;
    this._layout();
    this.linksDirty = true;
    this._buildMarkers();
  }

  _layout() {
    this.positions.clear();
    const ids = [...this.rooms.keys()];
    if (this.layoutMode === 'walk') {
      const cols = Math.ceil(Math.sqrt(ids.length));
      ids.forEach((id, i) => this.positions.set(id, new THREE.Vector3((i % cols) * ROOM_SPACING, 0, Math.floor(i / cols) * ROOM_SPACING)));
    } else {
      // The plan frame (centre and scale) is fixed while the set of rooms is unchanged, so
      // dragging a room does not slide the whole model under the pointer.
      const key = ids.slice().sort().join('|');
      if (!this._frame || this._frame.key !== key) {
        let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
        for (const id of ids) { const r = this.rooms.get(id).room; minX = Math.min(minX, r.x); maxX = Math.max(maxX, r.x); minY = Math.min(minY, r.y); maxY = Math.max(maxY, r.y); }
        const extent = Math.max(1, maxX - minX, maxY - minY);
        this._frame = { key, scale: Math.min(15, 150 / extent), x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
      }
      const scale = this._frame.scale;
      this.planScale = scale;
      this.planOrigin = { x: this._frame.x, y: this._frame.y };
      const minX = this._frame.x; const maxX = this._frame.x; const minY = this._frame.y; const maxY = this._frame.y;
      for (const id of ids) {
        const r = this.rooms.get(id).room;
        this.positions.set(id, new THREE.Vector3((r.x - this._frame.x) * scale, 0, (r.y - this._frame.y) * scale));
      }
      // Rooms may not overlap: nudge any that crowd each other apart along their separation.
      for (let it = 0; it < 24; it++) {
        let moved = false;
        for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
          const a = this.positions.get(ids[i]); const b = this.positions.get(ids[j]);
          const need = this.rooms.get(ids[i]).built.half + this.rooms.get(ids[j]).built.half + 3.5;
          const dx = b.x - a.x; const dz = b.z - a.z;
          const dist = Math.hypot(dx, dz) || 0.001;
          if (Math.max(Math.abs(dx), Math.abs(dz)) < need) {
            const push = (need - Math.max(Math.abs(dx), Math.abs(dz))) / 2 + 0.01;
            const nx = dx / dist || 1; const nz = dz / dist;
            a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push; moved = true;
          }
        }
        if (!moved) break;
      }
    }
    for (const [id, p] of this.positions) {
      const e = this.rooms.get(id);
      e.holder.matrix.makeTranslation(p.x, p.y, p.z);
      e.holder.updateMatrixWorld(true);
      e.world = e.holder.matrix.clone();
    }
  }

  extent() {
    const box = new THREE.Box3();
    for (const [id, p] of this.positions) {
      const h = this.rooms.get(id).built.half;
      box.expandByPoint(new THREE.Vector3(p.x - h, 0, p.z - h));
      box.expandByPoint(new THREE.Vector3(p.x + h, 5, p.z + h));
    }
    return box;
  }

  // ---- fixtures: plates, crates, pads --------------------------------------

  setState(partial) {
    Object.assign(this.state, partial);
    if (this.structure) {
      this._refreshDoorState();
      this._buildFixtures();
    }
  }

  _buildFixtures() {
    const ctx = this.context ?? {};
    const style = this.style;
    if (!style) return;
    this.pulsers = [];
    for (const e of this.rooms.values()) {
      if (e.fixtures) {
        e.built.group.remove(e.fixtures);
        e.fixtures.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
      }
      const g = new THREE.Group();
      const plates = (ctx.plates ?? []).map((p, i) => ({ ...p, i })).filter((p) => p.room === e.id);
      plates.forEach((p, k) => {
        const lit = (this.state.lit & (1 << p.i)) !== 0;
        const toggle = p.mode === 'toggle';
        const color = new THREE.Color(lit ? '#ffd27a' : '#6f6a58');
        const base = new THREE.Mesh(
          new THREE.CylinderGeometry(0.95, 1.05, 0.08, 40),
          new THREE.MeshStandardMaterial({ color: '#2b2b30', metalness: 0.8, roughness: 0.35, envMapIntensity: 1 }),
        );
        const ringMat = new THREE.MeshStandardMaterial({
          color: color.clone().multiplyScalar(0.3), emissive: color, emissiveIntensity: lit ? 2.6 : 0.35, metalness: 0.5, roughness: 0.4,
        });
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.045, 8, toggle ? 12 : 48), ringMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.06;
        // A chevron pointing the heading the plate answers to.
        const yaw = headingYaw(p.heading);
        const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.5, 3), ringMat);
        arrow.rotation.x = -Math.PI / 2;
        const holder = new THREE.Group();
        arrow.position.set(0, 0.06, -0.38);
        holder.add(arrow);
        holder.rotation.y = yaw;
        const slot = new THREE.Group();
        const off = plates.length > 1 ? 2.1 : 0;
        slot.position.set(Math.cos((k / plates.length) * Math.PI * 2) * off, 0.04, Math.sin((k / plates.length) * Math.PI * 2) * off);
        slot.add(base, ring, holder);
        g.add(slot);
        if (!lit) this.pulsers.push({ mat: ringMat, base: 0.35, amp: 0.45 });
      });
      for (const [i, c] of (this.state.crates ?? []).entries()) {
        if (c.room !== e.id || c.carried) continue;
        const crate = new THREE.Mesh(
          new THREE.BoxGeometry(0.9, 0.9, 0.9),
          new THREE.MeshStandardMaterial({ color: '#8a6a3f', roughness: 0.7, metalness: 0.1, envMapIntensity: 0.4 }),
        );
        const band = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.12, 0.95), new THREE.MeshStandardMaterial({ color: style.accent, emissive: style.accent, emissiveIntensity: 0.9 }));
        crate.position.set(e.built.half - 1.6 - (i % 2) * 1.1, 0.45, e.built.half - 1.6 - Math.floor(i / 2) * 1.1);
        crate.rotation.y = 0.3 + i;
        band.position.copy(crate.position);
        band.rotation.copy(crate.rotation);
        g.add(crate, band);
      }
      if ((ctx.pads ?? []).includes(e.id)) {
        const pad = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.04, 6, 14), new THREE.MeshStandardMaterial({ color: style.accent, emissive: style.accent, emissiveIntensity: 1.4 }));
        pad.rotation.x = Math.PI / 2;
        pad.position.set(-e.built.half + 2, 0.05, e.built.half - 2);
        g.add(pad);
      }
      g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      e.fixtures = g;
      e.built.group.add(g);
    }
  }

  // ---- labels and overview furniture ---------------------------------------

  _buildLabels() {
    for (const e of this.rooms.values()) {
      const text = e.room.label || e.id;
      if (e.label && e.label.userData.text === text) continue;
      if (e.label) { e.label.material.map.dispose(); e.label.material.dispose(); this.labelGroup.remove(e.label); }
      const c = document.createElement('canvas');
      c.width = 512; c.height = 96;
      const g = c.getContext('2d');
      g.font = '600 40px Inter, system-ui, sans-serif';
      const w = Math.min(500, g.measureText(text).width + 44);
      g.fillStyle = 'rgba(8,10,14,0.72)';
      g.beginPath();
      g.roundRect((512 - w) / 2, 14, w, 68, 12);
      g.fill();
      g.strokeStyle = 'rgba(240,200,120,0.85)';
      g.lineWidth = 2;
      g.stroke();
      g.fillStyle = '#f4ead4';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, 256, 49);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, fog: false, toneMapped: false }));
      s.renderOrder = 999;
      s.scale.set(7, 1.31, 1);
      s.userData.text = text;
      e.label = s;
      this.labelGroup.add(s);
    }
  }

  // The drafting ground of the architect's model: a grid whose squares are plan units.
  _makeGround() {
    const mat = new THREE.ShaderMaterial({
      uniforms: { unit: { value: 15 }, color: { value: new THREE.Color('#7fb8d6') } },
      vertexShader: 'varying vec3 vP; void main(){ vP = (modelMatrix*vec4(position,1.0)).xyz; gl_Position = projectionMatrix*viewMatrix*vec4(vP,1.0);}',
      fragmentShader: `uniform float unit; uniform vec3 color; varying vec3 vP;
        float line(float v, float w){ float d = abs(fract(v - 0.5) - 0.5) / fwidth(v); return 1.0 - clamp(d / w, 0.0, 1.0); }
        void main(){
          vec2 g = vP.xz / unit;
          float minor = max(line(g.x, 1.0), line(g.y, 1.0));
          float major = max(line(g.x / 5.0, 1.6), line(g.y / 5.0, 1.6));
          float fade = 1.0 - smoothstep(60.0, 260.0, length(vP.xz));
          float a = (minor * 0.16 + major * 0.3) * fade;
          gl_FragColor = vec4(color, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = -0.02;
    m.renderOrder = -1;
    return m;
  }

  _makeSelectionRing() {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: '#f2c879', fog: false, toneMapped: false });
    for (const [w, d, x, z] of [[2, 0.18, 0, -1], [2, 0.18, 0, 1], [0.18, 2, -1, 0], [0.18, 2, 1, 0]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), mat);
      m.position.set(x, 0.1, z);
      g.add(m);
    }
    return g;
  }

  setSelection(roomId, portalId = null) {
    this.state.selection = roomId;
    this.state.selectedPortal = portalId;
  }

  _buildLinks() {
    for (const c of [...this.linkGroup.children]) { this.linkGroup.remove(c); c.geometry?.dispose(); c.material?.dispose(); }
    this.linkPicks = [];
    for (const p of this.structure.portals.values()) {
      const a = this.doors.get(`${p.id}:a`); const b = this.doors.get(`${p.id}:b`);
      if (!a || !b) continue;
      const pa = this._doorWorld(a); const pb = this._doorWorld(b);
      pa.y = 1.5; pb.y = 1.5;
      const dist = pa.distanceTo(pb);
      const mid = pa.clone().add(pb).multiplyScalar(0.5);
      const same = a.room === b.room;
      mid.y += same ? 7 : 4 + dist * 0.28;
      if (same) { // a self-link rises and loops back
        const n = pa.clone().sub(this.positions.get(a.room)).setY(0).normalize();
        mid.add(n.multiplyScalar(4));
      }
      const curve = new THREE.QuadraticBezierCurve3(pa, mid, pb);
      const geo = new THREE.TubeGeometry(curve, 64, 0.1, 6, false);
      let color = DOOR_COLORS.plain;
      if (a.mirror) color = DOOR_COLORS.mirror; else if (a.turns) color = DOOR_COLORS.twist; else if (p.oneWay) color = DOOR_COLORS.oneWay;
      if (a.gate !== null || a.opensAfter != null) color = DOOR_COLORS.gate;
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          time: { value: 0 }, color: { value: new THREE.Color(color) }, dir: { value: p.oneWay === 'a' ? 1 : p.oneWay === 'b' ? -1 : 0 },
          lit: { value: 0 }, count: { value: Math.max(6, dist / 2.2) },
        },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
        fragmentShader: `uniform float time, dir, lit, count; uniform vec3 color; varying vec2 vUv;
          void main(){
            float d = dir == 0.0 ? 1.0 : dir;
            float f = fract(vUv.x * count - time * 0.7 * d);
            float dash = smoothstep(0.0, 0.15, f) * smoothstep(0.75, 0.55, f);
            float base = 0.28 + lit * 0.4;
            float a = base + dash * 0.9;
            gl_FragColor = vec4(color * (1.0 + lit), a);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const tube = new THREE.Mesh(geo, mat);
      tube.userData.portalId = p.id;
      tube.renderOrder = 5;
      this.linkGroup.add(tube);
      const pick = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.9, 5, false), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      pick.userData.portalId = p.id;
      this.linkGroup.add(pick);
      this.linkPicks.push(pick);
      // Beacons at each end, and an arrowhead for a one-way passage.
      for (const pt of [pa, pb]) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 8), new THREE.MeshBasicMaterial({ color, toneMapped: false, fog: false }));
        s.position.copy(pt);
        this.linkGroup.add(s);
      }
      if (p.oneWay) {
        const t = p.oneWay === 'a' ? 0.55 : 0.45;
        const at = curve.getPoint(t);
        const tan = curve.getTangent(t).multiplyScalar(p.oneWay === 'a' ? 1 : -1);
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.3, 12), new THREE.MeshBasicMaterial({ color, toneMapped: false, fog: false }));
        cone.position.copy(at);
        cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan.normalize());
        this.linkGroup.add(cone);
      }
    }
    this.linksDirty = false;
  }

  // ---- construction in the model ---------------------------------------------

  _buildMarkers() {
    for (const m of this.markers) { this.markerGroup.remove(m.ring); this.markerGroup.remove(m.pick); m.ring.geometry.dispose(); m.ring.material.dispose(); m.pick.geometry.dispose(); m.pick.material.dispose(); }
    this.markers = [];
    const ringGeo = new THREE.TorusGeometry(0.95, 0.12, 8, 28);
    const pickGeo = new THREE.SphereGeometry(1.5, 8, 6);
    for (const [id, e] of this.rooms) {
      for (const face of FACES) {
        if (this.structure.portalAt(id, face)) continue;
        const frame = doorFrame(face, e.built.half);
        const pos = new THREE.Vector3(0, 1.5, 0).applyMatrix4(frame).applyMatrix4(e.world);
        const ring = new THREE.Mesh(ringGeo.clone(), new THREE.MeshBasicMaterial({ color: '#6fd6ff', transparent: true, opacity: 0.8, toneMapped: false, fog: false, depthTest: false }));
        ring.position.copy(pos);
        ring.quaternion.setFromRotationMatrix(new THREE.Matrix4().extractRotation(frame));
        ring.renderOrder = 6;
        const pick = new THREE.Mesh(pickGeo.clone(), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
        pick.position.copy(pos);
        this.markerGroup.add(ring, pick);
        const sealed = this.sealed.some((s) => s.room === id && s.face === face);
        this.markers.push({ room: id, face, ring, pick, pos, sealed });
      }
    }
    ringGeo.dispose();
    pickGeo.dispose();
    this._paintMarkers();
  }

  _paintMarkers() {
    const { pending, hover } = this.markerState;
    for (const m of this.markers) {
      const isPending = pending && pending.room === m.room && pending.face === m.face;
      const isHover = hover && hover.room === m.room && hover.face === m.face;
      m.ring.material.color.set(m.sealed ? '#ff6a5a' : isPending ? '#f2c879' : isHover ? '#ffffff' : '#6fd6ff');
      m.ring.material.opacity = isPending || isHover ? 1 : m.sealed ? 0.35 : 0.7;
      m.ring.scale.setScalar(isPending ? 1.35 : isHover ? 1.2 : 1);
    }
  }

  // pending: { room, face } | null, hover: { room, face } | null
  setMarkerState(pending, hover) {
    const same = (a, b) => (a?.room === b?.room && a?.face === b?.face);
    if (same(pending, this.markerState.pending) && same(hover, this.markerState.hover)) return;
    this.markerState = { pending: pending ?? null, hover: hover ?? null };
    this._paintMarkers();
  }

  pickMarker(ndcX, ndcY) {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const hits = ray.intersectObjects(this.markers.map((m) => m.pick), false);
    if (!hits.length) return null;
    const m = this.markers.find((x) => x.pick === hits[0].object);
    return m ? { room: m.room, face: m.face } : null;
  }

  // A ghost arc between two free faces. `ok` false draws it red.
  setPreview(a, b, ok = true) {
    for (const c of [...this.previewGroup.children]) { this.previewGroup.remove(c); c.geometry?.dispose(); c.material?.dispose(); }
    if (!a || !b) return;
    const ma = this.markers.find((m) => m.room === a.room && m.face === a.face);
    const mb = this.markers.find((m) => m.room === b.room && m.face === b.face);
    if (!ma || !mb) return;
    const mid = ma.pos.clone().add(mb.pos).multiplyScalar(0.5);
    mid.y += 3 + ma.pos.distanceTo(mb.pos) * 0.25;
    const geo = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(ma.pos, mid, mb.pos), 40, 0.11, 6, false);
    const mat = new THREE.MeshBasicMaterial({ color: ok ? '#9dffc0' : '#ff6a5a', transparent: true, opacity: 0.75, toneMapped: false, fog: false, depthTest: false });
    const tube = new THREE.Mesh(geo, mat);
    tube.renderOrder = 7;
    this.previewGroup.add(tube);
  }

  _doorWorld(d) {
    const e = this.rooms.get(d.room);
    return new THREE.Vector3(0, DOOR_H / 2, 0).applyMatrix4(d.frame).applyMatrix4(e.world);
  }

  // ---- lighting for the room being drawn ------------------------------------

  _lightFor(entry, W, depth = 0) {
    const s = entry.style;
    const k = s.exposure;
    this.hemi.color.set(s.sky);
    this.hemi.groundColor.set(s.ground);
    this.hemi.intensity = s.ambient * 0.9 * k;
    const dir = new THREE.Vector3(...s.sun.dir).normalize().transformDirection(W);
    const center = new THREE.Vector3().setFromMatrixPosition(W);
    this.sun.color.set(s.sun.color);
    this.sun.intensity = s.sun.intensity * 0.35 * k;
    this.sun.position.copy(center).addScaledVector(dir, 40);
    this.sun.target.position.copy(center);
    this.sun.target.updateMatrixWorld();
    for (let i = 0; i < this.points.length; i++) {
      const l = entry.built.lights[i];
      const p = this.points[i];
      if (!l) { p.intensity = 0; continue; }
      p.position.set(l.x, l.y, l.z).applyMatrix4(W);
      p.color.set(l.color);
      p.intensity = l.intensity * k;
      p.distance = entry.built.height * 3.4 + entry.built.half * 2;
    }
    // One soft-shadowed light per drawn room: the lamp at the heart of it. Deeper recursion
    // levels go without, as the preset says.
    const cast = this.q.shadows > 0 && depth <= this.q.shadowDepth && entry.built.lights.length > 0;
    const key = this.points[0];
    if (key.castShadow !== cast) key.castShadow = cast;
    if (cast) {
      if (key.shadow.mapSize.x !== this.q.shadows) { key.shadow.mapSize.set(this.q.shadows, this.q.shadows); key.shadow.map?.dispose(); key.shadow.map = null; }
      key.shadow.camera.near = 0.3;
      key.shadow.camera.far = key.distance;
      key.shadow.bias = -0.0006;
      key.shadow.normalBias = 0.035;
      key.shadow.radius = 3;
      this.renderer.shadowMap.needsUpdate = true;
    }
    this.scene.fog.color.set(s.fog.color);
    this.scene.fog.density = s.fog.density;
    this.scene.background = new THREE.Color(s.background);
    this.scene.environment = this._envFor(s);
    this.scene.environmentIntensity = 0.55;
  }

  _overviewLight() {
    const s = this.style;
    this.hemi.color.set('#e9eef5');
    this.hemi.groundColor.set('#3b4048');
    this.hemi.intensity = 2.6;
    this.sun.color.set('#fff3dc');
    this.sun.intensity = 3.4;
    this.sun.position.set(40, 90, 30);
    this.sun.target.position.set(0, 0, 0);
    this.sun.target.updateMatrixWorld();
    for (const p of this.points) p.intensity = 0;
    this.scene.fog.color.set('#0c0f14');
    this.scene.fog.density = 0.0035;
    this.scene.background = new THREE.Color('#0c0f14');
    this.scene.environment = this._envFor(s);
    this.scene.environmentIntensity = 0.9;
  }

  // ---- render targets -------------------------------------------------------

  _rt(depth, slot) {
    const key = `${depth}:${slot}`;
    let rt = this.pool.get(key);
    if (!rt) {
      const buf = this.renderer.getDrawingBufferSize(new THREE.Vector2());
      const s = this.q.scales[Math.min(depth, this.q.scales.length - 1)];
      rt = new THREE.WebGLRenderTarget(Math.max(2, Math.floor(buf.x * s)), Math.max(2, Math.floor(buf.y * s)), {
        type: THREE.HalfFloatType, samples: this.q.samples, depthBuffer: true,
      });
      rt.texture.minFilter = rt.texture.magFilter = THREE.LinearFilter;
      this.pool.set(key, rt);
    }
    return rt;
  }

  // ---- animation ------------------------------------------------------------

  _animate(entry, t) {
    if (entry.animFrame === this.frame) return;
    entry.animFrame = this.frame;
    for (const fn of entry.built.animated) fn(t);
  }

  // ---- walk mode --------------------------------------------------------------

  // pose: { room, pos: [x,y,z] in the room frame, yaw, pitch }
  renderWalk(pose, time = 0) {
    const entry = this.rooms.get(pose.room);
    if (!entry) { this.renderer.setRenderTarget(null); this.renderer.setClearColor('#0b0d11'); this.renderer.clear(); return; }
    const t0 = performance.now();
    const dt = Math.min(0.1, Math.max(0, time - (this._lastT ?? time)));
    this._lastT = time;
    this._slideGates(dt);
    this.time = time;
    this.frame++;
    this.setLayout('walk');
    this.renderer.info.reset();
    this.renderer.clippingPlanes = [];
    this.linkGroup.visible = false;
    this.labelGroup.visible = false;
    this.selectionRing.visible = false;
    this.ground.visible = false;
    this.markerGroup.visible = false;
    this.previewGroup.visible = false;
    for (const e of this.rooms.values()) { e.holder.visible = false; }
    for (const d of this.doors.values()) d.mesh.material.uniforms.time.value = time;
    for (const p of this.pulsers ?? []) p.mat.emissiveIntensity = p.base + p.amp * (0.5 + 0.5 * Math.sin(time * 2.2));

    const Wc = entry.world.clone();
    const cam = this.camera;
    cam.fov = pose.fov ?? 72;
    cam.aspect = this.size.w / this.size.h;
    cam.updateProjectionMatrix();
    const local = new THREE.Matrix4().compose(
      new THREE.Vector3(...pose.pos),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(pose.pitch ?? 0, pose.yaw, 0, 'YXZ')),
      new THREE.Vector3(1, 1, 1),
    );
    cam.matrixWorld.copy(Wc).multiply(local);
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    this.baseProjection = cam.projectionMatrix.clone();
    this.stats.passes = 0;
    this.stats.byDepth = [];
    this._passBudget = this.q.maxPasses;
    this.post.resize(...this._bufSize(), this.q.samples);
    this._pass(Wc, entry, 0, this.post.sceneTarget, null, this.baseProjection.clone());
    cam.projectionMatrix.copy(this.baseProjection);
    this.renderer.shadowMap.needsUpdate = false;
    // `plain` strips bloom, vignette and grading so a test can read the geometry's own pixels.
    const grade = this.plain ? { ...entry.style.grade, vignette: 0, exposure: 1, saturation: 1, contrast: 1, lift: [0, 0, 0], tint: [1, 1, 1] } : entry.style.grade;
    this.post.render(grade, { bloom: this.plain ? 0 : this.q.bloom, threshold: 1.25, time });
    this.stats.drawCalls = this.renderer.info.render.calls;
    this.stats.triangles = this.renderer.info.render.triangles;
    this.stats.rooms = this.rooms.size;
    this.stats.doors = this.doors.size;
    this.stats.ms = performance.now() - t0;
  }

  _bufSize() {
    const b = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    return [b.x, b.y];
  }

  _place(entry, W) {
    entry.holder.matrix.copy(W);
    entry.holder.updateMatrixWorld(true);
  }

  _pass(Wc, entry, depth, target, entryDoor, proj) {
    const cam = this.camera;
    const { frustum, pv, c, n, cam: camPos, fwd } = this._tmp;
    this.stats.passes++;
    this.stats.byDepth[depth] = (this.stats.byDepth[depth] ?? 0) + 1;
    this._animate(entry, this.time);
    const size = target ? { x: target.width, y: target.height } : this.renderer.getDrawingBufferSize(new THREE.Vector2());

    // Which doorways of this room are worth a view of what lies beyond?
    const candidates = [];
    this._place(entry, Wc);
    cam.projectionMatrix.copy(proj);
    pv.multiplyMatrices(proj, cam.matrixWorldInverse);
    frustum.setFromProjectionMatrix(pv);
    camPos.setFromMatrixPosition(cam.matrixWorld);
    fwd.set(0, 0, -1).transformDirection(cam.matrixWorld);
    for (const d of entry.doorMeshes.values()) {
      if (d === entryDoor) continue;
      const Df = new THREE.Matrix4().multiplyMatrices(Wc, d.frame);
      const m = c.set(0, DOOR_H / 2, 0).applyMatrix4(Df);
      const out = n.set(0, 0, 1).transformDirection(Df);
      const toCam = camPos.clone().sub(m);
      if (toCam.dot(out) > 0.02) continue;     // looking at its back
      if (!frustum.intersectsSphere(new THREE.Sphere(m.clone(), 2.1))) continue;
      const score = fwd.dot(m.clone().sub(camPos).normalize()) / Math.max(1, toCam.length());
      candidates.push({ d, score, Df });
    }
    candidates.sort((a, b) => b.score - a.score);

    // Child passes first. They may move this very room (a passage that leads back
    // into it), so nothing about this room's own draw is set until they are done.
    const views = new Map();
    if (depth < this.q.maxDepth) {
      const limit = this.q.children[Math.min(depth, this.q.children.length - 1)];
      let slot = 0;
      for (const { d, Df } of candidates) {
        if (slot >= limit || this._passBudget <= 0) break;
        const dest = this.rooms.get(d.destRoom);
        if (!dest) continue;
        this._passBudget--;
        const Wb = new THREE.Matrix4().multiplyMatrices(Wc, d.place);
        const childProj = this.baseProjection.clone();
        obliqueProjection(childProj, cam.matrixWorld, planeBeyond(Df));
        const rt = this._rt(depth + 1, slot++);
        this._pass(Wb, dest, depth + 1, rt, this.doors.get(d.otherId), childProj);
        views.set(d, rt);
      }
    }

    // Draw this room: place it again, set every doorway's state, then render.
    this._place(entry, Wc);
    cam.projectionMatrix.copy(proj);
    for (const e of this.rooms.values()) e.holder.visible = false;
    entry.holder.visible = true;
    for (const d of entry.doorMeshes.values()) {
      const u = d.mesh.material.uniforms;
      u.res.value.set(size.x, size.y);
      u.fade.value = depth * 0.35;
      u.flash.value = this.state.flash ?? 0;
      u.fogColor.value.set(this.rooms.get(d.destRoom).style.fog.color).multiplyScalar(2.2);
      d.mesh.visible = d !== entryDoor;
      const rt = views.get(d);
      if (rt) {
        u.map.value = rt.texture;
        u.mode.value = 0;
        u.debugTint.value = this.debug ? 1 : 0;
        u.heat.value.set(HEAT[Math.min(depth + 1, HEAT.length - 1)]);
      } else {
        u.mode.value = 1;
        u.debugTint.value = 0;
      }
    }
    this._lightFor(entry, Wc, depth);
    for (const o of entry.roofList) o.visible = true;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, cam);
    entry.holder.visible = false;
  }

  // ---- overview mode ------------------------------------------------------------

  // orbit: { target:[x,y,z], azimuth, elevation, distance }
  renderOverview(orbit, time = 0) {
    const t0 = performance.now();
    this.time = time;
    this.frame++;
    this.setLayout('plan');
    this.renderer.info.reset();
    this.stats.passes = 1;
    this.stats.byDepth = [1];
    const cam = this.camera;
    cam.fov = 42;
    cam.aspect = this.size.w / this.size.h;
    cam.near = 0.5;
    cam.far = 600;
    cam.updateProjectionMatrix();
    const t = new THREE.Vector3(...orbit.target);
    const ce = Math.cos(orbit.elevation);
    const pos = new THREE.Vector3(
      t.x + Math.sin(orbit.azimuth) * ce * orbit.distance,
      t.y + Math.sin(orbit.elevation) * orbit.distance,
      t.z + Math.cos(orbit.azimuth) * ce * orbit.distance,
    );
    const look = new THREE.Matrix4().lookAt(pos, t, new THREE.Vector3(0, 1, 0));
    cam.matrixWorld.copy(look).setPosition(pos);
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();

    if (this.linksDirty) this._buildLinks();
    this._overviewLight();
    this.renderer.clippingPlanes = this.cutaway ? [new THREE.Plane(new THREE.Vector3(0, -1, 0), this.cutY)] : [];
    this.linkGroup.visible = true;
    this.labelGroup.visible = true;
    this.ground.visible = true;
    this.markerGroup.visible = true;
    this.previewGroup.visible = true;
    this.ground.material.uniforms.unit.value = this.planScale;
    const route = this.state.routePortals;
    for (const c of this.linkGroup.children) {
      if (c.material?.uniforms?.time) { c.material.uniforms.time.value = time; c.material.uniforms.lit.value = route.has(c.userData.portalId) || this.state.selectedPortal === c.userData.portalId ? 1 : 0; }
    }
    for (const e of this.rooms.values()) {
      this._animate(e, time);
      this._place(e, e.world);
      e.holder.visible = true;
      for (const o of e.roofList) o.visible = !this.cutaway;
      const p = this.positions.get(e.id);
      e.label.position.set(p.x, 8.5, p.z);
      const k = Math.max(0.5, pos.distanceTo(new THREE.Vector3(p.x, 3, p.z)) / 48);
      e.label.scale.set(7 * k, 1.31 * k, 1);
    }
    for (const d of this.doors.values()) {
      d.mesh.visible = true;
      const u = d.mesh.material.uniforms;
      u.mode.value = 2;
      u.time.value = time;
      u.debugTint.value = 0;
      u.fade.value = 0;
    }
    const sel = this.state.selection && this.positions.get(this.state.selection);
    this.selectionRing.visible = !!sel;
    if (sel) {
      const h = this.rooms.get(this.state.selection).built.half + 0.7;
      this.selectionRing.position.set(sel.x, 0, sel.z);
      this.selectionRing.scale.set(h / 1, 1, h / 1);
    }
    this.post.resize(...this._bufSize(), this.q.samples);
    this.renderer.setRenderTarget(this.post.sceneTarget);
    this.renderer.render(this.scene, cam);
    this.renderer.clippingPlanes = [];
    this.post.render(OVERVIEW_GRADE, { bloom: this.q.bloom * 0.7, time });
    this.renderer.setRenderTarget(null);
    this.renderer.autoClear = false;
    this.renderer.clearDepth();
    this.renderer.render(this.overlay, cam);
    this.renderer.autoClear = true;
    this.ground.visible = false;
    cam.near = 0.05;
    cam.far = 220;
    for (const e of this.rooms.values()) e.holder.visible = false;
    this.stats.drawCalls = this.renderer.info.render.calls;
    this.stats.triangles = this.renderer.info.render.triangles;
    this.stats.rooms = this.rooms.size;
    this.stats.doors = this.doors.size;
    this.stats.ms = performance.now() - t0;
  }

  // The point on the floor plane under a pointer, in world space; null if the ray misses.
  groundPoint(ndcX, ndcY) {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const hit = new THREE.Vector3();
    return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit) ? hit : null;
  }

  // World position on the floor -> plan coordinates (the inverse of the overview layout).
  worldToPlan(v) {
    return { x: v.x / this.planScale + this.planOrigin.x, y: v.z / this.planScale + this.planOrigin.y };
  }

  // The passage whose arc is under a pointer, by a fat invisible tube along each arc.
  pickLink(ndcX, ndcY) {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const hits = ray.intersectObjects(this.linkPicks, false);
    return hits.length ? hits[0].object.userData.portalId : null;
  }

  // The room under a pointer, found by intersecting the pick ray with the floor plane.
  pickRoom(ndcX, ndcY) {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) return null;
    let best = null; let bestD = Infinity;
    for (const [id, p] of this.positions) {
      const h = this.rooms.get(id).built.half + T_PICK;
      const d = Math.max(Math.abs(hit.x - p.x), Math.abs(hit.z - p.z));
      if (d <= h && d < bestD) { best = id; bestD = d; }
    }
    return best;
  }

  roomCentre(id) {
    return this.positions.get(id)?.clone() ?? new THREE.Vector3();
  }

  // Debug read-out for the developer overlay.
  debugLines() {
    const s = this.stats;
    return [
      `passes ${s.passes}  depth ${s.byDepth.join('/')}  budget ${this.q.maxPasses}`,
      `draw calls ${s.drawCalls}  tris ${s.triangles}  frame ${s.ms.toFixed(1)} ms`,
      `rooms ${s.rooms}  doorways ${s.doors}  quality ${this.quality}  rt ${this.pool.size}`,
    ];
  }

  // After a context loss: GPU-side resources made from render targets are gone.
  recover() {
    this.envs.clear();
    for (const rt of this.pool.values()) rt.dispose();
    this.pool.clear();
  }

  dispose() {
    for (const rt of this.pool.values()) rt.dispose();
    for (const e of this.rooms.values()) this._disposeRoom(e);
    this.pmrem.dispose();
    this.renderer.dispose();
  }
}

const T_PICK = 1.5;
