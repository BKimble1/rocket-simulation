/**
 * Ascent: countdown on the pad, first-stage flight (vertical rise, pitch kick, zero-angle-of-
 * attack gravity turn in the co-rotating atmosphere, max-q throttle bucket, acceleration
 * limit), cutoff, stage separation and the upper-stage burn with linear-tangent steering
 * (tan(chi) = A + B t, chi = thrust pitch above the local horizontal) whose two parameters are
 * found by a deterministic damped Newton iteration so that the cutoff state has the target
 * radius and zero flight-path angle while the cutoff time is set by the target energy.
 *
 * This is authored guidance on a point-mass model: a reference trajectory computed once, not
 * a flight-software replica.
 */
import { FAIRING, PAYLOADS, S1, S2, E1, E1V, type PayloadId } from '../../vehicle/spec';
import type { BodyId } from '../../vehicle/parts';
import { MU_EARTH, R_EARTH, siteFrameQuaternion, sitePosition } from '../../world/frames';
import { PAD } from '../../world/site';
import { cdSlender } from './aero';
import { Craft, OMEGA_VEC, airVelocity, type AeroModel, type AttitudeCmd, type EngineGroup } from './craft';
import type { Ctx } from './context';
import { flightPathAngle, elements } from './kepler';
import {
  CAPSULE_ITEM,
  ENG_S1,
  ENG_S2,
  LES_ITEM,
  PAYLOAD_COM,
  RESEARCH_CAPSULE_ITEM,
  SM_COM,
  SM_DRY,
  SM_PROP_FULL,
  areaOf,
  boosterDry,
  fairingHalf,
  s1PropItems,
  s2PropItems,
  sumMass,
  upperDry,
  type MassItem,
} from './vehicle';
import { DEG, clamp, qaxisY, qaxisZ, qclone, qlook, qrot, v3, vadd, vangle, vcross, vdot, vlen, vnorm, vrotate, vscale, vsub, type Q, type V3 } from './vec';

export const RATE_ASCENT = { wMax: 5 * DEG, aMax: 1.5 * DEG };
export const RATE_UPPER = { wMax: 3 * DEG, aMax: 1 * DEG };

export interface StackSpec {
  payload: PayloadId;
  recovery: boolean;
  /** Crew stack: capsule + service module + abort tower (no fairing). */
  crew: boolean;
  /** Booster alone carrying the research capsule. */
  boosterOnly: boolean;
  /** First-stage propellant load (kg); defaults to full. */
  s1Load?: number;
}

export const SATELLITE_PAYLOADS: PayloadId[] = ['leoSat', 'gtoSat', 'lunarProbe'];

/** Fixed (non-propellant) mass items of the stack at liftoff. */
export function stackItems(spec: StackSpec): { items: MassItem[]; bodies: BodyId[] } {
  const items: MassItem[] = [...boosterDry(spec.recovery)];
  const bodies: BodyId[] = ['booster'];
  if (spec.boosterOnly) {
    items.push(RESEARCH_CAPSULE_ITEM);
    bodies.push('capsule');
    return { items, bodies };
  }
  items.push(...upperDry());
  bodies.push('upper');
  if (spec.crew) {
    items.push(CAPSULE_ITEM, { m: SM_DRY, c: SM_COM }, LES_ITEM);
    bodies.push('capsule', 'service', 'les');
  } else {
    items.push(fairingHalf('A', 0), fairingHalf('B', 0), { m: PAYLOADS[spec.payload].mass, c: PAYLOAD_COM[spec.payload] });
    bodies.push('fairingA', 'fairingB', 'satellite');
  }
  return { items, bodies };
}

/** COM function for a craft made of fixed items plus its S1/S2/SM tanks. */
export function comFrom(fixed: MassItem[]) {
  return (c: Craft): V3 => {
    const items = [...fixed];
    if (c.tanks.s1 !== undefined) items.push(...s1PropItems(Math.max(0, c.tanks.s1)));
    if (c.tanks.s2 !== undefined) items.push(...s2PropItems(Math.max(0, c.tanks.s2)));
    if (c.tanks.sm !== undefined) items.push({ m: Math.max(0, c.tanks.sm), c: SM_COM });
    return sumMass(items).c;
  };
}

