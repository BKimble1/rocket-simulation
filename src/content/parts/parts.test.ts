import { describe, expect, it } from 'vitest';
import { PART_IDS, PARTS, isPartId, type BodyId, type PartId, type Variant } from '../../vehicle/parts';
import type { MissionId } from '../../timeline/types';
import { MISSION_ORDER, OUTLINES } from '../../timeline/missions/outline';
import { ASSIGNMENTS } from '../materials/assignments';
import { MATERIAL_IDS } from '../materials/ids';
import { CORE_SOURCES } from '../sources/core';
import { PART_SOURCES } from '../sources/parts';
import { allSources } from '../sources';
import type { PartLesson, PartNote, PhaseCard } from '../types';
import { LESSONS, LESSON_GROUPS, fullLessonFor, isPartLesson, lessonFor, partsLinkedToPhase } from './index';
import { MISSION_CARDS, PHASE_CARDS, phaseCard, phaseCardKey } from '../phaseCards';

// ---------- helpers ----------

/** Every phase id of a mission, main storyline then branch. */
function phasesOf(mission: MissionId): string[] {
  const o = OUTLINES[mission];
  return [...o.phases.map((p) => p.id), ...(o.branch?.phases.map((p) => p.id) ?? [])];
}

/** Vehicle configurations flown on a mission (from the outline, not retyped). */
function variantsOf(mission: MissionId): Variant[] {
  const o = OUTLINES[mission];
  const v: Variant[] = [];
  if (o.payload === 'leoSat' || o.payload === 'gtoSat' || o.payload === 'lunarProbe') v.push('satellite');
  if (o.payload === 'capsule') v.push('capsule');
  if (o.payload === 'researchCapsule') v.push('suborbital');
  v.push(o.recovery ? 'recovery' : 'expendable');
  return v;
}

/** Whether a part is physically present in a mission's configuration. */
function partFlies(part: PartId, mission: MissionId): boolean {
  const def = PARTS[part];
  const variants = variantsOf(mission);
  if (def.variants.length > 0 && !def.variants.some((v) => variants.includes(v))) return false;
  // The capsule return starts at the station: no launch vehicle, abort tower or launch site.
  if (mission === 'return') return !(['booster', 'upper', 'fairingA', 'fairingB', 'les', 'ground'] as BodyId[]).includes(def.body);
  // The suborbital stack is the booster alone with the research capsule (no interstage).
  if (OUTLINES[mission].stack === 'boosterOnly') return !(['upper', 'fairingA', 'fairingB', 'les', 'service', 'station'] as BodyId[]).includes(def.body) && part !== 'interstage';
  return true;
}

