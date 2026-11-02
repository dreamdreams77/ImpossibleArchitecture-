import { test } from 'node:test';
import assert from 'node:assert/strict';
import { introStep, introNeeded, INTRO_STEPS, TUTORIAL_LESSONS } from '../src/ui/intro.js';
import { DEMOS } from '../src/campaign/demos.js';

const base = { active: true, chapterId: 'threshold', portals: 0, pending: false, steps: 0, view: 'plan', modelSeen: false };

test('the introduction says nothing unless it is active, and only on the first challenge', () => {
  assert.equal(introStep({ ...base, active: false }), null);
  assert.equal(introStep({ ...base, chapterId: 'the-two-doors' }), null);
  assert.equal(introStep({ ...base, chapterId: null }), null);
});

test('it follows what the player does: connect, then walk, then model, then a closing line', () => {
  assert.equal(introStep(base).step, 'connect');
  assert.equal(introStep(base).target, 'tool-connect');
  assert.match(introStep({ ...base, pending: true }).text, /other room/);
  assert.equal(introStep({ ...base, portals: 1 }).step, 'walk');
  assert.equal(introStep({ ...base, portals: 1 }).target, 'view-first');
  assert.equal(introStep({ ...base, portals: 1, view: 'first' }).target, 'pad-turn', 'facing a wall: turn first');
  assert.equal(introStep({ ...base, portals: 1, view: 'first', facing: true }).target, 'pad-fwd');
  assert.equal(introStep({ ...base, portals: 1, steps: 1, view: 'first' }).step, 'model');
  assert.equal(introStep({ ...base, portals: 1, steps: 1, view: 'first' }).target, 'view-model');
  assert.equal(introStep({ ...base, portals: 1, steps: 1, view: 'model' }), null, 'in the model: seen');
  assert.equal(introStep({ ...base, portals: 1, steps: 1, view: 'model', modelSeen: true }).step, 'finish');
});

test('it cannot be failed or trapped: any state gives a step or silence, and steps are numbered', () => {
  for (const portals of [0, 1, 2]) for (const steps of [0, 3]) for (const view of ['plan', 'first', 'model']) for (const pending of [false, true]) for (const modelSeen of [false, true]) {
    const s = introStep({ ...base, portals, steps, view, pending, modelSeen });
    if (s) { assert.ok(INTRO_STEPS.includes(s.step)); assert.ok(s.text.length > 10 && s.text.length < 130, 'short'); assert.ok(s.index >= 1 && s.index <= s.of); }
  }
  // Undoing the doorway sends the player back a step rather than leaving a stale instruction.
  assert.equal(introStep({ ...base, portals: 0, steps: 4, view: 'first' }).step, 'connect');
});

test('it is shown only to someone who has never been through it and has not played', () => {
  assert.equal(introNeeded({ stored: null, hasPlayed: false }), true);
  assert.equal(introNeeded({ stored: 'done', hasPlayed: false }), false);
  assert.equal(introNeeded({ stored: 'skipped', hasPlayed: false }), false);
  assert.equal(introNeeded({ stored: null, hasPlayed: true }), false);
});


test('the guided learning path points to unique, real demonstrations', () => {
  const demoIds = new Set(DEMOS.map((demo) => demo.id));
  const lessonIds = TUTORIAL_LESSONS.map((lesson) => lesson.demoId);
  assert.equal(new Set(lessonIds).size, TUTORIAL_LESSONS.length, 'no duplicate lessons');
  assert.equal(TUTORIAL_LESSONS.length, 6);
  for (const lesson of TUTORIAL_LESSONS) {
    assert.ok(demoIds.has(lesson.demoId), `known demonstration: ${lesson.demoId}`);
    assert.ok(lesson.title.length > 5);
    assert.ok(lesson.concept.length > 20);
    assert.ok(lesson.action.length > 20);
  }
});
