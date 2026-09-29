/**
 * Build kit: collects geometry pieces into buckets (per parent group + part + content material +
 * render look + cut/internal flags) and merges each bucket into ONE mesh, so the whole stack
 * stays within a bounded number of draw calls. Every mesh is tagged
 * `userData.part` / `userData.material` and recorded in a registry used by the view controller.
 *
 * Sections are the assemblies of the exploded view (and hold the cut-face caps of the cutaway).
 */
import * as THREE from 'three';
import type { BodyId, PartId } from '../../vehicle/parts';
import type { MaterialId } from '../../content/materials/ids';
import { mergeAll, normalize, capFromPoly, capStrip, type P2 } from './geom';
import type { Look, VehicleMats } from './mats';

export type Detail = 'hangar' | 'flight';

export interface PieceSpec {
  part: PartId;
  mat: MaterialId | null;
  look: Look | string;
  /** Clipped by the cutaway wedge. */
  cut?: boolean;
  /** Only shown in the cutaway (or when highlighted). */
  internal?: boolean;
  /** Soot weight for the entry-scorch shader (default: booster 1, others 0). */
  soot?: number;
  shadow?: boolean;
  /** Receives but does not cast shadows. */
  noCast?: boolean;
}

export type MeshKind = 'solid' | 'cap' | 'liquid' | 'overlay' | 'decal' | 'foreign';

export interface Entry {
  mesh: THREE.Mesh;
  part: PartId | null;
  mat: MaterialId | null;
  kind: MeshKind;
  cut: boolean;
  internal: boolean;
  /** Material as built (before highlight/lens overrides). */
  base: THREE.Material | THREE.Material[];
  /** Body this belongs to (for cutaway fading of payloads etc.). */
  body: BodyId | null;
}

export interface Section {
  id: string;
  body: BodyId;
  group: THREE.Group;
  /** Offset at full explosion (model frame). */
  explode: THREE.Vector3;
  caps: [THREE.Group, THREE.Group];
}

interface Piece {
  geom: THREE.BufferGeometry;
  matrix: THREE.Matrix4 | null;
}

interface Bucket {
  target: THREE.Object3D;
  spec: PieceSpec;
  pieces: Piece[];
  body: BodyId;
}

interface CapBucket {
  section: Section;
  part: PartId;
  mat: MaterialId | null;
  look: string;
  geoms: THREE.BufferGeometry[];
}

export class Kit {
  readonly registry: Entry[] = [];
  readonly sections = new Map<string, Section>();
  private buckets = new Map<string, Bucket>();
  private capBuckets = new Map<string, CapBucket>();
  /** Body of each group (for default soot weights). */
  private bodyOf = new WeakMap<THREE.Object3D, BodyId>();

  constructor(
    public readonly mats: VehicleMats,
    public readonly detail: Detail,
    public readonly seg: { body: number; mid: number; small: number; tiny: number },
  ) {}

  get hangar() {
    return this.detail === 'hangar';
  }

  /** Create (or get) an exploded-view section under a body's content group. */
  section(id: string, body: BodyId, parent: THREE.Object3D, explode: THREE.Vector3): Section {
    let s = this.sections.get(id);
    if (s) return s;
    const group = new THREE.Group();
    group.name = `section:${id}`;
    parent.add(group);
    const c1 = new THREE.Group();
    const c2 = new THREE.Group();
    c1.name = `${id}:cap1`;
    c2.name = `${id}:cap2`;
    c1.visible = c2.visible = false;
    group.add(c1, c2);
    s = { id, body, group, explode, caps: [c1, c2] };
    this.sections.set(id, s);
    this.bodyOf.set(group, body);
    return s;
  }

  /** Declare that a group (and its descendants) belongs to a body. */
  own(g: THREE.Object3D, body: BodyId) {
    this.bodyOf.set(g, body);
  }

  private findBody(o: THREE.Object3D): BodyId {
    let p: THREE.Object3D | null = o;
    while (p) {
      const b = this.bodyOf.get(p);
      if (b) return b;
      p = p.parent;
    }
    return 'booster';
  }

  /** Add a piece of geometry (in the target's local frame, optionally transformed by `matrix`). */
  add(target: THREE.Object3D, geom: THREE.BufferGeometry, spec: PieceSpec, matrix?: THREE.Matrix4) {
    if (spec.internal && !this.hangar) {
      geom.dispose();
      return;
    }
    const key = `${target.uuid}|${spec.part}|${spec.mat}|${spec.look}|${spec.cut ? 1 : 0}|${spec.internal ? 1 : 0}|${spec.soot ?? '-'}|${spec.shadow === false ? 0 : 1}|${spec.noCast ? 1 : 0}`;
    let b = this.buckets.get(key);
    if (!b) {
      b = { target, spec, pieces: [], body: this.findBody(target) };
      this.buckets.set(key, b);
    }
    b.pieces.push({ geom, matrix: matrix ? matrix.clone() : null });
  }

