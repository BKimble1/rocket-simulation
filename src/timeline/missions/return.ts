/**
 * Capsule return: the crew vehicle starts docked under the station (400 km circular orbit in
 * the launch plane), undocks and backs away down the radial line (Clohessy-Wiltshire relative
 * motion), makes a small departure burn, turns to the burn attitude and fires the service-
 * module engine retrograde for about 100 m/s: the far side of the orbit now dips to about
 * 45 km. Before entry interface (120 km) the service module separates (its track ends where it
 * breaks up); the capsule enters heat shield first with a little lift (an effective vertical
 * L/D standing for a trimmed capsule flying bank reversals), survives peak heating and
 * deceleration, opens drogues at 7 km and mains at 2 km (reefed, then full) and splashes down
 * in the Atlantic a few hundred kilometres east of the launch site.
 *
 * Masses from spec.ts (capsule 8.3 t at entry, service module 4.1 t). Mission time: the lesson
 * starts about a day after launch (T+23 h), the moment the station's ground track brings the
 * splashdown zone east of the pad; the station's phase is set by a short deterministic
 * iteration so the capsule comes down there.
 *
 * Reference trajectory from the simplified point-mass model, computed once.
 */
import { CAPSULE, SERVICE_MODULE } from '../../vehicle/spec';
import { MU_EARTH, OMEGA_EARTH, R_EARTH, latLonOf } from '../../world/frames';
import * as THREE from 'three';
import type { MissionTimeline, Shot } from '../types';
import { cdCapsule, cdTumbling } from '../physics/aero';
import { comFrom } from '../physics/ascent';
import { Craft, type Env } from '../physics/craft';
import { Ctx } from '../physics/context';
import { CAPSULE_AREA, DROGUE_CDA, MAIN_CDA, flyCapsuleDescent, type DescentResult } from '../physics/entry';
import { elements } from '../physics/kepler';
import { apsidesKm, coastKepler, orbitBurn, retrogradeAttitude } from '../physics/orbit';
import { absState, angleIn, circularOrbit, cwPropagate, lvlh, lvlhAttitude, orbitState, type CircularOrbit, type Rel } from '../physics/rendezvous';
import { CAPSULE_DOCK_Y, CAPSULE_ITEM, ENG_SM, SM_COM, SM_DRY, SM_PROP_FULL, STATION_DOCK, STATION_MASS, areaOf, sumMass, type MassItem } from '../physics/vehicle';
import { DEG, qaxisX, qdelta, qslerp, v3, vadd, vcross, vlen, vnorm, vscale, type Q, type V3 } from '../physics/vec';
import { OUTLINES } from './outline';
import { Pres, contiguous, phasesFrom, rateNote, shot, tidyShots } from './common';
import { STATION_ALT } from './station';

/** Splashdown this many degrees of longitude east of the pad (about 290 km at 28.5 deg N). */
const SPLASH_EAST_DEG = 3.0;
const SIDEREAL_DAY = (2 * Math.PI) / OMEGA_EARTH;
/** Timeline after undocking (s): departure burn, deorbit ignition. */
const DEPART = 150;
const DEORBIT = 2700;
/** Deorbit target: vacuum perigee altitude (m). */
const PERIGEE = 45e3;

const ITEMS: MassItem[] = [CAPSULE_ITEM, { m: SM_DRY, c: SM_COM, tag: 'service' }];
const CAP_ONLY: MassItem[] = [CAPSULE_ITEM];

interface ReturnRun {
  undock: number;
  depart: number;
  deorbit: { start: number; cut: number; end: number; dv: number; perigeeKm: number };
  smSep: number;
  smEnd: number;
  d: DescentResult;
  splashAngle: number;
  cap: Craft;
  orb: CircularOrbit;
  dvDepart: number;
}

function station(theta0: number): CircularOrbit {
  // the launch plane (normal -Z in frame I), angle measured from the pad's T-0 zenith (+Y)
  return circularOrbit(R_EARTH + STATION_ALT, v3(0, 0, -1), v3(0, 1, 0), theta0);
}

