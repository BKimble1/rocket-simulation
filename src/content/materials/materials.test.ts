/**
 * Materials index: completeness, the usedIn/ASSIGNMENTS contract, source and closeup integrity,
 * and every number the entries compute (buckling, sandwich stiffness, conduction, radiation),
 * recomputed from spec.ts and standard formulas.
 */
import { describe, expect, it } from 'vitest';
import { MATERIALS, comparisonUses, inVehicleUses, materialList } from './index';
import { ASSIGNMENTS, partsUsing } from './assignments';
import { MATERIAL_IDS, type MaterialId } from './ids';
import { PART_IDS, type PartId } from '../../vehicle/parts';
import { BODY_RADIUS, E1, FAIRING } from '../../vehicle/spec';
import { sourceById } from '../sources';
import type { CloseupId, MaterialUse } from '../types';

const CLOSEUPS: Record<CloseupId, true> = {
  'tank-wall': true,
  'injector-face': true,
  'cooling-channels': true,
  'separation-joint': true,
  'fairing-sandwich': true,
  'heat-shield-stack': true,
  'turbopump-section': true,
  'grid-fin-lattice': true,
};

/** Format like the text: en-US grouping, fixed decimals. */
const fmt = (x: number, d = 0) => x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

function textOf(id: MaterialId): string {
  const m = MATERIALS[id];
  return [m.focus, m.suits, m.limits, m.manufacturing, m.inspection, m.question?.q ?? '', m.question?.a ?? '', ...m.compare.map((c) => c.text), ...m.elsewhere.map((e) => e.text), ...m.properties.map((p) => `${p.value} ${p.condition}`)].join('\n');
}

describe('materials index: completeness and the ASSIGNMENTS contract', () => {
  it('has one entry per MaterialId, keyed by its own id', () => {
    expect(Object.keys(MATERIALS).sort()).toEqual([...MATERIAL_IDS].sort());
    for (const id of MATERIAL_IDS) expect(MATERIALS[id].id).toBe(id);
    expect(materialList().map((m) => m.id)).toEqual([...MATERIAL_IDS]);
  });

  it('usedIn equals the in-vehicle uses of the assignments reverse index, in order', () => {
    for (const id of MATERIAL_IDS) {
      const expected = partsUsing(id)
        .filter((u) => u.inThisVehicle)
        .map(({ part, role }) => ({ part, role }));
      expect(MATERIALS[id].usedIn).toEqual(expected);
      expect(inVehicleUses(id)).toEqual(expected);
    }
  });

  it('usedIn and comparisonUses together cover every assignment exactly once', () => {
    let total = 0;
    for (const uses of Object.values(ASSIGNMENTS) as MaterialUse[][]) total += uses.length;
    let counted = 0;
    for (const id of MATERIAL_IDS) counted += MATERIALS[id].usedIn.length + comparisonUses(id).length;
    expect(counted).toBe(total);
  });

  it('every usedIn part is a real part whose assignment lists the material for this vehicle', () => {
    for (const id of MATERIAL_IDS)
      for (const u of MATERIALS[id].usedIn) {
        expect((PART_IDS as readonly string[]).includes(u.part)).toBe(true);
        const uses = ASSIGNMENTS[u.part as PartId] ?? [];
        expect(uses.some((m) => m.material === id && m.inThisVehicle && m.role === u.role)).toBe(true);
      }
  });

  it('spray-on foam is taught as a comparison only: not used on the K-1', () => {
    expect(MATERIALS['cryo-foam'].usedIn).toEqual([]);
    expect(comparisonUses('cryo-foam').map((u) => u.part)).toEqual(['s1-lox-tank']);
  });

  it('every entry is complete: text, comparisons, a cause-and-effect question, sources', () => {
    for (const m of materialList()) {
      for (const s of [m.name, m.family]) expect(s.trim().length).toBeGreaterThan(5);
      for (const s of [m.focus, m.suits, m.limits, m.manufacturing, m.inspection]) expect(s.trim().length, m.id).toBeGreaterThan(100);
      expect(m.compare.length).toBeGreaterThanOrEqual(3);
      expect(m.elsewhere.length).toBeGreaterThanOrEqual(1);
      expect(m.question?.q.endsWith('?')).toBe(true);
      expect((m.question?.a ?? '').length).toBeGreaterThan(150);
      expect(m.sources.length).toBeGreaterThan(0);
    }
  });

  it('every cited source exists; properties name a condition and a source', () => {
    for (const m of materialList()) {
      for (const s of m.sources) expect(sourceById(s), `${m.id} cites ${s}`).toBeDefined();
      for (const e of m.elsewhere) expect(sourceById(e.source), `${m.id} elsewhere cites ${e.source}`).toBeDefined();
      for (const p of m.properties) {
        expect(sourceById(p.source), `${m.id} property cites ${p.source}`).toBeDefined();
        expect(p.condition.length).toBeGreaterThan(3);
        expect(p.value).toMatch(/\d/);
      }
    }
  });

  it('closeups exist', () => {
    for (const m of materialList()) if (m.closeup) expect(CLOSEUPS[m.closeup]).toBe(true);
  });
});

