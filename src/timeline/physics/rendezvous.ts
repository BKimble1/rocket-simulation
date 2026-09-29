/**
 * Rendezvous: the station on its circular orbit, its local-vertical local-horizontal (LVLH)
 * frame, and the Clohessy-Wiltshire (Hill) equations for the capsule's motion relative to it:
 *
 *   r'' = 3 n^2 r + 2 n s' + f_r     (r: radial, up from the station)
 *   s'' = -2 n r'          + f_s     (s: along-track, ahead of the station)
 *   w'' = -n^2 w           + f_w     (w: out of plane, along the orbit normal)
 *
 * linearized about the station's circular orbit (mean motion n). The final approach is
 * authored with these equations (a two-impulse transfer to a point below the station, then a
 * thrusted climb along the radial line with hold points), which is accurate to metres at the
 * few-kilometre distances involved.
 */
import { MU_EARTH } from '../../world/frames';
import { qfromBasis, vadd, vcross, vdot, vnorm, vscale, vsub, type Q, type V3 } from './vec';

export interface CircularOrbit {
  /** Radius (m), mean motion (rad/s), unit normal, in-plane basis (e1 at angle 0, e2 at 90 deg in the direction of motion). */
  R: number;
  n: number;
  h: V3;
  e1: V3;
  e2: V3;
  /** Angle at t = 0 (rad). */
  theta0: number;
}

export function circularOrbit(R: number, normal: V3, e1: V3, theta0: number): CircularOrbit {
  const h = vnorm(normal);
  const a = vnorm(vsub(e1, vscale(h, vdot(e1, h))));
  const e2 = vcross(h, a);
  return { R, n: Math.sqrt(MU_EARTH / (R * R * R)), h, e1: a, e2, theta0 };
}

export function orbitState(o: CircularOrbit, t: number): { r: V3; v: V3 } {
  const th = o.theta0 + o.n * t;
  const c = Math.cos(th);
  const s = Math.sin(th);
  const r = vadd(vscale(o.e1, o.R * c), vscale(o.e2, o.R * s));
  const v = vadd(vscale(o.e1, -o.R * o.n * s), vscale(o.e2, o.R * o.n * c));
  return { r, v };
}

/** Angle of a point in the orbit plane (rad). */
export function angleIn(o: CircularOrbit, p: V3): number {
  return Math.atan2(vdot(p, o.e2), vdot(p, o.e1));
}

export interface Lvlh {
  /** Radial (up), along-track (direction of motion), normal. */
  r: V3;
  s: V3;
  w: V3;
}

export function lvlh(o: CircularOrbit, t: number): Lvlh {
  const st = orbitState(o, t);
  const r = vnorm(st.r);
  const s = vcross(o.h, r);
  return { r, s, w: o.h };
}

/**
 * Local-vertical attitude (the station model frame of scene/spacecraft/types.ts): body +Y zenith
 * (away from the Earth), +X along the velocity, +Z = X x Y (= minus the orbit normal). The
 * station's docking port faces nadir (-Y, STATION_DOCK); a capsule in this same attitude below
 * it points its docking system (its +Y model axis) up at the port for the R-bar approach.
 */
export function lvlhAttitude(b: Lvlh): Q {
  return qfromBasis(b.s, b.r, vscale(b.w, -1));
}

export interface Rel {
  r: number;
  s: number;
  w: number;
  vr: number;
  vs: number;
  vw: number;
}

/** Relative state of a point (p, v) with respect to the station, in the rotating LVLH frame. */
export function relState(o: CircularOrbit, t: number, p: V3, v: V3): Rel {
  const st = orbitState(o, t);
  const b = lvlh(o, t);
  const rho = vsub(p, st.r);
  const om = vscale(o.h, o.n);
  const vrel = vsub(vsub(v, st.v), vcross(om, rho));
  return { r: vdot(rho, b.r), s: vdot(rho, b.s), w: vdot(rho, b.w), vr: vdot(vrel, b.r), vs: vdot(vrel, b.s), vw: vdot(vrel, b.w) };
}

/** Absolute position and velocity (frame I) of a relative state. */
export function absState(o: CircularOrbit, t: number, x: Rel): { p: V3; v: V3 } {
  const st = orbitState(o, t);
  const b = lvlh(o, t);
  const rho = vadd(vadd(vscale(b.r, x.r), vscale(b.s, x.s)), vscale(b.w, x.w));
  const vrel = vadd(vadd(vscale(b.r, x.vr), vscale(b.s, x.vs)), vscale(b.w, x.vw));
  const om = vscale(o.h, o.n);
  return { p: vadd(st.r, rho), v: vadd(vadd(st.v, vrel), vcross(om, rho)) };
}

/** Free Clohessy-Wiltshire motion over dt. */
export function cwPropagate(x: Rel, n: number, dt: number): Rel {
  const c = Math.cos(n * dt);
  const S = Math.sin(n * dt);
  const nt = n * dt;
  return {
    r: (4 - 3 * c) * x.r + (S / n) * x.vr + (2 / n) * (1 - c) * x.vs,
    s: 6 * (S - nt) * x.r + x.s - (2 / n) * (1 - c) * x.vr + (1 / n) * (4 * S - 3 * nt) * x.vs,
    w: c * x.w + (S / n) * x.vw,
    vr: 3 * n * S * x.r + c * x.vr + 2 * S * x.vs,
    vs: -6 * n * (1 - c) * x.r - 2 * S * x.vr + (4 * c - 3) * x.vs,
    vw: -n * S * x.w + c * x.vw,
  };
}

/**
 * Two-impulse transfer: the velocity needed now (first impulse) so that free CW motion reaches
 * (rf, sf, 0) after T seconds.
 */
export function cwTarget(x: Rel, n: number, T: number, rf: number, sf: number): Rel {
  const c = Math.cos(n * T);
  const S = Math.sin(n * T);
  const nt = n * T;
  // position part without the velocity terms
  const r0 = (4 - 3 * c) * x.r;
  const s0 = 6 * (S - nt) * x.r + x.s;
  const a11 = S / n;
  const a12 = (2 / n) * (1 - c);
  const a21 = -(2 / n) * (1 - c);
  const a22 = (1 / n) * (4 * S - 3 * nt);
  const b1 = rf - r0;
  const b2 = sf - s0;
  const det = a11 * a22 - a12 * a21;
  const vr = (b1 * a22 - a12 * b2) / det;
  const vs = (a11 * b2 - a21 * b1) / det;
  // out of plane: w(T) = 0
  const vw = Math.abs(S) > 1e-6 ? (-n * c * x.w) / S : 0;
  return { ...x, vr, vs, vw };
}
