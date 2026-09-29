/**
 * Recomputes every worked example in EQUATIONS from spec.ts and frames.ts, and checks that the
 * numbers quoted in the text match (formatted the way the text writes them).
 */
import { describe, expect, it } from 'vitest';
import { EQUATIONS } from './equations';
import { E1, FAIRING, G0, PAYLOADS, S1, S2 } from '../vehicle/spec';
import { MU_EARTH, OMEGA_EARTH, R_EARTH, SITE } from '../world/frames';

const fmt = (x: number, d = 0) => x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const P_SEA = 101325; // Pa, U.S. Standard Atmosphere 1976 sea-level pressure

/** U.S. Standard Atmosphere 1976, geometric altitude in the 11-20 km isothermal layer. */
function ussa1976Stratosphere(zGeometric: number): { rho: number; p: number; T: number; a: number } {
  const r0 = 6356766; // m, USSA effective Earth radius for geopotential altitude
  const Rstar = 8.31446261815324;
  const M = 0.0289644;
  const H = (r0 * zGeometric) / (r0 + zGeometric);
  if (H < 11000 || H > 20000) throw new Error('outside the isothermal layer');
  const T = 216.65;
  const p = 22632.06 * Math.exp((-G0 * M * (H - 11000)) / (Rstar * T));
  const rho = (p * M) / (Rstar * T);
  const a = Math.sqrt((1.4 * Rstar * T) / M);
  return { rho, p, T, a };
}

describe('equation notes: structure', () => {
  it('all four equations are present with explained variables, a caveat and an example', () => {
    for (const key of ['thrust', 'dynamic-pressure', 'rocket-equation', 'orbital-speed'] as const) {
      const e = EQUATIONS[key];
      expect(e.formula.length).toBeGreaterThan(5);
      expect(e.variables.length).toBeGreaterThanOrEqual(3);
      for (const v of e.variables) {
        expect(v.symbol.length).toBeGreaterThan(0);
        expect(v.meaning.length).toBeGreaterThan(5);
        expect(v.unit.length).toBeGreaterThan(0);
      }
      expect(e.caveat.length).toBeGreaterThan(100);
      expect((e.example ?? '').length).toBeGreaterThan(100);
    }
  });
});

