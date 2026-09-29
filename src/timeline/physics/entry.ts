/**
 * Capsule descent: coast, entry heat shield first, drogue and main parachutes (reefed, then
 * full), splashdown, and the capsule floating afterwards. A point-mass model with authored
 * attitude (the heat shield faces the airflow; under the canopies the capsule hangs nose up):
 *  - drag 0.5 rho v^2 Cd(M) A with the blunt-capsule table (Cd ~1.3 hypersonic);
 *  - optional low lift (return capsule): an effective vertical L/D standing for a trimmed
 *    capsule flying bank reversals, whose sideways components average out (stated);
 *  - convective heating from the Sutton-Graves form q = k sqrt(rho / Rn) v^3 (Rn = the heat
 *    shield's spherical radius), integrated into a heat load for the char channel;
 *  - parachutes as drag areas that inflate over a couple of seconds.
 * Computed once for the reference trajectory; not a flight-dynamics simulation.
 */
import { CAPSULE } from '../../vehicle/spec';
import { EARTH_AXIS, OMEGA_EARTH, R_EARTH } from '../../world/frames';
import { cdCapsule } from './aero';
import { airDensity } from './atmosphere';
import { Craft, airVelocity } from './craft';
import type { Ctx } from './context';
import type { OriginSample } from './tracks';
import { areaOf } from './vehicle';
import { DEG, clamp, qaxis, qlook, qmul, qrot, v3, vadd, vcross, vdot, vlen, vnorm, vperp, vscale, vsub, type V3 } from './vec';

export const CAPSULE_AREA = areaOf(CAPSULE.baseDiameter);
/** Sutton-Graves constant for air (SI: W/m^2 with rho kg/m^3, Rn m, v m/s). */
const K_SG = 1.7415e-4;
/** Heating rate that maps to cap.plasma = 1 (about the peak of a LEO return, W/m^2). */
export const PLASMA_REF = 1.0e6;
/** Heat load that maps to cap.char = 1 (about a LEO return, J/m^2). */
export const CHAR_REF = 1.2e8;

/**
 * Parachute drag areas Cd*S (m^2) from the spec's canopies (CAPSULE: 2 drogues of 7 m, 3 mains
 * of 35 m nominal diameter). Drag coefficients on the nominal area: about 0.55 for a conical
 * ribbon drogue, about 0.8 for a ringsail main (typical published values; the cluster loss is
 * folded into 0.8). Mains: 3 x 0.8 x 962 m^2 = 2,309 m^2, so the 8,300 kg crew capsule descends
 * near 7.6 m/s at sea level and the 4,200 kg research capsule (same canopies) near 5.4 m/s.
 */
export const DROGUE_CD = 0.55;
export const MAIN_CD = 0.8;
export const DROGUE_CDA = CAPSULE.drogues * DROGUE_CD * areaOf(CAPSULE.drogueDiameter);
export const MAIN_CDA = CAPSULE.mains * MAIN_CD * areaOf(CAPSULE.mainDiameter);

export const RATE_CAPSULE = { wMax: 5 * DEG, aMax: 2 * DEG };
/** A capsule moving apex (nose) first: about half the heat-shield-first drag. */
const cdApexFirst = (m: number): number => 0.55 * cdCapsule(m);

export interface DescentOpts {
  /** Drogue and main canopy drag areas Cd*S (m^2), reefed fraction of the main. */
  drogueCdA: number;
  mainCdA: number;
  reefFrac: number;
  drogueAlt: number;
  mainAlt: number;
  disreefDelay: number;
  /** Effective vertical lift-to-drag ratio in hypersonic flight (0: ballistic). */
  liftLD: number;
  /** Height of the centre of mass above the heat-shield nadir (m): splashdown when it reaches the sea. */
  comAboveNadir: number;
  /** Roll reference for the attitude (body +Z stays near it). */
  side: V3;
  /** Entry-interface altitude (m) for the event. */
  eiAlt: number;
  record: boolean;
  /** Mission end: the capsule floats (co-rotating with the Earth) until then. */
  end: number;
  /** RCS channel written while the capsule holds its attitude above the atmosphere. */
  rcsChannel?: 'cap.rcs';
}

export interface DescentResult {
  karmanUp: number;
  apogee: { t: number; alt: number };
  karmanDown: number;
  ei: number;
  peakHeating: { t: number; alt: number; rate: number; speed: number };
  peakG: { t: number; g: number; alt: number };
  maxQ: number;
  /** First time the heating rate exceeds 25 % of its peak (blackout starts), and falls below it again. */
  hotStart: number;
  hotEnd: number;
  drogue: number;
  main: number;
  disreef: number;
  splash: number;
  splashSpeed: number;
  splashPos: V3;
  heatLoad: number;
  /** Time the capsule descends through `markAlt` (for phase bounds). */
  markT: number;
}

/** Heating rate (W/m^2) at altitude h and air speed v. */
export const heatingRate = (h: number, v: number): number => K_SG * Math.sqrt(airDensity(Math.max(0, h)) / CAPSULE.heatShieldRadius) * v * v * v;

