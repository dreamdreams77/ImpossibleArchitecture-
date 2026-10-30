import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Matrix4, Vector3, PerspectiveCamera } from '../src/vendor/three/three.module.js';
import {
  FACES, doorFrame, portalLocalTransform, geometricArrivalHeading, headingYaw, yawHeading,
  directionOfYaw, yawOfDirection, yawDelta, arrivalTurn, clipPlaneFor, obliqueProjection, halfWidth,
} from '../src/render3d/frames.js';
import { Structure, rotateFace } from '../src/topology/graph.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const origin = (m) => new Vector3().setFromMatrixPosition(m);

test('every doorway centre maps onto its partner doorway centre', () => {
  for (const fa of FACES) for (const fb of FACES) for (const mirror of [false, true]) {
    const T = portalLocalTransform({ faceA: fa, halfA: 4, faceB: fb, halfB: 6, mirror });
    const mapped = origin(doorFrame(fa, 4)).applyMatrix4(T);
    const want = origin(doorFrame(fb, 6));
    assert.ok(mapped.distanceTo(want) < 1e-9, `${fa}->${fb} m${mirror}`);
  }
});

test('geometry agrees with the engine entry heading for every face pair, turn and mirror', () => {
  let checked = 0;
  for (const fa of FACES) for (const fb of FACES) for (const turns of [0, 1, 2, 3]) for (const mirror of [false, true]) {
    const s = new Structure();
    s.addRoom({ id: 'a', x: 0, y: 0 });
    s.addRoom({ id: 'b', x: 5, y: 0 });
    s.addPortal({ a: 'a', aFace: fa, b: 'b', bFace: fb, transform: { turns, mirror } });
    const engine = s.exit('a', fa).entryHeading;
    const T = portalLocalTransform({ faceA: fa, halfA: 4, faceB: fb, halfB: 4, mirror });
    const geo = geometricArrivalHeading(fa, T);
    // The geometry looks straight into the room; the engine adds the quarter turns and the mirror reflection.
    const reflect = { N: 'N', S: 'S', E: 'W', W: 'E' };
    const turned = rotateFace(geo, turns);
    assert.equal(mirror ? reflect[turned] : turned, engine, `${fa}->${fb} turns ${turns} mirror ${mirror}`);
    assert.equal(yawHeading(headingYaw(geo) + arrivalTurn(turns)), turned);
    checked++;
  }
  assert.equal(checked, 128);
});

test('chained crossings compose: A->B->C equals the matrix product', () => {
  const t1 = portalLocalTransform({ faceA: 'E', halfA: 4, faceB: 'W', halfB: 4 });
  const t2 = portalLocalTransform({ faceA: 'N', halfA: 4, faceB: 'S', halfB: 4, mirror: true });
  const p = new Vector3(1.3, 1.6, -0.7);
  const stepwise = p.clone().applyMatrix4(t1).applyMatrix4(t2);
  const composed = p.clone().applyMatrix4(new Matrix4().multiplyMatrices(t2, t1));
  assert.ok(stepwise.distanceTo(composed) < 1e-9);
});

test('a transform has an inverse that returns every point', () => {
  const t = portalLocalTransform({ faceA: 'S', halfA: 3, faceB: 'E', halfB: 6, mirror: true });
  const p = new Vector3(-2, 1.2, 0.4);
  const back = p.clone().applyMatrix4(t).applyMatrix4(t.clone().invert());
  assert.ok(back.distanceTo(p) < 1e-9);
});

test('a plain portal is a rigid motion; a mirror reverses handedness', () => {
  const rigid = portalLocalTransform({ faceA: 'E', halfA: 4, faceB: 'W', halfB: 4 });
  const mirrored = portalLocalTransform({ faceA: 'E', halfA: 4, faceB: 'W', halfB: 4, mirror: true });
  near(rigid.determinant(), 1);
  near(mirrored.determinant(), -1);
});

test('a self-loop with a quarter turn returns to its heading after four trips', () => {
  // Going round a room-to-itself passage whose arrival turns you one quarter, four times, is the identity.
  let yaw = headingYaw('N');
  for (let i = 0; i < 4; i++) yaw += arrivalTurn(1);
  assert.equal(yawHeading(yaw), 'N');
  yaw = headingYaw('N');
  for (let i = 0; i < 2; i++) yaw += arrivalTurn(2);
  assert.equal(yawHeading(yaw), 'N');
});

test('yaw and heading round-trip', () => {
  for (const h of ['N', 'E', 'S', 'W']) {
    assert.equal(yawHeading(headingYaw(h)), h);
    const d = directionOfYaw(headingYaw(h));
    assert.equal(yawHeading(yawOfDirection(d)), h);
  }
  near(yawDelta(0.1, Math.PI * 2 - 0.1), -0.2);
  near(yawDelta(headingYaw('N'), headingYaw('W')), Math.PI / 2);
});

test('oblique clipping puts the near plane on the doorway surface', () => {
  const cam = new PerspectiveCamera(70, 1.5, 0.05, 100);
  // A camera standing behind room B's north door looking in.
  const frame = doorFrame('N', 4);
  const camWorld = frame.clone().multiply(new Matrix4().makeTranslation(0, 1.6, 3));
  const plane = clipPlaneFor(frame);
  assert.ok(plane.distanceToPoint(new Vector3(0, 1, -2)) > 0, 'room interior is on the kept side');
  assert.ok(plane.distanceToPoint(new Vector3(0, 1, -10)) < 0, 'outside the north wall is clipped');
  const before = cam.projectionMatrix.clone();
  obliqueProjection(cam.projectionMatrix, camWorld, plane);
  assert.ok(!cam.projectionMatrix.equals(before));
  assert.ok(Number.isFinite(cam.projectionMatrix.elements[10]));
});

test('half widths scale with room size', () => {
  assert.equal(halfWidth(0.75), 3);
  assert.equal(halfWidth(1), 4);
  assert.equal(halfWidth(1.5), 6);
});
