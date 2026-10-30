// Sound cues: short tones made in the browser, so there are no audio files to
// ship. The note patterns are plain data (see cueSpec) and are tested; playing
// them needs the Web Audio API and is skipped quietly when it is missing.
// Sound is off until the player turns it on, and the choice is remembered.

const CUES = {
  step: [{ freq: 220, at: 0, dur: 0.07, type: 'triangle' }],
  bump: [{ freq: 120, at: 0, dur: 0.12, type: 'square' }],
  plate: [{ freq: 660, at: 0, dur: 0.12, type: 'sine' }, { freq: 990, at: 0.08, dur: 0.16, type: 'sine' }],
  oneway: [{ freq: 300, at: 0, dur: 0.1, type: 'sawtooth' }, { freq: 200, at: 0.1, dur: 0.14, type: 'sawtooth' }],
  gate: [{ freq: 440, at: 0, dur: 0.1, type: 'sine' }, { freq: 660, at: 0.1, dur: 0.18, type: 'sine' }],
  // Footsteps by floor material: bursts of filtered noise, since a floor is not a note.
  stepStone: [{ noise: true, freq: 700, q: 1.1, at: 0, dur: 0.07 }, { noise: true, freq: 220, q: 0.8, at: 0.01, dur: 0.09 }],
  stepTile: [{ noise: true, freq: 2200, q: 1.8, at: 0, dur: 0.045 }, { noise: true, freq: 600, q: 1, at: 0.005, dur: 0.06 }],
  stepPolished: [{ noise: true, freq: 1500, q: 0.9, at: 0, dur: 0.05 }, { freq: 150, at: 0, dur: 0.06, type: 'sine' }],
  stepGrating: [{ noise: true, freq: 3200, q: 2.5, at: 0, dur: 0.06 }, { freq: 330, at: 0, dur: 0.1, type: 'triangle' }, { freq: 497, at: 0.015, dur: 0.07, type: 'triangle' }],
  // Machinery: a gate sliding, a plate going down, a latch.
  slide: [{ noise: true, freq: 400, q: 0.7, at: 0, dur: 0.5, sweep: 1400 }],
  plateDown: [{ freq: 90, at: 0, dur: 0.16, type: 'sine' }, { noise: true, freq: 1800, q: 2, at: 0.02, dur: 0.05 }],
  latch: [{ freq: 1100, at: 0, dur: 0.03, type: 'square' }, { freq: 700, at: 0.04, dur: 0.05, type: 'square' }],
  push: [{ freq: 70, at: 0, dur: 0.18, type: 'sawtooth' }, { freq: 95, at: 0.05, dur: 0.14, type: 'square' }],
  cross: [{ freq: 150, at: 0, dur: 0.22, type: 'sine' }, { freq: 330, at: 0.06, dur: 0.2, type: 'sine' }],
  mirror: [{ freq: 880, at: 0, dur: 0.1, type: 'sine' }, { freq: 1175, at: 0.05, dur: 0.14, type: 'sine' }, { freq: 660, at: 0.12, dur: 0.2, type: 'sine' }],
  goal: [
    { freq: 523, at: 0, dur: 0.14, type: 'triangle' },
    { freq: 659, at: 0.14, dur: 0.14, type: 'triangle' },
    { freq: 784, at: 0.28, dur: 0.28, type: 'triangle' },
  ],
};

// The soundscape of each chapter style: a few detuned sine drones, and filtered noise
// whose cutoff drifts slowly. Data only, so it can be tested; the graph is built in Sound.
export const AMBIENCE = Object.freeze({
  threshold: { drones: [110, 165.2], noise: 0.012, cutoff: 700, drift: 0.05, level: 0.5 },
  return: { drones: [98, 147.1, 196.3], noise: 0.016, cutoff: 480, drift: 0.07, level: 0.55 },
  monument: { drones: [55, 82.6, 110.4], noise: 0.02, cutoff: 260, drift: 0.03, level: 0.65 },
  mechanical: { drones: [73.4, 110.2], noise: 0.04, cutoff: 1400, drift: 0.22, level: 0.6 },
  twotruths: { drones: [130.8, 196.4, 131.3], noise: 0.01, cutoff: 900, drift: 0.09, level: 0.5 },
  final: { drones: [55, 110, 165, 220.4], noise: 0.02, cutoff: 520, drift: 0.04, level: 0.7 },
});