export const aeroStack = (crew: boolean, boosterOnly: boolean): AeroModel => ({ area: areaOf(boosterOnly ? 3.9 : crew ? 3.9 : FAIRING.diameter), cd: cdSlender });

/** Origin pose on the pad at time t (model frame = pad frame, nozzle exit at PAD.nozzleExitHeight). */
export function padPose(t: number): { p: V3; q: Q; v: V3 } {
  const s = sitePosition(t);
  const qq = siteFrameQuaternion(t);
  const q: Q = { x: qq.x, y: qq.y, z: qq.z, w: qq.w };
  const p = vadd({ x: s.x, y: s.y, z: s.z }, qrot(q, v3(0, PAD.nozzleExitHeight, 0)));
  return { p, q, v: vcross(OMEGA_VEC, p) };
}

export interface PadTimes {
  start: number;
  armsRetract: number;
  engineStart: number;
  /** Centre and outer engine throttle ramps (start, full). */
  centreRamp: [number, number];
  outerRamp: [number, number];
  /** Outer engines lit on the pad (6 normally, 2 for the suborbital three-engine hop). */
  outerN: number;
  /** Throttle held on the pad and at liftoff. */
  liftoffThrottle: number;
}

/**
 * Countdown: the stack rides the rotating pad (direct samples), pad channels, engine start
 * with staggered ramps, hold-down release at T-0. Returns the propellant burned on the pad.
 */
export function padSequence(ctx: Ctx, bodies: BodyId[], massAt: (t: number) => number, pt: PadTimes, opts: { crew: boolean }) {
  const { ch } = ctx;
  const origins = [];
  for (let t = pt.start; t <= 0 + 1e-9; t += 0.5) {
    const tt = Math.min(t, 0);
    const pp = padPose(tt);
    origins.push({ t: tt, p: pp.p, v: pp.v, q: pp.q, m: massAt(tt) });
  }
  ctx.direct.push({ bodies: [...bodies], origins });
  // pad channels
  ch.key('pad.venting', pt.start, 1);
  ch.key('pad.venting', -22, 1);
  ch.key('pad.venting', -14, 0);
  ch.key('pad.arms', pt.start, 0);
  ch.ease('pad.arms', pt.armsRetract, pt.armsRetract + 12, 1);
  ch.key('pad.chilldown', pt.start, 0.35);
  ch.key('pad.chilldown', pt.engineStart - 8, 1);
  ch.key('pad.chilldown', pt.engineStart, 1);
  ch.key('pad.chilldown', 1.0, 0);
  ch.key('pad.deluge', pt.start, 0);
  ch.key('pad.deluge', -5, 0);
  ch.key('pad.deluge', -3.5, 1);
  ch.key('pad.deluge', 12, 1);
  ch.key('pad.deluge', 22, 0);
  ch.key('pad.holddown', pt.start, 0);
  ch.key('pad.holddown', 0, 0);
  ch.key('pad.holddown', 0.35, 1);
  ch.key('s1.center.throttle', pt.start, 0);
  ch.key('s1.center.throttle', pt.centreRamp[0], 0);
  ch.key('s1.center.throttle', pt.centreRamp[1], pt.liftoffThrottle);
  ch.key('s1.outer.throttle', pt.start, 0);
  ch.key('s1.outer.throttle', pt.outerRamp[0], 0);
  ch.key('s1.outer.throttle', pt.outerRamp[1], (pt.liftoffThrottle * pt.outerN) / 6);
  ctx.ev('arms-retract', pt.armsRetract, opts.crew ? 'Crew access arm and umbilicals retract' : 'Umbilical arms retract', 'countdown', ['ground'], 'valve');
  ctx.ev('engine-start', pt.engineStart, 'Engine start: centre engine first, then the outer ring', 'engine', ['booster'], 'ignition');
  ctx.ev('liftoff', 0, 'Thrust verified, hold-downs released: liftoff', 'milestone', ['booster'], 'release');
}

