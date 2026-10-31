// The walker: the traveller's body in the 3D view. The engine's traveller moves
// in discrete steps (room, heading). The walker turns each step into continuous
// motion: it strides to the doorway, crosses the portal, and walks to the middle
// of the room beyond, turning as the passage turns it. It always ends exactly at
// the engine's room and heading, so the engine stays authoritative; the walker
// only chooses how to arrive.
//
// Crossing a portal applies the same room-to-room transform the renderer uses to
// draw the view through the doorway, so the picture does not jump when the
// walker passes through it.

import { Vector3 } from '../vendor/three/three.module.js';
import {
  doorFrame, portalLocalTransform, headingYaw, yawDelta, yawOfDirection, directionOfYaw,
  FACE_NORMAL, WALL_T,
} from './frames.js';

export const EYE = 1.65;
const easeIn = (t) => t * t;
const easeOut = (t) => 1 - (1 - t) * (1 - t);
const smooth = (t) => t * t * (3 - 2 * t);

export class Walker {
  constructor({ speed = 6.5 } = {}) {
    this.speed = speed;
    this.room = null;
    this.x = 0;
    this.z = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.dragging = false;
    this.queue = [];
    this.bob = 0;
    this.key = null;
    this.last = null;
    this.reduceMotion = false;
    this.bobOn = true;
  }

  get busy() {
    return this.queue.length > 0;
  }

  // Put the walker at rest in the middle of a room, facing a heading.
  snap(room, heading, mirrored = this.mirrored ?? false) {
    this.room = room;
    this.mirrored = !!mirrored;
    this.x = 0;
    this.z = 0;
    this.yaw = headingYaw(heading);
    this.queue = [];
    this.pitch = 0;
  }

  // Finish whatever is playing at once.
  finish() {
    while (this.queue.length) this._advance(Infinity);
  }

  // The engine's state changed. `state` is { room, heading, steps }. `halfOf(id)`
  // gives a room's interior half-width. Animates when the change is a turn or a
  // single step the structure explains; otherwise snaps.
  sync(structure, state, halfOf) {
    if (!state) return;
    if (state.cell) { this._syncBody(structure, state, halfOf); return; }
    const key = `${state.room}|${state.heading}|${state.steps ?? 0}`;
    if (key === this.key) return;
    const prev = this.last;
    this.key = key;
    this.last = { room: state.room, heading: state.heading, steps: state.steps ?? 0 };
    if (!prev || this.room == null || this.reduceMotion) {
      this.snap(state.room, state.heading, state.mirrored);
      return;
    }
    this.finish();
    if (prev.room === state.room && prev.steps === this.last.steps) {
      // A turn in place (or a no-op).
      if (prev.heading === state.heading) return;
      const target = this.yaw + yawDelta(this.yaw, headingYaw(state.heading));
      this.queue.push({ room: state.room, to: { x: this.x, z: this.z, yaw: target }, dur: 0.32, ease: smooth });
      return;
    }
    // A step: it must be one the engine could take from where the walker stood. The
    // heading the walker faced is tried first; a route replay turns and steps in one tick.
    let face = null;
    let exit = null;
    if (this.last.steps === prev.steps + 1) {
      for (const f of [prev.heading, 'N', 'E', 'S', 'W']) {
        const e = structure.exit(prev.room, f);
        if (e && !e.blocked && e.room === state.room && e.entryHeading === state.heading) { face = f; exit = e; break; }
      }
    }
    if (exit) this._planStep(face, prev, exit, state, halfOf);
    else this.snap(state.room, state.heading, state.mirrored);
  }

