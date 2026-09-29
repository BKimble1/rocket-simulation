/**
 * Geostationary transfer: expendable booster, upper-stage burn to a 200 km parking orbit
 * (inclination 28.5 deg, the site's latitude), a coast to the descending node (the equator
 * crossing, so the transfer orbit's apogee lies on the equatorial plane), settling thrusters and
 * a restart that raises the apogee to 35,786 km, satellite separation, the five-hour climb to
 * apogee, then an EXPLANATORY apogee-engine burn by the satellite: one long constant-thrust
 * (450 N, about 3 h) burn from apogee, shown accelerated. The satellite falls while it burns,
 * so the orbit ends circular near 32,000 km, below geostationary height, after spending more
 * velocity change than the ideal impulsive step: why real missions split circularization into
 * several apogee burns, which also remove the 28.5 deg inclination on the way (not modelled:
 * stated on screen).
 *
 * Reference trajectory from the simplified point-mass model, computed once.
 */
import { G0, PAYLOADS } from '../../vehicle/spec';
import { EARTH_AXIS, MU_EARTH, R_EARTH } from '../../world/frames';
import type { MissionTimeline, Shot } from '../types';
import { cdFreeMolecular } from '../physics/aero';
import { comFrom } from '../physics/ascent';
import { Ctx } from '../physics/context';
import { elements, kepler } from '../physics/kepler';
import { apsidesKm, coastKepler, incToEquator, progradeAttitude } from '../physics/orbit';
import { ENG_SAT, sumMass } from '../physics/vehicle';
import { DEG, qaxisY, qlook, v3, vadd, vcross, vdot, vlen, vnorm, vscale, vsub, type Q, type V3 } from '../physics/vec';
import { OUTLINES } from './outline';
import { Pres, contiguous, phasesFrom, rateNote, shot, tidyShots } from './common';
import { ascentFacts, coastSettleBurn, flyOrbitalAscent, s2Channels } from './flight';

const START = -60;
const GEO_ALT = 35_786e3;
/** Satellite propellant (kg) inside its 3,600 kg launch mass (bipropellant for the apogee engine). */
const SAT_PROP = 1700;

