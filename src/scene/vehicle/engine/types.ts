/**
 * Engine model contract. One E-1 core (turbopump, gas generator, injector, regeneratively
 * cooled chamber and nozzle, valves, gimbal) in two versions: 'E-1' (sea-level nozzle) and
 * 'E-1V' (the same core with a radiatively cooled vacuum nozzle extension).
 *
 * ENGINE FRAME: metres, origin at the gimbal pivot, +Y up (toward the stage), the nozzle
 * pointing down (-Y). The nozzle exit plane is at y = -spec.length + (distance above gimbal of
 * the top of the powerhead)... use `exitY` from the returned model.
 */
import type * as THREE from 'three';
import type { PartId } from '../../../vehicle/parts';

export type EngineKind = 'E-1' | 'E-1V';
export type EngineDetail = 'hangar' | 'flight' | 'cluster';

export interface EngineOperating {
  /** Propellant flow / throttle 0..1 (drives valve state, flow highlight, pump speed). */
  flow: number;
  /** Turbopump shaft angle (rad), advanced by the caller (slowed and labelled in demos). */
  shaftAngle: number;
  /** Gimbal angles (deg): pitch about the model X axis, yaw about Z. */
  pitch: number;
  yaw: number;
  /** Gas generator running. */
  gg: boolean;
  /** Igniter flash 0..1. */
  ignite: number;
}

export interface EngineModel {
  kind: EngineKind;
  /** Pivot group (rotates for gimbal); place it at the gimbal point. */
  root: THREE.Group;
  parts: Map<PartId, THREE.Object3D[]>;
  /** Nozzle exit centre y (engine frame, negative) and radius. */
  exitY: number;
  exitRadius: number;
  /** Throat y and radius (for flow overlays). */
  throatY: number;
  throatRadius: number;
  setOperating(o: Partial<EngineOperating>): void;
  /** Section view: 0 = intact, 1 = fully cut (a quarter/half section with hatched faces). */
  setCut(amount: number): void;
  /** Show internal flow paths (fuel blue-ish, LOX pale blue, hot gas orange; labelled overlay). */
  setFlowOverlay(on: boolean): void;
  dispose(): void;
}
