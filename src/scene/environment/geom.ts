/**
 * Geometry helpers for the site: a batch that merges static parts per material (few draw
 * calls), instanced members along segments (tower lattice, fence posts, pipe supports),
 * bevelled boxes, pipes with bent corners and extruded profiles.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/** Make a geometry mergeable: indexed, with position/normal/uv only. */
export function normalizeGeo(g: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.index) {
    const n = g.attributes.position.count;
    const idx = n > 65535 ? new Uint32Array(n) : new Uint16Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    g.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  g.morphAttributes = {};
  g.clearGroups();
  return g;
}

export interface MeshOpts {
  cast?: boolean;
  receive?: boolean;
  part?: string;
  material?: string;
  name?: string;
}

export interface BatchView {
  add(g: THREE.BufferGeometry, m: THREE.Material, matrix?: THREE.Matrix4, opts?: MeshOpts): void;
  at(g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rotY?: number, opts?: MeshOpts): void;
}

/** Merge geometries (normalized) into one, applying optional matrices. */
export function mergeParts(parts: { g: THREE.BufferGeometry; m?: THREE.Matrix4 }[]): THREE.BufferGeometry {
  const list = parts.map(({ g, m }) => {
    const n = normalizeGeo(g);
    if (m) n.applyMatrix4(m);
    return n;
  });
  const merged = mergeGeometries(list, false)!;
  list.forEach((g) => g.dispose());
  merged.computeBoundingSphere();
  return merged;
}

/** Collects geometries per material and emits one merged mesh per material. */
export class Batch {
  private lists = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private opts = new Map<THREE.Material, MeshOpts>();
  constructor(private defaults: MeshOpts = { cast: true, receive: true }) {}
  add(g: THREE.BufferGeometry, m: THREE.Material, matrix?: THREE.Matrix4, opts?: MeshOpts) {
    const geo = normalizeGeo(g);
    if (matrix) geo.applyMatrix4(matrix);
    let l = this.lists.get(m);
    if (!l) {
      l = [];
      this.lists.set(m, l);
    }
    l.push(geo);
    if (opts && !this.opts.has(m)) this.opts.set(m, opts);
  }
  /** Add at a position with an optional rotation about +Y. */
  at(g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rotY = 0, opts?: MeshOpts) {
    const mat = new THREE.Matrix4().makeRotationY(rotY).setPosition(x, y, z);
    this.add(g, m, mat, opts);
  }
  /**
   * A view of this batch in a local frame: parts added through it are transformed by `base`
   * and merged with everything else of the same material (static sub-assemblies cost no extra
   * draw calls).
   */
  view(base: THREE.Matrix4): BatchView {
    const self = this;
    return {
      add(g, m, matrix, opts) {
        self.add(g, m, matrix ? base.clone().multiply(matrix) : base.clone(), opts);
      },
      at(g, m, x, y, z, rotY = 0, opts) {
        self.add(g, m, base.clone().multiply(new THREE.Matrix4().makeRotationY(rotY).setPosition(x, y, z)), opts);
      },
    };
  }
  build(parent: THREE.Object3D, name = 'batch'): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const [m, list] of this.lists) {
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      const o = { ...this.defaults, ...(this.opts.get(m) ?? {}) };
      const mesh = new THREE.Mesh(merged, m);
      mesh.name = o.name ?? `${name}:${m.name}`;
      mesh.castShadow = !!o.cast;
      mesh.receiveShadow = !!o.receive;
      if (o.part) mesh.userData.part = o.part;
      if (o.material) mesh.userData.material = o.material;
      parent.add(mesh);
      out.push(mesh);
    }
    this.lists.clear();
    return out;
  }
}

// ───────────────────────────── primitives ─────────────────────────────

export function box(w: number, h: number, d: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d);
}

/** Box with rounded edges (real bevels catch the light at close range). */
export function bevelBox(w: number, h: number, d: number, r = 0.03, seg = 2): THREE.BufferGeometry {
  const rr = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  return new RoundedBoxGeometry(w, h, d, seg, Math.max(rr, 1e-4));
}

export function cyl(r: number, h: number, seg = 24, rTop = r, open = false): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(rTop, r, h, seg, 1, open);
}

const _up = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
const _q = new THREE.Quaternion();

