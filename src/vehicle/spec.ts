/**
 * The reference vehicle: KIMBLE K-1, a generic, educational two-stage LOX/RP-1 launch vehicle.
 *
 * One consistent dataset. Every dimension, mass and engine value used by the geometry, the
 * trajectory model, the telemetry and the lesson text comes from here, so they agree. The
 * values are ILLUSTRATIVE: chosen to be physically coherent with each other and with public
 * engineering principles (NASA Glenn Beginner's Guide, NASA Basics of Space Flight), not
 * copied from any proprietary vehicle. ACCURACY.md lists which are principles and which are
 * our selected assumptions.
 *
 * Units: metres, kilograms, newtons, seconds, pascals. Vehicle model frame: +Y along the
 * vehicle axis (nose up), origin on the axis at the first-stage nozzle exit plane.
 */

export const G0 = 9.80665; // standard gravity, m/s^2 (defines Isp in seconds)

/** Propellant properties used for volumes (near-boiling LOX, room-temperature RP-1). */
export const PROPELLANTS = {
  lox: { name: 'Liquid oxygen (LOX)', density: 1141, boilK: 90.2 },
  rp1: { name: 'RP-1 (rocket-grade kerosene)', density: 810, boilK: 490 },
} as const;

export interface EngineSpec {
  id: 'E-1' | 'E-1V';
  name: string;
  cycle: 'gas-generator';
  propellants: 'LOX/RP-1';
  /** Thrust at sea level (N); null for a vacuum-only engine. */
  thrustSL: number | null;
  thrustVac: number;
  ispSL: number | null;
  ispVac: number;
  /** Chamber pressure (Pa). */
  chamberPressure: number;
  /** Oxidizer-to-fuel mass ratio. */
  mixtureRatio: number;
  /** Nozzle area expansion ratio (exit area / throat area). */
  expansionRatio: number;
  throatDiameter: number;
  exitDiameter: number;
  /**
   * Overall engine length (m), from the top of the powerhead to the nozzle exit. For the E-1 the
   * gimbal point sits 2.3 m above the exit (STATIONS.s1Gimbal); for the E-1V it is 6.1 m above.
   */
  length: number;
  gimbalRangeDeg: number;
  /** Deepest stable throttle as a fraction of rated thrust. */
  minThrottle: number;
  /** Engine dry mass (kg). */
  mass: number;
  /** Turbopump shaft speed at rated thrust (rpm): illustrative order of magnitude. */
  pumpRpm: number;
  /** Gas generator share of total propellant flow (dumped overboard, why GG costs Isp). */
  ggFlowFraction: number;
  restartable: boolean;
}

/**
 * First-stage engine: sea-level nozzle, regeneratively cooled chamber and nozzle.
 *
 * Internally consistent nozzle numbers (ratio of specific heats 1.2, nozzle efficiency 0.975,
 * implied characteristic velocity c* = Pc * At / mdot = 1,746 m/s, typical of LOX/RP-1):
 * vacuum thrust = Cf * Pc * At with the ideal vacuum thrust coefficient for the expansion ratio;
 * sea-level thrust = vacuum thrust - p0 * Ae (101,325 Pa on the exit area). A test checks it.
 */
export const E1: EngineSpec = {
  id: 'E-1',
  name: 'E-1 sea-level engine',
  cycle: 'gas-generator',
  propellants: 'LOX/RP-1',
  thrustSL: 744e3,
  thrustVac: 835e3,
  ispSL: 278,
  ispVac: 312,
  chamberPressure: 8.5e6,
  mixtureRatio: 2.3,
  expansionRatio: 16,
  throatDiameter: 0.267,
  exitDiameter: 1.068,
  length: 2.55,
  gimbalRangeDeg: 5,
  minThrottle: 0.55,
  mass: 540,
  pumpRpm: 32000,
  ggFlowFraction: 0.03,
  restartable: true,
};

/**
 * Upper-stage engine: the SAME core as the E-1 (same injector, chamber, 0.267 m throat, 8.5 MPa,
 * turbopump and gas generator, about 272 kg/s of propellant) with a large radiatively cooled
 * nozzle extension (expansion ratio 110) for vacuum, which raises the vacuum thrust and specific
 * impulse. Restartable (TEA-TEB igniter cartridges, see ACCURACY.md).
 */
export const E1V: EngineSpec = {
  id: 'E-1V',
  name: 'E-1V vacuum engine',
  cycle: 'gas-generator',
  propellants: 'LOX/RP-1',
  thrustSL: null,
  thrustVac: 910e3,
  ispSL: null,
  ispVac: 342,
  chamberPressure: 8.5e6,
  mixtureRatio: 2.3,
  expansionRatio: 110,
  throatDiameter: 0.267,
  exitDiameter: 2.8,
  length: 6.1,
  gimbalRangeDeg: 4,
  minThrottle: 0.6,
  mass: 690,
  pumpRpm: 32000,
  ggFlowFraction: 0.03,
  restartable: true,
};

export const BODY_DIAMETER = 3.7;
export const BODY_RADIUS = BODY_DIAMETER / 2;
/** Ellipsoidal tank domes with a height of R/sqrt(2) (a common structural choice). */
export const DOME_HEIGHT = BODY_RADIUS / Math.SQRT2;

