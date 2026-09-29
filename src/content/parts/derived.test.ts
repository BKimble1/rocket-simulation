/**
 * Recomputes the headline numbers quoted in the part lessons and phase cards directly from the
 * dataset (spec.ts, world constants), independently of derived.ts, and checks both the formatted
 * strings and that the text actually quotes them.
 */
import { describe, expect, it } from 'vitest';
import { ABORT_TOWER, CAPSULE, E1, E1V, FAIRING, G0, PAYLOADS, S1, S2, SERVICE_MODULE } from '../../vehicle/spec';
import { MU_EARTH, R_EARTH } from '../../world/frames';
import { D, F, exitPressureRatio, fmt, sig, thrustCoefficient } from './derived';
import { LESSONS } from './index';
import { PHASE_CARDS } from '../phaseCards';

const text = JSON.stringify(LESSONS) + JSON.stringify(PHASE_CARDS);
const quoted = (s: string) => expect(text.includes(s), `text should quote "${s}"`).toBe(true);

describe('number formatting', () => {
  it('groups thousands and keeps decimals', () => {
    expect(fmt(5320)).toBe('5,320');
    expect(fmt(330000)).toBe('330,000');
    expect(fmt(7.6729, 2)).toBe('7.67');
    expect(fmt(-183.2)).toBe('-183');
    expect(fmt(0.4)).toBe('0');
    expect(sig(92.47, 1)).toBe(90);
    expect(sig(0.2867, 2)).toBe(0.29);
  });
});

