/**
 * Two-body orbits: universal-variable Kepler propagation (elliptic, parabolic and hyperbolic
 * alike) and osculating elements. Used for the unpowered coasts above the atmosphere, for
 * orbit targeting (apoapsis/periapsis at cutoff) and for telemetry.
 */
import { vcross, vdot, vlen, vnorm, vscale, vsub, type V3 } from './vec';

/** Stumpff functions C(z), S(z). */
function stumpffC(z: number): number {
  if (z > 1e-8) return (1 - Math.cos(Math.sqrt(z))) / z;
  if (z < -1e-8) return (Math.cosh(Math.sqrt(-z)) - 1) / -z;
  return 1 / 2 - z / 24 + (z * z) / 720;
}
function stumpffS(z: number): number {
  if (z > 1e-8) {
    const s = Math.sqrt(z);
    return (s - Math.sin(s)) / (s * s * s);
  }
  if (z < -1e-8) {
    const s = Math.sqrt(-z);
    return (Math.sinh(s) - s) / (s * s * s);
  }
  return 1 / 6 - z / 120 + (z * z) / 5040;
}

/** Propagate a two-body state by dt seconds (any conic). */
export function kepler(r0: V3, v0: V3, dt: number, mu: number): { r: V3; v: V3 } {
  if (dt === 0) return { r: { ...r0 }, v: { ...v0 } };
  const r0n = vlen(r0);
  const v0n2 = vdot(v0, v0);
  const vr0 = vdot(r0, v0) / r0n;
  const alpha = 2 / r0n - v0n2 / mu; // 1/a
  const sqmu = Math.sqrt(mu);
  // initial guess
  let chi: number;
  if (alpha > 1e-12) chi = sqmu * dt * alpha;
  else if (alpha < -1e-12) {
    const a = 1 / alpha;
    const s = Math.sign(dt);
    chi = s * Math.sqrt(-a) * Math.log((-2 * mu * alpha * dt) / (vdot(r0, v0) + s * Math.sqrt(-mu * a) * (1 - r0n * alpha)));
    if (!Number.isFinite(chi)) chi = sqmu * dt / r0n;
  } else chi = sqmu * dt / r0n;
  // Newton (with a bisection fallback bracket on failure)
  let F = 0;
  for (let it = 0; it < 60; it++) {
    const z = alpha * chi * chi;
    const C = stumpffC(z);
    const S = stumpffS(z);
    const chi2 = chi * chi;
    F = ((r0n * vr0) / sqmu) * chi2 * C + (1 - alpha * r0n) * chi2 * chi * S + r0n * chi - sqmu * dt;
    const dF = ((r0n * vr0) / sqmu) * chi * (1 - z * S) + (1 - alpha * r0n) * chi2 * C + r0n;
    const step = F / dF;
    chi -= step;
    if (Math.abs(step) < 1e-10 * Math.max(1, Math.abs(chi))) break;
  }
  const z = alpha * chi * chi;
  const C = stumpffC(z);
  const S = stumpffS(z);
  const chi2 = chi * chi;
  const f = 1 - (chi2 / r0n) * C;
  const g = dt - (chi2 * chi * S) / sqmu;
  const r = { x: f * r0.x + g * v0.x, y: f * r0.y + g * v0.y, z: f * r0.z + g * v0.z };
  const rn = vlen(r);
  const fd = (sqmu / (rn * r0n)) * (alpha * chi2 * chi * S - chi);
  const gd = 1 - (chi2 / rn) * C;
  const v = { x: fd * r0.x + gd * v0.x, y: fd * r0.y + gd * v0.y, z: fd * r0.z + gd * v0.z };
  return { r, v };
}

export interface Elements {
  /** Semi-major axis (m); negative for hyperbolic. */
  a: number;
  e: number;
  /** Inclination to the plane whose normal is `ref` (rad). */
  i: number;
  /** Periapsis and apoapsis radius (m); apoapsis is Infinity when e >= 1. */
  rp: number;
  ra: number;
  /** Specific orbital energy (J/kg). */
  energy: number;
  /** Angular momentum vector. */
  h: V3;
  /** Eccentricity vector (points to periapsis). */
  eVec: V3;
  /** Period (s), NaN when unbound. */
  period: number;
}

export function elements(r: V3, v: V3, mu: number, ref: V3 = { x: 0, y: 0, z: 1 }): Elements {
  const rn = vlen(r);
  const vn2 = vdot(v, v);
  const h = vcross(r, v);
  const hn = vlen(h);
  const energy = vn2 / 2 - mu / rn;
  const a = -mu / (2 * energy);
  // e = (v × h)/mu - r/|r|
  const vxh = vcross(v, h);
  const eVec = vsub(vscale(vxh, 1 / mu), vscale(r, 1 / rn));
  const e = vlen(eVec);
  const p = (hn * hn) / mu;
  const rp = p / (1 + e);
  const ra = e < 1 ? p / (1 - e) : Infinity;
  const i = Math.acos(Math.max(-1, Math.min(1, vdot(vnorm(h), vnorm(ref)))));
  const period = e < 1 ? 2 * Math.PI * Math.sqrt((a * a * a) / mu) : NaN;
  return { a, e, i, rp, ra, energy, h, eVec, period };
}

/** Flight-path angle (rad, + climbing) of a state. */
export function flightPathAngle(r: V3, v: V3): number {
  const rn = vlen(r);
  const vn = vlen(v);
  if (vn === 0) return 0;
  return Math.asin(Math.max(-1, Math.min(1, vdot(r, v) / (rn * vn))));
}

/** Time from the current state to the next periapsis (+) or apoapsis passage, elliptic orbits. */
export function timeToAnomaly(r: V3, v: V3, mu: number, targetTrueAnomaly: number): number {
  const el = elements(r, v, mu);
  const { a, e } = el;
  if (e >= 1) return NaN;
  const rn = vlen(r);
  // current true anomaly
  let nu: number;
  if (e < 1e-9) nu = 0;
  else {
    const c = vdot(el.eVec, r) / (e * rn);
    nu = Math.acos(Math.max(-1, Math.min(1, c)));
    if (vdot(r, v) < 0) nu = 2 * Math.PI - nu;
  }
  const E = (nu_: number) => 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu_ / 2), Math.sqrt(1 + e) * Math.cos(nu_ / 2));
  const M = (nu_: number) => {
    const EE = E(nu_);
    return EE - e * Math.sin(EE);
  };
  const n = Math.sqrt(mu / (a * a * a));
  let dM = M(targetTrueAnomaly) - M(nu);
  while (dM < 1e-9) dM += 2 * Math.PI;
  return dM / n;
}