  /** A cut face (flat, in the plane of the cap group) from a closed (r, y) polygon. */
  cap(section: Section, poly: P2[], part: PartId, mat: MaterialId | null, look: string = 'hatch') {
    if (!this.hangar) return;
    this.capGeom(section, capFromPoly(poly), part, mat, look);
  }

  /** A layered cut face strip between two polylines (sandwich cores and skins). */
  capLayer(section: Section, outer: P2[], inner: P2[], part: PartId, mat: MaterialId | null, look: string) {
    if (!this.hangar) return;
    this.capGeom(section, capStrip(outer, inner), part, mat, look);
  }

  capGeom(section: Section, g: THREE.BufferGeometry, part: PartId, mat: MaterialId | null, look: string) {
    const key = `${section.id}|${part}|${mat}|${look}`;
    let b = this.capBuckets.get(key);
    if (!b) {
      b = { section, part, mat, look, geoms: [] };
      this.capBuckets.set(key, b);
    }
    b.geoms.push(g);
  }

  /** Register an externally built mesh (liquids, overlays, moving parts built as single meshes). */
  register(mesh: THREE.Mesh, e: Partial<Omit<Entry, 'mesh'>> & { kind: MeshKind }) {
    const entry: Entry = {
      mesh,
      part: e.part ?? (mesh.userData.part as PartId) ?? null,
      mat: e.mat ?? (mesh.userData.material as MaterialId) ?? null,
      kind: e.kind,
      cut: e.cut ?? false,
      internal: e.internal ?? false,
      base: e.base ?? mesh.material,
      body: e.body ?? null,
    };
    mesh.userData.part = entry.part;
    mesh.userData.material = entry.mat;
    this.registry.push(entry);
    return entry;
  }

  /** Merge all buckets into meshes. Call once, after every group is at its stowed pose. */
  flush(root: THREE.Object3D) {
    root.updateMatrixWorld(true);
    const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const toModel = new THREE.Matrix4();
    const tmp = new THREE.Vector3();
    for (const b of this.buckets.values()) {
      toModel.multiplyMatrices(rootInv, b.target.matrixWorld);
      const soot = b.spec.soot ?? (b.body === 'booster' ? 1 : 0);
      const list: THREE.BufferGeometry[] = [];
      for (const p of b.pieces) {
        const g = normalize(p.geom);
        if (p.matrix) g.applyMatrix4(p.matrix);
        // model-frame position at build pose + soot weight (skin shader)
        const pa = g.getAttribute('position') as THREE.BufferAttribute;
        const veh = new Float32Array(pa.count * 4);
        for (let i = 0; i < pa.count; i++) {
          tmp.fromBufferAttribute(pa, i).applyMatrix4(toModel);
          veh[i * 4] = tmp.x;
          veh[i * 4 + 1] = tmp.y;
          veh[i * 4 + 2] = tmp.z;
          veh[i * 4 + 3] = soot;
        }
        g.setAttribute('aVeh', new THREE.BufferAttribute(veh, 4));
        list.push(g);
      }
      const geom = mergeAll(list);
      geom.computeBoundingBox();
      geom.computeBoundingSphere();
      let material = this.mats.get(b.spec.look);
      if (b.spec.cut && this.hangar) material = this.mats.clip(material);
      const mesh = new THREE.Mesh(geom, material);
      mesh.name = `${b.spec.part}:${b.spec.look}`;
      mesh.castShadow = b.spec.shadow !== false && !b.spec.noCast;
      mesh.receiveShadow = b.spec.shadow !== false;
      mesh.visible = !b.spec.internal;
      b.target.add(mesh);
      this.register(mesh, { part: b.spec.part, mat: b.spec.mat, kind: 'solid', cut: !!b.spec.cut && this.hangar, internal: !!b.spec.internal, base: material, body: b.body });
    }
    this.buckets.clear();
    // caps: one merged geometry per (section, part, look), shown on both cut planes
    for (const c of this.capBuckets.values()) {
      const geom = mergeAll(c.geoms);
      const pa = geom.getAttribute('position') as THREE.BufferAttribute;
      geom.setAttribute('aVeh', new THREE.BufferAttribute(new Float32Array(pa.count * 4), 4));
      geom.computeBoundingSphere();
      const material = this.mats.get(c.look);
      for (let k = 0; k < 2; k++) {
        const mesh = new THREE.Mesh(geom, material);
        mesh.name = `cap:${c.part}:${c.look}`;
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        c.section.caps[k].add(mesh);
        this.register(mesh, { part: c.part, mat: c.mat, kind: 'cap', cut: false, internal: false, base: material, body: c.section.body });
      }
    }
    this.capBuckets.clear();
  }
}
