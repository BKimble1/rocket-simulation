/**
 * Camera poses and their smooth combination. A pose is a position, a look-at point, an up
 * vector and a vertical field of view, all absolute (frame I in flight; hangar metres in the
 * hangar), plus an optional secondary up hint used only when the view is nearly vertical.
 *
 * Blending (see blendPose) happens in the subject's local frame: the camera's offset from the
 * subject being moved to (the pivot) is interpolated as a direction (shortest rotation) and a
 * distance (in log space), and the aim turns from the old look-at point to the new one as seen
 * from where the camera is. A camera swinging from one side of a vehicle to the other therefore travels
 * around it at a sensible range instead of cutting a chord through it, and a long pull-back
 * (a ground camera kilometres away to a chase camera tens of metres away) changes range evenly.
 * The field of view is interpolated on log(tan(fov/2)), so the apparent size changes evenly.
 * The final orientation is built once from the blended values (see poseQuaternion), which keeps
 * horizons level through transitions.
 */
import * as THREE from 'three';

export interface CamPose {
  pos: THREE.Vector3;
  target: THREE.Vector3;
  up: THREE.Vector3;
  fov: number;
  /**
   * Screen "up" to use when the view direction is nearly parallel to `up` (looking straight up
   * or down), where the horizon is undefined. Zero length: derived automatically.
   */
  upHint: THREE.Vector3;
}

export const makePose = (): CamPose => ({ pos: new THREE.Vector3(), target: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, 1, 0), fov: 40, upHint: new THREE.Vector3() });

export function copyPose(out: CamPose, a: CamPose): CamPose {
  out.pos.copy(a.pos);
  out.target.copy(a.target);
  out.up.copy(a.up);
  out.fov = a.fov;
  out.upHint.copy(a.upHint);
  return out;
}

/** Plain linear interpolation (tests and simple uses). */
export function lerpPose(a: CamPose, b: CamPose, w: number, out: CamPose): CamPose {
  out.pos.lerpVectors(a.pos, b.pos, w);
  out.target.lerpVectors(a.target, b.target, w);
  out.up.lerpVectors(a.up, b.up, w);
  if (out.up.lengthSq() < 1e-8) out.up.copy(b.up);
  out.up.normalize();
  out.upHint.lerpVectors(a.upHint, b.upHint, w);
  out.fov = a.fov + (b.fov - a.fov) * w;
  return out;
}

const oa = new THREE.Vector3();
const ob = new THREE.Vector3();
const axis = new THREE.Vector3();
const qr = new THREE.Quaternion();
const tgt = new THREE.Vector3();
const aimA = new THREE.Vector3();
const aimB = new THREE.Vector3();

/** Rotate unit vector a toward unit vector b by fraction w of the angle between them (in place into out). */
export function slerpDir(a: THREE.Vector3, b: THREE.Vector3, w: number, out: THREE.Vector3, fallbackAxis?: THREE.Vector3): THREE.Vector3 {
  const d = THREE.MathUtils.clamp(a.dot(b), -1, 1);
  const ang = Math.acos(d);
  if (ang < 1e-6) return out.copy(a);
  axis.crossVectors(a, b);
  if (axis.lengthSq() < 1e-12) {
    // opposite directions: turn about a stable perpendicular axis
    if (fallbackAxis && Math.abs(fallbackAxis.dot(a)) < 0.99) axis.copy(fallbackAxis);
    else axis.set(0, 1, 0).cross(a).lengthSq() > 1e-6 ? axis.set(0, 1, 0).cross(a) : axis.set(1, 0, 0).cross(a);
    axis.addScaledVector(a, -axis.dot(a));
  }
  axis.normalize();
  qr.setFromAxisAngle(axis, ang * w);
  return out.copy(a).applyQuaternion(qr);
}

/**
 * out = blend of a toward b by weight w (0: a, 1: b), in the look-at point's local frame (see the
 * file comment). `pivotUp` is the local vertical used to turn about when a and b look from
 * exactly opposite sides.
 */
export function blendPose(a: CamPose, b: CamPose, w: number, out: CamPose, pivotUp?: THREE.Vector3, pivot?: THREE.Vector3 | null): CamPose {
  if (w <= 0) return copyPose(out, a);
  if (w >= 1) return copyPose(out, b);
  // the camera travels around the pivot (the subject being moved to, when there is one), so it
  // stays at a sensible range from the subject all the way; otherwise around the look-at points
  if (pivot) {
    oa.subVectors(a.pos, pivot);
    ob.subVectors(b.pos, pivot);
    tgt.copy(pivot);
  } else {
    tgt.lerpVectors(a.target, b.target, w);
    oa.subVectors(a.pos, a.target);
    ob.subVectors(b.pos, b.target);
  }
  const la = Math.max(1e-3, oa.length());
  const lb = Math.max(1e-3, ob.length());
  oa.divideScalar(la);
  ob.divideScalar(lb);
  const len = Math.exp(Math.log(la) + (Math.log(lb) - Math.log(la)) * w);
  slerpDir(oa, ob, w, oa, pivotUp ?? b.up);
  out.pos.copy(tgt).addScaledVector(oa, len);
  // aim: from where the camera now is, turn from a's look-at point toward b's by w of the angle
  // (so the new subject enters the frame steadily and the old one leaves it steadily)
  aimA.subVectors(a.target, out.pos);
  aimB.subVectors(b.target, out.pos);
  const da = aimA.length();
  const db = aimB.length();
  if (da > 1e-6 && db > 1e-6) {
    aimA.divideScalar(da);
    aimB.divideScalar(db);
    slerpDir(aimA, aimB, w, aimA, pivotUp ?? b.up);
    out.target.copy(out.pos).addScaledVector(aimA, da + (db - da) * w);
  } else out.target.copy(tgt);
  // up vectors: shortest rotation (both unit)
  slerpDir(a.up, b.up, w, out.up, oa);
  out.up.normalize();
  out.upHint.lerpVectors(a.upHint, b.upHint, w);
  const ta = Math.log(Math.tan((Math.min(170, Math.max(0.01, a.fov)) * Math.PI) / 360));
  const tb = Math.log(Math.tan((Math.min(170, Math.max(0.01, b.fov)) * Math.PI) / 360));
  out.fov = (Math.atan(Math.exp(ta + (tb - ta) * w)) * 360) / Math.PI;
  return out;
}

