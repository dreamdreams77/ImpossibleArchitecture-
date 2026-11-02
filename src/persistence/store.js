// Persistence: serialising structures and campaign progress.
//
// The on-disk format is plain JSON with an explicit version, so saves can be
// inspected, diffed, and shared. Storage is injected so the logic can be
// tested without a browser.

import { Structure } from '../topology/graph.js';
import { normalizeChallenge } from '../campaign/editor.js';

const SAVE_VERSION = 1;

export function encodeSave({ chapterId, structure, progress, challenge = null }) {
  return JSON.stringify({
    game: 'impossible-architecture',
    saveVersion: SAVE_VERSION,
    chapterId,
    structure: structure.toJSON(),
    challenge: normalizeChallenge(challenge),
    progress: {
      completed: [...(progress?.completed ?? [])],
      discoveries: [...(progress?.discoveries ?? [])],
      attempts: { ...(progress?.attempts ?? {}) },
      time: { ...(progress?.time ?? {}) },
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
  if (data.chapterId !== null && typeof data.chapterId !== 'string') {
    throw new Error('Save file has an invalid chapter id');
  }
  const progress = data.progress ?? {};
  const isList = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string');
  const isCounts = (value) => value && typeof value === 'object' && !Array.isArray(value)
    && Object.values(value).every((count) => Number.isFinite(count) && count >= 0);
  const completed = progress.completed ?? [];
  const discoveries = progress.discoveries ?? [];
  const attempts = progress.attempts ?? {};
  const time = progress.time ?? {};
  if (!isList(completed) || !isList(discoveries) || !isCounts(attempts) || !isCounts(time)) {
    throw new Error('Save file contains invalid campaign progress');
  }
  return {
    chapterId: data.chapterId,
    structure: Structure.fromJSON(data.structure),
    challenge: normalizeChallenge(data.challenge),
    progress: {
      completed: [...new Set(completed)],
      discoveries: [...new Set(discoveries)],
      attempts: { ...attempts },
      time: { ...time },
    },
  };
}


/**
 * Restore the most recent autosaved construction into a live session.
 * The autosave contains the progress snapshot written alongside that
 * construction, so it is the recovery source of truth if the browser closed
 * between the separate work/progress localStorage writes.
 *
 * Returns false when the save belongs to a different chapter or is invalid.
 */
export function restoreSaveIntoSession(session, raw) {
  let data;
  try {
    data = decodeSave(raw);
    if (data.chapterId !== null && data.chapterId !== session.chapter?.id) return false;
    if (data.chapterId === null) session.startSandbox();
    session.loadStructure(
      data.structure,
      data.chapterId,
      { challenge: data.challenge },
    );
    session.progress = {
      completed: [...data.progress.completed],
      discoveries: [...data.progress.discoveries],
      attempts: { ...data.progress.attempts },
      time: { ...data.progress.time },
    };
    return true;
  } catch {
    return false;
  }
}

// A sandbox challenge: the editor's current shape, or the first version's one goal, which is upgraded.
// Anything malformed is dropped. (Kept under its old name for callers of the first version.)
export const validChallenge = normalizeChallenge;

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
