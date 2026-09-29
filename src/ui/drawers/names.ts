import { PARTS, type PartId } from '../../vehicle/parts';
import { OUTLINES } from '../../timeline/missions/outline';
import { MATERIALS } from '../../content/materials';
import type { MissionId } from '../../timeline/types';

export const NAMES = {
  part: (id: PartId) => PARTS[id]?.label ?? id,
  mission: (id: MissionId, phase?: string) => {
    const o = OUTLINES[id];
    const ph = phase ? (o.phases.find((p) => p.id === phase) ?? o.branch?.phases.find((p) => p.id === phase)) : null;
    return ph ? `${o.short}: ${ph.title}` : o.short;
  },
  material: (id: string) => MATERIALS[id as keyof typeof MATERIALS]?.name ?? id,
};
