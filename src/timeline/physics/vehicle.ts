/**
 * Vehicle numbers for the trajectory model, all derived from src/vehicle/spec.ts: engine
 * performance (thrust with the ambient-pressure term), tank geometry (liquid level and
 * centroid), and the mass and centre of mass of every body in the MODEL FRAME (+Y toward the
 * nose, origin at the first-stage nozzle exit plane).
 *
 * Modelling assumptions (stated in the report and in ACCURACY.md):
 *  - S1.dry includes the grid fins and the cold-gas system; the landing legs (LEGS.mass) are
 *    added on the recovery variant.
 *  - Pressure thrust uses an effective exit area derived from the spec's vacuum and sea-level
 *    thrust, (thrustVac - thrustSL) / p0, so sea-level thrust and Isp match the spec exactly;
 *    the geometric exit diameter in spec.ts implies an area about 19 % larger (a 1.9 % lower
 *    sea-level thrust): see ENGINE_NOTES.
 *  - Dry masses sit at simple centroids (engines near the gimbal, the rest mid-structure).
 */
import { ABORT_TOWER, BODY_RADIUS, CAPSULE, DOME_HEIGHT, E1, E1V, FAIRING, G0, LEGS, PAYLOADS, PROPELLANTS, S1, S2, SERVICE_MODULE, STATIONS, type EngineSpec, type PayloadId } from '../../vehicle/spec';
import { MOUNT_Y } from '../../scene/spacecraft/types';
import type { BodyId } from '../../vehicle/parts';
import { v3, type V3 } from './vec';

export const P0 = 101325;

// ───────────────────────────── engines ─────────────────────────────

export interface EngineModel {
  id: string;
  /** Vacuum thrust per engine at full throttle (N). */
  thrustVac: number;
  /** Mass flow per engine at full throttle (kg/s): thrustVac / (Isp_vac g0). */
  mdot: number;
  /** Area for the ambient-pressure thrust loss (m^2). */
  area: number;
  minThrottle: number;
  ispVac: number;
}

function engineModel(e: EngineSpec): EngineModel {
  const mdot = e.thrustVac / (e.ispVac * G0);
  const geom = Math.PI * (e.exitDiameter / 2) ** 2;
  const area = e.thrustSL !== null ? (e.thrustVac - e.thrustSL) / P0 : geom;
  return { id: e.id, thrustVac: e.thrustVac, mdot, area, minThrottle: e.minThrottle, ispVac: e.ispVac };
}

export const ENG_S1 = engineModel(E1);
export const ENG_S2 = engineModel(E1V);
/** Service-module main engine (hypergolic, NTO/MMH): vacuum only. */
export const ENG_SM: EngineModel = { id: 'SM', thrustVac: SERVICE_MODULE.engineThrust, mdot: SERVICE_MODULE.engineThrust / (SERVICE_MODULE.ispVac * G0), area: 0, minThrottle: 1, ispVac: SERVICE_MODULE.ispVac };
/** Satellite liquid apogee engine: 450 N representative, Isp 320 s (bipropellant). */
export const ENG_SAT: EngineModel = { id: 'LAE', thrustVac: 450, mdot: 450 / (320 * G0), area: 0, minThrottle: 1, ispVac: 320 };
/**
 * Abort-tower jettison motor (a small solid motor at the top of the tower, separate from the
 * 1.8 MN abort motor in spec.ts): 180 kN for 1.5 s, representative.
 */
export const ENG_LES_JETTISON: EngineModel = { id: 'LESJ', thrustVac: 180e3, mdot: 180e3 / (220 * G0), area: 0, minThrottle: 1, ispVac: 220 };

/** Thrust of n engines at throttle th and ambient pressure p (N). */
export function thrustOf(e: EngineModel, n: number, th: number, p: number): number {
  if (th <= 0 || n <= 0) return 0;
  return Math.max(0, n * (th * e.thrustVac - p * e.area));
}

