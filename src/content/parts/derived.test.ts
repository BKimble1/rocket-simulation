/**
 * Recomputes the headline numbers quoted in the part lessons and phase cards directly from the
 * dataset (spec.ts, world constants), independently of derived.ts, checks the formatted strings,
 * checks that the text actually quotes them, and checks the mission-profile values the text
 * relies on against the trajectories the timeline actually builds.
 */
import { describe, expect, it } from 'vitest';
import { ABORT_TOWER, CAPSULE, E1, E1V, FAIRING, G0, LEGS, PAYLOADS, S1, S2, SERVICE_MODULE } from '../../vehicle/spec';
import { EARTH_AXIS, MU_EARTH, MU_MOON, OMEGA_EARTH, R_EARTH, R_MOON, SITE, moonVelocity } from '../../world/frames';
import { ENG_SAT } from '../../timeline/physics/vehicle';
import { elements } from '../../timeline/physics/kepler';
import type { MissionId, MissionTimeline } from '../../timeline/types';
import { buildMission, telemetryAt } from '../../timeline/build';
import { D, F, PROFILE, REFERENCE, exitPressureRatio, fmt, perigeeAfterRetroBurn, sig, thrustCoefficient } from './derived';
import { LESSONS } from './index';
import { PHASE_CARDS } from '../phaseCards';
import { OUTLINES } from '../../timeline/missions/outline';

const text = JSON.stringify(LESSONS) + JSON.stringify(PHASE_CARDS);
const quoted = (s: string) => expect(text.includes(s), `text should quote "${s}"`).toBe(true);
const vis = (r: number, a: number) => Math.sqrt(MU_EARTH * (2 / r - 1 / a));

describe('number formatting', () => {
  it('groups thousands, keeps decimals and uses a true minus sign', () => {
    expect(fmt(5320)).toBe('5,320');
    expect(fmt(330000)).toBe('330,000');
    expect(fmt(7.6729, 2)).toBe('7.67');
    expect(fmt(-183.2)).toBe('−183');
    expect(fmt(-0.2)).toBe('0');
    expect(fmt(0.4)).toBe('0');
    expect(sig(92.47, 1)).toBe(90);
    expect(sig(0.2867, 2)).toBe(0.29);
    expect(F.loxBoil).toBe('90.2 K (−183 °C)');
  });
});