describe('worked examples recomputed from spec.ts', () => {
  it('thrust: sea-level thrust from vacuum thrust and exit area; mass flow', () => {
    const ex = EQUATIONS.thrust.example ?? '';
    const Ae = (Math.PI * E1.exitDiameter ** 2) / 4;
    const loss = P_SEA * Ae;
    const Fsl = E1.thrustVac - loss;
    const mdot = E1.thrustVac / (E1.ispVac * G0);
    expect(ex).toContain(`${fmt(E1.thrustVac / 1e3)} kN`);
    expect(ex).toContain(`${fmt(E1.exitDiameter, 2)} m`);
    expect(ex).toContain(`${fmt(Ae, 4)} m²`);
    expect(ex).toContain(`${fmt(P_SEA)} Pa`);
    expect(ex).toContain(`${fmt(loss / 1e3, 1)} kN`);
    expect(ex).toContain(`${fmt(Fsl / 1e3, 1)} kN`);
    // "within 2 %" of the listed sea-level rating
    expect(ex).toContain(`${fmt((E1.thrustSL ?? 0) / 1e3)} kN at sea level`);
    expect(Math.abs(Fsl / (E1.thrustSL ?? 1) - 1)).toBeLessThan(0.02);
    expect(ex).toContain(`${fmt(E1.ispVac)} s`);
    expect(ex).toContain(`${fmt(mdot, 1)} kg/s`);
    expect(S1.engineCount).toBe(7);
    expect(ex).toContain('seven booster engines');
    expect(ex).toContain(`about ${fmt(S1.engineCount * mdot)} kg`);
    // The exit area agrees with throat area times expansion ratio (spec self-consistency).
    const AeFromRatio = ((Math.PI * E1.throatDiameter ** 2) / 4) * E1.expansionRatio;
    expect(Math.abs(AeFromRatio / Ae - 1)).toBeLessThan(0.005);
  });

  it('dynamic pressure: US Standard Atmosphere at 12 km, 450 m/s, fairing frontal area', () => {
    const ex = EQUATIONS['dynamic-pressure'].example ?? '';
    const atm = ussa1976Stratosphere(12000);
    expect(ex).toContain(`${fmt(atm.rho, 3)} kg/m³`);
    expect(ex).toContain(`${fmt(atm.a)} m/s`);
    expect(ex).toContain(`about Mach ${fmt(450 / atm.a, 1)}`);
    const rho = Number(fmt(atm.rho, 3)); // the text computes with the rounded density
    const q = 0.5 * rho * 450 ** 2;
    expect(ex).toContain(`${fmt(q)} Pa`);
    expect(ex).toContain(`${fmt(q / 1e3, 1)} kPa`);
    const A = (Math.PI * FAIRING.diameter ** 2) / 4;
    expect(ex).toContain(`${fmt(FAIRING.diameter, 1)} m fairing`);
    expect(ex).toContain(`${fmt(A, 2)} m²`);
    expect(ex).toContain(`${fmt((q * A) / 1e3)} kN`);
    expect(ex).toContain(`about ${fmt((0.5 * q * A) / 1e3)} kN`);
  });

  it('rocket equation: booster ideal delta-v on the LEO mission, and the upper stage', () => {
    const ex = EQUATIONS['rocket-equation'].example ?? '';
    const payload = PAYLOADS.leoSat.mass;
    const m0 = S1.dry + S1.propellant + S2.dry + S2.propellant + FAIRING.mass + payload;
    const mf = m0 - S1.propellant;
    for (const m of [S1.dry, S1.propellant, S2.dry, S2.propellant, FAIRING.mass, payload, m0, mf]) expect(ex).toContain(`${fmt(m)} kg`);
    expect(ex).toContain(`mass ratio of ${fmt(m0 / mf, 3)}`);
    const dvVac = E1.ispVac * G0 * Math.log(m0 / mf);
    const dvSl = (E1.ispSL ?? 0) * G0 * Math.log(m0 / mf);
    expect(ex).toContain(`${fmt(dvVac)} m/s`);
    expect(ex).toContain(`${fmt(dvSl)} m/s`);
    expect(ex).toContain(`${fmt(E1.ispSL ?? 0)} s`);
    const m02 = S2.dry + S2.propellant + payload;
    const mf2 = S2.dry + payload;
    const dv2 = S2.engine.ispVac * G0 * Math.log(m02 / mf2);
    expect(ex).toContain(`${fmt(m02)} kg down to ${fmt(mf2)} kg at ${fmt(S2.engine.ispVac)} s`);
    expect(ex).toContain(`${fmt(dv2)} m/s`);
  });

  it('orbital speed at 400 km, period, gravity there, and the Earth-rotation boost', () => {
    const e = EQUATIONS['orbital-speed'];
    const ex = e.example ?? '';
    const r = R_EARTH + 400e3;
    const v = Math.sqrt(MU_EARTH / r);
    const T = (2 * Math.PI * r) / v;
    const g = MU_EARTH / r ** 2;
    expect(ex).toContain(`${fmt(R_EARTH / 1e3)} km + 400 km = ${fmt(r / 1e3)} km`);
    expect(ex).toContain(`${fmt(v)} m/s`);
    expect(ex).toContain(`about ${fmt(Math.round((v * 3.6) / 10) * 10)} km/h`);
    expect(ex).toContain(`${fmt(T / 60, 1)} minutes`);
    expect(ex).toContain(`${fmt(g, 2)} m/s²`);
    expect(ex).toContain(`about ${fmt((g / G0) * 100)} %`);
    expect(ex).toContain(`${fmt(MU_EARTH / 1e14, 6)} × 10¹⁴`);
    const vRot = OMEGA_EARTH * R_EARTH * Math.cos((SITE.lat * Math.PI) / 180);
    expect(e.caveat).toContain(`about ${fmt(vRot)} m/s`);
    expect(e.caveat).toContain(`${fmt(SITE.lat, 1)}° N`);
  });
});
