/** Follow a content link (part, demo, mission phase, material) from anywhere. */
import { useApp } from '../../state/store';
import { openMissionAt } from '../nav';
import { startDemo, DEMOS } from '../../scene/demos';
import type { DemoId } from '../../content/types';
import type { PartId } from '../../vehicle/parts';
import type { MissionId } from '../../timeline/types';

export type LinkTarget = { part: PartId } | { demo: DemoId } | { mission: MissionId; phase?: string } | { material: string };

export function goTo(t: LinkTarget) {
  const app = useApp.getState();
  if ('part' in t) app.go('explore', { part: t.part, lens: 'systems' });
  else if ('demo' in t) {
    app.go('explore', { part: DEMOS[t.demo]?.frame ?? null, lens: 'systems' });
    setTimeout(() => startDemo(t.demo), 400);
  } else if ('mission' in t) openMissionAt(t.mission, t.phase ?? null);
  else if ('material' in t) app.go('explore', { lens: 'materials', material: t.material, part: null });
}

export function linkLabel(t: LinkTarget, names: { part: (id: PartId) => string; mission: (id: MissionId, phase?: string) => string; material: (id: string) => string }): string {
  if ('part' in t) return names.part(t.part);
  if ('demo' in t) return DEMOS[t.demo]?.title ?? t.demo;
  if ('mission' in t) return names.mission(t.mission, t.phase);
  return names.material(t.material);
}
