/**
 * Geostationary transfer: expendable booster, upper-stage burn to a 200 km parking orbit
 * (inclination 28.5 deg, the site's latitude), a coast to the descending node (the equator
 * crossing, so the transfer orbit's apogee lies on the equatorial plane), settling thrusters and
 * a restart that raises the apogee to 35,786 km, satellite separation and the five-hour climb to
 * apogee. Then the satellite's own campaign (EXPLANATORY, shown accelerated, the orbits between
 * burns omitted): it coasts through the first apogee (checkout), then fires its 450 N apogee
 * engine three times, each burn centred on a later apogee (about 87, 58 and 40 minutes). Each
 * burn raises the perigee and turns the orbit plane toward the equator; after the third the
 * orbit is near-circular at geostationary height with an inclination below 0.1 deg, about 30 h
 * after the first ignition. Centring shorter burns on apogee keeps the finite-burn loss small
 * (the whole campaign costs within 1 % of the ideal impulsive change), which is why real
 * satellites split the job this way instead of one long burn.
 *
 * Reference trajectory from the simplified point-mass model, computed once.
 */
import { G0, PAYLOADS } from '../../vehicle/spec';
import { EARTH_AXIS, MU_EARTH, R_EARTH } from '../../world/frames';
import type { MissionTimeline, Shot } from '../types';
import { cdFreeMolecular } from '../physics/aero';
import { comFrom } from '../physics/ascent';
import { Ctx } from '../physics/context';
import { elements, kepler, timeToAnomaly } from '../physics/kepler';
import { apsidesKm, coastKepler, incToEquator, progradeAttitude } from '../physics/orbit';
import { ENG_SAT, sumMass } from '../physics/vehicle';
import { DEG, qaxisY, qlook, v3, vadd, vcross, vdot, vlen, vnorm, vscale, vsub, type V3 } from '../physics/vec';
import { OUTLINES } from './outline';
import { Pres, contiguous, num, phasesFrom, rateNote, shot, tidyShots } from './common';
import { ascentFacts, coastSettleBurn, flyOrbitalAscent, s2Channels } from './flight';

const START = -60;
const GEO_ALT = 35_786e3;
/** Satellite propellant (kg) inside its 3,600 kg launch mass (bipropellant for the apogee engine). */
const SAT_PROP = 1700;

/**
 * Share of the velocity still to be gained that each apogee burn delivers (the last one: all of
 * it). Three burns, the first the longest, as for real geostationary satellites.
 */
const BURN_SHARE = [0.4, 0.55, 1];
/**
 * Share of the radial velocity the first burns take out. Thrust purely in the local horizontal
 * plane over a burn arc of an hour or more raises the apogee (by about 50 km per burn here);
 * steering entirely against the radial velocity lowers it by more. This share, set once by
 * trial, holds the apogee within about 20 km of geostationary height (a test checks the
 * final orbit).
 */
const RADIAL_TRIM = 0.35;
/** Turn to the burn attitude before each ignition, and back to prograde after each cutoff (s). */
const SLEW = 300;
const SLEW_BACK = 240;
/** Coast shown in the final orbit after the last burn (s). */
const FINAL_COAST = 600;

interface ApogeeBurn {
  /** Apogee the burn is centred on; turn start, ignition, cutoff command, end of the shutdown ramp (s). */
  apogee: number;
  slew: number;
  start: number;
  cut: number;
  end: number;
  /** Velocity change (rocket equation, m/s) and propellant used (kg). */
  dv: number;
  prop: number;
  /** Orbit after the burn. */
  periKm: number;
  apoKm: number;
  incDeg: number;
  periodH: number;
}

const AXIS: V3 = { x: EARTH_AXIS.x, y: EARTH_AXIS.y, z: EARTH_AXIS.z };
/** Upper-stage acceleration ceiling for the injection burn (m/s^2). */
const G_LIMIT = 4.5 * 9.80665;

/**
 * Duration (s) of a burn of `dv` from mass m0 with thrust F and full-throttle flow mdot when the
 * throttle is held to the acceleration limit gLim (never below minThr): full throttle while the
 * stage is heavy, then constant acceleration, then the minimum throttle.
 */
