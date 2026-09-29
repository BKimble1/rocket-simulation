/**
 * Mission builder: computes a mission's reference timeline once, when the mission is opened.
 *
 * The trajectories come from a simplified point-mass model with authored guidance (see
 * timeline/physics/craft.ts): deterministic, bit-identical for the same input, no randomness,
 * no clocks. Each mission builder lives in timeline/missions/<id>.ts.
 */
import type { MissionId, MissionTimeline } from './types';
import { buildLeo } from './missions/leo';

const BUILDERS: Partial<Record<MissionId, () => MissionTimeline>> = {
  leo: buildLeo,
};

export function buildMission(id: MissionId): MissionTimeline {
  const b = BUILDERS[id];
  if (!b) throw new Error(`buildMission: unknown mission ${id}`);
  return b();
}

export { telemetryAt } from './physics/telemetry';
