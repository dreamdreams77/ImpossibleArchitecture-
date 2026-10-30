import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../src/game.js';
import { goalSatisfied, discoveriesIn } from '../src/campaign/chapters.js';
import {
  emptyChallenge, normalizeChallenge, toChapter, problems, addGoal, addTo, togglePad, setRule, addForbidden,
  toggleObjective, removeAt, withStart,
} from '../src/campaign/editor.js';
import { setGate } from '../src/topology/construction.js';
import { solveBody, replayBody } from '../src/topology/blocks.js';

function sandbox(rooms = 3) {
  const s = new Session();
  s.startSandbox();
  for (let i = 0; i < rooms; i++) s.addRoomAt(i * 3, 0);
  return s;
}
const ids = (s) => [...s.structure.rooms.keys()];
const join = (s, a, af, b, bf) => { s.pickFace(a, af); s.pickFace(b, bf); };

test('a challenge converts to the chapter shape every system reads, with an id of its own per version', () => {
  const c = addGoal(emptyChallenge('r1'), { kind: 'reach', to: 'r2', heading: null, maxSteps: null, lit: false });
  const ch = toChapter(c);
  assert.equal(ch.start, 'r1');
  assert.deepEqual(ch.goal, { kind: 'reach', to: 'r2' });
  assert.strictEqual(toChapter(c), ch, 'remembered per value');
  const c2 = addGoal(c, { kind: 'reach', to: 'r3', heading: 'E', maxSteps: null, lit: false });
  const ch2 = toChapter(c2);
  assert.notEqual(ch2.id, ch.id, 'a new version cannot reuse a cached solution');
  assert.equal(ch2.goal.kind, 'all');
  assert.deepEqual(ch2.goal.goals.map((g) => g.kind), ['reach', 'arrive']);
});

test('multiple goals must all hold; each is diagnosed by number', () => {
  const s = sandbox();
  const [a, b, c] = ids(s);
  let ch = addGoal(addGoal(emptyChallenge(a), { kind: 'reach', to: b }), { kind: 'reach', to: c, maxSteps: 1 });
  s.setChallengeObject(ch);
  join(s, a, 'E', b, 'W');
  s.testConstruction();
  assert.equal(s.feedback.kind, 'error');
  assert.match(s.feedback.text, /Goal 2:/);
  join(s, a, 'N', c, 'N');
  s.testConstruction();
  assert.equal(s.feedback.kind, 'success');
  assert.ok(s.routeHighlight, 'a route to the first goal is shown');
});

test('plates, a crate, a pad and a gated passage work in the sandbox exactly as in the campaign', () => {
  const s = sandbox();
  const [a, b, c] = ids(s);
  // A plate in b struck facing north; the way a->c is gated on it; reach c with every plate lit.
  let ch = emptyChallenge(a);
  ch = addTo(ch, 'plates', { room: b, mode: 'latch', heading: 'N', startsLit: false });
  ch = addGoal(ch, { kind: 'reach', to: c, heading: null, maxSteps: null, lit: true });
  s.setChallengeObject(ch);
  join(s, a, 'S', b, 'N');      // entering b from its north face faces you south... wrong heading for the plate
  join(s, a, 'E', c, 'W');
  s.selectPortal([...s.structure.portals.keys()][1]);
  assert.ok(s.gateSelectedPortal({ gate: 0 }));
  s.testConstruction();
  assert.equal(s.feedback.kind, 'error', 'the plate is never struck facing north');
  // Rebuild so b is entered facing north: join b's south face.
  s.selectPortal([...s.structure.portals.keys()][0]); s.deleteSelection();
  join(s, a, 'S', b, 'S');
  s.testConstruction();
  assert.equal(s.feedback.kind, 'success', s.feedback.text);
  assert.ok(s.routeHighlight.faces.length >= 3, 'out to the plate, back, then through the gate');
  assert.equal(s.active.plates.length, 1);
  // The world the renderer reads is the same record.
  assert.equal(s.active.goal.kind, 'machine');
});

test('crates, a pad and a delivery gate', () => {
  const s = sandbox();
  const [a, b, c] = ids(s);
  let ch = emptyChallenge(a);
  ch = addTo(ch, 'cargo', { room: b });
  ch = togglePad(ch, c);
  ch = addGoal(ch, { kind: 'deliver', to: a, heading: null });
  s.setChallengeObject(ch);
  join(s, a, 'E', b, 'W');
  s.testConstruction();
  assert.equal(s.feedback.kind, 'success', 'fetch the crate from b and bring it to a');
  assert.equal(s.cratePositions().length, 1);
  assert.deepEqual(s.active.pads, [c]);
  join(s, b, 'E', c, 'W');
  s.selectPortal([...s.structure.portals.keys()][0]);
  assert.ok(s.gateSelectedPortal({ opensAfter: 0 }));
  s.testConstruction();
  assert.equal(s.feedback.kind, 'error', 'the only way back is gated on the crate it carries');
});

