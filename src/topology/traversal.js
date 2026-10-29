// Traversal over the spatial graph.
//
// The traveller's state is (room, heading). Heading is the face they are
// currently facing inside the room. Moving through a face of the current
// room follows the portal graph; the heading on arrival is determined by the
// portal transform, never by where the rooms are drawn.

import { FACES } from './graph.js';

// Cargo. A chapter may place crates in rooms. A traveller who arrives in a crate's
// room while empty-handed picks it up, and carries one crate at a time. Arriving at
// the depot with the crate drops it there, delivered, if the depot's heading (when it
// has one) is the heading the traveller arrives with. Cargo is part of the traveller's
// state, so a route may need several trips, and the heading it is delivered with
// follows the portals it crossed.
//   cargo: [{ room, name }]   where each crate starts
//   depot: { room, heading? } or null
// Each arrival records what happened in `events` for the walker and the route text.
export function makeTraveller(roomId, heading = 'N', { open = false, cargo = [], depot = null, pads = [] } = {}) {
  const t = {
    room: roomId, heading, steps: 0, trail: [roomId], headings: [heading], portals: [], lit: 0, open,
    cargo, depot, pads, carry: -1, delivered: 0, events: [],
    where: cargo.map((c) => c.room), // the room each crate lies in, or null while carried or delivered
  };
  return touchObjects(t);
}

// Applies the cargo rules to the traveller's current room. Mutates and returns `t`.
// In order: a crate carried to the depot (with the right heading) is delivered; a crate
// carried into a pad room is set down there, and nothing is picked up on that arrival;
// otherwise an empty-handed traveller picks up the first crate lying in this room.
function touchObjects(t) {
  const cargo = t.cargo ?? [];
  if (!cargo.length) return t;
  const depot = t.depot;
  if (t.carry >= 0 && depot && t.room === depot.room && (depot.heading == null || t.heading === depot.heading)) {
    t.delivered |= 1 << t.carry;
    t.events = [...t.events, { type: 'deliver', index: t.carry, room: t.room, heading: t.heading }];
    t.carry = -1;
  }
  if (t.carry >= 0 && (t.pads ?? []).includes(t.room)) {
    t.where[t.carry] = t.room;
    t.events = [...t.events, { type: 'setdown', index: t.carry, room: t.room }];
    t.carry = -1;
    return t;
  }
  if (t.carry < 0) {
    const i = t.where.findIndex((room) => room === t.room);
    if (i >= 0) {
      t.where[i] = null;
      t.carry = i;
      t.events = [...t.events, { type: 'pickup', index: i, room: t.room }];
    }
  }
  return t;
}

// A plate is a fixture in a room. Two modes exist:
//   latch  (default) - lights on arrival facing `heading` and stays lit.
//   toggle           - each arrival facing `heading` flips its state. This
//                      gives the building configurations that change as the
//                      traveller moves through it.
// `startsLit` sets the initial state of a toggle plate.
// `lit` is a bitmask over the chapter's plate list, so a search can require a
// particular sequence of arrivals without storing history.
export function platesLitBy(plates, room, heading, lit = 0) {
  let out = lit;
  plates.forEach((p, i) => {
    if (p.room !== room || p.heading !== heading) return;
    const bit = 1 << i;
    if (p.mode === 'toggle') out ^= bit;
    else out |= bit;
  });
  return out;
}

// The lit state a traveller has before taking any step: toggles at their
// starting configuration, and latches for a plate in the start room facing N.
export function startingLit(plates, startRoom) {
  // Indices must be those of the full plate list, so each bit stays put.
  let lit = 0;
  plates.forEach((p, i) => {
    if (p.mode === 'toggle') {
      if (p.startsLit) lit |= 1 << i;
    } else if (p.room === startRoom && p.heading === 'N') {
      lit |= 1 << i;
    }
  });
  return lit;
}

