/**
 * Numbers derived from the reference dataset (`src/vehicle/spec.ts`, `src/world/*`) and quoted
 * in the part lessons and phase cards. They are computed here, not typed into the prose, so the
 * text follows the dataset if it changes. `derived.test.ts` recomputes the headline values
 * independently.
 *
 * Every value is either a dataset value, a direct consequence of dataset values (sums,
 * products, the ideal rocket equation, two-body orbital mechanics, ideal isentropic nozzle
 * flow), a mission-profile value (`PROFILE`: what the timeline flies or is built to, checked
 * against the built timelines in the test), a sourced reference value (`REFERENCE`), or an
 * estimate whose assumptions are stated where it is used. None of them is a measured value of
 * a real vehicle.
 */
import { ABORT_TOWER, BODY_DIAMETER, CAPSULE, DOME_HEIGHT, E1, E1V, FAIRING, G0, GRID_FINS, LEGS, PAYLOADS, PROPELLANTS, S1, S2, S1_ENGINE_LAYOUT, SERVICE_MODULE, STATIONS, tankVolume } from '../../vehicle/spec';
import { MOON_DISTANCE, MOON_PERIOD, MU_EARTH, MU_MOON, OMEGA_EARTH, R_EARTH, R_MOON, SITE } from '../../world/frames';
import { LANDING_ZONE, PAD } from '../../world/site';
import { OUTLINES } from '../../timeline/missions/outline';

/** Format a number with comma thousands separators and a fixed number of decimals (true minus sign). */
export function fmt(n: number, digits = 0): string {
  const s = Math.abs(n).toFixed(digits);
  const [int, frac] = s.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (n < 0 && Number(s) !== 0 ? '−' : '') + grouped + (frac ? `.${frac}` : '');
}

/**
 * Mission-profile values that are not in spec.ts. Each is either what the built LEO timeline
 * flies (src/timeline/missions/leo.ts, checked against the built timeline in derived.test.ts)
 * or a target of the physics brief (docs/briefs/physics.md) that the other timelines are built
 * to. The text words them as approximate; if a timeline settles elsewhere, change it here once.
 */
export const PROFILE = {
  /** LEO satellite orbit and station orbit: circular, km above the spherical Earth (m). */
  leoAlt: 400e3,
  /** LEO timeline: insertion into a 200 x 400 km orbit, then a short circularization burn at apogee. */
  leoInsertion: { rp: 200e3, ra: 400e3 },
  /** GTO and lunar parking orbit (physics brief: about 200 km). */
  parkingAlt: 200e3,
  /** Capsule insertion below the station (physics brief: about 200 x 250 km). */
  stationInsertion: { rp: 200e3, ra: 250e3 },
  /** Laps the capsule coasts in the insertion orbit before the two raising burns (station.ts). */
  phasingRevs: 4,
  /** Fairing released above this altitude once heating is low (flight.ts / physics brief). */
  fairingAlt: 110e3,
  /** Booster throttle setting through the transonic, high-q region (flight.ts). */
  throttleBucket: 0.7,
  /** Relative push-off speed of the pneumatic stage-separation pushers (ascent.ts), m/s. */
  stageSepSpeed: 1.0,
  /** Payload separation spring speed (leo.ts), m/s. */
  payloadSepSpeed: 0.4,
  /** Retrograde deorbit burn (physics brief), m/s. */
  deorbitDv: 100,
  /** Capsule entry interface altitude (physics brief), m. */
  entryInterface: 120e3,
  /** Drogue and main parachute deployment altitudes (physics brief), m. */
  drogueAlt: 7e3,
  mainAlt: 2e3,
  /** Rendezvous hold points below the station (m) and the maximum closing speed at contact (m/s). */
  holdPoints: [400, 150, 20],
  closingSpeed: 0.1,
  /** Suborbital hop: capsule high point as flown (suborbital.ts: about 117 km) and the free-fall floor. */
  suborbitalApogee: 117e3,
  freeFallFloor: 80e3,
  /** Suborbital hop: engines lit (suborbital.ts: the centre engine and two opposite outer engines). */
  suborbitalEngines: 3,
  /** Altitude by which drag starts to matter for the falling research capsule (estimate), m. */
  suborbitalDragAlt: 50e3,
  /** Suborbital hop: the capsule is released once the air is thin enough (suborbital.ts: about 75 km). */
  suborbitalReleaseAlt: 75e3,
  /** Propellant the LEO booster still holds at cutoff for its return (leo.ts: about 50 t), kg. */
  rtlsReserve: 50e3,
  /** Crew load limit the booster throttles to hold near the end of its burn on the station mission (flight.ts), g. */
  crewGLimit: 4,
  /** LEO upper-stage engine cutoff after liftoff (leo.ts: about 7.3 min), s. */
  leoSeco: 437,
  /**
   * GTO apogee-burn campaign as flown (gto.ts, explanatory): the satellite's 450 N, Isp 320 s
   * engine and its 1,700 kg of propellant; it coasts through the first apogee for checkout, then
   * makes three burns (minutes) centred on the next three apogees. The orbit after each burn
   * (perigee altitude, m; inclination, deg), the span from the first ignition to the last cutoff
   * (h) and the propellant the burns use (kg).
   */
  apogeeEngine: { thrust: 450, isp: 320, propellant: 1700 },
  gtoBurnMin: [87, 58, 40],
  gtoAfterBurn: [
    { peri: 6750e3, inc: 12.5 },
    { peri: 17900e3, inc: 4.5 },
    { peri: 35786e3, inc: 0.04 },
  ],
  gtoCampaignHours: 30,
  gtoBurnProp: 1600,
  /** Velocity change the three burns deliver together (rocket equation), m/s. */
  gtoBurnDv: 1845,
  /**
   * Lunar flyby as flown (lunar.ts): trans-lunar injection burn (s) and speed at cutoff (m/s);
   * closest approach altitude (m), the angle between the Earth direction and the probe seen from
   * the Moon (deg) and the speed relative to the Moon there (m/s); the speed relative to the
   * Earth on entering the Moon's sphere of influence (m/s); and at the exit, the speed relative to
   * the Earth (m/s) and the distance from the Earth (m).
   */
  tliBurnS: 61,
  tliSpeedFlown: 10944,
  flybyAlt: 1500e3,
  flybyAngleFromEarthDeg: 77,
  flybySpeedRelMoon: 2078,
  /** How far the Moon turns the probe's velocity relative to the Moon, from sphere-of-influence entry to exit (deg). */
  flybyTurnDeg: 64,
  soiArrivalSpeed: 1020,
  soiExitSpeed: 1743,
  soiExitDist: 450e6,
  /** Service-module propellant at undocking: what the station mission arrives with (station.ts SM_PROP_AT_DOCKING), kg; and the module's dry mass (timeline physics), kg. */
  smPropAtUndock: 1108,
  smDry: 2600,
} as const;

