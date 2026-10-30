// Spatial topology data model.
//
// A Structure is a graph of Rooms and Portals. Each Room has an *apparent*
// position (where it is drawn on the architect's plan) and a *true* identity
// in the graph. Portals connect a face of one room to a face of another; the
// connection is defined by graph topology, not by geometric adjacency. A
// portal may carry a spatial transform (a shift, a mirror, or a quarter
// turn) that determines how the traveller's heading and position map across
// the connection, which is what allows non-Euclidean loops.

export const FACES = Object.freeze(['N', 'E', 'S', 'W']);
// What kind of room a room is. It changes how the room is drawn; it does not change
// its connections, which are always the portals.
export const ROOM_KINDS = Object.freeze(['chamber', 'corridor', 'atrium', 'cellar']);
// Physical size of a room in the plan (1 is standard), and its quarter-turns (0 to 3).
// Neither changes a room's connections.
export const ROOM_SIZES = Object.freeze([0.75, 1, 1.5]);
function normaliseTurn(turn) {
  return ((Math.trunc(Number(turn)) % 4) + 4) % 4;
}

const OPPOSITE = Object.freeze({ N: 'S', S: 'N', E: 'W', W: 'E' });

export function rotateFace(face, quarterTurns) {
  const i = FACES.indexOf(face);
  const n = ((i + quarterTurns) % 4 + 4) % 4;
  return FACES[n];
}

export class TopologyError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'TopologyError';
    this.code = code;
  }
}

export class Structure {
  constructor() {
    this.rooms = new Map();   // id -> { id, x, y, label, objects: Set }
    this.portals = new Map(); // id -> Portal
    this.nextId = 1;
  }

  clone() {
    const s = new Structure();
    s.nextId = this.nextId;
    for (const [id, r] of this.rooms) {
      s.rooms.set(id, { ...r, objects: new Set(r.objects) });
    }
    for (const [id, p] of this.portals) {
      s.portals.set(id, { ...p, transform: { ...p.transform } });
    }
    return s;
  }

  addRoom({ x, y, label = '', id, kind = 'chamber', size = 1, turn = 0 } = {}) {
    const rid = id ?? `r${this.nextId++}`;
    if (this.rooms.has(rid)) {
      throw new TopologyError(`Room ${rid} already exists`, 'DUPLICATE_ROOM');
    }
    if (!ROOM_KINDS.includes(kind)) {
      throw new TopologyError(`Unknown room kind ${kind}`, 'BAD_KIND');
    }
    if (!ROOM_SIZES.includes(size)) {
      throw new TopologyError(`Unknown room size ${size}`, 'BAD_SIZE');
    }
    this.rooms.set(rid, { id: rid, x, y, label, kind, size, turn: normaliseTurn(turn), objects: new Set() });
    return rid;
  }

  removeRoom(id) {
    if (!this.rooms.has(id)) {
      throw new TopologyError(`No room ${id}`, 'NO_ROOM');
    }
    for (const [pid, p] of this.portals) {
      if (p.a.room === id || p.b.room === id) this.portals.delete(pid);
    }
    this.rooms.delete(id);
  }

  // A portal joins face `aFace` of room `a` to face `bFace` of room `b`.
  // `transform` describes how the spatial frame changes on crossing:
  //   turns: number of quarter turns applied to heading (0..3)
  //   mirror: whether the frame is reflected across the crossing axis
  // `gate` (optional) is the index of a plate in the chapter. A gated portal
  // can be crossed only once that plate has been struck on the current route.
  // `fixed` marks passages that are part of the architecture, not the player's
  // construction; they cannot be removed or reshaped.
  // `oneWay` (null, 'a' or 'b') says the passage may only be crossed starting
  // from that end. Crossing from the other end is refused, whatever the plates.
  // `also` lists further plates a gate needs besides `gate`: a multi-stage gate opens only while every
  // one of them is lit (see gateOpen in traversal.js).
  // `opensAfter` (optional) is the index of a crate in the chapter. Such a gate can be
  // crossed only once that crate has been delivered on the current route.
  addPortal({ a, aFace, b, bFace, transform, id, gate = null, opensAfter = null, fixed = false, oneWay = null, also = [] } = {}) {
    if (!this.rooms.has(a) || !this.rooms.has(b)) {
      throw new TopologyError('Portal endpoints must be existing rooms', 'NO_ROOM');
    }
    if (!FACES.includes(aFace) || !FACES.includes(bFace)) {
      throw new TopologyError('Invalid face', 'BAD_FACE');
    }
    if (oneWay !== null && oneWay !== 'a' && oneWay !== 'b') {
      throw new TopologyError('oneWay must be null, a or b', 'BAD_ONEWAY');
    }
    if (opensAfter !== null && !(Number.isInteger(opensAfter) && opensAfter >= 0)) {
      throw new TopologyError('opensAfter must be null or a crate index', 'BAD_CRATE');
    }
    const pid = id ?? `p${this.nextId++}`;
    const t = { turns: 0, mirror: false, ...(transform ?? {}) };
    this.portals.set(pid, {
      id: pid,
      a: { room: a, face: aFace },
      b: { room: b, face: bFace },
      transform: t,
      gate,
      also: [...also],
      opensAfter,
      fixed,
      oneWay,
    });
    return pid;
  }

