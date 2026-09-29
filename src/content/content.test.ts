/**
 * Integrity of the materials-layer content: glossary, knowledge checks, learning path, sources
 * and writing rules. Every link must point at a part, demo, mission phase, material or source
 * that exists; the required glossary terms must be present; the numbers quoted in the checks are
 * recomputed from spec.ts; and no text contains an em dash (U+2014).
 */
import { describe, expect, it } from 'vitest';
import { GLOSSARY } from './glossary';
import { CHECKS, checksFor } from './checks';
import { LEARNING_PATH } from './learningPath';
import { WHY_DEMOS } from './why';
import { EQUATIONS } from './equations';
import { MATERIALS } from './materials';
import { MATERIAL_IDS, type MaterialId } from './materials/ids';
import { MATERIAL_SOURCES } from './sources/materials';
import { allSources, sourceById } from './sources';
import type { CheckKind, DemoId, LearningTopic } from './types';
import { PART_IDS, type PartId } from '../vehicle/parts';
import { OUTLINES } from '../timeline/missions/outline';
import type { MissionId } from '../timeline/types';
import { BODY_RADIUS, E1, E1V, FAIRING, G0, PROPELLANTS, S1, STATIONS } from '../vehicle/spec';
import { MU_EARTH, R_EARTH } from '../world/frames';

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
const TOPICS: Record<LearningTopic, true> = { anatomy: true, propulsion: true, structures: true, guidance: true, launch: true, orbit: true, return: true, missions: true };
const TOPIC_ORDER: LearningTopic[] = ['anatomy', 'propulsion', 'structures', 'guidance', 'launch', 'orbit', 'return', 'missions'];
const KINDS: Record<CheckKind, true> = { identify: true, material: true, order: true, distinguish: true, why: true };

const fmt = (x: number, d = 0) => x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

const isPart = (p: string): p is PartId => (PART_IDS as readonly string[]).includes(p);
const isMaterial = (m: string): m is MaterialId => (MATERIAL_IDS as readonly string[]).includes(m);
const isDemo = (d: string): boolean => d in DEMOS;
function phaseExists(mission: MissionId, phase: string): boolean {
  const o = OUTLINES[mission];
  if (!o) return false;
  return o.phases.some((p) => p.id === phase) || !!o.branch?.phases.some((p) => p.id === phase);
}

type Link = { part?: string; demo?: string; mission?: string; phase?: string; material?: string };
function linkOk(l: Link): boolean {
  if (l.part !== undefined) return isPart(l.part);
  if (l.demo !== undefined) return isDemo(l.demo);
  if (l.material !== undefined) return isMaterial(l.material);
  if (l.mission !== undefined) {
    if (!(l.mission in OUTLINES)) return false;
    return l.phase === undefined || phaseExists(l.mission as MissionId, l.phase);
  }
  return false;
}

/** Every string inside a value, recursively. */
function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) for (const x of v) strings(x, out);
  else if (v && typeof v === 'object') for (const x of Object.values(v)) strings(x, out);
  return out;
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

describe('sources', () => {
  it('material sources have unique ids, a title, publisher, https URL and an honest access flag', () => {
    const ids = MATERIAL_SOURCES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of MATERIAL_SOURCES) {
      expect(s.title.length).toBeGreaterThan(3);
      expect(s.publisher.length).toBeGreaterThan(2);
      expect(s.url).toMatch(/^https:\/\//);
      expect(s.used.length).toBeGreaterThan(10);
      expect(s.accessed).toBe('reference'); // nothing could be opened from the build environment
      expect(sourceById(s.id)).toBeDefined();
    }
  });

  it('every source this content cites exists, and every material source is cited', () => {
    const cited = new Set<string>();
    for (const m of Object.values(MATERIALS)) {
      m.sources.forEach((s) => cited.add(s));
      m.properties.forEach((p) => cited.add(p.source));
      m.elsewhere.forEach((e) => cited.add(e.source));
    }
    for (const c of CHECKS) c.sources.forEach((s) => cited.add(s));
    for (const w of WHY_DEMOS) w.sources.forEach((s) => cited.add(s));
    const known = new Set(allSources().map((s) => s.id));
    for (const s of cited) expect(known.has(s), `cited source ${s}`).toBe(true);
    for (const s of MATERIAL_SOURCES) expect(cited.has(s.id), `material source ${s.id} is never cited`).toBe(true);
  });
});

