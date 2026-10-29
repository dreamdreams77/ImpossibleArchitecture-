// Construction logic: pure operations on Structure values, plus validation.
//
// Every operation returns a new Structure and never mutates its input. This
// makes undo/redo a matter of keeping a stack of snapshots.

import { FACES, ROOM_KINDS, ROOM_SIZES } from './graph.js';

const RULES = Object.freeze({
  FACE_OCCUPIED: 'A room face can carry only one portal.',
  SELF_PORTAL: 'A portal cannot join a face of a room to itself.',
  ROOM_LIMIT: 'This chapter allows no more rooms.',
  PORTAL_LIMIT: 'This chapter allows no more portals.',
  FORBIDDEN_FACE: 'This face is sealed in this chapter.',
  FIXED: 'That passage is part of the architecture and cannot be changed.',
});

// Ruleset is supplied by the campaign so each chapter can restrict building.
export const UNRESTRICTED = Object.freeze({
  maxRooms: Infinity,
  maxPortals: Infinity,
  sealedFaces: Object.freeze([]),
});

export function validate(structure, ruleset = UNRESTRICTED) {
  const violations = [];
  const used = new Map();
  for (const p of structure.portals.values()) {
    if (p.a.room === p.b.room && p.a.face === p.b.face) {
      violations.push({ code: 'SELF_PORTAL', message: RULES.SELF_PORTAL, portal: p.id });
    }
    for (const end of [p.a, p.b]) {
      const k = `${end.room}:${end.face}`;
      if (used.has(k)) {
        violations.push({ code: 'FACE_OCCUPIED', message: RULES.FACE_OCCUPIED, portal: p.id, room: end.room, face: end.face });
      }
      used.set(k, p.id);
      if (ruleset.sealedFaces.some((s) => s.room === end.room && s.face === end.face)) {
        violations.push({ code: 'FORBIDDEN_FACE', message: RULES.FORBIDDEN_FACE, portal: p.id, room: end.room, face: end.face });
      }
    }
  }
  if (structure.rooms.size > ruleset.maxRooms) {
    violations.push({ code: 'ROOM_LIMIT', message: RULES.ROOM_LIMIT });
  }
  if (structure.portals.size > ruleset.maxPortals) {
    violations.push({ code: 'PORTAL_LIMIT', message: RULES.PORTAL_LIMIT });
  }
  return { ok: violations.length === 0, violations };
}

// Operations. Each returns { structure, error? }. If `error` is set, the
// structure is the unchanged input so callers can present feedback without
// losing state.

export function addRoom(structure, { x, y, label }, ruleset = UNRESTRICTED) {
  const next = structure.clone();
  next.addRoom({ x, y, label });
  return commit(structure, next, ruleset);
}

export function moveRoom(structure, roomId, x, y, ruleset = UNRESTRICTED) {
  const next = structure.clone();
  const r = next.rooms.get(roomId);
  if (!r) return fail(structure, 'NO_ROOM', `No room ${roomId}`);
  r.x = x;
  r.y = y;
  return commit(structure, next, ruleset);
}

// Renames a room. Labels are short, single-line text; anything else is trimmed.
export const LABEL_LIMIT = 24;
export function renameRoom(structure, roomId, label, ruleset = UNRESTRICTED) {
  const next = structure.clone();
  const r = next.rooms.get(roomId);
  if (!r) return fail(structure, 'NO_ROOM', `No room ${roomId}`);
  r.label = String(label ?? '').replace(/\s+/g, ' ').trim().slice(0, LABEL_LIMIT);
  return commit(structure, next, ruleset);
}

// Sets what kind of room it is (see ROOM_KINDS). Connections are unaffected.
export function setRoomKind(structure, roomId, kind, ruleset = UNRESTRICTED) {
  if (!ROOM_KINDS.includes(kind)) return fail(structure, 'BAD_KIND', `Unknown room kind ${kind}`);
  const next = structure.clone();
  const r = next.rooms.get(roomId);
  if (!r) return fail(structure, 'NO_ROOM', `No room ${roomId}`);
  r.kind = kind;
  return commit(structure, next, ruleset);
}

// Sets how large a room is drawn in the plan. Connections are unaffected.
export function setRoomSize(structure, roomId, size, ruleset = UNRESTRICTED) {
  if (!ROOM_SIZES.includes(size)) return fail(structure, 'BAD_SIZE', `Unknown room size ${size}`);
  const next = structure.clone();
  const r = next.rooms.get(roomId);
  if (!r) return fail(structure, 'NO_ROOM', `No room ${roomId}`);
  r.size = size;
  return commit(structure, next, ruleset);
}

