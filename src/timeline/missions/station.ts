/**
 * Station delivery: the crew stack (capsule, service module, abort tower) rides the K-1 into the
 * station's orbital plane (the launch is timed so the pad lies in that plane at T-0: the plane
 * of a due-east launch, inclination 28.5 deg), the abort tower leaves after staging on its own
 * jettison motor, and the upper stage inserts the capsule into a 200 x 250 km orbit behind and
 * below the station. The capsule then phases for four revolutions (a lower orbit is a faster
 * orbit), raises its orbit with two service-module burns (Hohmann-like) to 3 km below the
 * station, and flies the final approach with Clohessy-Wiltshire relative motion: a two-impulse
 * transfer to a hold point 400 m straight below the station, then up the radial line (R-bar)
 * with holds at 400, 150 and 20 m and a closing speed of 0.08 m/s at contact; soft capture,
 * then hard capture.
 *
 * The booster is EXPENDED (outline: recovery false). The dataset's crew stack (spec.ts: capsule
 * 8,300 kg, service module 4,100 kg, abort tower 5,400 kg) is too heavy to fly with the
 * return-to-launch-site reserve of about 50 t, so the booster burns to its depletion margin,
 * carries no legs, and falls into the Atlantic downrange (flight.ts disposeBooster).
 *
 * Reference trajectory from the simplified point-mass model, computed once.
 */
import { MU_EARTH, R_EARTH } from '../../world/frames';
import type { MissionTimeline } from '../types';
import { ABORT_TOWER, CAPSULE } from '../../vehicle/spec';
import { cdCapsule, cdFreeMolecular } from '../physics/aero';
import { comFrom, type StackSpec } from '../physics/ascent';
import { Craft } from '../physics/craft';
import { Ctx } from '../physics/context';
import { elements, timeToAnomaly } from '../physics/kepler';
import { apsidesKm, coastKepler, incToEquator, orbitBurn, progradeAttitude } from '../physics/orbit';
import { absState, angleIn, circularOrbit, cwPropagate, cwTarget, lvlh, lvlhAttitude, orbitState, relState, type CircularOrbit, type Rel } from '../physics/rendezvous';
import { CAPSULE_DOCK_Y, ENG_SM, SM_DRY, SM_PROP_FULL, STATION_DOCK, STATION_MASS, areaOf, sumMass } from '../physics/vehicle';
import { DEG, qaxisY, qdelta, v3, vadd, vcross, vlen, vnorm, vscale, type V3 } from '../physics/vec';
import { OUTLINES } from './outline';
import { Pres, contiguous, phasesFrom, rateNote, shot, tidyShots } from './common';
import { ascentFacts, flyOrbitalAscent, s2Channels } from './flight';

const START = -60;
/** The dataset's crew stack (spec.ts CAPSULE, SERVICE_MODULE, ABORT_TOWER), flown with an expendable booster (kg). */
export const CREW_DATASET = { capsule: CAPSULE.mass, smDry: SM_DRY, smProp: SM_PROP_FULL, les: ABORT_TOWER.mass };
export const STATION_ALT = 400e3;
/**
 * Service-module propellant left after docking (kg): this mission's 'sm.propLeftKg' fact
 * (1,107.6 kg) rounded to the kilogram. The capsule-return mission starts with it, so the two
 * lessons agree; a test keeps the constant in step with this build.
 */
export const SM_PROP_AT_DOCKING = 1108;
const PHASING_REVS = 4;
/** Altitude the two phasing burns lead to: 3 km below the station. */
const H2 = 397e3;
/** Along-track distance behind the station when the relative-motion approach takes over (m). */
const BEHIND = 11_000;
/** Duration of the two-impulse transfer to the 400 m hold point (s). */
const TRANSFER = 2400;
const HOLDS = [400, 150, 20];

