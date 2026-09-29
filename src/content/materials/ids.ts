/** Material families and examples taught in the Materials view (see content/materials). */
export const MATERIAL_IDS = [
  'al-li',
  'al-2219',
  'stainless',
  'grcop',
  'nickel-superalloy',
  'niobium-c103',
  'titanium',
  'cfrp-sandwich',
  'cfrp-copv',
  'ablator',
  'ceramic-tiles',
  'mli',
  'cryo-foam',
  'honeycomb-core',
] as const;
export type MaterialId = (typeof MATERIAL_IDS)[number];
