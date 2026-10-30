import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../src/game.js';
import { chapterById, chapterStructure, goalSatisfied, bodySolution } from '../src/campaign/chapters.js';
import { connect } from '../src/topology/construction.js';
import { solveBody, replayBody } from '../src/topology/blocks.js';
import { debugReport } from '../src/ui/debugreport.js';

// Builds a passage in a live session through the real intents.
function build(s, [a, af, b, bf]) {
  s.pickFace(a, af);
  s.pickFace(b, bf);
  assert.equal(s.structure.portals.size > 0, true);
}

// Plays solver moves through the session: turn to face, then step forward, exactly as a player would.
function play(s, moves) {
  s.fpEnsure();
  for (const dir of moves) {
    s.fp = { ...s.fp, heading: dir };
    const ok = s.fpForward();
    assert.ok(ok, `move ${dir} refused: ${s.feedback?.text}`);
  }
}

test('every physical challenge starts unsolved and unbuilt, with blocks to push', () => {
  for (const id of ['the-first-push', 'the-weighted-gate', 'the-long-push', 'the-moving-day']) {
    const c = chapterById(id);
    assert.ok(c.physical && c.blocks.length >= 1, id);
    assert.equal(goalSatisfied(chapterStructure(c), c), false, `${id} cannot be solved with no passage built`);
  }
});

test('The First Push: build a doorway, push the block home; the bonus is earned only by playing it lean', () => {
  const s = new Session({ chapterId: 'the-first-push' });
  build(s, ['yard', 'E', 'bay', 'N']);   // the better doorway: 7 moves; yard.E-bay.W takes 12
  s.testConstruction();
  assert.equal(s.feedback.kind, 'success');
  assert.match(s.feedback.text, /A solution exists/);
  const sol = solveBody(s.structure, s.chapter);
  assert.ok(sol.moves.length <= 9, `the shortest play is ${sol.moves.length} moves`);
  assert.ok(!s.progress.completed.includes('the-first-push'), 'a solution existing does not complete it: playing does');
  play(s, sol.moves);
  assert.ok(s.progress.completed.includes('the-first-push'));
  assert.ok(s.progress.discoveries.includes('first-push-lean'), 'finished in few enough moves');
  assert.equal(s.justCompleted, 'the-first-push');
});

test('A wasteful play still completes it but earns no bonus; the plainer doorway needs 12 moves, over the limit', () => {
  const s = new Session({ chapterId: 'the-first-push' });
  build(s, ['yard', 'E', 'bay', 'W']);
  const sol = solveBody(s.structure, s.chapter);
  s.fpEnsure();
  // Wander first: walk to the wall and back, then solve from where the body now stands.
  const detour = ['N', 'S', 'N', 'S', 'N', 'S'];
  play(s, detour);
  const again = solveBody(s.structure, s.chapter, { from: s.fp });
  play(s, again.moves);
  assert.ok(s.progress.completed.includes('the-first-push'));
  assert.equal(s.progress.discoveries.includes('first-push-lean'), false, `${s.fp.steps} steps is over the limit`);
  assert.ok(sol.moves.length < s.fp.steps);
});

test('The Weighted Gate: the gate opens only while a block rests on the plate', () => {
  const s = new Session({ chapterId: 'the-weighted-gate' });
  build(s, ['store', 'E', 'hall', 'W']);
  const sol = solveBody(s.structure, s.chapter);
  assert.ok(sol && sol.moves.length >= 20, `a real puzzle: ${sol?.moves.length} moves`);
  // Walk the solution and watch the plate: lit at the moment the body steps through the gate.
  s.fpEnsure();
  let litAtGate = null;
  for (const dir of sol.moves) {
    s.fp = { ...s.fp, heading: dir };
    const before = s.fp.room;
    s.fpForward();
    if (before === 'hall' && s.fp.room === 'vault') litAtGate = s.lastBody?.crossed ? true : null;
  }
  assert.equal(litAtGate, true);
  assert.ok(s.progress.completed.includes('the-weighted-gate'));
  // Without the block on the plate the gate refuses.
  const t = new Session({ chapterId: 'the-weighted-gate' });
  build(t, ['store', 'E', 'hall', 'W']);
  t.fpEnsure();
  t.fp = { ...t.fp, room: 'hall', cell: [7, 3], heading: 'E' };
  assert.equal(t.fpForward(), false);
  assert.match(t.feedback.text, /gate is shut/);
});

test('The Long Push: the one-way mirror cannot be pushed back through, and the plate and gate decide the rest', () => {
  const s = new Session({ chapterId: 'the-long-push' });
  build(s, ['dock', 'E', 'ring', 'N']);
  const sol = solveBody(s.structure, s.chapter);
  assert.ok(sol && sol.moves.length >= 30);
  play(s, sol.moves);
  assert.ok(s.progress.completed.includes('the-long-push'));
  // Once the block has gone through the one-way passage nothing pushes it back: try from the annex side.
  const c = chapterById('the-long-push');
  const st = chapterStructure(c);
  st.addPortal({ a: 'dock', aFace: 'E', b: 'ring', bFace: 'N' });
  const east = replayBody(st, { ...c, startCell: [3, 3], start: 'annex', blocks: [{ room: 'annex', cell: [1, 3] }] }, ['W']);
  assert.equal(east.error, undefined, 'a block can be pushed within the annex');
  const back = replayBody(st, { ...c, start: 'annex', startCell: [1, 3], blocks: [{ room: 'annex', cell: [0, 3] }] }, ['W']);
  assert.equal(back.error, 'oneway', 'but not back through the one-way passage');
});

test('The Moving Day: two blocks, two gates, one order (solved by the push-level search and replayed)', () => {
  const s = new Session({ chapterId: 'the-moving-day' });
  build(s, ['yard', 'E', 'hall', 'W']);
  const sol = solveBody(s.structure, s.chapter, { maxStates: 250000 });
  assert.ok(sol && !sol.exceeded, 'the search finishes');
  assert.ok(sol.moves.length > 30, `${sol.moves.length} moves`);
  const r = replayBody(s.structure, s.chapter, sol.moves);
  assert.equal(r.error, undefined, 'every move of the answer is legal');
  assert.equal(r.state.room, 'vault');
  assert.ok(r.state.pushes >= 10, `${r.state.pushes} pushes`);
  // Test construction reports it, and the solution is cached for the same structure value.
  s.testConstruction();
  assert.equal(s.feedback.kind, 'success');
  assert.strictEqual(bodySolution(s.structure, s.chapter), bodySolution(s.structure, s.chapter));
  assert.ok(s.routeHighlight.physical && s.routeHighlight.portals.length >= 1);
});

test('the debug report names blocks as part of the walker, and edits reset the body', () => {
  const s = new Session({ chapterId: 'the-first-push' });
  build(s, ['yard', 'E', 'bay', 'W']);
  s.fpEnsure();
  s.fp = { ...s.fp, heading: 'E' };
  s.fpForward();
  assert.equal(s.fp.steps, 1);
  assert.ok(debugReport(s).join('\n').includes('in yard facing E'));
  s.selectPortal([...s.structure.portals.keys()][0]);
  s.deleteSelection();
  s.fpEnsure();
  assert.equal(s.fp.steps, 0, 'an edit starts the body again');
});
