/**
 * The E-1 / E-1V design: every station and size of the engine model, derived from the spec
 * (throat and exit diameters, expansion ratio, length) and from the vehicle stations, so the
 * model, the vehicle and the lessons agree. Pure numbers (no three.js).
 *
 * Engine frame: origin at the gimbal pivot, +Y toward the stage, nozzle toward -Y. The
 * section plane of the cutaway is z = 0 (the half z > 0 is removed); the turbopump axis lies
 * in that plane on the +X side so one cut opens the chamber and the turbomachinery together.
 */
import { E1, E1V, STATIONS, type EngineSpec } from '../../../vehicle/spec';
import { buildContour, radiusAt, wallNormal, xAtRadius, type Contour } from './contour';
import type { EngineKind } from './types';

export interface Design {
  kind: EngineKind;
  spec: EngineSpec;
  vac: boolean;
  contour: Contour;
  rt: number;
  rc: number;
  exitR: number;
  exitY: number;
  throatY: number;
  /** Injector face (top of the chamber). */
  injY: number;
  /** End of the channel-wall chamber / start of the tube-wall nozzle (x downstream of throat). */
  xChamberEnd: number;
  /** End of the regeneratively cooled nozzle (E-1: the exit; E-1V: the extension joint). */
  xRegenEnd: number;
  /** Liner hot wall, channel height, closeout jacket, tube diameter (m). */
  tw: number;
  hc: number;
  tj: number;
  tube: number;
  ribs: number;
  tubes: number;
  /** LOX dome: base radius, base y, crown height. */
  domeR: number;
  domeBaseY: number;
  domeH: number;
  /** Top of the feed-line interface flanges (fixed to the stage). */
  topY: number;
  /** Turbopump axis position (x, z = 0). */
  tpX: number;
  /** Notch in the chamber section (comb view of the coolant channels). */
  notch: { phi0: number; phi1: number; yTop: number; yBot: number };
  /** Coolant inlet manifold: axial station and torus centre radius (fits the 0.575 m envelope). */
  manifoldX: number;
  manifoldR: number;
  /** Radius (from the engine axis) of the turbine exhaust duct run beside the bell. */
  exhaustRunR: number;
  /** TVC actuator attach points: upper (fixed) radius/y, lower (chamber) radius/y, plan angles. */
  tvc: { rA: number; yA: number; rB: number; yB: number; phis: [number, number] };
  /** Turbine exhaust duct outlet (engine frame, for the effects: soot jet source). */
  ggExit: { x: number; y: number; z: number };
  /** Main LOX valve (ball, flow along +X) and main fuel valve (butterfly, flow down) centres. */
  mov: { x: number; y: number; z: number };
  mfv: { x: number; y: number; z: number };
  /** y of the throat-downstream x. */
  y(x: number): number;
  x(y: number): number;
  /** Inner (gas-side) wall radius at engine y. */
  rIn(y: number): number;
  /** Outer radius of the wall at engine y (chamber jacket or tube crowns). */
  rOut(y: number): number;
}

const DEG = Math.PI / 180;
/** Plan-view radius every E-1 part stays inside (exit radius 0.53 m plus a small margin). */
export const ENVELOPE_R = 0.575;
/** Axis distance of the turbine exhaust duct run (its heat-exchanger bulge and flanges fit the envelope). */
export const EXHAUST_RUN_R = 0.486;