export function limitedBurnTime(m0: number, dv: number, F: number, mdot: number, gLim: number, minThr: number): number {
  const ve = F / mdot;
  const mf = m0 * Math.exp(-dv / ve);
  const m1 = F / gLim;
  const m2 = (minThr * F) / gLim;
  let t = 0;
  let m = m0;
  if (m > m1) {
    const mA = Math.max(mf, m1);
    t += (m - mA) / mdot;
    m = mA;
  }
  if (m > mf && m > m2) {
    const mB = Math.max(mf, m2);
    t += (ve * Math.log(m / mB)) / gLim;
    m = mB;
  }
  if (m > mf) t += (m - mf) / (minThr * mdot);
  return t;
}

/** Time of the next descending equator crossing (r . axis from + to -) on the Kepler orbit. */
function nextDescendingNode(r: V3, v: V3, t: number): number {
  const f = (dt: number) => vdot(kepler(r, v, dt, MU_EARTH).r, AXIS);
  let a = 0;
  let fa = f(0);
  const step = 60;
  for (let dt = step; dt < 12_000; dt += step) {
    const fb = f(dt);
    if (fa > 0 && fb <= 0) {
      let lo = dt - step;
      let hi = dt;
      for (let i = 0; i < 40; i++) {
        const m = (lo + hi) / 2;
        if (f(m) > 0) lo = m;
        else hi = m;
      }
      return t + (lo + hi) / 2;
    }
    a = dt;
    fa = fb;
  }
  void a;
  throw new Error('no descending node found');
}

