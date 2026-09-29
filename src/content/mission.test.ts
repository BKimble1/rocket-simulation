/**
 * The mission figures quoted by the glossary, the checks, the why-demos and the equation notes,
 * checked against (1) standard orbital mechanics from the constants in frames.ts, and (2) the
 * computed mission timelines (buildMission), so the text cannot drift from what the learner sees
 * in the telemetry. Missions whose builder does not exist yet are skipped, not faked.
 */
import { describe, expect, it } from 'vitest';
import { GLOSSARY } from './glossary';
import { CHECKS } from './checks';
import { EQUATIONS } from './equations';
import { WHY_DEMOS } from './why';
import { buildMission, telemetryAt } from '../timeline/build';
import { chan } from '../timeline/sample';
import type { MissionId, MissionTimeline } from '../timeline/types';
import { E1, FAIRING, G0, LEGS, PAYLOADS, S1, S2 } from '../vehicle/spec';
import { MOON_DISTANCE, MU_EARTH, MU_MOON, R_EARTH } from '../world/frames';
import { F } from './parts/derived';

const fmt = (x: number, d = 0) => x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const gloss = (id: string) => {
  const g = GLOSSARY.find((x) => x.id === id);
  if (!g) throw new Error(`missing glossary term ${id}`);
  return g.definition;
};
const check = (id: string) => {
  const c = CHECKS.find((x) => x.id === id);
  if (!c) throw new Error(`missing check ${id}`);
  return [c.prompt, ...c.choices, c.explain].join('\n');
};
const why = (id: string) => {
  const w = WHY_DEMOS.find((x) => x.id === id);
  if (!w) throw new Error(`missing why-demo ${id}`);
  return [...w.beats.map((b) => b.text), w.equation?.example ?? '', w.equation?.caveat ?? ''].join('\n');
};

function tryBuild(id: MissionId): MissionTimeline | null {
  try {
    return buildMission(id);
  } catch (e) {
    if (e instanceof Error && e.message.includes('unknown mission')) return null;
    throw e;
  }
}
const ev = (m: MissionTimeline, id: string) => {
  const e = m.events.find((x) => x.id === id);
  if (!e) throw new Error(`${m.id}: missing event ${id}`);
  return e.t;
};

describe('mission figures from orbital mechanics (frames.ts constants)', () => {
  it('Moon sphere of influence: about 66,000 km (Laplace radius)', () => {
    const soi = MOON_DISTANCE * (MU_MOON / MU_EARTH) ** 0.4;
    expect(Math.round(soi / 1e6)).toBe(66);
    expect(gloss('sphere-of-influence')).toContain('about 66,000 km');
    expect(check('missions-lunar-order')).toContain('about 66,000 km');
  });

  it('geostationary transfer: about 5 hours from a 200 km periapsis to 35,786 km', () => {
    const a = R_EARTH + (200e3 + 35786e3) / 2;
    const half = Math.PI * Math.sqrt(a ** 3 / MU_EARTH);
    expect(Math.round(half / 3600)).toBe(5);
    expect(check('missions-gto-handoff')).toContain('about 5 hours');
    expect(check('orbit-apo-peri')).toContain('about 200 km');
  });

  it('deorbit: about 100 m/s lowers the far side of a 400 km orbit into the atmosphere', () => {
    const r1 = R_EARTH + 400e3;
    for (const perigee of [40e3, 60e3]) {
      const rp = R_EARTH + perigee;
      const dv = Math.sqrt(MU_EARTH / r1) - Math.sqrt((MU_EARTH * 2 * rp) / (r1 * (r1 + rp)));
      expect(Math.abs(dv - 100)).toBeLessThan(10);
    }
    expect(gloss('deorbit-burn')).toContain('about 100 m/s');
  });

  it('inclination: a launch due east from the pad latitude gives an inclination equal to it; turning it costs least where the orbit is slow', () => {
    expect(gloss('inclination')).toContain('28.5° N gives an inclination of 28.5°');
    const i = (28.5 * Math.PI) / 180;
    const turn = (r: number) => 2 * Math.sqrt(MU_EARTH / r) * Math.sin(i / 2);
    expect(gloss('inclination')).toContain(`about ${fmt(turn(R_EARTH + 200e3) / 1e3, 2)} km/s in the 200 km parking orbit`);
    expect(gloss('inclination')).toContain(`about ${fmt(turn(R_EARTH + 35786e3) / 1e3, 2)} km/s at geostationary height`);
  });

  it('escape speed falls with distance: about 11.0 km/s at 200 km', () => {
    expect(gloss('escape-speed')).toContain(`about ${fmt(Math.sqrt((2 * MU_EARTH) / (R_EARTH + 200e3)) / 1e3, 1)} km/s`);
  });
});

