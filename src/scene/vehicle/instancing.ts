/**
 * Draw-call reduction for repeated hardware.
 *
 * RigInstances: identical mechanisms placed around the axis (landing legs, grid fins, separation
 * collets and pusher rods) are built ONCE as a posable template; after the kit has merged the
 * template's pieces, each merged mesh becomes an InstancedMesh (one draw call for every copy)
 * whose instance matrices follow the template's current pose, rotated about the vehicle axis for
 * each copy. The template's groups stay in the scene graph as empty pose carriers, so the posing
 * code (poseLegs, poseFins, the staging demonstration) is unchanged; call update() after posing.
 *
 * bakeEngine: the outer booster engines are one engine model baked into one geometry per
 * (material, part) in the engine frame and drawn as instances, gimballed rigidly per instance.
 */
import * as THREE from 'three';
import type { PartId } from '../../vehicle/parts';
import type { MaterialId } from '../../content/materials/ids';
import type { Kit } from './kit';
import { mergeAll } from './geom';

interface Pair {
  im: THREE.InstancedMesh;
  node: THREE.Object3D;
}

export class RigInstances {
  private pairs: Pair[] = [];
  private readonly rel = new THREE.Matrix4();
  private readonly tmp = new THREE.Matrix4();

  /**
   * @param section parent of the template roots (the instanced meshes are added to it)
   * @param roots the template's root groups (children of `section`)
   * @param copies one matrix per copy, applied in the section frame (copies[0] = identity)
   */
  constructor(
    private readonly kit: Kit,
    private readonly section: THREE.Object3D,
    private readonly roots: THREE.Object3D[],
    private readonly copies: THREE.Matrix4[],
  ) {}

  /** Convert the template's merged meshes (after kit.flush) into instanced meshes. */
  build() {
    const inRig = new Set<THREE.Object3D>();
    for (const r of this.roots) r.traverse((o) => inRig.add(o));
    for (const e of this.kit.registry) {
      const src = e.mesh;
      if (!inRig.has(src) || (src as THREE.InstancedMesh).isInstancedMesh) continue;
      const node = src.parent;
      if (!node) continue;
      const im = new THREE.InstancedMesh(src.geometry, src.material, this.copies.length);
      im.name = `${src.name}:x${this.copies.length}`;
      im.userData = { ...src.userData };
      im.castShadow = src.castShadow;
      im.receiveShadow = src.receiveShadow;
      im.visible = src.visible;
      im.renderOrder = src.renderOrder;
      node.remove(src);
      this.section.add(im);
      e.mesh = im;
      this.pairs.push({ im, node });
    }
    this.update();
  }

  /** Re-read the template pose into every instance matrix. */
  update() {
    for (const p of this.pairs) {
      // node -> section, from the local matrices (independent of the section's world pose)
      p.node.updateMatrix();
      this.rel.copy(p.node.matrix);
      let o = p.node.parent;
      while (o && o !== this.section) {
        o.updateMatrix();
        this.rel.premultiply(o.matrix);
        o = o.parent;
      }
      for (let i = 0; i < this.copies.length; i++) p.im.setMatrixAt(i, this.tmp.multiplyMatrices(this.copies[i], this.rel));
      p.im.instanceMatrix.needsUpdate = true;
      p.im.boundingSphere = null;
      p.im.boundingBox = null;
    }
  }

  get meshes(): THREE.InstancedMesh[] {
    return this.pairs.map((p) => p.im);
  }
}

/** Rotations about the vehicle axis taking azimuth phis[0] to each of phis. */
export function azimuthCopies(phis: number[]): THREE.Matrix4[] {
  return phis.map((p) => new THREE.Matrix4().makeRotationY(p - phis[0]));
}

export interface BakedGroup {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  part: PartId | null;
  mat: MaterialId | null;
}

/**
 * Bake a built model (engine frame at its root) into one geometry per (material, part, material
 * id). Hidden nodes and section caps are skipped. The source geometries are not modified.
 */
export function bakeModel(root: THREE.Object3D): BakedGroup[] {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map<string, { material: THREE.Material; part: PartId | null; mat: MaterialId | null; list: THREE.BufferGeometry[] }>();
  const visit = (o: THREE.Object3D) => {
    if (!o.visible) return;
    const mesh = o as THREE.Mesh;
    const role = o.userData.role as string | undefined;
    if (mesh.isMesh && role !== 'cap' && role !== 'capx' && !Array.isArray(mesh.material)) {
      const material = mesh.material as THREE.Material;
      const part = (mesh.userData.part ?? null) as PartId | null;
      const mat = (mesh.userData.material ?? null) as MaterialId | null;
      const key = `${material.uuid}|${part}|${mat}`;
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { material, part, mat, list: [] }));
      const geo = mesh.geometry.clone();
      geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld));
      g.list.push(geo);
    }
    for (const c of o.children) visit(c);
  };
  visit(root);
  const out: BakedGroup[] = [];
  for (const g of groups.values()) {
    const geometry = mergeAll(g.list);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    out.push({ geometry, material: g.material, part: g.part, mat: g.mat });
  }
  return out;
}

/**
 * Keep the shadow-casting choice made at build time even when an integration later switches
 * shadows on for every mesh it finds (small or flush parts gain nothing from casting).
 */
export function lockNoCast(o: THREE.Object3D) {
  Object.defineProperty(o, 'castShadow', { get: () => false, set: () => {}, configurable: true });
}
