// Device-aware defaults only. Players can always override them in Settings.
export function normalizeLayoutMode(value) {
  return ['auto', 'compact', 'full'].includes(value) ? value : 'auto';
}

// The controls column is where the objective and the Test button live, so Auto keeps it: on a phone it scrolls
// beneath the pinned drawing. Compact hides it for the largest possible view.
export function defaultPanelHidden(mode = 'auto') {
  return normalizeLayoutMode(mode) === 'compact';
}