/**
 * Sourced reference values (not in spec.ts): LOX/RP-1 theoretical chamber temperature near this
 * mixture ratio (Sutton & Biblarz, table of theoretical performance: about 3,570 to 3,680 K) and
 * the total solar irradiance above the atmosphere (Kopp and Lean, 2011).
 */
export const REFERENCE = {
  flameTemperature: 3600,
  solarIrradiance: 1361,
  /** US Standard Atmosphere 1976 at 7 km: density (kg/m^3) and speed of sound (m/s). */
  density7km: 0.59,
  sound7km: 312.3,
} as const;

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
/** A small count as a word, for prose ("two drogues"); larger counts as digits. */
export function countWord(n: number, capital = false): string {
  const w = Number.isInteger(n) && n >= 0 && n < WORDS.length ? WORDS[n] : fmt(n);
  return capital ? w.charAt(0).toUpperCase() + w.slice(1) : w;
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
/** Tank pressure a pressure-fed E-1 would need (chamber pressure plus injector and line losses) and a typical pump-fed tank pressure (both illustrative). */
const PRESSURE_FED_TANK = 10e6;
const PUMP_FED_TANK = 0.3e6;
const pumpPower = ((e1Lox / PROPELLANTS.lox.density) * LOX_PUMP_RISE + (e1Fuel / PROPELLANTS.rp1.density) * FUEL_PUMP_RISE) / PUMP_EFFICIENCY;

// ---- masses (kg) ----
/**
 * Empty booster mass. S1.dry covers the stage with its engines; the recovery configuration adds
 * the landing legs (LEGS.mass), as the trajectory model does (timeline/physics/vehicle.ts).
 */
const s1Empty = (recovery: boolean) => S1.dry + (recovery ? LEGS.mass : 0);
const s1EmptyRecovery = s1Empty(true);
const s2Gross = S2.dry + S2.propellant;
const stackMass = (mission: 'leo' | 'gto' | 'lunar' | 'station', payload: number) => s1Empty(OUTLINES[mission].recovery) + S1.propellant + s2Gross + payload;
/** Fully fuelled on the pad, before ignition (the engines burn a few tonnes before release). */
const liftoffMass = {
  leo: stackMass('leo', PAYLOADS.leoSat.mass + FAIRING.mass),
  gto: stackMass('gto', PAYLOADS.gtoSat.mass + FAIRING.mass),
  lunar: stackMass('lunar', PAYLOADS.lunarProbe.mass + FAIRING.mass),
  station: stackMass('station', PAYLOADS.capsule.mass + ABORT_TOWER.mass),
};
const s1ThrustSL = S1.engineCount * (E1.thrustSL ?? 0);
const s1ThrustVac = S1.engineCount * E1.thrustVac;
const s1Mdot = S1.engineCount * e1Mdot;

// ---- ideal velocity changes, LEO configuration (fairing dropped at staging for simplicity) ----
/** First stage with vacuum Isp and no gravity or drag losses: an upper bound, not a flight value. */
const leoS1 = idealDv(E1.ispVac, liftoffMass.leo, liftoffMass.leo - S1.propellant);
const leoS2 = idealDv(E1V.ispVac, s2Gross + PAYLOADS.leoSat.mass, S2.dry + PAYLOADS.leoSat.mass);
const leoS2WithE1 = idealDv(E1.ispVac, s2Gross + PAYLOADS.leoSat.mass, S2.dry + PAYLOADS.leoSat.mass);
const leoS2CarryingBooster = idealDv(E1V.ispVac, s2Gross + PAYLOADS.leoSat.mass + s1EmptyRecovery, S2.dry + PAYLOADS.leoSat.mass + s1EmptyRecovery);
const leoS2CarryingFairing = idealDv(E1V.ispVac, s2Gross + PAYLOADS.leoSat.mass + FAIRING.mass, S2.dry + PAYLOADS.leoSat.mass + FAIRING.mass);
/** Ideal velocity lost by the upper stage if it had to carry the empty booster (per payload stack). */
const carryBoosterLoss = (payload: number, recovery: boolean) =>
  idealDv(E1V.ispVac, s2Gross + payload, S2.dry + payload) - idealDv(E1V.ispVac, s2Gross + payload + s1Empty(recovery), S2.dry + payload + s1Empty(recovery));
const capS2 = idealDv(E1V.ispVac, s2Gross + PAYLOADS.capsule.mass, S2.dry + PAYLOADS.capsule.mass);
const capS2WithTower = idealDv(E1V.ispVac, s2Gross + PAYLOADS.capsule.mass + ABORT_TOWER.mass, S2.dry + PAYLOADS.capsule.mass + ABORT_TOWER.mass);
/**
 * Ideal booster velocity change (vacuum Isp, upper bound) with the given payload stack, either
 * expended (no legs, all propellant burned) or recovered (legs carried, the return reserve kept).
 */
const boosterDv = (payload: number, recovered: boolean) => {
  const m0 = S1.dry + (recovered ? LEGS.mass : 0) + S1.propellant + s2Gross + payload;
  return idealDv(E1.ispVac, m0, m0 - (S1.propellant - (recovered ? PROFILE.rtlsReserve : 0)));
};
/** What keeping the booster's return (legs plus the reserve) would cost the station ascent, ideal. */
const stationRecoveryCost = boosterDv(PAYLOADS.capsule.mass + ABORT_TOWER.mass, false) - boosterDv(PAYLOADS.capsule.mass + ABORT_TOWER.mass, true);

/** Payload lost (kg) per 100 kg added to a stage's dry mass, at fixed total ideal velocity change (LEO). */
function payloadTrade(stage: 's1' | 's2'): number {
  const total = (p: number, s1dry: number, s2dry: number) => {
    const m0 = s1dry + S1.propellant + s2dry + S2.propellant + p + FAIRING.mass;
    return idealDv(E1.ispVac, m0, m0 - S1.propellant) + idealDv(E1V.ispVac, s2dry + S2.propellant + p, s2dry + p);
  };
  const base = total(PAYLOADS.leoSat.mass, s1EmptyRecovery, S2.dry);
  let lo = 0;
  let hi = PAYLOADS.leoSat.mass * 2;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const dv = stage === 's1' ? total(mid, s1EmptyRecovery + 100, S2.dry) : total(mid, s1EmptyRecovery, S2.dry + 100);
    if (dv > base) lo = mid;
    else hi = mid;
  }
  return PAYLOADS.leoSat.mass - (lo + hi) / 2;
}

