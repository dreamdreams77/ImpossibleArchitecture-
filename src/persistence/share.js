// Share links: a construction encoded into a URL-safe string, so a whole
// building can be sent as one link. The payload is the same JSON the save
// format uses, validated by Structure.fromJSON on the way back in.

import { Structure } from '../topology/graph.js';

export const SHARE_LIMIT = 60000;

function toBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(code) {
  const padded = code.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(code.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

// Progress codes: completed chapters, discoveries, test counts and time, so
// progress can move between browsers. Only known chapter ids are kept.
const PROGRESS_LIMIT = 20000;

export function encodeProgress(progress) {
  return toBase64Url(JSON.stringify({
    v: 1,
    completed: progress.completed ?? [],
    discoveries: progress.discoveries ?? [],
    attempts: progress.attempts ?? {},
    time: progress.time ?? {},
  }));
}

// Returns { progress } or { error }. Never throws.
export function decodeProgress(code, knownChapterIds) {
  if (typeof code !== 'string' || code.length === 0) return { error: 'Paste a progress code first.' };
  if (code.length > PROGRESS_LIMIT) return { error: 'That progress code is too long.' };
  if (!/^[A-Za-z0-9_-]+$/.test(code)) return { error: 'That is not a progress code.' };
  let data;
  try {
    data = JSON.parse(fromBase64Url(code));
  } catch {
    return { error: 'That progress code could not be read.' };
  }
  const known = new Set(knownChapterIds);
  const isList = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string');
  const isCounts = (v) => v && typeof v === 'object' && !Array.isArray(v)
    && Object.values(v).every((x) => Number.isFinite(x) && x >= 0);
  if (data?.v !== 1 || !isList(data.completed ?? []) || !isList(data.discoveries ?? [])
      || !isCounts(data.attempts ?? {}) || !isCounts(data.time ?? {})) {
    return { error: 'That progress code is not in a form this game knows.' };
  }
  const keep = (ids) => [...new Set(ids.filter((id) => known.has(id)))];
  const keepCounts = (obj) => Object.fromEntries(Object.entries(obj).filter(([id]) => known.has(id)));
  return {
    progress: {
      completed: keep(data.completed ?? []),
      discoveries: [...new Set(data.discoveries ?? [])],
      attempts: keepCounts(data.attempts ?? {}),
      time: keepCounts(data.time ?? {}),
    },
  };
}

export function encodeShare(structure) {
  return toBase64Url(JSON.stringify(structure.toJSON()));
}

// Returns { structure } or { error }. Never throws, so a bad link cannot break
// the page that opens it.
export function decodeShare(code) {
  if (typeof code !== 'string' || code.length === 0) return { error: 'The share link is empty.' };
  if (code.length > SHARE_LIMIT) return { error: 'The share link is too long to be a construction.' };
  if (!/^[A-Za-z0-9_-]+$/.test(code)) return { error: 'The share link has characters a construction never uses.' };
  try {
    return { structure: Structure.fromJSON(JSON.parse(fromBase64Url(code))) };
  } catch (err) {
    return { error: `The share link could not be read: ${err.message}` };
  }
}