const leo = tryBuild('leo');

describe.skipIf(!leo)('content claims against the LEO mission timeline', () => {
  const m = leo as MissionTimeline;
  const f = (k: string) => {
    const v = m.facts[k];
    if (v === undefined) throw new Error(`LEO fact ${k} is missing`);
    return v;
  };

  it('liftoff thrust-to-weight is about 1.2, so more than four fifths of the thrust holds the vehicle up', () => {
    const tw = f('liftoffTW');
    expect(fmt(tw, 1)).toBe('1.2');
    expect(1 / tw).toBeGreaterThan(0.8);
    expect(gloss('thrust-to-weight')).toContain('about 1.2, so more than four fifths');
    // the why-demo figure (443,100 kg, no legs) and the timeline's release mass agree within 1 %
    const m0 = S1.dry + S1.propellant + S2.dry + S2.propellant + FAIRING.mass + PAYLOADS.leoSat.mass;
    expect(Math.abs(f('liftoffMass') / m0 - 1)).toBeLessThan(0.01);
    expect(why('why-turn')).toContain(`${fmt(m0)} kg`);
  });

  it('launch and staging events come in the order the checks teach', () => {
    const order = ['arms-retract', 'engine-start', 'liftoff', 'tower-clear', 'pitch-start', 'max-q', 'meco', 'stage-sep', 'ses1', 'fairing-sep'];
    const times = order.map((id) => ev(m, id));
    for (let i = 1; i < times.length; i++) expect(times[i], order[i]).toBeGreaterThan(times[i - 1]);
    // "a coast of a few seconds" between cutoff and separation, "a few seconds later" ignition
    expect(ev(m, 'stage-sep') - ev(m, 'meco')).toBeGreaterThan(1);
    expect(ev(m, 'stage-sep') - ev(m, 'meco')).toBeLessThan(8);
    expect(ev(m, 'ses1') - ev(m, 'stage-sep')).toBeGreaterThan(2);
    expect(ev(m, 'ses1') - ev(m, 'stage-sep')).toBeLessThan(12);
  });

  it('the pitch kick is about a degree', () => {
    expect(f('kickDeg')).toBeGreaterThan(0.5);
    expect(f('kickDeg')).toBeLessThan(1.5);
    expect(why('why-turn')).toContain('tilts about a degree');
  });

  it('max-q: about 21.9 kPa at 12 km and about Mach 1.3, after Mach 1, engines at full throttle', () => {
    const ex = EQUATIONS['dynamic-pressure'].example ?? '';
    expect(f('maxQ.altKm')).toBeGreaterThan(11);
    expect(f('maxQ.altKm')).toBeLessThan(13);
    expect(Math.abs(f('maxQ.kPa') / 21.9 - 1)).toBeLessThan(0.15);
    expect(fmt(f('maxQ.mach'), 1)).toBe('1.3');
    expect(ex).toContain('21.9 kPa');
    expect(ex).toContain('about Mach 1.3');
    // "typically at about 10 to 15 km"
    expect(check('launch-maxq')).toContain('about 10 to 15 km');
    // Mach 1 comes shortly before max-q (glossary: Mach number)
    let tMach1 = NaN;
    for (let t = 20; t < f('maxQ.t'); t += 0.5) {
      const s = telemetryAt(m, 'booster', t);
      if (s && s.mach >= 1) {
        tMach1 = t;
        break;
      }
    }
    expect(Number.isFinite(tMach1)).toBe(true);
    expect(f('maxQ.t') - tMach1).toBeLessThan(30);
    expect(gloss('mach-number')).toContain('shortly before max-q');
    // the drag comparison assumes full throttle at max-q (the throttle bucket comes before it)
    expect(chan(m, 's1.outer.throttle', f('maxQ.t'))).toBeGreaterThan(0.99);
    expect(ev(m, 'throttle-up')).toBeLessThan(f('maxQ.t'));
  });

  it('the fairing separates above about 110 km, about a minute into the upper-stage burn, a few minutes into flight', () => {
    const t = ev(m, 'fairing-sep');
    const s = telemetryAt(m, 'upper', t);
    expect(s).not.toBeNull();
    expect(s!.altitude).toBeGreaterThan(110e3);
    expect(t - ev(m, 'ses1')).toBeGreaterThan(40);
    expect(t - ev(m, 'ses1')).toBeLessThan(90);
    expect(t / 60).toBeGreaterThan(2);
    expect(t / 60).toBeLessThan(5);
    expect(check('gnc-staging-order')).toContain('above about 110 km');
    expect(check('anatomy-fairing-purpose')).toContain('a few minutes into flight');
    expect(EQUATIONS['rocket-equation'].example).toContain('about a minute into the burn');
  });

  it('recovery reserve: about 50 t, cutting the booster ideal delta-v to about 3,030 m/s', () => {
    const reserve = f('rtls.reserveKg');
    expect(Math.round(reserve / 1e4) * 10).toBe(50);
    const m0 = S1.dry + LEGS.mass + S1.propellant + S2.dry + S2.propellant + FAIRING.mass + PAYLOADS.leoSat.mass;
    const dv = E1.ispVac * G0 * Math.log(m0 / (m0 - (S1.propellant - reserve)));
    expect(Math.abs(dv - 3030)).toBeLessThan(60);
    expect(EQUATIONS['rocket-equation'].example).toContain('about 50 t of propellant kept for its return');
  });

  it('boostback and entry burns on three engines, landing on the centre engine alone, which cannot hover', () => {
    const label = (id: string) => m.events.find((e) => e.id === id)?.label ?? '';
    expect(label('boostback-start')).toMatch(/three engines/);
    expect(label('entry-start')).toMatch(/three engines/);
    expect(label('landing-start')).toMatch(/centre engine/);
    expect(gloss('boostback')).toContain('three engines');
    expect(check('return-boostback')).toContain('Three engines');
    // one engine at minimum throttle against the heaviest the booster can be at touchdown
    const touchdownMass = S1.dry + LEGS.mass + f('rtls.propLeftKg');
    expect((E1.minThrottle * (E1.thrustSL ?? 0)) / (touchdownMass * G0)).toBeGreaterThan(1);
  });

  it('SECO about 7.3 minutes after liftoff; a short circularization burn at 400 km; 92.4-minute orbit', () => {
    expect(Math.abs(f('seco.t') / 60 - 7.3)).toBeLessThan(0.2);
    expect(gloss('seco')).toContain('about 7.3 minutes after liftoff');
    expect(f('circ.dv')).toBeGreaterThan(0);
    expect(f('circ.dv')).toBeLessThan(150); // "a short one"
    expect(Math.abs(f('orbit.apoKm') - 400)).toBeLessThan(15);
    expect(Math.abs(f('orbit.periKm') - 400)).toBeLessThan(15);
    expect(gloss('circularization')).toContain('the upper stage makes a short one at 400 km');
    expect(EQUATIONS['orbital-speed'].example).toContain(`${fmt(f('orbit.periodMin'), 1)} minutes`);
  });
});