// Attempt to move through `face` of the traveller's current room.
// Returns a new traveller state, or null if the face is a wall.
export function step(structure, traveller, face) {
  const exit = structure.exit(traveller.room, face);
  if (!exit || exit.blocked) return null;
  // A gate is object state: it is passable only once its plate is lit on this
  // route. `open` lets structural queries ignore gates.
  if (exit.gate !== null && !traveller.open && !((traveller.lit ?? 0) & (1 << exit.gate))) {
    return null;
  }
  // A delivery gate is object state too: it opens once its crate has been delivered.
  if (exit.opensAfter != null && !traveller.open && !((traveller.delivered ?? 0) & (1 << exit.opensAfter))) {
    return null;
  }
  return touchObjects({
    room: exit.room,
    heading: exit.entryHeading,
    steps: traveller.steps + 1,
    trail: [...traveller.trail, exit.room],
    headings: [...(traveller.headings ?? []), exit.entryHeading],
    portals: [...(traveller.portals ?? []), exit.portalId],
    lit: traveller.lit ?? 0,
    open: traveller.open ?? false,
    cargo: traveller.cargo ?? [],
    depot: traveller.depot ?? null,
    pads: traveller.pads ?? [],
    carry: traveller.carry ?? -1,
    delivered: traveller.delivered ?? 0,
    where: [...(traveller.where ?? [])],
    events: [],
  });
}

// What the traveller would see from `roomId`: for each face, the room beyond it
// and the heading they would arrive with. Gates are shown but marked, since the
// view is of the architecture, not of a particular route.
export function sightlines(structure, roomId) {
  return FACES.map((face) => {
    const exit = structure.exit(roomId, face);
    if (!exit) return { face, wall: true };
    if (exit.blocked) return { face, wall: true, blocked: true, room: exit.room };
    return {
      face,
      wall: false,
      room: exit.room,
      arrival: exit.entryHeading,
      gated: exit.gate !== null || exit.opensAfter != null,
      turns: exit.transform.turns,
      mirror: exit.transform.mirror,
      portalId: exit.portalId,
    };
  });
}

// Exits available from a room, as faces with an attached portal.
export function openFaces(structure, roomId) {
  return FACES.filter((f) => structure.portalAt(roomId, f) !== null);
}

// Breadth-first search over (room, heading) states. Returns the shortest
// sequence of faces that takes the traveller from `startRoom` to a state
// satisfying `goal(traveller)`, or null. The search explores both directions of heading, so
// structures whose transforms rotate or mirror the frame are handled without
// special cases. A visited set over (room, heading) guarantees termination
// even when the graph contains spatial loops.
export function findRoute(structure, startRoom, goal, { maxStates = 10000, plates = [], open = false, cargo = [], depot = null, pads = [] } = {}) {
  const key = (t) => `${t.room}|${t.heading}|${t.lit}|${t.carry ?? -1}|${t.delivered ?? 0}|${(t.where ?? []).join(',')}`;
  const start = makeTraveller(startRoom, 'N', { open, cargo, depot, pads });
  start.lit = startingLit(plates, startRoom);
  const queue = [{ traveller: start, route: [] }];
  const seen = new Set([key(start)]);
  let head = 0;
  while (head < queue.length) {
    if (seen.size > maxStates) return null;
    const { traveller, route } = queue[head++];
    if (goal(traveller)) return route;
    for (const face of openFaces(structure, traveller.room)) {
      const moved = step(structure, traveller, face);
      if (!moved) continue;
      moved.lit = platesLitBy(plates, moved.room, moved.heading, moved.lit);
      const k = key(moved);
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push({ traveller: moved, route: [...route, face] });
    }
  }
  return null;
}

// Does the traveller, following `route` from `startRoom`, return to where
// they started, and with the same heading? Used to verify spatial loops.
export function routeReturns(structure, startRoom, route) {
  let t = makeTraveller(startRoom, 'N');
  for (const face of route) {
    const next = step(structure, t, face);
    if (!next) return { ok: false, reason: 'wall', at: t.room };
    t = next;
  }
  return { ok: true, room: t.room, heading: t.heading, returned: t.room === startRoom && t.heading === 'N' };
}

// Replays a route and reports the final state, for puzzle checking.
export function replay(structure, startRoom, route, { plates = [], open = false, cargo = [], depot = null, pads = [] } = {}) {
  let t = makeTraveller(startRoom, 'N', { open, cargo, depot, pads });
  t.lit = startingLit(plates, startRoom);
  for (const face of route) {
    const next = step(structure, t, face);
    if (!next) return { ok: false, traveller: t, failedAt: face };
    next.lit = platesLitBy(plates, next.room, next.heading, next.lit);
    t = next;
  }
  return { ok: true, traveller: t };
}
