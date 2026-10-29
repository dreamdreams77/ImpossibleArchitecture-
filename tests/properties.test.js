// Property-style tests: generate many random constructions (loops, turns,
// mirrors, gates, plates) from a seeded generator and check invariants that
// must hold for every one of them. Seeds are fixed so failures reproduce.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Structure, FACES } from '../src/topology/graph.js';
import { connect } from '../src/topology/construction.js';
import { findRoute, replay } from '../src/topology/traversal.js';
import { findCycles } from '../src/topology/analysis.js';
import { encodeSave, decodeSave } from '../src/persistence/store.js';

function rng(seed) {
  // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomStructure(rand, { gates = false } = {}) {
  let s = new Structure();
  const n = 1 + Math.floor(rand() * 6);
  const ids = [];
  for (let i = 0; i < n; i++) {
    ids.push(s.addRoom({ id: `r${i}`, x: Math.floor(rand() * 7) - 3, y: Math.floor(rand() * 7) - 3 }));
  }
  const attempts = 4 + Math.floor(rand() * 10);
  for (let k = 0; k < attempts; k++) {
    const a = ids[Math.floor(rand() * n)];
    const b = ids[Math.floor(rand() * n)];
    const aFace = FACES[Math.floor(rand() * 4)];
    const bFace = FACES[Math.floor(rand() * 4)];
    const transform = { turns: Math.floor(rand() * 4), mirror: rand() < 0.3 };
    const wantsGate = gates && rand() < 0.25;
    const r = connect(s, { a, aFace, b, bFace, transform });
    if (!r.error) {
      s = r.structure;
      if (wantsGate) {
        // Rebuild the newest portal with its gate set (connect() takes no gate option).
        const newest = [...s.portals.values()].pop();
        s.portals.set(newest.id, { ...newest, gate: 0 });
      }
    }
  }
  return s;
}

function undirectedReachable(s, from) {
  const seen = new Set([from]);
  const stack = [from];
  while (stack.length) {
    const r = stack.pop();
    for (const p of s.portals.values()) {
      const other = p.a.room === r ? p.b.room : p.b.room === r ? p.a.room : null;
      if (other !== null && !seen.has(other)) { seen.add(other); stack.push(other); }
    }
  }
  return seen;
}

const SEEDS = Array.from({ length: 120 }, (_, i) => 1000 + i * 7919);

// Guard against vacuous properties: the generator must produce cycles, gates,
// mirrors, turns and multi-room structures, or the tests above prove little.
test('the random generator covers the configurations the properties need', () => {
  let cycles = 0, gated = 0, mirrored = 0, turned = 0, multi = 0;
  for (const seed of SEEDS) {
    const s = randomStructure(rng(seed), { gates: true });
    cycles += findCycles(s).length > 0 ? 1 : 0;
    gated += [...s.portals.values()].some((p) => p.gate !== null) ? 1 : 0;
    mirrored += [...s.portals.values()].some((p) => p.transform.mirror) ? 1 : 0;
    turned += [...s.portals.values()].some((p) => p.transform.turns > 0) ? 1 : 0;
    multi += s.rooms.size > 1 ? 1 : 0;
  }
  assert.ok(cycles >= 20, `cycles in ${cycles} structures`);
  assert.ok(gated >= 20, `gates in ${gated} structures`);
  assert.ok(mirrored >= 40, `mirrors in ${mirrored} structures`);
  assert.ok(turned >= 60, `turns in ${turned} structures`);
  assert.ok(multi >= 80, `multi-room in ${multi} structures`);
});

test('without gates, a route exists exactly when the rooms are connected', () => {
  for (const seed of SEEDS) {
    const rand = rng(seed);
    const s = randomStructure(rand);
    const start = [...s.rooms.keys()][0];
    const connected = undirectedReachable(s, start);
    for (const target of s.rooms.keys()) {
      const route = findRoute(s, start, (t) => t.room === target);
      assert.equal(route !== null, connected.has(target), `seed ${seed}: ${start} -> ${target}`);
    }
  }
});

