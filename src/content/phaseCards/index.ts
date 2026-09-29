/**
 * Mission phase cards: one card per phase of every mission and of every branch in `OUTLINES`,
 * answering What is happening? Why now? Which parts are active? What forces or environment
 * matter? What enables the next phase? Keys are `${mission}:${phase}`; branch phases use the
 * mission id too (e.g. `leo:boostback`). `src/content/parts/parts.test.ts` checks the coverage, the
 * listed parts against each phase's timeline `activeParts`, and the writing rules.
 */
import type { MissionId } from '../../timeline/types';
import type { PhaseCard } from '../types';
import { LEO_CARDS } from './leo';
import { SUBORBITAL_CARDS } from './suborbital';
import { GTO_CARDS } from './gto';
import { STATION_CARDS } from './station';
import { RETURN_CARDS } from './capsuleReturn';
import { LUNAR_CARDS } from './lunar';

/** The key of a phase card. */
export const phaseCardKey = (mission: MissionId, phase: string): string => `${mission}:${phase}`;

/** The cards of each mission, in outline order (main phases, then branch phases). */
export const MISSION_CARDS: Record<MissionId, PhaseCard[]> = {
  leo: LEO_CARDS,
  suborbital: SUBORBITAL_CARDS,
  gto: GTO_CARDS,
  station: STATION_CARDS,
  return: RETURN_CARDS,
  lunar: LUNAR_CARDS,
};

/** Phase cards for every mission phase and branch phase (key: `${mission}:${phase}`). */
export const PHASE_CARDS: Record<string, PhaseCard> = Object.fromEntries(
  Object.values(MISSION_CARDS)
    .flat()
    .map((c) => [phaseCardKey(c.mission, c.phase), c]),
);

/** The card for a mission phase (main or branch), if any. */
export function phaseCard(mission: MissionId, phase: string): PhaseCard | undefined {
  return PHASE_CARDS[phaseCardKey(mission, phase)];
}