test('blocks, a weight plate and a place goal are played and judged by the physical engine', () => {
  const s = sandbox(2);
  const [a, b] = ids(s);
  let ch = emptyChallenge(a);
  ch = addTo(ch, 'blocks', { room: a, cell: [3, 3] });
  ch = addTo(ch, 'plates', { room: b, mode: 'weight', cell: [4, 3] });
  ch = addGoal(ch, { kind: 'place', targets: [{ room: b, cell: [4, 3], block: 0 }] });
  s.setChallengeObject(ch);
  assert.ok(s.physical);
  s.fpEnsure();
  s.fp = { ...s.fp, cell: [2, 3], room: a };
  join(s, a, 'E', b, 'W');
  s.testConstruction();
  assert.equal(s.feedback.kind, 'success', s.feedback.text);
  const sol = solveBody(s.structure, s.active);
  s.fpEnsure();
  for (const d of sol.moves) { s.fp = { ...s.fp, heading: d }; assert.ok(s.fpForward(), s.feedback.text); }
  assert.match(s.feedback.text, /Your challenge is solved/);
  assert.equal(replayBody(s.structure, s.active, sol.moves).state.blocks[0].room, b);
  assert.equal(s.progress.completed.length, 0, 'the sandbox never touches campaign progress');
});

test('rules apply while building: forbidden links, passage and room limits', () => {
  const s = sandbox();
  const [a, b, c] = ids(s);
  let ch = addForbidden(setRule(setRule(emptyChallenge(a), 'maxPortals', 1), 'maxRooms', 3), a, b);
  ch = addGoal(ch, { kind: 'reach', to: c });
  s.setChallengeObject(ch);
  join(s, a, 'E', b, 'W');
  assert.equal(s.structure.portals.size, 0, 'a and b may never be joined');
  assert.match(s.feedback.text, /never be joined/);
  join(s, a, 'N', c, 'N');
  assert.equal(s.structure.portals.size, 1);
  join(s, b, 'N', c, 'S');
  assert.equal(s.structure.portals.size, 1, 'the limit is one passage');
  s.addRoomAt(20, 20);
  assert.equal(s.structure.rooms.size, 3, 'the limit is three rooms');
});

test('optional objectives are checked against the real construction', () => {
  const s = sandbox();
  const [a, b] = ids(s);
  let ch = addGoal(emptyChallenge(a), { kind: 'reach', to: b });
  for (const [kind, value] of [['fewPassages', 1], ['noMirror', null], ['usesTurn', null], ['needsLoop', null]]) ch = toggleObjective(ch, kind, value);
  s.setChallengeObject(ch);
  join(s, a, 'E', b, 'W');
  s.testConstruction();
  assert.match(s.feedback.text, /✓ At most 1 passage/);
  assert.match(s.feedback.text, /✓ No mirrors/);
  assert.match(s.feedback.text, /✗ Uses a turn/);
  assert.match(s.feedback.text, /✗ Contains a loop/);
  s.selectPortal([...s.structure.portals.keys()][0]);
  s.rotateSelectedPortal();
  s.mirrorSelectedPortal();
  s.testConstruction();
  assert.match(s.feedback.text, /✓ Uses a turn/);
  assert.match(s.feedback.text, /✗ No mirrors/);
  assert.deepEqual(discoveriesIn(s.structure, s.active).length, 2);
});

