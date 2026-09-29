/**
 * Collects engine geometry by (moving node, cut role, part, material) and merges each bucket
 * into one mesh: few draw calls, one material per mesh, every mesh tagged with its part and
 * material family. Roles: 'keep' stays in the section view, 'front' is the half that slides
 * and fades away, 'cap' / 'fcap' are hatched section faces (visible only while cut), 'capx'
 * is section detail drawn in its own material (e.g. drilled passages).
 *
 * Hangar detail keeps one mesh per part (the parts are picked and framed one by one). Flight
 * and cluster detail merge across parts (each mesh is tagged with its dominant part) and fold
 * look-alike materials together, so an engine costs about 20 (flight) or 9 (cluster) draw calls.
 */
import * as THREE from 'three';
import type { PartId } from '../../../vehicle/parts';
import { merge, type SweepResult, type ClippedTube } from './geo';
import { HATCH_OF, HATCH_TILE, MATERIAL_OF, type EMat, type MaterialSet } from './mats';
import type { EngineDetail } from './types';

export type Role = 'keep' | 'front' | 'cap' | 'fcap' | 'capx';
export type NodeId = 'fixed' | 'cross' | 'gimbal' | 'rotor' | 'mov' | 'mfv';

/**
 * Qualitative temperature class for the thermal lens (userData.thermal): 0 cryogenic (touches
 * LOX), 1 ambient (RP-1, valves, structure), 2 warm, 3 hot (turbine side, regen nozzle, turbine
 * exhaust), 4 very hot (holds combustion gas: chamber, throat, gas generator, extension).
 */
export type Thermal = 0 | 1 | 2 | 3 | 4;

export interface Tag {
  part: PartId;
  mat: EMat;
  node?: NodeId;
  /** Belongs to the removable front half. */
  front?: boolean;
  /** Thermal class; when omitted it follows from the part and material (see thermalOf). */
  thermal?: Thermal;
}

/** Default thermal class of engine geometry by part and material (explicit tags override it). */
export function thermalOf(part: PartId, mat: EMat): Thermal {
  switch (part) {
    case 'combustion-chamber':
    case 'gas-generator':
    case 'nozzle-extension':
      return 4;
    case 'nozzle':
      return 3;
    case 'injector':
      // the faceplate, baffles and drilled face see the combustion gas; the body carries propellant
      return mat === 'faceplate' || mat === 'soot' || mat === 'inconel' ? 4 : 1;
    case 'turbopump':
      return mat === 'inconel' || mat === 'inconelHot' ? 3 : 1;
    default:
      return 1;
  }
}

interface Bucket {
  /** Triangles per part (the mesh is tagged with the dominant one when parts are merged). */
  parts: Map<PartId, number>;
  /** Triangles per thermal class (merged meshes take the dominant class). */
  therm: Map<Thermal, number>;
  mat: EMat;
  node: NodeId;
  role: Role;
  geos: THREE.BufferGeometry[];
}

export interface NodeGroups {
  keep: THREE.Group;
  /** The removable half (slides along +Z and fades). */
  front: THREE.Group;
  /** Hatched section faces of the kept half (shown while cut). */
  caps: THREE.Group;
  /** Hatched section faces of the removable half (child of `front`, shown while cut). */
  fcaps: THREE.Group;
}

/** Look-alike materials folded together in the lighter details (seen from metres away). */
const FLIGHT_MAT: Partial<Record<EMat, EMat>> = { steel: 'stainless', bronze: 'stainless', machined: 'stainless', ceramic: 'stainless', braid: 'anodized' };
const CLUSTER_MAT: Partial<Record<EMat, EMat>> = {
  ...FLIGHT_MAT,
  copper: 'jacket',
  faceplate: 'jacket',
  chrome: 'gimbal',
  braid: 'stainless',
  anodized: 'stainless',
  titanium: 'aluminum',
  inconel: 'inconelHot',
  ggHot: 'inconelHot',
  soot: 'inconelHot',
};

