/**
 * Numbers derived from the reference dataset (`src/vehicle/spec.ts`, `src/world/*`) and quoted
 * in the part lessons and phase cards. They are computed here, not typed into the prose, so the
 * text follows the dataset if it changes. `derived.test.ts` recomputes the headline values
 * independently.
 *
 * Every value is either a dataset value, a direct consequence of dataset values (sums,
 * products, the ideal rocket equation, two-body orbital mechanics, ideal isentropic nozzle
 * flow), or an estimate whose assumptions are stated where it is used. None of them is a
 * measured value of a real vehicle.
 */
import { ABORT_TOWER, BODY_DIAMETER, CAPSULE, DOME_HEIGHT, E1, E1V, FAIRING, G0, GRID_FINS, LEGS, PAYLOADS, PROPELLANTS, S1, S2, S1_ENGINE_LAYOUT, SERVICE_MODULE, STATIONS, tankVolume } from '../../vehicle/spec';
import { MOON_DISTANCE, MOON_PERIOD, MU_EARTH, MU_MOON, OMEGA_EARTH, R_EARTH, SITE } from '../../world/frames';
import { LANDING_ZONE, PAD } from '../../world/site';

/** Format a number with comma thousands separators and a fixed number of decimals. */
export function fmt(n: number, digits = 0): string {
  const s = Math.abs(n).toFixed(digits);
  const [int, frac] = s.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (n < 0 && Number(s) !== 0 ? '-' : '') + grouped + (frac ? `.${frac}` : '');
}

/** Round to a number of significant figures (for estimates that should not look precise). */
export function sig(n: number, figures: number): number {
  if (n === 0) return 0;
  const p = Math.pow(10, figures - Math.ceil(Math.log10(Math.abs(n))));
  return Math.round(n * p) / p;
}

const deg = Math.PI / 180;

/** Ideal rocket equation: velocity change (m/s) for an Isp (s) and a mass ratio. */
export const idealDv = (isp: number, m0: number, mf: number) => isp * G0 * Math.log(m0 / mf);

/** Circular orbital speed (m/s) at an altitude above the spherical Earth. */
export const circularSpeed = (alt: number) => Math.sqrt(MU_EARTH / (R_EARTH + alt));

/** Orbital period (s) for a semi-major axis. */
export const period = (a: number) => 2 * Math.PI * Math.sqrt(a ** 3 / MU_EARTH);

/** Vis-viva speed (m/s) at radius r on an orbit with semi-major axis a. */
export const visViva = (r: number, a: number) => Math.sqrt(MU_EARTH * (2 / r - 1 / a));