// ---- orbits ----
const LEO_ALT = PROFILE.leoAlt;
const PARKING_ALT = PROFILE.parkingAlt;
const GEO_ALT = 35_786e3;
/** LEO insertion orbit as flown (perigee at cutoff, apogee half an orbit later). */
const insA = R_EARTH + (PROFILE.leoInsertion.rp + PROFILE.leoInsertion.ra) / 2;
const insPerigeeSpeed = visViva(R_EARTH + PROFILE.leoInsertion.rp, insA);
const insApogeeSpeed = visViva(R_EARTH + PROFILE.leoInsertion.ra, insA);
const leoSpeed = circularSpeed(LEO_ALT);
const leoPeriod = period(R_EARTH + LEO_ALT);
const parkingSpeed = circularSpeed(PARKING_ALT);
const gtoA = (2 * R_EARTH + PARKING_ALT + GEO_ALT) / 2;
const gtoPerigeeSpeed = visViva(R_EARTH + PARKING_ALT, gtoA);
const gtoApogeeSpeed = visViva(R_EARTH + GEO_ALT, gtoA);
const geoSpeed = circularSpeed(GEO_ALT);
const incl = SITE.lat * deg;
const circPlane = Math.sqrt(gtoApogeeSpeed ** 2 + geoSpeed ** 2 - 2 * gtoApogeeSpeed * geoSpeed * Math.cos(incl));
/** Mean altitude of the capsule's insertion orbit below the station. */
const phasingAlt = (PROFILE.stationInsertion.rp + PROFILE.stationInsertion.ra) / 2;
const phasingPeriod = period(R_EARTH + phasingAlt);
const deorbitDv = PROFILE.deorbitDv;
/** Semi-major axis of the orbit after the retrograde deorbit burn from the circular LEO orbit. */
const deorbitA = (() => {
  const r = R_EARTH + LEO_ALT;
  const v = leoSpeed - deorbitDv;
  return 1 / (2 / r - (v * v) / MU_EARTH);
})();
const deorbitPerigee = 2 * deorbitA - (R_EARTH + LEO_ALT) - R_EARTH;
/** Far-side altitude after a retrograde burn of dv from the circular LEO orbit (two-body). */
export function perigeeAfterRetroBurn(dv: number): number {
  const r = R_EARTH + LEO_ALT;
  const v = leoSpeed - dv;
  const a = 1 / (2 / r - (v * v) / MU_EARTH);
  return 2 * a - r - R_EARTH;
}
/** How much lower the far side goes for each extra m/s of deorbit burn, near the nominal burn (m per m/s). */
const deorbitSensitivity = perigeeAfterRetroBurn(deorbitDv) - perigeeAfterRetroBurn(deorbitDv + 1);
const tliA = (R_EARTH + PARKING_ALT + MOON_DISTANCE) / 2;
const tliSpeed = visViva(R_EARTH + PARKING_ALT, tliA);
const escapeSpeed = Math.sqrt((2 * MU_EARTH) / (R_EARTH + PARKING_ALT));
const moonSpeed = (2 * Math.PI * MOON_DISTANCE) / MOON_PERIOD;
const soiRadius = MOON_DISTANCE * (MU_MOON / MU_EARTH) ** 0.4;
const eclipseFraction = (2 * Math.asin(R_EARTH / (R_EARTH + LEO_ALT))) / (2 * Math.PI);
/** Coast time of the minimum-energy path whose far point just reaches the Moon's distance (half its period). */
const tliMinCoastDays = period(tliA) / 2 / 86400;
/**
 * The flyby seen from the Moon (two-body about the Moon, from the flown closest approach): the
 * speed far from the Moon (hyperbolic excess) and at the edge of its sphere of influence, the
 * same on the way in and on the way out. Seen from the Earth at the exit: the escape speed at
 * that distance and the speed left far from the Earth.
 */
