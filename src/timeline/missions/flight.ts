/**
 * The orbital ascent shared by the LEO, GTO, station and lunar missions: pad countdown,
 * first-stage flight, staging, booster return (RTLS) or disposal, and the upper-stage burn to
 * the insertion orbit (linear-tangent steering solved by shooting), with the fairing or abort
 * tower jettisoned on the way. Everything is recorded into the mission context.
 *
 * Deterministic searches (pitch-kick angle for the wanted cutoff flight-path angle, RTLS
 * propellant reserve and boostback aim bias, steering constants) run at build time, warm-started
 * from stored guesses so they converge in a few passes.
 */
import { ABORT_TOWER, E1, E1V, FAIRING, G0, PAYLOADS, S1, S2 } from '../../vehicle/spec';
import type { BodyId } from '../../vehicle/parts';
import { R_EARTH, EARTH_AXIS, OMEGA_EARTH } from '../../world/frames';
import { LANDING_ZONE } from '../../world/site';
import { cdSlender, cdTumbling } from '../physics/aero';
import {
  RATE_UPPER,
  cloneCraft,
  comFrom,
  ellipseEnergy,
  flyFirstStage,
  gimbalAngles,
  padBurn,
  padSequence,
  s1Channels,
  separateStages,
  shootKick,
  solveUpper,
  stackAtLiftoff,
  stackItems,
  upperBurn,
  type PadTimes,
  type S1Params,
  type S1Result,
  type StackSpec,
  type UpperBurnPlan,
} from '../physics/ascent';
import { Craft, airVelocity, type AttitudeCmd } from '../physics/craft';
import type { Ctx } from '../physics/context';
import { flyBoosterReturn, lzMiss, type RtlsResult } from '../physics/landing';
import { elements } from '../physics/kepler';
import {
  ENG_LES_JETTISON,
  FAIRING_OPEN_ANGLE,
  LANDED_NOZZLE_HEIGHT,
  LES_JETTISON_PROP,
  areaOf,
  fairingHalf,
  sumMass,
  type MassItem,
} from '../physics/vehicle';
import { MU_EARTH } from '../../world/frames';
import { DEG, clamp, qaxis, qmul, qrot, qaxisY, v3, vadd, vcross, vlen, vnorm, vscale, vsub, type V3 } from '../physics/vec';
import type { OriginSample } from '../physics/tracks';

export interface AscentConfig {
  spec: StackSpec;
  payloadKg?: number;
  /** Wanted air-relative flight-path angle at first-stage cutoff (deg) and a kick guess. */
  gammaMeco: number;
  /** RTLS sizing (null: expendable booster burning to depletion). */
  rtls: { reserve0: number; bias0: { e: number; n: number }; margin: number } | null;
  /** Insertion orbit (altitudes, m). */
  insertion: { rp: number; ra: number };
  ltg0: { A: number; B: number };
  /** Warm start for the pitch-kick search (deg): the stored converged value. */
  kick0?: number;
  gLimitS1: number;
  gLimitS2: number;
  /** Upper-stage propellant to keep for later burns (kg). */
  s2Keep: number;
  padStart: number;
  armsRetract: number;
  /** Mission end (for the landed booster's ground track). */
  end: number;
}

export interface AscentResult {
  upper: Craft;
  booster: Craft;
  s1: S1Result;
  rtls: RtlsResult | null;
  kick: number;
  reserve: number;
  times: Record<string, number>;
  burn: { tCut: number; tEnd: number; prop: number };
  detached: Craft[];
  items: MassItem[];
  liftoffMass: number;
}

export const PAD_TIMES = (start: number, arms: number): PadTimes => ({
  start,
  armsRetract: arms,
  engineStart: -3.0,
  centreRamp: [-3.0, -2.0],
  outerRamp: [-2.6, -1.4],
  outerN: 6,
  liftoffThrottle: 1,
});