describe('engine and stage numbers', () => {
  it('first-stage thrust, flow and burn time', () => {
    const thrustSL = 7 * 760e3;
    expect(S1.engineCount * (E1.thrustSL ?? 0)).toBe(thrustSL);
    expect(F.s1ThrustSL).toBe('5,320 kN');
    const mdot = E1.thrustVac / (E1.ispVac * G0);
    expect(mdot).toBeCloseTo(272.9, 1);
    expect(F.e1Mdot).toBe('273 kg/s');
    expect(F.s1Mdot).toBe(`${fmt(7 * mdot)} kg/s`);
    expect(D.s1FullThrustBurn).toBeCloseTo(S1.propellant / (7 * mdot), 6);
    expect(F.s1FullThrustBurn).toBe('173 s');
    quoted(F.s1ThrustSL);
    quoted(F.s1FullThrustBurn);
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

  it('liftoff mass, thrust-to-weight and hold-down load (LEO configuration)', () => {
    const m = S1.dry + S1.propellant + S2.dry + S2.propellant + PAYLOADS.leoSat.mass + FAIRING.mass;
    expect(m).toBe(443100);
    expect(F.liftoffMassLeo).toBe('443 t');
    const tw = (7 * 760e3) / (m * G0);
    expect(tw).toBeCloseTo(1.224, 3);
    expect(F.liftoffTWLeo).toBe('1.22');
    expect(D.holdDownNet).toBeCloseTo(7 * 760e3 - m * G0, 3);
    expect(F.holdDownNet).toBe('970 kN');
    expect(F.liftoffAccel).toBe('2.2 m/s²');
    expect(F.stack.station.mass).toBe(`${fmt(sig((S1.dry + S1.propellant + S2.dry + S2.propellant + PAYLOADS.capsule.mass + ABORT_TOWER.mass) / 1e3, 3))} t`);
    quoted(F.holdDownNet);
  });

  it('ideal velocity changes and the value of the vacuum nozzle', () => {
    const m0 = 443100;
    const dv1 = E1.ispVac * G0 * Math.log(m0 / (m0 - S1.propellant));
    expect(D.leoS1).toBeCloseTo(dv1, 6);
    expect(dv1).toBeGreaterThan(4100);
    expect(dv1).toBeLessThan(4250);
    const s2 = (isp: number) => isp * G0 * Math.log((S2.dry + S2.propellant + PAYLOADS.leoSat.mass) / (S2.dry + PAYLOADS.leoSat.mass));
    expect(D.leoS2).toBeCloseTo(s2(E1V.ispVac), 6);
    expect(F.leoS2).toBe('6.95 km/s');
    expect(D.leoS2WithE1Loss).toBeCloseTo(s2(E1V.ispVac) - s2(E1.ispVac), 6);
    expect(F.leoS2WithE1Loss).toBe('610 m/s');
    quoted(F.leoS2WithE1Loss);
  });

  it('payload trade factors: booster mass costs far less payload than upper-stage mass', () => {
    expect(D.tradeS1).toBeGreaterThan(4);
    expect(D.tradeS1).toBeLessThan(10);
    expect(D.tradeS2).toBeCloseTo(100, 0);
  });

  it('ideal nozzle estimates are physically sensible', () => {
    // Sea-level E-1: overexpanded but not grossly (exit pressure between 30 and 101 kPa).
    expect(D.e1ExitPressure).toBeGreaterThan(30e3);
    expect(D.e1ExitPressure).toBeLessThan(101325);
    // Vacuum E-1V: far below sea-level pressure, so it could not run at sea level.
    expect(D.e1vExitPressure).toBeLessThan(10e3);
    expect(exitPressureRatio(1.0001)).toBeGreaterThan(0.5);
    // Thrust coefficient: vacuum > sea level; a diverging section adds thrust.
    expect(thrustCoefficient(18, 0)).toBeGreaterThan(thrustCoefficient(18, 101325 / 8.5e6));
    expect(thrustCoefficient(18, 0)).toBeGreaterThan(thrustCoefficient(1, 0));
    expect(thrustCoefficient(18, 0)).toBeGreaterThan(1.7);
    expect(thrustCoefficient(18, 0)).toBeLessThan(1.95);
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

  it('transfer orbit injection and circularization', () => {
    const rp = R_EARTH + 200e3;
    const ra = R_EARTH + 35786e3;
    const a = (rp + ra) / 2;
    const vp = Math.sqrt(MU_EARTH * (2 / rp - 1 / a));
    const va = Math.sqrt(MU_EARTH * (2 / ra - 1 / a));
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

  it('deorbit burn lowers perigee into the atmosphere', () => {
    expect(D.deorbitPerigee).toBeGreaterThan(30e3);
    expect(D.deorbitPerigee).toBeLessThan(90e3);
    const m = PAYLOADS.capsule.mass;
    expect(D.smDeorbitProp).toBeCloseTo(m * (1 - Math.exp(-100 / (SERVICE_MODULE.ispVac * G0))), 6);
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
});

describe('capsule and recovery numbers', () => {
  it('entry energy, parachute descent and abort-tower thrust-to-weight', () => {
    expect(D.capsuleKE).toBeCloseTo(0.5 * CAPSULE.mass * 7700 ** 2, 0);
    expect(F.capsuleKE).toBe('250 GJ');
    const area = Math.PI * (CAPSULE.mainDiameter / 2) ** 2;
    const v3 = Math.sqrt((2 * CAPSULE.mass * G0) / (1.225 * 0.8 * 3 * area));
    expect(D.descentThree).toBeCloseTo(v3, 6);
    expect(D.descentThree).toBeLessThan(10); // splashdown requirement in the physics brief
    expect(D.descentTwo / D.descentThree).toBeCloseTo(Math.sqrt(3 / 2), 6);
    expect(D.lesTW).toBeCloseTo(ABORT_TOWER.motorThrust / ((CAPSULE.mass + ABORT_TOWER.mass) * G0), 6);
    quoted(F.descentThree);
  });

  it('single-engine landing burn cannot hover (thrust-to-weight above 1 even at minimum throttle)', () => {
    expect(D.landingTWDry).toBeCloseTo((E1.minThrottle * (E1.thrustSL ?? 0)) / (S1.dry * G0), 6);
    expect(D.landingTWDry).toBeGreaterThan(1);
    quoted(F.landingThrustMin);
  });
});
