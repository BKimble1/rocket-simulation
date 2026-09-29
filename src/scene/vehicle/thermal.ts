/**
 * Thermal lens: the qualitative temperature each part of the vehicle sees in operation, in five
 * classes (cryogenic, ambient, warm, hot, very hot). Every render mesh of the vehicle is tagged
 * `userData.thermal` (0..4) from these rules, and the lens recolours meshes by class.
 *
 * The classes are qualitative teaching categories, not measured temperatures: cryogenic parts
 * touch liquid oxygen (about 90 K) or helium chilled by it, warm parts see aerodynamic or
 * plume heating, hot parts sit in or next to the engine exhaust, very hot parts contain the
 * combustion gas itself (above about 1,000 K) or face entry heating.
 */
import type * as THREE from 'three';
import type { MaterialId } from '../../content/materials/ids';
import { STATIONS as S } from '../../vehicle/spec';

export type ThermalLevel = 0 | 1 | 2 | 3 | 4;

export interface ThermalClass {
  level: ThermalLevel;
  key: 'cryogenic' | 'ambient' | 'warm' | 'hot' | 'veryHot';
  label: string;
  /** One-line explanation for the legend (qualitative, illustrative). */
  detail: string;
  color: string;
}

/** Legend of the thermal lens, coldest first (index = level). */
export const THERMAL_LENS: readonly ThermalClass[] = [
  { level: 0, key: 'cryogenic', label: 'Cryogenic', detail: 'Touches liquid oxygen (about 90 K) or helium chilled by it', color: '#4f8fe0' },
  { level: 1, key: 'ambient', label: 'Ambient', detail: 'RP-1, electronics and most structure stay near room temperature', color: '#9ba1aa' },
  { level: 2, key: 'warm', label: 'Warm', detail: 'Aerodynamic heating in ascent or entry, or radiation from a nearby nozzle', color: '#e0b44a' },
  { level: 3, key: 'hot', label: 'Hot', detail: 'Engine bells, the engine bay and hot turbine hardware', color: '#e0662f' },
  { level: 4, key: 'veryHot', label: 'Very hot', detail: 'Holds combustion gas (above about 1,000 K) or faces entry heating', color: '#c33d2c' },
];

export const THERMAL_COLORS: readonly string[] = THERMAL_LENS.map((c) => c.color);

/**
 * A mesh that spans two thermal regions along the axis (the upper-stage tank barrel runs past the
 * common bulkhead: LOX above, RP-1 below). `level` applies above model-frame height `y`,
 * `below` under it; the lens shader splits the colour there. `userData.thermal` holds the colder.
 */
export interface ThermalSplit {
  y: number;
  below: ThermalLevel;
}

export interface ThermalTag {
  level: ThermalLevel;
  split?: ThermalSplit;
}

/** The exploded-view section a node belongs to ('' outside any section). */
export function sectionOf(o: THREE.Object3D): string {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p.name.startsWith('section:')) return p.name.slice(8);
  return '';
}

/** Engine internals (sub-part tags of the engine models and the baked booster cluster). */
function engineLevel(sub: string, mat: MaterialId | null, look: string): ThermalLevel | null {
  switch (sub) {
    case 'combustion-chamber':
    case 'gas-generator':
    case 'nozzle-extension':
      return 4;
    case 'injector':
      // the light engine models fold the chamber jacket into the injector assembly
      return /jacket|copper/.test(look) ? 4 : 3;
    case 'nozzle':
      return 3;
    case 'turbopump':
      // turbine side (nickel alloy) is hot; the pump casings stay near propellant temperature
      return mat === 'nickel-superalloy' ? 3 : 1;
    case 'main-valves':
    case 'tvc-actuators':
    case 'igniter':
    case 'engine':
      return 1;
  }
  return null;
}

/** Spacecraft hardware: by material first (thermal protection, thruster alloys), then part. */
function spacecraftLevel(part: string, mat: MaterialId | null, look: string): ThermalLevel {
  if (mat === 'ablator') return 4;
  if (mat === 'niobium-c103' || /niobium/.test(look)) return 4;
  if (part === 'heat-shield') return 3;
  if (part === 'backshell-tps' || mat === 'ceramic-tiles') return 3;
  if (mat === 'nickel-superalloy') return 3;
  if (part === 'apogee-engine') return 3;
  return 1;
}

/**
 * Thermal class of a render mesh.
 * @param part the mesh's part (the cluster's sub-part for the baked booster engines)
 * @param section exploded-view section id (context for shared part ids, e.g. forward skirt)
 * @param look the render material name (hints for engine and spacecraft internals)
 */
export function classifyThermal(part: string | null, mat: MaterialId | null, section: string, look: string, kind: string, fluid?: string): ThermalTag {
  if (kind === 'liquid') return { level: fluid === 'lox' ? 0 : 1 };
  switch (part) {
    case 's1-lox-tank':
      // the forward skirt shares the LOX tank's id but only carries the vent and the fins
      return { level: section === 'fwdskirt' ? 2 : 0 };
    case 'lox-downcomer':
      return { level: 0 };
    case 'pressurization':
      // helium bottles and lines inside the LOX tanks are chilled by the LOX
      return { level: section === 'lox' || section === 's2tanks' ? 0 : 1 };
    case 's2-tanks':
      return section === 's2tanks' ? { level: 0, split: { y: S.s2CommonBulkheadEquator, below: 1 } } : { level: 1 };
    case 'common-bulkhead':
      return { level: 1 };
    case 's1-fuel-tank':
    case 's1-intertank':
    case 'raceway':
    case 'landing-legs':
    case 'cold-gas-rcs':
    case 'booster-avionics':
    case 'avionics':
    case 's2-rcs':
    case 'payload-adapter':
      return { level: 1 };
    case 'interstage':
    case 'grid-fins':
    case 'fairing':
      return { level: 2 };
    case 'stage-separation':
      return { level: section === 'interstage' ? 2 : 1 };
    case 'thrust-structure':
    case 'base-heat-shield':
      return { level: 3 };
    case 'vacuum-engine':
    case 's1-engine-cluster':
      return { level: engineLevel(part, mat, look) ?? 3 };
  }
  const e = part ? engineLevel(part, mat, look) : null;
  if (e !== null && (section === 'engines' || section === 's2engine' || section === '')) return { level: e };
  if (section.startsWith('payload')) return { level: spacecraftLevel(part ?? '', mat, look) };
  if (e !== null) return { level: e };
  return { level: 1 };
}