/** Planar UVs in metres / HATCH_TILE, projected along the dominant normal axis. */
function hatchUV(g: THREE.BufferGeometry) {
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const az = Math.abs(n.getZ(i));
    let u: number;
    let v: number;
    if (az >= ax && az >= ay) {
      u = p.getX(i);
      v = p.getY(i);
    } else if (ay >= ax) {
      u = p.getX(i);
      v = p.getZ(i);
    } else {
      u = p.getZ(i);
      v = p.getY(i);
    }
    uv[i * 2] = u / HATCH_TILE;
    uv[i * 2 + 1] = v / HATCH_TILE;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

export class Kit {
  readonly buckets = new Map<string, Bucket>();
  /** Section geometry is only produced in hangar detail. */
  readonly section: boolean;
  /** Merge across parts (flight and cluster detail). */
  private readonly mergeParts: boolean;
  private readonly matMap: Partial<Record<EMat, EMat>>;
  constructor(
    readonly pivots: Record<NodeId, THREE.Vector3>,
    readonly detail: EngineDetail,
  ) {
    this.section = detail === 'hangar';
    this.mergeParts = detail !== 'hangar';
    this.matMap = detail === 'cluster' ? CLUSTER_MAT : detail === 'flight' ? FLIGHT_MAT : {};
  }

  /** Largest turn (rad) between samples of the nozzle contour for this detail. */
  get contourTurn(): number {
    return this.detail === 'hangar' ? (2.2 * Math.PI) / 180 : this.detail === 'flight' ? (5 * Math.PI) / 180 : (9 * Math.PI) / 180;
  }

  private push(g: THREE.BufferGeometry | null | undefined, part: PartId, mat0: EMat, node0: NodeId, role: Role, thermal?: Thermal) {
    if (!g || !g.attributes.position || g.attributes.position.count === 0) return;
    const mat = this.matMap[mat0] ?? mat0;
    const th = thermal ?? thermalOf(part, mat0);
    // the cluster engine hides its gimbal cross under the thrust structure: it rides on the mount
    const node = this.detail === 'cluster' && node0 === 'cross' ? 'fixed' : node0;
    if (role === 'cap' || role === 'fcap') hatchUV(g);
    const pv = this.pivots[node];
    if (pv.lengthSq() > 0) g.translate(-pv.x, -pv.y, -pv.z);
    // section faces of the removable half are never picked: one mesh per hatch style will do
    // hangar meshes are split by thermal class too (LOX and RP-1 lines share part and material)
    const key = role === 'fcap' ? `${node}|fcap|${HATCH_OF[mat]}` : this.mergeParts ? `${node}|${role}|${mat}` : `${node}|${role}|${part}|${mat}|${th}`;
    let b = this.buckets.get(key);
    if (!b) {
      b = { parts: new Map(), therm: new Map(), mat, node, role, geos: [] };
      this.buckets.set(key, b);
    }
    const tris = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    b.parts.set(part, (b.parts.get(part) ?? 0) + tris);
    b.therm.set(th, (b.therm.get(th) ?? 0) + tris);
    b.geos.push(g);
  }

  /** Surface geometry given in the engine frame. */
  add(g: THREE.BufferGeometry | null | undefined, t: Tag) {
    this.push(g, t.part, t.mat, t.node ?? 'gimbal', t.front ? 'front' : 'keep', t.thermal);
  }

  /** Hatched section face geometry. */
  section_(g: THREE.BufferGeometry | null | undefined, t: Tag) {
    if (!this.section) {
      g?.dispose();
      return;
    }
    this.push(g, t.part, t.mat, t.node ?? 'gimbal', t.front ? 'fcap' : 'cap', t.thermal);
  }

  /** Section detail in its own (non-hatched) material, shown only in the section view. */
  detail_(g: THREE.BufferGeometry | null | undefined, t: Tag) {
    if (!this.section) {
      g?.dispose();
      return;
    }
    this.push(g, t.part, t.mat, t.node ?? 'gimbal', 'capx', t.thermal);
  }

  sweep(r: SweepResult, t: Tag) {
    this.add(r.surf, t);
    this.section_(r.cut, t);
    this.section_(r.caps, t);
  }

  tube(r: ClippedTube, t: Tag) {
    this.sweep(r.back, { ...t, front: t.front ?? false });
    this.sweep(r.front, { ...t, front: true });
  }

  /** Build merged meshes into the node groups. */
  build(mats: MaterialSet, groups: Record<NodeId, NodeGroups>, alias?: (p: PartId) => PartId): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const b of this.buckets.values()) {
      const geo = merge(b.geos);
      geo.computeBoundingSphere();
      geo.computeBoundingBox();
      const mesh = new THREE.Mesh(geo, mats.get(b.mat, b.role === 'capx' ? 'keep' : b.role));
      let part: PartId = 'engine';
      let best = -1;
      for (const [p, n] of b.parts)
        if (n > best) {
          best = n;
          part = p;
        }
      let thermal: Thermal = 1;
      best = -1;
      for (const [th, n] of b.therm)
        if (n > best) {
          best = n;
          thermal = th;
        }
      mesh.userData.thermal = thermal;
      const shown = alias ? alias(part) : part;
      mesh.userData.part = shown;
      if (shown !== part) mesh.userData.subPart = part;
      const mid = MATERIAL_OF[b.mat];
      if (mid) mesh.userData.material = mid;
      mesh.userData.role = b.role;
      mesh.name = `${part}:${b.mat}:${b.role}`;
      const g = groups[b.node];
      (b.role === 'keep' ? g.keep : b.role === 'front' ? g.front : b.role === 'fcap' ? g.fcaps : g.caps).add(mesh);
      out.push(mesh);
    }
    this.buckets.clear();
    return out;
  }
}
