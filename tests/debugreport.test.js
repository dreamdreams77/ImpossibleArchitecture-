import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../src/game.js';
import { debugReport, describePortal } from '../src/ui/debugreport.js';

test('the report names nodes, connections, objects, the walker and the verdict', () => {
  const s = new Session({ chapterId: 'the-machine' });
  s.fpEnsure();
  const text = debugReport(s).join('\n');
  assert.match(text, /== world: 4 nodes, 0 connections, the-machine/);
  assert.match(text, /intake .* degree 0/);
  assert.match(text, /plate 1 in press facing S \(latch\): dark/);
  assert.match(text, /in intake facing N, 0 steps/);
  assert.match(text, /solved by this construction: no/);
  assert.match(text, /blocked: /);
});

test('a connection is described with its transform, direction and gate', () => {
  const s = new Session({ chapterId: 'sealed-wing' });
  const fixed = [...s.structure.portals.values()][0];
  assert.match(describePortal(fixed), /gate: plate 1.*fixed/);
  assert.match(describePortal({ id: 'p9', a: { room: 'a', face: 'N' }, b: { room: 'b', face: 'S' }, transform: { turns: 1, mirror: true }, oneWay: 'b' }), /turns ¼, mirror, one-way from b/);
});

test('the report shows invalid constructions and a solved verdict from the real engine', () => {
  const s = new Session({ chapterId: 'threshold' });
  s.pickFace('hall', 'E');
  s.pickFace('vault', 'W');
  const text = debugReport(s).join('\n');
  assert.match(text, /hall\.E <-> vault\.W/);
  assert.match(text, /solved by this construction: yes/);
  assert.match(text, /invalid constructions\n\(none\)/);
});

test('free construction reports no goal', () => {
  const s = new Session({ chapterId: 'threshold' });
  s.startSandbox();
  const text = debugReport(s).join('\n');
  assert.match(text, /free construction/);
  assert.match(text, /\(no goal\)/);
});