export function s1Params(cfg: AscentConfig, reserve: number): Omit<S1Params, 'kickDeg' | 'record'> {
  return {
    heading: v3(1, 0, 0),
    side: v3(0, 0, 1),
    kickDur: 5,
    kickDelay: 6,
    towerClearAlt: 110,
    bucket: { downMach: 0.75, level: 0.7, upFraction: 0.9 },
    gLimit: cfg.gLimitS1,
    cutoff: cfg.rtls ? { kind: 'reserve', kg: reserve } : { kind: 'depletion', residual: 1400 },
    outerN: 6,
    liftoffThrottle: 1,
    maxThrottle: 1,
  };
}

/** Run the whole ascent and record it. */
export function flyOrbitalAscent(ctx: Ctx, cfg: AscentConfig): AscentResult {
  const pt = PAD_TIMES(cfg.padStart, cfg.armsRetract);
  const burned = padBurn(pt);
  const s1Load = S1.propellant - burned;
  const { items, bodies } = stackItems(cfg.spec, cfg.payloadKg);
  const trialEnv = { moonPhase0: null, segments: [] };
  const make = () => stackAtLiftoff(trialEnv, cfg.spec, s1Load, S2.propellant, pt, cfg.payloadKg);

  // ── deterministic sizing: kick angle, then (RTLS) reserve and boostback aim bias
  let reserve = cfg.rtls ? cfg.rtls.reserve0 : 0;
  let bias = cfg.rtls ? { ...cfg.rtls.bias0 } : { e: 0, n: 0 };
  let kick = shootKick(make, s1Params(cfg, reserve), cfg.gammaMeco, cfg.kick0 ?? 1.0).kick;
  if (cfg.rtls) {
    for (let it = 0; it < 7; it++) {
      const c = make();
      const r1 = flyFirstStage(null, c, { ...s1Params(cfg, reserve), kickDeg: kick, record: false });
      const sep = separateStages(null, c, r1.meco + 0.8, cfg.spec, false, items);
      const rr = flyBoosterReturn(null, sep.booster, { tSep: sep.tSep, bias, record: false, side: v3(0, 0, 1) });
      const zem = rr.aeroZem;
      const dProp = rr.propLeft - cfg.rtls.margin;
      const zemOk = !zem || Math.hypot(zem.e, zem.n) < 250;
      if (Math.abs(dProp) < 150 && zemOk && rr.miss < 3 && rr.touchdownSpeed < 2) break;
      if (zem) bias = { e: bias.e + zem.e / 0.95, n: bias.n + zem.n / 0.95 };
      // a failed landing leaves an unreliable propellant count: only adjust the reserve when the aim was good
      if (zemOk || it > 2) reserve = clamp(reserve - dProp * 1.15, 20_000, 120_000);
    }
  }

  // ── recorded flight
  const stack = stackAtLiftoff(ctx.env, cfg.spec, s1Load, S2.propellant, pt, cfg.payloadKg);
  const liftoffMass = stack.mass;
  padSequence(ctx, bodies, pt, { crew: cfg.spec.crew, liftoffMass, s1AtLiftoff: s1Load });
  stack.record();
  const s1 = flyFirstStage(ctx, stack, { ...s1Params(cfg, reserve), kickDeg: kick, record: true });
  const times: Record<string, number> = {};
  times.towerClear = s1.towerClear;
  times.pitchStart = s1.pitchStart;
  times.throttleDown = s1.throttleDown ?? NaN;
  times.throttleUp = s1.throttleUp ?? NaN;
  times.maxQ = s1.maxQ.t;
  times.meco = s1.meco;
  const sep = separateStages(ctx, stack, s1.meco + 0.8, cfg.spec, true, items);
  times.stageSep = sep.tSep;
  times.ses1 = sep.tSes1;
  const booster = sep.booster;

  // booster
  let rtls: RtlsResult | null = null;
  if (cfg.rtls) {
    rtls = flyBoosterReturn(ctx, booster, { tSep: sep.tSep, bias, record: true, side: v3(0, 0, 1) });
    landedBooster(ctx, booster, cfg.end);
    ctx.exists.booster = [cfg.padStart, cfg.end];
  } else {
    disposeBooster(ctx, booster, sep.tSep + 300);
    ctx.exists.booster = [cfg.padStart, sep.tSep + 300];
  }

  // ── upper stage: fairing (or abort tower) release time from a preliminary trial, then solve
  const upperTarget = { r: R_EARTH + cfg.insertion.rp, energy: ellipseEnergy(R_EARTH + cfg.insertion.rp, R_EARTH + cfg.insertion.ra) };
  const basePlan: UpperBurnPlan = { tIgn: sep.tSes1, tGuide: sep.tSes1 + 4, planeN: v3(0, 0, -1), side: v3(0, 0, 1), gLimit: cfg.gLimitS2, drops: [], target: upperTarget, A: cfg.ltg0.A, B: cfg.ltg0.B, residual: cfg.s2Keep };
  let dropT = cfg.spec.crew ? sep.tSes1 + 12 : fairingTime(stack, basePlan);
  const dropKg = cfg.spec.crew ? (cfg.spec.crewKg?.les ?? ABORT_TOWER.mass) : FAIRING.mass;
  const dropId = cfg.spec.crew ? 'les' : 'fairing';
  const releaseDelay = cfg.spec.crew ? 0 : FAIRING_OPEN_TIME;
  let plan: UpperBurnPlan = { ...basePlan, drops: [{ t: dropT + releaseDelay, kg: dropKg, id: dropId }] };
  let sol = solveUpper(stack, plan, { A0: cfg.ltg0.A, B0: cfg.ltg0.B });
  if (!cfg.spec.crew) {
    // make sure the converged trajectory is above 110 km with low heating at fairing release
    const again = fairingTime(stack, { ...plan, A: sol.A, B: sol.B });
    if (Math.abs(again - dropT) > 0.6) {
      dropT = again;
      plan = { ...basePlan, drops: [{ t: dropT + releaseDelay, kg: dropKg, id: dropId }] };
      sol = solveUpper(stack, plan, { A0: sol.A, B0: sol.B });
    }
  }
  if (sol.res.depleted) throw new Error(`upper stage cannot reach the insertion orbit (${cfg.spec.payload})`);
  const detached: Craft[] = [];
  const final = { ...plan, A: sol.A, B: sol.B };
  if (!cfg.spec.crew) {
    ctx.ch.key('fairing.open', cfg.padStart, 0);
    ctx.ch.key('fairing.open', dropT, 0);
    // the halves rotate on their base hinges (quadratic ease-in: they keep rotating after release)
    for (let i = 1; i <= 6; i++) ctx.ch.key('fairing.open', dropT + (FAIRING_OPEN_TIME * i) / 6, (i / 6) ** 2);
  }
  const burn = upperBurn(stack, final, {
    step: (c) => {
      ctx.rec(c, c.alt < 100_000 ? 0.5 : 1.0);
      s2Channels(ctx, c);
    },
    drop: (c, id) => {
      if (id === 'fairing') detached.push(...releaseFairing(ctx, c, items, cfg));
      else detached.push(jettisonLes(ctx, c, items, cfg));
    },
  });
  times.fairingSep = dropT;
  times.secoCut = burn.tCut;
  times.secoEnd = burn.tEnd;
  if (!cfg.spec.crew) {
    ctx.exists.fairingA = [cfg.padStart, dropT + releaseDelay + 240];
    ctx.exists.fairingB = [cfg.padStart, dropT + releaseDelay + 240];
    ctx.attached.fairingA = { to: 'upper', until: dropT + releaseDelay };
    ctx.attached.fairingB = { to: 'upper', until: dropT + releaseDelay };
  } else {
    ctx.exists.les = [cfg.padStart, dropT + 150];
    ctx.attached.les = { to: 'capsule', until: dropT };
  }
  for (const d of detached) flyDetached(ctx, d, d.bodies[0] === 'les' ? dropT + 150 : dropT + releaseDelay + 240);
  ctx.attached.upper = { to: 'booster', until: sep.tSep };
  // events of the ascent
  const ev = ctx;
  ev.ev('tower-clear', s1.towerClear, 'Tower cleared', 'milestone', ['booster']);
  if (Number.isFinite(times.throttleDown)) ev.ev('throttle-down', times.throttleDown, 'Throttle down to 70 % for maximum dynamic pressure', 'engine', ['booster']);
  ev.ev('pitch-start', s1.pitchStart, `Pitch kick: ${kick.toFixed(1)} deg toward the east, then the gravity turn`, 'milestone', ['booster']);
  ev.ev('max-q', s1.maxQ.t, `Maximum dynamic pressure: ${(s1.maxQ.q / 1000).toFixed(1)} kPa`, 'milestone', ['booster']);
  if (Number.isFinite(times.throttleUp)) ev.ev('throttle-up', times.throttleUp, 'Throttle back up', 'engine', ['booster']);
  ev.ev('meco', s1.meco, 'Main engine cutoff (MECO)', 'engine', ['booster'], 'cutoff');
  ev.ev('stage-sep', sep.tSep, 'Stage separation: pneumatic pushers', 'separation', ['booster', 'upper'], 'sep');
  ev.ev('ses1', sep.tSes1, 'Upper-stage engine start', 'engine', ['upper'], 'ignition');
  if (!cfg.spec.crew) ev.ev('fairing-sep', dropT, 'Fairing separation', 'separation', ['fairingA', 'fairingB', 'upper'], 'pyro');
  else ev.ev('les-jettison', dropT, 'Abort tower jettisoned by its own motor', 'separation', ['les', 'capsule'], 'pyro');
  if (rtls) rtlsEvents(ctx, rtls);
  ctx.fact('search.kickDeg', kick);
  ctx.fact('search.ltgA', sol.A);
  ctx.fact('search.ltgB', sol.B);
  if (cfg.rtls) {
    ctx.fact('search.rtlsReserveKg', reserve);
    ctx.fact('search.rtlsBiasE', bias.e);
    ctx.fact('search.rtlsBiasN', bias.n);
  }
  return { upper: stack, booster, s1, rtls, kick, reserve, times, burn: { tCut: burn.tCut, tEnd: burn.tEnd, prop: burn.prop }, detached, items, liftoffMass };
}

