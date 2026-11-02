import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLayoutMode, defaultPanelHidden } from '../src/ui/responsive.js';

test('layout preferences accept only the three supported modes', () => {
  for (const mode of ['auto', 'compact', 'full']) assert.equal(normalizeLayoutMode(mode), mode);
  for (const invalid of [null, '', 'wide', 'phone', 1]) assert.equal(normalizeLayoutMode(invalid), 'auto');
});

test('automatic layout keeps the controls column on every device: it holds the objective and the Test button', () => {
  assert.equal(defaultPanelHidden('auto'), false);
});

test('compact hides the column for the largest view; full keeps it, whatever the input device', () => {
  assert.equal(defaultPanelHidden('compact'), true);
  assert.equal(defaultPanelHidden('full'), false);
});

test('unknown layout values safely fall back to automatic behaviour', () => {
  assert.equal(defaultPanelHidden('unexpected'), false);
});