describe('engine and stage numbers', () => {
  it('first-stage thrust, flow and burn time', () => {
    const thrustSL = 7 * 744e3;
    expect(S1.engineCount * (E1.thrustSL ?? 0)).toBe(thrustSL);
    expect(F.s1ThrustSL).toBe('5,208 kN');
    const mdot = E1.thrustVac / (E1.ispVac * G0);
    expect(mdot).toBeCloseTo(272.9, 1);
    expect(F.e1Mdot).toBe('273 kg/s');
    expect(F.s1Mdot).toBe(`${fmt(7 * mdot)} kg/s`);
    expect(D.s1FullThrustBurn).toBeCloseTo(S1.propellant / (7 * mdot), 6);
    expect(F.s1FullThrustBurn).toBe('173 s');
    quoted(F.s1ThrustSL);
    quoted(F.s1FullThrustBurn);
  });

  it('sea-level thrust from the pressure formula agrees with the dataset rating', () => {
    const fromFormula = E1.thrustVac - 101325 * Math.PI * (E1.exitDiameter / 2) ** 2;
    expect(fromFormula).toBeGreaterThan(740e3);
    expect(fromFormula).toBeLessThan(750e3);
    expect(Math.abs(fromFormula / (E1.thrustSL ?? 1) - 1)).toBeLessThan(0.001);
    expect(F.e1ThrustSLFromPressure).toBe(`${fmt(fromFormula / 1e3)} kN`);
    expect(F.e1ThrustSLFromPressure).toBe(F.e1ThrustSL);
    quoted(F.e1ThrustSLFromPressure);
  });

  it('the E-1V shares the E-1 core: same throat and flow, more vacuum thrust in proportion to Isp', () => {
    expect(E1V.throatDiameter).toBe(E1.throatDiameter);
    expect(E1V.chamberPressure).toBe(E1.chamberPressure);
    const flowV = E1V.thrustVac / (E1V.ispVac * G0);
    const flow1 = E1.thrustVac / (E1.ispVac * G0);
    expect(Math.abs(flowV / flow1 - 1)).toBeLessThan(0.01);
    expect(E1V.thrustVac).toBeGreaterThan(E1.thrustVac);
    // the exit diameter follows from the throat and the expansion ratio
    expect(Math.abs((E1V.exitDiameter / E1V.throatDiameter) ** 2 / E1V.expansionRatio - 1)).toBeLessThan(0.005);
    expect(text).not.toMatch(/smaller throat|less thrust than the E-1/);
  });

  it('propellant split and tank volumes follow the dataset', () => {
    expect(S1.lox).toBeCloseTo((330000 * 2.3) / 3.3, 6);
    expect(F.s1Lox).toBe('230,000 kg');
    expect(F.s1Rp1).toBe('100,000 kg');
    expect(D.s1LoxVolume).toBeCloseTo((S1.lox / 1141) * 1.03, 6);
    expect(F.s1LoxVolume).toBe('208 m³');
    expect(F.s2Lox).toBe('52,300 kg');
    quoted(F.s1LoxVolume);
  });

  it('liftoff mass, thrust-to-weight and hold-down load (the LEO booster carries its legs, the station booster does not)', () => {
    const m = S1.dry + LEGS.mass + S1.propellant + S2.dry + S2.propellant + PAYLOADS.leoSat.mass + FAIRING.mass;
    expect(m).toBe(445200);
    expect(D.liftoffMass.leo).toBe(m);
    expect(F.liftoffMassLeo).toBe('445 t');
    const tw = (7 * 744e3) / (m * G0);
    expect(tw).toBeCloseTo(1.1929, 3);
    expect(F.liftoffTWLeo).toBe('1.19');
    expect(D.holdDownNet).toBeCloseTo(7 * 744e3 - m * G0, 3);
    expect(F.holdDownNet).toBe('840 kN');
    expect(F.liftoffAccel).toBe('1.9 m/s²');
    // expendable missions (the station mission too, since the crew stack needs the whole booster): no legs
    expect(D.liftoffMass.gto).toBe(S1.dry + S1.propellant + S2.dry + S2.propellant + PAYLOADS.gtoSat.mass + FAIRING.mass);
    const station = S1.dry + S1.propellant + S2.dry + S2.propellant + PAYLOADS.capsule.mass + ABORT_TOWER.mass;
    expect(D.liftoffMass.station).toBe(station);
    expect(F.liftoffMassStation).toBe('453 t');
    expect(F.stack.station.tw).toBe(fmt((7 * 744e3) / (station * G0), 2));
    quoted(F.holdDownNet);
    quoted(F.liftoffMassLeo);
  });

  it('ideal velocity changes and the value of the vacuum nozzle', () => {
    const m0 = 445200;
    const dv1 = E1.ispVac * G0 * Math.log(m0 / (m0 - S1.propellant));
    expect(D.leoS1).toBeCloseTo(dv1, 6);
    expect(dv1).toBeGreaterThan(4100);
    expect(dv1).toBeLessThan(4200);
    const s2 = (isp: number) => isp * G0 * Math.log((S2.dry + S2.propellant + PAYLOADS.leoSat.mass) / (S2.dry + PAYLOADS.leoSat.mass));
    expect(D.leoS2).toBeCloseTo(s2(E1V.ispVac), 6);
    expect(F.leoS2).toBe('6.95 km/s');
    expect(D.leoS2WithE1Loss).toBeCloseTo(s2(E1V.ispVac) - s2(E1.ispVac), 6);
    expect(F.leoS2WithE1Loss).toBe('610 m/s');
    const empty = S1.dry + LEGS.mass;
    const carry = E1V.ispVac * G0 * Math.log((S2.dry + S2.propellant + PAYLOADS.leoSat.mass + empty) / (S2.dry + PAYLOADS.leoSat.mass + empty));
    expect(D.leoS2CarryingBoosterLoss).toBeCloseTo(s2(E1V.ispVac) - carry, 6);
    expect(F.leoS2CarryingBoosterLoss).toBe('3.3 km/s');
    quoted(F.leoS2WithE1Loss);
    quoted(F.leoS2CarryingBoosterLoss);
  });

  it('payload trade factors: booster mass costs far less payload than upper-stage mass', () => {
    expect(D.tradeS1).toBeGreaterThan(4);
    expect(D.tradeS1).toBeLessThan(10);
    expect(D.tradeS2).toBeCloseTo(100, 0);
  });

  it('ideal nozzle estimates are physically sensible', () => {
    // Sea-level E-1: overexpanded, but above the rough separation limit (about 0.4 of ambient).
    expect(D.e1ExitPressure).toBeGreaterThan(0.4 * 101325);
    expect(D.e1ExitPressure).toBeLessThan(101325);
    // Vacuum E-1V: far below sea-level pressure, so it could not run at sea level.
    expect(D.e1vExitPressure).toBeLessThan(10e3);
    expect(F.e1vSeaLevelRatio).toBe('20');
    expect(exitPressureRatio(1.0001)).toBeGreaterThan(0.5);
    // Thrust coefficient: vacuum > sea level; a diverging section adds thrust.
    expect(thrustCoefficient(18, 0)).toBeGreaterThan(thrustCoefficient(18, 101325 / 8.5e6));
    expect(thrustCoefficient(18, 0)).toBeGreaterThan(thrustCoefficient(1, 0));
    expect(thrustCoefficient(18, 0)).toBeGreaterThan(1.7);
    expect(thrustCoefficient(18, 0)).toBeLessThan(1.95);
  });

  it('turbopump power estimate from flow, pressure rise and efficiency', () => {
    const lox = (272.9 * 2.3) / 3.3;
    const fuel = 272.9 / 3.3;
    const p = ((lox / 1141) * 12e6 + (fuel / 810) * 14e6) / 0.7;
    expect(D.pumpPower).toBeCloseTo(p, -4);
    expect(F.pumpPower).toBe('5 MW');
    expect(F.e1LoxVolumeFlow).toBe('0.17 m³/s');
    expect(F.loxPumpHydraulic).toBe('2.0 MW');
  });

  it('formats the axial stations as authored and quotes them in the text', () => {
    expect(F.st.gridFins).toBe('37.15 m');
    expect(F.st.fairingTip).toBe('67.0 m');
    expect(F.st.interstageTop).toBe('44.4 m');
    expect(F.st.s1LoxFwdApex).toBe('37.5 m'); // 36.18 + R/sqrt(2), computed
    expect(F.st.s2CommonBulkheadApex).toBe('48.6 m');
    quoted(F.st.gridFins);
    quoted(F.st.s1Gimbal);
    quoted(F.st.s2CommonBulkheadApex);
  });

  it('sandwich stiffness ratio from the fairing geometry', () => {
    const d = FAIRING.core + FAIRING.faceSheet;
    const ratio = (FAIRING.faceSheet * d * d) / 2 / ((2 * FAIRING.faceSheet) ** 3 / 12);
    expect(D.sandwichStiffnessRatio).toBeCloseTo(ratio, 6);
    expect(F.sandwichStiffnessRatio).toBe('360');
  });
});