export const FAIRING_OPEN_TIME = 1.2;


/** First step time after ignition when the trajectory is above 112 km (trial run). */
function fairingTime(stack: Craft, plan: UpperBurnPlan): number {
  const k = cloneCraft(stack);
  let tf = NaN;
  upperBurn(k, plan, {
    step: (c) => {
      if (Number.isNaN(tf) && c.t > plan.tIgn + 3 && c.alt >= 112_000 && c.q_dyn < 60) tf = c.t;
    },
    drop: () => {},
  });
  if (Number.isNaN(tf)) tf = plan.tIgn + 30;
  // align to the upper-stage step grid (0.5 s)
  return plan.tIgn + Math.ceil((tf - plan.tIgn) / 0.5) * 0.5;
}

/** Upper-stage channels. */
export function s2Channels(ctx: Ctx, c: Craft) {
  const g = c.group('s2');
  const t = c.t;
  ctx.ch.key('s2.throttle', t, g ? g.thr : 0);
  const frac = Math.max(0, c.tanks.s2 ?? 0) / S2.propellant;
  ctx.ch.key('s2.lox', t, frac);
  ctx.ch.key('s2.rp1', t, frac);
  if (g && g.thr > 0.02) ctx.ch.key('s2.gimbalPitch', t, clamp(gimbalAngles(c, 44.7, 22.6).pitch, -E1V.gimbalRangeDeg, E1V.gimbalRangeDeg));
  else ctx.ch.key('s2.gimbalPitch', t, 0);
}