test('every route found actually reaches its goal when replayed', () => {
  for (const seed of SEEDS) {
    const s = randomStructure(rng(seed));
    const start = [...s.rooms.keys()][0];
    for (const target of s.rooms.keys()) {
      const route = findRoute(s, start, (t) => t.room === target);
      if (route === null) continue;
      const r = replay(s, start, route);
      assert.equal(r.ok, true, `seed ${seed}: route failed on replay`);
      assert.equal(r.traveller.room, target, `seed ${seed}: replay ended elsewhere`);
      assert.equal(r.traveller.steps, route.length);
    }
  }
});

test('shortest routes are no longer than any other route found by a wider search', () => {
  // BFS guarantees minimality over (room, heading, lit) states. Check that a
  // heading-specific goal never returns a longer route than the room-only goal.
  for (const seed of SEEDS.slice(0, 60)) {
    const s = randomStructure(rng(seed));
    const start = [...s.rooms.keys()][0];
    for (const target of s.rooms.keys()) {
      const any = findRoute(s, start, (t) => t.room === target);
      if (any === null) continue;
      for (const h of FACES) {
        const withHeading = findRoute(s, start, (t) => t.room === target && t.heading === h);
        if (withHeading !== null) assert.ok(withHeading.length >= any.length, `seed ${seed}`);
      }
    }
  }
});

test('every reported cycle is a closed walk through its listed portals', () => {
  for (const seed of SEEDS) {
    const s = randomStructure(rng(seed));
    for (const c of findCycles(s)) {
      assert.equal(c.portals.length, c.rooms.length, `seed ${seed}: cycle sizes`);
      assert.equal(new Set(c.portals).size, c.portals.length, `seed ${seed}: repeated portal`);
      for (let i = 0; i < c.portals.length; i++) {
        const p = s.portals.get(c.portals[i]);
        const from = c.rooms[i];
        const to = c.rooms[(i + 1) % c.rooms.length];
        const ends = [p.a.room, p.b.room];
        assert.ok(ends.includes(from) && ends.includes(to), `seed ${seed}: portal ${p.id} does not join ${from}-${to}`);
      }
      assert.ok(c.netTurns >= 0 && c.netTurns <= 3);
    }
  }
});

test('gated portals are never crossed before their plate is lit', () => {
  for (const seed of SEEDS) {
    const s = randomStructure(rng(seed), { gates: true });
    const start = [...s.rooms.keys()][0];
    // The plate sits in a room that is not part of the structure, so it never
    // lights: any route must avoid every gated portal.
    const plates = [{ room: '__nowhere__', heading: 'N' }];
    for (const target of s.rooms.keys()) {
      const route = findRoute(s, start, (t) => t.room === target, { plates });
      if (route === null) continue;
      const r = replay(s, start, route, { plates });
      for (const pid of r.traveller.portals) {
        assert.equal(s.portals.get(pid).gate, null, `seed ${seed}: crossed a gate with no plate lit`);
      }
    }
  }
});

test('open travellers see gated portals as ordinary passages', () => {
  for (const seed of SEEDS.slice(0, 60)) {
    const s = randomStructure(rng(seed), { gates: true });
    const start = [...s.rooms.keys()][0];
    const connected = undirectedReachable(s, start);
    for (const target of s.rooms.keys()) {
      const route = findRoute(s, start, (t) => t.room === target, { open: true });
      assert.equal(route !== null, connected.has(target), `seed ${seed}`);
    }
  }
});

test('serialisation round-trips every random construction exactly', () => {
  for (const seed of SEEDS) {
    const s = randomStructure(rng(seed), { gates: true });
    const back = decodeSave(encodeSave({ chapterId: null, structure: s, progress: { completed: [] } }));
    assert.deepEqual(back.structure.toJSON(), s.toJSON(), `seed ${seed}`);
  }
});
