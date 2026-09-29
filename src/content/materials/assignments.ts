/**
 * Canonical material assignments for the illustrative K-1 (and the comparison examples).
 * The 3D model tags meshes with these, the part lessons cite them, and the materials index
 * lists them: one table, so the three cannot disagree. inThisVehicle=false marks a documented
 * alternative shown for comparison only.
 */
import type { PartId } from '../../vehicle/parts';
import type { MaterialId } from './ids';
import type { MaterialUse } from '../types';

const u = (material: MaterialId, role: string, inThisVehicle = true): MaterialUse => ({ material, role, inThisVehicle });

export const ASSIGNMENTS: Partial<Record<PartId, MaterialUse[]>> = {
  's1-lox-tank': [
    u('al-li', 'Barrel walls: machined orthogrid panels, friction-stir welded'),
    u('al-2219', 'Domes: spin-formed and welded gores'),
    u('stainless', 'Alternative: some documented designs build cryogenic tanks from stainless steel', false),
    u('cryo-foam', 'Not used on this booster (short hold before launch, frost forms); documented on long-duration cryogenic stages', false),
  ],
  's1-fuel-tank': [u('al-li', 'Barrel walls'), u('al-2219', 'Domes')],
  's2-tanks': [u('al-li', 'Barrel walls'), u('al-2219', 'Forward and aft domes')],
  'common-bulkhead': [u('al-2219', 'Two dome skins'), u('honeycomb-core', 'Insulating core between the skins (keeps RP-1 from getting too cold next to LOX)')],
  'lox-downcomer': [u('al-2219', 'Welded feed duct with flexible bellows joints'), u('stainless', 'Bellows and flanges')],
  pressurization: [u('cfrp-copv', 'Composite overwrap on helium bottles (COPVs)'), u('titanium', 'COPV liners and high-pressure lines')],
  's1-intertank': [u('al-li', 'Skin-stringer panels'), u('al-2219', 'Ring frames')],
  'thrust-structure': [u('al-2219', 'Machined and welded thrust frame'), u('titanium', 'Engine mount fittings')],
  'base-heat-shield': [u('nickel-superalloy', 'Engine-bay heat shield panels'), u('ceramic-tiles', 'Insulating blanket layer (flexible ceramic insulation)')],
  raceway: [u('al-2219', 'Formed cover')],
  interstage: [u('cfrp-sandwich', 'Carbon-fibre face sheets over aluminium honeycomb core')],
  'grid-fins': [u('titanium', 'Single-piece lattice fins that tolerate entry heating without ablative coating')],
  'landing-legs': [u('cfrp-sandwich', 'Carbon-fibre leg struts with aluminium honeycomb'), u('al-2219', 'Crushable honeycomb in the foot pads (energy absorption)')],
  'cold-gas-rcs': [u('titanium', 'Nitrogen thruster valves and lines'), u('cfrp-copv', 'Nitrogen storage bottles')],
  'stage-separation': [u('al-2219', 'Separation collets and pusher housings'), u('stainless', 'Pneumatic pusher rods')],
  engine: [u('grcop', 'Combustion chamber liner'), u('nickel-superalloy', 'Turbine, gas generator, manifolds'), u('stainless', 'Lines and nozzle cooling tubes')],
  'combustion-chamber': [u('grcop', 'Liner with milled coolant channels (high conductivity)'), u('nickel-superalloy', 'Structural outer jacket (closeout)')],
  nozzle: [u('stainless', 'Brazed coolant tubes forming the bell'), u('nickel-superalloy', 'Manifolds and hatbands')],
  injector: [u('stainless', 'Faceplate and element rings'), u('nickel-superalloy', 'Baffles in hot regions')],
  turbopump: [u('nickel-superalloy', 'Turbine wheel and blades, turbine housing'), u('al-2219', 'LOX pump housing (oxygen-compatible)'), u('titanium', 'Fuel impeller (strength to weight)')],
  'gas-generator': [u('nickel-superalloy', 'Combustor and turbine exhaust duct')],
  'main-valves': [u('stainless', 'Valve bodies'), u('nickel-superalloy', 'Seats in the hot-side valves')],
  'tvc-actuators': [u('stainless', 'Hydraulic actuator rods and cylinders')],
  igniter: [u('stainless', 'Hypergolic igniter cartridge and lines')],
  'vacuum-engine': [u('grcop', 'Chamber liner'), u('niobium-c103', 'Nozzle extension'), u('nickel-superalloy', 'Turbomachinery')],
  'nozzle-extension': [u('niobium-c103', 'Radiatively cooled extension with a silicide oxidation coating')],
  avionics: [u('al-2219', 'Avionics shelf and enclosures'), u('cfrp-sandwich', 'Equipment panels')],
  's2-rcs': [u('titanium', 'Thruster valves and lines'), u('cfrp-copv', 'Nitrogen bottles')],
  'payload-adapter': [u('cfrp-sandwich', 'Conical adapter shell'), u('al-2219', 'Clamp-band rings')],
  fairing: [u('cfrp-sandwich', 'Two halves: carbon-fibre face sheets on aluminium honeycomb core'), u('honeycomb-core', 'Aluminium honeycomb core that carries shear between the face sheets')],
  'satellite-bus': [u('cfrp-sandwich', 'Structure panels'), u('mli', 'Thermal blankets'), u('al-2219', 'Primary structure cone')],
  'solar-arrays': [u('cfrp-sandwich', 'Array substrate panels')],
  antenna: [u('cfrp-sandwich', 'Reflector: low thermal distortion')],
  'attitude-thrusters': [u('titanium', 'Propellant tank and lines'), u('nickel-superalloy', 'Thruster chambers')],
  'mli-blankets': [u('mli', 'Many thin aluminised polyimide layers separated by netting')],
  'apogee-engine': [u('niobium-c103', 'Radiatively cooled chamber and nozzle')],
  capsule: [u('al-li', 'Welded pressure vessel'), u('titanium', 'Window frames and attach fittings')],
  'heat-shield': [u('ablator', 'Charring ablator in a honeycomb carrier'), u('cfrp-sandwich', 'Carrier structure behind the ablator')],
  'backshell-tps': [u('ceramic-tiles', 'Reusable silica tiles on the backshell (lower heating than the shield)'), u('ablator', 'Alternative: some documented capsules use ablative backshells', false)],
  parachutes: [u('textiles', 'Nylon canopies; aramid risers and reefing lines')],
  'docking-system': [u('al-2219', 'Docking ring and latches'), u('stainless', 'Hooks and springs')],
  'service-module': [u('al-2219', 'Primary structure'), u('mli', 'Thermal blankets'), u('titanium', 'Propellant tanks')],
  'launch-abort-system': [u('cfrp-sandwich', 'Tower fairing and nose'), u('nickel-superalloy', 'Abort motor nozzles')],
  'launch-mount': [u('stainless', 'Hold-down clamp mechanisms')],
  'flame-deflector': [u('stainless', 'Water-cooled steel deflector plates')],
};

/** Parts that use a material in this vehicle (the reverse index). */
export function partsUsing(material: MaterialId): { part: PartId; role: string; inThisVehicle: boolean }[] {
  const out: { part: PartId; role: string; inThisVehicle: boolean }[] = [];
  for (const [part, uses] of Object.entries(ASSIGNMENTS) as [PartId, MaterialUse[]][]) for (const m of uses) if (m.material === material) out.push({ part, role: m.role, inThisVehicle: m.inThisVehicle });
  return out;
}