describe('glossary', () => {
  it('has at least 35 terms with unique ids and real definitions', () => {
    expect(GLOSSARY.length).toBeGreaterThanOrEqual(35);
    const ids = GLOSSARY.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    const terms = GLOSSARY.map((g) => norm(g.term));
    expect(new Set(terms).size).toBe(terms.length);
    for (const g of GLOSSARY) expect(g.definition.length).toBeGreaterThan(60);
  });

  it('covers every required term (by term or alias)', () => {
    const required = [
      'oxidizer', 'specific impulse', 'turbopump', 'gas generator', 'regenerative cooling', 'throat', 'expansion ratio', 'dynamic pressure',
      'max-q', 'staging', 'ullage', 'pressurant', 'COPV', 'gimbal', 'thrust vector control', 'gravity turn', 'apoapsis', 'periapsis',
      'parking orbit', 'transfer orbit', 'delta-v', 'rendezvous', 'phasing', 'docking', 'ablation', 'anisotropy', 'sandwich panel',
      'reefing', 'sphere of influence', 'flyby', 'boostback', 'entry interface', 'hypergolic', 'TEA-TEB', 'cryogenic', 'Karman line',
    ];
    const names = new Set<string>();
    for (const g of GLOSSARY) {
      names.add(norm(g.term));
      for (const a of g.aliases ?? []) names.add(norm(a));
      for (const part of g.term.split(/\s+and\s+/)) names.add(norm(part));
    }
    for (const r of required) expect(names.has(norm(r)), `glossary term "${r}"`).toBe(true);
  });

  it('every "see" link points at a part, a demo or a mission phase that exists', () => {
    for (const g of GLOSSARY) {
      expect(g.see.length, g.id).toBeGreaterThan(0);
      for (const s of g.see) {
        if ('mission' in s) expect(s.phase, `${g.id}: glossary mission links name a phase`).toBeTruthy();
        expect(linkOk(s), `${g.id}: ${JSON.stringify(s)}`).toBe(true);
      }
    }
  });
});

