import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHAPTERS, chapterById } from '../src/campaign/chapters.js';
import { solve } from '../tools/solve.mjs';

test('every challenge whose search space is small is solvable, never by nothing', () => {
  let checked = 0;
  for (const c of CHAPTERS) {
    const r = solve(c, { maxSize: 2, budget: 300000 });
    if (r?.skipped) continue;
    assert.ok(r, `${c.id} has a solution within two passages`);
    assert.ok(r.size >= 1, `${c.id} does not start solved`);
    checked++;
  }
  assert.ok(checked >= 18, `${checked} challenges searched exhaustively`);
});

test('the designs that teach a rule need the rule: minimum builds are what the blurbs claim', () => {
  const min = (id) => solve(chapterById(id), { maxSize: 2, budget: 300000 }).size;
  assert.equal(min('the-two-doors'), 2, 'forbidden direct link forces a route through the Annex');
  assert.equal(min('the-seam'), 2, 'one passage cannot serve both wings');
  assert.equal(min('the-turned-nave'), 1);
  assert.equal(min('the-far-wing'), 1);
});