  // ---- physical play: the body moves a cell at a time --------------------------------------
  // `state` carries { room, cell, heading, steps, lastDir }. The cell centre is the walker's
  // resting place; a step across a doorway crosses the portal exactly as a plain step does.
  _syncBody(structure, state, halfOf) {
    const key = `${state.room}|${state.cell}|${state.heading}|${state.steps}`;
    if (key === this.key) return;
    const prev = this.last;
    this.key = key;
    this.last = { room: state.room, heading: state.heading, steps: state.steps, cell: [...state.cell] };
    const at = (room, cell) => {
      const n = Math.round(halfOf(room) * 2);
      return [cell[0] + 0.5 - n / 2, cell[1] + 0.5 - n / 2];
    };
    const [tx, tz] = at(state.room, state.cell);
    if (!prev || this.room == null || this.reduceMotion || !prev.cell) {
      this.snap(state.room, state.heading, state.mirrored);
      this.x = tx; this.z = tz;
      return;
    }
    this.finish();
    if (state.steps === prev.steps) { // a turn on the spot
      const target = this.yaw + yawDelta(this.yaw, headingYaw(state.heading));
      this.queue.push({ room: state.room, to: { x: this.x, z: this.z, yaw: target }, dur: 0.22, ease: smooth });
      return;
    }
    if (state.steps !== prev.steps + 1) { this.snap(state.room, state.heading, state.mirrored); this.x = tx; this.z = tz; return; }
    if (state.room === prev.room) { // one cell, keeping the way the body faces
      this.queue.push({ room: state.room, to: { x: tx, z: tz, yaw: this.yaw }, dur: 0.17, ease: smooth, move: true });
      return;
    }
    // Through a doorway: out along the door's line to the portal surface, across, in to the cell.
    const face = state.lastDir;
    const exit = face && structure.exit(prev.room, face);
    if (!exit || exit.room !== state.room) { this.snap(state.room, state.heading, state.mirrored); this.x = tx; this.z = tz; return; }
    const hA = halfOf(prev.room); const hB = halfOf(state.room);
    const n = FACE_NORMAL[face];
    const reach = hA + WALL_T;
    const along = n[0] !== 0 ? this.z : this.x; // the coordinate along the doorway, kept while crossing
    const doorX = n[0] !== 0 ? n[0] * reach : along;
    const doorZ = n[2] !== 0 ? n[2] * reach : along;
    const T = portalLocalTransform({ faceA: face, halfA: hA, faceB: exit.face, halfB: hB, mirror: !!exit.transform.mirror });
    const facing = this.yaw;
    this.queue.push({ room: prev.room, to: { x: doorX, z: doorZ, yaw: facing }, dur: 0.2, ease: easeIn, move: true });
    this.queue.push({
      cross: true,
      apply: () => {
        const p = new Vector3(this.x, 0, this.z).applyMatrix4(T);
        const dir = directionOfYaw(this.yaw).transformDirection(T);
        this.room = state.room; this.x = p.x; this.z = p.z; this.yaw = yawOfDirection(dir);
      },
      mirror: !!exit.transform.mirror,
      turns: exit.transform.turns ?? 0,
    });
    this.queue.push({ room: state.room, to: { x: tx, z: tz, yaw: null, finalHeading: state.heading }, dur: 0.25 + (exit.transform.turns ? 0.15 : 0), ease: easeOut, move: true });
  }

  _planStep(face, prev, exit, state, halfOf) {
    const hA = halfOf(prev.room);
    const hB = halfOf(state.room);
    const n = FACE_NORMAL[face];
    const reach = hA + WALL_T;
    const doorX = n[0] * reach;
    const doorZ = n[2] * reach;
    const faceYaw = headingYaw(face);
    const lookTo = this.yaw + yawDelta(this.yaw, faceYaw);
    const d1 = Math.hypot(doorX - this.x, doorZ - this.z);
    const T = portalLocalTransform({
      faceA: face, halfA: hA, faceB: exit.face, halfB: hB, mirror: !!exit.transform.mirror,
    });
    // Seg 1: stride to the doorway, ending facing it.
    this.queue.push({ room: prev.room, to: { x: doorX, z: doorZ, yaw: lookTo }, dur: Math.max(0.25, d1 / this.speed), ease: easeIn, move: true });
    // Crossing: carry position and heading through the portal's transform.
    this.queue.push({
      cross: true,
      apply: () => {
        const p = new Vector3(this.x, 0, this.z).applyMatrix4(T);
        const dir = directionOfYaw(this.yaw).transformDirection(T);
        this.room = state.room;
        this.x = p.x;
        this.z = p.z;
        this.yaw = yawOfDirection(dir);
      },
      mirror: !!exit.transform.mirror,
      turns: exit.transform.turns ?? 0,
    });
    // Seg 2: walk in to the middle of the room, turning to the engine's heading.
    const inward = doorFrame(exit.face, hB);
    const sx = inward.elements[12];
    const sz = inward.elements[14];
    const d2 = Math.hypot(sx, sz);
    this.queue.push({
      room: state.room,
      to: { x: 0, z: 0, yaw: null, finalHeading: state.heading },
      dur: Math.max(0.3, d2 / this.speed) + (exit.transform.turns ? 0.2 : 0),
      ease: easeOut,
      move: true,
    });
  }

