/**
 * Orbital phases: Kepler coasts sampled for the tracks (with an authored attitude law), short
 * in-orbit burns integrated with RK4 (prograde or along a steering direction) with an exact
 * cutoff on a target, and small helpers (orbital elements in km, local-horizontal attitude).
 */
import { EARTH_AXIS, MU_EARTH, R_EARTH } from '../../world/frames';
import { Craft, type AttitudeCmd } from './craft';
import type { Ctx } from './context';
import { elements, kepler } from './kepler';
import { DEG, clamp, qaxisY, qdelta, qlook, v3, vadd, vcross, vdot, vlen, vnorm, vscale, type Q, type V3 } from './vec';

/** Nose along the velocity, body +Z along -h (the ascent's roll convention). */
export function progradeAttitude(r: V3, v: V3): Q {
  const h = vcross(r, v);
  return qlook(v, vscale(vnorm(h), -1));
}

/** Nose radially up (away from Earth), body +X along the velocity: the station-like frame for the capsule on R-bar. */
export function zenithAttitude(r: V3, v: V3): Q {
  const up = vnorm(r);
  const h = vnorm(vcross(r, v));
  return qlook(up, vscale(h, -1));
}

/** Nose against the velocity (retrograde), body +Z along -h. */
export function retrogradeAttitude(r: V3, v: V3): Q {
  const h = vcross(r, v);
  return qlook(vscale(v, -1), vscale(vnorm(h), -1));
}

/** Largest orbital angle one coast sample may span (rad). */
const MAX_SWEEP = 2.5 * DEG;

/**
 * Coast on a two-body orbit from the craft's current state to `until`, recording samples every
 * `every` seconds with the attitude from `attitude(r, v, t)` (the craft slews to it with its
 * rate limits at the sample spacing: callers use laws that change slowly or that start where the
 * craft already points). Updates the craft state at the end.
 */
export function coastKepler(ctx: Ctx | null, c: Craft, until: number, every: number, attitude: ((r: V3, v: V3, t: number) => Q) | null, record = true) {
  const r0 = { ...c.r };
  const v0 = { ...c.v };
  const t0 = c.t;
  if (until <= t0 + 1e-9) return;
  const n = Math.max(1, Math.ceil((until - t0) / every));
  const h = (until - t0) / n;
  let prevQ = c.q;
  let t = t0;
  let rate = vlen(vcross(c.r, c.v)) / vdot(c.r, c.r);
  while (t < until - 1e-9) {
    // uniform steps, shortened where the orbit turns fast (near a low perigee) so no step sweeps
    // more than MAX_SWEEP of orbital angle: the tracks' cubic Hermite interpolation then stays
    // within a metre of the conic (a 300 s step at a GTO perigee would be off by hundreds of metres)
    let dt = Math.min(h, MAX_SWEEP / Math.max(rate, 1e-12));
    if (t + dt > until - 1e-6 || until - (t + dt) < 0.2 * dt) dt = until - t;
    const tn = t + dt >= until - 1e-9 ? until : t + dt;
    dt = tn - t;
    t = tn;
    const k = kepler(r0, v0, t - t0, MU_EARTH);
    rate = vlen(vcross(k.r, k.v)) / vdot(k.r, k.r);
    const q = attitude ? attitude(k.r, k.v, t) : prevQ;
    const w = attitude ? vscale(qdelta(prevQ, q), 1 / dt) : c.w;
    c.t = t;
    c.r = k.r;
    c.v = k.v;
    c.q = q;
    c.w = w;
    prevQ = q;
    if (ctx && record) ctx.rec(c, 0, true);
  }
}

/** Integrated coast (RK4 with drag and the craft's attitude slews), for low or changing orbits. */
export function coastStep(ctx: Ctx | null, c: Craft, until: number, dt: number, att: (c: Craft) => AttitudeCmd | null, recEvery: number, onStep?: (c: Craft) => void) {
  while (c.t < until - 1e-9) {
    const h = Math.min(dt, until - c.t);
    c.step(h, att(c));
    if (ctx) ctx.rec(c, recEvery);
    onStep?.(c);
  }
}

export interface OrbitBurnOpts {
  group: string;
  /** Thrust direction law (unit, frame I). */
  dir: (c: Craft) => V3;
  /** Stop when this returns >= 0 (evaluated with the shutdown transient's impulse included). */
  done: (r: V3, v: V3) => number;
  ignition: number;
  tail: number;
  throttle: number;
  /** Sensed-acceleration limit (m/s^2): the throttle comes down toward the engine's minimum as the craft gets lighter. */
  gLimit?: number;
  dt: number;
  rate: { wMax: number; aMax: number };
  onStep?: (c: Craft) => void;
  maxT?: number;
}