/** Ideal (isentropic, frozen) nozzle flow for a specific-heat ratio gamma. */
function areaRatioAtMach(m: number, g: number): number {
  return (1 / m) * ((2 / (g + 1)) * (1 + ((g - 1) / 2) * m * m)) ** ((g + 1) / (2 * (g - 1)));
}
export function exitMach(expansionRatio: number, g = 1.2): number {
  let lo = 1.0001;
  let hi = 25;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (areaRatioAtMach(mid, g) < expansionRatio) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
/** Exit-to-chamber pressure ratio of an ideal nozzle. */
export function exitPressureRatio(expansionRatio: number, g = 1.2): number {
  const m = exitMach(expansionRatio, g);
  return (1 + ((g - 1) / 2) * m * m) ** (-g / (g - 1));
}
/** Ideal thrust coefficient (thrust / (chamber pressure x throat area)) at an ambient/chamber pressure ratio. */
export function thrustCoefficient(expansionRatio: number, ambientOverChamber: number, g = 1.2): number {
  const pe = expansionRatio <= 1 ? (2 / (g + 1)) ** (g / (g - 1)) : exitPressureRatio(expansionRatio, g);
  const eps = Math.max(1, expansionRatio);
  const momentum = Math.sqrt(((2 * g * g) / (g - 1)) * (2 / (g + 1)) ** ((g + 1) / (g - 1)) * (1 - pe ** ((g - 1) / g)));
  return momentum + (pe - ambientOverChamber) * eps;
}

const SEA_LEVEL_PRESSURE = 101325; // Pa, US Standard Atmosphere 1976
const SEA_LEVEL_DENSITY = 1.225; // kg/m^3, US Standard Atmosphere 1976
const STEFAN_BOLTZMANN = 5.670374419e-8; // W/(m^2 K^4)

const disk = (d: number) => (Math.PI * d * d) / 4;

// ---- engines ----
const e1Mdot = E1.thrustVac / (E1.ispVac * G0);
const e1Lox = (e1Mdot * E1.mixtureRatio) / (1 + E1.mixtureRatio);
const e1Fuel = e1Mdot / (1 + E1.mixtureRatio);
const e1vMdot = E1V.thrustVac / (E1V.ispVac * G0);
const e1ExitArea = disk(E1.exitDiameter);
const e1ThroatArea = disk(E1.throatDiameter);
const e1vExitArea = disk(E1V.exitDiameter);
/** Chamber diameter about 1.7 x the throat (illustrative proportion used by the engine model). */
const e1ChamberDiameter = 1.7 * E1.throatDiameter;
/** Pump power estimate: volumetric flow x pressure rise / efficiency (illustrative discharge pressures). */
const LOX_PUMP_RISE = 12e6;
const FUEL_PUMP_RISE = 14e6;
const PUMP_EFFICIENCY = 0.7;
const pumpPower = ((e1Lox / PROPELLANTS.lox.density) * LOX_PUMP_RISE + (e1Fuel / PROPELLANTS.rp1.density) * FUEL_PUMP_RISE) / PUMP_EFFICIENCY;

// ---- masses (kg) ----
const s1Gross = S1.dry + S1.propellant;
const s2Gross = S2.dry + S2.propellant;
const liftoffMass = {
  leo: s1Gross + s2Gross + PAYLOADS.leoSat.mass + FAIRING.mass,
  gto: s1Gross + s2Gross + PAYLOADS.gtoSat.mass + FAIRING.mass,
  lunar: s1Gross + s2Gross + PAYLOADS.lunarProbe.mass + FAIRING.mass,
  station: s1Gross + s2Gross + PAYLOADS.capsule.mass + ABORT_TOWER.mass,
};
const s1ThrustSL = S1.engineCount * (E1.thrustSL ?? 0);
const s1ThrustVac = S1.engineCount * E1.thrustVac;
const s1Mdot = S1.engineCount * e1Mdot;

// ---- ideal velocity changes, LEO configuration (fairing dropped at staging for simplicity) ----
const leoS1 = idealDv(E1.ispVac, liftoffMass.leo, liftoffMass.leo - S1.propellant);
const leoS2 = idealDv(E1V.ispVac, s2Gross + PAYLOADS.leoSat.mass, S2.dry + PAYLOADS.leoSat.mass);
const leoS2WithE1 = idealDv(E1.ispVac, s2Gross + PAYLOADS.leoSat.mass, S2.dry + PAYLOADS.leoSat.mass);
const leoS2CarryingBooster = idealDv(E1V.ispVac, s2Gross + PAYLOADS.leoSat.mass + S1.dry, S2.dry + PAYLOADS.leoSat.mass + S1.dry);
const leoS2CarryingFairing = idealDv(E1V.ispVac, s2Gross + PAYLOADS.leoSat.mass + FAIRING.mass, S2.dry + PAYLOADS.leoSat.mass + FAIRING.mass);
const capS2 = idealDv(E1V.ispVac, s2Gross + PAYLOADS.capsule.mass, S2.dry + PAYLOADS.capsule.mass);
const capS2WithTower = idealDv(E1V.ispVac, s2Gross + PAYLOADS.capsule.mass + ABORT_TOWER.mass, S2.dry + PAYLOADS.capsule.mass + ABORT_TOWER.mass);

/** Payload lost (kg) per 100 kg added to a stage's dry mass, at fixed total ideal velocity change (LEO). */
function payloadTrade(stage: 's1' | 's2'): number {
  const total = (p: number, s1dry: number, s2dry: number) => {
    const m0 = s1dry + S1.propellant + s2dry + S2.propellant + p + FAIRING.mass;
    return idealDv(E1.ispVac, m0, m0 - S1.propellant) + idealDv(E1V.ispVac, s2dry + S2.propellant + p, s2dry + p);
  };
  const base = total(PAYLOADS.leoSat.mass, S1.dry, S2.dry);
  let lo = 0;
  let hi = PAYLOADS.leoSat.mass * 2;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const dv = stage === 's1' ? total(mid, S1.dry + 100, S2.dry) : total(mid, S1.dry, S2.dry + 100);
    if (dv > base) lo = mid;
    else hi = mid;
  }
  return PAYLOADS.leoSat.mass - (lo + hi) / 2;
}

