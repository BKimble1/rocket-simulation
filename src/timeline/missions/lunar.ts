/**
 * Lunar flyby: expendable booster, upper-stage burn to a 200 km parking orbit, a coast to the
 * departure point, settling thrusters and a restart for trans-lunar injection (TLI), probe
 * separation, then about three days of coasting under the pull of both the Earth and the Moon
 * (restricted three-body model, see physics/cislunar.ts), a closest approach about 1,500 km
 * above the Moon on its TRAILING side, and the outbound leg away from the Earth-Moon system.
 *
 * Physics note (a gravity assist): the probe crosses the Moon's orbit just behind the Moon, so
 * its closest approach is on the side the Moon is moving away from (the trailing side), near the
 * edge of the disc as seen from the Earth. Seen from the Moon the probe only swings around and
 * leaves at the speed it came in with, but the Moon's pull, aimed forward along the Moon's own
 * motion, adds energy and angular momentum relative to the Earth: the probe leaves the sphere
 * of influence faster than Earth escape speed at that distance, on a hyperbolic path
 * (eccentricity about 1.9) that carries it out of the Earth-Moon system ("swing past the Moon
 * and continue outbound", as the outline says). A pass around the far side (the leading side
 * for this three-day transfer) would do the opposite and bend the path back toward the Earth
 * (the free-return geometry): findMoonPhase(..., 'far').

 * The Moon's orbit lies in the parking-orbit plane (the launch is assumed timed for that
 * geometry, as in world/frames.ts). The TLI energy is chosen for a three-day trip to the Moon's
 * distance and the Moon's phase at T-0 by a deterministic search. The Moon's gravity is switched
 * on from probe separation (before it, its tidal effect near the Earth is negligible here).
 *
 * Reference trajectory from the simplified point-mass model, computed once.
 */
import { PAYLOADS } from '../../vehicle/spec';
import { MOON_DISTANCE, MU_EARTH, R_EARTH, R_MOON } from '../../world/frames';
import type { MissionTimeline, Shot } from '../types';
import { cdFreeMolecular } from '../physics/aero';
import { cloneCraft, comFrom } from '../physics/ascent';
import { coastCislunar, findMoonPhase, moonAt, SOI_MOON, timeToRadiusOut } from '../physics/cislunar';
import { Craft } from '../physics/craft';
import { Ctx } from '../physics/context';
import { elements, kepler, timeToAnomaly } from '../physics/kepler';
import { apsidesKm, incToEquator, progradeAttitude } from '../physics/orbit';
import { sumMass } from '../physics/vehicle';
import { DEG, qaxisY, v3, vadd, vdot, vlen, vnorm, vscale, vsub, type V3 } from '../physics/vec';
import { OUTLINES } from './outline';
import { Pres, contiguous, num, phasesFrom, rateNote, shot, tidyShots } from './common';
import { ascentFacts, coastSettleBurn, flyOrbitalAscent, s2Channels } from './flight';

const START = -60;
/** Entry interface altitude for the free-return estimate (m). */
const ENTRY_ALT = 120e3;

/** Two-body time (s) from an inbound elliptic state to the radius rt (below the current radius). */
function timeToRadiusIn(r: V3, v: V3, rt: number): number {
  const el = elements(r, v, MU_EARTH);
  const p = (vlen(el.h) ** 2) / MU_EARTH;
  const c = (p / rt - 1) / el.e;
  if (c > 1) return NaN;
  // the inbound crossing of rt: true anomaly -acos(c), i.e. 2 pi - acos(c)
  return timeToAnomaly(r, v, MU_EARTH, 2 * Math.PI - Math.acos(Math.max(-1, c)));
}
/** Wanted closest-approach altitude above the lunar surface (m). */
const FLYBY_ALT = 1500e3;
/** Two-body time of flight from TLI to the Moon's distance (s): about three days. */
const TOF = 2.9 * 86400;
/** Parking-orbit coast from first cutoff to the TLI ignition (s). */
const PARK_COAST = 1500;