test('the editor reports what is wrong before a test, and normalisation drops what is malformed', () => {
  const s = sandbox(2);
  const [a, b] = ids(s);
  assert.deepEqual(problems(emptyChallenge(a), s.structure), ['Add at least one goal.']);
  const ch = addGoal(addTo(emptyChallenge(a), 'blocks', { room: b, cell: [1, 1] }), { kind: 'deliver', to: b, heading: null });
  assert.ok(problems(ch, s.structure).some((p) => /delivers crates, but there are none/.test(p)));
  assert.ok(problems(addGoal(emptyChallenge(a), { kind: 'place', targets: [{ room: b, cell: [1, 1], block: null }] }), s.structure).some((p) => /no blocks/.test(p)));
  const bad = normalizeChallenge({ v: 2, start: a, goals: [{ kind: 'reach' }, { kind: 'reach', to: b, heading: 'Q', maxSteps: -1 }, 7], plates: [{ room: b, mode: 'weight', cell: [99, 1] }, { room: b }, { room: b, heading: 'N' }], cargo: [{}, { room: a }], pads: [3, a, a], blocks: [{ room: a, cell: [1] }], rules: { maxRooms: 0, forbidden: [{ a, b: a }] }, objectives: [{ kind: 'nonsense' }, { kind: 'noMirror' }] });
  assert.deepEqual(bad.goals, [{ kind: 'reach', to: b, heading: null, maxSteps: null, lit: false }]);
  assert.deepEqual(bad.plates, [{ room: b, mode: 'latch', heading: 'N', startsLit: false }]);
  assert.deepEqual(bad.cargo, [{ room: a }]);
  assert.deepEqual(bad.pads, [a]);
  assert.deepEqual(bad.blocks, []);
  assert.equal(bad.rules.maxRooms, null);
  assert.deepEqual(bad.rules.forbidden, []);
  assert.deepEqual(bad.objectives.map((o) => o.kind), ['noMirror']);
  assert.equal(normalizeChallenge({ nope: 1 }), null);
  const removed = removeAt(withStart(ch, b), 'goals', 0);
  assert.equal(removed.start, b);
  assert.equal(removed.goals.length, 0);
  assert.equal(ch.goals.length, 1, 'edits never change their input');
});

test('gating is refused on fixed passages, in the campaign, and with a nonsense index', () => {
  const c = new Session({ chapterId: 'sealed-wing' });
  const fixed = [...c.structure.portals.values()][0];
  assert.equal(setGate(c.structure, fixed.id, { gate: 0 }).error, 'FIXED');
  c.selectPortal(fixed.id);
  assert.equal(c.gateSelectedPortal({ gate: 0 }), false, 'only free construction gates passages');
  const s = sandbox(2);
  const [a, b] = ids(s);
  join(s, a, 'E', b, 'W');
  const pid = [...s.structure.portals.keys()][0];
  assert.equal(setGate(s.structure, pid, { gate: -1 }).error, 'BAD_GATE');
  const ok = setGate(s.structure, pid, { gate: 2 });
  assert.equal(ok.structure.portals.get(pid).gate, 2);
  assert.equal(s.structure.portals.get(pid).gate, null, 'the input is untouched');
});

import { removeAt as editorRemoveAt, normalizeChallenge as norm, toChapter as chapterOf, emptyChallenge as blank, addTo as add } from '../src/campaign/editor.js';
import { platesLitBy as lit } from '../src/topology/traversal.js';

test('editor plates can be sequenced, the sequence survives normalising and reaches the engine', () => {
  let c = blank('a');
  c = add(c, 'plates', { room: 'a', mode: 'latch', heading: 'N', startsLit: false });
  c = add(c, 'plates', { room: 'b', mode: 'latch', heading: 'N', startsLit: false, after: 0 });
  assert.equal(norm(c).plates[1].after, 0);
  const chapter = chapterOf(norm(c));
  assert.equal(chapter.plates[1].after, 0);
  assert.equal(lit(chapter.plates, 'b', 'N', 0), 0, 'dark until plate 1 is lit');
  assert.equal(lit(chapter.plates, 'b', 'N', 1), 3);
});

test('removing a plate repairs the sequencing that named it', () => {
  let c = blank('a');
  for (const [room, after] of [['a', null], ['b', 0], ['c', 1]]) c = add(c, 'plates', { room, mode: 'latch', heading: 'N', startsLit: false, ...(after != null ? { after } : {}) });
  const first = editorRemoveAt(c, 'plates', 0);
  assert.equal(first.plates[0].after, undefined, 'its predecessor is gone, so it is free');
  assert.equal(first.plates[1].after, 0, 'plate 3 followed plate 2, which is now plate 1');
  const middle = editorRemoveAt(c, 'plates', 1);
  assert.equal(middle.plates[1].after, undefined);
});

test('a second lock can be put on a gate in free construction, and removed', () => {
  const s = new Session();
  s.startSandbox();
  s.addRoomAt(0, 0); s.addRoomAt(3, 0);
  const [a, b] = [...s.structure.rooms.keys()];
  s.pickFace(a, 'E'); s.pickFace(b, 'W');
  s.selectPortal([...s.structure.portals.keys()][0]);
  assert.ok(s.gateSelectedPortal({ gate: 0, also: [1] }));
  const p = [...s.structure.portals.values()][0];
  assert.deepEqual([p.gate, p.also], [0, [1]]);
  assert.ok(s.gateSelectedPortal({ gate: 0, also: [0, 0] }));
  assert.deepEqual([...s.structure.portals.values()][0].also, [], 'the first plate is never its own second lock');
  assert.ok(s.gateSelectedPortal({}));
  assert.deepEqual([...s.structure.portals.values()][0].also, []);
});