/** Relative state of the docked capsule's centre of mass (port to port, LVLH attitude). */
function dockedRel(comY: number): Rel {
  return { r: STATION_DOCK.y - (CAPSULE_DOCK_Y - comY), s: 0, w: 0, vr: 0, vs: 0, vw: 0 };
}

function fly(ctx: Ctx | null, env: Env, theta0: number, tU: number, start: number, end: number): ReturnRun {
  const orb = station(theta0);
  const n = orb.n;
  const cap = new Craft({ bodies: ['capsule', 'service'], t: start, r: v3(), v: v3(), q: { x: 0, y: 0, z: 0, w: 1 }, fixedMass: sumMass(ITEMS).m, tanks: { sm: SM_PROP_FULL }, aero: { area: CAPSULE_AREA, cd: cdCapsule }, comFn: comFrom(ITEMS), env });
  cap.groups = [{ id: 'sm', eng: ENG_SM, n: 1, tank: 'sm', thr: 0, next: 0 }];
  const comY = cap.com.y;
  const x0 = dockedRel(comY);
  // undocking: springs push the capsule down the radial line at 0.12 m/s; departure burn: 1 m/s
  // retrograde and 0.3 m/s down (a lower orbit is faster: the capsule moves ahead and below)
  const xU: Rel = { ...x0, vr: -0.12 };
  const xD0 = cwPropagate(xU, n, DEPART);
  const xD: Rel = { ...xD0, vr: xD0.vr - 0.3, vs: xD0.vs - 1.0 };
  const dvDepart = Math.hypot(0.3, 1.0);
  const relAt = (t: number): Rel => (t <= tU ? x0 : t <= tU + DEPART ? cwPropagate(xU, n, t - tU) : cwPropagate(xD, n, t - tU - DEPART));
  const stationCraft = ctx ? new Craft({ bodies: ['station'], t: start, r: v3(), v: v3(), q: { x: 0, y: 0, z: 0, w: 1 }, fixedMass: STATION_MASS, aero: { area: 1, cd: cdCapsule }, comFn: () => v3(), env: ctx.env }) : null;
  const setStation = (t: number) => {
    if (!stationCraft) return;
    const st = orbitState(orb, t);
    stationCraft.t = t;
    stationCraft.r = st.r;
    stationCraft.v = st.v;
    stationCraft.q = lvlhAttitude(lvlh(orb, t));
    stationCraft.w = vscale(orb.h, n);
    stationCraft.record();
  };
  // docked, undocking and departure, authored with the CW equations about the station
  const tHand = tU + DEPART + 60;
  for (let t = start; t <= tHand + 1e-9; t += t < tU + DEPART + 5 ? 2 : 10) {
    setStation(t);
    const s = absState(orb, t, relAt(t));
    cap.t = t;
    cap.r = s.p;
    cap.v = s.v;
    cap.q = lvlhAttitude(lvlh(orb, t));
    cap.w = vscale(orb.h, n);
    if (ctx) cap.record();
  }
  cap.t = tHand;
  // hand over to the integrated orbit: coast, turn retrograde, deorbit burn
  const tD = tU + DEORBIT;
  const turn = tD - 300;
  coastKepler(ctx, cap, turn, 30, null);
  const q0 = cap.q;
  const qT = retrogradeAttitude(cap.r, cap.v);
  while (cap.t < tD - 1e-9) {
    cap.step(Math.min(1, tD - cap.t), { q: retrogradeAttitude(cap.r, cap.v), wMax: 1.5 * DEG, aMax: 0.3 * DEG, tau: 4 });
    if (ctx) {
      ctx.rec(cap, 2);
      const a = vlen(cap.alpha) / (0.2 * DEG);
      ctx.ch.key('sm.rcs', cap.t, a > 0.05 ? Math.min(1, 0.3 + 0.7 * a) : 0);
    }
  }
  void q0;
  void qT;
  const vBefore = vlen(cap.v);
  const burn = orbitBurn(ctx, cap, { group: 'sm', dir: (c) => vscale(vnorm(c.v), -1), done: (r, v) => R_EARTH + PERIGEE - elements(r, v, MU_EARTH).rp, ignition: 0.8, tail: 0.5, throttle: 1, dt: 0.25, rate: { wMax: 1.5 * DEG, aMax: 0.3 * DEG } }, 1);
  const dv = vBefore - vlen(cap.v);
  const perigeeKm = apsidesKm(cap.r, cap.v).peri;
  if (ctx) {
    const ch = ctx.ch;
    ch.key('sm.rcs', burn.start, 0);
    ch.key('sm.throttle', start, 0);
    ch.key('sm.throttle', burn.start, 0);
    ch.key('sm.throttle', burn.start + 0.8, 1);
    ch.key('sm.throttle', burn.cut, 1);
    ch.key('sm.throttle', burn.end, 0);
  }
  // coast down to 135 km in the entry attitude, then service-module separation
  const smSepAlt = 135e3;
  while (cap.altitude() > smSepAlt + 1) {
    const h = cap.altitude();
    const dt = h > smSepAlt + 20e3 ? 10 : 1;
    cap.step(dt, { q: retrogradeAttitude(cap.r, cap.v), wMax: 1.5 * DEG, aMax: 0.3 * DEG, tau: 4 });
    if (ctx) ctx.rec(cap, 10);
  }
  const smSep = cap.t;
  const sm = cap.split({ bodies: ['service'], fixedMass: SM_DRY, tankIds: ['sm'], aero: { area: areaOf(SERVICE_MODULE.diameter), cd: cdTumbling }, comFn: () => SM_COM, parentFixedMass: CAPSULE.mass, parentAero: { area: CAPSULE_AREA, cd: cdCapsule }, parentComFn: comFrom(CAP_ONLY) });
  sm.groups = [];
  // separation: springs push the service module sideways (1.5 m/s) with a slow tumble
  const side = qaxisX(cap.q);
  const mS = sm.mass;
  const mC = cap.mass;
  sm.v = vadd(sm.v, vscale(side, (1.5 * mC) / (mS + mC)));
  cap.v = vadd(cap.v, vscale(side, (-1.5 * mS) / (mS + mC)));
  sm.w = vadd(sm.w, vscale(vnorm(vcross(sm.r, sm.v)), 4 * DEG));
  if (ctx) {
    sm.record();
    cap.record();
  }
  // the service module falls on until it breaks up (its track ends at 80 km)
  while (sm.altitude() > 80e3 && sm.t < smSep + 2000) {
    sm.step(1, null);
    if (ctx) ctx.rec(sm, 5);
  }
  if (ctx) ctx.rec(sm, 0, true);
  const smEnd = sm.t;
  // capsule: entry, parachutes, splashdown, afloat until `end`
  const d = flyCapsuleDescent(ctx, cap, { drogueCdA: DROGUE_CDA, mainCdA: MAIN_CDA, reefFrac: 0.12, drogueAlt: 7000, mainAlt: 2000, disreefDelay: 8, liftLD: 0.13, comAboveNadir: 1.45, side: vnorm(vcross(cap.r, cap.v)), eiAlt: 120e3, record: !!ctx, end, rcsChannel: 'cap.rcs' }, 90e3);
  if (ctx) for (let t = tHand; t <= end + 60; t += 60) setStation(t);
  const splashAngle = angleIn(orb, d.splashPos);
  return { undock: tU, depart: tU + DEPART, deorbit: { ...burn, dv, perigeeKm }, smSep, smEnd, d, splashAngle, cap, orb, dvDepart };
}