describe('materials: worked numbers', () => {
  it('Al-Li question: classical buckling stress and the SP-8007 knockdown factor', () => {
    const E = 73e9; // 2219-T87, about 73 GPa (ASM)
    const t = 0.002;
    const R = BODY_RADIUS;
    const classical = (0.605 * E * t) / R; // Pa
    const RoverT = R / t;
    const phi = Math.sqrt(RoverT) / 16;
    const gamma = 1 - 0.901 * (1 - Math.exp(-phi)); // NASA SP-8007 axial compression
    const design = gamma * classical;
    const text = textOf('al-li');
    expect(text).toContain(`${fmt(R, 2)} m`);
    expect(text).toContain(`${fmt(RoverT, 0)}`);
    expect(text).toContain(`${fmt(classical / 1e6, 1)} MPa`);
    expect(text).toContain(`about ${fmt(gamma * 100, 0)} %`);
    expect(text).toContain(`about ${fmt(design / 1e6, 1)} MPa`);
    expect(design / 393e6).toBeLessThan(0.03); // "under 3 % of the roughly 393 MPa yield strength"
    expect(text).toContain('393 MPa');
  });

  it('GRCop question and compare: conduction temperature drop and the conductivity ratio', () => {
    const q = 30e6;
    const t = 0.001;
    const dTcu = (q * t) / 344;
    const dTni = (q * t) / 11.4;
    const text = textOf('grcop');
    expect(text).toContain(`about ${fmt(dTcu, 0)} K`);
    expect(text).toContain(`about ${fmt(Math.round(dTni / 10) * 10, 0)} K`);
    expect(dTni).toBeGreaterThan(1336 + 273.15); // above the 718 melting range
    expect(text).toContain(`about ${fmt(344 / 11.4, 0)} times`);
    // against the earlier NARloy-Z liner alloy (same NASA report)
    expect(text).toContain('344 against 296 W/(m·K)');
  });

  it('C-103: radiative flux at 1,370 °C with emissivity 0.8', () => {
    const sigma = 5.670374419e-8;
    const T = 1370 + 273.15;
    const flux = 0.8 * sigma * T ** 4;
    const text = textOf('niobium-c103');
    expect(text).toContain(`about ${fmt(flux / 1e6, 2)} MW/m²`);
    expect(text).toContain('1,370 °C');
    // "roughly a hundred times" less than a throat heat flux of tens of MW/m^2
    expect(30e6 / flux).toBeGreaterThan(50);
    expect(30e6 / flux).toBeLessThan(200);
  });

  it('honeycomb question: sandwich versus solid laminate of equal mass (fairing dimensions)', () => {
    const tf = FAIRING.faceSheet;
    const c = FAIRING.core;
    const rhoFace = 1600;
    const rhoCore = 50;
    const areal = 2 * tf * rhoFace + c * rhoCore;
    const tSolid = areal / rhoFace;
    const d = c + tf; // distance between face-sheet centroids
    const ratio = (tf * d * d) / 2 / (tSolid ** 3 / 12);
    for (const id of ['honeycomb-core', 'cfrp-sandwich'] as const) {
      const text = textOf(id);
      expect(text).toContain(`${fmt(tf * 1000, 1)} mm`);
      expect(text).toContain(`${fmt(c * 1000, 0)} mm`);
      expect(text).toContain('about 150 times');
    }
    expect(Math.abs(ratio - 150)).toBeLessThan(10);
    const hc = textOf('honeycomb-core');
    expect(hc).toContain(`${fmt(areal, 2)} kg/m²`);
    expect(hc).toContain(`${fmt(tSolid * 1000, 2)} mm`);
    // the core density quoted for a stated product, and its fraction of solid aluminium
    expect(hc).toContain('1/8 in cells of 0.0007 in 5052 foil) weighs about 50 kg/m³ (3.1 lb/ft³)');
    expect(hc).toContain(`about ${fmt((rhoCore / 2840) * 100)} % of solid aluminium`);
    expect(Math.abs(3.1 * 16.0185 - rhoCore)).toBeLessThan(1); // lb/ft³ to kg/m³
  });

  it('honeycomb in the common bulkhead is described as a non-metallic, insulating core', () => {
    const hc = textOf('honeycomb-core');
    expect(hc).toContain('non-metallic core');
    expect(MATERIALS['honeycomb-core'].elsewhere.some((e) => e.source === 'saturn-v-flight-manual')).toBe(true);
  });

  it('titanium: stiffness and density ratios against aluminium 2219', () => {
    const text = textOf('titanium');
    expect(fmt(114 / 73, 1)).toBe('1.6');
    expect(fmt(4430 / 2840, 1)).toBe('1.6');
    expect(text).toContain('about 1.6 times that of aluminium for about 1.6 times the density');
  });

  it('titanium: specific yield strength against 2219-T87', () => {
    const gain = 827 / 4430 / (393 / 2840) - 1;
    expect(textOf('titanium')).toContain(`about ${fmt(gain * 100)} % more yield strength per kilogram than 2219-T87`);
  });

  it('stainless: density ratio to aluminium', () => {
    expect(fmt(8030 / 2840, 1)).toBe('2.8');
    expect(textOf('stainless')).toContain('About 2.8 times the density of aluminium');
  });

  it('nickel superalloys: turbopump speed quoted from spec', () => {
    expect(textOf('nickel-superalloy')).toContain(`${fmt(E1.pumpRpm, 0)} rpm`);
  });
});