export const ENGINE_NOTES = {
  s1GeometricExitArea: Math.PI * (E1.exitDiameter / 2) ** 2,
  s1EffectiveExitArea: ENG_S1.area,
  s1SeaLevelThrustWithGeometricArea: E1.thrustVac - P0 * Math.PI * (E1.exitDiameter / 2) ** 2,
};

// ───────────────────────────── tanks ─────────────────────────────

const R = BODY_RADIUS;
const HD = DOME_HEIGHT;
const AREA = Math.PI * R * R;
const domeFrac = (d: number) => Math.max(0, 1 - (d / HD) ** 2);

export interface TankGeom {
  id: string;
  y0: number;
  y1: number;
  /** Liquid cross-section at height y (m^2). */
  area(y: number): number;
  density: number;
  /** Cumulative volume and first moment tables (built lazily). */
  _tab?: { y: Float64Array; V: Float64Array; M: Float64Array };
}

const S = STATIONS;
function standardTank(id: string, aftApex: number, aftEq: number, fwdEq: number, fwdApex: number, density: number): TankGeom {
  return {
    id,
    y0: aftApex,
    y1: fwdApex,
    density,
    area: (y) => (y < aftEq ? AREA * domeFrac(aftEq - y) : y <= fwdEq ? AREA : AREA * domeFrac(y - fwdEq)),
  };
}

export const TANKS = {
  s1Rp1: standardTank('s1Rp1', S.s1FuelAftApex, S.s1FuelAftEquator, S.s1FuelFwdEquator, S.s1FuelFwdApex, PROPELLANTS.rp1.density),
  s1Lox: standardTank('s1Lox', S.s1LoxAftApex, S.s1LoxAftEquator, S.s1LoxFwdEquator, S.s1LoxFwdApex, PROPELLANTS.lox.density),
  // upper-stage fuel: aft dome, barrel, then an annulus around the common bulkhead dome that bulges down into it
  s2Rp1: {
    id: 's2Rp1',
    y0: S.s2FuelAftApex,
    y1: S.s2CommonBulkheadEquator,
    density: PROPELLANTS.rp1.density,
    area: (y: number) => (y < S.s2FuelAftEquator ? AREA * domeFrac(S.s2FuelAftEquator - y) : y < S.s2CommonBulkheadApex ? AREA : AREA * (1 - domeFrac(S.s2CommonBulkheadEquator - y))),
  } as TankGeom,
  // upper-stage LOX: sits in the bowl of the common bulkhead, barrel, forward dome
  s2Lox: standardTank('s2Lox', S.s2CommonBulkheadApex, S.s2CommonBulkheadEquator, S.s2LoxFwdEquator, S.s2LoxFwdApex, PROPELLANTS.lox.density),
};

function table(t: TankGeom) {
  if (t._tab) return t._tab;
  const n = 400;
  const y = new Float64Array(n + 1);
  const V = new Float64Array(n + 1);
  const M = new Float64Array(n + 1);
  const h = (t.y1 - t.y0) / n;
  for (let i = 0; i <= n; i++) y[i] = t.y0 + i * h;
  for (let i = 1; i <= n; i++) {
    // Simpson on each slice
    const a = t.area(y[i - 1]);
    const m = t.area(y[i - 1] + h / 2);
    const b = t.area(y[i]);
    const dv = (h / 6) * (a + 4 * m + b);
    const dm = (h / 6) * (a * y[i - 1] + 4 * m * (y[i - 1] + h / 2) + b * y[i]);
    V[i] = V[i - 1] + dv;
    M[i] = M[i - 1] + dm;
  }
  t._tab = { y, V, M };
  return t._tab;
}

/** Gross tank volume (m^3). */
export const tankCapacity = (t: TankGeom): number => {
  const tb = table(t);
  return tb.V[tb.V.length - 1];
};

