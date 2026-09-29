/**
 * Unit checks of the trajectory model's building blocks against published numbers and the
 * vehicle spec: US Standard Atmosphere 1976, engine thrust with the ambient-pressure term,
 * the rocket equation, two-body propagation and the Clohessy-Wiltshire solution.
 */
import { describe, expect, it } from 'vitest';
import { E1, E1V, G0, PAYLOADS, S1, S2 } from '../../vehicle/spec';
import { MU_EARTH, R_EARTH, moonPosition } from '../../world/frames';
import { atmosphere } from './atmosphere';
import { moonPos } from './craft';
import { elements, kepler } from './kepler';
import { cwPropagate, type Rel } from './rendezvous';
import { ENG_S1, ENG_S2, P0, thrustOf } from './vehicle';

describe('atmosphere (US Standard Atmosphere 1976)', () => {
  it('matches the published table', () => {
    const rows: [number, number, number, number][] = [
      // geometric altitude m, temperature K, pressure Pa, density kg/m^3 (US76 tables)
      [0, 288.15, 101325, 1.225],
      [5000, 255.676, 54048, 0.73643],
      [10000, 223.252, 26500, 0.41351],
      [20000, 216.65, 5529.3, 0.08891],
      [30000, 226.509, 1197.0, 0.01841],
      [40000, 250.35, 287.14, 0.0039957],
      [50000, 270.65, 79.779, 0.0010269],
      [70000, 219.585, 5.2209, 8.2829e-5],
      [80000, 198.639, 1.0524, 1.8458e-5],
    ];
    for (const [h, T, p, rho] of rows) {
      const a = atmosphere(h);
      expect(Math.abs(a.temperature - T)).toBeLessThan(0.1);
      expect(Math.abs(a.pressure - p) / p).toBeLessThan(0.003);
      expect(Math.abs(a.density - rho) / rho).toBeLessThan(0.003);
    }
    expect(atmosphere(0).speedOfSound).toBeCloseTo(340.29, 1);
  });
  it('falls off smoothly above 86 km and reaches vacuum', () => {
    let prev = atmosphere(80_000).density;
    for (let h = 82_000; h <= 900_000; h += 2000) {
      const d = atmosphere(h).density;
      expect(d).toBeLessThan(prev);
      expect(d).toBeGreaterThan(0);
      prev = d;
    }
    expect(atmosphere(120_000).density).toBeCloseTo(2.222e-8, 10);
    expect(atmosphere(2_000_000).density).toBe(0);
  });
});

describe('engines', () => {
  it('sea-level thrust and Isp come out of T = mdot Isp_vac g0 - p A_exit consistent with the spec', () => {
    const tSL = thrustOf(ENG_S1, 1, 1, P0);
    expect(Math.abs(tSL - E1.thrustSL!) / E1.thrustSL!).toBeLessThan(1e-9);
    // the spec's sea-level pair implies a mass flow 0.36 % different from the vacuum pair's
    // (760/835 vs 285/312): with the vacuum mass flow, sea-level Isp comes out 284.0 s
    const ispSL = tSL / (ENG_S1.mdot * G0);
    expect(Math.abs(ispSL - E1.ispSL!) / E1.ispSL!).toBeLessThan(0.005);
    expect(thrustOf(ENG_S1, 1, 1, 0)).toBeCloseTo(E1.thrustVac, 3);
    expect(ENG_S2.mdot).toBeCloseTo(E1V.thrustVac / (E1V.ispVac * G0), 6);
    // throttled: mass flow and vacuum thrust scale together
    expect(thrustOf(ENG_S1, 7, 0.7, 0)).toBeCloseTo(7 * 0.7 * E1.thrustVac, 3);
  });
  it('rocket equation: first-stage ideal delta-v from the spec numbers', () => {
    // LEO stack at liftoff: booster dry + legs, full propellant, upper stage full, fairing, satellite
    const m0 = S1.dry + 2100 + S1.propellant + S2.dry + S2.propellant + 1800 + PAYLOADS.leoSat.mass;
    const mf = m0 - S1.propellant;
    const dvVac = E1.ispVac * G0 * Math.log(m0 / mf);
    const dvSL = E1.ispSL! * G0 * Math.log(m0 / mf);
    // m0 = 445.2 t, mf = 115.2 t: ln(3.865) = 1.352, so 4.14 km/s with the vacuum Isp and
    // 3.78 km/s with the sea-level Isp (the real flight gets less: gravity and drag losses)
    expect(m0).toBe(445_200);
    expect(dvVac).toBeGreaterThan(4120);
    expect(dvVac).toBeLessThan(4150);
    expect(dvSL).toBeGreaterThan(3765);
    expect(dvSL).toBeLessThan(3790);
  });
});

describe('orbits', () => {
  it('Kepler propagation conserves energy and angular momentum and closes the orbit', () => {
    const r0 = { x: R_EARTH + 400e3, y: 0, z: 0 };
    const v0 = { x: 0, y: 7700, z: 300 };
    const e0 = elements(r0, v0, MU_EARTH);
    const k = kepler(r0, v0, e0.period, MU_EARTH);
    expect(Math.hypot(k.r.x - r0.x, k.r.y - r0.y, k.r.z - r0.z)).toBeLessThan(0.01);
    const h = kepler(r0, v0, 2000, MU_EARTH);
    const e1 = elements(h.r, h.v, MU_EARTH);
    expect(Math.abs(e1.energy - e0.energy) / Math.abs(e0.energy)).toBeLessThan(1e-10);
    // hyperbolic
    const vh = { x: 0, y: 11500, z: 0 };
    const kh = kepler(r0, vh, 3600, MU_EARTH);
    const eh0 = elements(r0, vh, MU_EARTH);
    const eh1 = elements(kh.r, kh.v, MU_EARTH);
    expect(Math.abs(eh1.energy - eh0.energy) / eh0.energy).toBeLessThan(1e-9);
  });
  it('the allocation-free Moon position is bit-identical to world/frames.ts', () => {
    for (let i = 0; i < 200; i++) {
      const a = moonPos(i * 1234.5 - 1e5, i * 0.07);
      const b = moonPosition(i * 1234.5 - 1e5, i * 0.07);
      expect(a.x).toBe(b.x);
      expect(a.y).toBe(b.y);
      expect(a.z).toBe(b.z);
    }
  });
  it('Clohessy-Wiltshire: a lower circular orbit drifts ahead at 1.5 n dh', () => {
    const n = Math.sqrt(MU_EARTH / (R_EARTH + 400e3) ** 3);
    const x: Rel = { r: -3000, s: 0, w: 0, vr: 0, vs: 1.5 * n * 3000, vw: 0 };
    const y = cwPropagate(x, n, 1800);
    expect(y.r).toBeCloseTo(-3000, 6);
    expect(y.s).toBeCloseTo(1.5 * n * 3000 * 1800, 3);
  });
});