export function buildGto(): MissionTimeline {
  const ctx = new Ctx();
  const O = OUTLINES.gto;
  const payload = PAYLOADS.gtoSat.mass;
  const a = flyOrbitalAscent(ctx, {
    spec: { payload: 'gtoSat', recovery: false, crew: false, boosterOnly: false },
    gammaMeco: 30,
    rtls: null,
    insertion: { rp: 200e3, ra: 200e3 },
    // warm starts: the converged values of the deterministic searches
    ltg0: { A: -0.087125, B: 0.00072161 },
    kick0: 0.92638,
    gLimitS1: 4.5 * 9.80665,
    gLimitS2: 4.5 * 9.80665,
    s2Keep: 8500,
    padStart: START,
    armsRetract: -45,
    end: 40_000,
  });
  const up = a.upper;
  const tSeco1 = a.burn.tCut;
  ctx.ev('seco1', tSeco1, 'Upper-stage cutoff: in a 200 km parking orbit', 'engine', ['upper'], 'cutoff');
  const park = apsidesKm(up.r, up.v);
  const parkInc = incToEquator(up.r, up.v);
  const s2AtPark = up.tanks.s2 ?? 0;

  // ── coast to the descending node, settle, restart: injection centred on the node
  const tNode = nextDescendingNode(up.r, up.v, up.t);
  // burn length estimate from the rocket equation (Isp 342 s) for the injection delta-v, with
  // the throttle held down to the acceleration limit (full, then constant 4.5 g, then the minimum)
  const el0 = elements(up.r, up.v, MU_EARTH);
  const rp = el0.a;
  const vPer = Math.sqrt(MU_EARTH * (2 / rp - 2 / (rp + R_EARTH + GEO_ALT)));
  const dv = vPer - Math.sqrt(MU_EARTH / rp);
  const eng = up.group('s2')!.eng;
  const burnEst = limitedBurnTime(up.mass, dv, eng.thrustVac, eng.mdot, G_LIMIT, eng.minThrottle);
  const tIgn = Math.round(tNode - burnEst * 0.5);
  const burn = coastSettleBurn(ctx, up, {
    tIgn,
    settle: 15,
    // the same 4.5 g ceiling as the first burn: the light stage throttles down (to its 60 %
    // minimum) instead of pressing the payload with 10 g or more at the end of the burn
    gLimit: G_LIMIT,
    dir: (c) => vnorm(c.v),
    done: (r, v) => {
      const e = elements(r, v, MU_EARTH);
      return e.e < 1 ? e.ra - (R_EARTH + GEO_ALT) : 1;
    },
  });
  ctx.ev('settling', burn.settleStart, 'Settling thrusters push the propellant to the tank bottoms', 'engine', ['upper'], 'rcs');
  ctx.ev('ses2', burn.start, 'Upper-stage restart over the equator', 'engine', ['upper'], 'ignition');
  ctx.ev('seco2', burn.cut, 'Cutoff: transfer orbit, apogee at geostationary height', 'engine', ['upper'], 'cutoff');
  const gto = apsidesKm(up.r, up.v);
  const gtoPeriodH = elements(up.r, up.v, MU_EARTH).period / 3600;
  const injDv = burn.cut - burn.start;

  // ── satellite separation
  const settleAfter = up.t + 40;
  while (up.t < settleAfter - 1e-9) {
    up.step(Math.min(1, settleAfter - up.t), { q: progradeAttitude(up.r, up.v), wMax: 2 * DEG, aMax: 0.5 * DEG, tau: 3 });
    ctx.rec(up, 2);
    s2Channels(ctx, up);
  }
  const tSep = Math.ceil(up.t + 60);
  coastKepler(ctx, up, tSep, 20, (r, v) => progradeAttitude(r, v));
  const satItem = a.items.find((it) => it.tag === 'satellite')!;
  const upperRest = a.items.filter((it) => it.tag === 'upper');
  const sat = up.split({ bodies: ['satellite'], fixedMass: payload - SAT_PROP, tankIds: [], aero: { area: 10, cd: cdFreeMolecular }, comFn: () => satItem.c, parentFixedMass: sumMass(upperRest).m, parentComFn: comFrom(upperRest) });
  sat.tanks.sat = SAT_PROP;
  const ax = qaxisY(up.q);
  const mS = sat.mass;
  const mU = up.mass;
  sat.v = vadd(sat.v, vscale(ax, (0.4 * mU) / (mS + mU)));
  up.v = vadd(up.v, vscale(ax, (-0.4 * mS) / (mS + mU)));
  sat.record();
  up.record();
  ctx.ev('payload-sep', tSep, 'Satellite separation: springs push it away at 0.4 m/s', 'separation', ['satellite', 'upper'], 'sep');
  ctx.attached.satellite = { to: 'upper', until: tSep };
  // upper stage backs away, then coasts (its track ends after a while)
  const upEnd = tSep + 1800;
  const back = up.t + 30;
  up.extra = vscale(ax, -0.03);
  ctx.ch.key('s2.rcs', tSep + 5, 0);
  ctx.ch.key('s2.rcs', tSep + 5.5, 0.6);
  while (up.t < back - 1e-9) {
    up.step(Math.min(1, back - up.t), null);
    ctx.rec(up, 2);
  }
  up.extra = v3();
  ctx.ch.key('s2.rcs', up.t, 0.6);
  ctx.ch.key('s2.rcs', up.t + 0.5, 0);
  coastKepler(ctx, up, upEnd, 60, null);

  // ── satellite: a few thruster pulses to stabilize, then the climb to apogee
  const hold = { wMax: 0.5 * DEG, aMax: 0.2 * DEG, tau: 5 };
  while (sat.t < tSep + 40 - 1e-9) {
    sat.step(Math.min(1, tSep + 40 - sat.t), { q: progradeAttitude(sat.r, sat.v), ...hold });
    ctx.rec(sat, 2);
  }
  ctx.ch.key('sat.rcs', START, 0);
  for (const t0 of [tSep + 4, tSep + 14, tSep + 30]) {
    ctx.ch.key('sat.rcs', t0, 0);
    ctx.ch.key('sat.rcs', t0 + 0.3, 0.5);
    ctx.ch.key('sat.rcs', t0 + 1.2, 0.5);
    ctx.ch.key('sat.rcs', t0 + 1.5, 0);
  }
  const elT = elements(sat.r, sat.v, MU_EARTH);
  // time of apogee: bisection on the radial velocity sign over the coast
  const fr = (dt: number) => {
    const k = kepler(sat.r, sat.v, dt, MU_EARTH);
    return vdot(k.r, k.v);
  };
  let lo = 0;
  let hi = elT.period * 0.75;
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2;
    if (fr(m) > 0) lo = m;
    else hi = m;
  }
  const tApo = sat.t + (lo + hi) / 2;
  coastKepler(ctx, sat, tApo, 300, (r, v) => progradeAttitude(r, v));
  ctx.ev('apogee', tApo, `Apogee: ${num((vlen(sat.r) - R_EARTH) / 1000)} km, the transfer orbit's highest point; the satellite coasts through this first one while it is checked out`, 'milestone', ['satellite']);

  // ── apogee-engine campaign (explanatory): the satellite coasts through the first apogee
  // (checkout and attitude acquisition, as real satellites do), then fires its 450 N engine in
  // BURNS short burns, each centred on a later apogee and steered along the velocity still to be
  // gained: the velocity of a circular orbit over the equator at the current radius, minus the
  // current velocity. Each burn raises the perigee and turns the orbit plane toward the equator
  // (the apogee lies on the equator: the injection was centred on the node); the last one is cut
  // when the velocity to be gained is used up: a near-circular, near-equatorial orbit at
  // geostationary height. Burns centred on apogee lose little to gravity, unlike one long burn.
  // The target has the horizontal, due-east speed of an orbit whose semi-major axis is the
  // geostationary radius (period: one sidereal day) and keeps part of the current radial
  // velocity: the first burns steer mostly in the local horizontal plane, trimming a share
  // (RADIAL_TRIM) of the small climb or descent around apogee so the apogee stays at
  // geostationary height; the last burn takes it all out, which circularizes the orbit.
  const R_GEO = R_EARTH + GEO_ALT;
  let radialTrim = RADIAL_TRIM;
  const toGain = (r: V3, v: V3): V3 => {
    const rn = vlen(r);
    const up = vscale(r, 1 / rn);
    const vr = vdot(v, up) * (1 - radialTrim);
    const vh = Math.sqrt(Math.max(0, MU_EARTH * (2 / rn - 1 / R_GEO) - vr * vr));
    return vsub(vadd(vscale(up, vr), vscale(vnorm(vcross(AXIS, r)), vh)), v);
  };
  const vgStart = Math.sqrt(MU_EARTH / vlen(sat.r)) - vlen(sat.v);
  const dvIdeal = vlen(toGain(sat.r, sat.v));
  sat.groups = [{ id: 'lae', eng: ENG_SAT, n: 1, tank: 'sat', thr: 0, next: 0 }];
  const g = sat.groups[0];
  const ch = ctx.ch;
  ch.key('sat.apogee.throttle', START, 0);
  const ve = ENG_SAT.ispVac * G0;
  const massBefore = sat.mass;
  let dirHold: V3 | null = null;
  // burn direction: along the velocity to be gained, held once little is left (its direction then wanders)
  const burnDir = (): V3 => {
    const vg = toGain(sat.r, sat.v);
    if (!dirHold || vlen(vg) > 15) dirHold = vnorm(vg);
    return dirHold;
  };
  const slow = { wMax: 0.5 * DEG, aMax: 0.2 * DEG, tau: 5 };
  const burnAtt = () => ({ q: qlook(burnDir(), vscale(vnorm(vcross(sat.r, sat.v)), -1)), ...slow });
  const progAtt = () => ({ q: progradeAttitude(sat.r, sat.v), ...slow });
  const rcsPulse = (t0: number) => {
    ch.key('sat.rcs', t0, 0);
    ch.key('sat.rcs', t0 + 0.3, 0.5);
    ch.key('sat.rcs', t0 + 1.2, 0.5);
    ch.key('sat.rcs', t0 + 1.5, 0);
  };
  const burns: ApogeeBurn[] = [];
  for (let k = 0; k < BURN_SHARE.length; k++) {
    const last = k === BURN_SHARE.length - 1;
    radialTrim = last ? 1 : RADIAL_TRIM;
    // the next apogee (the satellite is at, or a little past, the previous one)
    const el = elements(sat.r, sat.v, MU_EARTH);
    let dtA = timeToAnomaly(sat.r, sat.v, MU_EARTH, Math.PI);
    if (dtA < 0.25 * el.period) dtA += el.period;
    const tA = sat.t + dtA;
    const kA = kepler(sat.r, sat.v, dtA, MU_EARTH);
    const dvPlan = BURN_SHARE[k] * vlen(toGain(kA.r, kA.v));
    const dur = (sat.mass * (1 - Math.exp(-dvPlan / ve))) / ENG_SAT.mdot;
    const tIgn = Math.round(tA - dur / 2);
    // coast, then turn to the burn attitude (thruster pulses start and stop the turn)
    coastKepler(ctx, sat, tIgn - SLEW, 300, (r, v) => progradeAttitude(r, v));
    rcsPulse(sat.t + 2);
    rcsPulse(sat.t + 150);
    while (sat.t < tIgn - 1e-9) {
      sat.step(Math.min(5, tIgn - sat.t), burnAtt());
      ctx.rec(sat, 30);
    }
    ctx.rec(sat, 0, true);
    const mStart = sat.mass;
    let tCut = NaN;
    let prevRem = Infinity;
    for (let guard = 0; guard < 5000; guard++) {
      const rem = last ? vlen(toGain(sat.r, sat.v)) : dvPlan - ve * Math.log(mStart / sat.mass);
      if (rem < 0.3 || (last && rem > prevRem) || (sat.tanks.sat ?? 0) < 5) {
        tCut = sat.t;
        // a sample at the cutoff command: the shutdown is a knee in the thrust
        ctx.rec(sat, 0, true);
        break;
      }
      prevRem = rem;
      // the 2 s ignition ramp in 0.5 s steps, each recorded (as the throttle channel has it),
      // then steps of up to 10 s, shortened near the cutoff
      const ramp = sat.t < tIgn + 2 - 1e-9;
      const dt = ramp ? 0.5 : Math.max(0.5, Math.min(10, rem / (ENG_SAT.thrustVac / sat.mass)));
      g.next = clamp01((sat.t + dt - tIgn) / 2);
      sat.step(dt, burnAtt());
      ctx.rec(sat, ramp ? 0 : 60);
    }
    if (!(tCut > tIgn + 2)) throw new Error(`gto: apogee burn ${k + 1} did not run`);
    ch.key('sat.apogee.throttle', tIgn, 0);
    ch.key('sat.apogee.throttle', tIgn + 2, 1);
    ch.key('sat.apogee.throttle', tCut, 1);
    g.next = 0;
    sat.step(1, burnAtt());
    ctx.rec(sat, 0, true);
    ch.key('sat.apogee.throttle', sat.t, 0);
    const o = apsidesKm(sat.r, sat.v);
    burns.push({ apogee: tA, slew: tIgn - SLEW, start: tIgn, cut: tCut, end: sat.t, dv: ve * Math.log(mStart / sat.mass), prop: mStart - sat.mass, periKm: o.peri, apoKm: o.apo, incDeg: incToEquator(sat.r, sat.v), periodH: elements(sat.r, sat.v, MU_EARTH).period / 3600 });
    // turn back to the prograde attitude
    rcsPulse(sat.t + 5);
    const tBack = sat.t + SLEW_BACK;
    while (sat.t < tBack - 1e-9) {
      sat.step(Math.min(5, tBack - sat.t), progAtt());
      ctx.rec(sat, 30);
    }
    ctx.rec(sat, 0, true);
    rcsPulse(sat.t - 30);
    dirHold = null;
  }
  const b0 = burns[0];
  const bN = burns[burns.length - 1];
  const nB = burns.length;
  const mins = burns.map((b) => Math.round((b.cut - b.start) / 60));
  const onTime = burns.reduce((s, b) => s + b.cut - b.start, 0);
  const fin = apsidesKm(sat.r, sat.v);
  const finInc = incToEquator(sat.r, sat.v);
  const finPeriodH = elements(sat.r, sat.v, MU_EARTH).period / 3600;
  ctx.ev('apogee-burn-start', b0.start, `Apogee engine, burn 1 of ${nB}: 450 N for ${mins[0]} min, centred on the second apogee (explanatory, shown accelerated)`, 'burn', ['satellite'], 'ignition');
  ctx.ev(
    'apogee-burn-end',
    bN.end,
    `Cutoff after burn ${nB} of ${nB} (${mins.join(', ').replace(/, (\d+)$/, ' and $1')} min): near-circular orbit ${num(fin.peri)} by ${num(fin.apo)} km over the equator, inclination ${finInc.toFixed(2)}°: geostationary`,
    'burn',
    ['satellite'],
    'cutoff',
  );
  // velocity change the burns delivered (rocket equation): a little above the ideal impulsive
  // change (plane change included), the small finite-burn loss of burns centred on apogee
  const satDv = ENG_SAT.ispVac * G0 * Math.log(massBefore / sat.mass);
  const end = sat.t + FINAL_COAST;
  coastKepler(ctx, sat, end, 120, (r, v) => progradeAttitude(r, v));
  // arrays stay stowed (most satellites fly the transfer folded)
  ch.key('sat.arrays', START, 0);
  ch.key('sat.antenna', START, 0);
  ctx.exists.upper = [START, upEnd];
  ctx.exists.satellite = [START, end];

  // ── phases
  const T = a.times;
  const E = (id: string) => ctx.evt(id);
  const bounds = [START, E('engine-start'), 0, T.towerClear, T.throttleDown, T.throttleUp + 15, T.stageSep, T.ses1, T.fairingSep, T.fairingSep + 15, tSeco1, burn.settleStart, burn.start, burn.end + 20, tSep + 60, tApo, end];
  const phases = phasesFrom('gto', O.phases, contiguous(O.phases.map((p) => p.id), bounds));

  // ── shots
  const shots: Shot[] = tidyShots(
    [
      shot('pad-wide', START, -14, 'booster', undefined, { look: 0.4 }),
      shot('pad-close', -14, 5, 'booster', undefined, { look: -0.7, fov: 30 }),
      shot('tower', 5, T.towerClear + 3, 'booster'),
      shot('pad-wide', T.towerClear + 3, T.towerClear + 16, 'booster'),
      shot('ground-track', T.towerClear + 16, T.throttleDown, 'booster'),
      shot('chase', T.throttleDown, T.meco - 8, 'booster', undefined, { d: 110, az: 25, el: 6 }),
      shot('staging', T.meco - 8, T.ses1 + 14, 'upper', 'booster', { d: 75, az: 100, el: 8 }),
      shot('chase', T.ses1 + 14, T.fairingSep - 4, 'upper', undefined, { d: 60, az: 30, el: 10 }),
      shot('staging', T.fairingSep - 4, T.fairingSep + 18, 'upper', 'fairingA', { d: 55, az: 80, el: 12 }),
      shot('orbit', T.fairingSep + 18, tSeco1 - 20, 'upper', 'earth', { d: 70 }),
      shot('chase', tSeco1 - 20, tSeco1 + 25, 'upper', undefined, { d: 45, az: 150, el: 10 }),
      shot('orbit', tSeco1 + 25, burn.settleStart - 10, 'upper', 'earth', { d: 80 }),
      shot('chase', burn.settleStart - 10, burn.end + 20, 'upper', undefined, { d: 50, az: 140, el: 12 }),
      shot('orbit', burn.end + 20, tSep - 12, 'upper', 'earth', { d: 60 }),
      shot('deploy', tSep - 12, tSep + 60, 'satellite', 'upper', { d: 24, az: 60, el: 15 }),
      shot('orbit', tSep + 60, tApo - 600, 'satellite', 'earth', { d: 40, az: 30, el: 25 }),
      shot('orbit', tApo - 600, b0.slew, 'satellite', 'earth', { d: 50, az: 160, el: 30 }),
      // each burn and the turns before and after it held on the satellite; the orbit between
      ...burns.flatMap((b, k) => [
        shot('chase', b.slew, b.end + SLEW_BACK, 'satellite', undefined, { d: 30, az: 150, el: 12 }),
        shot('orbit', b.end + SLEW_BACK, k + 1 < nB ? burns[k + 1].slew : end, 'satellite', 'earth', { d: 40, az: 30 + 60 * k, el: 20 }),
      ]),
    ],
    START,
    end,
  );

  // ── presentation: the climb and the first apogee accelerated, the checkout orbit and the
  // orbits between burns omitted (with their lengths), every burn and turn shown accelerated at
  // one rate so the burns' relative lengths stay visible
  const coastRate = 20;
  const climbRate = 900;
  const burnRate = 300;
  const turnRate = 60;
  const climbEnd = tApo - 150;
  const hours = (a0: number, a1: number) => Math.max(1, Math.round((a1 - a0) / 3600));
  const P = new Pres(START)
    .to(tSeco1 + 20)
    .to(burn.settleStart - 20, coastRate, rateNote('Coast in the parking orbit', coastRate))
    .to(burn.end + 15)
    .to(tSep - 15, 5, rateNote('Coast', 5))
    .to(tSep + 45)
    .to(tSep + 645, 60, rateNote('Coast', 60))
    .to(climbEnd, climbRate, `${hours(tSep + 645, climbEnd)} h climb to apogee shown at ×${climbRate}`)
    .to(tApo + 150, 60, rateNote('Coast over the first apogee', 60))
    .omit(b0.slew, `Checkout orbit omitted: about ${hours(tApo + 150, b0.slew)} hours, one full transfer orbit while the satellite is checked out; its engine fires at the next ${nB} apogees`);
  burns.forEach((b, k) => {
    P.to(b.start, turnRate, rateNote('Turning to the burn attitude', turnRate));
    P.to(b.end, burnRate, `Explanatory: apogee burn ${k + 1} of ${nB}, ${mins[k]} min of 450 N thrust, shown at ×${burnRate}`);
    if (k + 1 < nB) {
      P.to(b.end + SLEW_BACK, turnRate, rateNote('Turning back', turnRate));
      P.omit(burns[k + 1].slew, `Coast omitted: about ${hours(b.end + SLEW_BACK, burns[k + 1].slew)} hours, once around the orbit to the next apogee (perigee now ${num(b.periKm)} km, inclination ${b.incDeg.toFixed(1)}°)`);
    }
  });
  const pres = P.to(end, 60, rateNote('Coast in the geostationary orbit', 60)).segs;

  // ── facts
  ascentFacts(ctx, a);
  ctx.fact('payloadKg', payload);
  ctx.fact('parking.periKm', park.peri);
  ctx.fact('parking.apoKm', park.apo);
  ctx.fact('parking.incDeg', parkInc);
  ctx.fact('seco1.t', tSeco1);
  ctx.fact('seco1.s2PropLeftKg', s2AtPark);
  ctx.fact('node.t', tNode);
  ctx.fact('ses2.t', burn.start);
  ctx.fact('seco2.t', burn.cut);
  ctx.fact('injection.burnS', injDv);
  ctx.fact('injection.dvIdeal', dv);
  ctx.fact('gto.periKm', gto.peri);
  ctx.fact('gto.apoKm', gto.apo);
  ctx.fact('gto.periodH', gtoPeriodH);
  ctx.fact('apogeeBurn.dvToGainAtStart', vgStart);
  ctx.fact('seco2.s2PropLeftKg', up.tanks.s2 ?? 0);
  ctx.fact('payloadSep.t', tSep);
  ctx.fact('apogee.t', tApo);
  ctx.fact('apogee.climbH', (tApo - tSep) / 3600);
  ctx.fact('apogeeBurn.dvIdeal', dvIdeal);
  ctx.fact('apogeeBurn.count', nB);
  ctx.fact('apogeeBurn.t', b0.start);
  burns.forEach((b, k) => ctx.fact(`apogeeBurn.burn${k + 1}Min`, (b.cut - b.start) / 60));
  ctx.fact('apogeeBurn.durationH', onTime / 3600);
  ctx.fact('apogeeBurn.spanH', (bN.end - b0.start) / 3600);
  ctx.fact('apogeeBurn.dv', satDv);
  ctx.fact('apogeeBurn.propUsedKg', SAT_PROP - (sat.tanks.sat ?? 0));
  ctx.fact('apogeeBurn.propLeftKg', sat.tanks.sat ?? 0);
  ctx.fact('final.periKm', fin.peri);
  ctx.fact('final.apoKm', fin.apo);
  ctx.fact('final.incDeg', finInc);
  ctx.fact('final.periodH', finPeriodH);

  return {
    id: 'gto',
    variant: ['satellite', 'expendable'],
    payload: 'gtoSat',
    start: START,
    end,
    bodies: ctx.tracks(end, ['booster', 'upper', 'fairingA', 'fairingB', 'satellite']),
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

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