  // A bump against a wall or a shut gate: a short lunge and recoil.
  bump(heading) {
    this.finish();
    const n = FACE_NORMAL[heading];
    const d = 0.55;
    this.queue.push({ room: this.room, to: { x: this.x + n[0] * d, z: this.z + n[2] * d, yaw: this.yaw }, dur: 0.12, ease: easeOut });
    this.queue.push({ room: this.room, to: { x: this.x, z: this.z, yaw: this.yaw }, dur: 0.26, ease: smooth });
  }

  // Free look: a gentle offset from the heading, restored when released.
  look(dYaw, dPitch) {
    this.lookYaw = Math.max(-1.1, Math.min(1.1, this.lookYaw + dYaw));
    this.lookPitch = Math.max(-0.5, Math.min(0.5, this.lookPitch + dPitch));
  }

  // Advance time. Returns the crossing events that happened, for sound and effects.
  update(dt) {
    const events = [];
    this._advance(dt, events);
    if (!this.dragging) {
      const k = 1 - Math.exp(-dt * 4);
      this.lookYaw -= this.lookYaw * k;
      this.lookPitch -= this.lookPitch * k;
    }
    return events;
  }

  _advance(dt, events = []) {
    let left = dt;
    while (this.queue.length) {
      const seg = this.queue[0];
      if (seg.cross) {
        seg.apply();
        // A mirrored crossing reflects the traveller: from here the view is the mirror image.
        if (seg.mirror) this.mirrored = !this.mirrored;
        events.push({ type: 'cross', mirror: seg.mirror, turns: seg.turns });
        this.queue.shift();
        continue;
      }
      if (seg.t == null) {
        seg.t = 0;
        seg.from = { x: this.x, z: this.z, yaw: this.yaw };
        if (seg.to.finalHeading) {
          seg.to = { ...seg.to, yaw: this.yaw + yawDelta(this.yaw, headingYaw(seg.to.finalHeading)) };
          // Keep the turn continuous: a quarter-turn passage turns the walker the long way round only if it must.
        }
      }
      const step = Math.min(left, seg.dur - seg.t);
      seg.t += step;
      left -= step;
      const k = seg.ease(Math.min(1, seg.t / seg.dur));
      this.x = seg.from.x + (seg.to.x - seg.from.x) * k;
      this.z = seg.from.z + (seg.to.z - seg.from.z) * k;
      this.yaw = seg.from.yaw + (seg.to.yaw - seg.from.yaw) * k;
      if (seg.move) this.bob += step * 9;
      if (seg.t >= seg.dur - 1e-9) {
        this.x = seg.to.x;
        this.z = seg.to.z;
        this.yaw = seg.to.yaw;
        this.queue.shift();
        if (left <= 0 && Number.isFinite(dt) && !this.queue[0]?.cross) break;
      } else break;
    }
  }

  pose() {
    const moving = this.queue.length > 0 && this.queue.some((s) => s.move);
    const bob = moving && this.bobOn ? Math.sin(this.bob) * 0.028 : 0;
    return { room: this.room, pos: [this.x, EYE + bob, this.z], yaw: this.yaw + this.lookYaw, pitch: this.pitch + this.lookPitch, mirrored: !!this.mirrored };
  }
}
