/**
 * Earth-Moon coast for the lunar flyby: the restricted three-body problem in the Earth-centred
 * frame I (Earth point mass, Moon point mass on its circular orbit `moonPosition(t, phase0)`,
 * with the indirect term for the Earth's own acceleration toward the Moon; see Craft.gravity),
 * integrated with RK4 at steps set by the local dynamical time scale (a few seconds near the
 * Earth, about ten seconds at closest approach, up to ten minutes in mid-course).
 *
 * The Moon's phase at T-0 is chosen by a deterministic search (scan, then bisection) so that the
 * probe passes the Moon at the wanted altitude on the chosen side: the far side (as seen from
 * the Earth) or the trailing side (behind the Moon's direction of motion, where the Moon adds
 * energy and the probe leaves outward).
 */
import { MOON_DISTANCE, MU_EARTH, MU_MOON, R_MOON, MOON_ORBIT_NORMAL } from '../../world/frames';
import { Craft, moonPos } from './craft';
import { kepler } from './kepler';
import { clamp, vcross, vdot, vlen, vnorm, vsub, type V3 } from './vec';

/** Sphere-of-influence radius of the Moon (Laplace, a (m/M)^(2/5)): about 66,000 km. */
export const SOI_MOON = MOON_DISTANCE * Math.pow(MU_MOON / MU_EARTH, 0.4);

export const moonAt = (t: number, phase0: number): V3 => moonPos(t, phase0);

/** Step length (s) from the dynamical time scales about the Earth and the Moon. */
export function cislunarDt(c: Craft, phase0: number): number {
  const rE = vlen(c.r);
  const rM = vlen(vsub(c.r, moonAt(c.t, phase0)));
  const tauE = Math.sqrt((rE * rE * rE) / MU_EARTH);
  const tauM = Math.sqrt((rM * rM * rM) / MU_MOON);
  return clamp(0.004 * Math.min(tauE, tauM), 1, 600);
}

export interface FlybyResult {
  /** Closest approach: time, distance from the Moon's centre, and far-side flag. */
  t: number;
  dist: number;
  alt: number;
  farSide: boolean;
  /** Closest approach behind the Moon with respect to its orbital motion (the energy-gaining side). */
  trailing: boolean;
  /** Angle at the Moon's centre between the sub-Earth point and the closest-approach point (deg; over 90 = far side). */
  angleFromEarthDeg: number;
  /** Signed distance: positive on the trailing side. */
  signed: number;
  soiEnter: number;
  soiExit: number;
}

/**
 * Coast a craft (Moon gravity on through `c.env.moonPhase0`) until `until`, or until the
 * closest approach has passed and `stopAfterCA` seconds more elapsed. Calls `onStep` after
 * every step. Returns the closest approach.
 */
export function coastCislunar(c: Craft, until: number, onStep: ((c: Craft) => void) | null, stopAfterCA = Infinity, stopAfterSoiExit = Infinity): FlybyResult {
  const ph = c.env.moonPhase0;
  if (ph === null) throw new Error('coastCislunar needs the Moon phase');
  const res: FlybyResult = { t: NaN, dist: Infinity, alt: Infinity, farSide: false, trailing: false, angleFromEarthDeg: 0, signed: Infinity, soiEnter: NaN, soiExit: NaN };
  let prevD = vlen(vsub(c.r, moonAt(c.t, ph)));
  for (let guard = 0; guard < 100_000 && c.t < until - 1e-9; guard++) {
    const dt = Math.min(cislunarDt(c, ph), until - c.t);
    c.step(dt, null);
    const m = moonAt(c.t, ph);
    const rel = vsub(c.r, m);
    const d = vlen(rel);
    if (d < res.dist) {
      res.dist = d;
      res.t = c.t;
      res.alt = d - R_MOON;
      res.farSide = vdot(rel, m) > 0;
      // the Moon's velocity direction: normal x position (prograde circular orbit)
      const n = { x: MOON_ORBIT_NORMAL.x, y: MOON_ORBIT_NORMAL.y, z: MOON_ORBIT_NORMAL.z };
      res.trailing = vdot(rel, vcross(n, m)) < 0;
      res.angleFromEarthDeg = (Math.acos(clamp(-vdot(rel, m) / (d * vlen(m)), -1, 1)) * 180) / Math.PI;
      res.signed = res.trailing ? d : -d;
    }
    if (Number.isNaN(res.soiEnter) && prevD > SOI_MOON && d <= SOI_MOON) res.soiEnter = c.t;
    if (!Number.isNaN(res.soiEnter) && Number.isNaN(res.soiExit) && prevD <= SOI_MOON && d > SOI_MOON) res.soiExit = c.t;
    prevD = d;
    onStep?.(c);
    if (d < R_MOON) break; // impact: stop (only trial runs get here)
    if (Number.isFinite(res.t) && c.t - res.t > stopAfterCA && d > res.dist * 1.5) break;
    if (Number.isFinite(res.soiExit) && c.t - res.soiExit >= stopAfterSoiExit) break;
  }
  return res;
}

