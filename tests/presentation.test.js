import { test } from 'node:test';
import assert from 'node:assert/strict';
import { envelope, SHOTS, Presentation, NO_OFFSET } from '../src/render3d/presentation.js';

test('the envelope eases in, holds and out, and is zero outside', () => {
  assert.equal(envelope(0, 1, 1, 1), 0);
  assert.equal(envelope(1.5, 1, 1, 1), 1);
  assert.equal(envelope(3, 1, 1, 1), 0);
  assert.equal(envelope(-1, 1, 1, 1), 0);
  assert.equal(envelope(9, 1, 1, 1), 0);
  assert.ok(envelope(0.5, 1, 1, 1) > 0 && envelope(0.5, 1, 1, 1) < 1);
});

test('every shot starts and ends at the player\'s own view, and stays gentle', () => {
  for (const [name, shot] of Object.entries(SHOTS)) {
    for (const t of [0, shot.duration]) assert.deepEqual(shot.offsets(t), { height: 0, pitch: 0, yaw: 0, fov: 0 }, `${name} at ${t}`);
    for (let t = 0; t < shot.duration; t += 0.05) {
      const o = shot.offsets(t);
      assert.ok(Math.abs(o.height) <= 0.6 && Math.abs(o.pitch) <= 0.2 && Math.abs(o.yaw) <= 0.1 && o.fov <= 15, `${name} at ${t}`);
    }
  }
});

test('a shot plays out and hands the view back', () => {
  const p = new Presentation();
  assert.equal(p.play('discovery'), true);
  assert.ok(p.active);
  let peak = 0; let steps = 0;
  while (p.active && steps++ < 1000) peak = Math.max(peak, p.update(0.05).fov);
  assert.ok(peak > 5);
  assert.deepEqual(p.update(0.05), NO_OFFSET);
  assert.equal(p.active, false);
});

test('input cancels at once; off and reduced motion play nothing; a short shot never cuts a long one', () => {
  const p = new Presentation();
  p.play('complete'); p.update(2);
  p.cancel();
  assert.equal(p.active, false);
  assert.deepEqual(p.update(0.1), NO_OFFSET);
  assert.equal(new Presentation({ enabled: false }).play('discovery'), false);
  assert.equal(new Presentation({ reduceMotion: true }).play('complete'), false);
  assert.equal(p.play('nonsense'), false);
  p.play('complete'); p.update(0.5);
  assert.equal(p.play('transform'), false, 'the long shot continues');
  assert.equal(p.shot, SHOTS.complete);
});