/** Matrix placing a unit member (along +Y, centred) between a and b with section scale (sx, sz). */
export function memberMatrix(a: THREE.Vector3, b: THREE.Vector3, sx: number, sz: number, out: THREE.Matrix4, roll?: THREE.Vector3): THREE.Matrix4 {
  _dir.subVectors(b, a);
  const len = _dir.length();
  _dir.divideScalar(len || 1);
  if (roll) {
    // orient the member's local X toward `roll` projected perpendicular to the axis
    const x = roll.clone().addScaledVector(_dir, -roll.dot(_dir));
    if (x.lengthSq() < 1e-8) x.set(1, 0, 0).addScaledVector(_dir, -_dir.x);
    x.normalize();
    const z = new THREE.Vector3().crossVectors(x, _dir);
    out.makeBasis(x, _dir, z);
    out.scale(new THREE.Vector3(sx, len, sz));
  } else {
    _q.setFromUnitVectors(_up, _dir);
    out.compose(new THREE.Vector3(), _q, new THREE.Vector3(sx, len, sz));
  }
  out.setPosition((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return out;
}

/** A cylinder between two points. */
export function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 12, open = false): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, 1, seg, 1, open);
  g.applyMatrix4(memberMatrix(a, b, 1, 1, new THREE.Matrix4()));
  return g;
}

/** Unit I-beam section (flange width 1, depth 1, along +Y, length 1). */
export function iBeamUnit(flange = 0.14, web = 0.1): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const h = 0.5;
  const f = flange;
  const w = web / 2;
  s.moveTo(-h, -h);
  s.lineTo(h, -h);
  s.lineTo(h, -h + f);
  s.lineTo(w, -h + f);
  s.lineTo(w, h - f);
  s.lineTo(h, h - f);
  s.lineTo(h, h);
  s.lineTo(-h, h);
  s.lineTo(-h, h - f);
  s.lineTo(-w, h - f);
  s.lineTo(-w, -h + f);
  s.lineTo(-h, -h + f);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
  g.translate(0, 0, -0.5);
  g.rotateX(-Math.PI / 2);
  return g;
}

/** Collects instance matrices for one unit geometry; builds an InstancedMesh. */
export class Instances {
  mats: THREE.Matrix4[] = [];
  constructor(
    public geo: THREE.BufferGeometry,
    public mat: THREE.Material,
  ) {}
  member(a: THREE.Vector3, b: THREE.Vector3, sx: number, sz = sx, roll?: THREE.Vector3) {
    this.mats.push(memberMatrix(a, b, sx, sz, new THREE.Matrix4(), roll));
  }
  push(m: THREE.Matrix4) {
    this.mats.push(m.clone());
  }
  /** Merge every instance into a batch instead (for small counts inside a moving sub-assembly). */
  mergeInto(b: Batch | BatchView, mat: THREE.Material = this.mat, opts?: MeshOpts) {
    for (const m of this.mats) b.add(this.geo.clone(), mat, m, opts);
    this.mats = [];
  }
  build(parent: THREE.Object3D, name: string, opts: MeshOpts = { cast: true, receive: true }): THREE.InstancedMesh | null {
    if (!this.mats.length) return null;
    const im = new THREE.InstancedMesh(this.geo, this.mat, this.mats.length);
    this.mats.forEach((m, i) => im.setMatrixAt(i, m));
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    im.name = name;
    im.castShadow = opts.cast ?? true;
    im.receiveShadow = opts.receive ?? true;
    if (opts.part) im.userData.part = opts.part;
    if (opts.material) im.userData.material = opts.material;
    parent.add(im);
    return im;
  }
}

/** A pipe along a polyline with bends of radius `bend` at the corners. */
export function pipe(points: THREE.Vector3[], r: number, bend = r * 3, radial = 12): THREE.BufferGeometry {
  const path = new THREE.CurvePath<THREE.Vector3>();
  let prev = points[0].clone();
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const a = new THREE.Vector3().subVectors(prev, p);
    const b = new THREE.Vector3().subVectors(points[i + 1], p);
    const la = a.length();
    const lb = b.length();
    const k = Math.min(bend, la * 0.45, lb * 0.45);
    const p0 = p.clone().addScaledVector(a.normalize(), k);
    const p1 = p.clone().addScaledVector(b.normalize(), k);
    if (prev.distanceTo(p0) > 1e-4) path.add(new THREE.LineCurve3(prev.clone(), p0));
    path.add(new THREE.QuadraticBezierCurve3(p0, p.clone(), p1));
    prev = p1;
  }
  path.add(new THREE.LineCurve3(prev, points[points.length - 1].clone()));
  let len = 0;
  for (const c of path.curves) len += c.getLength();
  const segs = Math.max(4, Math.min(600, Math.round(len / Math.max(r * 2, 0.4)) + points.length * 6));
  return new THREE.TubeGeometry(path as unknown as THREE.Curve<THREE.Vector3>, segs, r, radial, false);
}

/** Extrude a 2D profile (x, y) along +Z by depth, optional bevel. */
export function extrude(pts: [number, number][], depth: number, bevel = 0, holes: [number, number][][] = [], curveSegs = 12): THREE.BufferGeometry {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  return new THREE.ExtrudeGeometry(s, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: curveSegs,
  });
}

export const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