/** A fact of a built mission, failing clearly if the physics module renamed or dropped it. */
function factOf(m: MissionTimeline, k: string): number {
  const v = m.facts[k];
  if (v === undefined) throw new Error(`${m.id}: fact ${k} is missing (the physics module may have renamed it)`);
  return v;
}

const gto = tryBuild('gto');
describe.skipIf(!gto)('content claims against the GTO mission timeline', () => {
  const m = gto as MissionTimeline;
  it('parking orbit about 200 km; transfer orbit about 200 by 35,786 km; about 5 hours to apogee', () => {
    expect(Math.abs(factOf(m, 'parking.periKm') - 200)).toBeLessThan(30);
    expect(Math.abs(factOf(m, 'parking.apoKm') - 200)).toBeLessThan(30);
    expect(Math.abs(factOf(m, 'gto.periKm') - 200)).toBeLessThan(30);
    expect(Math.abs(factOf(m, 'gto.apoKm') - 35786)).toBeLessThan(300);
    expect(Math.round(factOf(m, 'apogee.climbH'))).toBe(5);
    expect(check('orbit-parking-vs-transfer')).toContain('about 200 km');
    // events in the order the check teaches
    const order = ['seco1', 'settling', 'ses2', 'seco2', 'payload-sep', 'apogee', 'apogee-burn-start', 'apogee-burn-end'];
    for (let k = 1; k < order.length; k++) expect(ev(m, order[k])).toBeGreaterThan(ev(m, order[k - 1]));
  });

  it('three apogee burns (87, 58 and 40 min, 3.1 h in all) end in geostationary orbit; about 1,600 kg of propellant', () => {
    expect(factOf(m, 'apogeeBurn.count')).toBe(3);
    const mins = [1, 2, 3].map((k) => Math.round(factOf(m, `apogeeBurn.burn${k}Min`)));
    const burns = check('missions-gto-burns');
    expect(burns).toContain(`${mins[0]}, ${mins[1]} and ${mins[2]} min`);
    expect(burns).toContain(`about ${fmt(factOf(m, 'apogeeBurn.durationH'), 1)} hours of firing`);
    expect(burns).toContain(`${fmt(PAYLOADS.gtoSat.mass)} kg satellite only ${fmt(450 / PAYLOADS.gtoSat.mass, 3)} m/s²`);
    expect(burns).toContain(`about ${fmt(factOf(m, 'apogeeBurn.dvIdeal') / 1e3, 2)} km/s`);
    expect(burns).toContain(`${fmt(factOf(m, 'final.periKm'))} km`);
    expect(check('missions-gto-handoff')).toContain(`about ${fmt(Math.round(factOf(m, 'apogeeBurn.propUsedKg') / 100) * 100)} kg of propellant`);
    expect(check('orbit-gto-order')).toContain('next three apogees');
    expect(gloss('circularization')).toContain('three burns centred on successive apogees');
    expect(gloss('geostationary-orbit')).toContain(`${fmt(factOf(m, 'final.periodH'), 2)} h`);
    expect(Math.abs(factOf(m, 'final.apoKm') - 35786)).toBeLessThan(50);
  });
});