/**
 * Fly a capsule craft from its current state to splashdown and then float until `o.end`.
 * `markAlt` marks a descending altitude for the phase list. Pass two runs with the same inputs
 * and get the same output (deterministic, fixed step logic).
 */
export function flyCapsuleDescent(ctx: Ctx | null, c: Craft, o: DescentOpts, markAlt = 60_000): DescentResult {
  const res: DescentResult = {
    karmanUp: NaN,
    apogee: { t: c.t, alt: c.altitude() },
    karmanDown: NaN,
    ei: NaN,
    peakHeating: { t: c.t, alt: 0, rate: 0, speed: 0 },
    peakG: { t: c.t, g: 0, alt: 0 },
    maxQ: 0,
    hotStart: NaN,
    hotEnd: NaN,
    drogue: NaN,
    main: NaN,
    disreef: NaN,
    splash: NaN,
    splashSpeed: 0,
    splashPos: v3(),
    heatLoad: 0,
    markT: NaN,
  };
  let drogueT = Infinity;
  let mainT = Infinity;
  const inflate = (t: number, t0: number, dur: number) => clamp((t - t0) / dur, 0, 1);
  const chuteCdA = (t: number): number => {
    let a = 0;
    if (t < mainT) a += o.drogueCdA * inflate(t, drogueT, 1.5) ** 2;
    if (t >= mainT) {
      const reef = o.reefFrac * inflate(t, mainT, 2.5) ** 2;
      const full = inflate(t, mainT + o.disreefDelay, 3.0);
      a += o.mainCdA * (reef + (1 - o.reefFrac) * full * full);
    }
    return a;
  };
  c.aero = { area: CAPSULE_AREA, cd: cdCapsule, extraCdA: chuteCdA };
  let prevAlt = c.altitude();
  let prevRate = 0;
  let lastChan = -Infinity;
  const hist: number[] = [];
  const chan = (t: number) => {
    if (!ctx || !o.record) return;
    const alt = c.altitude();
    const va = vlen(c.airRel());
    const rate = alt < 130_000 ? heatingRate(alt, va) : 0;
    ctx.ch.key('cap.plasma', t, clamp(rate / PLASMA_REF, 0, 1));
    ctx.ch.key('cap.char', t, clamp(res.heatLoad / CHAR_REF, 0, 1));
    if (o.rcsChannel) ctx.ch.key(o.rcsChannel, t, alt > 60_000 && vlen(c.alpha) > 0.05 * DEG ? clamp(vlen(c.alpha) / (1 * DEG), 0.2, 1) : 0);
  };
  for (let guard = 0; guard < 200_000; guard++) {
    const t = c.t;
    const alt = c.altitude();
    const up = vnorm(c.r);
    const va = c.airRel();
    const vaN = vlen(va);
    const vz = vdot(c.v, up);
    // step size: coarse high up, fine in the dense air and around the parachute events
    let dt = alt > 140_000 ? 2 : alt > 100_000 ? 1 : 0.5;
    if (t >= drogueT - 0.5 && t < drogueT + 4) dt = 0.1;
    if (t >= mainT - 0.5 && t < mainT + o.disreefDelay + 6) dt = 0.1;
    if (alt < 300) dt = 0.1;
    // attitude: heat shield into the airflow (nose along -v_air) once falling; nose up while
    // climbing (a suborbital capsule keeps the attitude it had on the booster) and over apogee
    const back = vaN > 5 ? vscale(va, -1 / vaN) : up;
    const wFall = clamp(-vz / 150, 0, 1);
    const nose = wFall >= 1 ? back : vnorm(vadd(vscale(up, 1 - wFall), vscale(back, wFall)));
    const att = { q: qlook(vlen(nose) > 1e-9 ? nose : up, o.side), ...RATE_CAPSULE, tau: 2 };
    // apex first while climbing (lower drag), heat shield first when falling
    c.aero.cd = vz > 0 && vaN > 5 ? cdApexFirst : cdCapsule;
    // low lift: vertical component perpendicular to the airflow, L/D x drag
    if (o.liftLD > 0 && vaN > 600 && alt < 130_000) {
      const drag = (c.q_dyn * cdCapsule(c.mach) * CAPSULE_AREA) / c.mass;
      const ldir = vperp(up, vnorm(va));
      c.lift = vlen(ldir) > 1e-6 ? vscale(vnorm(ldir), o.liftLD * drag) : v3();
    } else c.lift = v3();
    // parachute triggers
    if (Number.isNaN(res.drogue) && vz < 0 && alt <= o.drogueAlt) {
      res.drogue = t;
      drogueT = t;
    }
    if (Number.isNaN(res.main) && vz < 0 && alt <= o.mainAlt) {
      res.main = t;
      mainT = t;
      res.disreef = t + o.disreefDelay;
    }
    const snap = c.snapshot();
    c.step(dt, att);
    const alt1 = c.altitude();
    // splashdown: the heat-shield nadir reaches the sea
    if (alt1 <= o.comAboveNadir) {
      const f = clamp((alt - o.comAboveNadir) / Math.max(1e-6, alt - alt1), 0, 1);
      c.restore(snap);
      if (f * dt > 1e-6) c.step(f * dt, att);
      res.splash = c.t;
      res.splashSpeed = vlen(c.airRel());
      res.splashPos = c.origin();
      if (ctx && o.record) ctx.rec(c, 0, true);
      chan(c.t);
      break;
    }
    // bookkeeping
    const tt = c.t;
    const vaN1 = vlen(c.airRel());
    const rate = alt1 < 130_000 ? heatingRate(alt1, vaN1) : 0;
    res.heatLoad += 0.5 * (prevRate + rate) * dt;
    prevRate = rate;
    if (rate > res.peakHeating.rate) res.peakHeating = { t: tt, alt: alt1, rate, speed: vaN1 };
    const g = c.sensed / 9.80665;
    if (g > res.peakG.g && Number.isNaN(res.drogue)) res.peakG = { t: tt, g, alt: alt1 };
    if (c.q_dyn > res.maxQ) res.maxQ = c.q_dyn;
    if (Number.isNaN(res.karmanUp) && prevAlt < 100_000 && alt1 >= 100_000) res.karmanUp = tt;
    if (alt1 > res.apogee.alt) res.apogee = { t: tt, alt: alt1 };
    if (Number.isNaN(res.karmanDown) && prevAlt > 100_000 && alt1 <= 100_000) res.karmanDown = tt;
    if (Number.isNaN(res.ei) && prevAlt > o.eiAlt && alt1 <= o.eiAlt) res.ei = tt;
    if (Number.isNaN(res.markT) && prevAlt > markAlt && alt1 <= markAlt) res.markT = tt;
    prevAlt = alt1;
    hist.push(tt, rate);
    if (ctx && o.record) {
      const every = alt1 > 100_000 ? 2 : Number.isFinite(drogueT) && tt < mainT + o.disreefDelay + 6 ? 0.5 : 1;
      ctx.rec(c, every);
      if (tt - lastChan >= every - 1e-9) {
        chan(tt);
        lastChan = tt;
      }
    }
  }
  if (Number.isNaN(res.splash)) throw new Error('capsule did not reach the sea');
  // heating band (the blackout): where the heating rate exceeds a quarter of its peak
  const thr = 0.25 * res.peakHeating.rate;
  res.hotStart = res.peakHeating.t;
  res.hotEnd = res.peakHeating.t;
  for (let i = 0; i < hist.length; i += 2) {
    if (hist[i + 1] >= thr) {
      if (hist[i] < res.hotStart) res.hotStart = hist[i];
      if (hist[i] > res.hotEnd) res.hotEnd = hist[i];
    }
  }
  if (ctx && o.record) {
    const ch = ctx.ch;
    // parachute channels
    ch.key('cap.drogue', res.drogue - 0.01, 0);
    ch.ease('cap.drogue', res.drogue, res.drogue + 1.5, 1, 4);
    ch.key('cap.drogue', res.main, 1);
    ch.key('cap.drogue', res.main + 0.6, 0);
    ch.key('cap.main', res.main - 0.01, 0);
    ch.ease('cap.main', res.main, res.main + 2.5, 0.5, 5);
    ch.key('cap.main', res.disreef, 0.5);
    ch.ease('cap.main', res.disreef, res.disreef + 3, 1, 6);
    ch.key('cap.main', res.splash + 4, 1);
    ch.ease('cap.main', res.splash + 4, res.splash + 9, 0, 5);
  }
  floatCapsule(ctx, c, o.end, o.record);
  return res;
}