// ---- orbits ----
const LEO_ALT = 400e3;
const PARKING_ALT = 200e3;
const GEO_ALT = 35_786e3;
const leoSpeed = circularSpeed(LEO_ALT);
const leoPeriod = period(R_EARTH + LEO_ALT);
const parkingSpeed = circularSpeed(PARKING_ALT);
const gtoA = (2 * R_EARTH + PARKING_ALT + GEO_ALT) / 2;
const gtoPerigeeSpeed = visViva(R_EARTH + PARKING_ALT, gtoA);
const gtoApogeeSpeed = visViva(R_EARTH + GEO_ALT, gtoA);
const geoSpeed = circularSpeed(GEO_ALT);
const incl = SITE.lat * deg;
const circPlane = Math.sqrt(gtoApogeeSpeed ** 2 + geoSpeed ** 2 - 2 * gtoApogeeSpeed * geoSpeed * Math.cos(incl));
const phasingAlt = 225e3; // mean of the ~200 x 250 km insertion orbit
const phasingPeriod = period(R_EARTH + phasingAlt);
const deorbitDv = 100;
const deorbitPerigee = (() => {
  const r = R_EARTH + LEO_ALT;
  const v = leoSpeed - deorbitDv;
  const a = 1 / (2 / r - (v * v) / MU_EARTH);
  return 2 * a - r - R_EARTH;
})();
const tliA = (R_EARTH + PARKING_ALT + MOON_DISTANCE) / 2;
const tliSpeed = visViva(R_EARTH + PARKING_ALT, tliA);
const escapeSpeed = Math.sqrt((2 * MU_EARTH) / (R_EARTH + PARKING_ALT));
const moonSpeed = (2 * Math.PI * MOON_DISTANCE) / MOON_PERIOD;
const soiRadius = MOON_DISTANCE * (MU_MOON / MU_EARTH) ** 0.4;
const eclipseFraction = (2 * Math.asin(R_EARTH / (R_EARTH + LEO_ALT))) / (2 * Math.PI);

// ---- capsule and recovery ----
const ENTRY_SPEED = 7700; // m/s, near-orbital entry from a 400 km orbit (the timeline computes the actual value)
const capsuleKE = 0.5 * CAPSULE.mass * ENTRY_SPEED ** 2;
const MAIN_CD = 0.8; // drag coefficient on nominal canopy area (estimate)
const mainArea = disk(CAPSULE.mainDiameter);
const descentSpeed = (n: number) => Math.sqrt((2 * CAPSULE.mass * G0) / (SEA_LEVEL_DENSITY * MAIN_CD * n * mainArea));
const CAPSULE_CD = 1.3; // blunt body, heat shield first
const noChuteSpeed = Math.sqrt((2 * CAPSULE.mass * G0) / (SEA_LEVEL_DENSITY * CAPSULE_CD * disk(CAPSULE.baseDiameter)));
const smMdot = SERVICE_MODULE.engineThrust / (SERVICE_MODULE.ispVac * G0);
const smDeorbitProp = PAYLOADS.capsule.mass * (1 - Math.exp(-deorbitDv / (SERVICE_MODULE.ispVac * G0)));

// ---- geometry ----
const ringRadius = Math.hypot(S1_ENGINE_LAYOUT[1].x, S1_ENGINE_LAYOUT[1].z);
const neighbourSpacing = 2 * ringRadius * Math.sin(Math.PI / 6);

