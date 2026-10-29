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
  goal: [
    { freq: 523, at: 0, dur: 0.14, type: 'triangle' },
    { freq: 659, at: 0.14, dur: 0.14, type: 'triangle' },
    { freq: 784, at: 0.28, dur: 0.28, type: 'triangle' },
  ],
};

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
    try { this.storage?.setItem('ia-volume', String(this.volume)); } catch { /* storage blocked */ }
  }

  setEnabled(on) {
    this.enabled = Boolean(on);
    try { this.storage?.setItem('ia-sound', this.enabled ? 'on' : 'off'); } catch { /* storage blocked */ }
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