// The floor a chapter's style is laid with, and so the sound of walking on it.
export const MATERIALS = Object.freeze({ threshold: 'tile', return: 'stone', monument: 'polished', mechanical: 'grating', twotruths: 'tile', final: 'polished' });
export function floorCue(styleKey) {
  return { stone: 'stepStone', tile: 'stepTile', polished: 'stepPolished', grating: 'stepGrating' }[MATERIALS[styleKey]] ?? 'step';
}

// How a room sounds: reverberation from its size, character from its kind. A cellar is short and dead,
// an atrium long and bright, a corridor a quick flutter.
export function roomAcoustics(size = 1, kind = 'chamber') {
  const k = { chamber: [1, 1, 3200], corridor: [0.7, 0.8, 2600], atrium: [1.7, 1.3, 4200], cellar: [0.55, 0.9, 1400] }[kind] ?? [1, 1, 3200];
  return { decay: Math.min(4.5, (0.5 + 1.5 * size) * k[0]), wet: Math.min(0.5, 0.16 * k[1] * (0.6 + 0.5 * size)), damp: k[2] };
}

// What reaches the listener from the room beyond a doorway. `rel` is the angle between the way the
// listener faces and the door (0 straight ahead, positive to the right). An open doorway lets the next
// room through clearly; a shut gate or a refused one-way passage muffles it, which is how the sound
// tells you the building has changed when a plate lights.
export function neighbourMix({ shut = false, blocked = false, rel = 0, reach = null } = {}) {
  const open = !shut && !blocked;
  let gain = open ? 0.5 : blocked ? 0.07 : 0.14;
  // With a propagation result, everything beyond the doorway counts, not only the next room: a long
  // open enfilade carries more than a single closet, and a deep room behind a shut gate carries nothing.
  if (reach != null) gain = Math.min(0.7, gain * (0.5 + 1.2 * reach));
  const cutoff = open ? 2600 : blocked ? 380 : 520;
  if (Math.cos(rel) < 0) gain *= 0.7; // behind you
  return { gain, cutoff, pan: Math.max(-0.9, Math.min(0.9, Math.sin(rel) * 0.9)) };
}

export const CUE_NAMES = Object.freeze(Object.keys(CUES));

// The notes of a cue: frequency in Hz, start and length in seconds, waveform.
// Unknown names give no notes, so a typo is silent rather than an error.
export function cueSpec(name) {
  return (CUES[name] ?? []).map((n) => ({ ...n }));
}

function clampVolume(v) {
  return Math.min(1, Math.max(0, Number(v) || 0));
}

export class Sound {
  constructor(storage = null) {
    this.storage = storage;
    this.enabled = false;
    this.volume = 1;
    this.ctx = null;
    try {
      this.enabled = storage?.getItem('ia-sound') === 'on';
      const saved = Number(storage?.getItem('ia-volume'));
      if (storage?.getItem('ia-volume') != null && Number.isFinite(saved)) this.volume = clampVolume(saved);
    } catch {
      this.enabled = false;
    }
  }

  // 0 is silent, 1 is the full cue level. Remembered like the on/off switch.
  setVolume(v) {
    this.volume = clampVolume(v);
    this._ambienceLevel();
    try { this.storage?.setItem('ia-volume', String(this.volume)); } catch { /* storage blocked */ }
  }

