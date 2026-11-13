// The audit tool searches route-first; tools/solve.mjs enumerates passage sets. Where both can run they must
// agree exactly on how many minimal solutions a challenge has, which validates the audit tool before it is
// trusted on the challenges the enumerator cannot reach.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chapterById } from '../src/campaign/chapters.js';
import { solve } from '../tools/solve.mjs';
import { audit } from '../tools/audit.mjs';

for (const id of ['mirrored-gallery', 'the-long-corridor', 'the-stillwater', 'the-turned-nave', 'the-weathervane', 'sealed-wing']) {
  test(`audit and exhaustive solver agree on the minimal solutions of ${id}`, () => {
    const c = chapterById(id);
    const ex = solve(c, { maxSize: 2, budget: 400000 });
    assert.ok(ex && !ex.skipped, 'the enumerator can handle it');
    const below = ex.size > 0 ? audit(c, { budget: ex.size - 1, maxRoute: 14, seconds: 60 }) : null;
    if (below) { assert.ok(below.complete); assert.equal(below.solutions, 0, 'nothing smaller than the minimum'); }
    const at = audit(c, { budget: ex.size, maxRoute: 14, seconds: 60, maxSolutions: 5000 });
    assert.ok(at.complete);
    assert.equal(at.bySize[ex.size] ?? 0, ex.count, `${id}: audit found ${at.bySize[ex.size] ?? 0} minimal solutions, the enumerator ${ex.count}`);
  });
}

test('the audit tool finds no solution to an unsolved start, and respects its budget', () => {
  const c = chapterById('the-machine');
  const r = audit(c, { budget: 1, maxRoute: 10, seconds: 30 });
  assert.equal(r.solutions, 0);
  assert.ok(r.complete);
});
