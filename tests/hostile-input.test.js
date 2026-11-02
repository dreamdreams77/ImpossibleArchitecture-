// Hostile input: saves, share links and progress codes are mutated thousands of ways (wrong types, missing
// pieces, huge or non-finite numbers, prototype keys). A decoder may refuse, but it must never throw an
// error that is not a plain refusal, and anything it accepts must then survive the game (analysis, testing,
// walking, drawing, saving again). Deterministic, so a failure reproduces.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../src/game.js';
import { encodeSave, decodeSave } from '../src/persistence/store.js';
import { encodeShare, decodeShare, encodeProgress, decodeProgress } from '../src/persistence/share.js';
import { DEMOS } from '../src/campaign/demos.js';
import { chapterById, CHAPTERS } from '../src/campaign/chapters.js';
import { drawPlan } from '../src/render/draw.js';

test('hostile saves, share links and progress codes are refused cleanly or survived', () => {
  let seed = 12345; const rnd = (n) => { seed = (seed * 1103515245 + 12345) >>> 0; return seed % n; };
  const junk = () => [null, undefined, 0, -1, 1e9, NaN, Infinity, 'x', '', [], {}, [1, 2], { a: 1 }, true, '__proto__', { __proto__: { polluted: 1 } }, 'N', 3.5, -0][rnd(19)];
  function mutate(v, depth = 0) {
    if (v && typeof v === 'object' && depth < 6) {
      const copy = Array.isArray(v) ? [...v] : { ...v };
      const keys = Object.keys(copy);
      const n = 1 + rnd(3);
      for (let i = 0; i < n && keys.length; i++) {
        const k = keys[rnd(keys.length)];
        const r = rnd(5);
        if (r === 0) delete copy[k]; else if (r === 1) copy[k] = junk(); else if (r === 2) copy[k] = mutate(copy[k], depth + 1); else if (r === 3 && Array.isArray(copy)) copy.splice(rnd(copy.length + 1), 0, junk()); else copy[k] = mutate(copy[k], depth + 1);
      }
      return copy;
    }
    return junk();
  }
  const stub = () => { const t = { measureText: (x) => ({ width: String(x).length * 6 }), createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }) }; return new Proxy(t, { get: (o, k) => (k in o ? o[k] : () => {}), set: () => true }); };
  // seeds: demos, chapters, a generated challenge, a structure with every new field
  const seeds = [];
  for (const d of DEMOS) seeds.push({ chapterId: null, structure: d.build(), progress: { completed: ['threshold'], discoveries: ['atlas:self-room'] }, challenge: null });
  for (const id of ['the-two-lock-vault', 'the-mirror-lock', 'the-weathervane', 'the-ordered-hall', 'the-last-construction', 'the-moving-day', 'the-cupboard']) { const s = new Session({ chapterId: id }); seeds.push({ chapterId: id, structure: s.structure, progress: { completed: [], discoveries: [] }, challenge: null }); }
  { const s = new Session(); s.startSandbox(); s.addRoomAt(0, 0); s.addRoomAt(3, 0); const [a, b] = [...s.structure.rooms.keys()]; s.pickFace(a, 'E'); s.pickFace(b, 'W'); s.setChallengeObject({ v: 2, start: a, goals: [{ kind: 'reach', to: b, heading: 'E', maxSteps: 3, lit: false }], plates: [{ room: a, mode: 'latch', heading: 'N', startsLit: false }, { room: b, mode: 'latch', heading: 'N', startsLit: false, after: 0 }], cargo: [], pads: [], blocks: [], rules: { maxRooms: 4, maxPortals: 3, forbidden: [] }, objectives: [] }); seeds.push({ chapterId: null, structure: s.structure, progress: { completed: [], discoveries: [] }, challenge: s.challenge }); }
  const fails = new Map(); let decoded = 0, rejected = 0, total = 0;
  function record(stage, e, input) { const key = `${stage}: ${e.message.slice(0, 90)}`; if (!fails.has(key)) fails.set(key, { n: 0, sample: JSON.stringify(input).slice(0, 300) }); fails.get(key).n++; }
  for (let round = 0; round < 1500; round++) {
    const base = seeds[rnd(seeds.length)];
    const text = JSON.parse(encodeSave(base));
    const bad = mutate(text);
    total++;
    let save;
    try { save = decodeSave(JSON.stringify(bad)); decoded++; } catch (e) { if (!(e instanceof Error) || !/Save|save|Not an|Unsupported|room|Room|portal|Portal|face|Face|valid/.test(e.message)) record('decodeSave threw an odd error', e, bad); rejected++; continue; }
    // the decoded value goes through what the app does with a load
    try {
      const s = new Session();
      s.loadStructure(save.structure, save.chapterId, { challenge: save.challenge });
      s.progress.completed = [...save.progress.completed]; s.progress.discoveries = [...save.progress.discoveries];
      s.analysis(); s.testConstruction(); s.fpEnsure(); s.fpForward(); s.fpTurn('left'); s.fpForward(); s.cratePositions(); s.fieldNotes();
      drawPlan(stub(), { scale: 60, offsetX: 100, offsetY: 100 }, s, { width: 500, height: 400 }, 0);
      encodeSave({ chapterId: s.chapterIdValue, structure: s.structure, progress: s.progress, challenge: s.challenge });
      s.checkAtlas(); s.experiment();
    } catch (e) { record('using a decoded save', e, bad); }
  }
  for (let round = 0; round < 800; round++) {
    const base = seeds[rnd(seeds.length)];
    const j = mutate(base.structure.toJSON());
    const code = Buffer.from(JSON.stringify(j)).toString('base64url');
    total++;
    let r; try { r = decodeShare(code); } catch (e) { record('decodeShare threw', e, j); continue; }
    if (r.error) { rejected++; continue; }
    decoded++;
    try { const s = new Session(); s.loadStructure(r.structure); s.analysis(); s.testConstruction(); s.fpEnsure(); s.fpForward(); drawPlan(stub(), { scale: 60, offsetX: 100, offsetY: 100 }, s, { width: 500, height: 400 }, 0); encodeShare(s.structure); } catch (e) { record('using a decoded share', e, j); }
  }
  for (let round = 0; round < 400; round++) {
    const p = { v: 1, completed: ['threshold'], discoveries: ['atlas:self-room'], attempts: { threshold: 2 }, time: { threshold: 10 } };
    const code = Buffer.from(JSON.stringify(mutate(p))).toString('base64url');
    total++;
    try { const r = decodeProgress(code, CHAPTERS.map((c) => c.id)); if (r.progress) { decoded++; const s = new Session({ progress: r.progress }); s.progress.completed.includes('x'); s.checkAtlas(); encodeProgress(s.progress); } else rejected++; } catch (e) { record('progress code', e, p); }
  }
  assert.ok(decoded > 300 && rejected > 300, `a mix of accepted and refused inputs (${decoded}/${rejected})`);
    assert.deepEqual([...fails].map(([k, v]) => `${v.n}x ${k} e.g. ${v.sample}`), []);

});
