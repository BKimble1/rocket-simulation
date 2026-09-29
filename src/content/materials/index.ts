/**
 * The materials index: one MaterialEntry per MATERIAL_IDS entry.
 *
 * `usedIn` is derived from the canonical ASSIGNMENTS table (partsUsing), keeping only the uses
 * in this illustrative vehicle, so the Materials view, the part lessons and the 3D material tags
 * always agree. Uses marked inThisVehicle=false (documented alternatives shown for comparison)
 * are available separately through comparisonUses().
 */
import type { PartId } from '../../vehicle/parts';
import type { MaterialEntry } from '../types';
import { partsUsing } from './assignments';
import type { MaterialDraft } from './draft';
import { MATERIAL_IDS, type MaterialId } from './ids';
import { AL_2219, AL_LI, GRCOP, NICKEL_SUPERALLOY, NIOBIUM_C103, STAINLESS, TITANIUM } from './metals';
import { CFRP_COPV, CFRP_SANDWICH, HONEYCOMB_CORE, TEXTILES } from './composites';
import { ABLATOR, CERAMIC_TILES, CRYO_FOAM, MLI } from './thermal';
import { REFRACTORY_CONCRETE, STRUCTURAL_STEEL } from './ground';

const DRAFTS: Record<MaterialId, MaterialDraft> = {
  'al-li': AL_LI,
  'al-2219': AL_2219,
  stainless: STAINLESS,
  grcop: GRCOP,
  'nickel-superalloy': NICKEL_SUPERALLOY,
  'niobium-c103': NIOBIUM_C103,
  titanium: TITANIUM,
  'cfrp-sandwich': CFRP_SANDWICH,
  'cfrp-copv': CFRP_COPV,
  ablator: ABLATOR,
  'ceramic-tiles': CERAMIC_TILES,
  mli: MLI,
  'cryo-foam': CRYO_FOAM,
  'honeycomb-core': HONEYCOMB_CORE,
  textiles: TEXTILES,
  'structural-steel': STRUCTURAL_STEEL,
  'refractory-concrete': REFRACTORY_CONCRETE,
};

/** Parts that use a material in this illustrative vehicle, with their roles (from ASSIGNMENTS). */
export function inVehicleUses(id: MaterialId): { part: PartId; role: string }[] {
  return partsUsing(id)
    .filter((u) => u.inThisVehicle)
    .map(({ part, role }) => ({ part, role }));
}

/** Documented alternatives shown on a part for comparison only (inThisVehicle=false in ASSIGNMENTS). */
export function comparisonUses(id: MaterialId): { part: PartId; role: string }[] {
  return partsUsing(id)
    .filter((u) => !u.inThisVehicle)
    .map(({ part, role }) => ({ part, role }));
}

/** The materials index (complete: every MaterialId has an entry). */
export const MATERIALS: Record<MaterialId, MaterialEntry> = Object.fromEntries(
  MATERIAL_IDS.map((id) => {
    const d = DRAFTS[id];
    const entry: MaterialEntry = { ...d, usedIn: inVehicleUses(id) };
    return [id, entry];
  }),
) as Record<MaterialId, MaterialEntry>;

/** Entries in the canonical MATERIAL_IDS order (for lists). */
export function materialList(): MaterialEntry[] {
  return MATERIAL_IDS.map((id) => MATERIALS[id]);
}
