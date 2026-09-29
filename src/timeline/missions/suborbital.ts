/**
 * Suborbital research flight: the booster alone (three engines: centre + two outer) lofts the
 * research capsule on a nearly vertical path tilted slightly off the vertical, cuts off when
 * the coast apogee reaches about 115 km, releases the capsule, and flies back to the landing
 * zone with its grid fins and a centre-engine landing burn (no boostback). The capsule coasts
 * over apogee in free fall, re-enters heat shield first and splashes down offshore under its
 * parachutes.
 *
 * The first-stage propellant load is computed (a deterministic fixed-point iteration: burn to
 * the apogee cutoff plus the landing burn plus a margin), and the launch azimuth and tilt are
 * found by a small Newton search so that the booster's unsteered descent already heads for the
 * landing zone (the grid fins then only trim it). Reference trajectory from the simplified
 * point-mass model, computed once.
 */
import { PAYLOADS, S1 } from '../../vehicle/spec';
import { R_EARTH } from '../../world/frames';
import type { MissionTimeline, Shot } from '../types';
import { cdSlender } from '../physics/aero';
import { comFrom, flyFirstStage, padBurn, padSequence, stackAtLiftoff, stackItems, type PadTimes, type S1Params, type StackSpec } from '../physics/ascent';
import { Craft } from '../physics/craft';
import { Ctx } from '../physics/context';
import { DROGUE_CDA, MAIN_CDA, flyCapsuleDescent } from '../physics/entry';
import { flyBoosterReturn, padLocal, type RtlsResult } from '../physics/landing';
import { RESEARCH_CAPSULE_ITEM, areaOf, boosterDry, sumMass } from '../physics/vehicle';
import { DEG, qaxisY, v3, vadd, vcross, vnorm, vscale, type V3 } from '../physics/vec';
import { OUTLINES } from './outline';
import { Pres, branchFrom, contiguous, phasesFrom, rateNote, shot, tidyShots } from './common';
import { landedBooster } from './flight';

const START = -60;
const SPEC: StackSpec = { payload: 'researchCapsule', recovery: true, crew: false, boosterOnly: true };
const PT: PadTimes = { start: START, armsRetract: -45, engineStart: -3.0, centreRamp: [-3.0, -2.0], outerRamp: [-2.6, -1.4], outerN: 2, liftoffThrottle: 0.9 };
/**
 * First-stage cutoff when the predicted vacuum apogee reaches this (m): the stack coasts on
 * together to about 75 km before the capsule is released, so the capsule loses only a little of
 * it to drag and peaks near 116 km.
 */
const APOGEE = 116_500;
/** Propellant the booster keeps after touchdown (kg). */
const MARGIN = 600;
/** Earliest capsule release after the end of the cutoff transient (s). */
const SEP_DELAY = 2.2;
/**
 * Capsule release waits until the dynamic pressure has fallen below this (Pa), about 75 km up:
 * the light, blunt capsule decelerates in the air far more than the booster, so released in
 * denser air (MECO is near 37 km, a few kPa) it would fall straight back onto the booster.
 */
const SEP_Q = 20;
/**
 * Where the booster's unsteered descent should come down relative to the landing zone (pad-
 * local metres east/north): offset seaward so that the capsule, which falls a little shorter
 * along the same azimuth, splashes down in the Atlantic, while the grid fins and the landing
 * burn fly the booster the last kilometres back over the coast to the pad.
 */
const NATURAL_OFFSET = { e: 1650, n: -750 };

/** Launch direction (frame I at T-0) for an azimuth (deg from north, clockwise). */
function heading(azDeg: number): V3 {
  const a = azDeg * DEG;
  // pad-local x east, z south: north = -z
  return vnorm(v3(Math.sin(a), 0, -Math.cos(a)));
}

function params(azDeg: number, kick: number): Omit<S1Params, 'record'> {
  const h = heading(azDeg);
  return {
    heading: h,
    side: vnorm(vcross(h, v3(0, 1, 0))),
    kickDeg: kick,
    kickDur: 6,
    kickDelay: 1.0,
    towerClearAlt: 110,
    bucket: null,
    gLimit: 3.6 * 9.80665,
    cutoff: { kind: 'apogee', alt: APOGEE },
    outerN: PT.outerN,
    liftoffThrottle: PT.liftoffThrottle,
    maxThrottle: 1,
  };
}

interface HopTrial {
  booster: Craft;
  capsule: Craft;
  stack: Craft;
  meco: number;
  sep: number;
  s1: ReturnType<typeof flyFirstStage>;
}