/** Propellant burned on the pad between engine start and T-0 (kg). */
export function padBurn(pt: PadTimes): number {
  const area = (r: [number, number]) => Math.max(0, 0 - r[1]) * pt.liftoffThrottle + (r[1] - r[0]) * pt.liftoffThrottle * 0.5;
  return ENG_S1.mdot * (area(pt.centreRamp) + pt.outerN * area(pt.outerRamp));
}

// ───────────────────────────── first stage ─────────────────────────────

export interface S1Params {
  /** Horizontal launch direction at the pad (unit, frame I at T-0), e.g. +X for due east. */
  heading: V3;
  /** Roll reference (body +Z stays near this). */
  side: V3;
  kickDeg: number;
  kickDur: number;
  /** Tower clear: nozzle-exit plane this high above the ground (m). */
  towerClearAlt: number;
  /** Max-q bucket (null: none). */
  bucket: { downMach: number; level: number; upFraction: number } | null;
  /** Sensed-acceleration limit (m/s^2) handled by throttling. */
  gLimit: number;
  /** Cutoff rule. */
  cutoff: { kind: 'reserve'; kg: number } | { kind: 'apogee'; alt: number } | { kind: 'depletion'; residual: number };
  outerN: number;
  liftoffThrottle: number;
  /** Throttle ceiling (fraction) after liftoff (suborbital runs lower). */
  maxThrottle: number;
  record: boolean;
}

export interface S1Result {
  towerClear: number;
  pitchStart: number;
  throttleDown: number | null;
  throttleUp: number | null;
  maxQ: { t: number; q: number; alt: number; mach: number };
  meco: number;
  mecoState: { alt: number; speed: number; airSpeed: number; gamma: number; downrange: number; prop: number };
}

const TAIL_S1 = 0.8;

/**
 * Fly the stack from liftoff to first-stage cutoff (end of the tail-off). The craft must be at
 * t = 0 on the pad with its S1 groups lit at the liftoff throttle.
 */