/** Fairing halves released from the upper stack: outward push and a slow tumble. */
function releaseFairing(_ctx: Ctx, c: Craft, items: MassItem[], cfg: AscentConfig): Craft[] {
  const out: Craft[] = [];
  // the upper stack's fixed items: everything but the booster dry and the fairing halves
  const rest = items.filter((it) => it.tag !== 'booster' && it.tag !== 'fairingA' && it.tag !== 'fairingB');
  void cfg;
  const w0 = c.w;
  for (const side of ['A', 'B'] as const) {
    const it = fairingHalf(side, 1);
    const body: BodyId = side === 'A' ? 'fairingA' : 'fairingB';
    const others = side === 'A' ? rest.concat([fairingHalf('B', 1)]) : rest;
    const parentFixed = sumMass(others).m;
    const child = c.split({
      bodies: [body],
      fixedMass: it.m,
      aero: { area: 20, cd: cdTumbling },
      comFn: () => it.c,
      parentFixedMass: parentFixed,
      parentComFn: comFrom(others),
    });
    // outward (body +/-Z) push ~2 m/s including the hinge swing, tumble about body +/-X continuing the opening
    const s = side === 'A' ? 1 : -1;
    const out3 = qrot(c.q, v3(0, 0, s));
    child.v = vadd(child.v, vscale(out3, 1.4));
    const openRate = (2 * FAIRING_OPEN_ANGLE) / FAIRING_OPEN_TIME; // end rate of the quadratic ease-in
    child.w = vadd(w0, vscale(qrot(c.q, v3(1, 0, 0)), s * openRate * 0.6));
    child.record();
    out.push(child);
  }
  return out;
}

