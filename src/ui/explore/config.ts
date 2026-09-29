import { PARTS, type PartId } from '../../vehicle/parts';

/**
 * Whether a part exists on a hangar configuration: the satellite stack (with the recoverable
 * booster of the satellite mission) or the crew stack (as flown to the station, booster expended).
 */
export function inConfig(id: PartId, cfg: 'satellite' | 'capsule'): boolean {
  const v = PARTS[id].variants;
  if (!v.length) return true;
  return cfg === 'satellite' ? v.some((x) => x === 'satellite' || x === 'recovery') : v.some((x) => x === 'capsule' || x === 'expendable');
}