  removePortal(id) {
    this.portals.delete(id);
  }

  // Returns the portal attached to a given room face, plus which end it is.
  portalAt(roomId, face) {
    for (const p of this.portals.values()) {
      if (p.a.room === roomId && p.a.face === face) return { portal: p, end: 'a' };
      if (p.b.room === roomId && p.b.face === face) return { portal: p, end: 'b' };
    }
    return null;
  }

  // Given a traveller leaving `roomId` through `face`, return the destination
  // room, the face they enter through, and the cumulative transform.
  // Returns null if the face is a wall. A one-way passage crossed from the
  // wrong end is returned with `blocked: true`, so it can be seen but not used.
  exit(roomId, face) {
    const hit = this.portalAt(roomId, face);
    if (!hit) return null;
    const { portal, end } = hit;
    const dest = end === 'a' ? portal.b : portal.a;
    const blocked = portal.oneWay != null && portal.oneWay !== end;
    const t = portal.transform;
    // Heading on entry is the opposite of the exit face, rotated by the
    // portal's turns, and mirrored if the portal reflects space.
    let entryFace = OPPOSITE[dest.face];
    entryFace = rotateFace(entryFace, t.turns);
    if (t.mirror) {
      // Reflection across the vertical axis of the crossing frame.
      if (entryFace === 'E') entryFace = 'W';
      else if (entryFace === 'W') entryFace = 'E';
    }
    return {
      room: dest.room,
      face: dest.face,
      entryHeading: entryFace,
      transform: t,
      portalId: portal.id,
      gate: portal.gate ?? null,
      also: portal.also ?? [],
      opensAfter: portal.opensAfter ?? null,
      fixed: portal.fixed ?? false,
      blocked,
      oneWay: portal.oneWay ?? null,
    };
  }

  degree(roomId) {
    let n = 0;
    for (const p of this.portals.values()) {
      if (p.a.room === roomId) n++;
      if (p.b.room === roomId) n++;
    }
    return n;
  }

  // Apparent (drawn) distance between two rooms. Used only for presentation
  // and for detecting "contradictory dimensions"; never for traversal.
  apparentDistance(a, b) {
    const ra = this.rooms.get(a);
    const rb = this.rooms.get(b);
    if (!ra || !rb) return Infinity; // a deleted room is infinitely far: no discovery can hold for it
    return Math.hypot(ra.x - rb.x, ra.y - rb.y);
  }

  toJSON() {
    return {
      version: 1,
      nextId: this.nextId,
      rooms: [...this.rooms.values()].map((r) => ({
        id: r.id, x: r.x, y: r.y, label: r.label, kind: r.kind ?? 'chamber',
        size: r.size ?? 1, turn: r.turn ?? 0, objects: [...r.objects],
      })),
      portals: [...this.portals.values()].map((p) => ({
        id: p.id, a: { ...p.a }, b: { ...p.b }, transform: { ...p.transform },
        gate: p.gate ?? null, also: [...(p.also ?? [])], opensAfter: p.opensAfter ?? null, fixed: p.fixed ?? false, oneWay: p.oneWay ?? null,
      })),
    };
  }

  static fromJSON(data) {
    if (!data || data.version !== 1) {
      throw new TopologyError('Unsupported structure version', 'BAD_VERSION');
    }
    // Validate before building: a dangling portal would otherwise load fine and
    // crash the renderer the first time it is drawn.
    const ids = new Set();
    for (const r of data.rooms ?? []) {
      if (ids.has(r.id)) throw new TopologyError(`Duplicate room ${r.id}`, 'DUPLICATE_ROOM');
      ids.add(r.id);
    }
    for (const p of data.portals ?? []) {
      for (const end of [p.a, p.b]) {
        if (!ids.has(end?.room)) throw new TopologyError(`Portal ${p.id} joins a missing room`, 'NO_ROOM');
        if (!FACES.includes(end.face)) throw new TopologyError(`Portal ${p.id} has an invalid face`, 'BAD_FACE');
      }
      if (p.oneWay != null && p.oneWay !== 'a' && p.oneWay !== 'b') {
        throw new TopologyError(`Portal ${p.id} has an invalid one-way direction`, 'BAD_ONEWAY');
      }
    }
    const s = new Structure();
    s.nextId = data.nextId;
    for (const r of data.rooms) {
      const kind = ROOM_KINDS.includes(r.kind) ? r.kind : 'chamber';
      const size = ROOM_SIZES.includes(r.size) ? r.size : 1;
      s.rooms.set(r.id, {
        id: r.id, x: r.x, y: r.y, label: r.label ?? '', kind, size,
        turn: normaliseTurn(r.turn ?? 0), objects: new Set(r.objects ?? []),
      });
    }
    for (const p of data.portals) {
      s.portals.set(p.id, {
        id: p.id, a: { ...p.a }, b: { ...p.b },
        transform: { turns: 0, mirror: false, ...p.transform },
        gate: p.gate ?? null, also: [...(p.also ?? [])], opensAfter: p.opensAfter ?? null, fixed: p.fixed ?? false, oneWay: p.oneWay ?? null,
      });
    }
    return s;
  }
}
