/** Shared build context and the moving-part handles the model animates. */
import type * as THREE from 'three';
import type { BodyId } from '../../vehicle/parts';
import type { EngineModel } from './engine/types';
import type { VehicleConfig } from './types';
import type { Kit, Section } from './kit';
import type { VehicleMats } from './mats';
import type { TankId } from './tanks';

export interface EngineMount {
  id: string;
  kind: 'E-1' | 'E-1V';
  centre: boolean;
  /** Group at the gimbal point (rotated about Y so the turbopump faces outboard). */
  mount: THREE.Group;
  engine: EngineModel;
  /** Yaw of the mount about the vehicle axis (rad). */
  yaw: number;
  /** True if the engine model swings itself in setOperating; otherwise the mount is rotated. */
  selfGimbal: boolean;
  /** Gimbal point (model frame). */
  pivot: THREE.Vector3;
}

export interface LegRig {
  hinge: THREE.Group;
  leg: THREE.Group;
  pad: THREE.Group;
  strutOuter: THREE.Object3D;
  strutInner: THREE.Object3D;
  /** Strut attach points: B in the hinge frame (fixed), P in the leg frame. */
  B: THREE.Vector3;
  P: THREE.Vector3;
}

export interface FinRig {
  fold: THREE.Group;
  deflect: THREE.Group;
}

export interface BootRig {
  mesh: THREE.Mesh;
  engine: EngineMount;
  /** Top ring (plate hole) and bottom ring (on the nozzle, engine frame) radii and heights. */
  rTop: number;
  yTop: number;
  rBot: number;
  yBotEngine: number;
  folds: number;
}

export interface FlowPath {
  kind: 'lox' | 'rp1' | 'he';
  demo: 'feed-flow' | 'tank-pressure';
  points: THREE.Vector3[];
  radius: number;
  section: Section;
}

export interface Movers {
  engines: EngineMount[];
  legs: LegRig[];
  fins: FinRig[];
  boots: BootRig[];
  collets: THREE.Group[];
  pusherRods: THREE.Group[];
  fairing: { A: THREE.Group | null; B: THREE.Group | null };
  /** Sandwich layers that the 'sandwich-panel' demo separates slightly (radial scale). */
  sandwichLayers: { obj: THREE.Object3D; dir: 1 | -1 }[];
}

export interface Ctx {
  kit: Kit;
  mats: VehicleMats;
  config: VehicleConfig;
  hangar: boolean;
  /** Content group of each body (inside the body group the integration poses). */
  content: Partial<Record<BodyId, THREE.Group>>;
  maxTex: number;
  movers: Movers;
  flows: FlowPath[];
  liquids: { tank: TankId; section: Section }[];
  s1Rcs: THREE.Vector3[];
  s2Rcs: THREE.Vector3[];
  vents: THREE.Vector3[];
}
