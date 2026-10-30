// Camera presentation for the moments that matter: a discovery, a completed challenge.
//
// A shot is a short, gentle offset applied on top of the player's own view (a slow rise, a lifted gaze,
// a widening of the field of view) that eases in, holds, and eases out, handing the view back exactly
// as it was. It never replaces the camera and never takes control: any input ends it at once, it
// does nothing under reduced motion or when switched off, and it only plays while walking. The shots are
// pure functions of time, so they are tested; the Presentation object just keeps the clock.

const smooth = (x) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

// Easing envelope: 0 -> 1 over `inT`, hold, 1 -> 0 over `outT`. Zero at both ends and beyond.
export function envelope(t, inT, hold, outT) {
  if (t <= 0 || t >= inT + hold + outT) return 0;
  if (t < inT) return smooth(t / inT);
  if (t < inT + hold) return 1;
  return 1 - smooth((t - inT - hold) / outT);
}

export const SHOTS = Object.freeze({
  // Something understood: the eye lifts a little and the room opens up.
  discovery: { duration: 3.2, offsets: (t) => { const e = envelope(t, 0.9, 1.0, 1.3); return { height: 0.32 * e, pitch: 0.1 * e, yaw: 0.05 * Math.sin(t * 0.9) * e, fov: 9 * e }; } },
  // A challenge finished: a slower, wider pull back from the doorway you came through.
  complete: { duration: 4.4, offsets: (t) => { const e = envelope(t, 1.3, 1.4, 1.7); return { height: 0.55 * e, pitch: 0.17 * e, yaw: 0.09 * Math.sin(t * 0.6) * e, fov: 14 * e }; } },
  // A crossing that turned or reflected you: a short widening that settles.
  transform: { duration: 0.9, offsets: (t) => { const e = envelope(t, 0.18, 0.1, 0.62); return { height: 0, pitch: 0, yaw: 0, fov: 6 * e }; } },
});

export const NO_OFFSET = Object.freeze({ height: 0, pitch: 0, yaw: 0, fov: 0 });

export class Presentation {
  constructor({ enabled = true, reduceMotion = false } = {}) {
    this.enabled = enabled;
    this.reduceMotion = reduceMotion;
    this.shot = null;
    this.t = 0;
  }

  // Starts a shot. Returns false (and plays nothing) when presentation is off, motion is reduced or the
  // name is unknown. A long shot is not interrupted by a short one.
  play(name) {
    const shot = SHOTS[name];
    if (!shot || !this.enabled || this.reduceMotion) return false;
    if (this.shot && this.shot.duration - this.t > shot.duration) return false;
    this.shot = shot;
    this.t = 0;
    return true;
  }

  // Any input from the player ends the shot immediately: agency is never taken.
  cancel() { this.shot = null; this.t = 0; }

  get active() { return this.shot != null; }

  // Advances the clock and returns the current offsets.
  update(dt) {
    if (!this.shot) return NO_OFFSET;
    this.t += dt;
    if (this.t >= this.shot.duration) { this.cancel(); return NO_OFFSET; }
    return this.shot.offsets(this.t);
  }
}
