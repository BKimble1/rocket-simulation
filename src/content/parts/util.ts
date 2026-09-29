/** Small helpers shared by the lesson files. */
import type { PartId } from '../../vehicle/parts';
import type { MissionId } from '../../timeline/types';
import type { MaterialUse, PartLesson, PartNote, PhaseLink } from '../types';
import { ASSIGNMENTS } from '../materials/assignments';

/**
 * A part's materials, taken from the canonical assignment table (never retyped), so the lesson,
 * the 3D model tags and the materials index cannot disagree. Parts without an entry get [].
 */
export const mats = (id: PartId): MaterialUse[] => (ASSIGNMENTS[id] ?? []).map((m) => ({ ...m }));

/** A phase where the part matters, with the one-line reason. */
export const at = (mission: MissionId, phase: string, note: string): PhaseLink => ({ mission, phase, note });

/** Identity helpers that keep each entry's type explicit. */
export const lesson = (l: PartLesson): PartLesson => l;
export const note = (n: PartNote): PartNote => n;

/** True for a full seven-question lesson (principal parts), false for a supporting-part note. */
export function isPartLesson(entry: PartLesson | PartNote): entry is PartLesson {
  return 'how' in entry && 'depth' in entry;
}