describe('knowledge checks', () => {
  it('at least 32 checks, unique ids, every topic and every kind represented', () => {
    expect(CHECKS.length).toBeGreaterThanOrEqual(32);
    const ids = CHECKS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of Object.keys(TOPICS) as LearningTopic[]) expect(checksFor(t).length, t).toBeGreaterThanOrEqual(4);
    for (const k of Object.keys(KINDS) as CheckKind[]) expect(CHECKS.filter((c) => c.kind === k).length, k).toBeGreaterThanOrEqual(3);
    for (const c of CHECKS) {
      expect(TOPICS[c.topic]).toBe(true);
      expect(KINDS[c.kind]).toBe(true);
    }
  });

  it('answers are valid; order answers are permutations; identify checks highlight a real part', () => {
    for (const c of CHECKS) {
      expect(c.choices.length, c.id).toBeGreaterThanOrEqual(c.kind === 'order' ? 4 : 3);
      expect(new Set(c.choices).size, `${c.id}: duplicate choices`).toBe(c.choices.length);
      if (c.kind === 'order') {
        expect(Array.isArray(c.answer), c.id).toBe(true);
        const a = c.answer as number[];
        expect([...a].sort((x, y) => x - y)).toEqual(c.choices.map((_, i) => i));
        expect(a.some((x, i) => x !== i), `${c.id}: choices must not already be in order`).toBe(true);
      } else {
        expect(typeof c.answer, c.id).toBe('number');
        const a = c.answer as number;
        expect(Number.isInteger(a) && a >= 0 && a < c.choices.length, c.id).toBe(true);
      }
      if (c.kind === 'identify') expect(c.part && isPart(c.part), `${c.id}: identify needs a real part`).toBe(true);
      if (c.part) expect(isPart(c.part), c.id).toBe(true);
    }
  });

  it('the correct choice is not always in the same position', () => {
    const single = CHECKS.filter((c) => c.kind !== 'order');
    const counts = new Map<number, number>();
    for (const c of single) counts.set(c.answer as number, (counts.get(c.answer as number) ?? 0) + 1);
    expect(counts.size).toBeGreaterThanOrEqual(3);
    for (const n of counts.values()) expect(n / single.length).toBeLessThan(0.45);
  });

  it('explanations are specific, "show me again" targets exist, and sources are cited', () => {
    for (const c of CHECKS) {
      expect(c.explain.length, c.id).toBeGreaterThan(200);
      expect(c.prompt.length, c.id).toBeGreaterThan(10);
      expect(linkOk(c.showAgain as Link), `${c.id}: ${JSON.stringify(c.showAgain)}`).toBe(true);
      expect(c.sources.length, c.id).toBeGreaterThan(0);
      for (const s of c.sources) expect(sourceById(s), `${c.id} cites ${s}`).toBeDefined();
    }
  });

  it('numbers quoted in the checks match spec.ts', () => {
    const text = (id: string) => {
      const c = CHECKS.find((x) => x.id === id);
      if (!c) throw new Error(`missing check ${id}`);
      return [c.prompt, ...c.choices, c.explain].join('\n');
    };
    // LOX on top: densities and mass ratio
    const lox = text('anatomy-lox-on-top');
    expect(lox).toContain(`${fmt(PROPELLANTS.lox.density)} kg/m³`);
    expect(lox).toContain(`${fmt(PROPELLANTS.rp1.density)} kg/m³`);
    expect(lox).toContain(`${fmt(E1.mixtureRatio, 1)} times more`);
    // pressure-fed tank
    const pumps = text('prop-why-pumps');
    const L = STATIONS.s1LoxFwdEquator - STATIONS.s1LoxAftEquator;
    const tPf = (E1.chamberPressure * BODY_RADIUS) / 300e6;
    expect(pumps).toContain(`${fmt(E1.chamberPressure / 1e6, 1)} MPa`);
    expect(pumps).toContain(`${fmt(BODY_RADIUS, 2)} m`);
    expect(pumps).toContain(`at least ${fmt(Math.floor(tPf * 1000))} mm`);
    expect(pumps).toContain(`at least ${fmt(Math.floor((2 * Math.PI * BODY_RADIUS * L * tPf * 2840) / 1000))} t`);
    expect(pumps).toContain(`${fmt(S1.dry / 1000, 1)} t booster`);
    // Isp versus thrust: mass flows
    const isp = text('prop-isp-vs-thrust');
    expect(isp).toContain(`${fmt(E1V.thrustVac / 1e3)} kN against ${fmt(E1.thrustVac / 1e3)} kN`);
    expect(isp).toContain(`${fmt(E1V.ispVac)} s against ${fmt(E1.ispVac)} s`);
    expect(isp).toContain(`about ${fmt(E1V.thrustVac / (E1V.ispVac * G0))} kg/s against ${fmt(E1.thrustVac / (E1.ispVac * G0))} kg/s`);
    // conduction
    const liner = text('prop-liner-material');
    expect(liner).toContain(`about ${fmt(30e6 * 0.001 / 344)} K`);
    expect(liner).toContain(`about ${fmt(Math.round((30e6 * 0.001) / 11.4 / 10) * 10)} K`);
    // sandwich
    const sw = text('struct-sandwich');
    const areal = 2 * FAIRING.faceSheet * 1600 + FAIRING.core * 50;
    expect(sw).toContain(`${fmt(FAIRING.faceSheet * 1000, 1)} mm skins on a ${fmt(FAIRING.core * 1000)} mm core`);
    expect(sw).toContain(`${fmt((areal / 1600) * 1000, 2)} mm thick`);
    // orbit
    const r = R_EARTH + 400e3;
    const v = Math.sqrt(MU_EARTH / r);
    const g = MU_EARTH / r ** 2;
    for (const id of ['orbit-falling', 'missions-suborbital-vs-orbital']) {
      const t = text(id);
      expect(t).toContain(`${fmt(v)} m/s`);
      expect(t).toContain(`${fmt((g / G0) * 100)} %`);
    }
    const fall = text('orbit-falling');
    expect(fall).toContain(`${fmt(0.5 * g, 2)} m`);
    expect(fall).toContain(`${fmt(v / 1000, 2)} km`);
    expect(fall).toContain(`${fmt(g, 2)} m/s²`);
    // landing burn on one engine
    const land = text('return-landing-burn');
    const Tmin = E1.minThrottle * (E1.thrustSL ?? 0);
    const W = S1.dry * G0;
    expect(land).toContain(`${fmt(E1.minThrottle * 100)} % minimum throttle`);
    expect(land).toContain(`about ${fmt(Tmin / 1e3)} kN`);
    expect(land).toContain(`about ${fmt(W / 1e3)} kN`);
    expect(land).toContain(`${fmt(S1.dry)} kg dry mass`);
    expect(land).toContain(`about ${fmt(Tmin / W, 2)}`);
    // gimbal range
    expect(text('gnc-tvc')).toContain(`up to ${fmt(E1.gimbalRangeDeg)}°`);
  });
});

