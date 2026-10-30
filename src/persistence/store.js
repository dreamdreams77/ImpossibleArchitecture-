// Persistence: serialising structures and campaign progress.
//
// The on-disk format is plain JSON with an explicit version, so saves can be
// inspected, diffed, and shared. Storage is injected so the logic can be
// tested without a browser.

import { Structure } from '../topology/graph.js';

const SAVE_VERSION = 1;

export function encodeSave({ chapterId, structure, progress, challenge = null }) {
  return JSON.stringify({
    game: 'impossible-architecture',
    saveVersion: SAVE_VERSION,
    chapterId,
    structure: structure.toJSON(),
    challenge: challenge ? { start: challenge.start, to: challenge.to, heading: challenge.heading ?? null, maxSteps: challenge.maxSteps ?? null } : null,
    progress: {
      completed: [...(progress?.completed ?? [])],
      discoveries: [...(progress?.discoveries ?? [])],
    },
  }, null, 2);
}

export function decodeSave(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Save file is not valid JSON');
  }
  if (data?.game !== 'impossible-architecture') {
    throw new Error('Not an Impossible Architecture save');
  }
  if (data.saveVersion !== SAVE_VERSION) {
    throw new Error(`Unsupported save version ${data.saveVersion}`);
  }
  return {
    chapterId: data.chapterId,
    structure: Structure.fromJSON(data.structure),
    challenge: validChallenge(data.challenge),
    progress: {
      completed: data.progress?.completed ?? [],
      discoveries: data.progress?.discoveries ?? [],
    },
  };
}

// A sandbox challenge is { start, to, heading, maxSteps }. Anything malformed is dropped.
export function validChallenge(c) {
  if (!c || typeof c.start !== 'string' || typeof c.to !== 'string') return null;
  const heading = ['N', 'E', 'S', 'W'].includes(c.heading) ? c.heading : null;
  const maxSteps = Number.isInteger(c.maxSteps) && c.maxSteps > 0 ? c.maxSteps : null;
  return { start: c.start, to: c.to, heading, maxSteps };
}

// Thin wrapper over any key-value store with getItem/setItem/removeItem.
export class SaveSlots {
  constructor(storage, prefix = 'ia-save:') {
    this.storage = storage;
    this.prefix = prefix;
  }

  save(slot, payload) {
    this.storage.setItem(this.prefix + slot, encodeSave(payload));
  }

  load(slot) {
    const raw = this.storage.getItem(this.prefix + slot);
    return raw == null ? null : decodeSave(raw);
  }

  // The names of all saved slots, sorted. Works with localStorage and with any
  // store that offers keys() or the indexed key(i) accessor.
  names() {
    let keys;
    if (typeof this.storage.keys === 'function') keys = [...this.storage.keys()];
    else {
      keys = [];
      for (let i = 0; i < (this.storage.length ?? 0); i++) keys.push(this.storage.key(i));
    }
    return keys
      .filter((k) => typeof k === 'string' && k.startsWith(this.prefix))
      .map((k) => k.slice(this.prefix.length))
      .sort();
  }

  // Each saved slot with the chapter it belongs to (null for free construction).
  // A save that cannot be read is listed without a chapter.
  describe() {
    return this.names().map((name) => {
      let chapterId = null;
      try { chapterId = decodeSave(this.storage.getItem(this.prefix + name)).chapterId ?? null; } catch { /* unreadable */ }
      return { name, chapterId };
    });
  }

  has(slot) {
    return this.storage.getItem(this.prefix + slot) != null;
  }

  remove(slot) {
    this.storage.removeItem(this.prefix + slot);
  }
}