// Turns a room a quarter-turn clockwise in the plan. Its portals stay on the same
// logical faces, so only the drawing turns.
export function turnRoom(structure, roomId, ruleset = UNRESTRICTED) {
  const next = structure.clone();
  const r = next.rooms.get(roomId);
  if (!r) return fail(structure, 'NO_ROOM', `No room ${roomId}`);
  r.turn = ((r.turn ?? 0) + 1) % 4;
  return commit(structure, next, ruleset);
}

export function removeRoom(structure, roomId, ruleset = UNRESTRICTED) {
  const next = structure.clone();
  try {
    next.removeRoom(roomId);
  } catch (e) {
    return fail(structure, e.code, e.message);
  }
  return commit(structure, next, ruleset);
}

export function connect(structure, { a, aFace, b, bFace, transform }, ruleset = UNRESTRICTED) {
  const next = structure.clone();
  try {
    next.addPortal({ a, aFace, b, bFace, transform });
  } catch (e) {
    return fail(structure, e.code, e.message);
  }
  return commit(structure, next, ruleset);
}

export function disconnect(structure, portalId, ruleset = UNRESTRICTED) {
  if (!structure.portals.has(portalId)) {
    return fail(structure, 'NO_PORTAL', `No portal ${portalId}`);
  }
  if (structure.portals.get(portalId).fixed) return fail(structure, 'FIXED', RULES.FIXED);
  const next = structure.clone();
  next.removePortal(portalId);
  return commit(structure, next, ruleset);
}

// Changes a portal's transform (turns and mirror). This is the core
// "change the rules of space" action the player performs on a connection.
export function reshapePortal(structure, portalId, patch, ruleset = UNRESTRICTED) {
  const p = structure.portals.get(portalId);
  if (!p) return fail(structure, 'NO_PORTAL', `No portal ${portalId}`);
  if (p.fixed) return fail(structure, 'FIXED', RULES.FIXED);
  const next = structure.clone();
  const q = next.portals.get(portalId);
  q.transform = { ...q.transform, ...patch };
  if (typeof q.transform.turns === 'number') {
    q.transform.turns = ((q.transform.turns % 4) + 4) % 4;
  }
  return commit(structure, next, ruleset);
}

// Sets the one-way direction of a player-built passage: null for two-way,
// 'a' or 'b' for the end it may be crossed from. Fixed passages are architecture.
export function setOneWay(structure, portalId, oneWay, ruleset = UNRESTRICTED) {
  const p = structure.portals.get(portalId);
  if (!p) return fail(structure, 'NO_PORTAL', `No portal ${portalId}`);
  if (p.fixed) return fail(structure, 'FIXED', RULES.FIXED);
  if (oneWay !== null && oneWay !== 'a' && oneWay !== 'b') {
    return fail(structure, 'BAD_ONEWAY', `Invalid one-way direction ${oneWay}`);
  }
  const next = structure.clone();
  next.portals.get(portalId).oneWay = oneWay;
  return commit(structure, next, ruleset);
}

// Flips a one-way passage to face the other way. A two-way passage has no
// direction to reverse, and a fixed passage is architecture, so both are refused.
export function reverseOneWay(structure, portalId, ruleset = UNRESTRICTED) {
  const p = structure.portals.get(portalId);
  if (!p) return fail(structure, 'NO_PORTAL', `No portal ${portalId}`);
  if (p.fixed) return fail(structure, 'FIXED', RULES.FIXED);
  if (p.oneWay == null) {
    return fail(structure, 'NOT_ONEWAY', 'This passage is two-way, so there is no direction to reverse.');
  }
  return setOneWay(structure, portalId, p.oneWay === 'a' ? 'b' : 'a', ruleset);
}

// Connection editing: re-attach one end of an existing portal to a different
// room face. The portal keeps its identity, transform and gate; only the
// endpoint moves. Validated like any other construction.
export function retargetPortal(structure, portalId, end, room, face, ruleset = UNRESTRICTED) {
  const p = structure.portals.get(portalId);
  if (!p) return fail(structure, 'NO_PORTAL', `No portal ${portalId}`);
  if (p.fixed) return fail(structure, 'FIXED', RULES.FIXED);
  if (!structure.rooms.has(room)) return fail(structure, 'NO_ROOM', `No room ${room}`);
  if (!FACES.includes(face)) return fail(structure, 'BAD_FACE', `Invalid face ${face}`);
  const next = structure.clone();
  const q = next.portals.get(portalId);
  if (end === 'a') q.a = { room, face };
  else q.b = { room, face };
  return commit(structure, next, ruleset);
}

function commit(before, after, ruleset) {
  const check = validate(after, ruleset);
  if (!check.ok) {
    return { structure: before, error: check.violations[0].code, violations: check.violations };
  }
  return { structure: after };
}

function fail(structure, code, message) {
  return { structure, error: code, message };
}

