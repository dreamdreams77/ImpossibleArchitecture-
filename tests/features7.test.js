import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyText, canvasRatio } from '../src/ui/platform.js';
import { Sound } from '../src/ui/sound.js';

test('canvasRatio caps touch screens at 2 and leaves desktops up to 3', () => {
  assert.equal(canvasRatio(3, true), 2);
  assert.equal(canvasRatio(3, false), 3);
  assert.equal(canvasRatio(1.5, true), 1.5);
  assert.equal(canvasRatio(1, false), 1);
});

test('copyText reports failure without a document, rather than throwing', async () => {
  assert.equal(await copyText('hello'), false);
});

test('sound wakes a suspended audio context before playing a cue', () => {
  const calls = [];
  class FakeContext {
    constructor() { this.state = 'suspended'; this.currentTime = 0; }
    resume() { calls.push('resume'); this.state = 'running'; return Promise.resolve(); }
    createOscillator() { return { connect() {}, start() {}, stop() {}, frequency: { value: 0 } }; }
    createGain() { return { connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} } }; }
    get destination() { return {}; }
  }
  const previous = globalThis.AudioContext;
  globalThis.AudioContext = FakeContext;
  try {
    const sound = new Sound({ getItem: () => 'on', setItem() {} });
    sound.play('step');
    assert.deepEqual(calls, ['resume']);
  } finally {
    globalThis.AudioContext = previous;
  }
});
