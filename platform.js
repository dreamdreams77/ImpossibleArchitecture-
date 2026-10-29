// Small compatibility helpers for the browsers people actually use: the modern
// clipboard API is missing or refused in some contexts (older iOS, plain-http
// pages), and high-density phone screens can afford fewer canvas pixels.

// Copies text and resolves to true when it worked. Falls back to selecting a
// hidden field and asking the browser to copy the selection.
export async function copyText(text) {
  try {
    if (globalThis.navigator?.clipboard?.writeText && globalThis.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to the older route */ }
  if (typeof document === 'undefined' || !document.body) return false;
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  field.style.top = '0';
  document.body.appendChild(field);
  field.select();
  field.setSelectionRange(0, text.length);
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  field.remove();
  return ok;
}

// The pixel density a canvas should draw at. Touch screens are capped at 2, so a
// 3x phone does not allocate nine times the pixels for the same picture.
export function canvasRatio(dpr = globalThis.devicePixelRatio || 1, coarse = globalThis.matchMedia?.('(pointer: coarse)').matches ?? false) {
  return Math.min(dpr, coarse ? 2 : 3);
}