/** Abort tower jettison: separates with its jettison motor (1.5 s), then coasts. */
function jettisonLes(ctx: Ctx, c: Craft, items: MassItem[], cfg: AscentConfig): Craft {
  const rest = items.filter((it) => it.tag !== 'booster' && it.tag !== 'les');
  const les = items.find((it) => it.tag === 'les')!;
  const child = c.split({
    bodies: ['les'],
    fixedMass: les.m - LES_JETTISON_PROP,
    aero: { area: areaOf(1.2), cd: cdSlender },
    comFn: () => les.c,
    parentFixedMass: sumMass(rest).m,
    parentComFn: comFrom(rest),
  });
  child.tanks.les = LES_JETTISON_PROP;
  child.groups = [{ id: 'les', eng: ENG_LES_JETTISON, n: 1, tank: 'les', thr: 1, next: 1, dirBody: v3(0.06, 0.998, 0) }];
  ctx.ch.key('les.motor', cfg.padStart, 0);
  ctx.ch.key('les.motor', c.t, 0);
  ctx.ch.key('les.motor', c.t + 0.1, 1);
  ctx.ch.key('les.motor', c.t + 1.5, 1);
  ctx.ch.key('les.motor', c.t + 1.8, 0);
  return child;
}

/** Fly a released body (fairing half, tower) until its track ends. */
function flyDetached(ctx: Ctx, d: Craft, until: number) {
  const g = d.groups[0];
  while (d.t < until - 1e-9) {
    const burning = !!g && g.thr > 0;
    const dt = Math.min(burning ? 0.1 : d.alt < 100_000 ? 0.5 : 1, until - d.t);
    if (g) {
      if ((d.tanks.les ?? 0) <= 1) {
        g.next = 0;
        g.thr = 0;
      } else g.next = 1;
    }
    d.step(dt, null);
    ctx.rec(d, 1.0);
  }
  ctx.rec(d, 0, true);
}

/** Expended booster: tumbles slowly, falls toward the ocean; its track ends before impact. */
export function disposeBooster(ctx: Ctx, b: Craft, until: number) {
  b.aero = { area: areaOf(3.7), cd: () => 1.1 };
  b.w = vadd(b.w, vscale(qrot(b.q, v3(0, 0, 1)), 1.5 * DEG));
  for (const g of b.groups) {
    g.thr = 0;
    g.next = 0;
  }
  while (b.t < until - 1e-9) {
    b.step(Math.min(0.5, until - b.t), null);
    ctx.rec(b, 1.0);
    s1Channels(ctx, b, 6);
  }
  ctx.rec(b, 0, true);
}

/** Booster standing on the landing zone, carried by the rotating Earth. */
export function landedBooster(ctx: Ctx, b: Craft, end: number) {
  const t0 = b.t;
  const o0 = b.origin();
  const q0 = b.q;
  const axis = { x: EARTH_AXIS.x, y: EARTH_AXIS.y, z: EARTH_AXIS.z };
  const origins: OriginSample[] = [];
  const step = Math.max(2, (end - t0) / 400);
  for (let t = t0 + 0.5; t <= end + step; t += t === t0 + 0.5 ? step - 0.5 : step) {
    const rot = qaxis(axis, OMEGA_EARTH * (t - t0));
    const p = qrot(rot, o0);
    origins.push({ t, p, v: vcross({ x: axis.x * OMEGA_EARTH, y: axis.y * OMEGA_EARTH, z: axis.z * OMEGA_EARTH }, p), q: qmul(rot, q0), m: b.mass });
  }
  ctx.direct.push({ bodies: ['booster'], origins });
}

