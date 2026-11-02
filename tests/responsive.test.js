import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLayoutMode, defaultPanelHidden } from '../src/ui/responsive.js';

test('layout preferences accept only the three supported modes', () => {
  for (const mode of ['auto', 'compact', 'full']) assert.equal(normalizeLayoutMode(mode), mode);
  for (const invalid of [null, '', 'wide', 'phone', 1]) assert.equal(normalizeLayoutMode(invalid), 'auto');
});

test('automatic layout keeps the inspector on desktop and tucks it away on touch devices', () => {
  assert.equal(defaultPanelHidden('auto', false), false);
  assert.equal(defaultPanelHidden('auto', true), true);
});

test('compact and full modes have predictable defaults regardless of input device', () => {
  assert.equal(defaultPanelHidden('compact', false), true);
  assert.equal(defaultPanelHidden('compact', true), true);
  assert.equal(defaultPanelHidden('full', false), false);
  assert.equal(defaultPanelHidden('full', true), false);
});

test('unknown layout values safely fall back to automatic behavior', () => {
  assert.equal(defaultPanelHidden('unexpected', true), true);
  assert.equal(defaultPanelHidden('unexpected', false), false);
});
