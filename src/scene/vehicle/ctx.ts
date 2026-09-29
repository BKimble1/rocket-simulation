/** Shared build context and the moving-part handles the model animates. */
import type * as THREE from 'three';
import type { BodyId } from '../../vehicle/parts';
import type { EngineModel } from './engine/types';
import type { VehicleConfig } from './types';
import type { Kit, Section } from './kit';
import type { VehicleMats } from './mats';
import type { TankId } from './tanks';
import type { RigInstances } from './instancing';

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
  /**
   * Drawn as instance `instance` of the baked outer-engine cluster (then `engine` is the shared
   * template model, not in the scene, and `mount` is only a pose carrier).
   */
  instance?: number;
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
  /** One merged mesh holds every boot; this boot's vertices start at `offset`. */
  mesh: THREE.Mesh;
  offset: number;
  segs: number;
  engine: EngineMount;
  /** Top ring (plate hole) and bottom ring (on the nozzle, engine frame) radii and heights. */
  rTop: number;
  yTop: number;
  rBot: number;
  yBotEngine: number;
  folds: number;
}

export interface FlowPath {
  kind: 'lox' | 'rp1' | 'he' | 'sig';
  demo: 'feed-flow' | 'tank-pressure' | 'gnc-loop';
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
  /** Instanced rigs (one posed template each), updated after posing. */
  inst: { legs: RigInstances | null; fins: RigInstances | null; collets: RigInstances | null; pushers: RigInstances | null };
  /** Instanced outer booster engines: meshes and a per-instance matrix writer. */
  cluster: { meshes: THREE.InstancedMesh[]; set(i: number, m: THREE.Matrix4): void; commit(): void } | null;
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