const station = tryBuild('station');
describe.skipIf(!station)('content claims against the station mission timeline', () => {
  const m = station as MissionTimeline;
  it('inserted below the station, catches up over several orbits, approaches from below, tower jettisoned after staging', () => {
    expect(factOf(m, 'insertion.apoKm')).toBeLessThan(factOf(m, 'station.altKm'));
    expect(factOf(m, 'phasing.revs')).toBeGreaterThanOrEqual(2);
    expect(factOf(m, 'approach.belowKm')).toBeGreaterThan(0);
    expect(ev(m, 'les-jettison')).toBeGreaterThan(ev(m, 'stage-sep'));
    expect(check('orbit-phasing')).toContain('over several orbits');
    expect(gloss('launch-abort-system')).toContain('jettisoned after staging');
  });
});

const ret = tryBuild('return');
describe.skipIf(!ret)('content claims against the capsule return timeline', () => {
  const m = ret as MissionTimeline;
  it('deorbit about 100 m/s; entry interface about 120 km; splashdown at about 7.6 m/s', () => {
    expect(Math.abs(factOf(m, 'deorbit.dv') - 100)).toBeLessThan(15);
    const ei = telemetryAt(m, 'capsule', ev(m, 'entry-interface'));
    expect(Math.abs(ei!.altitude / 1e3 - 120)).toBeLessThan(10);
    expect(Math.abs(factOf(m, 'splash.speed') - 7.6)).toBeLessThan(0.3);
    expect(check('return-capsule-order')).toContain('about 7.6 m/s');
    expect(gloss('entry-interface')).toContain('about 120 km');
    const order = ['deorbit-start', 'sm-sep', 'entry-interface', 'peak-heating', 'drogue-deploy', 'main-deploy', 'main-disreef', 'splashdown'];
    for (let k = 1; k < order.length; k++) expect(ev(m, order[k])).toBeGreaterThan(ev(m, order[k - 1]));
  });
});