const flybyR = R_MOON + PROFILE.flybyAlt;
const flybyVinfMoon = Math.sqrt(PROFILE.flybySpeedRelMoon ** 2 - (2 * MU_MOON) / flybyR);
const flybyRelAtSoi = Math.sqrt(flybyVinfMoon ** 2 + (2 * MU_MOON) / soiRadius);
const soiExitEscape = Math.sqrt((2 * MU_EARTH) / PROFILE.soiExitDist);
const soiExitVinf = Math.sqrt(PROFILE.soiExitSpeed ** 2 - soiExitEscape ** 2);
/**
 * Geostationary apogee campaign: the plane change priced on its own at geostationary height and
 * in the parking orbit (2·v·sin(i/2)), the apogee engine's acceleration on the full satellite,
 * and the ideal propellant and engine time for the combined circularization and plane change.
 */
const geoPlaneOnlyDv = 2 * geoSpeed * Math.sin(incl / 2);
const parkingPlaneDv = 2 * parkingSpeed * Math.sin(incl / 2);
const apogeeVe = PROFILE.apogeeEngine.isp * G0;
const apogeeAccel = PROFILE.apogeeEngine.thrust / PAYLOADS.gtoSat.mass;
const apogeePropIdeal = PAYLOADS.gtoSat.mass * (1 - Math.exp(-circPlane / apogeeVe));
const apogeeBurnHoursIdeal = apogeePropIdeal / (PROFILE.apogeeEngine.thrust / apogeeVe) / 3600;
const gtoBurnHours = PROFILE.gtoBurnMin.reduce((a, b) => a + b, 0) / 60;

// ---- capsule and recovery ----
/**
 * Entry speed at the entry interface on the orbit left by the deorbit burn (two-body), relative
 * to Earth's centre, and relative to the air, which turns with Earth. For a prograde orbit of
 * inclination i the air's velocity component along the track is omega * r * cos(i) at every
 * point; the flight-path angle (about 1 degree) and the small cross-track air speed change the
 * magnitude by only a few m/s.
 */