/** Raw derived values (SI unless the name says otherwise). */
export const D = {
  e1Mdot,
  e1Lox,
  e1Fuel,
  e1vMdot,
  e1ExitArea,
  e1ThroatArea,
  e1vExitArea,
  e1ChamberForce: E1.chamberPressure * disk(e1ChamberDiameter),
  e1VeSL: (E1.ispSL ?? 0) * G0,
  e1VeVac: E1.ispVac * G0,
  e1ThrustToWeight: (E1.thrustSL ?? 0) / (E1.mass * G0),
  e1Rps: E1.pumpRpm / 60,
  e1GgFlow: E1.ggFlowFraction * e1Mdot,
  s1GgFlow: S1.engineCount * E1.ggFlowFraction * e1Mdot,
  pumpPower,
  e1ExitPressure: exitPressureRatio(E1.expansionRatio) * E1.chamberPressure,
  e1vExitPressure: exitPressureRatio(E1V.expansionRatio) * E1V.chamberPressure,
  /** Fraction of thrust lost with a sonic exit (no diverging section), sea level and vacuum. */
  noDivergingLossSL: 1 - thrustCoefficient(1, SEA_LEVEL_PRESSURE / E1.chamberPressure) / thrustCoefficient(E1.expansionRatio, SEA_LEVEL_PRESSURE / E1.chamberPressure),
  noDivergingLossVac: 1 - thrustCoefficient(1, 0) / thrustCoefficient(E1.expansionRatio, 0),
  s1ThrustSL,
  s1ThrustVac,
  s1Mdot,
  s1LoxFlow: S1.engineCount * e1Lox,
  s1LoxVolumeFlow: (S1.engineCount * e1Lox) / PROPELLANTS.lox.density,
  s1VolumeFlow: (S1.engineCount * e1Lox) / PROPELLANTS.lox.density + (S1.engineCount * e1Fuel) / PROPELLANTS.rp1.density,
  s1FullThrustBurn: S1.propellant / s1Mdot,
  s2FullThrustBurn: S2.propellant / e1vMdot,
  sideForcePerEngine: (E1.thrustSL ?? 0) * Math.sin(E1.gimbalRangeDeg * deg),
  sideForceCluster: S1.engineCount * (E1.thrustSL ?? 0) * Math.sin(E1.gimbalRangeDeg * deg),
  gimbalExitSwing: (STATIONS.s1Gimbal - STATIONS.s1NozzleExit) * Math.sin(E1.gimbalRangeDeg * deg),
  nozzleLipGap: neighbourSpacing - E1.exitDiameter,
  ringRadius,
  landingThrustMin: E1.minThrottle * (E1.thrustSL ?? 0),
  landingTWDry: (E1.minThrottle * (E1.thrustSL ?? 0)) / (S1.dry * G0),
  boosterDryWeight: S1.dry * G0,
  radiatedAt1500K: STEFAN_BOLTZMANN * 1500 ** 4,
  // masses and ratios
  liftoffMass,
  liftoffTW: { leo: s1ThrustSL / (liftoffMass.leo * G0), station: s1ThrustSL / (liftoffMass.station * G0) },
  holdDownNet: s1ThrustSL - liftoffMass.leo * G0,
  liftoffAccel: (s1ThrustSL - liftoffMass.leo * G0) / liftoffMass.leo,
  sixEngineTW: ((S1.engineCount - 1) / S1.engineCount) * (s1ThrustSL / (liftoffMass.leo * G0)),
  s2IgnitionTW: {
    leo: E1V.thrustVac / ((s2Gross + PAYLOADS.leoSat.mass + FAIRING.mass) * G0),
    gto: E1V.thrustVac / ((s2Gross + PAYLOADS.gtoSat.mass + FAIRING.mass) * G0),
    lunar: E1V.thrustVac / ((s2Gross + PAYLOADS.lunarProbe.mass + FAIRING.mass) * G0),
  },
  s2EndAccelLeo: E1V.thrustVac / (S2.dry + PAYLOADS.leoSat.mass),
  s1LoxVolume: tankVolume(S1.lox, 'lox'),
  s1Rp1Volume: tankVolume(S1.rp1, 'rp1'),
  s2LoxVolume: tankVolume(S2.lox, 'lox'),
  s2Rp1Volume: tankVolume(S2.rp1, 'rp1'),
  heliumDensityRatio: 293 / PROPELLANTS.lox.boilK,
  pressureFedRatio: 10e6 / 0.3e6,
  sandwichStiffnessRatio: (3 * (FAIRING.core + FAIRING.faceSheet) ** 2) / (4 * FAIRING.faceSheet ** 2),
  // lengths from the stations
  s1FuelTankLength: STATIONS.s1FuelFwdApex - STATIONS.s1FuelAftApex,
  s1LoxTankLength: STATIONS.s1LoxFwdApex - STATIONS.s1LoxAftApex,
  intertankLength: STATIONS.s1LoxAftEquator - STATIONS.s1FuelFwdEquator,
  s2TankLength: STATIONS.s2LoxFwdApex - STATIONS.s2FuelAftApex,
  interstageLength: STATIONS.interstageTop - STATIONS.s1ForwardSkirtTop,
  nozzleInsideInterstage: STATIONS.interstageTop - STATIONS.s2NozzleExit,
  nozzleClearance: STATIONS.s2NozzleExit - STATIONS.s1ForwardSkirtTop,
  downcomerLength: STATIONS.s1LoxAftApex - STATIONS.s1ThrustSectionTop,
  /** Aluminium contracts about 0.4 % from room temperature to LOX temperature (NIST data). */
  downcomerContraction: 0.004 * (STATIONS.s1LoxAftApex - STATIONS.s1ThrustSectionTop),
  fairingLength: STATIONS.fairingTip - STATIONS.fairingBase,
  domeHeight: DOME_HEIGHT,
  adapterHeight: STATIONS.payloadAdapterTop - STATIONS.s2ForwardSkirtTop,
  // ideal velocity changes
  leoS1,
  leoS2,
  leoS2WithE1Loss: leoS2 - leoS2WithE1,
  leoS2CarryingBoosterLoss: leoS2 - leoS2CarryingBooster,
  leoS2CarryingFairingLoss: leoS2 - leoS2CarryingFairing,
  towerCarriedLoss: capS2 - capS2WithTower,
  tradeS1: payloadTrade('s1'),
  tradeS2: payloadTrade('s2'),
  // orbits
  leoSpeed,
  leoPeriodMin: leoPeriod / 60,
  orbitsPerDay: 86400 / leoPeriod,
  eclipseMin: (eclipseFraction * leoPeriod) / 60,
  gravityAt400: (R_EARTH / (R_EARTH + LEO_ALT)) ** 2,
  gravityAt100: (R_EARTH / (R_EARTH + 100e3)) ** 2,
  earthRotationSpeed: OMEGA_EARTH * R_EARTH * Math.cos(incl),
  parkingSpeed,
  gtoPerigeeSpeed,
  gtoInjectionDv: gtoPerigeeSpeed - parkingSpeed,
  gtoApogeeSpeed,
  geoSpeed,
  circularizeDv: geoSpeed - gtoApogeeSpeed,
  circularizePlaneDv: circPlane,
  gtoHalfPeriodH: period(gtoA) / 2 / 3600,
  phasingPeriodMin: phasingPeriod / 60,
  phasingGainDeg: 360 * (1 - phasingPeriod / leoPeriod),
  deorbitDv,
  deorbitPerigee,
  tliSpeed,
  tliDv: tliSpeed - parkingSpeed,
  escapeSpeed,
  moonSpeed,
  soiRadius,
  // capsule
  entrySpeed: ENTRY_SPEED,
  capsuleKE,
  capsuleKEperKg: 0.5 * ENTRY_SPEED ** 2,
  capsuleTNT: capsuleKE / 4.184e9,
  mainArea,
  mainsTotalArea: CAPSULE.mains * mainArea,
  descentThree: descentSpeed(CAPSULE.mains),
  descentTwo: descentSpeed(CAPSULE.mains - 1),
  noChuteSpeed,
  smMdot,
  smDeorbitProp,
  smDeorbitBurn: smDeorbitProp / smMdot,
  lesTW: ABORT_TOWER.motorThrust / ((CAPSULE.mass + ABORT_TOWER.mass) * G0),
  crewHatchHeight: PAD.nozzleExitHeight + 58.3,
  landingZoneDistance: Math.hypot(LANDING_ZONE.x, LANDING_ZONE.z),
  xBandWavelength: 299_792_458 / 8.4e9,
  suborbitalFreeFall: 2 * Math.sqrt((2 * 35e3) / (G0 * (R_EARTH / (R_EARTH + 100e3)) ** 2)),
  gridFinArea: GRID_FINS.width * GRID_FINS.height,
  legsFractionOfDry: LEGS.mass / S1.dry,
};

