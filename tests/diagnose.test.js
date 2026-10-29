import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagnose } from '../src/campaign/diagnose.js';
import { chapterById, chapterStructure } from '../src/campaign/chapters.js';
import { connect } from '../src/topology/construction.js';

const join = (s, spec) => connect(s, spec).structure;

test('an empty construction says there is no passage to the goal', () => {
  const c = chapterById('lantern-court');
  const reasons = diagnose(chapterStructure(c), c);
  assert.ok(reasons.some((r) => /No passage leads to Roof/.test(r)), reasons.join(' | '));
  assert.ok(reasons.some((r) => /face E in Lantern/.test(r)), 'the Lantern plate is named');
});

test('with the passages but not the Lantern plate, the diagnosis names the plate', () => {
  const c = chapterById('lantern-court');
  let s = chapterStructure(c);
  s = join(s, { a: 'court', aFace: 'N', b: 'lantern', bFace: 'N' });   // Lantern entered from the north
  s = join(s, { a: 'stair', aFace: 'S', b: 'roof', bFace: 'N' });
  const reasons = diagnose(s, c);
  assert.ok(reasons.some((r) => /face E in Lantern/.test(r)), reasons.join(' | '));
});

test('a wrong arrival heading at the goal is reported as the heading problem', () => {
  const c = chapterById('mirror-archive');
  let s = chapterStructure(c);
  s = join(s, { a: 'reading', aFace: 'S', b: 'stacks', bFace: 'S' });
  s = join(s, { a: 'vault', aFace: 'N', b: 'archive', bFace: 'W' });   // no mirror: arrives facing E
  const reasons = diagnose(s, c);
  assert.ok(reasons.some((r) => /must face W/.test(r)), reasons.join(' | '));
});

test('a loop goal with no loop says so', () => {
  const c = chapterById('threshold');
  const loopGoal = { ...c, goal: { kind: 'loop' } };
  assert.deepEqual(diagnose(chapterStructure(loopGoal), loopGoal), ['No loop closes the construction yet.']);
});
