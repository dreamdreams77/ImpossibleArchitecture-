// Spatial frames for the 3D renderer. Pure maths: no GL, no DOM.
//
// Every room is modelled in its own local frame: origin at the floor centre,
// +y up, north is -z, east is +x. A doorway sits in the middle of a face. Its
// frame has its origin on the *portal surface* (the outer plane of the wall's
// thickness), +z pointing out of the room, +y up.
//
// A portal joins doorway A to doorway B. Crossing it maps room-A-local space
// onto room-B-local space by
//
//     T = FB . Ry(pi) . S . FA^-1
//
// FA, FB are the doorway frames, S flips the doorway's x axis when the portal
// mirrors, and Ry(pi) is the half-turn that carries a traveller from leaving A
// to entering B. A doorway is always a straight window onto the room beyond.
// Quarter turns do not bend that window; they turn the *traveller* as they pass
// through, like a revolving door, which is what `Structure.exit` records:
// entryHeading = rotateFace(opposite(dest.face), turns), reflected east-west if
// mirrored. `arrivalTurn` gives that turn as a yaw so the walker can apply it.
// Nothing here decides topology; it only gives the graph a geometry to be
// drawn and walked in.

import { Matrix4, Vector3, Vector4, Plane } from '../vendor/three/three.module.js';

export const WALL_T = 0.45; // wall thickness, outside the room's interior footprint
export const DOOR_W = 2.4;
export const DOOR_H = 3.15;

// Outward unit normals. North is up the plan, which is -z in the room frame.
export const FACE_NORMAL = Object.freeze({
  N: Object.freeze([0, 0, -1]),
  E: Object.freeze([1, 0, 0]),
  S: Object.freeze([0, 0, 1]),
  W: Object.freeze([-1, 0, 0]),
});
export const FACES = ['N', 'E', 'S', 'W'];

// Interior half-extent of a room of a given plan size (1 is standard).
export function halfWidth(size = 1) {
  return 4 * size;
}

// Yaw of a camera looking along a compass heading. Yaw 0 looks north (-z) and
// a positive yaw turns anticlockwise seen from above.
export function headingYaw(heading) {
  switch (heading) {
    case 'N': return 0;
    case 'E': return -Math.PI / 2;
    case 'S': return Math.PI;
    case 'W': return Math.PI / 2;
    default: throw new Error(`Unknown heading ${heading}`);
  }
}

// The compass heading nearest to a yaw.
export function yawHeading(yaw) {
  const q = ((Math.round(-yaw / (Math.PI / 2)) % 4) + 4) % 4; // 0 N, 1 E, 2 S, 3 W
  return ['N', 'E', 'S', 'W'][q];
}

export function directionOfYaw(yaw, out = new Vector3()) {
  return out.set(-Math.sin(yaw), 0, -Math.cos(yaw));
}

export function yawOfDirection(dir) {
  return Math.atan2(-dir.x, -dir.z);
}

// Smallest signed difference between two yaws, in (-pi, pi].
export function yawDelta(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

// Doorway frame in room-local space (origin on the portal surface).
export function doorFrame(face, half, out = new Matrix4()) {
  const n = FACE_NORMAL[face];
  const dist = half + WALL_T;
  const theta = Math.atan2(n[0], n[2]); // Ry(theta) . +z = n
  out.makeRotationY(theta);
  out.setPosition(n[0] * dist, 0, n[2] * dist);
  return out;
}

// Room-A-local -> room-B-local across one crossing.
export function portalLocalTransform({ faceA, halfA, faceB, halfB, mirror = false }) {
  const fa = doorFrame(faceA, halfA);
  const fb = doorFrame(faceB, halfB);
  const m = new Matrix4().makeRotationY(Math.PI);
  if (mirror) m.multiply(new Matrix4().makeScale(-1, 1, 1));
  return fb.multiply(m).multiply(fa.invert());
}

// Outward normal of a face as a Vector3.
export function faceNormal(face, out = new Vector3()) {
  const n = FACE_NORMAL[face];
  return out.set(n[0], n[1], n[2]);
}

// Applies a transform to a direction (ignores translation).
export function transformDirection(m, dir, out = new Vector3()) {
  return out.copy(dir).transformDirection(m);
}

// The yaw a passage with `turns` quarter turns adds to a traveller crossing it.
// Positive quarter turns are clockwise seen from above, and a positive yaw is
// anticlockwise, hence the sign.
export function arrivalTurn(turns) {
  return -turns * (Math.PI / 2);
}

// The heading a traveller faces on straight arrival, as the geometry sees it:
// directly into the room. The engine's entry heading is this heading turned by
// the portal's quarter turns and, for a mirrored passage, reflected east-west.
// The walker finishes every crossing at the engine's heading, so the engine
// stays authoritative; this function exists so tests can pin the two together.
export function geometricArrivalHeading(faceA, local) {
  const d = transformDirection(local, faceNormal(faceA));
  return yawHeading(yawOfDirection(d));
}

// The plane (in world space) a portal's far side must clip against: the
// destination doorway's surface, with the normal pointing into the room.
export function clipPlaneFor(destFrameWorld) {
  const origin = new Vector3().setFromMatrixPosition(destFrameWorld);
  const outward = new Vector3(0, 0, 1).transformDirection(destFrameWorld);
  return new Plane().setFromNormalAndCoplanarPoint(outward.negate(), origin);
}

// The plane on a doorway's surface whose positive side is *beyond* it: out of the
// room the doorway belongs to. Used to clip a destination room placed behind it.
export function planeBeyond(frameWorld) {
  const origin = new Vector3().setFromMatrixPosition(frameWorld);
  const outward = new Vector3(0, 0, 1).transformDirection(frameWorld);
  return new Plane().setFromNormalAndCoplanarPoint(outward, origin);
}

// Replaces the near plane of `projection` with `plane` (Lengyel's oblique
// near-plane clipping). `cameraWorld` is the camera's world matrix.
// Geometry on the plane's positive side survives.
const _clip = new Vector4();
const _q = new Vector4();
const _inv = new Matrix4();
export function obliqueProjection(projection, cameraWorld, plane) {
  _inv.copy(cameraWorld).invert();
  const viewPlane = plane.clone().applyMatrix4(_inv);
  _clip.set(viewPlane.normal.x, viewPlane.normal.y, viewPlane.normal.z, viewPlane.constant);
  const p = projection.elements;
  _q.x = (Math.sign(_clip.x) + p[8]) / p[0];
  _q.y = (Math.sign(_clip.y) + p[9]) / p[5];
  _q.z = -1;
  _q.w = (1 + p[10]) / p[14];
  _clip.multiplyScalar(2 / _clip.dot(_q));
  p[2] = _clip.x;
  p[6] = _clip.y;
  p[10] = _clip.z + 1.0 - 0.003;
  p[14] = _clip.w;
  return projection;
}
