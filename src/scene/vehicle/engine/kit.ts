/**
 * Collects engine geometry by (moving node, cut role, part, material) and merges each bucket
 * into one mesh: few draw calls, one material per mesh, every mesh tagged with its part and
 * material family. Roles: 'keep' stays in the section view, 'front' is the half that slides
 * and fades away, 'cap' / 'fcap' are hatched section faces (visible only while cut), 'capx'
 * is section detail drawn in its own material (e.g. drilled passages).
 */
import * as THREE from 'three';
import type { PartId } from '../../../vehicle/parts';
import { merge, type SweepResult, type ClippedTube } from './geo';
import { HATCH_TILE, MATERIAL_OF, type EMat, type MaterialSet } from './mats';

export type Role = 'keep' | 'front' | 'cap' | 'fcap' | 'capx';
export type NodeId = 'fixed' | 'cross' | 'gimbal' | 'rotor' | 'mov' | 'mfv';

export interface Tag {
  part: PartId;
  mat: EMat;
  node?: NodeId;
  /** Belongs to the removable front half. */
  front?: boolean;
}

interface Bucket {
  part: PartId;
  mat: EMat;
  node: NodeId;
  role: Role;
  geos: THREE.BufferGeometry[];
}

export interface NodeGroups {
  keep: THREE.Group;
  front: THREE.Group;
  caps: THREE.Group;
}

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
  constructor(
    readonly pivots: Record<NodeId, THREE.Vector3>,
    readonly section: boolean,
  ) {}

  private push(g: THREE.BufferGeometry | null | undefined, part: PartId, mat: EMat, node: NodeId, role: Role) {
    if (!g || !g.attributes.position || g.attributes.position.count === 0) return;
    if (role === 'cap' || role === 'fcap') hatchUV(g);
    const pv = this.pivots[node];
    if (pv.lengthSq() > 0) g.translate(-pv.x, -pv.y, -pv.z);
    const key = `${node}|${role}|${part}|${mat}`;
    let b = this.buckets.get(key);
    if (!b) {
      b = { part, mat, node, role, geos: [] };
      this.buckets.set(key, b);
    }
    b.geos.push(g);
  }

  /** Surface geometry given in the engine frame. */
  add(g: THREE.BufferGeometry | null | undefined, t: Tag) {
    this.push(g, t.part, t.mat, t.node ?? 'gimbal', t.front ? 'front' : 'keep');
  }

  /** Hatched section face geometry. */
  section_(g: THREE.BufferGeometry | null | undefined, t: Tag) {
    if (!this.section) {
      g?.dispose();
      return;
    }
    this.push(g, t.part, t.mat, t.node ?? 'gimbal', t.front ? 'fcap' : 'cap');
  }

  /** Section detail in its own (non-hatched) material, shown only in the section view. */
  detail(g: THREE.BufferGeometry | null | undefined, t: Tag) {
    if (!this.section) {
      g?.dispose();
      return;
    }
    this.push(g, t.part, t.mat, t.node ?? 'gimbal', 'capx');
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
      const mesh = new THREE.Mesh(geo, mats.get(b.mat, b.role === 'capx' ? 'cap' : b.role));
      if (b.role === 'capx') mesh.material = mats.get(b.mat, 'keep');
      const part = alias ? alias(b.part) : b.part;
      mesh.userData.part = part;
      if (part !== b.part) mesh.userData.subPart = b.part;
      const mid = MATERIAL_OF[b.mat];
      if (mid) mesh.userData.material = mid;
      mesh.userData.role = b.role;
      mesh.name = `${b.part}:${b.mat}:${b.role}`;
      const g = groups[b.node];
      (b.role === 'keep' ? g.keep : b.role === 'front' || b.role === 'fcap' ? g.front : g.caps).add(mesh);
      out.push(mesh);
    }
    this.buckets.clear();
    return out;
  }
}
