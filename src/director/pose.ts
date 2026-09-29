/**
 * Camera poses and their smooth combination. A pose is a position, a look-at point, an up
 * vector and a vertical field of view, all absolute (frame I in flight; hangar metres in the
 * hangar). Blending look-at points (rather than orientations) keeps horizons level through
 * transitions; the final orientation is built once from the blended values.
 */
import * as THREE from 'three';

export interface CamPose {
  pos: THREE.Vector3;
  target: THREE.Vector3;
  up: THREE.Vector3;
  fov: number;
}

export const makePose = (): CamPose => ({ pos: new THREE.Vector3(), target: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, 1, 0), fov: 40 });

export function copyPose(out: CamPose, a: CamPose): CamPose {
  out.pos.copy(a.pos);
  out.target.copy(a.target);
  out.up.copy(a.up);
  out.fov = a.fov;
  return out;
}

/** out = a + (b - a) * w, with the up vector renormalised. */
export function lerpPose(a: CamPose, b: CamPose, w: number, out: CamPose): CamPose {
  out.pos.lerpVectors(a.pos, b.pos, w);
  out.target.lerpVectors(a.target, b.target, w);
  out.up.lerpVectors(a.up, b.up, w);
  if (out.up.lengthSq() < 1e-8) out.up.copy(b.up);
  out.up.normalize();
  out.fov = a.fov + (b.fov - a.fov) * w;
  return out;
}

const m = new THREE.Matrix4();
/** Orientation of a camera at pose (camera looks down its -Z). */
export function poseQuaternion(p: CamPose, out: THREE.Quaternion): THREE.Quaternion {
  // Matrix4.lookAt(eye, target, up) builds a basis whose +Z points from target to eye
  m.lookAt(p.pos, p.target, p.up);
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
