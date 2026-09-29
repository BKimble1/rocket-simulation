/**
 * Small double-precision vector and quaternion helpers for the trajectory model. Plain objects
 * and pure functions (no three.js in the inner loops): the reference trajectory is computed
 * once per mission and must be bit-identical on every run, so nothing here has hidden state.
 */

export interface V3 {
  x: number;
  y: number;
  z: number;
}

/** Quaternion (x, y, z, w), unit length, rotating the body model frame into frame I. */
export interface Q {
  x: number;
  y: number;
  z: number;
  w: number;
}

export const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z });
export const vclone = (a: V3): V3 => ({ x: a.x, y: a.y, z: a.z });
export const vadd = (a: V3, b: V3): V3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const vsub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const vscale = (a: V3, s: number): V3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
/** a + b * s */
export const vadds = (a: V3, b: V3, s: number): V3 => ({ x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s });
export const vdot = (a: V3, b: V3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const vcross = (a: V3, b: V3): V3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
export const vlen = (a: V3): number => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
export const vlen2 = (a: V3): number => a.x * a.x + a.y * a.y + a.z * a.z;
export const vdist = (a: V3, b: V3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export function vnorm(a: V3): V3 {
  const l = vlen(a);
  return l > 0 ? { x: a.x / l, y: a.y / l, z: a.z / l } : { x: 0, y: 0, z: 0 };
}
export const vlerp = (a: V3, b: V3, u: number): V3 => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u });
/** Component of a perpendicular to the unit vector n. */
export const vperp = (a: V3, n: V3): V3 => vadds(a, n, -vdot(a, n));
/** Angle between two vectors (rad). */
export function vangle(a: V3, b: V3): number {
  return Math.atan2(vlen(vcross(a, b)), vdot(a, b));
}
/** Rotate v about the unit axis k by angle a (Rodrigues). */
export function vrotate(v: V3, k: V3, a: number): V3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const kxv = vcross(k, v);
  const kdv = vdot(k, v);
  return { x: v.x * c + kxv.x * s + k.x * kdv * (1 - c), y: v.y * c + kxv.y * s + k.y * kdv * (1 - c), z: v.z * c + kxv.z * s + k.z * kdv * (1 - c) };
}

// ───────────────────────────── quaternions ─────────────────────────────

export const qident = (): Q => ({ x: 0, y: 0, z: 0, w: 1 });
export const qclone = (q: Q): Q => ({ x: q.x, y: q.y, z: q.z, w: q.w });

export function qmul(a: Q, b: Q): Q {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

export const qconj = (q: Q): Q => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });

export function qnorm(q: Q): Q {
  const l = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
  return { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l };
}

export function qaxis(axis: V3, angle: number): Q {
  const h = angle / 2;
  const s = Math.sin(h);
  const n = vnorm(axis);
  return { x: n.x * s, y: n.y * s, z: n.z * s, w: Math.cos(h) };
}

/** Rotate a vector by a unit quaternion. */
export function qrot(q: Q, v: V3): V3 {
  // t = 2 q.xyz × v ; v' = v + w t + q.xyz × t
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return {
    x: v.x + q.w * tx + (q.y * tz - q.z * ty),
    y: v.y + q.w * ty + (q.z * tx - q.x * tz),
    z: v.z + q.w * tz + (q.x * ty - q.y * tx),
  };
}

/** Body +Y (the vehicle axis toward the nose) in frame I. */
export const qaxisY = (q: Q): V3 => qrot(q, { x: 0, y: 1, z: 0 });
export const qaxisX = (q: Q): V3 => qrot(q, { x: 1, y: 0, z: 0 });
export const qaxisZ = (q: Q): V3 => qrot(q, { x: 0, y: 0, z: 1 });

/** Quaternion from an orthonormal basis given as the images of body X, Y, Z. */
export function qfromBasis(X: V3, Y: V3, Z: V3): Q {
  const m00 = X.x, m01 = Y.x, m02 = Z.x;
  const m10 = X.y, m11 = Y.y, m12 = Z.y;
  const m20 = X.z, m21 = Y.z, m22 = Z.z;
  const tr = m00 + m11 + m22;
  let q: Q;
  if (tr > 0) {
    const s = 0.5 / Math.sqrt(tr + 1);
    q = { w: 0.25 / s, x: (m21 - m12) * s, y: (m02 - m20) * s, z: (m10 - m01) * s };
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    q = { w: (m21 - m12) / s, x: 0.25 * s, y: (m01 + m10) / s, z: (m02 + m20) / s };
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    q = { w: (m02 - m20) / s, x: (m01 + m10) / s, y: 0.25 * s, z: (m12 + m21) / s };
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    q = { w: (m10 - m01) / s, x: (m02 + m20) / s, y: (m12 + m21) / s, z: 0.25 * s };
  }
  return qnorm(q);
}

/**
 * Attitude whose body +Y points along `nose` and whose body +Z lies as close as possible to
 * `side` (the roll reference). Falls back to a perpendicular when they are parallel.
 */
export function qlook(nose: V3, side: V3): Q {
  const Y = vnorm(nose);
  let Z = vperp(side, Y);
  if (vlen2(Z) < 1e-12) {
    const alt = Math.abs(Y.x) < 0.9 ? v3(1, 0, 0) : v3(0, 1, 0);
    Z = vperp(alt, Y);
  }
  Z = vnorm(Z);
  const X = vcross(Y, Z);
  return qfromBasis(X, Y, Z);
}

export function qdot(a: Q, b: Q): number {
  return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
}

/** Spherical linear interpolation (shortest arc). */
export function qslerp(a: Q, b: Q, u: number): Q {
  let d = qdot(a, b);
  let bx = b.x, by = b.y, bz = b.z, bw = b.w;
  if (d < 0) {
    d = -d;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  if (d > 0.99999999) {
    return qnorm({ x: a.x + (bx - a.x) * u, y: a.y + (by - a.y) * u, z: a.z + (bz - a.z) * u, w: a.w + (bw - a.w) * u });
  }
  const th = Math.acos(Math.min(1, d));
  const s = Math.sin(th);
  const wa = Math.sin((1 - u) * th) / s;
  const wb = Math.sin(u * th) / s;
  return { x: a.x * wa + bx * wb, y: a.y * wa + by * wb, z: a.z * wa + bz * wb, w: a.w * wa + bw * wb };
}

/** Rotation vector (axis * angle, frame I) that carries attitude a to attitude b: b = exp(r) a. */
export function qdelta(a: Q, b: Q): V3 {
  let d = qmul(b, qconj(a));
  if (d.w < 0) d = { x: -d.x, y: -d.y, z: -d.z, w: -d.w };
  const s = Math.sqrt(d.x * d.x + d.y * d.y + d.z * d.z);
  if (s < 1e-12) return { x: 2 * d.x, y: 2 * d.y, z: 2 * d.z };
  const ang = 2 * Math.atan2(s, d.w);
  return { x: (d.x / s) * ang, y: (d.y / s) * ang, z: (d.z / s) * ang };
}

/** Apply a rotation vector (frame I) to an attitude: exp(r) q. */
export function qapply(r: V3, q: Q): Q {
  const ang = vlen(r);
  if (ang < 1e-15) return q;
  return qnorm(qmul(qaxis(r, ang), q));
}

export const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);
export const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;
/** Smoothstep 0..1 (C1). */
export function smooth01(u: number): number {
  const x = clamp(u, 0, 1);
  return x * x * (3 - 2 * x);
}
export const DEG = Math.PI / 180;