/** Fly the stack from liftoff through capsule release (optionally recorded). */
function hop(ctx: Ctx | null, env: Craft['env'], load: number, az: number, kick: number): HopTrial {
  const stack = stackAtLiftoff(env, SPEC, load - padBurn(PT), 0, PT);
  if (ctx) stack.record();
  const s1 = flyFirstStage(ctx, stack, { ...params(az, kick), record: !!ctx });
  // coast to release with the attitude held
  const hold = { q: stack.q, wMax: 5 * DEG, aMax: 1.5 * DEG, tau: 2 };
  const earliest = Math.round((stack.t + SEP_DELAY) * 10) / 10;
  while (stack.t < earliest - 1e-9 || stack.q_dyn > SEP_Q) {
    stack.step(stack.t < earliest - 1e-9 ? Math.min(0.2, earliest - stack.t) : 0.2, hold);
    if (ctx) ctx.rec(stack, stack.t < earliest ? 0.2 : 0.5);
    if (stack.t > earliest + 120) break;
  }
  const sep = stack.t;
  const bItems = boosterDry(true);
  const capsule = stack.split({
    bodies: ['capsule'],
    fixedMass: RESEARCH_CAPSULE_ITEM.m,
    aero: { area: areaOf(3.9), cd: cdSlender },
    comFn: () => RESEARCH_CAPSULE_ITEM.c,
    parentFixedMass: sumMass(bItems).m,
    parentAero: { area: areaOf(3.7), cd: cdSlender },
    parentComFn: comFrom(bItems),
  });
  // separation springs: 0.8 m/s relative along the axis, momentum conserved
  const ax = qaxisY(stack.q);
  const mc = capsule.mass;
  const mb = stack.mass;
  capsule.v = vadd(capsule.v, vscale(ax, (0.8 * mb) / (mb + mc)));
  stack.v = vadd(stack.v, vscale(ax, (-0.8 * mc) / (mb + mc)));
  if (ctx) {
    capsule.record();
    stack.record();
  }
  return { booster: stack, capsule, stack, meco: s1.meco, sep, s1 };
}

const SIDE = v3(0, 0, 1);

