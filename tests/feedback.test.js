import { test } from 'node:test';
import assert from 'node:assert/strict';
import { feedbackReport, recordErrors, describeDevice, VERSION } from '../src/ui/feedback.js';
import { readFileSync } from 'node:fs';

test('the feedback note asks the question first and says where the player was', () => {
  const t = feedbackReport({ chapterTitle: 'II. The Two Doors', chapterId: 'the-two-doors', view: 'Plan', solved: 3, total: 42, rooms: 3, passages: 1, lastMessage: 'Goal not met.', buildLink: 'https://x/#c=abc', device: 'iOS, Safari, touch, 390x844 @3x', errors: [] });
  const lines = t.split('\n');
  assert.equal(lines[2], 'What happened, or where did you get stuck?');
  assert.match(t, /Where: II\. The Two Doors \(the-two-doors\), Plan view/);
  assert.match(t, /Progress: 3 of 42 solved/);
  assert.match(t, /This build: https:\/\/x\/#c=abc/);
  assert.match(t, /Errors: none/);
  assert.match(t, new RegExp(`Version ${VERSION.replace(/\./g, '\\.')}`));
});

test('free construction is named as such, and empty fields are left out', () => {
  const t = feedbackReport({ sandbox: true, view: 'Walk', solved: 0, total: 42, rooms: 0, passages: 0 });
  assert.match(t, /Where: Free construction, Walk view/);
  assert.doesNotMatch(t, /This build:/);
  assert.doesNotMatch(t, /Last message:/);
});

test('recordErrors keeps the last few errors, trimmed', () => {
  const handlers = {};
  const target = { addEventListener: (k, f) => { handlers[k] = f; } };
  const r = recordErrors(target, 2);
  handlers.error({ message: 'one' });
  handlers.error({ message: 'two\n  lines' });
  handlers.unhandledrejection({ reason: new Error('three') });
  assert.deepEqual(r.errors, ['two lines', 'Unhandled: three']);
});

test('describeDevice reads an iPhone sensibly', () => {
  const win = { navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' }, matchMedia: () => ({ matches: true }), innerWidth: 390, innerHeight: 844, devicePixelRatio: 3 };
  assert.equal(describeDevice(win), 'iOS, Safari, touch, 390x844 @3x');
});

test('the version in the note matches package.json', () => {
  assert.equal(VERSION, JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).version);
});