const sub = tryBuild('suborbital');
describe.skipIf(!sub)('content claims against the suborbital timeline', () => {
  const m = sub as MissionTimeline;
  it('climbs above 100 km and falls back within minutes', () => {
    expect(factOf(m, 'apogee.km')).toBeGreaterThan(100);
    expect(ev(m, 'splashdown') / 60).toBeLessThan(20);
    expect(why('why-sideways')).toContain('falls back within minutes');
  });
});

const lunar = tryBuild('lunar');
describe.skipIf(!lunar)('content claims against the lunar flyby timeline', () => {
  const m = lunar as MissionTimeline;
  it('about three days of coast; the sphere of influence (about 66,000 km) late in it; closest approach about 1,500 km on the trailing side; out of the Earth-Moon system', () => {
    expect(Math.round(factOf(m, 'soiKm') / 1e3)).toBe(66);
    expect(Math.round((ev(m, 'closest-approach') - ev(m, 'seco2')) / 86400)).toBe(3);
    expect(ev(m, 'soi-enter')).toBeGreaterThan(ev(m, 'seco2') + 0.5 * (ev(m, 'closest-approach') - ev(m, 'seco2')));
    expect(ev(m, 'soi-enter')).toBeLessThan(ev(m, 'closest-approach'));
    const alt = factOf(m, 'closestApproach.altKm');
    expect(Math.round(alt / 100) * 100).toBe(1500);
    expect(factOf(m, 'closestApproach.trailingSide')).toBe(1);
    expect(factOf(m, 'closestApproach.farSide')).toBe(0);
    expect(check('missions-flyby')).toContain(`about ${fmt(Math.round(alt / 100) * 100)} km above the Moon’s trailing side`);
    expect(gloss('flyby')).toContain(`about ${fmt(Math.round(alt / 100) * 100)} km above the Moon`);
    expect(check('missions-lunar-order')).toContain('coasts for about three days: late in the coast');
    expect(check('missions-lunar-order')).toContain('leaves the Earth-Moon system');
    // the gravity assist: faster than escape speed at the exit, as the check and the glossary quote
    const vOut = factOf(m, 'soiExit.speed');
    const esc = Math.sqrt((2 * MU_EARTH) / (factOf(m, 'soiExit.distanceKm') * 1e3));
    expect(vOut).toBeGreaterThan(esc);
    expect(factOf(m, 'outbound.ecc')).toBeGreaterThan(1);
    for (const t of [check('missions-gravity-assist'), gloss('gravity-assist'), gloss('escape-speed')]) expect(t).toContain(`about ${fmt(vOut / 1e3, 2)} km/s`);
    expect(check('missions-gravity-assist')).toContain(`the ${fmt(esc / 1e3, 2)} km/s escape speed`);
    expect(gloss('escape-speed')).toContain(`about ${fmt(esc / 1e3, 2)} km/s`);
    expect(gloss('escape-speed')).toContain(`at ${fmt(Math.round(factOf(m, 'soiExit.distanceKm') / 1e4) * 1e4)} km`);
    // the Moon-frame numbers, which parts/derived.test.ts checks against the track
    const ga = check('missions-gravity-assist');
    expect(ga).toContain(`arrives at about ${F.flybyRelAtSoi} and leaves at about ${F.flybyRelAtSoi}`);
    expect(ga).toContain(`by about ${F.flybyTurn}`);
    expect(ga).toContain(`(about ${F.moonSpeed})`);
    expect(gloss('gravity-assist')).toContain(`about ${F.soiArrivalSpeed} relative to Earth on arrival`);
  });
});