export function flyFirstStage(ctx: Ctx | null, c: Craft, p: S1Params): S1Result {
  const up0 = vnorm(c.origin());
  const hdg = vnorm(p.heading);
  const planeN = vnorm(vcross(up0, hdg));
  let towerClear = NaN;
  let pitchStart = NaN;
  let tdown: number | null = null;
  let tup: number | null = null;
  let qPeak = 0;
  let maxQ = { t: 0, q: 0, alt: 0, mach: 0 };
  let meco = NaN;
  let cutting = false;
  let cutStart = 0;
  let cutFrom = 1;
  let throttleCmd = p.liftoffThrottle;
  let bucketState: 'pre' | 'down' | 'up' = 'pre';
  let bucketT = 0;
  const kick = p.kickDeg * DEG;
  let prevDes: Q | null = null;
  const center = c.group('s1.center')!;
  const outer = c.group('s1.outer')!;
  const siteZero = sitePosition(0);
  const pad0 = vnorm({ x: siteZero.x, y: siteZero.y, z: siteZero.z });
  for (let guard = 0; guard < 20000; guard++) {
    const t = c.t;
    const dt = t < 20 ? 0.1 : 0.2;
    const o = c.origin();
    const alt = vlen(o) - R_EARTH;
    const up = vnorm(c.r);
    const hor = vnorm(vcross(planeN, up));
    // ── attitude
    if (Number.isNaN(towerClear) && alt >= p.towerClearAlt) {
      towerClear = t;
      pitchStart = t + 1.0;
    }
    let nose: V3 = up;
    const va = vsub(c.v, airVelocity(c.r));
    if (!Number.isNaN(pitchStart) && t >= pitchStart) {
      const u = clamp((t - pitchStart) / p.kickDur, 0, 1);
      const kickAng = kick * (u * u * (3 - 2 * u));
      const kickDir = vadd(vscale(up, Math.cos(kickAng)), vscale(hor, Math.sin(kickAng)));
      const vAng = vangle(va, up);
      nose = u >= 1 && vAng >= kick && vlen(va) > 1 ? vnorm(va) : kickDir;
    }
    const des = qlook(nose, p.side);
    let wFF: V3 | null = null;
    if (prevDes) {
      // feedforward: the target's own rotation rate
      const d = vsub(qaxisY(des), qaxisY(prevDes));
      wFF = vscale(vcross(qaxisY(prevDes), d), 1 / dt);
    }
    prevDes = des;
    const att: AttitudeCmd = { q: des, wMax: RATE_ASCENT.wMax, aMax: RATE_ASCENT.aMax, tau: 0.8 };
    // ── throttle
    const mass = c.mass;
    const prop = c.tanks.s1 ?? 0;
    if (!cutting) {
      let cmd = p.maxThrottle;
      if (p.bucket) {
        if (bucketState === 'pre' && c.mach >= p.bucket.downMach && t > 5) {
          bucketState = 'down';
          bucketT = t;
          tdown = t;
        }
        if (bucketState === 'down') {
          cmd = Math.min(cmd, p.bucket.level);
          if (c.q_dyn < qPeak * p.bucket.upFraction && t - bucketT > 6) {
            bucketState = 'up';
            tup = t;
          }
        }
      }
      // acceleration limit
      const nEng = center.n + outer.n;
      const thrG = (p.gLimit * mass) / (nEng * ENG_S1.thrustVac) + (c.pAmb * ENG_S1.area) / ENG_S1.thrustVac;
      cmd = Math.min(cmd, Math.max(E1.minThrottle, thrG));
      // rate-limit throttle changes (valves move at a finite rate)
      const maxStep = (bucketState === 'down' && throttleCmd > cmd ? 0.18 : 0.15) * dt;
      throttleCmd = throttleCmd + clamp(cmd - throttleCmd, -maxStep, maxStep);
      // cutoff checks
      let cut = false;
      if (p.cutoff.kind === 'reserve' || p.cutoff.kind === 'depletion') {
        const floor = p.cutoff.kind === 'reserve' ? p.cutoff.kg : p.cutoff.residual;
        const tailUse = ENG_S1.mdot * nEng * throttleCmd * TAIL_S1 * 0.5;
        if (prop - ENG_S1.mdot * nEng * throttleCmd * dt <= floor + tailUse) cut = true;
      } else {
        // predicted vacuum apogee including the tail-off impulse
        const aT = (nEng * throttleCmd * ENG_S1.thrustVac) / mass;
        const vv = vadd(c.v, vscale(qaxisY(c.q), aT * TAIL_S1 * 0.5));
        const el = elements(c.r, vv, MU_EARTH);
        if (el.ra - R_EARTH >= p.cutoff.alt) cut = true;
      }
      if (cut) {
        cutting = true;
        cutStart = t;
        cutFrom = throttleCmd;
        meco = t;
      }
    }
    if (cutting) {
      const u = clamp((t + dt - cutStart) / TAIL_S1, 0, 1);
      throttleCmd = cutFrom * (1 - u);
    }
    center.next = throttleCmd;
    outer.next = throttleCmd;
    c.step(dt, att, wFF);
    c.rcsActuator = false;
    // ── bookkeeping
    if (c.q_dyn > qPeak) {
      qPeak = c.q_dyn;
      maxQ = { t: c.t, q: c.q_dyn, alt: c.alt, mach: c.mach };
    }
    if (ctx && p.record) {
      ctx.rec(c, 0.5, cutting);
      s1Channels(ctx, c, outer.n);
    }
    if (cutting && c.t >= cutStart + TAIL_S1 - 1e-9) break;
    if ((c.tanks.s1 ?? 0) < 0) throw new Error('first stage ran dry before cutoff');
  }
  const v = c.v;
  const va = vsub(v, airVelocity(c.r));
  const downrange = R_EARTH * vangle(c.r, vrotateEarth(pad0, c.t));
  return {
    towerClear,
    pitchStart,
    throttleDown: tdown,
    throttleUp: tup,
    maxQ,
    meco,
    mecoState: { alt: c.alt, speed: vlen(v), airSpeed: vlen(va), gamma: flightPathAngle(c.r, va), downrange, prop: c.tanks.s1 ?? 0 },
  };
}

