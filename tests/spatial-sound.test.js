import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roomAcoustics, neighbourMix, floorCue, MATERIALS, cueSpec, CUE_NAMES, Sound } from '../src/ui/sound.js';

test('bigger rooms ring longer; cellars are dead, atria bright', () => {
  assert.ok(roomAcoustics(1.5, 'chamber').decay > roomAcoustics(0.75, 'chamber').decay);
  assert.ok(roomAcoustics(1, 'cellar').decay < roomAcoustics(1, 'atrium').decay);
  assert.ok(roomAcoustics(1, 'atrium').damp > roomAcoustics(1, 'cellar').damp);
  assert.ok(roomAcoustics(9, 'atrium').decay <= 4.5);
});

test('a shut gate or refused passage muffles the room beyond it', () => {
  const open = neighbourMix({ rel: 0 });
  const shut = neighbourMix({ shut: true, rel: 0 });
  const blocked = neighbourMix({ blocked: true, rel: 0 });
  assert.ok(open.gain > shut.gain && shut.gain > blocked.gain);
  assert.ok(open.cutoff > shut.cutoff && shut.cutoff > blocked.cutoff);
});

test('neighbour sound is panned by the doorway direction and quieter behind', () => {
  assert.ok(neighbourMix({ rel: Math.PI / 2 }).pan > 0.5);
  assert.ok(neighbourMix({ rel: -Math.PI / 2 }).pan < -0.5);
  assert.equal(Math.round(neighbourMix({ rel: 0 }).pan * 100), 0);
  assert.ok(neighbourMix({ rel: Math.PI }).gain < neighbourMix({ rel: 0 }).gain);
});

test('every style has a footstep material and a cue that exists', () => {
  for (const k of Object.keys(MATERIALS)) assert.ok(CUE_NAMES.includes(floorCue(k)), k);
  assert.equal(floorCue('nonsense'), 'step');
  assert.ok(cueSpec('slide')[0].noise);
});

function fakeContext(log) {
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime(v) { log.targets.push(v); }, cancelScheduledValues() {} });
  const node = (kind) => ({ kind, gain: param(), frequency: param(), Q: param(), pan: param(), connect(n) { return n; }, disconnect() {}, start() { log.started.push(kind); }, stop() {} });
  return class {
    constructor() { this.currentTime = 0; this.sampleRate = 8000; this.state = 'running'; this.destination = node('dest'); }
    createGain() { return node('gain'); }
    createOscillator() { return node('osc'); }
    createBufferSource() { return node('noise'); }
    createBiquadFilter() { return node('filter'); }
    createStereoPanner() { return node('pan'); }
    createConvolver() { return node('conv'); }
    createBuffer(c, n) { return { sampleRate: 8000, getChannelData: () => new Float32Array(n) }; }
  };
}

test('sound plays material footsteps, reverb and neighbour voices through a context', () => {
  const log = { started: [], targets: [] };
  globalThis.AudioContext = fakeContext(log);
  try {
    const s = new Sound(null);
    s.setEnabled(true);
    s.setFloor('mechanical');
    s.play('step');
    assert.ok(log.started.includes('noise'), 'grating step is noise based');
    s.setRoom(1.5, 'atrium');
    s.setNeighbours([{ rel: 0 }, { rel: Math.PI / 2, shut: true }]);
    assert.equal(s._voices.length, 2);
    assert.ok(log.targets.length > 0);
    s.setEnabled(false);
    s.play('step');
  } finally {
    delete globalThis.AudioContext;
  }
});
