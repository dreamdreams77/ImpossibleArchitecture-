import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Structure } from '../src/topology/graph.js';
import { encodeShare, decodeShare, SHARE_LIMIT } from '../src/persistence/share.js';
import { Session } from '../src/game.js';
import { chapterById, chapterStructure, discoveriesIn } from '../src/campaign/chapters.js';
import { connect, setOneWay } from '../src/topology/construction.js';

function solveLanternCourt(session) {
  session.pickFace('court', 'S'); session.pickFace('lantern', 'W');
  session.pickFace('stair', 'S'); session.pickFace('roof', 'N');
}

test('share links round-trip a construction exactly, including unicode labels', () => {
  const s = new Structure();
  const a = s.addRoom({ x: 0, y: 0, label: 'Hall — ✓ naïve' });
  const b = s.addRoom({ x: 3, y: 2, label: 'Cellar' });
  const r = connect(s, { a, aFace: 'E', b, bFace: 'W', transform: { turns: 1, mirror: true } });
  const code = encodeShare(r.structure);
  assert.match(code, /^[A-Za-z0-9_-]+$/, 'URL-safe characters only');
  const back = decodeShare(code);
  assert.equal(back.error, undefined);
  assert.deepEqual(back.structure.toJSON(), r.structure.toJSON());
});

test('share links that are empty, foreign, oversized or corrupt are refused without throwing', () => {
  assert.match(decodeShare('').error, /empty/);
  assert.match(decodeShare('has spaces!').error, /characters/);
  assert.match(decodeShare('x'.repeat(SHARE_LIMIT + 1)).error, /too long/);
  assert.match(decodeShare('bm90IGpzb24').error, /could not be read/);   // "not json"
  const badVersion = Buffer.from(JSON.stringify({ version: 9 })).toString('base64url');
  assert.match(decodeShare(badVersion).error, /could not be read/);
});

test('a shared construction loads as free construction with its rooms', () => {
  const s = new Structure();
  s.addRoom({ x: 0, y: 0, label: 'Solo' });
  const session = new Session({ chapterId: 'threshold' });
  session.loadShared(decodeShare(encodeShare(s)).structure);
  assert.equal(session.sandbox, true);
  assert.equal(session.structure.rooms.size, 1);
});

test('hints come in two steps: a nudge, then the whole hint', () => {
  const session = new Session({ chapterId: 'lantern-court' });
  const c = chapterById('lantern-court');
  session.nextHint();
  assert.equal(session.feedback.text, `A nudge: ${c.hint.split(/(?<=\.)\s+/)[0]}`);
  session.nextHint();
  assert.equal(session.feedback.text, `Hint: ${c.hint}`);
  session.nextHint();
  assert.equal(session.feedback.text, `Hint: ${c.hint}`, 'stays at the full hint');
});

test('hints reset when the chapter changes', () => {
  const session = new Session({ chapterId: 'lantern-court' });
  session.nextHint(); session.nextHint();
  session.loadChapter('spiral-cellar');
  session.nextHint();
  assert.match(session.feedback.text, /^A nudge/);
});

test('first-person route playback walks the passing route to the goal', () => {
  const session = new Session({ chapterId: 'lantern-court' });
  assert.equal(session.fpPlayRoute(), false, 'nothing to play before a passing test');
  solveLanternCourt(session);
  session.testConstruction();
  assert.ok(session.routeHighlight, 'the test passes');
  assert.equal(session.fpPlayRoute(), true);
  let guard = 0;
  while (session.fpPlayTick() && guard++ < 50) { /* advance */ }
  assert.equal(session.fpPlay, null);
  assert.equal(session.fp.room, 'roof');
});

test('playback stops when a manual step is taken', () => {
  const session = new Session({ chapterId: 'lantern-court' });
  solveLanternCourt(session);
  session.testConstruction();
  session.fpPlayRoute();
  session.fpStopPlay();
  assert.equal(session.fpPlay, null);
});

test('The Drop: a passage you build yourself as one way unlocks its discovery', () => {
  const c = chapterById('the-drop');
  let s = chapterStructure(c);
  assert.deepEqual(discoveriesIn(s, c), []);
  s = connect(s, { a: 'ledge', aFace: 'S', b: 'cellar', bFace: 'N' }).structure;
  const pid = [...s.portals.values()].find((p) => !p.fixed).id;
  s = setOneWay(s, pid, 'a').structure;
  assert.deepEqual(discoveriesIn(s, c), ['own-one-way']);
});