/** Specific energy whose two-body trip from perigee radius rp to the Moon's distance takes `tof`. */
function tliEnergy(rp: number, tof: number): number {
  const t = (E: number) => {
    const vp = Math.sqrt(2 * (E + MU_EARTH / rp));
    return timeToRadiusOut({ x: rp, y: 0, z: 0 }, { x: 0, y: vp, z: 0 }, MOON_DISTANCE);
  };
  let lo = -MU_EARTH / (rp + MOON_DISTANCE) + 1; // Hohmann-like: slowest
  let hi = 2e6; // hyperbolic: fast
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2;
    const tm = t(m);
    if (!Number.isFinite(tm) || tm > tof) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

export function buildLunar(): MissionTimeline {
  const ctx = new Ctx();
  const O = OUTLINES.lunar;
  const payload = PAYLOADS.lunarProbe.mass;
  const a = flyOrbitalAscent(ctx, {
    spec: { payload: 'lunarProbe', recovery: false, crew: false, boosterOnly: false },
    gammaMeco: 30,
    rtls: null,
    insertion: { rp: 200e3, ra: 200e3 },
    // warm starts: the converged values of the deterministic searches
    ltg0: { A: -0.15264, B: 0.00108 },
    kick0: 0.97544,
    gLimitS1: 4.5 * 9.80665,
    gLimitS2: 4.5 * 9.80665,
    s2Keep: 10_000,
    padStart: START,
    armsRetract: -45,
    end: 10_000,
  });
  const up = a.upper;
  const tSeco1 = a.burn.tCut;
  ctx.ev('seco1', tSeco1, 'Upper-stage cutoff: in a 200 km parking orbit', 'engine', ['upper'], 'cutoff');
  const park = apsidesKm(up.r, up.v);
  const parkInc = incToEquator(up.r, up.v);
  const s2AtPark = up.tanks.s2 ?? 0;

  // ── TLI: restart after a parking coast, cut at the energy of a three-day trip
  const eTli = tliEnergy(vlen(up.r), TOF);
  const tIgn = Math.round(tSeco1 + PARK_COAST);
  const burn = coastSettleBurn(ctx, up, {
    tIgn,
    settle: 15,
    // the same 4.5 g ceiling as the first burn: the light stage throttles down (to its 60 %
    // minimum) instead of pressing the payload with 10 g or more at the end of the burn
    gLimit: 4.5 * 9.80665,
    dir: (c) => vnorm(c.v),
    done: (r, v) => (vlen(v) ** 2) / 2 - MU_EARTH / vlen(r) - eTli,
  });
  ctx.ev('settling', burn.settleStart, 'Settling thrusters push the propellant to the tank bottoms', 'engine', ['upper'], 'rcs');
  ctx.ev('ses2', burn.start, 'Upper-stage restart: trans-lunar injection', 'engine', ['upper'], 'ignition');
  ctx.ev('seco2', burn.cut, 'Cutoff: on the way to the Moon', 'engine', ['upper'], 'cutoff');
  const vAfterTli = vlen(up.v);

  // ── probe separation (Moon gravity still off: its tidal pull near the Earth is negligible)
  const tSep = Math.ceil(up.t + 120);
  while (up.t < tSep - 1e-9) {
    up.step(Math.min(1, tSep - up.t), { q: progradeAttitude(up.r, up.v), wMax: 2 * DEG, aMax: 0.5 * DEG, tau: 3 });
    ctx.rec(up, 2);
    s2Channels(ctx, up);
  }
  const satItem = a.items.find((it) => it.tag === 'satellite')!;
  const upperRest = a.items.filter((it) => it.tag === 'upper');
  const probe = up.split({ bodies: ['satellite'], fixedMass: payload, aero: { area: 4, cd: cdFreeMolecular }, comFn: () => satItem.c, parentFixedMass: sumMass(upperRest).m, parentComFn: comFrom(upperRest) });
  const ax = qaxisY(up.q);
  const mS = probe.mass;
  const mU = up.mass;
  probe.v = vadd(probe.v, vscale(ax, (0.4 * mU) / (mS + mU)));
  up.v = vadd(up.v, vscale(ax, (-0.4 * mS) / (mS + mU)));
  probe.w = v3();
  probe.record();
  up.record();
  ctx.ev('payload-sep', tSep, 'Probe separation: springs push it away at 0.4 m/s', 'separation', ['satellite', 'upper'], 'sep');
  ctx.attached.satellite = { to: 'upper', until: tSep };

  // ── Moon phase: deterministic search for a trailing-side pass at FLYBY_ALT
  const found = findMoonPhase(
    probe,
    FLYBY_ALT,
    (c, ph) => {
      const k = cloneCraft(c);
      k.env.moonPhase0 = ph;
      return k;
    },
    'trailing',
  );
  const phase0 = found.phase0;
  ctx.env.moonPhase0 = phase0;

  // upper stage: backs away, then its track ends (a disposal burn would send it elsewhere)
  const upEnd = tSep + 3600;
  up.extra = vscale(ax, -0.03);
  ctx.ch.key('s2.rcs', tSep + 5, 0);
  ctx.ch.key('s2.rcs', tSep + 5.5, 0.6);
  while (up.t < tSep + 35 - 1e-9) {
    up.step(1, null);
    ctx.rec(up, 2);
  }
  up.extra = v3();
  ctx.ch.key('s2.rcs', up.t, 0.6);
  ctx.ch.key('s2.rcs', up.t + 0.5, 0);
  // recorded as densely as the probe near the Earth, so the two stay correctly placed side by side
  coastCislunar(up, upEnd, (c) => ctx.rec(c, vlen(c.r) - R_EARTH < 20_000e3 ? 20 : 120));
  ctx.rec(up, 0, true);

  // probe: arrays, then the three-body coast through the flyby and out
  ctx.ch.key('sat.arrays', START, 0);
  ctx.ch.key('sat.arrays', tSep + 60, 0);
  ctx.ch.ease('sat.arrays', tSep + 60, tSep + 100, 1, 10);
  ctx.ch.key('sat.antenna', START, 0);
  ctx.ch.key('sat.antenna', tSep + 110, 0);
  ctx.ch.ease('sat.antenna', tSep + 110, tSep + 125, 1, 6);
  ctx.ch.key('sat.rcs', START, 0);
  for (const t0 of [tSep + 4, tSep + 16]) {
    ctx.ch.key('sat.rcs', t0, 0);
    ctx.ch.key('sat.rcs', t0 + 0.3, 0.5);
    ctx.ch.key('sat.rcs', t0 + 1.2, 0.5);
    ctx.ch.key('sat.rcs', t0 + 1.5, 0);
  }
  // record densely near the Moon so the cubic interpolation follows the bend of the flyby
  const recProbe = (c: Craft) => {
    const d = vlen(vsub(c.r, moonAt(c.t, phase0)));
    const e = vlen(c.r) - R_EARTH;
    ctx.rec(c, d < 30_000e3 ? 30 : e < 20_000e3 ? 20 : 300);
  };
  const fb = coastCislunar(probe, found.flyby.t + 4 * 86400, recProbe, Infinity, 3 * 3600);
  ctx.rec(probe, 0, true);
  const end = probe.t;
  if (Number.isNaN(fb.soiExit)) throw new Error('lunar flyby: the probe did not leave the sphere of influence');
  ctx.ev('soi-enter', fb.soiEnter, `Entering the Moon's sphere of influence (${(SOI_MOON / 1e6).toFixed(0)},000 km): the Moon's pull now dominates`, 'milestone', ['satellite']);
  const where =
    fb.angleFromEarthDeg > 110 ? 'on the far side, beyond the Moon as seen from the Earth' : fb.angleFromEarthDeg < 70 ? 'on the side facing the Earth' : 'near the edge of the disc as seen from the Earth';
  const caLabel = fb.trailing
    ? `Closest approach: ${num(fb.alt / 1000)} km above the Moon, passing behind it in its orbital motion (the trailing side), ${where}: the Moon's pull adds energy`
    : `Closest approach: ${num(fb.alt / 1000)} km above the Moon, ahead of it in its orbital motion (the leading side), ${where}: the Moon's pull takes energy`;
  ctx.ev('closest-approach', fb.t, caLabel, 'milestone', ['satellite']);
  // where the flyby leaves the probe (two-body Earth orbit from the final state)
  const elEnd = elements(probe.r, probe.v, MU_EARTH);
  // geocentric speed at the sphere-of-influence exit, and Earth escape speed there
  const exitSpeed = vlen(fb.soiExitV!);
  const exitEscape = Math.sqrt((2 * MU_EARTH) / vlen(fb.soiExitR!));
  const returns = elEnd.e < 1 && elEnd.rp < R_EARTH + ENTRY_ALT;
  const tReturn = returns ? timeToRadiusIn(probe.r, probe.v, R_EARTH + ENTRY_ALT) : NaN;
  const exitLabel = returns
    ? `Leaving the Moon's sphere of influence: not captured. The flyby has turned the path back toward the Earth (a free-return path): uncorrected, it would re-enter about ${Math.round((probe.t + tReturn - fb.soiExit) / 86400)} days later`
    : elEnd.e < 1
      ? "Leaving the Moon's sphere of influence: not captured, on a new, high Earth orbit"
      : `Leaving the Moon's sphere of influence: not captured. The flyby has added energy: ${(exitSpeed / 1000).toFixed(2)} km/s relative to the Earth, above escape speed, so the probe leaves the Earth-Moon system`;
  ctx.ev('soi-exit', fb.soiExit, exitLabel, 'milestone', ['satellite']);
  ctx.exists.upper = [START, upEnd];
  ctx.exists.satellite = [START, end];

  // ── phases
  const T = a.times;
  const E = (id: string) => ctx.evt(id);
  const H = 3600;
  const bounds = [START, E('engine-start'), 0, T.towerClear, T.throttleDown, T.throttleUp + 15, T.stageSep, T.ses1, T.fairingSep, T.fairingSep + 15, tSeco1, burn.settleStart, burn.end + 20, tSep + 90, fb.soiEnter, fb.t - H, fb.t + H, end];
  const phases = phasesFrom('lunar', O.phases, contiguous(O.phases.map((p) => p.id), bounds));

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
      shot('deploy', tSep - 12, tSep + 140, 'satellite', 'upper', { d: 20, az: 60, el: 15 }),
      shot('orbit', tSep + 140, tSep + 3 * H, 'satellite', 'earth', { d: 30, az: 200, el: 20 }),
      shot('lunar', tSep + 3 * H, fb.t - 2 * H, 'satellite', 'moon', { d: 40 }),
      shot('lunar', fb.t - 2 * H, fb.t + 2 * H, 'satellite', 'moon', { d: 25 }),
      shot('orbit', fb.t + 2 * H, end, 'satellite', 'moon', { d: 30, az: 160, el: 15 }),
    ],
    START,
    end,
  );

  // ── presentation (under 15 minutes): 1x through the first-stage flight, staging and the
  // injection, the long steady upper-stage burn and the coasts accelerated, the cruise compressed
  // hard, the flyby slower
  const pres = new Pres(START)
    .to(T.fairingSep + 20)
    .to(tSeco1 - 20, 2, rateNote('Upper-stage burn', 2))
    .to(tSeco1 + 20)
    .to(burn.settleStart - 20, 20, rateNote('Coast in the parking orbit', 20))
    .to(burn.end + 15)
    .to(tSep - 15, 4, rateNote('Coast', 4))
    .to(tSep + 30)
    .to(tSep + 130, 4, rateNote('Arrays and antenna deploying', 4))
    .to(tSep + 2 * H, 120, rateNote('Coast', 120))
    .omit(fb.soiEnter - 6 * H, 'Quiet interval omitted: about two days of coasting outward')
    .to(fb.t - H, 1800, rateNote('Coast', 1800))
    .to(fb.t + H, 100, rateNote('Flyby', 100))
    .to(end, 2400, rateNote('Coast', 2400)).segs;

  // ── facts
  const elOut = elements(probe.r, probe.v, MU_EARTH);
  ascentFacts(ctx, a);
  ctx.fact('payloadKg', payload);
  ctx.fact('parking.periKm', park.peri);
  ctx.fact('parking.apoKm', park.apo);
  ctx.fact('parking.incDeg', parkInc);
  ctx.fact('seco1.t', tSeco1);
  ctx.fact('seco1.s2PropLeftKg', s2AtPark);
  ctx.fact('tli.t', burn.start);
  ctx.fact('tli.burnS', burn.cut - burn.start);
  ctx.fact('tli.speed', vAfterTli);
  ctx.fact('tli.c3km2s2', (2 * eTli) / 1e6);
  ctx.fact('tli.s2PropLeftKg', up.tanks.s2 ?? 0);
  ctx.fact('payloadSep.t', tSep);
  ctx.fact('moonPhase0Deg', ((phase0 * 180) / Math.PI) % 360);
  ctx.fact('soiEnter.t', fb.soiEnter);
  ctx.fact('soiExit.t', fb.soiExit);
  ctx.fact('soiKm', SOI_MOON / 1000);
  ctx.fact('closestApproach.t', fb.t);
  ctx.fact('closestApproach.altKm', fb.alt / 1000);
  ctx.fact('closestApproach.farSide', fb.farSide ? 1 : 0);
  ctx.fact('closestApproach.trailingSide', fb.trailing ? 1 : 0);
  ctx.fact('closestApproach.angleFromEarthDeg', fb.angleFromEarthDeg);
  ctx.fact('closestApproach.speedRelMoon', relSpeedAt(ctx, fb.t, phase0));
  ctx.fact('cruise.days', (fb.t - tSep) / 86400);
  ctx.fact('soiExit.speed', exitSpeed);
  ctx.fact('soiExit.escapeSpeed', exitEscape);
  ctx.fact('soiExit.distanceKm', vlen(fb.soiExitR!) / 1000);
  ctx.fact('outbound.energy', elOut.energy);
  ctx.fact('outbound.vInf', elOut.energy > 0 ? Math.sqrt(2 * elOut.energy) : 0);
  ctx.fact('outbound.ecc', elOut.e);
  ctx.fact('outbound.radialSpeed', vdot(probe.r, probe.v) / vlen(probe.r));
  ctx.fact('outbound.distanceKm', vlen(probe.r) / 1000);
  ctx.fact('outbound.perigeeAltKm', (elEnd.rp - R_EARTH) / 1000);
  ctx.fact('outbound.earthReturnDays', returns ? (probe.t + tReturn - fb.soiExit) / 86400 : 0);
  void kepler;
  void R_MOON;

  return {
    id: 'lunar',
    variant: ['satellite', 'expendable'],
    payload: 'lunarProbe',
    start: START,
    end,
    bodies: ctx.tracks(end, ['booster', 'upper', 'fairingA', 'fairingB', 'satellite']),
    channels: ctx.ch.build(),
    events: ctx.sortedEvents(),
    phases,
    branches: [],
    shots,
    pres,
    moonPhase0: phase0,
    facts: ctx.facts,
  };
}

/** Probe speed relative to the Moon at time t (from the recorded samples nearest t). */
function relSpeedAt(ctx: Ctx, t: number, phase0: number): number {
  let best: { t: number; v: { x: number; y: number; z: number } } | null = null;
  for (const s of ctx.env.segments) {
    if (!s.bodies.includes('satellite')) continue;
    for (const smp of s.samples) if (!best || Math.abs(smp.t - t) < Math.abs(best.t - t)) best = { t: smp.t, v: smp.v };
  }
  if (!best) return NaN;
  const dt = 1;
  const m0 = moonAt(best.t - dt, phase0);
  const m1 = moonAt(best.t + dt, phase0);
  const vm = vscale(vsub(m1, m0), 1 / (2 * dt));
  return vlen(vsub(best.v, vm));
}