/** Liquid of `mass` kg settled at the aft end: free-surface height and centroid (model y, m). */
export function liquid(t: TankGeom, mass: number): { level: number; centroid: number } {
  const tb = table(t);
  const vol = Math.max(0, mass) / t.density;
  if (vol <= 1e-9) return { level: t.y0, centroid: t.y0 };
  const n = tb.V.length - 1;
  if (vol >= tb.V[n]) return { level: t.y1, centroid: tb.M[n] / tb.V[n] };
  let lo = 0;
  let hi = n;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (tb.V[mid] <= vol) lo = mid;
    else hi = mid;
  }
  const u = (vol - tb.V[lo]) / (tb.V[hi] - tb.V[lo]);
  const level = tb.y[lo] + (tb.y[hi] - tb.y[lo]) * u;
  const mom = tb.M[lo] + (tb.M[hi] - tb.M[lo]) * u;
  return { level, centroid: mom / vol };
}

// ───────────────────────────── bodies ─────────────────────────────

export interface MassItem {
  m: number;
  c: V3;
  /** Which body the item belongs to (used when a stack splits). */
  tag?: BodyId;
}

const MR1 = E1.mixtureRatio;
const MR2 = E1V.mixtureRatio;

/** Booster dry mass items (model frame). */
export function boosterDry(recovery: boolean): MassItem[] {
  const engines = S1.engineCount * E1.mass;
  const items: MassItem[] = [
    { m: engines, c: v3(0, 1.6, 0), tag: 'booster' },
    { m: S1.dry - engines, c: v3(0, 21.0, 0), tag: 'booster' },
  ];
  if (recovery) items.push({ m: LEGS.mass, c: v3(0, LEGS.hingeY + LEGS.stowedLength / 2, 0), tag: 'booster' });
  return items;
}

/** Upper-stage dry mass items (engine low, structure mid-stage, adapter included). */
export function upperDry(): MassItem[] {
  return [
    { m: E1V.mass, c: v3(0, 43.0, 0), tag: 'upper' },
    { m: S2.dry - E1V.mass, c: v3(0, 49.2, 0), tag: 'upper' },
  ];
}

/**
 * Fairing half COM. `open` = 1 after the hinge rotation (~25 deg outward about the base hinge on
 * the outer skin); fairingA is the +Z half.
 */
export function fairingHalf(side: 'A' | 'B', open: number): MassItem {
  const s = side === 'A' ? 1 : -1;
  const hinge = { y: STATIONS.fairingBase, z: s * (FAIRING.diameter / 2) };
  const com = { y: 58.9, z: s * ((2 * FAIRING.diameter) / 2 / Math.PI) };
  const a = s * FAIRING_OPEN_ANGLE * open;
  const dy = com.y - hinge.y;
  const dz = com.z - hinge.z;
  return { m: FAIRING.mass / 2, c: v3(0, hinge.y + dy * Math.cos(a) - dz * Math.sin(a), hinge.z + dy * Math.sin(a) + dz * Math.cos(a)), tag: side === 'A' ? 'fairingA' : 'fairingB' };
}
export const FAIRING_OPEN_ANGLE = (25 * Math.PI) / 180;

/** Payload COMs (model frame). */
export const PAYLOAD_COM: Record<PayloadId, V3> = {
  leoSat: v3(0, MOUNT_Y.upperStage + 0.9 + 1.9, 0),
  gtoSat: v3(0, MOUNT_Y.upperStage + 0.9 + 2.0, 0),
  lunarProbe: v3(0, MOUNT_Y.upperStage + 0.9 + 1.2, 0),
  capsule: v3(0, 57.8, 0),
  researchCapsule: v3(0, MOUNT_Y.boosterCapsuleAdapter + 1.1, 0),
};