/** Pad direction rotated with the Earth to time t. */
function vrotateEarth(p: V3, t: number): V3 {
  const s = sitePosition(t);
  void p;
  return { x: s.x, y: s.y, z: s.z };
}

/** Throttle, propellant and gimbal channels for the first stage. */
export function s1Channels(ctx: Ctx, c: Craft, outerN: number) {
  const center = c.group('s1.center');
  const outer = c.group('s1.outer');
  const t = c.t;
  if (center) ctx.ch.key('s1.center.throttle', t, center.thr);
  if (outer) ctx.ch.key('s1.outer.throttle', t, (outer.thr * outerN) / 6);
  const frac = Math.max(0, c.tanks.s1 ?? 0) / S1.propellant;
  ctx.ch.key('s1.lox', t, frac);
  ctx.ch.key('s1.rp1', t, frac);
  const thrusting = (center?.thr ?? 0) + (outer?.thr ?? 0) > 0.05;
  if (thrusting) {
    const g = gimbalAngles(c, 1, 44.4);
    ctx.ch.key('s1.gimbalPitch', t, clamp(g.pitch, -E1.gimbalRangeDeg, E1.gimbalRangeDeg));
    ctx.ch.key('s1.gimbalYaw', t, clamp(g.yaw, -E1.gimbalRangeDeg, E1.gimbalRangeDeg));
  } else {
    ctx.ch.key('s1.gimbalPitch', t, 0);
    ctx.ch.key('s1.gimbalYaw', t, 0);
  }
}

/**
 * Engine deflection that produces the craft's current angular acceleration about its centre
 * of mass: T sin(delta) L = I alpha, I = m k^2 with k ~ 0.3 x stack length. Pitch is about body
 * -Z (nose toward body +X, downrange on an eastward ascent), yaw about body +X.
 */
export function gimbalAngles(c: Craft, gimbalY: number, stackLength: number): { pitch: number; yaw: number } {
  let T = 0;
  for (const g of c.groups) T += g.n * g.thr * g.eng.thrustVac;
  if (T < 1) return { pitch: 0, yaw: 0 };
  const m = c.mass;
  const L = Math.max(3, c.com.y - gimbalY);
  const k = 0.3 * stackLength;
  const I = m * k * k;
  const zb = qaxisZ(c.q);
  const xb = qrot(c.q, v3(1, 0, 0));
  const aPitch = -vdot(c.alpha, zb);
  const aYaw = vdot(c.alpha, xb);
  const toDeg = (a: number) => (Math.asin(clamp((I * a) / (T * L), -1, 1)) * 180) / Math.PI;
  return { pitch: toDeg(aPitch), yaw: toDeg(aYaw) };
}

// ───────────────────────────── upper stage ─────────────────────────────

export interface OrbitTarget {
  /** Cutoff radius (m) and specific energy (J/kg). */
  r: number;
  energy: number;
}

export interface UpperBurnPlan {
  /** Ignition ramp start (s) and guidance start. */
  tIgn: number;
  tGuide: number;
  planeN: V3;
  side: V3;
  gLimit: number;
  /** Mass drops during the burn (fairing release, abort tower) at fixed times; handled by callbacks in the recorded run. */
  drops: { t: number; kg: number; id: string }[];
  target: OrbitTarget;
  /** Steering constants (solved). */
  A: number;
  B: number;
}

export interface BurnHooks {
  /** Called after every accepted step (channels, recording). */
  step(c: Craft): void;
  /** Called at a scheduled drop instead of the plain mass change. */
  drop(c: Craft, id: string): void;
}

const TAIL_S2 = 0.6;
const IGN_S2 = 1.5;

function snapshot(c: Craft) {
  return { t: c.t, r: { ...c.r }, v: { ...c.v }, q: qclone(c.q), w: { ...c.w }, tanks: { ...c.tanks }, thr: c.groups.map((g) => [g.thr, g.next]), fixed: c.fixedMass };
}
function restore(c: Craft, s: ReturnType<typeof snapshot>) {
  c.t = s.t;
  c.r = { ...s.r };
  c.v = { ...s.v };
  c.q = qclone(s.q);
  c.w = { ...s.w };
  c.tanks = { ...s.tanks };
  c.groups.forEach((g, i) => {
    g.thr = s.thr[i][0];
    g.next = s.thr[i][1];
  });
  c.fixedMass = s.fixed;
}