const rEntry = R_EARTH + PROFILE.entryInterface;
const entryInertial = visViva(rEntry, deorbitA);
const entryAir = entryInertial - OMEGA_EARTH * rEntry * Math.cos(incl);
/** Kinetic energy the atmosphere has to remove: relative to the air. */
const capsuleKE = 0.5 * CAPSULE.mass * entryAir ** 2;
const MAIN_CD = 0.8; // drag coefficient on nominal canopy area (estimate)
const mainArea = disk(CAPSULE.mainDiameter);
const descentSpeedFor = (mass: number, n: number) => Math.sqrt((2 * mass * G0) / (SEA_LEVEL_DENSITY * MAIN_CD * n * mainArea));
const descentSpeed = (n: number) => descentSpeedFor(CAPSULE.mass, n);
const CAPSULE_CD = 1.3; // blunt body, heat shield first (the physics brief's value)
const capsuleArea = disk(CAPSULE.baseDiameter);
const fallSpeedAt = (rho: number) => Math.sqrt((2 * CAPSULE.mass * G0) / (rho * CAPSULE_CD * capsuleArea));
const noChuteSpeed = fallSpeedAt(SEA_LEVEL_DENSITY);
/** Steady falling speed of the capsule at the drogue altitude (US Standard Atmosphere 1976 density). */
const drogueSpeed = fallSpeedAt(REFERENCE.density7km);
/** Suborbital hop: speed after falling from the planned high point to where drag starts to matter. */
const suborbitalFallSpeed = Math.sqrt(2 * MU_EARTH * (1 / (R_EARTH + PROFILE.suborbitalDragAlt) - 1 / (R_EARTH + PROFILE.suborbitalApogee)));
/** Time above a floor for a vertical coast to the planned high point (uniform gravity at the mean height). */
const timeAbove = (floor: number) => {
  const h = PROFILE.suborbitalApogee - floor;
  const g = MU_EARTH / (R_EARTH + (PROFILE.suborbitalApogee + floor) / 2) ** 2;
  return 2 * Math.sqrt((2 * h) / g);
};
const suborbitalFreeFall = timeAbove(PROFILE.freeFallFloor);
const smMdot = SERVICE_MODULE.engineThrust / (SERVICE_MODULE.ispVac * G0);
/** Capsule and service module at undocking: the module carries the propellant the station mission arrives with. */
const smStackAtUndock = CAPSULE.mass + PROFILE.smDry + PROFILE.smPropAtUndock;
const smDeorbitProp = smStackAtUndock * (1 - Math.exp(-deorbitDv / (SERVICE_MODULE.ispVac * G0)));
/** Propellant left at service-module separation and the velocity change it could still give (the deorbit margin). */
const smPropAfterDeorbit = PROFILE.smPropAtUndock - smDeorbitProp;
const smMarginDv = SERVICE_MODULE.ispVac * G0 * Math.log((CAPSULE.mass + PROFILE.smDry + smPropAfterDeorbit) / (CAPSULE.mass + PROFILE.smDry));

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
  /** Minimum single-engine thrust over the weight of the empty recovery booster (with legs). */
  landingTWDry: (E1.minThrottle * (E1.thrustSL ?? 0)) / (s1EmptyRecovery * G0),
  boosterEmptyMass: s1EmptyRecovery,
  boosterDryWeight: s1EmptyRecovery * G0,
  /** Throttle a single engine as big as the whole cluster would need to match the empty booster's weight. */
  singleEngineHoverThrottle: (s1EmptyRecovery * G0) / s1ThrustSL,
  radiatedAt1500K: STEFAN_BOLTZMANN * 1500 ** 4,
  // masses and ratios
  liftoffMass,
  liftoffTW: { leo: s1ThrustSL / (liftoffMass.leo * G0), station: s1ThrustSL / (liftoffMass.station * G0) },
  /** Per ascent configuration: weight (N), net hold-down load (N), liftoff acceleration (m/s^2). */
  stack: Object.fromEntries(
    (Object.keys(liftoffMass) as (keyof typeof liftoffMass)[]).map((k) => [
      k,
      {
        mass: liftoffMass[k],
        weight: liftoffMass[k] * G0,
        holdDown: s1ThrustSL - liftoffMass[k] * G0,
        accel: (s1ThrustSL - liftoffMass[k] * G0) / liftoffMass[k],
        tw: s1ThrustSL / (liftoffMass[k] * G0),
        boosterEmpty: s1Empty(OUTLINES[k].recovery),
      },
    ]),
  ) as Record<keyof typeof liftoffMass, { mass: number; weight: number; holdDown: number; accel: number; tw: number; boosterEmpty: number }>,
  carryBoosterLoss: {
    leo: carryBoosterLoss(PAYLOADS.leoSat.mass, OUTLINES.leo.recovery),
    gto: carryBoosterLoss(PAYLOADS.gtoSat.mass, OUTLINES.gto.recovery),
    lunar: carryBoosterLoss(PAYLOADS.lunarProbe.mass, OUTLINES.lunar.recovery),
    station: carryBoosterLoss(PAYLOADS.capsule.mass + ABORT_TOWER.mass, OUTLINES.station.recovery),
  },
  holdDownNet: s1ThrustSL - liftoffMass.leo * G0,
  liftoffAccel: (s1ThrustSL - liftoffMass.leo * G0) / liftoffMass.leo,
  sixEngineTW: ((S1.engineCount - 1) / S1.engineCount) * (s1ThrustSL / (liftoffMass.leo * G0)),
  s2IgnitionTW: {
    leo: E1V.thrustVac / ((s2Gross + PAYLOADS.leoSat.mass + FAIRING.mass) * G0),
    gto: E1V.thrustVac / ((s2Gross + PAYLOADS.gtoSat.mass + FAIRING.mass) * G0),
    lunar: E1V.thrustVac / ((s2Gross + PAYLOADS.lunarProbe.mass + FAIRING.mass) * G0),
    station: E1V.thrustVac / ((s2Gross + PAYLOADS.capsule.mass + ABORT_TOWER.mass) * G0),
  },
  s2EndAccelLeo: E1V.thrustVac / (S2.dry + PAYLOADS.leoSat.mass),
  /** Full-thrust acceleration of the nearly empty upper stage with the capsule and service module. */
  s2EndAccelStation: E1V.thrustVac / (S2.dry + PAYLOADS.capsule.mass),
  s1LoxVolume: tankVolume(S1.lox, 'lox'),
  s1Rp1Volume: tankVolume(S1.rp1, 'rp1'),
  s2LoxVolume: tankVolume(S2.lox, 'lox'),
  s2Rp1Volume: tankVolume(S2.rp1, 'rp1'),
  heliumDensityRatio: 293 / PROPELLANTS.lox.boilK,
  pressureFedRatio: PRESSURE_FED_TANK / PUMP_FED_TANK,
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
  /** Upper-stage ideal velocity change with the capsule and service module (tower already gone). */
  capS2,
  stationRecoveryCost,
  tradeS1: payloadTrade('s1'),
  tradeS2: payloadTrade('s2'),
  // orbits
  leoSpeed,
  leoPeriodMin: leoPeriod / 60,
  insPerigeeSpeed,
  insApogeeSpeed,
  insCoastMin: period(insA) / 2 / 60,
  leoCircDv: leoSpeed - insApogeeSpeed,
  orbitsPerDay: 86400 / leoPeriod,
  eclipseMin: (eclipseFraction * leoPeriod) / 60,
  gravityAt400: (R_EARTH / (R_EARTH + LEO_ALT)) ** 2,
  gravityAt200: (R_EARTH / (R_EARTH + PROFILE.leoInsertion.rp)) ** 2,
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
  deorbitSensitivity,
  tliSpeed,
  tliDv: tliSpeed - parkingSpeed,
  escapeSpeed,
  moonSpeed,
  soiRadius,
  tliMinCoastDays,
  flybyVinfMoon,
  flybyRelAtSoi,
  soiExitEscape,
  soiExitVinf,
  geoPlaneOnlyDv,
  parkingPlaneDv,
  apogeeAccel,
  apogeePropIdeal,
  apogeeBurnHoursIdeal,
  gtoBurnHours,
  // capsule
  entryInertial,
  entryAir,
  capsuleKE,
  capsuleKEperKg: 0.5 * entryAir ** 2,
  capsuleTNT: capsuleKE / 4.184e9,
  mainArea,
  mainsTotalArea: CAPSULE.mains * mainArea,
  descentThree: descentSpeed(CAPSULE.mains),
  descentTwo: descentSpeed(CAPSULE.mains - 1),
  /** The research capsule has the crew capsule's shape and parachutes but a lower mass. */
  descentResearch: descentSpeedFor(PAYLOADS.researchCapsule.mass, CAPSULE.mains),
  noChuteSpeed,
  drogueSpeed,
  drogueMach: drogueSpeed / REFERENCE.sound7km,
  suborbitalFallSpeed,
  /** Kinetic energy per kilogram: orbital entry (relative to the air) over the suborbital fall. */
  suborbitalEnergyRatio: entryAir ** 2 / suborbitalFallSpeed ** 2,
  smMdot,
  smStackAtUndock,
  smDeorbitProp,
  smDeorbitBurn: smDeorbitProp / smMdot,
  smPropAfterDeorbit,
  smMarginDv,
  lesTW: ABORT_TOWER.motorThrust / ((CAPSULE.mass + ABORT_TOWER.mass) * G0),
  /** Crew hatch sill: 58.3 m above the nozzle exit plane in the capsule stack, the level of the tower's crew access arm (scene/environment/tower.ts). */
  crewHatchHeight: PAD.nozzleExitHeight + 58.3,
  landingZoneDistance: Math.hypot(LANDING_ZONE.x, LANDING_ZONE.z),
  xBandWavelength: 299_792_458 / 8.4e9,
  suborbitalFreeFall,
  suborbitalAboveKarman: timeAbove(100e3),
  gridFinArea: GRID_FINS.width * GRID_FINS.height,
  legsFractionOfDry: LEGS.mass / S1.dry,
};

