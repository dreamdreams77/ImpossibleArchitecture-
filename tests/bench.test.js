import { test } from 'node:test';
import assert from 'node:assert/strict';
import { percentile, summarise, windows, drift, isSoftwareRenderer, recommendPreset, verdict, formatReport } from '../src/ui/bench.js';

test('percentiles and summaries of frame times', () => {
  const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  assert.equal(percentile(sorted, 50), 5);
  assert.equal(percentile(sorted, 95), 10);
  assert.equal(percentile([], 50), 0);
  const s = summarise([16, 16, 16, 16, 100]);
  assert.equal(s.frames, 5);
  assert.ok(Math.abs(s.avg - 32.8) < 1e-9);
  assert.ok(Math.abs(s.fps - 1000 / 32.8) < 1e-9);
  assert.equal(s.worst, 100);
  assert.equal(s.over33, 0.2);
  assert.deepEqual(summarise([]).frames, 0);
  assert.equal(summarise([NaN, -3, 0, 20]).frames, 1, 'bad samples are ignored');
});

test('sustained runs: window rates and the fraction of frame rate lost', () => {
  // 20 s at 16 ms (62.5 fps) then 20 s at 25 ms (40 fps): the rate falls by 36%.
  const run = [...Array(1250).fill(16), ...Array(800).fill(25)];
  const w = windows(run, 10000);
  assert.equal(w.length, 4);
  assert.ok(Math.abs(w[0].fps - 62.5) < 0.5 && Math.abs(w[3].fps - 40) < 0.5);
  const d = drift(run, 10000);
  assert.ok(d.enough && Math.abs(d.lost - 0.36) < 0.02, `lost ${d.lost}`);
  assert.equal(drift(Array(100).fill(16), 10000).enough, false, 'too short to judge');
  assert.equal(drift(Array(2500).fill(16), 10000).lost, 0, 'a steady rate loses nothing');
  assert.equal(drift([...Array(800).fill(25), ...Array(1250).fill(16)], 10000).lost, 0, 'getting faster is not a drop');
});

test('software renderers are recognised and never recommended anything but low', () => {
  for (const r of ['Google SwiftShader', 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))', 'llvmpipe (LLVM 15)', 'Microsoft Basic Render Driver']) assert.ok(isSoftwareRenderer(r), r);
  for (const r of ['Mali-G78', 'Adreno (TM) 740', 'Apple GPU', 'NVIDIA GeForce RTX 3060']) assert.equal(isSoftwareRenderer(r), false, r);
  assert.equal(recommendPreset({ renderer: 'Google SwiftShader', mobile: false, memoryGB: 32, cores: 32 }), 'low');
});

test('recommendations follow what a device admits', () => {
  assert.equal(recommendPreset({ renderer: 'Adreno (TM) 740', mobile: true, memoryGB: 8, cores: 8 }), 'medium');
  assert.equal(recommendPreset({ renderer: 'Mali-G52', mobile: true, memoryGB: 2, cores: 8 }), 'low');
  assert.equal(recommendPreset({ renderer: 'Adreno (TM) 740', mobile: true, memoryGB: 8, cores: 4 }), 'low');
  assert.equal(recommendPreset({ renderer: 'Mali-T720', mobile: true, memoryGB: 4, cores: 8 }), 'low');
  assert.equal(recommendPreset({ renderer: 'NVIDIA GeForce RTX 3060', mobile: false, memoryGB: 8, cores: 12, dpr: 1 }), 'high');
  assert.equal(recommendPreset({ renderer: 'Intel UHD', mobile: false, memoryGB: 2, cores: 4 }), 'medium');
});

test('verdicts and the report say plainly what they measured, and flag a software renderer', () => {
  assert.match(verdict(summarise(Array(100).fill(16))), /smooth/);
  assert.match(verdict(summarise(Array(100).fill(30))), /playable/);
  assert.match(verdict(summarise(Array(100).fill(45))), /choppy/);
  assert.match(verdict(summarise(Array(100).fill(90))), /too slow/);
  const base = { when: 'now', recommended: 'low', device: { userAgent: 'UA', screen: '360x740', dpr: 2, cores: 8, memoryGB: 4, renderer: 'Google SwiftShader', software: true, webgl: 'WebGL 2', maxTexture: 8192, timerQuery: false }, presets: [{ name: 'low', summary: summarise(Array(100).fill(20)), draws: 40, triangles: 9000, passes: 2, scissorSaved: 90, memory: { geometries: 30, textures: 12 }, heapMB: 55 }], sustained: { preset: 'low', seconds: 30, ...drift([...Array(500).fill(16), ...Array(500).fill(30)], 5000) }, touch: { samples: 0, p50: 0, p95: 0 } };
  const text = formatReport(base);
  assert.match(text, /SOFTWARE RENDERER: these frame times say nothing about a phone/);
  assert.match(text, /thermal throttling/);
  assert.match(text, /no touch events/);
  assert.match(formatReport({ ...base, device: { ...base.device, software: false, renderer: 'Adreno (TM) 740' }, sustained: null }), /gpu: Adreno \(TM\) 740$/m);
});
