/**
 * Satellite to low Earth orbit (400 km, 28.5 deg), booster returns to the launch site.
 *
 * With the K-1's numbers and a return-to-launch-site reserve, a direct insertion at 400 km
 * costs about 450 m/s more than the upper stage has with the 6.2 t satellite (lofting the long,
 * low-thrust upper-stage burn to 400 km wastes it on gravity), so the vehicle inserts into a
 * 200 x 400 km orbit and the upper stage makes a short circularization burn at apogee half an
 * orbit later (the fallback the brief allows).
 */
import { PAYLOADS } from '../../vehicle/spec';
import { R_EARTH, MU_EARTH } from '../../world/frames';
import type { MissionTimeline, Shot } from '../types';
import { cdFreeMolecular } from '../physics/aero';
import { Ctx } from '../physics/context';
import { Craft } from '../physics/craft';
import { elements, timeToAnomaly } from '../physics/kepler';
import { ORBIT_RATE, apsidesKm, coastKepler, coastStep, horizontal, incToEquator, orbitBurn, progradeAttitude } from '../physics/orbit';
import { PAYLOAD_COM, boosterDry, sumMass } from '../physics/vehicle';
import { comFrom } from '../physics/ascent';
import { DEG, qaxisY, qdelta, v3, vlen, vscale, vadd } from '../physics/vec';
import { OUTLINES } from './outline';
import { Pres, branchFrom, contiguous, phasesFrom, rateNote, shot, tidyShots } from './common';
import { ascentFacts, flyOrbitalAscent, s2Channels } from './flight';

const START = -60;

