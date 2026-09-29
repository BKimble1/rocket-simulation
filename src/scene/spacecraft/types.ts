/**
 * Spacecraft model contract (payloads carried by the K-1, and the station).
 * Geometry is authored in the vehicle MODEL FRAME (see scene/vehicle/types.ts), stacked with
 * its base on the payload interface plane at y = mountY (53.9 on the upper stage; the top of
 * the booster's capsule adapter for the suborbital stack). The station is authored about its
 * own centre (mountY ignored) in a local-vertical frame: +Y zenith (away from Earth), +X along
 * its velocity; its capsule docking port faces nadir (-Y), for an approach from below along the
 * radial line. anchors.dockPort gives the exact point and axis.
 */
import type * as THREE from 'three';
import type { BodyId, PartId } from '../../vehicle/parts';
import type { PayloadConfig, VehicleVisualState } from '../vehicle/types';

export type SpacecraftKind = PayloadConfig | 'station';

export interface SpacecraftAnchors {
  satRcs: THREE.Vector3[];
  satApogee: { exit: THREE.Vector3; exitRadius: number } | null;
  capsuleRcs: THREE.Vector3[];
  smEngine: { exit: THREE.Vector3; exitRadius: number } | null;
  smRcs: THREE.Vector3[];
  lesNozzles: THREE.Vector3[];
  /** Docking port centre and outward axis (capsule, or station). */
  dockPort: { pos: THREE.Vector3; axis: THREE.Vector3 } | null;
  /** Parachute riser attach point (capsule). */
  chuteAttach: THREE.Vector3 | null;
  /** Top of the stack (for the fairing envelope check and framing). */
  topY: number;
}

export interface SpacecraftModel {
  kind: SpacecraftKind;
  /** leoSat/gtoSat/lunarProbe → satellite; capsule → capsule, service, les; researchCapsule → capsule; station → station. */
  bodies: Partial<Record<BodyId, THREE.Group>>;
  parts: Map<PartId, THREE.Object3D[]>;
  anchors: SpacecraftAnchors;
  setState(s: Partial<VehicleVisualState>): void;
  setCut(amount: number): void;
  animate(t: number, demo: string | null, progress: number): void;
  dispose(): void;
}

/** Payload interface plane heights (model frame). */
export const MOUNT_Y = { upperStage: 53.9, boosterCapsuleAdapter: 39.6 };