const kN = (n: number) => `${fmt(n / 1e3)} kN`;
const kms = (n: number, d = 2) => `${fmt(n / 1e3, d)} km/s`;

/** Formatted strings with units, used verbatim in the text. */
export const F = {
  // engines
  e1ThrustSL: kN(E1.thrustSL ?? 0),
  e1ThrustVac: kN(E1.thrustVac),
  e1IspSL: `${E1.ispSL} s`,
  e1IspVac: `${E1.ispVac} s`,
  e1Pc: `${fmt(E1.chamberPressure / 1e6, 1)} MPa`,
  mr: fmt(E1.mixtureRatio, 1),
  e1Eps: fmt(E1.expansionRatio),
  e1Throat: `${fmt(E1.throatDiameter, 2)} m`,
  e1Exit: `${fmt(E1.exitDiameter, 2)} m`,
  e1Length: `${fmt(E1.length, 2)} m`,
  e1Mass: `${fmt(E1.mass)} kg`,
  e1Gimbal: `±${fmt(E1.gimbalRangeDeg)}°`,
  e1MinThrottle: `${fmt(E1.minThrottle * 100)} %`,
  rpm: `${fmt(E1.pumpRpm)} rpm`,
  rps: `${fmt(D.e1Rps)} revolutions per second`,
  ggFraction: `${fmt(E1.ggFlowFraction * 100)} %`,
  e1Mdot: `${fmt(D.e1Mdot)} kg/s`,
  e1Lox: `${fmt(D.e1Lox)} kg/s`,
  e1Fuel: `${fmt(D.e1Fuel)} kg/s`,
  e1GgFlow: `${fmt(D.e1GgFlow, 1)} kg/s`,
  s1GgFlow: `${fmt(D.s1GgFlow)} kg/s`,
  e1ExitArea: `${fmt(D.e1ExitArea, 2)} m²`,
  e1ThroatArea: `${fmt(D.e1ThroatArea, 3)} m²`,
  e1ChamberForce: `${fmt(D.e1ChamberForce / 1e6, 1)} MN`,
  e1VeSL: `${fmt(sig(D.e1VeSL, 3))} m/s`,
  e1VeVac: `${fmt(sig(D.e1VeVac, 3))} m/s`,
  e1TW: fmt(D.e1ThrustToWeight),
  pumpPower: `${fmt(D.pumpPower / 1e6)} MW`,
  e1ExitPressure: `${fmt(sig(D.e1ExitPressure / 1e3, 1))} kPa`,
  e1vExitPressure: `${fmt(sig(D.e1vExitPressure / 1e3, 1))} kPa`,
  noDivergingLossSL: `${fmt(sig(D.noDivergingLossSL * 100, 2))} %`,
  noDivergingLossVac: `${fmt(sig(D.noDivergingLossVac * 100, 2))} %`,
  e1vThrust: kN(E1V.thrustVac),
  e1vIsp: `${E1V.ispVac} s`,
  e1vEps: fmt(E1V.expansionRatio),
  e1vThroat: `${fmt(E1V.throatDiameter, 2)} m`,
  e1vExit: `${fmt(E1V.exitDiameter, 2)} m`,
  e1vLength: `${fmt(E1V.length, 1)} m`,
  e1vMass: `${fmt(E1V.mass)} kg`,
  e1vGimbal: `±${fmt(E1V.gimbalRangeDeg)}°`,
  e1vMinThrottle: `${fmt(E1V.minThrottle * 100)} %`,
  e1vMdot: `${fmt(D.e1vMdot)} kg/s`,
  e1vExitArea: `${fmt(D.e1vExitArea, 2)} m²`,
  s2FullThrustBurn: `${fmt(D.s2FullThrustBurn)} s`,
  // first stage
  engines: fmt(S1.engineCount),
  s1ThrustSL: kN(D.s1ThrustSL),
  s1ThrustVac: kN(D.s1ThrustVac),
  s1Mdot: `${fmt(D.s1Mdot)} kg/s`,
  s1LoxFlow: `${fmt(D.s1LoxFlow)} kg/s`,
  s1LoxVolumeFlow: `${fmt(D.s1LoxVolumeFlow, 2)} m³/s`,
  s1VolumeFlow: `${fmt(D.s1VolumeFlow, 1)} m³/s`,
  s1FullThrustBurn: `${fmt(D.s1FullThrustBurn)} s`,
  s1Dry: `${fmt(S1.dry)} kg`,
  s1Prop: `${fmt(S1.propellant)} kg`,
  s1Lox: `${fmt(S1.lox)} kg`,
  s1Rp1: `${fmt(S1.rp1)} kg`,
  s1LoxVolume: `${fmt(D.s1LoxVolume)} m³`,
  s1Rp1Volume: `${fmt(D.s1Rp1Volume)} m³`,
  s2Dry: `${fmt(S2.dry)} kg`,
  s2Prop: `${fmt(S2.propellant)} kg`,
  s2Lox: `${fmt(sig(S2.lox, 3))} kg`,
  s2Rp1: `${fmt(sig(S2.rp1, 3))} kg`,
  s2LoxVolume: `${fmt(D.s2LoxVolume, 1)} m³`,
  s2Rp1Volume: `${fmt(D.s2Rp1Volume, 1)} m³`,
  loxDensity: `${fmt(PROPELLANTS.lox.density)} kg/m³`,
  rp1Density: `${fmt(PROPELLANTS.rp1.density)} kg/m³`,
  loxBoil: `${fmt(PROPELLANTS.lox.boilK, 1)} K (${fmt(PROPELLANTS.lox.boilK - 273.15)} °C)`,
  loxShare: `${fmt((S1.lox / S1.propellant) * 100)} %`,
  diameter: `${fmt(BODY_DIAMETER, 1)} m`,
  ringRadius: `${fmt(D.ringRadius, 1)} m`,
  nozzleLipGap: `${fmt(D.nozzleLipGap * 100)} cm`,
  gimbalExitSwing: `${fmt(D.gimbalExitSwing * 100)} cm`,
  sideForcePerEngine: kN(D.sideForcePerEngine),
  sideForceCluster: kN(D.sideForceCluster),
  liftoffMassLeo: `${fmt(sig(D.liftoffMass.leo / 1e3, 3))} t`,
  liftoffMassGto: `${fmt(sig(D.liftoffMass.gto / 1e3, 3))} t`,
  liftoffMassLunar: `${fmt(sig(D.liftoffMass.lunar / 1e3, 3))} t`,
  liftoffMassStation: `${fmt(sig(D.liftoffMass.station / 1e3, 3))} t`,
  liftoffWeightLeo: `${fmt((D.liftoffMass.leo * G0) / 1e6, 2)} MN`,
  liftoffTWLeo: fmt(D.liftoffTW.leo, 2),
  liftoffTWStation: fmt(D.liftoffTW.station, 2),
  holdDownNet: kN(sig(D.holdDownNet, 2)),
  liftoffAccel: `${fmt(D.liftoffAccel, 1)} m/s²`,
  sixEngineTW: fmt(D.sixEngineTW, 2),
  s2IgnitionTWLeo: fmt(D.s2IgnitionTW.leo, 2),
  s2IgnitionTWGto: fmt(D.s2IgnitionTW.gto, 2),
  s2IgnitionTWLunar: fmt(D.s2IgnitionTW.lunar, 2),
  s2EndAccelLeo: `${fmt(D.s2EndAccelLeo / G0, 1)} g`,
  landingThrustMin: kN(D.landingThrustMin),
  landingTWDry: fmt(D.landingTWDry, 1),
  boosterDryWeight: kN(sig(D.boosterDryWeight, 2)),
  heliumDensityRatio: fmt(D.heliumDensityRatio, 1),
  pressureFedRatio: fmt(sig(D.pressureFedRatio, 2)),
  sandwichStiffnessRatio: fmt(sig(D.sandwichStiffnessRatio, 2)),
  radiatedAt1500K: `${fmt(D.radiatedAt1500K / 1e6, 2)} MW/m²`,
  // geometry
  s1FuelTankLength: `${fmt(D.s1FuelTankLength, 1)} m`,
  s1LoxTankLength: `${fmt(D.s1LoxTankLength, 1)} m`,
  intertankLength: `${fmt(D.intertankLength, 1)} m`,
  s2TankLength: `${fmt(D.s2TankLength, 1)} m`,
  interstageLength: `${fmt(D.interstageLength, 1)} m`,
  nozzleInsideInterstage: `${fmt(D.nozzleInsideInterstage, 1)} m`,
  nozzleClearance: `${fmt(D.nozzleClearance, 1)} m`,
  downcomerLength: `${fmt(D.downcomerLength)} m`,
  downcomerContraction: `${fmt(D.downcomerContraction * 100)} cm`,
  fairingLength: `${fmt(D.fairingLength, 1)} m`,
  fairingDiameter: `${fmt(FAIRING.diameter, 1)} m`,
  fairingFace: `${fmt(FAIRING.faceSheet * 1000, 1)} mm`,
  fairingCore: `${fmt(FAIRING.core * 1000)} mm`,
  fairingMass: `${fmt(FAIRING.mass)} kg`,
  domeHeight: `${fmt(D.domeHeight, 1)} m`,
  adapterHeight: `${fmt(D.adapterHeight, 1)} m`,
  vehicleHeight: `${fmt(STATIONS.fairingTip, 1)} m`,
  // velocity budgets
  leoS1: kms(D.leoS1),
  leoS2: kms(D.leoS2),
  leoS2WithE1Loss: `${fmt(sig(D.leoS2WithE1Loss, 2))} m/s`,
  leoS2CarryingBoosterLoss: kms(D.leoS2CarryingBoosterLoss, 1),
  leoS2CarryingFairingLoss: `${fmt(sig(D.leoS2CarryingFairingLoss, 2))} m/s`,
  towerCarriedLoss: kms(D.towerCarriedLoss, 1),
  tradeS1: `${fmt(D.tradeS1)} kg`,
  tradeS2: `${fmt(D.tradeS2)} kg`,
  // orbits
  leoAlt: `${fmt(LEO_ALT / 1e3)} km`,
  leoSpeed: kms(D.leoSpeed),
  leoPeriod: `${fmt(D.leoPeriodMin, 1)} min`,
  orbitsPerDay: fmt(D.orbitsPerDay, 1),
  eclipseMin: `${fmt(D.eclipseMin)} min`,
  gravityAt400: `${fmt(D.gravityAt400 * 100)} %`,
  gravityAt100: `${fmt(D.gravityAt100 * 100)} %`,
  earthRotationSpeed: `${fmt(D.earthRotationSpeed)} m/s`,
  siteLat: `${fmt(SITE.lat, 1)}° N`,
  inclination: `${fmt(SITE.lat, 1)}°`,
  parkingSpeed: kms(D.parkingSpeed),
  gtoPerigeeSpeed: kms(D.gtoPerigeeSpeed),
  gtoInjectionDv: kms(D.gtoInjectionDv),
  gtoApogeeSpeed: kms(D.gtoApogeeSpeed),
  geoSpeed: kms(D.geoSpeed),
  circularizeDv: kms(D.circularizeDv),
  circularizePlaneDv: kms(D.circularizePlaneDv),
  gtoHalfPeriod: `${fmt(D.gtoHalfPeriodH, 1)} h`,
  phasingPeriod: `${fmt(D.phasingPeriodMin, 1)} min`,
  phasingGain: `${fmt(D.phasingGainDeg)}°`,
  deorbitPerigee: `${fmt(sig(D.deorbitPerigee / 1e3, 2))} km`,
  tliSpeed: kms(D.tliSpeed, 1),
  tliDv: kms(D.tliDv, 1),
  escapeSpeed: kms(D.escapeSpeed, 1),
  moonSpeed: kms(D.moonSpeed, 1),
  soiRadius: `${fmt(sig(D.soiRadius / 1e3, 2))} km`,
  // capsule and recovery
  capsuleMass: `${fmt(CAPSULE.mass)} kg`,
  capsuleDiameter: `${fmt(CAPSULE.baseDiameter, 1)} m`,
  capsuleHeight: `${fmt(CAPSULE.height, 1)} m`,
  capsuleSidewall: `${fmt(CAPSULE.sidewallDeg)}°`,
  heatShieldThickness: `${fmt(CAPSULE.heatShieldThickness * 1000)} mm`,
  heatShieldRadius: `${fmt(CAPSULE.heatShieldRadius, 1)} m`,
  entrySpeed: kms(D.entrySpeed, 1),
  capsuleKE: `${fmt(sig(D.capsuleKE / 1e9, 2))} GJ`,
  capsuleKEperKg: `${fmt(D.capsuleKEperKg / 1e6)} MJ/kg`,
  capsuleTNT: `${fmt(sig(D.capsuleTNT, 1))} tonnes of TNT`,
  drogues: fmt(CAPSULE.drogues),
  mains: fmt(CAPSULE.mains),
  mainDiameter: `${fmt(CAPSULE.mainDiameter)} m`,
  drogueDiameter: `${fmt(CAPSULE.drogueDiameter)} m`,
  mainArea: `${fmt(sig(D.mainArea, 2))} m²`,
  mainsTotalArea: `${fmt(sig(D.mainsTotalArea, 2))} m²`,
  descentThree: `${fmt(D.descentThree, 1)} m/s`,
  descentTwo: `${fmt(D.descentTwo, 1)} m/s`,
  noChuteSpeed: `${fmt(sig(D.noChuteSpeed, 1))} m/s`,
  smDiameter: `${fmt(SERVICE_MODULE.diameter, 1)} m`,
  smLength: `${fmt(SERVICE_MODULE.length, 1)} m`,
  smMass: `${fmt(SERVICE_MODULE.mass)} kg`,
  smThrust: kN(SERVICE_MODULE.engineThrust),
  smIsp: `${SERVICE_MODULE.ispVac} s`,
  smDeorbitProp: `${fmt(sig(D.smDeorbitProp, 2))} kg`,
  smDeorbitBurn: `${fmt(sig(D.smDeorbitBurn, 2))} s`,
  deorbitDv: `${fmt(D.deorbitDv)} m/s`,
  towerLength: `${fmt(ABORT_TOWER.length, 1)} m`,
  towerMass: `${fmt(ABORT_TOWER.mass)} kg`,
  towerThrust: `${fmt(ABORT_TOWER.motorThrust / 1e6, 1)} MN`,
  lesTW: fmt(D.lesTW),
  crewHatchHeight: `${fmt(D.crewHatchHeight)} m`,
  landingZoneDistance: `${fmt(D.landingZoneDistance / 1e3, 1)} km`,
  xBandWavelength: `${fmt(D.xBandWavelength * 100, 1)} cm`,
  suborbitalFreeFall: `${fmt(sig(D.suborbitalFreeFall / 60, 1))} minutes`,
  // recovery hardware
  gridFinCount: fmt(GRID_FINS.count),
  gridFinSize: `${fmt(GRID_FINS.width, 1)} m × ${fmt(GRID_FINS.height, 1)} m`,
  gridFinDeflection: `${fmt(GRID_FINS.maxDeflectionDeg)}°`,
  legCount: fmt(LEGS.count),
  legLength: `${fmt(LEGS.stowedLength, 1)} m`,
  legFootprint: `${fmt(LEGS.footprintRadius, 1)} m`,
  legMass: `${fmt(LEGS.mass)} kg`,
  legsFractionOfDry: `${fmt(D.legsFractionOfDry * 100)} %`,
  // payloads
  leoSatMass: `${fmt(PAYLOADS.leoSat.mass)} kg`,
  gtoSatMass: `${fmt(PAYLOADS.gtoSat.mass)} kg`,
  lunarProbeMass: `${fmt(PAYLOADS.lunarProbe.mass)} kg`,
  capsuleStackMass: `${fmt(PAYLOADS.capsule.mass)} kg`,
  researchCapsuleMass: `${fmt(PAYLOADS.researchCapsule.mass)} kg`,
};
