/**
 * Part lessons: a full seven-question `PartLesson` for every principal part in `PARTS` and a
 * shorter `PartNote` for every supporting part. The entries live in one file per system and are
 * merged here; `parts.test.ts` checks coverage, the materials table, links, sources and the
 * writing rules.
 */
import type { PartId } from '../../vehicle/parts';
import type { MissionId } from '../../timeline/types';
import type { PartLesson, PartNote } from '../types';
import { PROPULSION } from './propulsion';
import { FLUIDS } from './fluids';
import { STRUCTURES } from './structures';
import { GUIDANCE } from './guidance';
import { SEPARATION } from './separation';
import { RECOVERY } from './recovery';
import { THERMAL } from './thermal';
import { PAYLOAD } from './payload';
import { GROUND } from './ground';
import { isPartLesson } from './util';

export { isPartLesson } from './util';
export { PROPULSION } from './propulsion';
export { FLUIDS } from './fluids';
export { STRUCTURES } from './structures';
export { GUIDANCE } from './guidance';
export { SEPARATION } from './separation';
export { RECOVERY } from './recovery';
export { THERMAL } from './thermal';
export { PAYLOAD } from './payload';
export { GROUND } from './ground';
/** Numbers derived from spec.ts that the lessons quote (raw values and formatted strings). */
export { D as PART_NUMBERS, F as PART_FIGURES, fmt } from './derived';

/** The lesson files, grouped by the part's system (as in `PARTS[id].system`). */
export const LESSON_GROUPS = {
  propulsion: PROPULSION,
  fluids: FLUIDS,
  structures: STRUCTURES,
  guidance: GUIDANCE,
  separation: SEPARATION,
  recovery: RECOVERY,
  thermal: THERMAL,
  payload: PAYLOAD,
  ground: GROUND,
} as const;

/** Lessons for every part (principal: full PartLesson; supporting: PartNote). */
export const LESSONS: Partial<Record<PartId, PartLesson | PartNote>> = Object.fromEntries(
  Object.values(LESSON_GROUPS)
    .flat()
    .map((entry) => [entry.id, entry]),
) as Partial<Record<PartId, PartLesson | PartNote>>;

/** The lesson or note for a part. */
export function lessonFor(id: PartId): PartLesson | PartNote | undefined {
  return LESSONS[id];
}

/** The full lesson for a principal part (undefined for supporting parts). */
export function fullLessonFor(id: PartId): PartLesson | undefined {
  const entry = LESSONS[id];
  return entry && isPartLesson(entry) ? entry : undefined;
}

/**
 * Reverse index: the parts whose lessons point to a mission phase, with the one-line reason.
 * Used to list "parts that matter here" beside a phase card.
 */
export function partsLinkedToPhase(mission: MissionId, phase: string): { part: PartId; note: string }[] {
  const out: { part: PartId; note: string }[] = [];
  for (const entry of Object.values(LESSONS)) {
    if (!entry) continue;
    for (const link of entry.phases) if (link.mission === mission && link.phase === phase) out.push({ part: entry.id, note: link.note });
  }
  return out;
}
