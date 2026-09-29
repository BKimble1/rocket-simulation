import type { MaterialEntry } from '../types';

/**
 * A materials entry as authored. `usedIn` is not written by hand: index.ts derives it from the
 * canonical ASSIGNMENTS table (partsUsing), so the materials index, the part lessons and the 3D
 * material tags cannot disagree.
 */
export type MaterialDraft = Omit<MaterialEntry, 'usedIn'>;