export function buildSuborbital(): MissionTimeline {
  const O = OUTLINES.suborbital;
  // ── deterministic sizing: propellant load, launch azimuth and tilt (warm-started)
  let load = 53_900;
  let az = 153.9;
  let kick = 0.85;
  const trialEnv = (): Craft['env'] => ({ moonPhase0: null, segments: [] });
  const trial = (L: number, a: number, k: number): { r: RtlsResult; h: HopTrial } => {
    const h = hop(null, trialEnv(), L, a, k);
    const r = flyBoosterReturn(null, h.booster, { tSep: h.sep, bias: { e: 0, n: 0 }, record: false, side: SIDE, hop: true });
    return { r, h };
  };
  for (let it = 0; it < 6; it++) {
    const base = trial(load, az, kick);
    const z0 = base.r.aeroZem ?? { e: 0, n: 0 };
    const z = { e: z0.e + NATURAL_OFFSET.e, n: z0.n + NATURAL_OFFSET.n };
    const dProp = base.r.propLeft - MARGIN;
    const aimOk = Math.hypot(z.e, z.n) < 120;
    if (aimOk && Math.abs(dProp) < 250 && base.r.miss < 3 && base.r.touchdownSpeed < 2) break;
    if (!aimOk) {
      // Newton step on (azimuth, tilt) for the miss the fins would face
      const da = 1.0;
      const dk = 0.1;
      const za0 = trial(load, az + da, kick).r.aeroZem ?? z0;
      const zk0 = trial(load, az, kick + dk).r.aeroZem ?? z0;
      const za = { e: za0.e + NATURAL_OFFSET.e, n: za0.n + NATURAL_OFFSET.n };
      const zk = { e: zk0.e + NATURAL_OFFSET.e, n: zk0.n + NATURAL_OFFSET.n };
      const J = [
        [(za.e - z.e) / da, (zk.e - z.e) / dk],
        [(za.n - z.n) / da, (zk.n - z.n) / dk],
      ];
      const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
      if (Math.abs(det) > 1e-9) {
        let sa = -(J[1][1] * z.e - J[0][1] * z.n) / det;
        let sk = -(-J[1][0] * z.e + J[0][0] * z.n) / det;
        const s = Math.max(1, Math.abs(sa) / 20, Math.abs(sk) / 1.5);
        sa /= s;
        sk /= s;
        az += sa;
        kick = Math.max(0.3, kick + sk);
      }
    }
    if (base.r.touchdown > 0) load = Math.min(S1.propellant, load - dProp * 1.05);
  }

  // ── recorded flight
  const ctx = new Ctx();
  const { bodies } = stackItems(SPEC);
  // the countdown first: channels only take keys in time order
  const liftoffMass = sumMass(stackItems(SPEC).items).m + load - padBurn(PT);
  padSequence(ctx, bodies, PT, { crew: false, liftoffMass, s1AtLiftoff: load - padBurn(PT) });
  const h = hop(ctx, ctx.env, load, az, kick);
  const tSep = h.sep;
  const meco = h.meco;
  const r = flyBoosterReturn(ctx, h.booster, { tSep, bias: { e: 0, n: 0 }, record: true, side: SIDE, hop: true });
  // capsule: free fall, entry, parachutes, splashdown
  const capsule = h.capsule;
  const provisionalEnd = tSep + 1200;
  const d = flyCapsuleDescent(
    ctx,
    capsule,
    { drogueCdA: DROGUE_CDA, mainCdA: MAIN_CDA, reefFrac: 0.12, drogueAlt: 6500, mainAlt: 2000, disreefDelay: 7, liftLD: 0, comAboveNadir: 1.5, side: SIDE, eiAlt: 100_000, record: true, end: provisionalEnd, rcsChannel: 'cap.rcs' },
    55_000,
  );
  const end = Math.max(d.splash + 45, r.touchdown + 20);
  landedBooster(ctx, h.booster, end);

  // ── events
  ctx.ev('tower-clear', h.s1.towerClear, 'Tower cleared', 'milestone', ['booster']);
  ctx.ev('meco', meco, `Engine cutoff: the capsule will coast to ${(d.apogee.alt / 1000).toFixed(0)} km`, 'engine', ['booster', 'capsule'], 'cutoff');
  ctx.ev('capsule-sep', tSep, 'Capsule separation: springs push it clear of the booster', 'separation', ['capsule', 'booster'], 'sep');
  ctx.ev('karman-up', d.karmanUp, 'Crossing 100 km: the conventional edge of space', 'milestone', ['capsule']);
  ctx.ev('apogee', d.apogee.t, `Apogee ${(d.apogee.alt / 1000).toFixed(0)} km: weightless free fall`, 'milestone', ['capsule']);
  ctx.ev('karman-down', d.karmanDown, 'Back below 100 km', 'milestone', ['capsule']);
  ctx.ev('peak-heating', d.peakHeating.t, `Peak heating at ${(d.peakHeating.alt / 1000).toFixed(0)} km, ${d.peakHeating.speed.toFixed(0)} m/s`, 'entry', ['capsule']);
  ctx.ev('drogue-deploy', d.drogue, 'Drogue parachutes', 'recovery', ['capsule'], 'chute');
  ctx.ev('main-deploy', d.main, 'Main parachutes, reefed', 'recovery', ['capsule'], 'chute');
  ctx.ev('main-disreef', d.disreef, 'Mains fully open', 'recovery', ['capsule']);
  ctx.ev('splashdown', d.splash, `Splashdown at ${d.splashSpeed.toFixed(1)} m/s`, 'recovery', ['capsule'], 'splash');
  ctx.ev('fins-deploy', r.finsDeploy, 'Grid fins deploy', 'deploy', ['booster'], 'valve');
  ctx.ev('landing-start', r.landingStart, 'Landing burn: centre engine only', 'burn', ['booster'], 'ignition');
  ctx.ev('legs-deploy', r.touchdown - 8, 'Landing legs deploy', 'deploy', ['booster'], 'valve');
  ctx.ev('touchdown', r.touchdown, 'Touchdown on the landing zone', 'recovery', ['booster'], 'touchdown');
  ctx.ch.key('s1.fins', START, 0);
  ctx.ch.key('s1.fins', r.finsDeploy, 0);
  ctx.ch.ease('s1.fins', r.finsDeploy, r.finsDeploy + 3, 1, 6);
  ctx.ch.key('s1.legs', START, 0);
  ctx.ch.key('s1.legs', r.touchdown - 8, 0);
  ctx.ch.ease('s1.legs', r.touchdown - 8, r.touchdown - 5.5, 1, 6);
  ctx.exists.booster = [START, end];
  ctx.exists.capsule = [START, end];
  ctx.attached.capsule = { to: 'booster', until: tSep };

  // ── phases
  const E = (id: string) => ctx.evt(id);
  const tEntry = d.markT;
  const bounds = [START, E('engine-start'), 0, meco, tSep, tSep + 12, d.karmanDown, tEntry, d.drogue, d.splash, end];
  const phases = phasesFrom('suborbital', O.phases, contiguous(O.phases.map((p) => p.id), bounds));
  const aeroStart = r.entryStart;
  const bEnd = r.touchdown + 15;
  const bshots: Shot[] = tidyShots(
    [
      shot('staging', tSep - 2, tSep + 12, 'booster', 'capsule', { d: 60, az: 110, el: 6 }),
      shot('chase', tSep + 12, r.finsDeploy + 10, 'booster', undefined, { d: 110, az: 40, el: -10 }),
      shot('side', r.finsDeploy + 10, aeroStart, 'booster', 'earth', { d: 160 }),
      shot('entry', aeroStart, r.landingStart - 8, 'booster', undefined, { d: 120, az: 60, el: -6 }),
      shot('landing', r.landingStart - 8, bEnd, 'booster', undefined, { frame: 1.4 }),
    ],
    tSep - 2,
    bEnd,
  );
  const branches = branchFrom('suborbital', [tSep, aeroStart, r.landingStart, bEnd], bshots);

  // ── shots
  const shots = tidyShots(
    [
      shot('pad-wide', START, -14, 'booster', undefined, { look: 0.4 }),
      shot('pad-close', -14, 5, 'booster', undefined, { look: -0.7, fov: 30 }),
      shot('tower', 5, h.s1.towerClear + 4, 'booster'),
      shot('pad-wide', h.s1.towerClear + 4, h.s1.towerClear + 18, 'booster'),
      shot('ground-track', h.s1.towerClear + 18, meco - 12, 'booster'),
      shot('chase', meco - 12, tSep - 3, 'booster', undefined, { d: 90, az: 30, el: -8 }),
      shot('staging', tSep - 3, tSep + 16, 'capsule', 'booster', { d: 45, az: 100, el: 8 }),
      shot('orbit', tSep + 16, d.apogee.t - 30, 'capsule', 'earth', { d: 40, az: 30, el: 20 }),
      shot('chase', d.apogee.t - 30, d.apogee.t + 40, 'capsule', undefined, { d: 30, az: 120, el: 15 }),
      shot('orbit', d.apogee.t + 40, tEntry - 10, 'capsule', 'earth', { d: 45, az: 200, el: 25 }),
      shot('entry', tEntry - 10, d.drogue - 5, 'capsule', undefined, { d: 40, az: 70, el: -10 }),
      shot('chase', d.drogue - 5, d.main + 20, 'capsule', undefined, { d: 45, az: 40, el: 12 }),
      shot('splash', d.main + 20, end, 'capsule', undefined, { d: 180 }),
    ],
    START,
    end,
  );

  // ── presentation: 1x for the flight, the long canopy descent lightly accelerated
  const pres = new Pres(START)
    .to(tSep + 20)
    .to(d.apogee.t - 40, 2, rateNote('Coast', 2))
    .to(d.apogee.t + 40)
    .to(tEntry - 10, 2, rateNote('Coast', 2))
    .to(d.main + 20)
    .to(d.splash - 20, 4, rateNote('Descent under the main parachutes', 4))
    .to(end).segs;

  // ── facts
  const f = (k: string, v: number) => ctx.fact(k, v);
  const splashEN = padLocal(d.splashPos, d.splash);
  f('payloadKg', PAYLOADS.researchCapsule.mass);
  f('s1LoadKg', load);
  f('s1LoadPct', (100 * load) / S1.propellant);
  f('liftoffMass', liftoffMass);
  f('launchAzimuthDeg', az);
  f('kickDeg', kick);
  f('meco.t', meco);
  f('meco.altKm', h.s1.mecoState.alt / 1000);
  f('meco.speed', h.s1.mecoState.speed);
  f('meco.gammaDeg', (h.s1.mecoState.gamma * 180) / Math.PI);
  f('meco.s1PropLeft', h.s1.mecoState.prop);
  f('capsuleSep.t', tSep);
  f('apogee.t', d.apogee.t);
  f('apogee.km', d.apogee.alt / 1000);
  f('karman.freeFallS', d.karmanDown - d.karmanUp);
  f('entry.peakG', d.peakG.g);
  f('entry.peakG.t', d.peakG.t);
  f('entry.peakHeating.t', d.peakHeating.t);
  f('entry.peakHeating.altKm', d.peakHeating.alt / 1000);
  f('entry.peakHeating.kWm2', d.peakHeating.rate / 1000);
  f('entry.maxQkPa', d.maxQ / 1000);
  f('drogue.t', d.drogue);
  f('main.t', d.main);
  f('splash.t', d.splash);
  f('splash.speed', d.splashSpeed);
  f('splash.eastKm', splashEN.e / 1000);
  f('splash.northKm', splashEN.n / 1000);
  f('rtls.touchdown.t', r.touchdown);
  f('rtls.landingErrorM', r.miss);
  f('rtls.touchdownSpeed', r.touchdownSpeed);
  f('rtls.propLeftKg', r.propLeft);
  f('rtls.tiltDeg', (r.tilt * 180) / Math.PI);
  f('rtls.landingDv', r.landingDv);
  f('rtls.apogeeKm', r.apogee.alt / 1000);
  f('rtls.maxDecelG', r.maxDecel / 9.80665);
  void R_EARTH;

  return {
    id: 'suborbital',
    variant: ['suborbital', 'recovery'],
    payload: 'researchCapsule',
    start: START,
    end,
    bodies: ctx.tracks(end, ['booster', 'capsule']),
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