/** Axial stations (m above the first-stage nozzle exit plane). */
export const STATIONS = {
  s1NozzleExit: 0,
  s1HeatShield: 1.3,
  s1Gimbal: 2.3,
  s1ThrustSectionTop: 4.3,
  s1FuelAftApex: 4.3,
  s1FuelAftEquator: 4.3 + DOME_HEIGHT,
  s1FuelFwdEquator: 15.68,
  s1FuelFwdApex: 15.68 + DOME_HEIGHT,
  s1LoxAftApex: 17.3,
  s1LoxAftEquator: 17.3 + DOME_HEIGHT,
  s1LoxFwdEquator: 36.18,
  s1LoxFwdApex: 36.18 + DOME_HEIGHT,
  s1ForwardSkirtTop: 37.9,
  gridFins: 37.15,
  interstageTop: 44.4, // stage separation plane
  s2NozzleExit: 38.6,
  s2Gimbal: 44.7,
  s2AftSkirtTop: 46.2,
  s2FuelAftApex: 45.9,
  s2FuelAftEquator: 45.9 + DOME_HEIGHT,
  s2CommonBulkheadEquator: 49.9,
  s2CommonBulkheadApex: 49.9 - DOME_HEIGHT,
  s2LoxFwdEquator: 52.54,
  s2LoxFwdApex: 52.54 + DOME_HEIGHT,
  s2ForwardSkirtTop: 53.9, // payload interface plane
  payloadAdapterTop: 54.8,
  fairingBase: 53.9,
  fairingBoatTailTop: 54.5,
  fairingCylinderTop: 61.0,
  fairingTip: 67.0,
} as const;

export const FAIRING = {
  diameter: 4.0,
  /** Carbon-fibre face sheets over an aluminium honeycomb core (m). */
  faceSheet: 0.0012,
  core: 0.025,
  mass: 1800,
};

export interface StageSpec {
  id: 's1' | 's2';
  name: string;
  engine: EngineSpec;
  engineCount: number;
  /** Structural (dry) mass including engines (kg). */
  dry: number;
  /** Usable propellant at full load (kg). */
  propellant: number;
  lox: number;
  rp1: number;
  length: number;
}

const split = (total: number, mr: number) => ({ lox: (total * mr) / (1 + mr), rp1: total / (1 + mr) });

export const S1: StageSpec = {
  id: 's1',
  name: 'First stage (booster)',
  engine: E1,
  engineCount: 7,
  dry: 25500,
  propellant: 330000,
  ...split(330000, E1.mixtureRatio),
  length: STATIONS.interstageTop,
};

export const S2: StageSpec = {
  id: 's2',
  name: 'Upper stage',
  engine: E1V,
  engineCount: 1,
  dry: 4600,
  propellant: 75000,
  ...split(75000, E1V.mixtureRatio),
  length: STATIONS.s2ForwardSkirtTop - STATIONS.interstageTop,
};

/** Tank volumes implied by the loads above (m^3), with 3 % ullage. */
export function tankVolume(massKg: number, prop: keyof typeof PROPELLANTS): number {
  return (massKg / PROPELLANTS[prop].density) * 1.03;
}

/** First-stage engine layout: one centre engine and a ring of six (plan-view x, z in m). */
export const S1_ENGINE_LAYOUT: { id: string; x: number; z: number; centre: boolean }[] = [
  { id: 'e0', x: 0, z: 0, centre: true },
  ...Array.from({ length: 6 }, (_, i) => {
    const a = (i * Math.PI) / 3 + Math.PI / 6;
    return { id: `e${i + 1}`, x: 1.2 * Math.cos(a), z: 1.2 * Math.sin(a), centre: false };
  }),
];

/** Landing legs (recovery variant): four, stowed against the aft skirt. */
export const LEGS = { count: 4, hingeY: 1.5, stowedLength: 9.0, deployedAngleDeg: 118, footprintRadius: 9.2, mass: 2100 };
/** Grid fins (recovery variant): four titanium lattice fins stowed flat against the forward skirt. */
export const GRID_FINS = { count: 4, width: 1.5, height: 1.2, hingeY: STATIONS.gridFins, maxDeflectionDeg: 20 };

/** Payload configurations carried by the same two-stage vehicle. */
export const PAYLOADS = {
  leoSat: { id: 'leoSat', name: 'Earth-observation satellite', mass: 6200 },
  gtoSat: { id: 'gtoSat', name: 'Geostationary communications satellite', mass: 3600 },
  lunarProbe: { id: 'lunarProbe', name: 'Lunar flyby probe', mass: 1400 },
  capsule: { id: 'capsule', name: 'Crew capsule with service module', mass: 12400 },
  researchCapsule: { id: 'researchCapsule', name: 'Suborbital research capsule', mass: 4200 },
} as const;
export type PayloadId = keyof typeof PAYLOADS;

/** Crew capsule and service module (station delivery and capsule return lessons). */
export const CAPSULE = {
  baseDiameter: 3.9,
  height: 3.3,
  /** Backshell cone half-angle (deg). */
  sidewallDeg: 25,
  heatShieldThickness: 0.06,
  heatShieldRadius: 4.6, // spherical-section radius of the heat shield
  mass: 8300, // with crew/cargo, at entry
  drogues: 2,
  mains: 3,
  mainDiameter: 35,
  drogueDiameter: 7,
};
export const SERVICE_MODULE = { diameter: 3.7, length: 3.2, mass: 4100, engineThrust: 27e3, ispVac: 316, propellants: 'NTO/MMH' };
export const ABORT_TOWER = { length: 7.9, mass: 5400, motorThrust: 1.8e6 };

export const VEHICLE = {
  name: 'KIMBLE K-1',
  description: 'Generic educational two-stage LOX/RP-1 launch vehicle with a reusable first stage',
  S1,
  S2,
  E1,
  E1V,
  FAIRING,
  STATIONS,
};