describe('orbital numbers (two-body, spherical Earth)', () => {
  it('circular speed and period at 400 km', () => {
    const r = R_EARTH + 400e3;
    const v = Math.sqrt(MU_EARTH / r);
    expect(v).toBeCloseTo(7672.6, 0);
    expect(F.leoSpeed).toBe('7.67 km/s');
    expect(F.leoPeriod).toBe(`${fmt((2 * Math.PI * Math.sqrt(r ** 3 / MU_EARTH)) / 60, 1)} min`);
    quoted(F.leoSpeed);
  });

  it('LEO insertion orbit (200 x 400 km) and the circularization at its high point', () => {
    const rp = R_EARTH + 200e3;
    const ra = R_EARTH + 400e3;
    const a = (rp + ra) / 2;
    expect(D.insPerigeeSpeed).toBeCloseTo(vis(rp, a), 6);
    expect(F.insPerigeeSpeed).toBe('7.85 km/s');
    expect(D.leoCircDv).toBeCloseTo(Math.sqrt(MU_EARTH / ra) - vis(ra, a), 6);
    expect(F.leoCircDv).toBe('58 m/s');
    expect(F.insCoast).toBe('45 min');
    quoted(F.leoInsertion);
    quoted(F.leoCircDv);
    quoted(F.insCoast);
  });

  it('transfer orbit injection and circularization', () => {
    const rp = R_EARTH + 200e3;
    const ra = R_EARTH + 35786e3;
    const a = (rp + ra) / 2;
    const vp = vis(rp, a);
    const va = vis(ra, a);
    const vc = Math.sqrt(MU_EARTH / ra);
    expect(D.gtoInjectionDv).toBeCloseTo(vp - Math.sqrt(MU_EARTH / rp), 6);
    expect(F.gtoInjectionDv).toBe('2.46 km/s');
    expect(D.circularizeDv).toBeCloseTo(vc - va, 6);
    const i = (28.5 * Math.PI) / 180;
    expect(D.circularizePlaneDv).toBeCloseTo(Math.sqrt(va * va + vc * vc - 2 * va * vc * Math.cos(i)), 6);
    expect(F.circularizePlaneDv).toBe('1.84 km/s');
    expect(F.gtoHalfPeriod).toBe('5.3 h');
    quoted(F.gtoInjectionDv);
    quoted(F.circularizePlaneDv);
  });

  it('apogee campaign: plane change priced alone, engine acceleration, ideal propellant and firing time', () => {
    const ra = R_EARTH + 35786e3;
    const a = (2 * R_EARTH + 200e3 + 35786e3) / 2;
    const va = vis(ra, a);
    const vc = Math.sqrt(MU_EARTH / ra);
    const i = (28.5 * Math.PI) / 180;
    const combined = Math.sqrt(va * va + vc * vc - 2 * va * vc * Math.cos(i));
    expect(D.geoPlaneOnlyDv).toBeCloseTo(2 * vc * Math.sin(i / 2), 6);
    expect(D.parkingPlaneDv).toBeCloseTo(2 * Math.sqrt(MU_EARTH / (R_EARTH + 200e3)) * Math.sin(i / 2), 6);
    // turning the orbit where the satellite is slow, together with the circularizing push, is far cheaper than either alone
    expect(combined).toBeLessThan(vc - va + D.geoPlaneOnlyDv - 1000);
    const m0 = PAYLOADS.gtoSat.mass;
    const ve = 320 * G0;
    expect(D.apogeeAccel).toBeCloseTo(450 / m0, 9);
    const prop = m0 * (1 - Math.exp(-combined / ve));
    expect(D.apogeePropIdeal).toBeCloseTo(prop, 6);
    expect(D.apogeeBurnHoursIdeal).toBeCloseTo(prop / (450 / ve) / 3600, 6);
    expect(F.apogeeAccel).toBe('0.125 m/s²');
    expect(F.apogeeAccelG).toBe('about 1/78 of g');
    expect(F.geoPlaneOnlyDv).toBe('1.51 km/s');
    expect(F.parkingPlaneDv).toBe('3.83 km/s');
    expect(F.circPlusPlaneSeparate).toBe('2.99 km/s');
    expect(F.apogeeBurnHoursIdeal).toBe('3.1 hours');
    expect(F.gtoBurnMins).toBe('87, 58 and 40 min');
    for (const s of [F.geoPlaneOnlyDv, F.parkingPlaneDv, F.circPlusPlaneSeparate, F.apogeeAccel, F.apogeeBurnHoursIdeal, F.gtoBurnMins, F.gtoPeri1, F.gtoPeri2, F.gtoIncFinal]) quoted(s);
  });

  it('lunar flyby seen from the Moon and from the Earth', () => {
    const rp = R_MOON + PROFILE.flybyAlt;
    const vinf = Math.sqrt(PROFILE.flybySpeedRelMoon ** 2 - (2 * MU_MOON) / rp);
    expect(D.flybyVinfMoon).toBeCloseTo(vinf, 6);
    expect(D.flybyRelAtSoi).toBeCloseTo(Math.sqrt(vinf ** 2 + (2 * MU_MOON) / D.soiRadius), 6);
    const esc = Math.sqrt((2 * MU_EARTH) / PROFILE.soiExitDist);
    expect(D.soiExitEscape).toBeCloseTo(esc, 6);
    expect(D.soiExitVinf).toBeCloseTo(Math.sqrt(PROFILE.soiExitSpeed ** 2 - esc ** 2), 6);
    expect(PROFILE.soiExitSpeed).toBeGreaterThan(esc);
    expect(F.flybyRelAtSoi).toBe('1.2 km/s');
    expect(F.soiExitEscape).toBe('1.33 km/s');
    expect(F.soiExitVinf).toBe('1.1 km/s');
    expect(F.tliMinCoastDays).toBe('5 days');
    for (const s of [F.flybyAlt, F.flybyAngle, F.flybyRelAtSoi, F.flybyTurn, F.soiExitSpeed, F.soiExitEscape, F.soiExitVinf, F.soiArrivalSpeed, F.tliBurn, F.tliMinCoastDays]) quoted(s);
  });

  it('deorbit burn lowers the far side of the orbit into the atmosphere', () => {
    expect(D.deorbitPerigee).toBeGreaterThan(30e3);
    expect(D.deorbitPerigee).toBeLessThan(90e3);
    expect(F.deorbitPerigee).toBe('58 km');
    // the capsule and service module at undocking, with the propellant the station mission arrives with
    const dry = CAPSULE.mass + PROFILE.smDry;
    const m = dry + PROFILE.smPropAtUndock;
    expect(D.smDeorbitProp).toBeCloseTo(m * (1 - Math.exp(-100 / (SERVICE_MODULE.ispVac * G0))), 6);
    const left = PROFILE.smPropAtUndock - D.smDeorbitProp;
    expect(D.smMarginDv).toBeCloseTo(SERVICE_MODULE.ispVac * G0 * Math.log((dry + left) / dry), 6);
    expect(F.smPropAfterDeorbit).toBe('730 kg');
    expect(F.smMarginDv).toBe('200 m/s');
    quoted(F.smMarginDv);
    quoted(F.deorbitPerigee);
  });

  it('phasing from a lower orbit gains on the station', () => {
    expect(D.phasingPeriodMin).toBeLessThan(D.leoPeriodMin);
    expect(D.phasingGainDeg).toBeGreaterThan(10);
    expect(D.phasingGainDeg).toBeLessThan(20);
    quoted(F.phasingGain);
  });

  it('trans-lunar injection stays just below escape speed; sphere of influence near 66,000 km', () => {
    expect(D.tliSpeed).toBeLessThan(D.escapeSpeed);
    expect(D.escapeSpeed - D.tliSpeed).toBeLessThan(200);
    expect(F.soiRadius).toBe('66,000 km');
  });

  it('eclipse and Earth-rotation figures', () => {
    const r = R_EARTH + 400e3;
    const T = 2 * Math.PI * Math.sqrt(r ** 3 / MU_EARTH);
    expect(D.eclipseMin).toBeCloseTo(((2 * Math.asin(R_EARTH / r)) / (2 * Math.PI)) * (T / 60), 6);
    expect(F.eclipseMin).toBe('36 min');
    expect(D.earthRotationSpeed).toBeCloseTo(OMEGA_EARTH * R_EARTH * Math.cos((SITE.lat * Math.PI) / 180), 6);
  });
});