/** Smooth move from a to b over D seconds (sin^2 velocity bump): position and velocity at u in [0, 1]. */
function move(a: number, b: number, D: number, u: number): { x: number; v: number } {
  return { x: a + (b - a) * (u - Math.sin(2 * Math.PI * u) / (2 * Math.PI)), v: ((b - a) / D) * (1 - Math.cos(2 * Math.PI * u)) };
}

/** Station delivery with an expendable booster (see the header). */
export function buildStation(): MissionTimeline {
  const ctx = new Ctx();
  const O = OUTLINES.station;
  if (O.recovery || O.branch) throw new Error('station: the outline recovers the booster, but the dataset crew stack needs it expended');
  const CREW = CREW_DATASET;
  const SPEC: StackSpec = { payload: 'capsule', recovery: false, crew: true, boosterOnly: false, crewKg: CREW };
  const a = flyOrbitalAscent(ctx, {
    spec: SPEC,
    gammaMeco: 30,
    rtls: null,
    insertion: { rp: 200e3, ra: 250e3 },
    // warm starts: the converged values of the deterministic searches
    ltg0: { A: 0.19581, B: -0.00060079 },
    kick0: 0.6042,
    // crew limits: the booster throttles (all seven engines, within the E-1's 55 % minimum) to
    // hold 4 g near burnout, as crew launchers do; the upper stage holds 4 g as well
    gLimitS1: 4.0 * 9.80665,
    gLimitS2: 4.0 * 9.80665,
    s2Keep: 300,
    padStart: START,
    armsRetract: -45,
    end: 60_000,
  });
  const up = a.upper;
  const tSeco = a.burn.tCut;
  ctx.ev('seco', tSeco, 'Upper-stage cutoff: the capsule is in a 200 x 250 km orbit below the station', 'engine', ['upper'], 'cutoff');
  const ins = apsidesKm(up.r, up.v);
  const insInc = incToEquator(up.r, up.v);

  // ── capsule separation
  const tSep = Math.ceil(tSeco + 60);
  while (up.t < tSep - 1e-9) {
    up.step(Math.min(1, tSep - up.t), { q: progradeAttitude(up.r, up.v), wMax: 2 * DEG, aMax: 0.5 * DEG, tau: 3 });
    ctx.rec(up, 2);
    s2Channels(ctx, up);
  }
  const crewItems = a.items.filter((it) => it.tag === 'capsule' || it.tag === 'service');
  const upperItems = a.items.filter((it) => it.tag === 'upper');
  const cap = up.split({ bodies: ['capsule', 'service'], fixedMass: sumMass(crewItems).m, tankIds: ['sm'], aero: { area: areaOf(3.9), cd: cdCapsule }, comFn: comFrom(crewItems), parentFixedMass: sumMass(upperItems).m, parentComFn: comFrom(upperItems) });
  cap.groups = [{ id: 'sm', eng: ENG_SM, n: 1, tank: 'sm', thr: 0, next: 0 }];
  const ax = qaxisY(up.q);
  const mC = cap.mass;
  const mU = up.mass;
  cap.v = vadd(cap.v, vscale(ax, (0.4 * mU) / (mC + mU)));
  up.v = vadd(up.v, vscale(ax, (-0.4 * mC) / (mC + mU)));
  cap.record();
  up.record();
  ctx.ev('capsule-sep', tSep, 'Capsule separation: springs push the capsule and service module clear', 'separation', ['capsule', 'upper'], 'sep');
  const tArrays = tSep + 25;
  ctx.ch.key('sm.arrays', START, 0);
  ctx.ch.key('sm.arrays', tArrays, 0);
  ctx.ch.ease('sm.arrays', tArrays, tArrays + 50, 1, 12);
  ctx.ev('arrays-deploy', tArrays, 'Service-module solar arrays unfold', 'deploy', ['service']);
  ctx.attached.capsule = { to: 'upper', until: tSep };
  // upper stage: backs away, coasts, its track ends
  const upEnd = tSep + 1500;
  up.extra = vscale(ax, -0.03);
  while (up.t < tSep + 30 - 1e-9) {
    up.step(1, null);
    ctx.rec(up, 2);
  }
  up.extra = v3();
  coastKepler(ctx, up, upEnd, 30, null);

  // ── phasing: coast PHASING_REVS revolutions, burn 1 at perigee, burn 2 at apogee
  const hold = (c: Craft, until: number, every = 2) => {
    while (c.t < until - 1e-9) {
      c.step(Math.min(1, until - c.t), { q: progradeAttitude(c.r, c.v), wMax: 2 * DEG, aMax: 0.5 * DEG, tau: 3 });
      ctx.rec(c, every);
      rcs(ctx, c);
    }
  };
  hold(cap, tSep + 60);
  const el1 = elements(cap.r, cap.v, MU_EARTH);
  const tPeri = cap.t + timeToAnomaly(cap.r, cap.v, MU_EARTH, 0) + (PHASING_REVS - 1) * el1.period;
  // a service-module burn centred on tMid, its length estimated from the impulsive step dvEst
  const smBurn = (id: string, tMid: number, dvEst: number, done: (r: V3, v: V3) => number) => {
    const dur = (cap.mass * dvEst) / ENG_SM.thrustVac;
    const t0 = Math.round(tMid - dur / 2);
    coastKepler(ctx, cap, t0 - 90, 60, (r, v) => progradeAttitude(r, v));
    hold(cap, t0);
    const vStart = vlen(cap.v);
    const b = orbitBurn(ctx, cap, { group: 'sm', dir: (c) => vnorm(c.v), done, ignition: 0.6, tail: 0.4, throttle: 1, dt: 0.2, rate: { wMax: 2 * DEG, aMax: 0.5 * DEG } }, 0.5);
    ctx.ch.key('sm.throttle', START, 0);
    ctx.ch.key('sm.throttle', b.start, 0);
    ctx.ch.key('sm.throttle', b.start + 0.6, 1);
    ctx.ch.key('sm.throttle', b.cut, 1);
    ctx.ch.key('sm.throttle', b.end, 0);
    void id;
    return { ...b, dv: vlen(cap.v) - vStart };
  };
  const vis = (r: number, a: number) => Math.sqrt(MU_EARTH * (2 / r - 1 / a));
  const rP1 = el1.a * (1 - el1.e);
  const pb1 = smBurn('pb1', tPeri, vis(rP1, (rP1 + R_EARTH + H2) / 2) - vis(rP1, el1.a), (r, v) => {
    const e = elements(r, v, MU_EARTH);
    return e.ra - (R_EARTH + H2);
  });
  const dv1 = pb1.dv;
  ctx.ev('phasing-burn-1', pb1.start, `Phasing burn 1 at perigee: +${dv1.toFixed(0)} m/s raises the far side of the orbit to ${(H2 / 1000).toFixed(0)} km`, 'burn', ['capsule', 'service'], 'ignition');
  const tApo = cap.t + timeToAnomaly(cap.r, cap.v, MU_EARTH, Math.PI);
  const el2 = elements(cap.r, cap.v, MU_EARTH);
  const rA2 = el2.a * (1 + el2.e);
  // cut when the perigee reaches 3 km below the station, or (burning a little below apogee,
  // where the perigee cannot rise above the current radius) when the orbit is circular there
  const pb2 = smBurn('pb2', tApo, Math.sqrt(MU_EARTH / rA2) - vis(rA2, el2.a), (r, v) => {
    const e = elements(r, v, MU_EARTH);
    return e.rp - Math.min(R_EARTH + H2, vlen(r) - 30);
  });
  const dv2 = pb2.dv;
  ctx.ev('phasing-burn-2', pb2.start, `Phasing burn 2 at apogee: +${dv2.toFixed(0)} m/s rounds the orbit off 3 km below the station`, 'burn', ['capsule', 'service'], 'ignition');
  const afterRaise = apsidesKm(cap.r, cap.v);

  // ── station orbit: coplanar with the capsule (the launch plane), phased so the capsule is
  // BEHIND metres behind it when the relative-motion approach takes over
  const tH = Math.ceil(pb2.end + 120);
  hold(cap, tH);
  const hN = vnorm(vcross(cap.r, cap.v));
  const RS = R_EARTH + STATION_ALT;
  const provisional = circularOrbit(RS, hN, v3(0, 1, 0), 0);
  const thetaCap = angleIn(provisional, cap.r);
  const theta0 = thetaCap + BEHIND / RS - provisional.n * tH;
  const orb: CircularOrbit = { ...provisional, theta0 };
  // phase angle at insertion (station ahead of the capsule), for the lesson
  const insPhaseDeg = (((angleIn(orb, orbitState(orb, tSeco).r) - angleIn(orb, capsuleAt(ctx, tSeco) ?? cap.r)) * 180) / Math.PI + 720) % 360;

  // ── relative-motion approach (Clohessy-Wiltshire), authored about the station
  const n = orb.n;
  const comY = cap.com.y;
  // capsule COM radial offset for a port-to-port range d (capsule in the LVLH attitude, port up)
  const rFor = (d: number) => STATION_DOCK.y - (CAPSULE_DOCK_Y - comY) - d;
  const x0 = relState(orb, tH, cap.r, cap.v);
  const x1 = cwTarget(x0, n, TRANSFER, rFor(HOLDS[0]), 0);
  const dvCw1 = Math.hypot(x1.vr - x0.vr, x1.vs - x0.vs, x1.vw - x0.vw);
  const xArr = cwPropagate(x1, n, TRANSFER);
  const dvCw2 = Math.hypot(xArr.vr, xArr.vs, xArr.vw);
  const tHold1 = tH + TRANSFER;
  // schedule: hold, move, hold, move, hold, final
  const H1 = 240;
  const M1 = 1000;
  const H2h = 180;
  const M2 = 1300;
  const H3 = 120;
  const vFinal = 0.08;
  const ramp = 20;
  const dFinal = HOLDS[2];
  const tFinalStart = tHold1 + H1 + M1 + H2h + M2 + H3;
  const tContact = tFinalStart + ramp + (dFinal - (vFinal * ramp) / 2) / vFinal;
  const tHard = tContact + 240;
  const end = tHard + 150;
  const relAt = (t: number): Rel => {
    if (t <= tHold1) return cwPropagate(x1, n, t - tH);
    let tt = t - tHold1;
    const R = (d: number, vd: number): Rel => ({ r: rFor(d), s: 0, w: 0, vr: -vd, vs: 0, vw: 0 });
    if (tt <= H1) return R(HOLDS[0], 0);
    tt -= H1;
    if (tt <= M1) {
      const m = move(HOLDS[0], HOLDS[1], M1, tt / M1);
      return R(m.x, m.v);
    }
    tt -= M1;
    if (tt <= H2h) return R(HOLDS[1], 0);
    tt -= H2h;
    if (tt <= M2) {
      const m = move(HOLDS[1], HOLDS[2], M2, tt / M2);
      return R(m.x, m.v);
    }
    tt -= M2;
    if (tt <= H3) return R(HOLDS[2], 0);
    tt -= H3;
    // final: accelerate to vFinal over `ramp` s, then constant closing speed to contact
    const tc = tContact - tFinalStart;
    if (tt >= tc) return R(0, 0);
    const d = tt <= ramp ? dFinal - (vFinal * tt * tt) / (2 * ramp) : dFinal - (vFinal * ramp) / 2 - vFinal * (tt - ramp);
    const vd = tt <= ramp ? (-vFinal * tt) / ramp : -vFinal;
    return R(d, vd);
  };
  // record capsule and station on a shared time grid during the approach
  const stationCraft = new Craft({ bodies: ['station'], t: START, r: v3(), v: v3(), q: { x: 0, y: 0, z: 0, w: 1 }, fixedMass: STATION_MASS, aero: { area: 1, cd: cdFreeMolecular }, comFn: () => v3(), env: ctx.env });
  const setStation = (t: number) => {
    const st = orbitState(orb, t);
    stationCraft.t = t;
    stationCraft.r = st.r;
    stationCraft.v = st.v;
    stationCraft.q = lvlhAttitude(lvlh(orb, t));
    stationCraft.w = vscale(orb.h, n);
    stationCraft.record();
  };
  for (let t = START; t < tH - 1e-9; t += 60) setStation(t);
  // capsule attitude: slews from its burn attitude to the station's LVLH attitude over the transfer
  const q0 = cap.q;
  let prevQ = q0;
  let lastT = tH;
  const grid: number[] = [];
  for (let t = tH; t <= end + 1e-9; t += t < tHold1 ? 20 : t < tContact - 60 ? 10 : 2) grid.push(t);
  if (grid[grid.length - 1] < end) grid.push(end);
  const docked = (t: number) => t >= tContact;
  const rcsKeys: [number, number][] = [];
  // impulses of the two-impulse transfer (RCS firings)
  for (const [t0, dv] of [[tH, dvCw1], [tHold1, dvCw2]] as [number, number][]) {
    const dur = Math.max(2, dv / 0.3);
    rcsKeys.push([t0 - 0.1, 0], [t0 + 0.4, 1], [t0 + dur, 1], [t0 + dur + 0.4, 0]);
  }
  let rcsAct = 0;
  for (const t of grid) {
    setStation(t);
    const x = relAt(t);
    const s = absState(orb, t, x);
    const target = lvlhAttitude(lvlh(orb, t));
    const u = Math.min(1, (t - tH) / 600);
    const q = u >= 1 ? target : slerpQ(q0, target, u * u * (3 - 2 * u));
    cap.t = t;
    cap.r = s.p;
    cap.v = s.v;
    cap.q = q;
    cap.w = t > lastT ? vscale(qdelta(prevQ, q), 1 / (t - lastT)) : vscale(orb.h, n);
    if (docked(t)) cap.w = vscale(orb.h, n);
    cap.record();
    prevQ = q;
    lastT = t;
    // RCS activity: the thrust the CW equations say the approach needs (holds and moves)
    let f = 0;
    if (t > tHold1 && t < tContact) {
      const dd = 0.5;
      const xa = relAt(t - dd);
      const xb = relAt(t + dd);
      const ar = (xb.vr - xa.vr) / (2 * dd);
      f = Math.abs(ar - 3 * n * n * x.r - 2 * n * x.vs);
    }
    const act = t > tHold1 && t < tContact ? Math.min(1, 0.15 + f / 0.01) : 0;
    if (Math.abs(act - rcsAct) > 0.02 && t > tHold1 + 30) rcsKeys.push([t, act]);
    rcsAct = act;
  }
  ctx.ch.key('sm.rcs', START, 0);
  for (const [t, v] of rcsKeys.sort((p, q) => p[0] - q[0])) ctx.ch.key('sm.rcs', t, v);
  ctx.ch.key('sm.rcs', tContact, 0);
  ctx.ch.key('cap.noseCone', START, 0);
  ctx.ch.key('cap.noseCone', tH - 300, 0);
  ctx.ch.ease('cap.noseCone', tH - 300, tH - 240, 1, 8);
  ctx.ch.key('cap.docked', START, 0);
  ctx.ch.key('cap.docked', tContact, 0);
  ctx.ch.ease('cap.docked', tContact, tContact + 3, 0.5, 4);
  ctx.ch.key('cap.docked', tHard, 0.5);
  ctx.ch.ease('cap.docked', tHard, tHard + 20, 1, 6);
  ctx.ch.key('cap.rcs', START, 0);
  ctx.ev('hold-point', tHold1, 'Hold point 400 m below the station, on the radial line', 'milestone', ['capsule', 'station']);
  ctx.ev('hold-point-150', tHold1 + H1 + M1, 'Hold point 150 m below', 'milestone', ['capsule', 'station']);
  ctx.ev('hold-point-20', tHold1 + H1 + M1 + H2h + M2, 'Hold point 20 m below: final go for docking', 'milestone', ['capsule', 'station']);
  ctx.ev('soft-capture', tContact, `Soft capture: contact at ${vFinal.toFixed(2)} m/s`, 'dock', ['capsule', 'station'], 'dock');
  ctx.ev('hard-capture', tHard, 'Hard capture: hooks close, the capsule is docked', 'dock', ['capsule', 'station'], 'dock');

  // ── existence and attachment
  ctx.exists.upper = [START, upEnd];
  ctx.exists.capsule = [START, end];
  ctx.exists.service = [START, end];
  ctx.exists.station = [START, end];
  ctx.attached.service = { to: 'capsule', until: end };

  // ── phases
  const T = a.times;
  const E = (id: string) => ctx.evt(id);
  const bounds = [START, E('engine-start'), 0, T.throttleDown, T.stageSep, T.ses1, E('les-jettison') + 12, tSep, tSep + 120, pb1.start, tH, tContact, end];
  const phases = phasesFrom('station', O.phases, contiguous(O.phases.map((p) => p.id), bounds));
  const tLes = E('les-jettison');
  const shots = tidyShots(
    [
      shot('pad-wide', START, -14, 'booster', undefined, { look: 0.4 }),
      shot('pad-close', -14, 5, 'booster', undefined, { look: -0.7, fov: 30 }),
      shot('tower', 5, T.towerClear + 3, 'booster'),
      shot('pad-wide', T.towerClear + 3, T.towerClear + 16, 'booster'),
      shot('ground-track', T.towerClear + 16, T.throttleDown, 'booster'),
      shot('chase', T.throttleDown, T.meco - 8, 'booster', undefined, { d: 110, az: 25, el: 6 }),
      shot('staging', T.meco - 8, T.ses1 + 4, 'upper', 'booster', { d: 75, az: 100, el: 8 }),
      shot('staging', T.ses1 + 4, tLes + 16, 'upper', 'les', { d: 60, az: 70, el: 12 }),
      shot('chase', tLes + 16, tSeco - 60, 'upper', 'earth', { d: 60, az: 30, el: 10 }),
      shot('chase', tSeco - 60, tSep - 10, 'upper', undefined, { d: 45, az: 150, el: 10 }),
      shot('staging', tSep - 10, tSep + 20, 'capsule', 'upper', { d: 40, az: 100, el: 10 }),
      shot('deploy', tSep + 20, tArrays + 70, 'capsule', undefined, { d: 26, az: 120, el: 18, look: -0.3 }),
      shot('orbit', tArrays + 70, pb1.start - 20, 'capsule', 'earth', { d: 40 }),
      shot('chase', pb1.start - 20, pb1.end + 20, 'capsule', undefined, { d: 30, az: 150, el: 12 }),
      shot('orbit', pb1.end + 20, pb2.start - 20, 'capsule', 'earth', { d: 40, az: 200, el: 20 }),
      shot('chase', pb2.start - 20, pb2.end + 20, 'capsule', undefined, { d: 30, az: 150, el: 12 }),
      shot('orbit', pb2.end + 20, tH + 600, 'capsule', 'earth', { d: 40 }),
      shot('approach', tH + 600, tHold1 + H1, 'capsule', 'station', { d: 60, az: 180, el: -30, mix: 0.3 }),
      shot('approach', tHold1 + H1, tFinalStart, 'capsule', 'station', { d: 40, az: 90, el: -10, mix: 0.5 }),
      shot('approach', tFinalStart, end, 'capsule', 'station', { d: 25, az: 80, el: 0, mix: 0.6 }),
    ],
    START,
    end,
  );

  // ── presentation
  const pres = new Pres(START)
    .to(tSeco + 20)
    .to(tSep - 10, 2, rateNote('Coast', 2))
    .to(tSep + 15)
    .to(tArrays + 50, 2, rateNote('Arrays deploying', 2))
    .omit(pb1.start - 10, 'Quiet interval omitted: about six hours of phasing in the lower, faster orbit')
    .to(pb1.end + 10)
    .to(pb2.start - 10, 180, rateNote('Coast to apogee', 180))
    .to(pb2.end + 10)
    .to(tHold1, 150, rateNote('Relative-motion transfer', 150))
    .to(tHold1 + H1, 30, rateNote('Hold', 30))
    .to(tHold1 + H1 + M1, 80, rateNote('Approach', 80))
    .to(tHold1 + H1 + M1 + H2h, 30, rateNote('Hold', 30))
    .to(tFinalStart - H3, 80, rateNote('Approach', 80))
    .to(tFinalStart, 30, rateNote('Hold', 30))
    .to(tContact - 20, 5, rateNote('Final approach', 5))
    .to(tContact + 10)
    .to(end, 12, rateNote('Capture sequence', 12)).segs;

  // ── facts
  ascentFacts(ctx, a);
  const f = (k: string, v: number) => ctx.fact(k, v);
  f('crew.capsuleKg', CREW.capsule);
  f('crew.serviceModuleKg', CREW.smDry + CREW.smProp);
  f('crew.abortTowerKg', CREW.les);
  f('crew.dataset', 1);
  f('les.t', tLes);
  f('seco.t', tSeco);
  f('seco.s2PropLeftKg', a.burn.prop);
  f('insertion.periKm', ins.peri);
  f('insertion.apoKm', ins.apo);
  f('insertion.incDeg', insInc);
  f('insertion.stationLeadDeg', insPhaseDeg);
  f('capsuleSep.t', tSep);
  f('phasing.revs', PHASING_REVS);
  f('phasingBurn1.t', pb1.start);
  f('phasingBurn1.dv', dv1);
  f('phasingBurn2.t', pb2.start);
  f('phasingBurn2.dv', dv2);
  f('raise.periKm', afterRaise.peri);
  f('raise.apoKm', afterRaise.apo);
  f('approach.t', tH);
  f('approach.behindKm', BEHIND / 1000);
  f('approach.belowKm', -x0.r / 1000);
  f('cw.dv1', dvCw1);
  f('cw.dv2', dvCw2);
  f('holdPoint.t', tHold1);
  f('softCapture.t', tContact);
  f('hardCapture.t', tHard);
  f('docking.closingSpeed', vFinal);
  f('docking.capsulePortY', CAPSULE_DOCK_Y);
  f('docking.hoursAfterLaunch', tContact / 3600);
  f('sm.propLeftKg', cap.tanks.sm ?? 0);
  f('station.altKm', STATION_ALT / 1000);
  f('station.periodMin', (2 * Math.PI) / n / 60);

  return {
    id: 'station',
    variant: ['capsule', 'expendable'],
    payload: 'capsule',
    start: START,
    end,
    bodies: ctx.tracks(end, ['booster', 'upper', 'capsule', 'service', 'les', 'station']),
    channels: ctx.ch.build(),
    events: ctx.sortedEvents(),
    phases,
    branches: [],
    shots,
    pres,
    moonPhase0: 0,
    facts: ctx.facts,
  };
}

function rcs(ctx: Ctx, c: Craft) {
  const a = vlen(c.alpha) / (0.3 * DEG);
  ctx.ch.key('cap.rcs', c.t, a > 0.05 ? Math.min(1, 0.3 + 0.7 * a) : 0);
}

/** The capsule's recorded COM at time t (nearest sample), if any. */
function capsuleAt(ctx: Ctx, t: number): V3 | null {
  let best: { t: number; r: V3 } | null = null;
  for (const s of ctx.env.segments) {
    if (!s.bodies.includes('capsule')) continue;
    for (const smp of s.samples) if (!best || Math.abs(smp.t - t) < Math.abs(best.t - t)) best = { t: smp.t, r: smp.r };
  }
  return best ? best.r : null;
}

import { qslerp as slerpQ } from '../physics/vec';
