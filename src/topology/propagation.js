// How sound and light travel through the passage graph.
//
// Both spread from a room along real portals, never across the plan: two rooms a dozen units apart that
// share a doorway are neighbours, two rooms side by side with no passage are strangers. Each portal
// passes a fraction of what reaches it, set by its state: an open doorway passes most, a shut gate
// passes little (sound leaks round it, light comes through its bars), and a one-way passage is still a
// doorway to the ear and the eye. Every portal and room also costs a little, so a signal fades over
// distance in hops. The result is a best-path search (the loudest or brightest way wins), so loops
// and self-connected rooms terminate and a room reached two ways takes the better.

const MEDIA = Object.freeze({
  sound: { open: 0.62, shut: 0.14, hopLoss: 0.9, floor: 0.02 },
  light: { open: 0.7, shut: 0.32, hopLoss: 0.85, floor: 0.04 },
});

export const MEDIUM_NAMES = Object.freeze(Object.keys(MEDIA));

// Whether a portal currently lets a person through. `lit` is the set of plate bits on, as in the walk.
export function portalOpen(portal, lit = 0, delivered = 0) {
  if (portal.gate != null && !((lit >> portal.gate) & 1)) return false;
  if (portal.opensAfter != null && !((delivered >> portal.opensAfter) & 1)) return false;
  return true;
}

// Rooms reached from `source`, with the strength (0..1) of the best path and how it got there.
// Returns Map(roomId -> { strength, hops, via }) where `via` is the face of the source's first doorway on
// that best path, so a listener knows which way to turn to hear it. The source itself is not included.
export function propagate(structure, source, medium = 'sound', { lit = 0, delivered = 0 } = {}) {
  const m = MEDIA[medium];
  if (!m || !structure.rooms.has(source)) return new Map();
  const best = new Map([[source, { strength: 1, hops: 0, via: null }]]);
  // Strengths only fall along a path, so a simple relaxation queue reaches the best path from every room.
  const queue = [source];
  while (queue.length) {
    const room = queue.shift();
    const here = best.get(room);
    for (const face of ['N', 'E', 'S', 'W']) {
      const hit = structure.portalAt(room, face);
      if (!hit) continue;
      const { portal, end } = hit;
      const dest = (end === 'a' ? portal.b : portal.a).room;
      const pass = portalOpen(portal, lit, delivered) ? m.open : m.shut;
      const strength = here.strength * pass * m.hopLoss;
      if (strength < m.floor) continue;
      const known = best.get(dest);
      if (known && known.strength >= strength) continue;
      best.set(dest, { strength, hops: here.hops + 1, via: room === source ? face : here.via });
      queue.push(dest);
    }
  }
  best.delete(source);
  return best;
}

// What a listener standing in `room` hears or sees through each of its own doorways: for every face with a
// passage, the summed strength of everything whose best route leaves by that face. Used to drive the
// audio voices and to light doorways.
export function throughFaces(structure, room, medium = 'sound', state = {}) {
  const reached = propagate(structure, room, medium, state);
  const faces = {};
  for (const info of reached.values()) faces[info.via] = (faces[info.via] ?? 0) + info.strength;
  for (const f of Object.keys(faces)) faces[f] = Math.min(1, faces[f]);
  return faces;
}

// Ambient light a room receives from the rest of the building, 0..1: the strongest nearby lit source,
// where `emitters` are rooms with a lamp burning (the lit rooms of the challenge, or all rooms).
export function ambientFrom(structure, room, emitters, state = {}) {
  let sum = 0;
  for (const e of emitters) {
    if (e === room) continue;
    const r = propagate(structure, e, 'light', state).get(room);
    if (r) sum += r.strength;
  }
  return Math.min(1, sum);
}

// Plan distance and graph distance disagree most where rooms are close on the plan but far apart for a
// signal, and vice versa. Returns rooms ordered by that disagreement for `source`: the interesting places.
export function disagreements(structure, source, medium = 'sound') {
  const reached = propagate(structure, source, medium);
  const from = structure.rooms.get(source);
  const out = [];
  for (const [id, info] of reached) {
    const r = structure.rooms.get(id);
    out.push({ room: id, plan: Math.hypot(r.x - from.x, r.y - from.y), hops: info.hops, strength: info.strength });
  }
  return out.sort((a, b) => b.plan / b.hops - a.plan / a.hops);
}
