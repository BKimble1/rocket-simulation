/** All sources, merged (ids unique across lists; the first definition wins). */
import type { Source } from '../types';
import { CORE_SOURCES } from './core';
import { PART_SOURCES } from './parts';
import { MATERIAL_SOURCES } from './materials';

const ALL: Source[] = (() => {
  const seen = new Map<string, Source>();
  for (const s of [...CORE_SOURCES, ...PART_SOURCES, ...MATERIAL_SOURCES]) if (!seen.has(s.id)) seen.set(s.id, s);
  return [...seen.values()];
})();

export function allSources(): Source[] {
  return ALL;
}

export function sourceById(id: string): Source | undefined {
  return ALL.find((s) => s.id === id);
}
