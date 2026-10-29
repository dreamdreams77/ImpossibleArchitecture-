// Structural analysis of a construction: loops, their net twist, and where the
// plan lies about distance.
//
// These are properties of the graph, computed without walking a traveller.
// They answer questions the player asks while building: "does this loop turn
// me?", "how far is that room really?". Everything here is read-only.

import { findRoute } from './traversal.js';

// Undirected view of the portal graph: each portal is an edge between two
// rooms (possibly the same room, for self-loops).
function edgesOf(structure) {
  return [...structure.portals.values()].map((p) => ({ id: p.id, a: p.a.room, b: p.b.room, portal: p }));
}

// Enumerates simple cycles, including self-loops and two-portal cycles between
// the same pair of rooms. Each cycle is reported once, as a list of portal ids
// in walking order. Enumeration is capped so pathological inputs stay cheap.
// Lists the loops and says whether the search finished. It stops early when it
// has spent its budget or reached the limit; `complete` is then false.
export function searchCycles(structure, { limit = 200, budget = 50000 } = {}) {
  let work = 0; // expansions performed; the search stops when this exceeds `budget`
  const edges = edgesOf(structure);
  const adj = new Map();
  for (const id of structure.rooms.keys()) adj.set(id, []);
  for (const e of edges) {
    adj.get(e.a).push(e);
    if (e.a !== e.b) adj.get(e.b).push(e);
  }
  const cycles = [];
  const seenKeys = new Set();
  const roomIds = [...structure.rooms.keys()].sort();

  // Self-loops are cycles of length one.
  for (const e of edges) {
    if (e.a === e.b && cycles.length < limit) {
      cycles.push({ rooms: [e.a], portals: [e.id] });
    }
  }

  // Longer cycles: DFS from each start room, only through rooms with a larger
  // index than the start, so every cycle is found from its smallest room.
  for (const start of roomIds) {
    const order = new Map(roomIds.map((r, i) => [r, i]));
    const startIdx = order.get(start);
    const stack = [{ room: start, path: [start], usedEdges: [] }];
    while (stack.length && cycles.length < limit && work < budget) {
      work++;
      const { room, path, usedEdges } = stack.pop();
      for (const e of adj.get(room)) {
        if (e.a === e.b) continue; // self-loops already handled
        if (usedEdges.includes(e.id)) continue;
        const next = e.a === room ? e.b : e.a;
        if (next === start && path.length >= 2) {
          // Closing a cycle. Canonicalise so each loop is recorded once.
          const portals = [...usedEdges, e.id];
          const key = [...portals].sort().join(',');
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            cycles.push({ rooms: path, portals });
          }
          continue;
        }
        if (path.includes(next)) continue;
        if (order.get(next) < startIdx) continue;
        stack.push({ room: next, path: [...path, next], usedEdges: [...usedEdges, e.id] });
      }
    }
  }

  const complete = work < budget && cycles.length < limit;
  const reason = work >= budget ? 'budget' : cycles.length >= limit ? 'limit' : null;
  return { cycles: cycles.map((c) => describeCycle(structure, c)), complete, reason };
}

export function findCycles(structure, options) {
  return searchCycles(structure, options).cycles;
}

// Net twist of a loop: the quarter-turns accumulated around it, modulo four,
// and whether an odd number of portals reflect space. A loop with net twist 2
// is a half-turn; a loop with a mirror has odd reflection parity.
function describeCycle(structure, cycle) {
  let turns = 0;
  let mirrors = 0;
  for (const pid of cycle.portals) {
    const p = structure.portals.get(pid);
    turns += p.transform.turns;
    if (p.transform.mirror) mirrors += 1;
  }
  const walk = walkability(structure, cycle);
  return {
    rooms: cycle.rooms,
    portals: cycle.portals,
    length: cycle.portals.length,
    netTurns: ((turns % 4) + 4) % 4,
    reflected: mirrors % 2 === 1,
    // Can a traveller go round this loop at all, and if so in which directions?
    // A one-way passage only admits one direction across it.
    walkable: walk.forward || walk.backward,
    oneWayOnly: (walk.forward || walk.backward) && !(walk.forward && walk.backward),
  };
}

// Whether the loop can be walked forward (in the order of `cycle.rooms`) or
// backward, given the one-way direction of each passage in it.
function walkability(structure, cycle) {
  const forwardOk = cycle.portals.every((pid, i) => {
    const p = structure.portals.get(pid);
    const from = cycle.rooms[i];
    const to = cycle.rooms[(i + 1) % cycle.rooms.length];
    return crossingAllowed(p, from, to);
  });
  const backwardOk = cycle.portals.every((pid, i) => {
    const p = structure.portals.get(pid);
    const from = cycle.rooms[(i + 1) % cycle.rooms.length];
    const to = cycle.rooms[i];
    return crossingAllowed(p, from, to);
  });
  return { forward: forwardOk, backward: backwardOk };
}

// A passage may be crossed from `from` to `to` unless it is one way from the
// other end. A self-loop can always be crossed from one of its two ends.
function crossingAllowed(p, from, to) {
  if (p.oneWay == null) return true;
  if (p.a.room === p.b.room) return true;
  const startEnd = p.a.room === from ? 'a' : 'b';
  return p.oneWay === startEnd;
}

// Pairwise plan distance versus shortest walk (in portal steps, ignoring
// heading). A pair is contradictory when the walk is short but the plan says
// the rooms are far apart: the building is more compact than it looks.
export function dimensionReport(structure, { minPlanDistance = 2.5 } = {}) {
  const ids = [...structure.rooms.keys()];
  const pairs = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i];
      const b = ids[j];
      const plan = structure.apparentDistance(a, b);
      const route = findRoute(structure, a, (t) => t.room === b, { open: true });
      if (!route) {
        pairs.push({ a, b, plan, steps: null, reachable: false, contradictory: false });
        continue;
      }
      const steps = route.length;
      pairs.push({
        a,
        b,
        plan,
        steps,
        reachable: true,
        // Compare plan distance per step: a long drawn distance covered in
        // one portal is the contradiction the Cellar chapter is about.
        contradictory: plan >= minPlanDistance && steps <= 1,
      });
    }
  }
  return pairs;
}