const m = new THREE.Matrix4();
const dirV = new THREE.Vector3();
const upE = new THREE.Vector3();
const hint = new THREE.Vector3();

/**
 * The up vector actually used for the orientation: `p.up`, except when the view is within about
 * 25° of it (looking nearly straight up or down), where it turns smoothly toward the hint (or,
 * without one, toward the horizontal direction the camera faces), so the picture never spins
 * as the view passes the vertical.
 */
export function effectiveUp(p: CamPose, out: THREE.Vector3): THREE.Vector3 {
  dirV.subVectors(p.target, p.pos);
  const dl = dirV.length();
  if (dl < 1e-9) return out.copy(p.up);
  dirV.divideScalar(dl);
  const c = Math.abs(dirV.dot(p.up));
  const k = smoothstep((c - 0.9) / (0.995 - 0.9));
  if (k <= 0) return out.copy(p.up);
  if (p.upHint.lengthSq() > 1e-6) hint.copy(p.upHint).normalize();
  else {
    // the horizontal direction of view, pointing "away" when looking up and "toward" when looking down
    hint.copy(dirV).addScaledVector(p.up, -dirV.dot(p.up));
    if (hint.lengthSq() < 1e-10) hint.set(1, 0, 0).addScaledVector(p.up, -p.up.x);
    hint.normalize();
    if (dirV.dot(p.up) > 0) hint.negate();
  }
  upE.copy(p.up).multiplyScalar(1 - k).addScaledVector(hint, k);
  if (upE.lengthSq() < 1e-10) upE.copy(hint);
  return out.copy(upE.normalize());
}

const upTmp = new THREE.Vector3();
/** Orientation of a camera at pose (camera looks down its -Z). */
export function poseQuaternion(p: CamPose, out: THREE.Quaternion): THREE.Quaternion {
  // Matrix4.lookAt(eye, target, up) builds a basis whose +Z points from target to eye
  m.lookAt(p.pos, p.target, effectiveUp(p, upTmp));
  return out.setFromRotationMatrix(m);
}

export const smoothstep = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
export const smootherstep = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * t * (t * (t * 6 - 15) + 10);
};
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Frame-rate independent exponential approach factor for a time constant tau (s). */
export const damp = (dt: number, tau: number) => (tau <= 0 ? 1 : 1 - Math.exp(-dt / tau));

/** Vertical fov (deg) that fits a sphere of radius r at distance d with some margin, for an aspect ratio. */
export function fitFov(r: number, d: number, aspect: number, margin = 1.15, min = 8, max = 70): number {
  const half = Math.atan((r * margin) / Math.max(d, r * 1.01));
  // in portrait the horizontal extent is the limiting one
  const v = aspect < 1 ? 2 * Math.atan(Math.tan(half) / aspect) : 2 * half;
  return clamp((v * 180) / Math.PI, min, max);
}

/**
 * Widen a pose's field of view, if needed, so a sphere (centre c, radius r) is inside the frame
 * (vertically, and horizontally for a portrait aspect). Used during transitions so the subject
 * being moved to never leaves the picture while the aim is still turning toward it.
 */
export function keepInView(p: CamPose, c: THREE.Vector3, r: number, aspect: number, maxFov = 75, strength = 1): void {
  dirV.subVectors(p.target, p.pos);
  hint.subVectors(c, p.pos);
  const dist = hint.length();
  if (dist < 1e-6 || dirV.lengthSq() < 1e-12) return;
  const ang = dirV.angleTo(hint) + Math.asin(Math.min(1, r / dist));
  const halfV = aspect < 1 ? Math.atan(Math.tan(ang) / aspect) : ang;
  const need = Math.min(maxFov, ((2 * halfV * 180) / Math.PI) * 1.08);
  if (need > p.fov) p.fov += (need - p.fov) * Math.min(1, Math.max(0, strength));
}

/** Angle (deg) between the view direction of a pose and the direction to a point. */
export function offAxisDeg(p: CamPose, point: THREE.Vector3): number {
  dirV.subVectors(p.target, p.pos).normalize();
  hint.subVectors(point, p.pos);
  if (hint.lengthSq() < 1e-12) return 0;
  return (dirV.angleTo(hint) * 180) / Math.PI;
}