export function buildLeo(): MissionTimeline {
  const ctx = new Ctx();
  const O = OUTLINES.leo;
  const payload = PAYLOADS.leoSat.mass;
  // provisional end (the landed booster's ground track is sampled to it); replaced below
  const END_GUESS = 3900;
  const a = flyOrbitalAscent(ctx, {
    spec: { payload: 'leoSat', recovery: true, crew: false, boosterOnly: false },
    gammaMeco: 36,
    rtls: { reserve0: 50_279, bias0: { e: -6287, n: -298 }, margin: 700 },
    insertion: { rp: 200e3, ra: 400e3 },
    // warm starts: the converged values of the deterministic searches (they re-converge in a pass or two)
    ltg0: { A: 0.90456, B: -0.0027625 },
    kick0: 0.96222,
    gLimitS1: 4.5 * 9.80665,
    gLimitS2: 4.5 * 9.80665,
    s2Keep: 450,
    padStart: START,
    armsRetract: -45,
    end: END_GUESS,
  });
  const up = a.upper;
  const tSeco = a.burn.tCut;
  ctx.ev('seco', tSeco, 'Upper-stage engine cutoff: in a 200 x 400 km orbit', 'engine', ['upper'], 'cutoff');
  const ins = apsidesKm(up.r, up.v);

  // ── coast: turn to a local-horizontal attitude, then coast to apogee
  const rec = (c: Craft) => s2Channels(ctx, c);
  coastStep(ctx, up, up.t + 40, 0.5, (c) => ({ q: progradeAttitude(c.r, c.v), ...ORBIT_RATE, tau: 3 }), 1.0, (c) => rcsChannel(ctx, c, 's2.rcs'));
  const tApo = up.t + timeToAnomaly(up.r, up.v, MU_EARTH, Math.PI);
  const settle = 15;
  coastKepler(ctx, up, tApo - settle - 30, 20, (r, v) => progradeAttitude(r, v));
  coastStep(ctx, up, tApo - settle - 3, 1.0, (c) => ({ q: progradeAttitude(c.r, c.v), ...ORBIT_RATE, tau: 3 }), 2.0, rec);
  // settling thrusters push the propellant aft before the restart
  const tSettle = up.t;
  ctx.ch.key('s2.rcs', tSettle - 0.1, 0);
  ctx.ch.key('s2.rcs', tSettle + 0.3, 1);
  const settleAcc = (2 * 440) / up.mass;
  up.extra = vscale(qaxisY(up.q), settleAcc);
  coastStep(ctx, up, tSettle + settle, 0.5, (c) => ({ q: progradeAttitude(c.r, c.v), ...ORBIT_RATE, tau: 3 }), 1.0, rec);
  up.extra = v3();
  // circularization: prograde, cut when the energy of the 400 km circular orbit is reached
  const eTarget = -MU_EARTH / (2 * (R_EARTH + 400e3));
  const vBefore = vlen(up.v);
  const circ = orbitBurn(ctx, up, {
    group: 's2',
    dir: (c) => horizontal(c.r, c.v),
    done: (r, v) => vlen(v) ** 2 / 2 - MU_EARTH / vlen(r) - eTarget,
    ignition: 0.8,
    tail: 0.5,
    throttle: 0.6,
    dt: 0.1,
    rate: ORBIT_RATE,
    onStep: rec,
  });
  ctx.ch.key('s2.rcs', circ.start + 1.0, 1);
  ctx.ch.key('s2.rcs', circ.start + 1.5, 0);
  ctx.ev('circularization-start', circ.start, 'Upper-stage restart at apogee: circularization burn', 'burn', ['upper'], 'ignition');
  ctx.ev('circularization-end', circ.cut, 'Cutoff: 400 km circular orbit', 'burn', ['upper'], 'cutoff');
  const fin = apsidesKm(up.r, up.v);
  const circDv = vlen(up.v) - vBefore;

  // ── payload separation, arrays, antenna
  coastStep(ctx, up, up.t + 30, 0.5, (c) => ({ q: progradeAttitude(c.r, c.v), ...ORBIT_RATE, tau: 3 }), 1.0, rec);
  const tSep = Math.ceil(up.t + 150);
  coastKepler(ctx, up, tSep, 10, (r, v) => progradeAttitude(r, v));
  const items = a.items;
  const satItem = items.find((it) => it.m === payload && it.c.y === PAYLOAD_COM.leoSat.y)!;
  const upperRest = items.slice(boosterDry(true).length).filter((it) => it !== satItem && it.m !== 900);
  const sat = up.split({ bodies: ['satellite'], fixedMass: payload, aero: { area: 8, cd: cdFreeMolecular }, comFn: () => satItem.c, parentFixedMass: sumMass(upperRest).m, parentComFn: comFrom(upperRest) });
  ctx.ev('payload-sep', tSep, 'Payload separation: springs push the satellite away at 0.4 m/s', 'separation', ['satellite', 'upper'], 'sep');
  ctx.attached.satellite = { to: 'upper', until: tSep };
  // springs: 0.4 m/s relative along the stage axis
  const ax = qaxisY(up.q);
  const mS = sat.mass;
  const mU = up.mass;
  sat.v = vadd(sat.v, vscale(ax, (0.4 * mU) / (mS + mU)));
  up.v = vadd(up.v, vscale(ax, (-0.4 * mS) / (mS + mU)));
  const tArrays = tSep + 60;
  const tAntenna = tArrays + 75;
  const end = tAntenna + 60;
  // satellite: attitude hold, a few thruster pulses while it stabilizes
  coastStep(ctx, sat, tSep + 50, 0.5, (c) => ({ q: progradeAttitude(c.r, c.v), wMax: 0.5 * DEG, aMax: 0.2 * DEG, tau: 5 }), 1.0);
  coastKepler(ctx, sat, end, 10, (r, v) => progradeAttitude(r, v));
  ctx.ch.key('sat.rcs', START, 0);
  for (const [t0, v] of [[tSep + 4, 0.6], [tSep + 12, 0.4], [tSep + 30, 0.3], [tArrays + 50, 0.3]] as [number, number][]) {
    ctx.ch.key('sat.rcs', t0, 0);
    ctx.ch.key('sat.rcs', t0 + 0.3, v);
    ctx.ch.key('sat.rcs', t0 + 1.2, v);
    ctx.ch.key('sat.rcs', t0 + 1.5, 0);
  }
  ctx.ch.key('sat.arrays', START, 0);
  ctx.ch.key('sat.arrays', tArrays, 0);
  ctx.ch.ease('sat.arrays', tArrays, tArrays + 45, 1, 12);
  ctx.ch.key('sat.antenna', START, 0);
  ctx.ch.key('sat.antenna', tAntenna, 0);
  ctx.ch.ease('sat.antenna', tAntenna, tAntenna + 20, 1, 8);
  ctx.ev('arrays-deploy', tArrays, 'Solar arrays unfold', 'deploy', ['satellite']);
  ctx.ev('antenna-deploy', tAntenna, 'Antenna deploys: first contact with the ground station', 'deploy', ['satellite']);
  // upper stage: backs away with its thrusters, then coasts
  const tAway = tSep + 20;
  coastStep(ctx, up, tAway, 0.5, () => null, 1.0, rec);
  up.extra = vscale(ax, -0.03);
  ctx.ch.key('s2.rcs', tAway, 0);
  ctx.ch.key('s2.rcs', tAway + 0.5, 0.7);
  coastStep(ctx, up, tAway + 20, 0.5, () => null, 1.0, rec);
  ctx.ch.key('s2.rcs', tAway + 20, 0.7);
  ctx.ch.key('s2.rcs', tAway + 20.5, 0);
  up.extra = v3();
  coastKepler(ctx, up, end, 10, (r, v) => progradeAttitude(r, v));

  ctx.exists.upper = [START, end];
  ctx.exists.satellite = [START, end];
  ctx.exists.booster = [START, end];

  // ── phases
  const T = a.times;
  const r = a.rtls!;
  const E = (id: string) => ctx.evt(id);
  const mainIds = O.phases.map((p) => p.id);
  const bounds = [START, E('engine-start'), 0, T.towerClear, T.throttleDown, T.throttleUp + 15, T.stageSep, T.ses1, T.fairingSep, T.fairingSep + 15, tSeco, tSeco + 30, tSep, tArrays, end];
  const phases = phasesFrom('leo', O.phases, contiguous(mainIds, bounds));
  const branchEnd = r.touchdown + 15;
  const bshots: Shot[] = tidyShots(
    [
      shot('staging', T.stageSep - 2, T.stageSep + 14, 'booster', 'upper', { d: 70, az: 110, el: 6 }),
      shot('chase', T.stageSep + 14, r.boostbackStart + 4, 'booster', undefined, { d: 90, az: 60, el: 10 }),
      shot('side', r.boostbackStart + 4, r.boostbackEnd, 'booster', undefined, { d: 160 }),
      shot('orbit', r.boostbackEnd, r.entryStart - 12, 'booster', 'earth', { d: 140, az: 40, el: 18 }),
      shot('entry', r.entryStart - 12, r.entryEnd + 10, 'booster', undefined, { d: 110, az: 70, el: -8 }),
      shot('chase', r.entryEnd + 10, r.landingStart - 6, 'booster', undefined, { d: 120, az: 30, el: 8 }),
      shot('landing', r.landingStart - 6, branchEnd, 'booster', undefined, { frame: 1.4 }),
    ],
    T.stageSep - 2,
    branchEnd,
  );
  const branches = branchFrom('leo', [T.stageSep, r.boostbackStart, r.boostbackEnd, r.entryStart, r.entryEnd, r.landingStart, branchEnd], bshots);

  // ── shots (main storyline)
  const shots = tidyShots(
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
      shot('orbit', T.fairingSep + 18, tSeco - 20, 'upper', 'earth', { d: 70 }),
      shot('chase', tSeco - 20, tSeco + 25, 'upper', undefined, { d: 45, az: 150, el: 10 }),
      shot('orbit', tSeco + 25, circ.start - 25, 'upper', 'earth', { d: 80 }),
      shot('chase', circ.start - 25, circ.end + 30, 'upper', undefined, { d: 50, az: 140, el: 12 }),
      shot('orbit', circ.end + 30, tSep - 15, 'upper', 'earth', { d: 70 }),
      shot('deploy', tSep - 15, tArrays - 5, 'satellite', 'upper', { d: 24, az: 60, el: 15 }),
      shot('deploy', tArrays - 5, tAntenna + 25, 'satellite', undefined, { d: 26, az: 120, el: 20 }),
      shot('orbit', tAntenna + 25, end, 'satellite', 'earth', { d: 40 }),
    ],
    START,
    end,
  );

  // ── presentation: 1x through powered flight, coasts accelerated
  const coast1 = circ.start - 20;
  const pres = new Pres(START)
    .to(tSeco + 40)
    .to(coast1, 30, rateNote('Coast to apogee (half an orbit)', 30))
    .to(circ.end + 20)
    .to(tSep - 20, 8, rateNote('Coast', 8))
    .to(end).segs;

  // ── facts
  ascentFacts(ctx, a);
  ctx.fact('payloadKg', payload);
  ctx.fact('insertion.periKm', ins.peri);
  ctx.fact('insertion.apoKm', ins.apo);
  ctx.fact('seco.t', tSeco);
  ctx.fact('seco.s2PropLeftKg', a.burn.prop);
  ctx.fact('circ.t', circ.start);
  ctx.fact('circ.dv', circDv);
  ctx.fact('orbit.periKm', fin.peri);
  ctx.fact('orbit.apoKm', fin.apo);
  ctx.fact('orbit.incDeg', incToEquator(up.r, up.v));
  ctx.fact('orbit.s2PropLeftKg', up.tanks.s2 ?? 0);
  ctx.fact('payloadSep.t', tSep);
  ctx.fact('orbit.periodMin', elements(sat.r, sat.v, MU_EARTH).period / 60);
  ctx.fact('fairingSep.t', T.fairingSep);

  return {
    id: 'leo',
    variant: ['satellite', 'recovery'],
    payload: 'leoSat',
    start: START,
    end,
    bodies: ctx.tracks(end, ['booster', 'upper', 'fairingA', 'fairingB', 'satellite']),
    channels: ctx.ch.build(),
    events: ctx.sortedEvents(),
    phases,
    branches,
    shots,
    pres,
    moonPhase0: 0,
    facts: ctx.facts,
  };
}

/** RCS activity from the craft's angular acceleration during attitude slews. */
export function rcsChannel(ctx: Ctx, c: Craft, id: 's1.rcs' | 's2.rcs' | 'cap.rcs' | 'sm.rcs' | 'sat.rcs') {
  const a = vlen(c.alpha) / (0.4 * DEG);
  ctx.ch.key(id, c.t, Math.min(1, a > 0.05 ? 0.3 + 0.7 * Math.min(1, a) : 0));
}

export { qdelta };
