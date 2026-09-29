import type { PartId } from '../../vehicle/parts';
import type { PartLesson, PartNote } from '../types';
/** Lessons for every part (principal: full PartLesson; supporting: PartNote). */
export const LESSONS: Partial<Record<PartId, PartLesson | PartNote>> = {};