export function rtlsEvents(ctx: Ctx, r: RtlsResult) {
  ctx.ev('boostback-start', r.boostbackStart, 'Boostback burn: three engines reverse the downrange velocity', 'burn', ['booster'], 'ignition');
  ctx.ev('boostback-end', r.boostbackEnd, 'Boostback cutoff: now falling back toward the landing zone', 'burn', ['booster'], 'cutoff');
  ctx.ev('fins-deploy', r.finsDeploy, 'Grid fins deploy', 'deploy', ['booster'], 'valve');
  ctx.ev('entry-start', r.entryStart, 'Entry burn: three engines slow the booster before the dense air', 'burn', ['booster'], 'ignition');
  ctx.ev('entry-end', r.entryEnd, 'Entry burn cutoff', 'burn', ['booster'], 'cutoff');
  ctx.ev('landing-start', r.landingStart, 'Landing burn: centre engine only', 'burn', ['booster'], 'ignition');
  ctx.ev('legs-deploy', r.touchdown - 8, 'Landing legs deploy', 'deploy', ['booster'], 'valve');
  ctx.ev('touchdown', r.touchdown, 'Touchdown on the landing zone', 'recovery', ['booster'], 'touchdown');
  ctx.ch.key('s1.fins', ctx.events.find((e) => e.id === 'liftoff')!.t - 60, 0);
  ctx.ch.key('s1.fins', r.finsDeploy, 0);
  ctx.ch.ease('s1.fins', r.finsDeploy, r.finsDeploy + 3, 1, 6);
  ctx.ch.key('s1.legs', -60, 0);
  ctx.ch.key('s1.legs', r.touchdown - 8, 0);
  ctx.ch.ease('s1.legs', r.touchdown - 8, r.touchdown - 5.5, 1, 6);
}

/** Facts common to the ascent. */
export function ascentFacts(ctx: Ctx, a: AscentResult, prefix = '') {
  const f = (k: string, v: number) => ctx.fact(prefix + k, v);
  f('liftoffMass', a.liftoffMass);
  f('liftoffTW', (S1.engineCount * E1.thrustSL!) / (a.liftoffMass * G0));
  f('kickDeg', a.kick);
  f('towerClear', a.s1.towerClear);
  f('maxQ.t', a.s1.maxQ.t);
  f('maxQ.kPa', a.s1.maxQ.q / 1000);
  f('maxQ.altKm', a.s1.maxQ.alt / 1000);
  f('maxQ.mach', a.s1.maxQ.mach);
  f('meco.t', a.s1.meco);
  f('meco.altKm', a.s1.mecoState.alt / 1000);
  f('meco.speed', a.s1.mecoState.speed);
  f('meco.airSpeed', a.s1.mecoState.airSpeed);
  f('meco.gammaDeg', (a.s1.mecoState.gamma * 180) / Math.PI);
  f('meco.downrangeKm', a.s1.mecoState.downrange / 1000);
  f('meco.s1PropLeft', a.s1.mecoState.prop);
  f('stageSep.t', a.times.stageSep);
  f('ses1.t', a.times.ses1);
  if (!a.items.some((it) => it.tag === 'les')) f('fairingSep.t', a.times.fairingSep);
  if (a.rtls) {
    const r = a.rtls;
    f('rtls.reserveKg', a.reserve);
    f('rtls.reservePct', (100 * a.reserve) / S1.propellant);
    f('rtls.boostbackDv', r.boostbackDv);
    f('rtls.entryDv', r.entryDv);
    f('rtls.landingDv', r.landingDv);
    f('rtls.apogeeKm', r.apogee.alt / 1000);
    f('rtls.touchdown.t', r.touchdown);
    f('rtls.landingErrorM', r.miss);
    f('rtls.touchdownSpeed', r.touchdownSpeed);
    f('rtls.propLeftKg', r.propLeft);
    f('rtls.tiltDeg', (r.tilt * 180) / Math.PI);
    f('rtls.maxDecelG', r.maxDecel / 9.80665);
    f('rtls.maxQkPa', r.maxQ / 1000);
  }
}