  setEnabled(on) {
    this.enabled = Boolean(on);
    if (!this.enabled) {
      this._stopAmbience();
      for (const v of this._voices ?? []) { try { v.g.gain.value = 0; } catch { /* ignore */ } }
    } else {
      if (this.ambienceKey) this.setAmbience(this.ambienceKey);
      if (this._neighbours) this.setNeighbours(this._neighbours);
    }
    try { this.storage?.setItem('ia-sound', this.enabled ? 'on' : 'off'); } catch { /* storage blocked */ }
  }

  // Starts (or changes) the chapter's ambience; null stops it. Needs sound on.
  setAmbience(styleKey) {
    this.ambienceKey = styleKey;
    this.floorKey = styleKey;
    if (!this.enabled || !styleKey || !AMBIENCE[styleKey]) { this._stopAmbience(); return; }
    if (this.ambience?.key === styleKey) { this._ambienceLevel(); return; }
    this._stopAmbience();
    try {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return;
      this.ctx ??= new AC();
      if (this.ctx.state === 'suspended') this.ctx.resume?.();
      const spec = AMBIENCE[styleKey];
      const ctx = this.ctx;
      const bus = ctx.createGain();
      bus.gain.value = 0.0001;
      bus.connect(ctx.destination);
      const nodes = [];
      for (const f of spec.drones) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = f;
        g.gain.value = 0.05 / spec.drones.length;
        o.connect(g).connect(bus);
        o.start();
        nodes.push(o);
      }
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      noise.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = spec.cutoff;
      const ng = ctx.createGain();
      ng.gain.value = spec.noise;
      noise.connect(filter).connect(ng).connect(bus);
      noise.start();
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = spec.drift;
      lg.gain.value = spec.cutoff * 0.5;
      lfo.connect(lg).connect(filter.frequency);
      lfo.start();
      nodes.push(noise, lfo);
      this.ambience = { key: styleKey, bus, nodes };
      this._ambienceLevel();
    } catch { /* audio unavailable */ }
  }

  _ambienceLevel() {
    if (!this.ambience) return;
    const spec = AMBIENCE[this.ambience.key];
    const t = this.ctx.currentTime;
    this.ambience.bus.gain.cancelScheduledValues(t);
    this.ambience.bus.gain.linearRampToValueAtTime(Math.max(0.0001, spec.level * this.volume), t + 1.5);
  }

  _stopAmbience() {
    const a = this.ambience;
    if (!a) return;
    this.ambience = null;
    try {
      const t = this.ctx.currentTime;
      a.bus.gain.cancelScheduledValues(t);
      a.bus.gain.linearRampToValueAtTime(0.0001, t + 0.6);
      setTimeout(() => { for (const n of a.nodes) { try { n.stop(); } catch { /* already stopped */ } } a.bus.disconnect(); }, 800);
    } catch { /* ignore */ }
  }

  _context() {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return null;
    this.ctx ??= new AC();
    // Phones often create audio suspended; a cue played from a timer must wake it.
    if (this.ctx.state === 'suspended') this.ctx.resume?.();
    return this.ctx;
  }

  // One shared second of noise, the raw material of every footstep, slide and doorway murmur.
  _noise() {
    const ctx = this.ctx;
    if (this._noiseBuf && this._noiseBuf.sampleRate === ctx.sampleRate) return this._noiseBuf;
    const len = ctx.sampleRate;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._noiseBuf = buf;
    return buf;
  }

  // The output of every cue: a dry path and a send into the current room's reverb.
  _out() {
    const ctx = this.ctx;
    if (this._outBus) return this._outBus;
    const dry = ctx.createGain();
    dry.connect(ctx.destination);
    const send = ctx.createGain();
    send.gain.value = 0;
    let conv = null;
    try {
      conv = ctx.createConvolver();
      send.connect(conv);
      const wet = ctx.createGain();
      conv.connect(wet).connect(ctx.destination);
      this._outBus = { dry, send, conv, wet };
    } catch {
      this._outBus = { dry, send, conv: null, wet: null };
    }
    return this._outBus;
  }

  // Describes the room the listener stands in: reverb length and brightness follow its size and kind.
  setRoom(size, kind) {
    const a = roomAcoustics(size, kind);
    this.room = a;
    if (!this.enabled || !this.ctx || !this._outBus?.conv) return;
    const key = `${a.decay.toFixed(2)}|${a.damp}`;
    if (this._irKey !== key) {
      this._irKey = key;
      const ctx = this.ctx;
      const len = Math.max(1, Math.floor(ctx.sampleRate * a.decay));
      const ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = ir.getChannelData(c);
        let lp = 0;
        const k = Math.min(0.95, a.damp / 8000);
        for (let i = 0; i < len; i++) {
          lp += k * ((Math.random() * 2 - 1) - lp); // roll the highs off as the tail decays
          d[i] = lp * Math.pow(1 - i / len, 3);
        }
      }
      this._outBus.conv.buffer = ir;
    }
    this._outBus.send.gain.setTargetAtTime(a.wet, this.ctx.currentTime, 0.2);
  }

  // The rooms beyond this room's doorways. `list` is [{rel, shut, blocked}], rel the angle from the way
  // the listener faces. Each gets a quiet filtered murmur from its direction; a shut gate dulls it.
  setNeighbours(list) {
    this._neighbours = list;
    if (!this.enabled || !this.ctx) return;
    try {
      const ctx = this.ctx;
      this._voices ??= [];
      const want = Math.min(4, list.length);
      while (this._voices.length < want) {
        const src = ctx.createBufferSource();
        src.buffer = this._noise();
        src.loop = true;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        const g = ctx.createGain();
        g.gain.value = 0;
        let node = g;
        let pan = null;
        if (ctx.createStereoPanner) { pan = ctx.createStereoPanner(); g.connect(pan); node = pan; }
        src.connect(f).connect(g);
        node.connect(ctx.destination);
        src.start();
        this._voices.push({ src, f, g, pan });
      }
      const t = ctx.currentTime;
      this._voices.forEach((v, i) => {
        const n = list[i];
        const m = n ? neighbourMix(n) : { gain: 0, cutoff: 200, pan: 0 };
        v.g.gain.setTargetAtTime(n ? m.gain * 0.012 * this.volume : 0, t, 0.25);
        v.f.frequency.setTargetAtTime(m.cutoff, t, 0.25);
        v.pan?.pan.setTargetAtTime(m.pan, t, 0.25);
      });
    } catch { /* audio unavailable */ }
  }

  // The floor the listener walks on, from the chapter's style.
  setFloor(styleKey) { this.floorKey = styleKey; }

  play(name) {
    if (!this.enabled) return;
    const resolved = name === 'step' && this.floorKey ? floorCue(this.floorKey) : name;
    const notes = cueSpec(resolved);
    if (notes.length === 0) return;
    try {
      const ctx = this._context();
      if (!ctx) return;
      const out = this._out();
      const t0 = ctx.currentTime;
      for (const n of notes) {
        const gain = ctx.createGain();
        const peak = Math.max(0.0001, (n.noise ? 0.3 : 0.12) * this.volume);
        gain.gain.setValueAtTime(0.0001, t0 + n.at);
        gain.gain.exponentialRampToValueAtTime(peak, t0 + n.at + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.dur);
        let src;
        if (n.noise) {
          src = ctx.createBufferSource();
          src.buffer = this._noise();
          const f = ctx.createBiquadFilter();
          f.type = 'bandpass';
          f.frequency.setValueAtTime(n.freq, t0 + n.at);
          if (n.sweep) f.frequency.linearRampToValueAtTime(n.sweep, t0 + n.at + n.dur);
          f.Q.value = n.q ?? 1;
          src.connect(f).connect(gain);
        } else {
          src = ctx.createOscillator();
          src.type = n.type;
          src.frequency.value = n.freq;
          src.connect(gain);
        }
        gain.connect(out.dry);
        gain.connect(out.send);
        src.start(t0 + n.at);
        src.stop(t0 + n.at + n.dur + 0.02);
      }
    } catch {
      // Audio can be unavailable or blocked; the game works without it.
    }
  }
}
