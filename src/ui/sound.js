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
    if (!this.enabled) this._stopAmbience(); else if (this.ambienceKey) this.setAmbience(this.ambienceKey);
    try { this.storage?.setItem('ia-sound', this.enabled ? 'on' : 'off'); } catch { /* storage blocked */ }
  }

  // Starts (or changes) the chapter's ambience; null stops it. Needs sound on.
  setAmbience(styleKey) {
    this.ambienceKey = styleKey;
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

  play(name) {
    if (!this.enabled) return;
    const notes = cueSpec(name);
    if (notes.length === 0) return;
    try {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return;
      this.ctx ??= new AC();
      // Phones often create audio suspended; a cue played from a timer must wake it.
      if (this.ctx.state === 'suspended') this.ctx.resume?.();
      const t0 = this.ctx.currentTime;
      for (const n of notes) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = n.type;
        osc.frequency.value = n.freq;
        gain.gain.setValueAtTime(0.0001, t0 + n.at);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, 0.12 * this.volume), t0 + n.at + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.dur);
        osc.connect(gain).connect(this.ctx.destination);
        osc.start(t0 + n.at);
        osc.stop(t0 + n.at + n.dur + 0.02);
      }
    } catch {
      // Audio can be unavailable or blocked; the game works without it.
    }
  }
}