const kN = (n: number) => `${fmt(n / 1e3)} kN`;
/** A station height as authored (one or two decimals), or rounded to 0.1 m when computed. */
const stationM = (v: number) => {
  const tenths = Math.abs(v * 10 - Math.round(v * 10)) < 1e-9;
  const hundredths = Math.abs(v * 100 - Math.round(v * 100)) < 1e-9;
  return `${fmt(v, tenths || !hundredths ? 1 : 2)} m`;
};
const kms = (n: number, d = 2) => `${fmt(n / 1e3, d)} km/s`;
const km = (m: number) => `${fmt(m / 1e3)} km`;

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
  e1GimbalDeg: `${fmt(E1.gimbalRangeDeg)}°`,
  flameT: `${fmt(REFERENCE.flameTemperature)} K`,
  solarIrradiance: `${fmt(REFERENCE.solarIrradiance)} W/m²`,
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
  loxPumpRise: `${fmt(LOX_PUMP_RISE / 1e6)} MPa`,
  fuelPumpRise: `${fmt(FUEL_PUMP_RISE / 1e6)} MPa`,
  pumpEfficiency: `${fmt(PUMP_EFFICIENCY * 100)} %`,
  e1LoxVolumeFlow: `${fmt(D.e1Lox / PROPELLANTS.lox.density, 2)} m³/s`,
  loxPumpHydraulic: `${fmt(((D.e1Lox / PROPELLANTS.lox.density) * LOX_PUMP_RISE) / 1e6, 1)} MW`,
  e1ExitPressure: `${fmt(sig(D.e1ExitPressure / 1e3, 2))} kPa`,
  e1SeaLevelPressureTerm: kN(sig(SEA_LEVEL_PRESSURE * D.e1ExitArea, 2)),
  e1ThrustSLFromPressure: kN(E1.thrustVac - SEA_LEVEL_PRESSURE * D.e1ExitArea),
  e1vExitPressure: `${fmt(sig(D.e1vExitPressure / 1e3, 1))} kPa`,
  e1vSeaLevelRatio: fmt(sig(SEA_LEVEL_PRESSURE / D.e1vExitPressure, 2)),
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
  hopEngines: countWord(PROFILE.suborbitalEngines),
  hopEnginesCap: countWord(PROFILE.suborbitalEngines, true),
  hopThrustSL: kN(PROFILE.suborbitalEngines * (E1.thrustSL ?? 0)),
  hopMdot: `${fmt(PROFILE.suborbitalEngines * D.e1Mdot)} kg/s`,
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
  /** LOX boiling point to room temperature (293 K). */
  loxToAmbient: `${fmt(sig(293 - PROPELLANTS.lox.boilK, 1))} K`,
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
  /** Per ascent configuration (leo, gto, lunar, station): mass, weight, hold-down load, acceleration, T/W. */
  stack: Object.fromEntries(
    Object.entries(D.stack).map(([k, v]) => [
      k,
      {
        mass: `${fmt(sig(v.mass / 1e3, 3))} t`,
        weight: `${fmt(v.weight / 1e6, 2)} MN`,
        holdDown: kN(sig(v.holdDown, 2)),
        accel: `${fmt(v.accel, 1)} m/s²`,
        tw: fmt(v.tw, 2),
        carryBoosterLoss: kms(D.carryBoosterLoss[k as keyof typeof D.carryBoosterLoss], 1),
        boosterEmpty: `${fmt(v.boosterEmpty)} kg`,
      },
    ]),
  ) as Record<keyof typeof D.stack, { mass: string; weight: string; holdDown: string; accel: string; tw: string; carryBoosterLoss: string; boosterEmpty: string }>,
  liftoffTWLeo: fmt(D.liftoffTW.leo, 2),
  liftoffTWStation: fmt(D.liftoffTW.station, 2),
  holdDownNet: kN(sig(D.holdDownNet, 2)),
  liftoffAccel: `${fmt(D.liftoffAccel, 1)} m/s²`,
  sixEngineTW: fmt(D.sixEngineTW, 2),
  s2IgnitionTWLeo: fmt(D.s2IgnitionTW.leo, 2),
  s2IgnitionTWGto: fmt(D.s2IgnitionTW.gto, 2),
  s2IgnitionTWLunar: fmt(D.s2IgnitionTW.lunar, 2),
  s2IgnitionTWStation: fmt(D.s2IgnitionTW.station, 2),
  s2EndAccelLeo: `${fmt(D.s2EndAccelLeo / G0, 1)} g`,
  s2EndAccelStation: `${fmt(D.s2EndAccelStation / G0, 1)} g`,
  landingThrustMin: kN(D.landingThrustMin),
  landingTWDry: fmt(D.landingTWDry, 1),
  boosterEmptyMass: `${fmt(D.boosterEmptyMass)} kg`,
  boosterDryWeight: kN(sig(D.boosterDryWeight, 2)),
  singleEngineHoverThrottle: `${fmt(D.singleEngineHoverThrottle * 100)} %`,
  heliumDensityRatio: fmt(D.heliumDensityRatio, 1),
  pressureFedRatio: fmt(sig(D.pressureFedRatio, 2)),
  pressureFedTank: `${fmt(PRESSURE_FED_TANK / 1e6)} MPa`,
  pumpFedTank: `${fmt(PUMP_FED_TANK / 1e6, 1)} MPa`,
  sandwichStiffnessRatio: fmt(sig(D.sandwichStiffnessRatio, 2)),
  radiatedAt1500K: `${fmt(D.radiatedAt1500K / 1e6, 2)} MW/m²`,
  // geometry
  /** Axial stations (height above the first-stage nozzle exit plane), formatted. */
  st: Object.fromEntries(Object.entries(STATIONS).map(([k, v]) => [k, stationM(v)])) as Record<keyof typeof STATIONS, string>,
  legHinge: `${fmt(LEGS.hingeY, 1)} m`,
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
  capS2: kms(D.capS2, 1),
  stationRecoveryCost: kms(D.stationRecoveryCost, 1),
  rtlsReserve: `${fmt(PROFILE.rtlsReserve / 1e3)} t`,
  crewGLimit: `${fmt(PROFILE.crewGLimit)} g`,
  leoSeco: `${fmt(PROFILE.leoSeco / 60, 1)} minutes`,
  apogeeThrust: `${fmt(PROFILE.apogeeEngine.thrust)} N`,
  apogeeIsp: `${fmt(PROFILE.apogeeEngine.isp)} s`,
  apogeeAccel: `${fmt(D.apogeeAccel, 3)} m/s²`,
  apogeeAccelG: `about 1/${fmt(G0 / D.apogeeAccel)} of g`,
  satPropellant: `${fmt(PROFILE.apogeeEngine.propellant)} kg`,
  gtoBurnCount: countWord(PROFILE.gtoBurnMin.length),
  gtoBurnCountCap: countWord(PROFILE.gtoBurnMin.length, true),
  gtoBurnMins: `${PROFILE.gtoBurnMin.slice(0, -1).map((m) => fmt(m)).join(', ')} and ${fmt(PROFILE.gtoBurnMin[PROFILE.gtoBurnMin.length - 1])} min`,
  gtoBurnHours: `${fmt(D.gtoBurnHours, 1)} hours`,
  apogeeBurnHoursIdeal: `${fmt(D.apogeeBurnHoursIdeal, 1)} hours`,
  apogeePropIdeal: `${fmt(sig(D.apogeePropIdeal, 2))} kg`,
  gtoBurnProp: `${fmt(PROFILE.gtoBurnProp)} kg`,
  satPropLeft: `${fmt(PROFILE.apogeeEngine.propellant - PROFILE.gtoBurnProp)} kg`,
  gtoBurnDv: `${fmt(PROFILE.gtoBurnDv)} m/s`,
  circularizePlaneDvMs: `${fmt(D.circularizePlaneDv)} m/s`,
  gtoCampaign: `${fmt(PROFILE.gtoCampaignHours)} hours`,
  gtoPeri1: km(PROFILE.gtoAfterBurn[0].peri),
  gtoPeri2: km(PROFILE.gtoAfterBurn[1].peri),
  gtoInc1: `${fmt(PROFILE.gtoAfterBurn[0].inc, 1)}°`,
  gtoInc2: `${fmt(PROFILE.gtoAfterBurn[1].inc, 1)}°`,
  gtoIncFinal: `${fmt(PROFILE.gtoAfterBurn[2].inc, 2)}°`,
  geoAlt: km(GEO_ALT),
  geoPlaneOnlyDv: kms(D.geoPlaneOnlyDv),
  parkingPlaneDv: kms(D.parkingPlaneDv),
  circPlusPlaneSeparate: kms(D.circularizeDv + D.geoPlaneOnlyDv),
  tliBurn: `${fmt(PROFILE.tliBurnS)} s`,
  tliSpeedFlown: kms(PROFILE.tliSpeedFlown),
  tliMinCoastDays: `${fmt(D.tliMinCoastDays)} days`,
  flybyAlt: km(PROFILE.flybyAlt),
  flybyAngle: `${fmt(PROFILE.flybyAngleFromEarthDeg)}°`,
  flybySpeedRelMoon: kms(PROFILE.flybySpeedRelMoon, 1),
  flybyRelAtSoi: kms(D.flybyRelAtSoi, 1),
  flybyTurn: `${fmt(PROFILE.flybyTurnDeg)}°`,
  soiArrivalSpeed: kms(PROFILE.soiArrivalSpeed, 1),
  soiExitSpeed: kms(PROFILE.soiExitSpeed, 2),
  soiExitDist: `${fmt(sig(PROFILE.soiExitDist / 1e3, 2))} km`,
  soiExitEscape: kms(D.soiExitEscape, 2),
  soiExitVinf: kms(D.soiExitVinf, 1),
  tradeS1: `${fmt(D.tradeS1)} kg`,
  tradeS2: `${fmt(D.tradeS2)} kg`,
  // mission-profile values (see PROFILE)
  parkingAlt: km(PARKING_ALT),
  leoInsertion: `${fmt(PROFILE.leoInsertion.rp / 1e3)} × ${fmt(PROFILE.leoInsertion.ra / 1e3)} km`,
  leoInsPerigeeAlt: km(PROFILE.leoInsertion.rp),
  leoInsApogeeAlt: km(PROFILE.leoInsertion.ra),
  insPerigeeSpeed: kms(D.insPerigeeSpeed),
  insApogeeSpeed: kms(D.insApogeeSpeed),
  insCoast: `${fmt(D.insCoastMin)} min`,
  leoCircDv: `${fmt(sig(D.leoCircDv, 2))} m/s`,
  stationInsertion: `${fmt(PROFILE.stationInsertion.rp / 1e3)} × ${fmt(PROFILE.stationInsertion.ra / 1e3)} km`,
  phasingAlt: km(phasingAlt),
  fairingAlt: km(PROFILE.fairingAlt),
  throttleBucket: `${fmt(PROFILE.throttleBucket * 100)} %`,
  stageSepSpeed: `${fmt(PROFILE.stageSepSpeed, 1)} m/s`,
  payloadSepSpeed: `${fmt(PROFILE.payloadSepSpeed, 1)} m/s`,
  entryInterface: km(PROFILE.entryInterface),
  drogueAlt: km(PROFILE.drogueAlt),
  mainAlt: km(PROFILE.mainAlt),
  holdPoints: `${PROFILE.holdPoints.slice(0, -1).map((h) => `${fmt(h)} m`).join(', ')} and ${fmt(PROFILE.holdPoints[PROFILE.holdPoints.length - 1])} m`,
  closingSpeed: `${fmt(PROFILE.closingSpeed, 1)} m/s`,
  firstHold: `${fmt(PROFILE.holdPoints[0])} m`,
  suborbitalApogee: km(PROFILE.suborbitalApogee),
  freeFallFloor: km(PROFILE.freeFallFloor),
  suborbitalDragAlt: km(PROFILE.suborbitalDragAlt),
  suborbitalReleaseAlt: km(PROFILE.suborbitalReleaseAlt),
  // orbits
  leoAlt: `${fmt(LEO_ALT / 1e3)} km`,
  leoSpeed: kms(D.leoSpeed),
  leoPeriod: `${fmt(D.leoPeriodMin, 1)} min`,
  orbitsPerDay: fmt(D.orbitsPerDay, 1),
  eclipseMin: `${fmt(D.eclipseMin)} min`,
  gravityAt400: `${fmt(D.gravityAt400 * 100)} %`,
  gravityAt200: `${fmt(D.gravityAt200 * 100)} %`,
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
  deorbitSensitivity: `${fmt(D.deorbitSensitivity / 1e3)} km`,
  phasingRevs: countWord(PROFILE.phasingRevs),
  phasingHours: `${fmt((PROFILE.phasingRevs * D.phasingPeriodMin) / 60)} hours`,
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
  entryInertial: kms(D.entryInertial, 1),
  entryAir: kms(D.entryAir, 1),
  capsuleKE: `${fmt(sig(D.capsuleKE / 1e9, 2))} GJ`,
  capsuleKEperKg: `${fmt(D.capsuleKEperKg / 1e6)} MJ/kg`,
  capsuleTNT: `${fmt(sig(D.capsuleTNT, 2))} tonnes of TNT`,
  drogues: fmt(CAPSULE.drogues),
  mains: fmt(CAPSULE.mains),
  droguesWord: countWord(CAPSULE.drogues),
  mainsWord: countWord(CAPSULE.mains),
  droguesWordCap: countWord(CAPSULE.drogues, true),
  mainDiameter: `${fmt(CAPSULE.mainDiameter)} m`,
  drogueDiameter: `${fmt(CAPSULE.drogueDiameter)} m`,
  mainArea: `${fmt(sig(D.mainArea, 2))} m²`,
  mainsTotalArea: `${fmt(sig(D.mainsTotalArea, 2))} m²`,
  descentThree: `${fmt(D.descentThree, 1)} m/s`,
  descentTwo: `${fmt(D.descentTwo, 1)} m/s`,
  noChuteSpeed: `${fmt(sig(D.noChuteSpeed, 1))} m/s`,
  drogueSpeed: `${fmt(sig(D.drogueSpeed, 2))} m/s`,
  drogueMach: fmt(D.drogueMach, 1),
  suborbitalFallSpeed: kms(D.suborbitalFallSpeed, 1),
  suborbitalEnergyRatio: fmt(sig(D.suborbitalEnergyRatio, 2)),
  smDiameter: `${fmt(SERVICE_MODULE.diameter, 1)} m`,
  smLength: `${fmt(SERVICE_MODULE.length, 1)} m`,
  smMass: `${fmt(SERVICE_MODULE.mass)} kg`,
  smThrust: kN(SERVICE_MODULE.engineThrust),
  smIsp: `${SERVICE_MODULE.ispVac} s`,
  smDeorbitProp: `${fmt(sig(D.smDeorbitProp, 2))} kg`,
  smDeorbitBurn: `${fmt(sig(D.smDeorbitBurn, 2))} s`,
  smStackAtUndock: `${fmt(sig(D.smStackAtUndock, 3))} kg`,
  smPropAtUndock: `${fmt(PROFILE.smPropAtUndock)} kg`,
  smPropAfterDeorbit: `${fmt(sig(D.smPropAfterDeorbit, 2))} kg`,
  smMarginDv: `${fmt(sig(D.smMarginDv, 2))} m/s`,
  deorbitDv: `${fmt(D.deorbitDv)} m/s`,
  deorbitFraction: `${fmt((100 * D.deorbitDv) / D.leoSpeed, 1)} %`,
  towerLength: `${fmt(ABORT_TOWER.length, 1)} m`,
  towerMass: `${fmt(ABORT_TOWER.mass)} kg`,
  towerThrust: `${fmt(ABORT_TOWER.motorThrust / 1e6, 1)} MN`,
  lesTW: fmt(D.lesTW),
  crewHatchHeight: `${fmt(D.crewHatchHeight)} m`,
  padDeckHeight: `${fmt(PAD.deckHeight, 1)} m`,
  padNozzleExitHeight: `${fmt(PAD.nozzleExitHeight, 1)} m`,
  towerHeight: `${fmt(PAD.tower.height)} m`,
  towerOffset: `${fmt(Math.hypot(PAD.tower.x, PAD.tower.z), 1)} m`,
  landingZoneDistance: `${fmt(D.landingZoneDistance / 1e3, 1)} km`,
  xBandWavelength: `${fmt(D.xBandWavelength * 100, 1)} cm`,
  suborbitalFreeFall: `${fmt(sig(D.suborbitalFreeFall / 60, 1))} minutes`,
  suborbitalAboveKarman: `${fmt(sig(D.suborbitalAboveKarman / 60, 1))} minutes`,
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
  /** Capsule, service module and abort tower: what the station ascent lifts above the upper stage. */
  crewStackMass: `${fmt(PAYLOADS.capsule.mass + ABORT_TOWER.mass)} kg`,
  /** Satellite and fairing: what the LEO ascent lifts above the upper stage. */
  leoStackMass: `${fmt(PAYLOADS.leoSat.mass + FAIRING.mass)} kg`,
  researchCapsuleMass: `${fmt(PAYLOADS.researchCapsule.mass)} kg`,
};
