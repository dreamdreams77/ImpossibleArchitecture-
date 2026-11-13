// Challenges added or tightened after the depth review. Each must be solvable, and no smaller build may solve it,
// so the mechanic it is there to teach cannot be skipped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chapterById } from '../src/campaign/chapters.js';
import { solve } from '../tools/solve.mjs';

const expected = {
  'the-carillon': { size: 1, count: 4 },        // sequenced plates, only a Belfry self-loop rings all three
  'the-double-reading': { size: 1, count: 12 }, // plate parity: a mirrored self-loop, crossed twice
  'the-silvered-stair': { size: 2, count: 288 },// one way + parity + order
  'the-long-corridor': { size: 2, count: 1152 },// every route now takes the one-way drop
  'revolving-house': { size: 1, count: 32 },    // the Lobby can no longer bypass the Drum
};
for (const [id, want] of Object.entries(expected)) {
  test(`${id}: needs exactly ${want.size} passage(s), ${want.count} minimal builds`, () => {
    const c = chapterById(id);
    assert.ok(c, `${id} is in the campaign`);
    const r = solve(c, { maxSize: 2, budget: 2000000 });
    assert.ok(r && !r.skipped);
    assert.equal(r.size, want.size);
    assert.equal(r.count, want.count);
  });
}