/** Copy a craft for a trial run (no recording into the mission). */
export function cloneCraft(c: Craft): Craft {
  const k = new Craft({ bodies: [...c.bodies], t: c.t, r: c.r, v: c.v, q: c.q, w: c.w, fixedMass: c.fixedMass, tanks: { ...c.tanks }, aero: c.aero, comFn: c.comFn, env: { moonPhase0: c.env.moonPhase0, segments: [] } });
  k.groups = c.groups.map((g) => ({ ...g }));
  return k;
}

export interface BurnResult {
  tCut: number;
  tEnd: number;
  r: V3;
  v: V3;
  prop: number;
}

/**
 * Upper-stage burn from the ignition ramp to the end of the tail-off. The craft is at t <=
 * tIgn with its S2 group at zero throttle. Deterministic: the same plan gives the same result.
 */
export function upperBurn(c: Craft, plan: UpperBurnPlan, hooks: BurnHooks | null): BurnResult {
  const g = c.group('s2')!;
  const drops = [...plan.drops].sort((a, b) => a.t - b.t);
  let di = 0;
  let prevDes: Q | null = null;
  let thr = 0;
  let cutT = NaN;
  let holdQ: Q = qclone(c.q);
  const tailStepDt = 0.1;
  for (let guard = 0; guard < 20000; guard++) {
    const t = c.t;
    // scheduled drops at step boundaries
    while (di < drops.length && drops[di].t <= t + 1e-9) {
      if (hooks) hooks.drop(c, drops[di].id);
      else c.fixedMass -= drops[di].kg;
      di++;
    }
    const inTail = !Number.isNaN(cutT);
    let dt = c.alt < 100_000 ? 0.5 : 1.0;
    if (t < plan.tIgn) dt = Math.min(dt, plan.tIgn - t);
    if (t >= plan.tIgn && t < plan.tIgn + IGN_S2) dt = Math.min(dt, 0.5);
    if (di < drops.length) dt = Math.min(dt, drops[di].t - t);
    if (inTail) dt = tailStepDt;
    dt = Math.max(dt, 1e-3);
    // attitude
    const up = vnorm(c.r);
    const hor = vnorm(vcross(plan.planeN, up));
    let des: Q;
    if (t < plan.tGuide) des = holdQ;
    else {
      const chi = Math.atan(plan.A + plan.B * (t - plan.tGuide));
      des = qlook(vadd(vscale(hor, Math.cos(chi)), vscale(up, Math.sin(chi))), plan.side);
    }
    let wFF: V3 | null = null;
    if (prevDes && t >= plan.tGuide) {
      const d = vsub(qaxisY(des), qaxisY(prevDes));
      wFF = vscale(vcross(qaxisY(prevDes), d), 1 / dt);
    }
    prevDes = t >= plan.tGuide ? des : null;
    // throttle
    if (inTail) {
      thr = Math.max(0, thr - (dt / TAIL_S2) * cutFrom);
    } else if (t + dt <= plan.tIgn + 1e-9) thr = 0;
    else if (t < plan.tIgn + IGN_S2) thr = clamp((t + dt - plan.tIgn) / IGN_S2, 0, 1);
    else {
      const lim = clamp((plan.gLimit * c.mass) / ENG_S2.thrustVac, E1V.minThrottle, 1);
      thr = thr + clamp(lim - thr, -0.1 * dt, 0.1 * dt);
    }
    g.next = thr;
    const snap = inTail ? null : snapshot(c);
    const e0 = energyWithTail(c, g);
    c.step(dt, { q: des, wMax: RATE_UPPER.wMax, aMax: RATE_UPPER.aMax, tau: 1.5 }, wFF);
    if (!inTail && t >= plan.tIgn + IGN_S2) {
      const e1 = energyWithTail(c, g);
      if (e1 >= plan.target.energy && snap) {
        // cutoff inside this step: redo it up to the crossing, then start the tail-off
        const f = clamp((plan.target.energy - e0) / (e1 - e0), 0, 1);
        restore(c, snap);
        g.next = snap.thr[c.groups.indexOf(g)][0] + (thr - snap.thr[c.groups.indexOf(g)][0]) * f;
        if (f * dt > 1e-6) c.step(f * dt, { q: des, wMax: RATE_UPPER.wMax, aMax: RATE_UPPER.aMax, tau: 1.5 }, wFF);
        cutT = c.t;
        cutFrom = g.thr;
        thr = g.thr;
        holdQ = qclone(c.q);
        if (hooks) hooks.step(c);
        continue;
      }
    }
    if ((c.tanks.s2 ?? 0) < 0) throw new Error('upper stage ran dry before cutoff');
    if (hooks) hooks.step(c);
    if (inTail && thr <= 0) break;
  }
  return { tCut: cutT, tEnd: c.t, r: { ...c.r }, v: { ...c.v }, prop: c.tanks.s2 ?? 0 };
}
let cutFrom = 1;