/** The capsule afloat: carried by the rotating Earth, upright, until `end`. */
export function floatCapsule(ctx: Ctx | null, c: Craft, end: number, record: boolean) {
  if (!ctx || !record) return;
  const t0 = c.t;
  const o0 = c.origin();
  const q0 = c.q;
  const axis = { x: EARTH_AXIS.x, y: EARTH_AXIS.y, z: EARTH_AXIS.z };
  const w = vscale(axis, OMEGA_EARTH);
  const origins: OriginSample[] = [];
  const n = Math.max(2, Math.ceil((end - t0) / 2));
  for (let i = 1; i <= n + 1; i++) {
    const t = t0 + ((end - t0) * i) / n;
    const rot = qaxis(axis, OMEGA_EARTH * (t - t0));
    const p = qrot(rot, o0);
    origins.push({ t, p, v: vcross(w, p), q: qmul(rot, q0), m: c.mass });
  }
  ctx.direct.push({ bodies: [...c.bodies], origins });
}

/** Pad-local east/north (m) of a frame-I point at time t. */
export function localEN(p: V3, t: number, site: (t: number) => { p: V3; q: { x: number; y: number; z: number; w: number } }): { e: number; n: number } {
  const s = site(t);
  const qi = { x: -s.q.x, y: -s.q.y, z: -s.q.z, w: s.q.w };
  const d = qrot(qi, vsub(p, s.p));
  return { e: d.x, n: -d.z };
}

export { airVelocity, R_EARTH };