export const LZ = LANDING_ZONE;
export { LANDED_NOZZLE_HEIGHT, PAYLOADS, airVelocity, elements, MU_EARTH, lzMiss, vlen, vsub, vnorm, qaxisY, RATE_UPPER };
export type { AttitudeCmd, V3 };

/**
 * Parking-orbit coast of the upper stage to a restart: Kepler coast (prograde attitude) to a
 * minute before ignition, slew to the burn attitude, settling thrusters (s2.rcs, ullage) for
 * `settle` seconds, then the restart with an ignition ramp and an exact cutoff on `done`.
 */
export function coastSettleBurn(
  ctx: Ctx,
  up: Craft,
  o: { tIgn: number; settle: number; dir: (c: Craft) => V3; done: (r: V3, v: V3) => number; throttle?: number; dt?: number; onStep?: (c: Craft) => void },
): { settleStart: number; start: number; cut: number; end: number } {
  const rec = (c: Craft) => s2Channels(ctx, c);
  const pro = (c: Craft): AttitudeCmd => ({ q: progradeQ(c.r, c.v), wMax: 2 * DEG, aMax: 0.5 * DEG, tau: 3 });
  const tSettle = o.tIgn - o.settle;
  coastKeplerProgradeTo(ctx, up, tSettle - 60);
  // slew and settle with integrated steps
  while (up.t < tSettle - 1e-9) {
    up.step(Math.min(1, tSettle - up.t), pro(up));
    ctx.rec(up, 2);
  }
  ctx.ch.key('s2.rcs', tSettle - 0.1, 0);
  ctx.ch.key('s2.rcs', tSettle + 0.3, 1);
  const settleAcc = (2 * 440) / up.mass;
  while (up.t < o.tIgn - 1e-9) {
    up.extra = vscale(qaxisY(up.q), settleAcc);
    up.step(Math.min(0.5, o.tIgn - up.t), pro(up));
    ctx.rec(up, 1);
    rec(up);
  }
  up.extra = v3();
  const burn = orbitBurnS2(ctx, up, o);
  ctx.ch.key('s2.rcs', burn.start + 1.0, 1);
  ctx.ch.key('s2.rcs', burn.start + 1.5, 0);
  return { settleStart: tSettle, ...burn };
}

import { coastKepler, orbitBurn, progradeAttitude as progradeQ } from '../physics/orbit';

function coastKeplerProgradeTo(ctx: Ctx, c: Craft, until: number) {
  if (until <= c.t + 1) return;
  // a few integrated seconds first so the attitude settles on the prograde law, then Kepler
  const tt = Math.min(until, c.t + 30);
  while (c.t < tt - 1e-9) {
    c.step(Math.min(1, tt - c.t), { q: progradeQ(c.r, c.v), wMax: 2 * DEG, aMax: 0.5 * DEG, tau: 3 });
    ctx.rec(c, 2);
    s2Channels(ctx, c);
  }
  coastKepler(ctx, c, until, 20, (r, v) => progradeQ(r, v));
}

function orbitBurnS2(ctx: Ctx, up: Craft, o: { dir: (c: Craft) => V3; done: (r: V3, v: V3) => number; throttle?: number; dt?: number; onStep?: (c: Craft) => void }) {
  return orbitBurn(ctx, up, {
    group: 's2',
    dir: o.dir,
    done: o.done,
    ignition: 1.5,
    tail: 0.6,
    throttle: o.throttle ?? 1,
    dt: o.dt ?? 0.25,
    rate: { wMax: 3 * DEG, aMax: 1 * DEG },
    onStep: (c) => {
      s2Channels(ctx, c);
      o.onStep?.(c);
    },
  }, 1.0);
}
