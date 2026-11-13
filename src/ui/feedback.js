// "Send feedback": a short, plain-text note a player can paste into a message. It says where they were (challenge,
// view, what they had built, as a link that rebuilds it), what they were playing on, and the last few errors the
// page met. It carries nothing personal: no name, no saved progress beyond a count, no location.

export const VERSION = '1.2.1';

// Remembers the last few uncaught errors, newest last. `target` is the window (or anything with addEventListener).
export function recordErrors(target, keep = 3) {
  const errors = [];
  const push = (text) => {
    const line = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!line) return;
    errors.push(line);
    while (errors.length > keep) errors.shift();
  };
  target?.addEventListener?.('error', (e) => push(e?.message || e?.error?.message || 'Unknown error'));
  target?.addEventListener?.('unhandledrejection', (e) => push(`Unhandled: ${e?.reason?.message ?? e?.reason ?? 'rejection'}`));
  return { errors, push };
}

const count = (n, word) => `${n ?? 0} ${word}${(n ?? 0) === 1 ? '' : 's'}`;

// Everything is passed in, so the text can be checked without a browser.
export function feedbackReport({ chapterTitle, chapterId, sandbox, view, solved, total, rooms, passages, lastMessage, buildLink, device, errors = [] }) {
  const where = sandbox ? 'Free construction' : `${chapterTitle ?? '?'}${chapterId ? ` (${chapterId})` : ''}`;
  const lines = [
    'Impossible Architecture: feedback',
    '',
    'What happened, or where did you get stuck?',
    '',
    '',
    '---- (for the maker; nothing personal below) ----',
    `Version ${VERSION}`,
    `Where: ${where}, ${view ?? '?'} view`,
    `Progress: ${solved ?? 0} of ${total ?? '?'} solved`,
    `Built: ${count(rooms, 'room')}, ${count(passages, 'passage')}`,
  ];
  if (lastMessage) lines.push(`Last message: ${lastMessage}`);
  if (buildLink) lines.push(`This build: ${buildLink}`);
  if (device) lines.push(`Device: ${device}`);
  lines.push(errors.length ? `Errors: ${errors.join(' | ')}` : 'Errors: none');
  return lines.join('\n');
}

// A one-line description of the device, from what the browser exposes anyway.
export function describeDevice(win = globalThis) {
  const nav = win.navigator ?? {};
  const ua = String(nav.userAgent ?? '');
  const os = /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'unknown OS';
  const browser = /EdgA?\//.test(ua) ? 'Edge' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'unknown browser';
  const touch = win.matchMedia?.('(pointer: coarse)')?.matches ? 'touch' : 'mouse';
  const w = win.innerWidth ?? '?'; const h = win.innerHeight ?? '?'; const dpr = win.devicePixelRatio ?? 1;
  return `${os}, ${browser}, ${touch}, ${w}x${h} @${dpr}x`;
}
