/**
 * Why-demos: structure (3 to 5 beats, visual keys naming real demo scenes, sources) and every
 * number in the beats and examples recomputed from spec.ts, frames.ts and standard physics.
 */
import { describe, expect, it } from 'vitest';
import { WHY_DEMOS, whyDemoById, whyVisual } from './why';
import { sourceById } from './sources';
import type { DemoId, WhyDemo } from './types';
import { BODY_RADIUS, E1, E1V, FAIRING, G0, LEGS, PAYLOADS, PROPELLANTS, S1, S2, STATIONS, tankVolume } from '../vehicle/spec';
import { MU_EARTH, OMEGA_EARTH, R_EARTH, SITE } from '../world/frames';

const DEMOS: Record<DemoId, true> = {
  'tank-drain': true,
  'feed-flow': true,
  turbopump: true,
  combustion: true,
  'nozzle-pressure': true,
  'regen-cooling': true,
  tvc: true,
  'gnc-loop': true,
  'staging-sequence': true,
  'fairing-sep': true,
  'spacecraft-ops': true,
  'booster-recovery': true,
  'capsule-return': true,
  'tank-pressure': true,
  'sandwich-panel': true,
  'heat-shield-stack': true,
};

const fmt = (x: number, d = 0) => x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const P_SEA = 101325;

function all(w: WhyDemo): string {
  return [w.question, ...w.beats.map((b) => b.text), w.equation?.example ?? '', w.equation?.caveat ?? '', w.takeaway].join('\n');
}
function get(id: string): WhyDemo {
  const w = whyDemoById(id);
  if (!w) throw new Error(`missing why-demo ${id}`);
  return w;
}
const dv = (isp: number, m0: number, mf: number) => isp * G0 * Math.log(m0 / mf);

/** Ideal isentropic nozzle exit pressure for an area ratio, constant ratio of specific heats. */
function exitPressure(pc: number, eps: number, gamma: number): number {
  const areaRatio = (M: number) => (1 / M) * ((2 / (gamma + 1)) * (1 + ((gamma - 1) / 2) * M * M)) ** ((gamma + 1) / (2 * (gamma - 1)));
  let lo = 1.0001;
  let hi = 20;
  for (let i = 0; i < 200; i++) {
    const m = (lo + hi) / 2;
    if (areaRatio(m) < eps) lo = m;
    else hi = m;
  }
  const Me = (lo + hi) / 2;
  return pc * (1 + ((gamma - 1) / 2) * Me * Me) ** (-gamma / (gamma - 1));
}

describe('why-demos: structure', () => {
  it('covers the seven required questions with 3 to 5 beats each', () => {
    const ids = WHY_DEMOS.map((w) => w.id);
    expect(ids).toEqual(['why-staging', 'why-separate-tanks', 'why-pumps', 'why-nozzle-size', 'why-chamber-cooling', 'why-turn', 'why-sideways']);
    expect(new Set(ids).size).toBe(ids.length);
    for (const w of WHY_DEMOS) {
      expect(w.beats.length).toBeGreaterThanOrEqual(3);
      expect(w.beats.length).toBeLessThanOrEqual(5);
      expect(w.question.endsWith('?')).toBe(true);
      expect(w.takeaway.length).toBeGreaterThan(60);
      expect(w.sources.length).toBeGreaterThan(0);
      for (const s of w.sources) expect(sourceById(s), `${w.id} cites ${s}`).toBeDefined();
    }
  });

  it('every beat has text and a visual key naming a real demo scene', () => {
    for (const w of WHY_DEMOS)
      for (const b of w.beats) {
        expect(b.text.length).toBeGreaterThan(60);
        expect(b.visual).toMatch(/^[a-z-]+:[a-z0-9-]+$/);
        const { demo, state } = whyVisual(b.visual);
        expect(DEMOS[demo], `${w.id}: ${b.visual}`).toBe(true);
        expect(state.length).toBeGreaterThan(2);
      }
  });

  it('every equation explains all its variables with units', () => {
    for (const w of WHY_DEMOS) {
      const e = w.equation;
      expect(e, w.id).toBeDefined();
      if (!e) continue;
      expect(e.variables.length).toBeGreaterThanOrEqual(3);
      for (const v of e.variables) expect(v.unit.length).toBeGreaterThan(0);
      expect(e.caveat.length).toBeGreaterThan(60);
      expect((e.example ?? '').length).toBeGreaterThan(60);
    }
  });
});