describe('capsule and recovery numbers', () => {
  it('entry speed at the entry interface, inertial and relative to the rotating air, and the energy to remove', () => {
    const r0 = R_EARTH + 400e3;
    const v0 = Math.sqrt(MU_EARTH / r0) - 100;
    const a = 1 / (2 / r0 - (v0 * v0) / MU_EARTH);
    const re = R_EARTH + 120e3;
    const ve = vis(re, a);
    expect(D.entryInertial).toBeCloseTo(ve, 6);
    expect(F.entryInertial).toBe('7.9 km/s');
    const air = ve - OMEGA_EARTH * re * Math.cos((28.5 * Math.PI) / 180);
    expect(D.entryAir).toBeCloseTo(air, 6);
    expect(F.entryAir).toBe('7.5 km/s');
    expect(D.capsuleKE).toBeCloseTo(0.5 * CAPSULE.mass * air ** 2, 0);
    expect(F.capsuleKE).toBe('230 GJ');
    quoted(F.entryAir);
    quoted(F.capsuleKE);
  });

  it('parachute descent, drogue speed and abort-tower thrust-to-weight', () => {
    const area = Math.PI * (CAPSULE.mainDiameter / 2) ** 2;
    const v3 = Math.sqrt((2 * CAPSULE.mass * G0) / (1.225 * 0.8 * 3 * area));
    expect(D.descentThree).toBeCloseTo(v3, 6);
    expect(D.descentThree).toBeLessThan(10); // splashdown requirement in the physics brief
    expect(D.descentTwo / D.descentThree).toBeCloseTo(Math.sqrt(3 / 2), 6);
    const vd = Math.sqrt((2 * CAPSULE.mass * G0) / (REFERENCE.density7km * 1.3 * Math.PI * (CAPSULE.baseDiameter / 2) ** 2));
    expect(D.drogueSpeed).toBeCloseTo(vd, 6);
    expect(D.drogueMach).toBeLessThan(1); // drogues open subsonic
    expect(D.lesTW).toBeCloseTo(ABORT_TOWER.motorThrust / ((CAPSULE.mass + ABORT_TOWER.mass) * G0), 6);
    quoted(F.descentThree);
    quoted(F.drogueSpeed);
  });

  it('single-engine landing burn cannot hover (thrust-to-weight above 1 even at minimum throttle, legs included)', () => {
    const empty = (S1.dry + LEGS.mass) * G0;
    expect(D.landingTWDry).toBeCloseTo((E1.minThrottle * (E1.thrustSL ?? 0)) / empty, 6);
    expect(D.landingTWDry).toBeGreaterThan(1);
    expect(F.boosterDryWeight).toBe('270 kN');
    expect(D.singleEngineHoverThrottle).toBeCloseTo(empty / (7 * 744e3), 6);
    quoted(F.landingThrustMin);
    quoted(F.singleEngineHoverThrottle);
  });

  it('suborbital fall: speed by the drag altitude and the energy compared with an orbital entry', () => {
    const v = Math.sqrt(2 * MU_EARTH * (1 / (R_EARTH + 50e3) - 1 / (R_EARTH + 117e3)));
    expect(D.suborbitalFallSpeed).toBeCloseTo(v, 6);
    expect(F.suborbitalFallSpeed).toBe('1.1 km/s');
    expect(D.suborbitalEnergyRatio).toBeCloseTo(D.entryAir ** 2 / v ** 2, 6);
    quoted(F.suborbitalEnergyRatio);
    expect(D.suborbitalFreeFall / 60).toBeGreaterThan(2.5);
    expect(D.suborbitalFreeFall / 60).toBeLessThan(3.5);
  });
});

