// What is saved or shared must come back as the same building, down to how every doorway behaves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHAPTERS, chapterStructure } from '../src/campaign/chapters.js';
import { FACES } from '../src/topology/graph.js';
import { encodeSave, decodeSave } from '../src/persistence/store.js';
import { encodeShare, decodeShare } from '../src/persistence/share.js';
import { DEMOS } from '../src/campaign/demos.js';

let seed = 99;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) >>> 0; return seed % n; };

function decorate(s) {
  // Add passages of every kind to whatever faces are free.
  const free = [];
  for (const r of s.rooms.values()) for (const f of FACES) if (!s.portalAt(r.id, f)) free.push([r.id, f]);
  for (let i = 0; i < 6 && free.length >= 2; i++) {
    const [a] = free.splice(rnd(free.length), 1); const [b] = free.splice(rnd(free.length), 1);
    s.addPortal({ a: a[0], aFace: a[1], b: b[0], bFace: b[1], transform: { turns: rnd(4), mirror: rnd(2) === 1 }, oneWay: [null, 'a', 'b'][rnd(3)], gate: rnd(3) === 0 ? rnd(3) : null, also: rnd(4) === 0 ? [3, 4] : [], opensAfter: rnd(6) === 0 ? rnd(2) : null });
  }
  return s;
}

const behaviour = (s) => [...s.rooms.keys()].flatMap((r) => FACES.map((f) => { const e = s.exit(r, f); return e && [r, f, e.room, e.face, e.entryHeading, e.mirror, e.turnsApplied, e.blocked, e.gate, e.also.join('.'), e.opensAfter]; }));

test('every challenge and demonstration survives save, load and share unchanged', () => {
  const buildings = [...CHAPTERS.map((c) => [c.id, decorate(chapterStructure(c)), c.id]), ...DEMOS.map((d) => [d.id, decorate(d.build()), null])];
  assert.ok(buildings.length >= 46);
  for (const [name, s, chapterId] of buildings) {
    const saved = decodeSave(encodeSave({ chapterId, structure: s, progress: { completed: ['threshold'], discoveries: ['atlas:self-room'] } }));
    assert.deepEqual(saved.structure.toJSON(), s.toJSON(), `${name}: save`);
    assert.deepEqual(behaviour(saved.structure), behaviour(s), `${name}: how the doorways behave after a save`);
    assert.deepEqual(saved.progress, { completed: ['threshold'], discoveries: ['atlas:self-room'] });
    const shared = decodeShare(encodeShare(s));
    assert.ok(!shared.error, `${name}: ${shared.error}`);
    assert.deepEqual(shared.structure.toJSON(), s.toJSON(), `${name}: share`);
    assert.deepEqual(behaviour(shared.structure), behaviour(s), `${name}: doorways after a share`);
    // and a clone made by the editor (undo history uses it) is the same again
    assert.deepEqual(s.clone().toJSON(), s.toJSON(), `${name}: clone`);
  }
});