describe('learning path', () => {
  it('has the eight topics in teaching order, each with a blurb and items that exist', () => {
    expect(LEARNING_PATH.map((s) => s.topic)).toEqual(TOPIC_ORDER);
    for (const s of LEARNING_PATH) {
      expect(s.title.length).toBeGreaterThan(5);
      expect(s.blurb.length).toBeGreaterThan(100);
      expect(s.items.length).toBeGreaterThan(3);
      for (const it of s.items) expect(linkOk(it as Link), `${s.topic}: ${JSON.stringify(it)}`).toBe(true);
    }
  });

  it('the structures step reaches every material; the missions step reaches every mission', () => {
    const allMaterials = new Set(LEARNING_PATH.flatMap((s) => s.items.filter((i) => 'material' in i).map((i) => (i as { material: MaterialId }).material)));
    for (const m of MATERIAL_IDS) expect(allMaterials.has(m), `material ${m} is on the path`).toBe(true);
    const missions = LEARNING_PATH.find((s) => s.topic === 'missions')?.items.map((i) => (i as { mission: MissionId }).mission);
    expect(new Set(missions)).toEqual(new Set(Object.keys(OUTLINES)));
  });
});

describe('writing rules', () => {
  const content = { MATERIALS, GLOSSARY, CHECKS, LEARNING_PATH, WHY_DEMOS, EQUATIONS, MATERIAL_SOURCES };

  it('no em dash (U+2014) or en dash (U+2013) in any text', () => {
    for (const [name, value] of Object.entries(content))
      for (const s of strings(value)) {
        expect(s.includes('—'), `${name}: em dash in "${s.slice(0, 80)}"`).toBe(false);
        expect(s.includes('–'), `${name}: en dash in "${s.slice(0, 80)}"`).toBe(false);
      }
  });

  it('no em dash in the source files of this module', () => {
    const files = import.meta.glob(
      ['./glossary.ts', './checks.ts', './learningPath.ts', './why.ts', './equations.ts', './sources/materials.ts', './materials/*.ts', './*.test.ts', '!./materials/ids.ts', '!./materials/assignments.ts'],
      { query: '?raw', import: 'default', eager: true },
    ) as Record<string, string>;
    expect(Object.keys(files).length).toBeGreaterThanOrEqual(12);
    for (const [path, src] of Object.entries(files)) expect(src.includes('—'), path).toBe(false);
  });

  it('no stray whitespace or unfinished text', () => {
    for (const [name, value] of Object.entries(content))
      for (const s of strings(value)) {
        expect(s, name).toBe(s.trim());
        expect(/\s{2,}/.test(s), `${name}: double space in "${s.slice(0, 60)}"`).toBe(false);
        expect(/\b(TODO|TBD|FIXME|lorem)\b/i.test(s), `${name}: placeholder in "${s.slice(0, 60)}"`).toBe(false);
      }
  });
});