/** Polar angle of r in the Moon's orbit plane (from +X, in the sense of the Moon's motion). */
function planeAngle(r: V3): number {
  const e1 = { x: 1, y: 0, z: 0 };
  const n = { x: MOON_ORBIT_NORMAL.x, y: MOON_ORBIT_NORMAL.y, z: MOON_ORBIT_NORMAL.z };
  const e2 = vnorm(vcross(n, e1));
  return Math.atan2(vdot(r, e2), vdot(r, e1));
}

/** Two-body time (s) from (r, v) until the radius first reaches `rt` outbound (NaN if never). */
export function timeToRadiusOut(r: V3, v: V3, rt: number): number {
  let lo = 0;
  let hi = 60;
  while (vlen(kepler(r, v, hi, MU_EARTH).r) < rt) {
    lo = hi;
    hi *= 1.6;
    if (hi > 30 * 86400) return NaN;
  }
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2;
    if (vlen(kepler(r, v, m, MU_EARTH).r) < rt) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

/**
 * Moon phase at T-0 that gives a pass at `targetAlt` (m) on the chosen side for a probe starting from
 * `probe` (not modified). Deterministic: a scan of lead angles around the two-body meeting
 * point, then bisection on the signed closest-approach distance.
 */
export function findMoonPhase(probe: Craft, targetAlt: number, make: (c: Craft, phase0: number) => Craft, side: 'far' | 'trailing' = 'far'): { phase0: number; flyby: FlybyResult } {
  const tof = timeToRadiusOut(probe.r, probe.v, MOON_DISTANCE);
  if (!Number.isFinite(tof)) throw new Error('trans-lunar trajectory does not reach the Moon');
  const tMeet = probe.t + tof;
  const pMeet = kepler(probe.r, probe.v, tof, MU_EARTH).r;
  const n = (2 * Math.PI) / (27.321661 * 86400);
  const base = planeAngle(pMeet) - n * tMeet;
  const target = R_MOON + targetAlt;
  const evalLead = (lead: number) => {
    const c = make(probe, base + lead);
    const fb = coastCislunar(c, probe.t + tof + 3 * 86400, null, 3600);
    return fb;
  };
  // scan leads (rad): positive lead puts the Moon ahead of the probe's crossing point
  const leads: number[] = [];
  for (let k = -12; k <= 12; k++) leads.push(k * 0.006);
  const scan = leads.map((l) => evalLead(l));
  // f = distance - target on the chosen branch of solutions
  const f = (fb: FlybyResult) => fb.dist - target;
  let bracket: [number, number] | null = null;
  for (let i = 0; i < leads.length - 1; i++) {
    const a = scan[i];
    const b = scan[i + 1];
    const ok = (x: FlybyResult) => (side === 'far' ? x.farSide : x.trailing);
    if (ok(a) && ok(b) && Math.sign(f(a)) !== Math.sign(f(b))) {
      bracket = [leads[i], leads[i + 1]];
      break;
    }
  }
  if (!bracket) throw new Error(`lunar flyby: no ${side}-side solution in the scanned range`);
  let [lo, hi] = bracket;
  let flo = f(evalLead(lo));
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2;
    const fm = f(evalLead(m));
    if (Math.sign(fm) === Math.sign(flo)) {
      lo = m;
      flo = fm;
    } else hi = m;
    if (hi - lo < 1e-9 || Math.abs(fm) < 500) {
      lo = hi = m;
      break;
    }
  }
  const lead = (lo + hi) / 2;
  return { phase0: base + lead, flyby: evalLead(lead) };
}