const AXIS: V3 = { x: EARTH_AXIS.x, y: EARTH_AXIS.y, z: EARTH_AXIS.z };

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
    ltg0: { A: -0.088433, B: 0.00072872 },
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
  // burn length estimate from the rocket equation (Isp 342 s) for the injection delta-v
  const el0 = elements(up.r, up.v, MU_EARTH);
  const rp = el0.a;
  const vPer = Math.sqrt(MU_EARTH * (2 / rp - 2 / (rp + R_EARTH + GEO_ALT)));
  const dv = vPer - Math.sqrt(MU_EARTH / rp);
  const mdot = up.group('s2')!.eng.mdot;
  const burnEst = (up.mass * (1 - Math.exp(-dv / (342 * 9.80665)))) / mdot;
  const tIgn = Math.round(tNode - burnEst * 0.5);
  const burn = coastSettleBurn(ctx, up, {
    tIgn,
    settle: 15,
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
  ctx.ev('apogee', tApo, `Apogee: ${((vlen(sat.r) - R_EARTH) / 1000).toFixed(0)} km, the transfer orbit's highest point`, 'milestone', ['satellite']);

  // ── explanatory apogee-engine burn: 450 N, one long burn starting just after apogee,
  // steered along the velocity still to be gained (circular velocity at the current radius,
  // in the orbit plane, minus the current velocity), cut when it is gained or the tank is dry.
  // The satellite falls while it burns, so the orbit ends circular well below geostationary
  // height: the reason real satellites use several shorter burns at successive apogees.
  const vgStart = Math.sqrt(MU_EARTH / vlen(sat.r)) - vlen(sat.v);
  const tBurn0 = tApo + 60;
  coastKepler(ctx, sat, tBurn0, 60, (r, v) => progradeAttitude(r, v));
  const hN = vnorm(vcross(sat.r, sat.v));
  sat.groups = [{ id: 'lae', eng: ENG_SAT, n: 1, tank: 'sat', thr: 0, next: 0 }];
  const g = sat.groups[0];
  const ch = ctx.ch;
  ch.key('sat.apogee.throttle', START, 0);
  ch.key('sat.apogee.throttle', tBurn0, 0);
  let tCut = NaN;
  const massBefore = sat.mass;
  const toGain = (r: V3, v: V3): V3 => vsub(vscale(vnorm(vcross(hN, r)), Math.sqrt(MU_EARTH / vlen(r))), v);
  const burnAtt = (): { q: Q; wMax: number; aMax: number; tau: number } => {
    const d = vnorm(toGain(sat.r, sat.v));
    return { q: qlook(d, vscale(hN, -1)), wMax: 0.5 * DEG, aMax: 0.2 * DEG, tau: 5 };
  };
  for (let guard = 0; guard < 5000; guard++) {
    const dt = 10;
    g.next = clamp01((sat.t + dt - tBurn0) / 2);
    sat.step(dt, burnAtt());
    ctx.rec(sat, 60);
    if (vlen(toGain(sat.r, sat.v)) < 3 || (sat.tanks.sat ?? 0) < 20) {
      tCut = sat.t;
      break;
    }
  }
  ch.key('sat.apogee.throttle', tBurn0 + 2, 1);
  ch.key('sat.apogee.throttle', tCut, 1);
  g.next = 0;
  sat.step(1, burnAtt());
  ctx.rec(sat, 0, true);
  ch.key('sat.apogee.throttle', sat.t, 0);
  ctx.ev('apogee-burn-start', tBurn0, 'Satellite apogee engine: 450 N, one long burn (explanatory, shown accelerated)', 'burn', ['satellite'], 'ignition');
  ctx.ev('apogee-burn-end', sat.t, 'Apogee-engine cutoff: circular, but below geostationary height (one long burn; real satellites use several)', 'burn', ['satellite'], 'cutoff');
  const fin = apsidesKm(sat.r, sat.v);
  // velocity change the burn delivered (rocket equation): more than the ideal impulsive step,
  // the finite-burn loss of one long low-thrust burn
  const satDv = ENG_SAT.ispVac * G0 * Math.log(massBefore / sat.mass);
  const end = sat.t + 900;
  coastKepler(ctx, sat, end, 120, (r, v) => progradeAttitude(r, v));
  // arrays stay stowed until the final orbit (most satellites fly the transfer folded)
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
      shot('orbit', tApo - 600, tApo + 60, 'satellite', 'earth', { d: 50, az: 160, el: 30 }),
      shot('chase', tApo + 60, tCut, 'satellite', undefined, { d: 30, az: 150, el: 12 }),
      shot('orbit', tCut, end, 'satellite', 'earth', { d: 40 }),
    ],
    START,
    end,
  );

  // ── presentation
  const coastRate = 20;
  const climbRate = 600;
  const burnRate = 300;
  const pres = new Pres(START)
    .to(tSeco1 + 20)
    .to(burn.settleStart - 20, coastRate, rateNote('Coast in the parking orbit', coastRate))
    .to(burn.end + 15)
    .to(tSep - 15, 5, rateNote('Coast', 5))
    .to(tSep + 45)
    .to(tSep + 645, 60, rateNote('Coast', 60))
    .to(tApo - 300, climbRate, `5 h climb to apogee shown at ×${climbRate}`)
    .to(tBurn0 + 300, 60, rateNote('Coast over apogee', 60))
    .to(tCut, burnRate, `Explanatory: one long 450 N burn shown at ×${burnRate}; real satellites use several apogee burns and also remove the 28.5° inclination`)
    .to(end, 60, rateNote('Coast', 60)).segs;

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
  ctx.fact('apogeeBurn.t', tBurn0);
  ctx.fact('apogeeBurn.durationH', (tCut - tBurn0) / 3600);
  ctx.fact('apogeeBurn.dv', satDv);
  ctx.fact('apogeeBurn.propUsedKg', SAT_PROP - (sat.tanks.sat ?? 0));
  ctx.fact('final.periKm', fin.peri);
  ctx.fact('final.apoKm', fin.apo);

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