/** Every string inside a value (deep). */
function strings(value: unknown, path = ''): { path: string; text: string }[] {
  if (typeof value === 'string') return [{ path, text: value }];
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${path}[${i}]`));
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k));
  return [];
}

const entries = Object.values(LESSONS) as (PartLesson | PartNote)[];
const lessons = entries.filter(isPartLesson);
const cards = Object.values(PHASE_CARDS);
const sourceIds = new Set([...CORE_SOURCES, ...PART_SOURCES].map((s) => s.id));

const LESSON_TEXT_FIELDS = ['summary', 'where', 'function', 'how', 'why', 'environment', 'materialsWhy', 'manufacturing', 'inspection', 'misconception', 'ifAbsent'] as const;
const NOTE_TEXT_FIELDS = ['summary', 'function', 'why'] as const;
const CARD_TEXT_FIELDS = ['what', 'whyNow', 'forces', 'next'] as const;

// ---------- lessons ----------

describe('part lessons: coverage and contract', () => {
  it('has an entry for every PartId, and a full lesson exactly for the principal parts', () => {
    for (const id of PART_IDS) {
      const entry = LESSONS[id];
      expect(entry, id).toBeDefined();
      expect(entry!.id).toBe(id);
      expect(isPartLesson(entry!), `${id} principal=${PARTS[id].principal}`).toBe(PARTS[id].principal);
    }
    expect(Object.keys(LESSONS).length).toBe(PART_IDS.length);
    expect(lessonFor('turbopump')).toBe(LESSONS.turbopump);
    expect(fullLessonFor('igniter')).toBeUndefined();
    expect(fullLessonFor('engine')?.id).toBe('engine');
  });

  it('keeps each lesson in the file of its system, with no duplicates', () => {
    const seen = new Set<string>();
    for (const [system, group] of Object.entries(LESSON_GROUPS)) {
      for (const e of group) {
        expect(PARTS[e.id].system, e.id).toBe(system);
        expect(seen.has(e.id), `duplicate ${e.id}`).toBe(false);
        seen.add(e.id);
      }
    }
  });

  it('answers all seven questions and all three depths for every principal part', () => {
    for (const l of lessons) {
      for (const f of LESSON_TEXT_FIELDS) expect(l[f].trim().length, `${l.id}.${f}`).toBeGreaterThan(40);
      expect(l.depth.quick.trim().length, `${l.id}.depth.quick`).toBeGreaterThan(40);
      expect(l.depth.engineering.trim().length, `${l.id}.depth.engineering`).toBeGreaterThan(40);
      expect(l.depth.materials.trim().length, `${l.id}.depth.materials`).toBeGreaterThan(40);
      expect(l.connections.length, `${l.id}.connections`).toBeGreaterThan(0);
      expect(l.phases.length, `${l.id}.phases`).toBeGreaterThan(0);
      expect(l.sources.length, `${l.id}.sources`).toBeGreaterThan(0);
      expect(l.figures?.length ?? 0, `${l.id}.figures`).toBeGreaterThan(0);
    }
  });

  it('gives every figure a label and a value with a number', () => {
    for (const l of lessons) {
      for (const f of l.figures ?? []) {
        expect(f.label.trim().length, `${l.id} figure label`).toBeGreaterThan(0);
        expect(f.value, `${l.id} figure ${f.label}`).toMatch(/\d/);
      }
    }
  });

  it('completes every supporting-part note', () => {
    for (const e of entries.filter((x) => !isPartLesson(x))) {
      for (const f of NOTE_TEXT_FIELDS) expect(e[f].trim().length, `${e.id}.${f}`).toBeGreaterThan(40);
      expect(e.phases.length, `${e.id}.phases`).toBeGreaterThan(0);
      expect(e.sources.length, `${e.id}.sources`).toBeGreaterThan(0);
    }
  });

  it('uses exactly the canonical materials table (same materials, roles and inThisVehicle flags)', () => {
    for (const e of entries) {
      expect(e.materials, e.id).toEqual(ASSIGNMENTS[e.id] ?? []);
      for (const m of e.materials) expect(MATERIAL_IDS as readonly string[]).toContain(m.material);
    }
  });

  it('links only to parts that exist (no self-links, no repeats)', () => {
    for (const l of lessons) {
      const set = new Set<string>();
      for (const c of l.connections) {
        expect(isPartId(c), `${l.id} -> ${c}`).toBe(true);
        expect(c, `${l.id} links to itself`).not.toBe(l.id);
        expect(set.has(c), `${l.id} repeats ${c}`).toBe(false);
        set.add(c);
      }
    }
  });

  it('links only to mission phases that exist, in missions that carry the part', () => {
    for (const e of entries) {
      for (const link of e.phases) {
        expect(MISSION_ORDER, `${e.id}: mission ${link.mission}`).toContain(link.mission);
        expect(phasesOf(link.mission), `${e.id}: ${link.mission}:${link.phase}`).toContain(link.phase);
        expect(partFlies(e.id, link.mission), `${e.id} does not fly on ${link.mission}`).toBe(true);
        expect(link.note.trim().length, `${e.id}: note for ${link.mission}:${link.phase}`).toBeGreaterThan(10);
      }
    }
  });

  it('indexes the parts that point to a phase', () => {
    const atIgnition = partsLinkedToPhase('leo', 'ignition').map((x) => x.part);
    expect(atIgnition).toContain('s1-engine-cluster');
    expect(atIgnition).toContain('launch-mount');
    expect(partsLinkedToPhase('return', 'drogues').map((x) => x.part)).toContain('parachutes');
  });
});

// ---------- sources ----------

describe('sources', () => {
  it('cites only sources that exist', () => {
    for (const e of entries) for (const s of e.sources) expect(sourceIds.has(s), `${e.id} cites ${s}`).toBe(true);
    for (const s of entries.flatMap((e) => e.sources)) expect(allSources().some((x) => x.id === s), s).toBe(true);
  });

  it('defines each part source once, without shadowing a core source, and cites every one', () => {
    const ids = PART_SOURCES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    const core = new Set(CORE_SOURCES.map((s) => s.id));
    for (const id of ids) expect(core.has(id), `${id} duplicates a core source`).toBe(false);
    const cited = new Set(entries.flatMap((e) => e.sources));
    for (const id of ids) expect(cited.has(id), `${id} is never cited`).toBe(true);
  });

  it('describes every part source fully and honestly (reference only: nothing was opened)', () => {
    for (const s of PART_SOURCES) {
      expect(s.title.length, s.id).toBeGreaterThan(5);
      expect(s.publisher.length, s.id).toBeGreaterThan(2);
      expect(s.used.length, s.id).toBeGreaterThan(10);
      expect(s.url, s.id).toMatch(/^https:\/\/[^\s]+$/);
      expect(s.accessed, s.id).toBe('reference');
    }
  });
});

// ---------- phase cards ----------

describe('phase cards', () => {
  it('exist for every phase of every mission and branch, and nothing else', () => {
    let expected = 0;
    for (const m of MISSION_ORDER) {
      const ids = phasesOf(m);
      expected += ids.length;
      for (const p of ids) {
        const c = phaseCard(m, p);
        expect(c, `${m}:${p}`).toBeDefined();
        expect(c!.mission).toBe(m);
        expect(c!.phase).toBe(p);
      }
      // Cards per mission follow the outline order (main phases, then the branch).
      expect(MISSION_CARDS[m].map((c) => c.phase)).toEqual(ids);
    }
    expect(Object.keys(PHASE_CARDS).length).toBe(expected);
    for (const [key, c] of Object.entries(PHASE_CARDS)) expect(key).toBe(phaseCardKey(c.mission, c.phase));
  });

  it('answer the five questions with real text', () => {
    for (const c of cards) {
      for (const f of CARD_TEXT_FIELDS) expect(c[f].trim().length, `${c.mission}:${c.phase}.${f}`).toBeGreaterThan(40);
      if (c.equation) expect(['thrust', 'dynamic-pressure', 'rocket-equation', 'orbital-speed']).toContain(c.equation);
    }
  });

  it('list active parts that exist and fly on that mission', () => {
    for (const c of cards as PhaseCard[]) {
      expect(c.parts.length, `${c.mission}:${c.phase}`).toBeGreaterThan(0);
      expect(new Set(c.parts).size, `${c.mission}:${c.phase} repeats a part`).toBe(c.parts.length);
      for (const p of c.parts) {
        expect(isPartId(p), `${c.mission}:${c.phase} -> ${p}`).toBe(true);
        expect(partFlies(p, c.mission), `${p} does not fly on ${c.mission} (${c.phase})`).toBe(true);
      }
    }
  });
});

// ---------- writing rules ----------

describe('writing rules', () => {
  const all = [...strings(LESSONS, 'LESSONS'), ...strings(PHASE_CARDS, 'PHASE_CARDS'), ...strings(PART_SOURCES, 'PART_SOURCES')];

  it('contains no em dashes (U+2014) and no en dashes (U+2013)', () => {
    for (const s of all) {
      expect(s.text.includes('—'), `em dash in ${s.path}`).toBe(false);
      expect(s.text.includes('–'), `en dash in ${s.path}`).toBe(false);
    }
  });

  it('has no template slips (undefined, NaN, object dumps) or stray whitespace', () => {
    for (const s of all) {
      expect(s.text, s.path).not.toMatch(/undefined|NaN|\[object |Infinity/);
      expect(s.text, s.path).not.toMatch(/ {2}|^\s|\s$/);
    }
  });

  it('names no real launch vehicle, spacecraft or launch company in the interface text', () => {
    const banned = /\b(SpaceX|Falcon|Merlin|Raptor|Starship|Saturn|Apollo|Space Shuttle|Soyuz|Ariane|Atlas|Dragon|Orion|Blue Origin|New Glenn|Rocket Lab|Electron|ULA|Vulcan|Arianespace)\b/;
    for (const s of [...strings(LESSONS, 'LESSONS'), ...strings(PHASE_CARDS, 'PHASE_CARDS')]) expect(s.text, s.path).not.toMatch(banned);
  });
});
