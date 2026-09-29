/**
 * The vehicle part graph: stable component IDs shared by the 3D model (render nodes are
 * tagged with these IDs), the lesson content, the materials index, the mission events and the
 * knowledge checks. Nothing else invents part names.
 */

/** Rigid bodies that can move independently once separated (each has its own mission track). */
export type BodyId =
  | 'booster' // first stage + interstage (+ legs, grid fins)
  | 'upper' // upper stage + payload adapter
  | 'fairingA'
  | 'fairingB'
  | 'satellite' // LEO satellite, GTO satellite or lunar probe (per mission variant)
  | 'capsule'
  | 'service'
  | 'les'
  | 'station'
  | 'ground';

export type SystemId = 'propulsion' | 'fluids' | 'structures' | 'guidance' | 'separation' | 'payload' | 'recovery' | 'thermal' | 'ground';

export const SYSTEMS: Record<SystemId, { name: string; color: string }> = {
  propulsion: { name: 'Propulsion', color: '#e0662f' },
  fluids: { name: 'Propellant & pressurization', color: '#2f7fe0' },
  structures: { name: 'Structures', color: '#7a8190' },
  guidance: { name: 'Guidance & avionics', color: '#16875a' },
  separation: { name: 'Separation systems', color: '#b0417f' },
  payload: { name: 'Payload & spacecraft', color: '#6a5af9' },
  recovery: { name: 'Recovery & return', color: '#c28a12' },
  thermal: { name: 'Thermal protection', color: '#c33d2c' },
  ground: { name: 'Launch site', color: '#5b6572' },
};

/** Vehicle configurations of the one K-1 family. */
export type Variant = 'satellite' | 'capsule' | 'suborbital' | 'recovery' | 'expendable';

export const PART_IDS = [
  // first stage: propulsion
  's1-engine-cluster',
  'engine',
  'turbopump',
  'gas-generator',
  'injector',
  'combustion-chamber',
  'nozzle',
  'main-valves',
  'tvc-actuators',
  'igniter',
  // first stage: fluids & structure
  's1-lox-tank',
  's1-fuel-tank',
  'lox-downcomer',
  'pressurization',
  's1-intertank',
  'thrust-structure',
  'base-heat-shield',
  'raceway',
  'interstage',
  // recovery hardware (first stage)
  'grid-fins',
  'landing-legs',
  'cold-gas-rcs',
  'booster-avionics',
  // separation
  'stage-separation',
  // upper stage
  'vacuum-engine',
  'nozzle-extension',
  's2-tanks',
  'common-bulkhead',
  'avionics',
  's2-rcs',
  // payload & fairing
  'payload-adapter',
  'fairing',
  'satellite-bus',
  'solar-arrays',
  'antenna',
  'attitude-thrusters',
  'mli-blankets',
  'apogee-engine',
  // capsule family
  'capsule',
  'heat-shield',
  'backshell-tps',
  'parachutes',
  'docking-system',
  'service-module',
  'launch-abort-system',
  // other spacecraft
  'station',
  // launch site
  'launch-mount',
  'service-tower',
  'flame-deflector',
  'sound-suppression',
] as const;

export type PartId = (typeof PART_IDS)[number];

export interface PartDef {
  id: PartId;
  name: string;
  /** Short plain label for 3D callouts and lists. */
  label: string;
  body: BodyId;
  system: SystemId;
  /** Configurations that carry this part (empty: all). */
  variants: Variant[];
  /** The assembly this is a sub-part of (engine internals belong to 'engine'). */
  parent?: PartId;
  /** Principal components must answer the full seven-question lesson contract. */
  principal: boolean;
  /** Search keywords (aliases, abbreviations). */
  keywords: string[];
}

const p = (
  id: PartId,
  name: string,
  label: string,
  body: BodyId,
  system: SystemId,
  opts: Partial<Pick<PartDef, 'variants' | 'parent' | 'principal' | 'keywords'>> = {},
): PartDef => ({ id, name, label, body, system, variants: opts.variants ?? [], parent: opts.parent, principal: opts.principal ?? true, keywords: opts.keywords ?? [] });