// ---------- the mission-profile values against the trajectories the timeline builds ----------

/** Builds a mission if its builder exists yet (the timeline module is built mission by mission). */
function built(id: MissionId): MissionTimeline | null {
  try {
    return buildMission(id);
  } catch (e) {
    if (String(e).includes('unknown mission')) return null;
    throw e;
  }
}
const near = (actual: number | undefined, expected: number, tol: number, what: string) => {
  expect(actual, `${what}: missing`).toBeDefined();
  expect(Math.abs((actual as number) - expected), `${what}: ${actual} vs ${expected}`).toBeLessThanOrEqual(tol);
};

describe('profile values match the built timelines', () => {
  it('LEO: insertion orbit, circularization, liftoff, max-q after Mach 1, throttle bucket, spring speed', () => {
    const tl = built('leo');
    if (!tl) return;
    const f = tl.facts;
    near(f['insertion.periKm'], PROFILE.leoInsertion.rp / 1e3, 10, 'insertion perigee');
    near(f['insertion.apoKm'], PROFILE.leoInsertion.ra / 1e3, 10, 'insertion apogee');
    near(f['orbit.periKm'], PROFILE.leoAlt / 1e3, 15, 'final perigee');
    near(f['circ.dv'], D.leoCircDv, 0.1 * D.leoCircDv, 'circularization velocity change');
    near(f['liftoffTW'], D.liftoffTW.leo, 0.02, 'liftoff thrust-to-weight');
    // the timeline burns a few tonnes on the pad before release
    near(f['liftoffMass'], D.liftoffMass.leo, 0.02 * D.liftoffMass.leo, 'liftoff mass');
    expect(f['maxQ.mach']).toBeGreaterThan(1);
    expect(f['maxQ.mach']).toBeLessThan(2);
    const label = (id: string) => tl.events.find((e) => e.id === id)?.label ?? '';
    expect(label('throttle-down')).toContain(F.throttleBucket);
    expect(label('payload-sep')).toContain(F.payloadSepSpeed);
    near(f['rtls.reserveKg'], PROFILE.rtlsReserve, 0.05 * PROFILE.rtlsReserve, 'return reserve at cutoff');
    near(f['seco.t'], PROFILE.leoSeco, 10, 'upper-stage cutoff time');
    // the fairing goes after upper-stage ignition, as the cards say
    expect(tl.events.find((e) => e.id === 'fairing-sep')!.t).toBeGreaterThan(tl.events.find((e) => e.id === 'ses1')!.t);
  });

  it('GTO: parking orbit and transfer injection', () => {
    const tl = built('gto');
    if (!tl) return;
    const f = tl.facts;
    near(f['parking.periKm'], PROFILE.parkingAlt / 1e3, 10, 'parking perigee');
    near(f['parking.apoKm'], PROFILE.parkingAlt / 1e3, 10, 'parking apogee');
    near(f['injection.dvIdeal'], D.gtoInjectionDv, 0.03 * D.gtoInjectionDv, 'injection velocity change');
    near(f['gto.apoKm'], 35786, 300, 'transfer apogee');
    // the apogee campaign as the cards tell it: checkout coast through the first apogee, then three
    // burns centred on the next apogees, raising the perigee and removing the tilt in steps
    expect(f['apogeeBurn.count']).toBe(PROFILE.gtoBurnMin.length);
    PROFILE.gtoBurnMin.forEach((m, k) => near(f[`apogeeBurn.burn${k + 1}Min`], m, 1, `burn ${k + 1} duration`));
    near(f['apogeeBurn.durationH'], D.gtoBurnHours, 0.05, 'total engine time');
    near(f['apogeeBurn.durationH'], D.apogeeBurnHoursIdeal, 0.1, 'engine time the ideal change needs');
    near(f['apogeeBurn.spanH'], PROFILE.gtoCampaignHours, 1, 'first ignition to last cutoff');
    near(f['apogeeBurn.dv'], PROFILE.gtoBurnDv, 10, 'velocity change the burns deliver');
    near(f['apogeeBurn.dvIdeal'], D.circularizePlaneDv, 5, 'ideal change with the plane change');
    expect(f['apogeeBurn.dv'] / D.circularizePlaneDv, 'within 1 % of the ideal').toBeLessThan(1.01);
    near(f['apogeeBurn.propUsedKg'], PROFILE.gtoBurnProp, 10, 'propellant the burns use');
    near(f['apogeeBurn.propUsedKg'] + f['apogeeBurn.propLeftKg'], PROFILE.apogeeEngine.propellant, 1, 'satellite propellant');
    near(D.apogeePropIdeal, PROFILE.gtoBurnProp, 30, 'ideal propellant against the flown');
    expect(ENG_SAT.thrustVac).toBe(PROFILE.apogeeEngine.thrust);
    expect(ENG_SAT.ispVac).toBe(PROFILE.apogeeEngine.isp);
    near(f['final.periKm'], 35786, 50, 'final orbit perigee');
    near(f['final.apoKm'], 35786, 50, 'final orbit apogee');
    near(f['final.incDeg'], PROFILE.gtoAfterBurn[2].inc, 0.01, 'final inclination');
    near(f['final.periodH'], 23.934, 0.01, 'one sidereal day');
    const t = (id: string) => tl.events.find((e) => e.id === id)!.t;
    expect(t('apogee-burn-start') - t('apogee'), 'a whole checkout orbit before the first burn').toBeGreaterThan(0.8 * f['gto.periodH'] * 3600);
    // the orbit after each burn, from the satellite track between burns
    const thr = tl.channels['sat.apogee.throttle']!;
    const ends: number[] = [];
    for (let k = 1; k < thr.t.length; k++) if (thr.v[k - 1] > 0.5 && thr.v[k] <= 0.5) ends.push(thr.t[k]);
    expect(ends.length).toBe(PROFILE.gtoBurnMin.length);
    const sat = tl.bodies.satellite!;
    ends.forEach((te, k) => {
      let n = 0;
      while (n < sat.t.length - 1 && sat.t[n] < te + 600) n++;
      const r = { x: sat.pos[3 * n], y: sat.pos[3 * n + 1], z: sat.pos[3 * n + 2] };
      const v = { x: sat.vel[3 * n], y: sat.vel[3 * n + 1], z: sat.vel[3 * n + 2] };
      const e = elements(r, v, MU_EARTH, { x: EARTH_AXIS.x, y: EARTH_AXIS.y, z: EARTH_AXIS.z });
      near((e.rp - R_EARTH) / 1e3, PROFILE.gtoAfterBurn[k].peri / 1e3, 100, `perigee after burn ${k + 1}`);
      near((e.i * 180) / Math.PI, PROFILE.gtoAfterBurn[k].inc, 0.2, `inclination after burn ${k + 1}`);
    });
  });

  it('lunar: parking orbit, trans-lunar injection, sphere of influence, trailing-side flyby and the escape', () => {
    const tl = built('lunar');
    if (!tl) return;
    const f = tl.facts;
    near(f['parking.periKm'], PROFILE.parkingAlt / 1e3, 10, 'parking perigee');
    near(f['tli.speed'], D.tliSpeed, 0.01 * D.tliSpeed, 'speed after trans-lunar injection');
    near(f['tli.speed'], PROFILE.tliSpeedFlown, 15, 'speed after trans-lunar injection as flown');
    near(f['tli.burnS'], PROFILE.tliBurnS, 1.5, 'injection burn duration');
    near(f['soiKm'], D.soiRadius / 1e3, 0.02 * (D.soiRadius / 1e3), 'sphere of influence');
    near(f['cruise.days'], 3, 0.5, 'coast to the Moon (the cards say about three days)');
    // a little above the minimum-energy speed, so the trip takes about three days, not about five
    expect(f['tli.speed']).toBeGreaterThan(D.tliSpeed);
    near(D.tliMinCoastDays, 5, 0.5, 'coast on the minimum-energy path');
    // closest approach: behind the Moon in its motion, near the limb seen from the Earth, not the far side
    near(f['closestApproach.altKm'], PROFILE.flybyAlt / 1e3, 50, 'closest approach altitude');
    expect(f['closestApproach.trailingSide']).toBe(1);
    expect(f['closestApproach.farSide']).toBe(0);
    near(f['closestApproach.angleFromEarthDeg'], PROFILE.flybyAngleFromEarthDeg, 2, 'angle from the Earth direction');
    near(f['closestApproach.speedRelMoon'], PROFILE.flybySpeedRelMoon, 10, 'speed relative to the Moon');
    // the gravity assist seen from the Moon: the same speed in and out, only the direction turned
    const sat = tl.bodies.satellite!;
    const at = (id: string) => {
      const te = tl.events.find((e) => e.id === id)!.t;
      let n = 0;
      while (n < sat.t.length - 1 && sat.t[n] < te) n++;
      const v = { x: sat.vel[3 * n], y: sat.vel[3 * n + 1], z: sat.vel[3 * n + 2] };
      const m = moonVelocity(sat.t[n], tl.moonPhase0);
      const rel = { x: v.x - m.x, y: v.y - m.y, z: v.z - m.z };
      const len = (a: { x: number; y: number; z: number }) => Math.hypot(a.x, a.y, a.z);
      const dot = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => a.x * b.x + a.y * b.y + a.z * b.z;
      return { speed: len(v), rel, relSpeed: len(rel), relToMoonMotionDeg: (Math.acos(dot(rel, m) / (len(rel) * len(m))) * 180) / Math.PI, dot, len };
    };
    const inb = at('soi-enter');
    const out = at('soi-exit');
    near(inb.relSpeed, D.flybyRelAtSoi, 0.03 * D.flybyRelAtSoi, 'speed relative to the Moon on entry');
    near(out.relSpeed, inb.relSpeed, 0.02 * inb.relSpeed, 'speed relative to the Moon on exit equals entry');
    const turn = (Math.acos(inb.dot(inb.rel, out.rel) / (inb.relSpeed * out.relSpeed)) * 180) / Math.PI;
    near(turn, PROFILE.flybyTurnDeg, 2, 'turn of the relative velocity');
    expect(inb.relToMoonMotionDeg, 'arrives partly against the Moon\'s motion').toBeGreaterThan(90);
    expect(out.relToMoonMotionDeg, 'leaves partly along the Moon\'s motion').toBeLessThan(90);
    // and from the Earth: faster out than in, above escape speed, on a hyperbola
    near(inb.speed, PROFILE.soiArrivalSpeed, 20, 'speed relative to the Earth on entering the sphere of influence');
    near(f['soiExit.speed'], PROFILE.soiExitSpeed, 10, 'speed relative to the Earth at the exit');
    near(f['soiExit.distanceKm'], PROFILE.soiExitDist / 1e3, 0.01 * (PROFILE.soiExitDist / 1e3), 'distance at the exit');
    near(f['soiExit.escapeSpeed'], D.soiExitEscape, 2, 'escape speed at the exit');
    expect(f['soiExit.speed']).toBeGreaterThan(f['soiExit.escapeSpeed']);
    expect(f['outbound.energy']).toBeGreaterThan(0);
    expect(f['outbound.ecc']).toBeGreaterThan(1);
    near(f['outbound.vInf'], D.soiExitVinf, 0.03 * D.soiExitVinf, 'speed left far from the Earth');
    expect(f['outbound.earthReturnDays']).toBe(0);
  });

  it('station: insertion orbit, phasing laps, hold points, closing speed, tower jettison after ignition', () => {
    const tl = built('station');
    if (!tl) return;
    const f = tl.facts;
    near(f['insertion.periKm'], PROFILE.stationInsertion.rp / 1e3, 10, 'insertion perigee');
    near(f['insertion.apoKm'], PROFILE.stationInsertion.ra / 1e3, 10, 'insertion apogee');
    expect(f['phasing.revs']).toBe(PROFILE.phasingRevs);
    expect(f['docking.closingSpeed']).toBeLessThanOrEqual(PROFILE.closingSpeed);
    const labels = tl.events.filter((e) => e.id.startsWith('hold-point')).map((e) => e.label).join(' | ');
    for (const h of PROFILE.holdPoints) expect(labels, `hold point ${h} m`).toContain(`${h} m`);
    const t = (id: string) => tl.events.find((e) => e.id === id)!.t;
    expect(t('les-jettison')).toBeGreaterThan(t('ses1'));
    // the return mission starts with what the station mission arrives with
    near(f['sm.propLeftKg'], PROFILE.smPropAtUndock, 1, 'service-module propellant at docking');
  });

  it('station: the dataset crew stack is flown on an expended booster, liftoff mass and thrust-to-weight as quoted', () => {
    const tl = built('station');
    if (!tl) return;
    const f = tl.facts;
    expect(f['crew.dataset']).toBe(1);
    near(f['crew.capsuleKg'] + f['crew.serviceModuleKg'], PAYLOADS.capsule.mass, 1, 'capsule and service module');
    near(f['crew.abortTowerKg'], ABORT_TOWER.mass, 1, 'abort tower');
    // the timeline burns a few tonnes on the pad before release
    near(f['liftoffMass'], D.liftoffMass.station, 0.02 * D.liftoffMass.station, 'liftoff mass');
    near(f['liftoffTW'], D.liftoffTW.station, 0.02, 'liftoff thrust-to-weight');
    // no return: the booster burns to its depletion margin and reports no landing
    expect(f['meco.s1PropLeft']).toBeLessThan(0.02 * S1.propellant);
    expect(f['rtls.touchdown.t']).toBeUndefined();
    expect(f['boosterImpact.downrangeKm']).toBeGreaterThan(300);
    expect(OUTLINES.station.recovery).toBe(false);
  });

  it('return: deorbit burn and far-side altitude, entry interface, parachute altitudes, splashdown speed', () => {
    const tl = built('return');
    if (!tl) return;
    const f = tl.facts;
    near(f['deorbit.dv'], PROFILE.deorbitDv, 0.1 * PROFILE.deorbitDv, 'deorbit velocity change');
    // the two-body estimate the cards use, applied to the burn actually flown
    near(f['deorbit.perigeeKm'], perigeeAfterRetroBurn(f['deorbit.dv']) / 1e3, 8, 'far-side altitude after the burn');
    const label = (id: string) => tl.events.find((e) => e.id === id)?.label ?? '';
    expect(label('entry-interface')).toContain(F.entryInterface);
    expect(label('drogue-deploy')).toContain(F.drogueAlt);
    expect(label('main-deploy')).toContain(F.mainAlt);
    near(f['splash.speed'], D.descentThree, 1.5, 'splashdown speed against the three-main estimate');
    // the deorbit estimate is made for the stack at undocking, with the station mission's leftover propellant
    near(f['undock.smPropKg'], PROFILE.smPropAtUndock, 1, 'service-module propellant at undocking');
    near(f['serviceModuleKg'], PROFILE.smDry + PROFILE.smPropAtUndock, 1, 'service module at undocking');
    near(f['deorbit.burnS'], D.smDeorbitBurn, 3, 'deorbit burn duration');
    near(f['smSep.smPropLeftKg'], D.smPropAfterDeorbit, 25, 'propellant left at service-module separation');
    near(f['smSep.dvLeft'], D.smMarginDv, 8, 'deorbit margin');
  });

  it('suborbital: planned high point', () => {
    const tl = built('suborbital');
    if (!tl) return;
    near(tl.facts['apogee.km'], PROFILE.suborbitalApogee / 1e3, 2, 'capsule apogee');
    near(tl.facts['karman.freeFallS'], D.suborbitalAboveKarman, 5, 'time above 100 km');
    const sep = telemetryAt(tl, 'capsule', tl.facts['capsuleSep.t']);
    near(sep?.altitude, PROFILE.suborbitalReleaseAlt, 5e3, 'capsule release altitude');
    near(tl.facts['capsuleSep.t'] - tl.facts['meco.t'], 36, 6, 'release about half a minute after cutoff');
  });
});