/** Crew-vehicle bodies (station mission and return). */
export const CAPSULE_ITEM: MassItem = { m: CAPSULE.mass, c: v3(0, MOUNT_Y.upperStage + SERVICE_MODULE.length + 1.05, 0), tag: 'capsule' };
/** Service module: dry + propellant counted separately (propellant for phasing, deorbit). */
export const SM_DRY = 2600;
export const SM_PROP_FULL = SERVICE_MODULE.mass - SM_DRY;
/** Service-module propellant at launch (full). */
export const SM_PROP_LAUNCH = SM_PROP_FULL;
export const SM_COM = v3(0, MOUNT_Y.upperStage + SERVICE_MODULE.length / 2, 0);
export const LES_ITEM: MassItem = { m: ABORT_TOWER.mass, c: v3(0, MOUNT_Y.upperStage + SERVICE_MODULE.length + CAPSULE.height + 2.6, 0), tag: 'les' };
export const LES_JETTISON_PROP = ENG_LES_JETTISON.mdot * 1.5;

/** Research capsule and its adapter (suborbital). */
export const RESEARCH_CAPSULE_ITEM: MassItem = { m: PAYLOADS.researchCapsule.mass, c: PAYLOAD_COM.researchCapsule, tag: 'capsule' };

/** First-stage propellant items (LOX and RP-1 at their liquid centroids). */
export function s1PropItems(prop: number): MassItem[] {
  const lox = (prop * MR1) / (1 + MR1);
  const rp1 = prop / (1 + MR1);
  return [
    { m: lox, c: v3(0, liquid(TANKS.s1Lox, lox).centroid, 0) },
    { m: rp1, c: v3(0, liquid(TANKS.s1Rp1, rp1).centroid, 0) },
  ];
}
export function s2PropItems(prop: number): MassItem[] {
  const lox = (prop * MR2) / (1 + MR2);
  const rp1 = prop / (1 + MR2);
  return [
    { m: lox, c: v3(0, liquid(TANKS.s2Lox, lox).centroid, 0) },
    { m: rp1, c: v3(0, liquid(TANKS.s2Rp1, rp1).centroid, 0) },
  ];
}

export function sumMass(items: MassItem[]): { m: number; c: V3 } {
  let m = 0;
  let x = 0;
  let y = 0;
  let z = 0;
  for (const it of items) {
    m += it.m;
    x += it.m * it.c.x;
    y += it.m * it.c.y;
    z += it.m * it.c.z;
  }
  return { m, c: m > 0 ? v3(x / m, y / m, z / m) : v3() };
}

/** Frontal area of a body diameter (m^2). */
export const areaOf = (d: number) => Math.PI * (d / 2) ** 2;

/** Height of the first-stage nozzle exit above the ground when standing on deployed legs (m). */
export const LANDED_NOZZLE_HEIGHT = -(LEGS.hingeY + LEGS.stowedLength * Math.cos((LEGS.deployedAngleDeg * Math.PI) / 180));

/**
 * Capsule docking-port face (model frame y, capsule on the stack): the heat-shield nadir sits
 * 0.39 m below the service module's top ring (spherical shield of radius 4.6 m meeting r = 1.85 m)
 * and the docking ring face is 3.15 m above the nadir, as in the spacecraft model
 * (scene/spacecraft/capsule.ts, whose anchors are only available at render time).
 */
export const CAPSULE_DOCK_Y = MOUNT_Y.upperStage + SERVICE_MODULE.length - 0.39 + 3.15;
/** Station nadir docking port face, station frame (scene/spacecraft/station.ts anchors.dockPort). */
export const STATION_DOCK = v3(0, -3.24, 0);
/** Station mass (kg), illustrative (only telemetry uses it). */
export const STATION_MASS = 420_000;

/** Body lengths (m) for the pitch moment of inertia used by the gimbal channels. */
export const BODY_LENGTH: Partial<Record<BodyId, number>> = { booster: S1.length, upper: STATIONS.fairingTip - STATIONS.interstageTop };

export const S1_PROP = S1.propellant;
export const S2_PROP = S2.propellant;