describe('why-demos: numbers recomputed', () => {
  it('staging: single stage versus two stages with the same hardware, propellant and Isp', () => {
    const t = all(get('why-staging'));
    const carried = PAYLOADS.leoSat.mass + FAIRING.mass;
    const m0 = S1.dry + S1.propellant + S2.dry + S2.propellant + carried;
    const single = dv(E1.ispVac, m0, S1.dry + S2.dry + carried);
    const b1 = dv(E1.ispVac, m0, m0 - S1.propellant);
    const u0 = S2.dry + S2.propellant + carried;
    const u1 = S2.dry + carried;
    const b2 = dv(E1.ispVac, u0, u1);
    for (const m of [S1.propellant + S2.propellant, carried, m0, S1.dry + S2.dry + carried, S1.dry, u0, u1]) expect(t).toContain(`${fmt(m)} kg`);
    expect(t).toContain(`${fmt(single)} m/s`);
    expect(t).toContain(`${fmt(b1)} m/s`);
    expect(t).toContain(`${fmt(b2)} m/s`);
    expect(t).toContain(`${fmt(b1 + b2)} m/s`);
    expect(t).toContain(`about ${fmt(Math.round((b1 + b2 - single) / 100) * 100)} m/s more`);
    expect(t).toContain(`${fmt(E1.ispVac)} s`);
    expect(t).toContain(`${fmt(E1V.ispVac)} s`);
    expect(single).toBeLessThan(9400); // not enough for orbit
    expect(b1 + b2).toBeGreaterThan(9400);
  });

  it('separate tanks: propellant split and tank volumes with 3 % ullage', () => {
    const t = all(get('why-separate-tanks'));
    expect(t).toContain(`${fmt(Math.round(PROPELLANTS.lox.boilK))} K (${fmt(Math.round(PROPELLANTS.lox.boilK - 273.15))} °C)`);
    expect(t).toContain(`${fmt(E1.mixtureRatio, 1)} kg of LOX`);
    expect(t).toContain(`${fmt(S1.lox)} kg of LOX (${fmt(PROPELLANTS.lox.density)} kg/m³)`);
    expect(t).toContain(`${fmt(S1.rp1)} kg of RP-1 (${fmt(PROPELLANTS.rp1.density)} kg/m³)`);
    const vl = tankVolume(S1.lox, 'lox');
    const vf = tankVolume(S1.rp1, 'rp1');
    expect(t).toContain(`${fmt(vl, 1)} m³`);
    expect(t).toContain(`${fmt(vf, 1)} m³`);
    expect(t).toContain(`${fmt(vl / vf, 2)} times the volume`);
    expect(t).toContain(`volume ratio of ${fmt(vl / vf, 2)}`);
    expect(t).toContain(`${fmt(S1.propellant)} kg of propellant`);
  });

  it('pumps: hoop-stress wall thickness and mass, pump hydraulic power', () => {
    const t = all(get('why-pumps'));
    const pc = E1.chamberPressure;
    expect(t).toContain(`${fmt(pc / 1e6, 1)} MPa`);
    expect(t).toContain(`about ${fmt(pc / P_SEA)} times atmospheric`);
    const sigma = 300e6;
    const r = BODY_RADIUS;
    const L = STATIONS.s1LoxFwdEquator - STATIONS.s1LoxAftEquator;
    const area = 2 * Math.PI * r * L;
    const rhoAl = 2840;
    const tPump = (0.3e6 * r) / sigma;
    const tPf = (pc * r) / sigma;
    expect(t).toContain(`${fmt(r, 2)} m radius`);
    expect(t).toContain(`at least ${fmt(Math.floor(tPf * 1000))} mm`);
    expect(t).toContain(`${fmt(L, 1)} m barrel`);
    expect(t).toContain(`at least ${fmt(Math.floor((area * tPf * rhoAl) / 1000))} t`);
    expect(area * tPf * rhoAl).toBeGreaterThan(S1.dry);
    expect(t).toContain(`${fmt(S1.dry / 1000, 1)} t booster`);
    expect(t).toContain(`${fmt(tPump * 1000, 2)} mm`);
    expect(t).toContain(`length ${fmt(L, 2)} m, wall area ${fmt(area)} m²`);
    expect(t).toContain(`about ${fmt((area * tPump * rhoAl) / 1000, 2)} t`);
    expect(t).toContain(`${fmt(tPf * 1000, 1)} mm, about ${fmt((area * tPf * rhoAl) / 1000, 1)} t`);
    // hydraulic power to raise both flows by at least the chamber pressure
    const mdot = E1.thrustVac / (E1.ispVac * G0);
    const mox = (mdot * E1.mixtureRatio) / (1 + E1.mixtureRatio);
    const mfu = mdot / (1 + E1.mixtureRatio);
    const P = (mox * pc) / PROPELLANTS.lox.density + (mfu * pc) / PROPELLANTS.rp1.density;
    expect(t).toContain(`by ${fmt(pc / 1e6, 1)} MPa takes about ${fmt(P / 1e6, 1)} MW of hydraulic power per engine`);
    expect(t).toContain(`about ${fmt((S1.engineCount * P) / 1e6)} MW for the seven`);
    expect(t).toContain(`about ${fmt(E1.ggFlowFraction * 100)} %`);
  });

  it('nozzle size: exit pressures, the pressure term of the vacuum nozzle at sea level, Isp gain', () => {
    const t = all(get('why-nozzle-size'));
    const pe1 = exitPressure(E1.chamberPressure, E1.expansionRatio, 1.2);
    const pe2 = exitPressure(E1V.chamberPressure, E1V.expansionRatio, 1.2);
    expect(t).toContain(`expansion ratio ${fmt(E1.expansionRatio)}, ${fmt(E1.exitDiameter, 2)} m exit`);
    expect(t).toContain(`expansion ratio ${fmt(E1V.expansionRatio)}, ${fmt(E1V.exitDiameter, 2)} m exit`);
    expect(t).toContain(`roughly ${fmt(pe1 / 1e3)} kPa`);
    // altitude where the U.S. Standard Atmosphere 1976 (troposphere) pressure equals pe1
    const Rstar = 8.31446261815324;
    const M = 0.0289644;
    const H = (288.15 / 0.0065) * (1 - (pe1 / P_SEA) ** ((Rstar * 0.0065) / (G0 * M)));
    expect(H).toBeGreaterThan(5000);
    expect(H).toBeLessThan(6500);
    expect(t).toContain(`about ${fmt(H / 1000)} km altitude`);
    expect(pe1).toBeLessThan(P_SEA);
    expect(pe1 / P_SEA).toBeGreaterThan(0.4); // no separation expected at sea level
    expect(t).toContain(`about ${fmt(pe2 / 1e3)} kPa`);
    const Ae = (Math.PI * E1V.exitDiameter ** 2) / 4;
    expect(t).toContain(`${fmt(Ae, 2)} m² exit`);
    expect(t).toContain(`${fmt(Ae, 3)} m²`);
    expect(t).toContain(`${fmt((P_SEA * Ae) / 1e3)} kN`);
    expect(t).toContain(`${fmt((E1V.thrustVac - P_SEA * Ae) / 1e3)} kN`);
    expect(t).toContain(`${fmt(E1V.thrustVac / 1e3)} kN`);
    expect(t).toContain(`about ${fmt((E1V.ispVac / E1.ispVac - 1) * 100)} % more`);
  });

  it('chamber cooling: melting points, fuel flow, conduction temperature drops', () => {
    const t = all(get('why-chamber-cooling'));
    expect(t).toContain(`${fmt(1085 + 273.15)} K (1,085 °C)`);
    expect(t).toContain(`${fmt(1260 + 273.15)} K (1,260 °C)`);
    const mdot = E1.thrustVac / (E1.ispVac * G0);
    expect(t).toContain(`E-1’s ${fmt(mdot / (1 + E1.mixtureRatio))} kg/s of RP-1`);
    expect(E1.ggFlowFraction).toBeLessThan(0.1); // "the small share the gas generator takes"
    expect(t).not.toContain('all of the RP-1');
    const q = 30e6;
    const th = 0.001;
    expect(t).toContain(`about ${fmt((q * th) / 344)} K`);
    expect(t).toContain(`about ${fmt(Math.round((q * th) / 11.4 / 10) * 10)} K`);
    expect(t).toContain(`= ${fmt((q * th) / 344)} K`);
    expect(t).toContain(`ΔT = ${fmt((q * th) / 11.4)} K`);
  });

  it('turn: liftoff thrust-to-weight and gravity loss rates', () => {
    const t = all(get('why-turn'));
    const T = S1.engineCount * (E1.thrustSL ?? 0);
    const m0 = S1.dry + S1.propellant + S2.dry + S2.propellant + FAIRING.mass + PAYLOADS.leoSat.mass;
    const W = m0 * G0;
    expect(t).toContain(`${fmt(T / 1e3)} kN`);
    expect(t).toContain(`about ${fmt(W / 1e3)} kN`);
    expect(t).toContain(`ratio of ${fmt(T / W, 2)}`);
    expect(t).toContain(`${fmt(T / m0, 1)} m/s²`);
    expect(t).toContain(`${fmt(G0, 2)}`);
    expect(t).toContain(`${fmt(T / m0 - G0, 1)} m/s²`);
    expect(t).toContain(`m = ${fmt(m0)} kg`);
    expect(t).toContain(`= ${fmt(G0 * Math.sin(Math.PI / 6), 1)} m/s per second`);
    expect(t).toContain(`${fmt(LEGS.mass)} kg landing legs`);
    expect(t).toContain(`about ${fmt((LEGS.mass / m0) * 100, 1)} %`);
    const r = R_EARTH + 400e3;
    const v = Math.sqrt(MU_EARTH / r);
    expect(t).toContain(`${fmt(v)} m/s`);
    // energy per kilogram: climbing to 400 km against moving at orbital speed there
    const pe = MU_EARTH * (1 / R_EARTH - 1 / r);
    const ke = 0.5 * v * v;
    expect(t).toContain(`about ${fmt(pe / 1e6, 1)} MJ`);
    expect(t).toContain(`about ${fmt(ke / 1e6, 1)} MJ`);
    expect(Math.round(ke / pe)).toBe(8);
    expect(t).toContain('eight times as much');
  });

  it('sideways: gravity at 400 km, fall versus curvature in one second, rotation boost', () => {
    const t = all(get('why-sideways'));
    const r = R_EARTH + 400e3;
    const v = Math.sqrt(MU_EARTH / r);
    const g = MU_EARTH / r ** 2;
    const fall = 0.5 * g;
    const drop = (v * v) / (2 * r);
    expect(Math.abs(fall - drop)).toBeLessThan(1e-9);
    expect(t).toContain(`${fmt(g, 2)} m/s²`);
    expect(t).toContain(`about ${fmt((g / G0) * 100)} %`);
    expect(t).toContain(`${fmt(v)} m/s`);
    expect(t).toContain(`${fmt(v / 1000, 2)} km`);
    expect(t).toContain(`${fmt(fall, 2)} m`);
    expect(t).toContain(`${fmt(r / 1e3)} km`);
    const vRot = OMEGA_EARTH * R_EARTH * Math.cos((SITE.lat * Math.PI) / 180);
    expect(t).toContain(`about ${fmt(vRot)} m/s at ${fmt(SITE.lat, 1)}° N`);
  });
});