export const PARTS: Record<PartId, PartDef> = Object.fromEntries(
  [
    p('s1-engine-cluster', 'First-stage engine cluster (7 × E-1)', 'Engine cluster', 'booster', 'propulsion', { keywords: ['engines', 'octaweb', 'cluster'] }),
    p('engine', 'E-1 gas-generator engine', 'E-1 engine', 'booster', 'propulsion', { parent: 's1-engine-cluster', keywords: ['rocket engine', 'liquid engine', 'gas generator cycle'] }),
    p('turbopump', 'Turbopump', 'Turbopump', 'booster', 'propulsion', { parent: 'engine', keywords: ['pump', 'turbine', 'shaft', 'impeller', 'inducer'] }),
    p('gas-generator', 'Gas generator and turbine exhaust', 'Gas generator', 'booster', 'propulsion', { parent: 'engine', keywords: ['GG', 'preburner', 'turbine drive', 'exhaust duct'] }),
    p('injector', 'Injector', 'Injector', 'booster', 'propulsion', { parent: 'engine', keywords: ['pintle', 'injector plate', 'impinging', 'faceplate'] }),
    p('combustion-chamber', 'Combustion chamber and throat', 'Chamber', 'booster', 'propulsion', { parent: 'engine', keywords: ['thrust chamber', 'throat', 'liner', 'regenerative cooling'] }),
    p('nozzle', 'Nozzle and regenerative cooling channels', 'Nozzle', 'booster', 'propulsion', { parent: 'engine', keywords: ['bell', 'expansion', 'de laval', 'cooling channels', 'regen'] }),
    p('main-valves', 'Main propellant valves', 'Main valves', 'booster', 'fluids', { parent: 'engine', keywords: ['MOV', 'MFV', 'valve', 'shutoff'] }),
    p('tvc-actuators', 'Gimbal and thrust-vector-control actuators', 'TVC actuators', 'booster', 'guidance', { parent: 'engine', keywords: ['gimbal', 'TVC', 'steering', 'hydraulic actuator', 'thrust vector'] }),
    p('igniter', 'Hypergolic igniter (TEA-TEB)', 'Igniter', 'booster', 'propulsion', { parent: 'engine', principal: false, keywords: ['TEA-TEB', 'ignition', 'green flash', 'restart'] }),
    p('s1-lox-tank', 'First-stage liquid-oxygen tank', 'LOX tank', 'booster', 'fluids', { keywords: ['oxidizer tank', 'LOX', 'oxygen'] }),
    p('s1-fuel-tank', 'First-stage RP-1 fuel tank', 'RP-1 tank', 'booster', 'fluids', { keywords: ['kerosene', 'fuel tank', 'RP-1'] }),
    p('lox-downcomer', 'LOX downcomer (feed line through the fuel tank)', 'LOX downcomer', 'booster', 'fluids', { keywords: ['feed line', 'tunnel', 'feedline'] }),
    p('pressurization', 'Helium pressurization system (COPVs)', 'Pressurization', 'booster', 'fluids', { keywords: ['helium', 'COPV', 'ullage pressure', 'pressurant'] }),
    p('s1-intertank', 'Intertank', 'Intertank', 'booster', 'structures', { keywords: ['between tanks', 'structure'] }),
    p('thrust-structure', 'Thrust structure', 'Thrust structure', 'booster', 'structures', { keywords: ['thrust frame', 'engine mount', 'octaweb'] }),
    p('base-heat-shield', 'Base heat shield', 'Base heat shield', 'booster', 'thermal', { principal: false, keywords: ['aft heat shield', 'engine bay', 'recirculation'] }),
    p('raceway', 'External raceway (cables and pressurant lines)', 'Raceway', 'booster', 'structures', { principal: false, keywords: ['wiring', 'conduit', 'cable tunnel'] }),
    p('interstage', 'Interstage', 'Interstage', 'booster', 'structures', { keywords: ['adapter', 'composite'] }),
    p('grid-fins', 'Grid fins', 'Grid fins', 'booster', 'recovery', { variants: ['recovery'], keywords: ['lattice fins', 'fins', 'aero control'] }),
    p('landing-legs', 'Landing legs', 'Landing legs', 'booster', 'recovery', { variants: ['recovery'], keywords: ['legs', 'touchdown', 'crush core'] }),
    p('cold-gas-rcs', 'Cold-gas reaction control thrusters (booster)', 'Booster RCS', 'booster', 'recovery', { variants: ['recovery'], keywords: ['nitrogen thrusters', 'attitude control', 'flip'] }),
    p('booster-avionics', 'Booster flight computers and navigation', 'Booster avionics', 'booster', 'guidance', { variants: ['recovery'], principal: false, keywords: ['booster computer', 'recovery guidance', 'IMU', 'GNSS'] }),
    p('stage-separation', 'Stage separation system', 'Stage separation', 'booster', 'separation', { keywords: ['pneumatic pushers', 'separation collet', 'staging', 'release'] }),
    p('vacuum-engine', 'E-1V vacuum engine', 'E-1V engine', 'upper', 'propulsion', { keywords: ['upper stage engine', 'vacuum', 'MVac'] }),
    p('nozzle-extension', 'Radiatively cooled nozzle extension', 'Nozzle extension', 'upper', 'thermal', { keywords: ['niobium', 'radiation cooled', 'skirt'] }),
    p('s2-tanks', 'Upper-stage tanks', 'Upper-stage tanks', 'upper', 'fluids', { keywords: ['second stage tank'] }),
    p('common-bulkhead', 'Common bulkhead', 'Common bulkhead', 'upper', 'structures', { keywords: ['shared dome', 'bulkhead', 'honeycomb'] }),
    p('avionics', 'Guidance, navigation and flight computers', 'Avionics', 'upper', 'guidance', { keywords: ['IMU', 'GNSS', 'GPS', 'flight computer', 'navigation', 'guidance', 'control'] }),
    p('s2-rcs', 'Upper-stage attitude control and settling thrusters', 'Upper-stage RCS', 'upper', 'fluids', { principal: false, keywords: ['ullage', 'settling', 'ACS', 'coast'] }),
    p('payload-adapter', 'Payload adapter and clamp band', 'Payload adapter', 'upper', 'separation', { keywords: ['PAF', 'clamp band', 'marman', 'separation springs'] }),
    p('fairing', 'Payload fairing (two halves)', 'Fairing', 'fairingA', 'structures', { variants: ['satellite'], keywords: ['nose cone', 'shroud', 'fairing halves', 'sandwich'] }),
    p('satellite-bus', 'Satellite bus', 'Satellite', 'satellite', 'payload', { variants: ['satellite'], keywords: ['spacecraft', 'bus', 'payload'] }),
    p('solar-arrays', 'Solar arrays', 'Solar arrays', 'satellite', 'payload', { variants: ['satellite', 'capsule'], keywords: ['solar panels', 'power', 'wings'] }),
    p('antenna', 'Communications antenna', 'Antenna', 'satellite', 'payload', { variants: ['satellite'], keywords: ['dish', 'radio', 'downlink', 'reflector'] }),
    p('attitude-thrusters', 'Spacecraft attitude thrusters and reaction wheels', 'Attitude control', 'satellite', 'payload', { variants: ['satellite', 'capsule', 'suborbital'], keywords: ['RCS', 'reaction wheels', 'hydrazine', 'thrusters'] }),
    p('mli-blankets', 'Multilayer insulation blankets', 'MLI blankets', 'satellite', 'thermal', { variants: ['satellite', 'capsule'], keywords: ['MLI', 'gold foil', 'thermal blanket', 'kapton'] }),
    p('apogee-engine', 'Satellite apogee engine', 'Apogee engine', 'satellite', 'propulsion', { variants: ['satellite'], principal: false, keywords: ['liquid apogee engine', 'circularization', 'LAE'] }),
    p('capsule', 'Crew capsule (pressure vessel)', 'Capsule', 'capsule', 'payload', { variants: ['capsule', 'suborbital'], keywords: ['crew module', 'pressure vessel', 'cabin'] }),
    p('heat-shield', 'Ablative heat shield', 'Heat shield', 'capsule', 'thermal', { variants: ['capsule', 'suborbital'], keywords: ['ablator', 'PICA', 'Avcoat', 'entry'] }),
    p('backshell-tps', 'Backshell thermal protection (reusable ceramic tiles)', 'Backshell tiles', 'capsule', 'thermal', { variants: ['capsule', 'suborbital'], keywords: ['tiles', 'ceramic', 'reusable TPS'] }),
    p('parachutes', 'Drogue and main parachutes', 'Parachutes', 'capsule', 'recovery', { variants: ['capsule', 'suborbital'], keywords: ['drogue', 'mains', 'reefing', 'splashdown'] }),
    p('docking-system', 'Docking system', 'Docking system', 'capsule', 'payload', { variants: ['capsule'], keywords: ['docking port', 'soft capture', 'hard capture', 'hatch'] }),
    p('service-module', 'Service module', 'Service module', 'service', 'propulsion', { variants: ['capsule'], keywords: ['SM', 'deorbit engine', 'radiators', 'propulsion module'] }),
    p('launch-abort-system', 'Launch abort tower', 'Abort tower', 'les', 'recovery', { variants: ['capsule'], keywords: ['LES', 'escape tower', 'abort motor'] }),
    p('station', 'Orbital station (docking target)', 'Station', 'station', 'payload', { variants: ['capsule'], principal: false, keywords: ['space station', 'ISS-like', 'target'] }),
    p('launch-mount', 'Launch mount and hold-down clamps', 'Hold-downs', 'ground', 'ground', { keywords: ['hold down', 'launch table', 'clamps', 'release'] }),
    p('service-tower', 'Service tower and umbilicals', 'Service tower', 'ground', 'ground', { keywords: ['umbilical', 'tower', 'crew access arm', 'propellant loading'] }),
    p('flame-deflector', 'Flame trench and deflector', 'Flame deflector', 'ground', 'ground', { principal: false, keywords: ['flame trench', 'plume', 'deflector'] }),
    p('sound-suppression', 'Sound-suppression water deluge', 'Water deluge', 'ground', 'ground', { principal: false, keywords: ['deluge', 'acoustic', 'water'] }),
  ].map((d) => [d.id, d]),
) as Record<PartId, PartDef>;

export function isPartId(s: string | null | undefined): s is PartId {
  return !!s && (PART_IDS as readonly string[]).includes(s);
}

/** Direct children of a part (engine internals under 'engine', etc.). */
export function childrenOf(id: PartId): PartDef[] {
  return PART_IDS.map((k) => PARTS[k]).filter((d) => d.parent === id);
}