/** Specific energy the stage will have after a tail-off started now. */
function energyWithTail(c: Craft, g: EngineGroup): number {
  const rn = vlen(c.r);
  const vn2 = vdot(c.v, c.v);
  const aT = (g.n * g.thr * g.eng.thrustVac) / c.mass;
  const dv = aT * TAIL_S2 * 0.5;
  const ax = qaxisY(c.q);
  return vn2 / 2 - MU_EARTH / rn + vdot(c.v, ax) * dv + (dv * dv) / 2;
}

/** Solve (A, B) so the cutoff has the target radius and zero flight-path angle. */
export function solveUpper(c: Craft, plan: UpperBurnPlan, opts: { A0: number; B0: number; iters?: number }): { A: number; B: number; res: BurnResult; err: number } {
  let A = opts.A0;
  let B = opts.B0;
  const run = (a: number, b: number) => {
    const k = cloneCraft(c);
    return upperBurn(k, { ...plan, A: a, B: b }, null);
  };
  const resid = (r: BurnResult) => {
    const rn = vlen(r.r);
    const vr = vdot(r.r, r.v) / rn;
    return [(rn - plan.target.r) / 1000, vr / 10];
  };
  let best = { A, B, res: run(A, B), err: Infinity };
  for (let it = 0; it < (opts.iters ?? 14); it++) {
    const r0 = run(A, B);
    const f0 = resid(r0);
    const err = Math.hypot(f0[0] * 1000, f0[1] * 10);
    if (err < best.err) best = { A, B, res: r0, err };
    if (Math.abs(f0[0]) < 0.02 && Math.abs(f0[1]) < 0.005) break;
    const hA = 1e-3;
    const hB = 1e-6;
    const fa = resid(run(A + hA, B));
    const fb = resid(run(A, B + hB));
    const J = [
      [(fa[0] - f0[0]) / hA, (fb[0] - f0[0]) / hB],
      [(fa[1] - f0[1]) / hA, (fb[1] - f0[1]) / hB],
    ];
    const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
    if (!Number.isFinite(det) || Math.abs(det) < 1e-30) break;
    let dA = -(J[1][1] * f0[0] - J[0][1] * f0[1]) / det;
    let dB = -(-J[1][0] * f0[0] + J[0][0] * f0[1]) / det;
    // damp large steps
    const sA = Math.abs(dA) / 0.3;
    const sB = Math.abs(dB) / 0.002;
    const s = Math.max(1, sA, sB);
    dA /= s;
    dB /= s;
    A += dA;
    B += dB;
  }
  const fin = run(best.A, best.B);
  return { A: best.A, B: best.B, res: fin, err: best.err };
}

export function circularEnergy(r: number): number {
  return -MU_EARTH / (2 * r);
}
export function ellipseEnergy(rp: number, ra: number): number {
  return -MU_EARTH / (rp + ra);
}

export const STACK_S2_PROP = S2.propellant;
export { rotateAbout };
function rotateAbout(v: V3, k: V3, a: number) {
  return vrotate(v, k, a);
}