export function engineDesign(kind: EngineKind): Design {
  const spec = kind === 'E-1' ? E1 : E1V;
  const vac = kind === 'E-1V';
  // exit plane from the vehicle stations (E-1: model origin at the first-stage nozzle exit)
  const exitY = vac ? -(STATIONS.s2Gimbal - STATIONS.s2NozzleExit) : -(STATIONS.s1Gimbal - STATIONS.s1NozzleExit);
  const rt = spec.throatDiameter / 2;
  const rc = 1.7 * rt;
  const exitR = spec.exitDiameter / 2;
  const injY = -0.36;
  const lStar = 1.15;
  // the throat position depends on the chamber length, which depends only on rt, rc, L*
  let contour = buildContour({ rt, rc, re: exitR, lStar, nozzleLength: 1.4 });
  let throatY = injY + contour.xInj;
  for (let k = 0; k < 3; k++) {
    contour = buildContour({ rt, rc, re: exitR, lStar, nozzleLength: throatY - exitY });
    throatY = injY + contour.xInj;
  }
  const tw = 0.003;
  const hc = 0.007;
  const tj = 0.008;
  const tube = 0.01;
  const xChamberEnd = xAtRadius(contour, rt * Math.sqrt(3.2));
  const xRegenEnd = vac ? xAtRadius(contour, rt * Math.sqrt(14)) : contour.xExit;
  const y = (x: number) => throatY - x;
  const x = (yy: number) => throatY - yy;
  const rIn = (yy: number) => radiusAt(contour, x(yy));
  const rOut = (yy: number) => {
    const xx = x(yy);
    const wall = xx <= xChamberEnd ? tw + hc + tj : tube;
    const n = wallNormal(contour, xx);
    return radiusAt(contour, xx) + wall * n[1];
  };
  const domeR = rc + 0.03;
  const cylBottomY = y(contour.xCylEnd);
  // Coolant inlet manifold: as low on the bell as the 0.575 m envelope allows (seven engines share
  // the booster base). E-1: the torus (tube radius 0.03) and the fuel line that drops onto it must
  // stay inside; the tube wall below it is a two-pass section (down and back up).
  let manifoldX = vac ? xRegenEnd - 0.07 : contour.xExit - 0.1;
  if (!vac) while (rOut(y(manifoldX)) > ENVELOPE_R - 0.089 && manifoldX > xChamberEnd + 0.3) manifoldX -= 0.005;
  const manifoldR = Math.min(rOut(y(manifoldX)) + 0.024, ENVELOPE_R - 0.065);

  // turbine exhaust duct end: outboard of the bell, inside the silhouette radius
  const ductR = 0.064;
  const exhaustRunR = EXHAUST_RUN_R;
  let ggY = -0.9;
  for (let yy = -0.9; yy > exitY; yy -= 0.01) {
    // E-1 bell sets the limit for both engines (same core, same duct)
    if (rOutE1(yy) + 0.012 > exhaustRunR - ductR) break;
    ggY = yy;
  }
  const ggPhi = 138 * DEG;
  const ggR = exhaustRunR;
  return {
    kind,
    spec,
    vac,
    contour,
    rt,
    rc,
    exitR,
    exitY,
    throatY,
    injY,
    xChamberEnd,
    xRegenEnd,
    tw,
    hc,
    tj,
    tube,
    ribs: vac ? 140 : 150,
    tubes: vac ? 160 : 180,
    domeR,
    domeBaseY: -0.25,
    domeH: 0.135,
    topY: 0.25,
    tpX: 0.41,
    notch: { phi0: 90 * DEG, phi1: 128 * DEG, yTop: injY - 0.045, yBot: cylBottomY - 0.005 },
    manifoldX,
    manifoldR,
    exhaustRunR,
    tvc: { rA: 0.4, yA: 0.085, rB: rc + tw + hc + tj + 0.048, yB: -0.56, phis: [45 * DEG, 315 * DEG] },
    ggExit: { x: ggR * Math.sin(ggPhi), y: ggY - 0.05, z: ggR * Math.cos(ggPhi) },
    mov: { x: -0.35, y: -0.19, z: 0 },
    mfv: { x: -0.4, y: -0.63, z: 0 },
    y,
    x,
    rIn,
    rOut,
  };
}

let e1Outer: ((y: number) => number) | null = null;
/** Outer radius of the E-1 bell at engine y (both engines route the same exhaust duct). */
function rOutE1(y: number): number {
  if (!e1Outer) {
    const d = engineDesignBare('E-1');
    e1Outer = d;
  }
  return e1Outer(y);
}

function engineDesignBare(kind: EngineKind): (y: number) => number {
  const spec = kind === 'E-1' ? E1 : E1V;
  const exitY = -(STATIONS.s1Gimbal - STATIONS.s1NozzleExit);
  const rt = spec.throatDiameter / 2;
  const rc = 1.7 * rt;
  let c = buildContour({ rt, rc, re: spec.exitDiameter / 2, lStar: 1.15, nozzleLength: 1.4 });
  let throatY = -0.36 + c.xInj;
  for (let k = 0; k < 3; k++) {
    c = buildContour({ rt, rc, re: spec.exitDiameter / 2, lStar: 1.15, nozzleLength: throatY - exitY });
    throatY = -0.36 + c.xInj;
  }
  return (y: number) => {
    const x = throatY - y;
    if (x < 0) return rc + 0.018;
    const n = wallNormal(c, x);
    return radiusAt(c, x) + 0.01 * n[1];
  };
}
