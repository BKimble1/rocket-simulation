import { describe, expect, it } from 'vitest';
import { E1, E1V, S1, S2, PROPELLANTS, tankVolume, STATIONS, BODY_RADIUS, DOME_HEIGHT, G0 } from './spec';

/** Ideal vacuum thrust coefficient for expansion ratio eps (ratio of specific heats g). */
function cfVac(eps: number, g = 1.2): number {
  const area = (M: number) => (1 / M) * ((2 / (g + 1)) * (1 + ((g - 1) / 2) * M * M)) ** ((g + 1) / (2 * (g - 1)));
  let lo = 1.0001;
  let hi = 20;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (area(mid) < eps) lo = mid;
    else hi = mid;
  }
  const M = (lo + hi) / 2;
  const pr = (1 + ((g - 1) / 2) * M * M) ** (-g / (g - 1));
  return Math.sqrt(((2 * g * g) / (g - 1)) * (2 / (g + 1)) ** ((g + 1) / (g - 1)) * (1 - pr ** ((g - 1) / g))) + pr * eps;
}

describe('engine data are internally consistent', () => {
  for (const e of [E1, E1V]) {
    it(`${e.id}: exit diameter matches throat and expansion ratio`, () => {
      expect(e.exitDiameter / e.throatDiameter).toBeCloseTo(Math.sqrt(e.expansionRatio), 1);
    });
    it(`${e.id}: vacuum thrust = efficiency x ideal Cf x Pc x At (efficiency 0.96 to 0.99)`, () => {
      const At = (Math.PI / 4) * e.throatDiameter ** 2;
      const eff = e.thrustVac / (cfVac(e.expansionRatio) * e.chamberPressure * At);
      expect(eff).toBeGreaterThan(0.96);
      expect(eff).toBeLessThan(0.99);
    });
  }
  it('E-1 sea-level thrust = vacuum thrust minus the ambient pressure on the exit area', () => {
    const Ae = (Math.PI / 4) * E1.exitDiameter ** 2;
    expect(Math.abs(E1.thrustVac - 101325 * Ae - E1.thrustSL!)).toBeLessThan(2000);
    const mdot = E1.thrustVac / (E1.ispVac * G0);
    expect(E1.ispSL!).toBeCloseTo(E1.thrustSL! / (mdot * G0), 0);
  });
  it('the E-1V shares the E-1 core: same throat, chamber pressure and (within 2 %) flow', () => {
    expect(E1V.throatDiameter).toBe(E1.throatDiameter);
    expect(E1V.chamberPressure).toBe(E1.chamberPressure);
    const m1 = E1.thrustVac / (E1.ispVac * G0);
    const m2 = E1V.thrustVac / (E1V.ispVac * G0);
    expect(Math.abs(m1 - m2) / m1).toBeLessThan(0.02);
  });
  it('seven E-1 nozzles fit the 3.7 m base with clearance between neighbours', () => {
    const gap = 1.2 - E1.exitDiameter; // ring radius 1.2 m: neighbour spacing = 1.2 m
    expect(gap).toBeGreaterThan(0.1);
    expect(1.2 + E1.exitDiameter / 2).toBeLessThan(BODY_RADIUS);
  });
});

describe('tanks hold exactly the propellant load (3 % ullage)', () => {
  const A = Math.PI * BODY_RADIUS ** 2;
  const dome = (2 / 3) * Math.PI * BODY_RADIUS ** 2 * DOME_HEIGHT;
  it('first-stage RP-1 and LOX tanks', () => {
    expect(A * (STATIONS.s1FuelFwdEquator - STATIONS.s1FuelAftEquator) + 2 * dome).toBeCloseTo(tankVolume(S1.rp1, 'rp1'), 0);
    expect(A * (STATIONS.s1LoxFwdEquator - STATIONS.s1LoxAftEquator) + 2 * dome).toBeCloseTo(tankVolume(S1.lox, 'lox'), 0);
  });
  it('upper-stage tanks either side of the common bulkhead', () => {
    expect(A * (STATIONS.s2CommonBulkheadEquator - STATIONS.s2FuelAftEquator)).toBeCloseTo(tankVolume(S2.rp1, 'rp1'), 0);
    expect(A * (STATIONS.s2LoxFwdEquator - STATIONS.s2CommonBulkheadEquator) + 2 * dome).toBeCloseTo(tankVolume(S2.lox, 'lox'), 0);
    void PROPELLANTS;
  });
});