export function buildReturn(): MissionTimeline {
  const O = OUTLINES.return;
  // ── deterministic placement: station phase so the splashdown falls on the orbit's
  // northernmost point, and the time base so that point lies SPLASH_EAST_DEG east of the pad
  let theta0 = -1.5;
  let tU = 80_000;
  const tSplashWanted = SIDEREAL_DAY - (SPLASH_EAST_DEG * DEG) / OMEGA_EARTH;
  for (let it = 0; it < 3; it++) {
    const run = fly(null, { moonPhase0: null, segments: [] }, theta0, tU, tU - 30, tU + 20_000);
    const err = wrap(run.splashAngle);
    const dtS = run.d.splash - tU;
    theta0 -= err;
    tU = Math.round(tSplashWanted - dtS);
    if (Math.abs(err) < 2e-5) break;
  }
  const start = tU - 30;
  const searchTheta0 = theta0;
  // ── recorded run
  const ctx = new Ctx();
  const provisionalEnd = tU + 20_000;
  const run = fly(ctx, ctx.env, theta0, tU, start, provisionalEnd);
  const d = run.d;
  const end = d.splash + 50;
  ctx.ev('undock', tU, 'Undocking: springs push the capsule away down the radial line', 'dock', ['capsule', 'station'], 'dock');
  ctx.ev('departure-burn', run.depart, `Departure burn: ${run.dvDepart.toFixed(1)} m/s, the capsule drops below and ahead of the station`, 'burn', ['capsule', 'service'], 'rcs');
  ctx.ev('deorbit-start', run.deorbit.start, 'Deorbit burn: the service-module engine fires against the direction of travel', 'burn', ['capsule', 'service'], 'ignition');
  ctx.ev('deorbit-end', run.deorbit.cut, `Deorbit burn complete: ${run.deorbit.dv.toFixed(0)} m/s, perigee now ${run.deorbit.perigeeKm.toFixed(0)} km`, 'burn', ['capsule', 'service'], 'cutoff');
  ctx.ev('sm-sep', run.smSep, 'Service module separation: it will break up and burn in the atmosphere', 'separation', ['capsule', 'service'], 'pyro');
  ctx.ev('entry-interface', d.ei, 'Entry interface: 120 km', 'entry', ['capsule']);
  ctx.ev('peak-heating', d.peakHeating.t, `Peak heating at ${(d.peakHeating.alt / 1000).toFixed(0)} km, ${(d.peakHeating.speed / 1000).toFixed(1)} km/s`, 'entry', ['capsule']);
  ctx.ev('peak-g', d.peakG.t, `Peak deceleration: ${d.peakG.g.toFixed(1)} g`, 'entry', ['capsule']);
  ctx.ev('drogue-deploy', d.drogue, 'Drogue parachutes at 7 km', 'recovery', ['capsule'], 'chute');
  ctx.ev('main-deploy', d.main, 'Main parachutes at 2 km, reefed', 'recovery', ['capsule'], 'chute');
  ctx.ev('main-disreef', d.disreef, 'Mains fully open', 'recovery', ['capsule']);
  ctx.ev('splashdown', d.splash, `Splashdown at ${d.splashSpeed.toFixed(1)} m/s`, 'recovery', ['capsule'], 'splash');
  const ch = ctx.ch;
  ch.key('cap.docked', start, 1);
  ch.key('cap.docked', tU - 5, 1);
  ch.ease('cap.docked', tU - 5, tU, 0, 4);
  ch.key('cap.noseCone', start, 1);
  ch.key('cap.noseCone', tU + 400, 1);
  ch.ease('cap.noseCone', tU + 400, tU + 460, 0, 8);
  ch.key('sm.arrays', start, 1);
  ch.key('cap.rcs', start, 0);
  ctx.exists.capsule = [start, end];
  ctx.exists.service = [start, run.smEnd];
  ctx.exists.station = [start, end];
  ctx.attached.service = { to: 'capsule', until: run.smSep };
  ctx.attached.capsule = { to: 'station', until: tU };

  // ── phases
  const bounds = [start, run.deorbit.start - 120, run.smSep, d.ei, d.hotStart, d.drogue, d.main, d.splash, end];
  const phases = phasesFrom('return', O.phases, contiguous(O.phases.map((p) => p.id), bounds));

  // ── shots
  const shots: Shot[] = tidyShots(
    [
      shot('approach', start, tU + 120, 'capsule', 'station', { d: 30, az: 80, el: 0, mix: 0.6 }),
      shot('approach', tU + 120, tU + 900, 'capsule', 'station', { d: 60, az: 200, el: 10, mix: 0.3 }),
      shot('orbit', tU + 900, run.deorbit.start - 40, 'capsule', 'earth', { d: 40 }),
      shot('chase', run.deorbit.start - 40, run.deorbit.end + 30, 'capsule', undefined, { d: 28, az: 150, el: 12 }),
      shot('orbit', run.deorbit.end + 30, run.smSep - 15, 'capsule', 'earth', { d: 40, az: 200, el: 20 }),
      shot('staging', run.smSep - 15, run.smSep + 30, 'capsule', 'service', { d: 30, az: 90, el: 10 }),
      shot('orbit', run.smSep + 30, d.ei - 10, 'capsule', 'earth', { d: 35 }),
      shot('entry', d.ei - 10, d.drogue - 5, 'capsule', undefined, { d: 30, az: 60, el: -5 }),
      shot('chase', d.drogue - 5, d.main + 25, 'capsule', undefined, { d: 45, az: 40, el: 12 }),
      shot('splash', d.main + 25, end, 'capsule', undefined, { d: 180 }),
    ],
    start,
    end,
  );

  // ── presentation
  const pres = new Pres(start)
    .to(tU + 40)
    .to(run.depart - 10, 4, rateNote('Backing away', 4))
    .to(run.depart + 20)
    .to(run.deorbit.start - 15, 60, rateNote('Coast', 60))
    .to(run.deorbit.end + 10)
    .to(run.smSep - 10, 40, rateNote('Coast', 40))
    .to(run.smSep + 20)
    .to(d.ei, 10, rateNote('Coast', 10))
    .to(d.hotStart, 4, rateNote('Entry', 4))
    .to(d.hotEnd, 2, rateNote('Peak heating and deceleration', 2))
    .to(d.drogue - 10, 3, rateNote('Descent', 3))
    .to(d.main + 20)
    .to(d.splash - 15, 5, rateNote('Descent under the main parachutes', 5))
    .to(end).segs;

  // ── facts
  const ll = latLonOf(new THREE.Vector3(d.splashPos.x, d.splashPos.y, d.splashPos.z), d.splash);
  const f = (k: string, v: number) => ctx.fact(k, v);
  f('search.theta0', searchTheta0);
  f('search.tU', tU);
  f('capsuleKg', CAPSULE.mass);
  f('serviceModuleKg', SERVICE_MODULE.mass);
  f('undock.t', tU);
  f('departureDv', run.dvDepart);
  f('deorbit.t', run.deorbit.start);
  f('deorbit.dv', run.deorbit.dv);
  f('deorbit.burnS', run.deorbit.cut - run.deorbit.start);
  f('deorbit.perigeeKm', run.deorbit.perigeeKm);
  f('smSep.t', run.smSep);
  f('smSep.smPropLeftKg', 0);
  f('entryInterface.t', d.ei);
  f('entry.peakHeating.t', d.peakHeating.t);
  f('entry.peakHeating.altKm', d.peakHeating.alt / 1000);
  f('entry.peakHeating.kWm2', d.peakHeating.rate / 1000);
  f('entry.peakHeating.speed', d.peakHeating.speed);
  f('entry.peakG', d.peakG.g);
  f('entry.peakG.t', d.peakG.t);
  f('entry.peakG.altKm', d.peakG.alt / 1000);
  f('entry.heatLoadMJm2', d.heatLoad / 1e6);
  f('entry.blackoutS', d.hotEnd - d.hotStart);
  f('drogue.t', d.drogue);
  f('main.t', d.main);
  f('splash.t', d.splash);
  f('splash.speed', d.splashSpeed);
  f('splash.lat', ll.lat);
  f('splash.lon', ll.lon);
  f('splash.eastOfPadKm', ((ll.lon - -80.58) * Math.PI * R_EARTH * Math.cos(ll.lat * DEG)) / 180 / 1000);
  f('entryToSplashS', d.splash - d.ei);
  f('deorbitToSplashS', d.splash - run.deorbit.start);
  void qdelta;
  void qslerp;

  return {
    id: 'return',
    variant: ['capsule'],
    payload: 'capsule',
    start,
    end,
    bodies: ctx.tracks(end, ['capsule', 'service', 'station']),
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

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
export type { Q, V3 };