/**
 * Burn with ignition ramp, steering law and an exact cutoff on `done` (bisected inside the last
 * step, the shutdown transient's impulse included). Returns ignition-start and cutoff times.
 */
export function orbitBurn(ctx: Ctx | null, c: Craft, o: OrbitBurnOpts, recEvery = 0.5): { start: number; cut: number; end: number } {
  const g = c.group(o.group)!;
  const start = c.t;
  const accTail = (cc: Craft) => {
    let F = 0;
    for (const gg of cc.groups) F += gg.n * gg.thr * gg.eng.thrustVac;
    return F / cc.mass;
  };
  const predicted = (cc: Craft) => {
    const dv = accTail(cc) * o.tail * 0.5;
    return o.done(cc.r, vadd(cc.v, vscale(qaxisY(cc.q), dv)));
  };
  let cut = NaN;
  let lastSlope = 0;
  for (let guard = 0; guard < 200000; guard++) {
    const t = c.t;
    let thr = clamp((t + o.dt - start) / o.ignition, 0, 1) * o.throttle;
    // acceleration limit on the mass at the end of the step
    if (o.gLimit) thr = Math.min(thr, Math.max(g.eng.minThrottle, (o.gLimit * (c.mass - g.n * g.eng.mdot * g.thr * o.dt)) / (g.n * g.eng.thrustVac)));
    g.next = thr;
    // a sample at every change of the throttle's slope (ramp start and end, acceleration limit),
    // so the track's cubic interpolation follows the thrust instead of rounding the knee
    const slope = (thr - g.thr) / o.dt;
    if (ctx && Math.abs(slope - lastSlope) > 0.02) ctx.rec(c, 0, true);
    lastSlope = slope;
    const d = o.dir(c);
    const att: AttitudeCmd = { q: qlook(d, vscale(vnorm(vcross(c.r, c.v)), -1)), wMax: o.rate.wMax, aMax: o.rate.aMax, tau: 1.5 };
    const before = predicted(c);
    const snap = c.snapshot();
    c.step(o.dt, att);
    const after = predicted(c);
    if (after >= 0 && t > start + o.ignition * 0.5) {
      const f = before < 0 ? clamp(-before / (after - before), 0, 1) : 0;
      c.restore(snap);
      g.next = snap.thr[c.groups.indexOf(g)][0] + (thr - snap.thr[c.groups.indexOf(g)][0]) * f;
      if (f * o.dt > 1e-6) c.step(f * o.dt, att);
      cut = c.t;
      if (ctx) ctx.rec(c, 0, true);
      o.onStep?.(c);
      const from = g.thr;
      const n = Math.max(2, Math.round(o.tail / 0.1));
      for (let k = 1; k <= n; k++) {
        g.next = from * (1 - k / n);
        c.step(o.tail / n, att);
        if (ctx) ctx.rec(c, 0, k === n);
        o.onStep?.(c);
      }
      break;
    }
    if (ctx) ctx.rec(c, recEvery);
    o.onStep?.(c);
    if (o.maxT && c.t - start > o.maxT) throw new Error('burn did not reach its target');
  }
  return { start, cut, end: c.t };
}

export const altKm = (r: number) => (r - R_EARTH) / 1000;

export function apsidesKm(r: V3, v: V3): { peri: number; apo: number; incDeg: number } {
  const el = elements(r, v, MU_EARTH, v3(0, 0, -1));
  return { peri: altKm(el.rp), apo: altKm(el.ra), incDeg: (el.i * 180) / Math.PI };
}

/** Local horizontal prograde unit vector in the orbit plane. */
export function horizontal(r: V3, v: V3): V3 {
  const h = vcross(r, v);
  return vnorm(vcross(h, r));
}

export const ORBIT_RATE = { wMax: 2 * DEG, aMax: 0.5 * DEG };

/** Inclination of the orbit through (r, v) to the Earth's equator (deg). */
export function incToEquator(r: V3, v: V3): number {
  const h = vnorm(vcross(r, v));
  const c = h.x * EARTH_AXIS.x + h.y * EARTH_AXIS.y + h.z * EARTH_AXIS.z;
  return (Math.acos(clamp(c, -1, 1)) * 180) / Math.PI;
}

export { vdot, vlen };
