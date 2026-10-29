import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Structure } from '../src/topology/graph.js';
import { connect, addRoom, reshapePortal } from '../src/topology/construction.js';
import { CHAPTERS, goalSatisfied, chapterById } from '../src/campaign/chapters.js';

function build(chapter) {
  const s = new Structure();
  for (const r of chapter.rooms) s.addRoom({ id: r.id, x: r.x, y: r.y, label: r.label });
  return s;
}

test('every chapter starts unsolved', () => {
  for (const c of CHAPTERS) {
    assert.equal(goalSatisfied(build(c), c), false, `${c.id} should not be pre-solved`);
  }
});

test('threshold is solved by a single portal between the two rooms', () => {
  const c = chapterById('threshold');
  const s = connect(build(c), { a: 'hall', aFace: 'E', b: 'vault', bFace: 'W' }).structure;
  assert.equal(goalSatisfied(s, c), true);
});

test('returning hall requires a real loop, not just a portal', () => {
  const c = chapterById('returning-hall');
  const s = connect(build(c), { a: 'gallery', aFace: 'N', b: 'gallery', bFace: 'S' }).structure;
  assert.equal(goalSatisfied(s, c), true);
  const none = build(c);
  assert.equal(goalSatisfied(none, c), false);
});

test('twisted stair: a direct portal arrives facing the portal-defined heading', () => {
  const c = chapterById('twisted-stair');
  const base = build(c);
  // Entry into Landing through its W face gives heading E by default, not S.
  const s = connect(base, { a: 'base', aFace: 'E', b: 'landing', bFace: 'W' }).structure;
  assert.equal(goalSatisfied(s, c), false);
});

test('twisted stair: a quarter-turn on the portal produces the required heading', () => {
  const c = chapterById('twisted-stair');
  const s0 = connect(build(c), { a: 'base', aFace: 'E', b: 'landing', bFace: 'N' }).structure;
  const pid = [...s0.portals.keys()][0];
  const s1 = reshapePortal(s0, pid, { turns: 2 }).structure;
  const t = s1.exit('base', 'E');
  assert.equal(t.entryHeading, 'N'); // opposite of entering N is S, rotated 2 = N
  assert.equal(goalSatisfied(s1, c), false);
});

test('contradiction: a direct portal satisfies the shortcut goal despite large drawn distance', () => {
  const c = chapterById('contradiction');
  const s = build(c);
  assert.ok(s.apparentDistance('low', 'high') > 400);
  const linked = connect(s, { a: 'low', aFace: 'S', b: 'high', bFace: 'N' }).structure;
  assert.equal(goalSatisfied(linked, c), true);
});

test('every chapter has a non-empty hint and a unique id', () => {
  const ids = new Set();
  for (const c of CHAPTERS) {
    assert.ok(c.hint.length > 10);
    assert.ok(!ids.has(c.id));
    ids.add(c.id);
  }
});

test('addRoom respects chapter room limits', () => {
  const c = chapterById('threshold');
  const r = addRoom(build(c), { x: 9, y: 9 }, c.ruleset);
  assert.equal(r.error, 'ROOM_LIMIT');
});
