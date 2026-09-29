/**
 * Contracts between the vehicle model, the engines, the effects, the director and the UI.
 *
 * MODEL FRAME (shared by every body): metres, +Y along the vehicle axis toward the nose,
 * origin on the axis at the first-stage nozzle exit plane. On the pad the model frame is the pad
 * frame (x east, y up, z south): the service tower stands on the -X side and the KIMBLE livery
 * faces +Z (south, toward the main pad cameras). Every body's geometry is authored at its stacked
 * position in this frame, so attached bodies share one pose and a separated body keeps its
 * geometry where it was. The mission timeline gives each body the pose of this frame's origin.
 */
import type * as THREE from 'three';
import type { BodyId, PartId } from '../../vehicle/parts';
import type { MaterialId } from '../../content/materials/ids';

export type PayloadConfig = 'leoSat' | 'gtoSat' | 'lunarProbe' | 'capsule' | 'researchCapsule';

export interface VehicleConfig {
  payload: PayloadConfig;
  /** Recovery hardware on the booster (grid fins, legs, cold-gas RCS). */
  recovery: boolean;
  /** 'full' two-stage stack, or the booster alone carrying the research capsule (suborbital). */
  stack: 'full' | 'boosterOnly';
  /** 'hangar' = full close-up detail; 'flight' = lighter geometry for the flight world. */
  detail: 'hangar' | 'flight';
}

/** Visual state that changes during a mission (all 0..1 unless stated). */
export interface VehicleVisualState {
  legs: number;
  fins: number;
  finDeflect: number; // deg
  fairingOpen: number;
  satArrays: number;
  satAntenna: number;
  smArrays: number;
  capDrogue: number;
  capMain: number; // 0 stowed, 0.5 reefed, 1 open
  capNoseCone: number;
  capChar: number;
  s1Lox: number;
  s1Rp1: number;
  s2Lox: number;
  s2Rp1: number;
  s1GimbalPitch: number; // deg
  s1GimbalYaw: number;
  s2GimbalPitch: number;
  frost: number; // LOX-tank frost on the pad 0..1
  entryScorch: number; // booster soot after entry 0..1
}

export type ViewMode = 'intact' | 'cutaway' | 'exploded';

export interface VehicleViewState {
  mode: ViewMode;
  /** Animated 0..1 progress of the cutaway opening or the explosion. */
  amount: number;
  highlight: PartId | null;
  /** Parts to fade (e.g. everything except the selected system). */
  dimOthers: boolean;
  lens: 'systems' | 'materials';
  material: MaterialId | null;
}

/** Points the effects and the camera attach to (model frame). */
export interface VehicleAnchors {
  s1Nozzles: { id: string; exit: THREE.Vector3; exitRadius: number; centre: boolean }[];
  s2Nozzle: { exit: THREE.Vector3; exitRadius: number };
  s1Rcs: THREE.Vector3[];
  s2Rcs: THREE.Vector3[];
  capsuleRcs: THREE.Vector3[];
  smEngine: { exit: THREE.Vector3; exitRadius: number } | null;
  lesNozzles: THREE.Vector3[];
  satApogee: { exit: THREE.Vector3; exitRadius: number } | null;
  /** LOX vent points on the pad (boil-off). */
  vents: THREE.Vector3[];
  /** Centre of mass estimate per body at full load (model frame). */
  com: Partial<Record<BodyId, THREE.Vector3>>;
}

export interface VehicleModel {
  config: VehicleConfig;
  root: THREE.Group;
  /** One group per body; set its position/quaternion from the body's sampled pose. */
  bodies: Partial<Record<BodyId, THREE.Group>>;
  /** Render nodes of each part (for highlighting, focus framing and picking). */
  parts: Map<PartId, THREE.Object3D[]>;
  anchors: VehicleAnchors;
  setState(s: Partial<VehicleVisualState>): void;
  setView(v: Partial<VehicleViewState>): void;
  /** Animate mechanisms for demonstrations (stage-clock seconds, demo id, 0..1 progress). */
  animate(t: number, demo: string | null, progress: number): void;
  /** World-space bounds of a part (after the current view's offsets). */
  partBox(id: PartId, out: THREE.Box3): THREE.Box3 | null;
  dispose(): void;
}
