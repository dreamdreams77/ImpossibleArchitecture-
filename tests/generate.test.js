import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateChallenge, estimateDifficulty, profile, MAX_DIFFICULTY } from '../src/campaign/generate.js';
import { chapterStructure, goalSatisfied } from '../src/campaign/chapters.js';
import { validate } from '../src/topology/construction.js';
import { solve } from '../tools/solve.mjs';

test('generation is deterministic', () => {
  const a = generateChallenge(42, 3); const b = generateChallenge(42, 3);
  assert.deepEqual(a.chapter.rooms, b.chapter.rooms);
  assert.deepEqual(a.solution, b.solution);
  assert.notDeepEqual(generateChallenge(43, 3).chapter.rooms, a.chapter.rooms);
});

test('every generated challenge starts unsolved and is solved by its own hidden passages', () => {
  for (let d = 1; d <= MAX_DIFFICULTY; d++) for (let seed = 1; seed <= 25; seed++) {
    const { chapter, solution } = generateChallenge(seed, d);
    assert.equal(goalSatisfied(chapterStructure(chapter), chapter), false, `${chapter.id} starts unsolved`);
    const s = chapterStructure(chapter);
    for (const l of solution) s.addPortal({ ...l, transform: { ...l.transform } });
    assert.ok(validate(s, chapter.ruleset).ok, `${chapter.id} solution is legal`);
    assert.ok(goalSatisfied(s, chapter), `${chapter.id} solution works`);
  }
});

test('difficulty scales the rooms, the hidden chain and the demands', () => {
  for (let d = 2; d <= MAX_DIFFICULTY; d++) assert.ok(profile(d).rooms >= profile(d - 1).rooms && profile(d).links >= profile(d - 1).links);
  assert.equal(generateChallenge(5, 1).chapter.goal.kind, 'reach');
  assert.equal(generateChallenge(5, 4).chapter.goal.kind, 'arrive');
  const mean = (d) => { let t = 0; for (let s = 1; s <= 20; s++) { const g = generateChallenge(s, d); t += estimateDifficulty(g.chapter, g.solution); } return t / 20; };
  assert.ok(mean(1) < mean(3) && mean(3) < mean(5));
});

test('the exhaustive solver agrees the small ones are solvable, and never needs more passages than the hidden chain', () => {
  for (let d = 1; d <= 2; d++) for (let seed = 1; seed <= 8; seed++) {
    const { chapter, solution } = generateChallenge(seed, d);
    const r = solve(chapter, { maxSize: 2, budget: 3e6 });
    assert.ok(r && !r.skipped, `${chapter.id} searchable`);
    assert.ok(r.size >= 1 && r.size <= solution.length, `${chapter.id} minimum ${r.size} vs chain ${solution.length}`);
  }
});

test('generated plans disagree with their graph: the goal is never next to the start by accident', () => {
  let far = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const { chapter } = generateChallenge(seed, 2);
    const a = chapter.rooms.find((r) => r.id === chapter.start); const b = chapter.rooms.find((r) => r.id === chapter.goal.to);
    if (Math.hypot(a.x - b.x, a.y - b.y) >= 3) far++;
  }
  assert.ok(far >= 20);
});

import { Session } from '../src/game.js';

test('a generated challenge plays in the sandbox and is solved by its hidden passages', () => {
  for (const d of [1, 3, 5]) {
    const s = new Session();
    const { solution } = s.playGenerated(11, d);
    assert.ok(s.sandbox && s.challenge);
    s.testConstruction();
    assert.equal(s.feedback.kind, 'error', 'unsolved until built');
    for (const l of solution) s.structure.addPortal({ ...l, transform: { ...l.transform } });
    s.testConstruction();
    assert.equal(s.feedback.kind, 'success', `difficulty ${d}: ${s.feedback.text}`);
  }
});
