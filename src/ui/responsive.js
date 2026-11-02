// Device-aware defaults only. Players can always override them in Settings.
export function normalizeLayoutMode(value) {
  return ['auto', 'compact', 'full'].includes(value) ? value : 'auto';
}

export function defaultPanelHidden(mode = 'auto', coarsePointer = false) {
  const preference = normalizeLayoutMode(mode);
  return preference === 'compact' || (preference === 'auto' && !!coarsePointer);
}
