/**
 * Building kit for the spacecraft: tagged meshes, solids of revolution with real wall
 * thickness and section caps, bent surface details, the section-cut mechanism (a wedge of
 * each shell slides away and fades, exposing hatched cut faces and the interior), and the
 * final merge of static meshes per part and material (bounded draw calls).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { PartId } from '../../vehicle/parts';
import type { MaterialId } from '../../content/materials/ids';
import { tierSpec } from '../quality';
import { HATCH_REPEAT } from './textures';

export type Detail = 'hangar' | 'flight';
/** Profile point (radius, height). */
export type V2 = [number, number];

const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

/** The removed section of every body of revolution: azimuth 0..90 deg (the +Z/+X quadrant). */
export const WEDGE = { phi0: 0, phi1: Math.PI / 2 };

export function ensureIndexed(g: THREE.BufferGeometry): THREE.BufferGeometry {
  if (!g.index) {
    const n = g.attributes.position.count;
    const idx = n > 65535 ? new Uint32Array(n) : new Uint16Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    g.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

// ───────────────────────────── solids of revolution ─────────────────────────────

export interface SweepOpts {
  phi0?: number;
  phi1?: number;
  segs: number;
  /** Profile corners sharper than this (rad) get split normals. */
  crease?: number;
  /** Texture v per profile point (default: cumulative length in metres). */
  v?: (p: V2, i: number, len: number) => number;
  /** Texture u from azimuth (default phi / 2 pi). */
  u?: (phi: number) => number;
  /** Build the section faces at phi0/phi1 (partial sweeps). */
  caps?: boolean;
  /** Cap UV scale (1/m); default so one hatch repeat = HATCH_REPEAT. */
  capScale?: number;
}

/**
 * Sweep a closed cross-section polygon (radius, height), traversed counter-clockwise with the
 * material on the left, around +Y. Vertex = (r sin phi, y, r cos phi): phi 0 faces +Z, 90 deg +X.
 * Returns the swept skin and (for partial sweeps) the two flat section caps.
 */
export function sweep(poly: V2[], closed: boolean, o: SweepOpts): { skin: THREE.BufferGeometry; caps: THREE.BufferGeometry | null } {
  const phi0 = o.phi0 ?? 0;
  const phi1 = o.phi1 ?? TAU;
  const segs = Math.max(3, o.segs);
  const crease = o.crease ?? 0.6;
  if (closed) {
    // orient counter-clockwise (material on the left) whatever order the caller listed
    let a2 = 0;
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      a2 += p[0] * q[1] - q[0] * p[1];
    }
    if (a2 < 0) poly = [...poly].reverse();
  }
  const n = poly.length;
  const edges = closed ? n : n - 1;
  // edge normals (dy, -dr)
  const en: V2[] = [];
  const elen: number[] = [];
  for (let i = 0; i < edges; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const dr = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dr, dy);
    elen.push(l);
    en.push(l > 1e-9 ? [dy / l, -dr / l] : [0, 0]);
  }
  const vAt: number[] = [0];
  for (let i = 0; i < edges; i++) vAt.push(vAt[i] + elen[i]);
  const total = vAt[edges];
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const vertNormal = (vi: number, ei: number): V2 => {
    // normal at polygon vertex vi for edge ei, smoothed with the neighbour edge unless creased
    const prevE = closed ? (vi - 1 + edges) % edges : vi - 1;
    const nextE = closed ? vi % edges : vi;
    const other = ei === nextE ? prevE : nextE;
    const a = en[ei];
    if (other < 0 || other >= edges || elen[other] < 1e-9) return a;
    const b = en[other];
    const dot = a[0] * b[0] + a[1] * b[1];
    if (dot < Math.cos(crease)) return a;
    const x = a[0] + b[0];
    const y = a[1] + b[1];
    const l = Math.hypot(x, y) || 1;
    return [x / l, y / l];
  };
  for (let e = 0; e < edges; e++) {
    if (elen[e] < 1e-9) continue;
    const ia = e;
    const ib = (e + 1) % n;
    const ends: [number, V2, number][] = [
      [ia, vertNormal(ia, e), vAt[e]],
      [ib, vertNormal(ib, e), vAt[e + 1]],
    ];
    const base = pos.length / 3;
    for (const [pi, nn, vv] of ends) {
      const [r, y] = poly[pi];
      const vcoord = o.v ? o.v(poly[pi], pi, total) : vv;
      for (let s = 0; s <= segs; s++) {
        const phi = phi0 + ((phi1 - phi0) * s) / segs;
        const sp = Math.sin(phi);
        const cp = Math.cos(phi);
        pos.push(r * sp, y, r * cp);
        nor.push(nn[0] * sp, nn[1], nn[0] * cp);
        uv.push(o.u ? o.u(phi) : phi / TAU, vcoord);
      }
    }
    for (let s = 0; s < segs; s++) {
      const a = base + s;
      const b = base + s + 1;
      const c = base + segs + 1 + s;
      const d = base + segs + 2 + s;
      // winding so the face normal agrees with (dy, -dr) swept
      idx.push(a, b, c, b, d, c);
    }
  }
  const skin = new THREE.BufferGeometry();
  skin.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  skin.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  skin.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  skin.setIndex(idx);
  let caps: THREE.BufferGeometry | null = null;
  if (o.caps && closed && phi1 - phi0 < TAU - 1e-6) caps = sectionCaps(poly, phi0, phi1, o.capScale ?? 1 / HATCH_REPEAT);
  return { skin, caps };
}

/** Flat section faces of a closed profile at two azimuths (outward = away from the swept solid). */
export function sectionCaps(poly: V2[], phi0: number, phi1: number, scale: number): THREE.BufferGeometry {
  let contour = poly.map((p) => new THREE.Vector2(p[0], p[1]));
  // drop duplicate consecutive points (creases)
  contour = contour.filter((p, i) => i === 0 || p.distanceToSquared(contour[i - 1]) > 1e-12);
  if (contour[0].distanceToSquared(contour[contour.length - 1]) < 1e-12) contour.pop();
  if (THREE.ShapeUtils.isClockWise(contour)) contour.reverse();
  const tris = THREE.ShapeUtils.triangulateShape(contour, []);
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (const [phi, flip] of [
    [phi0, false],
    [phi1, true],
  ] as [number, boolean][]) {
    const base = pos.length / 3;
    const sp = Math.sin(phi);
    const cp = Math.cos(phi);
    // polygon CCW in (r, y) faces (-cos, 0, sin) = against the sweep direction
    const nx = flip ? cp : -cp;
    const nz = flip ? -sp : sp;
    for (const p of contour) {
      pos.push(p.x * sp, p.y, p.x * cp);
      nor.push(nx, 0, nz);
      uv.push(p.x * scale, p.y * scale);
    }
    for (const t of tris) {
      const [a, b, c] = t;
      const pa = contour[a];
      const ccw = (contour[b].x - pa.x) * (contour[c].y - pa.y) - (contour[b].y - pa.y) * (contour[c].x - pa.x) > 0;
      const [i1, i2] = ccw !== flip ? [b, c] : [c, b];
      idx.push(base + a, base + i1, base + i2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/**
 * Closed wall cross-section from two curves listed in the same direction, the first ("outer")
 * with the material on its left (e.g. a side wall listed bottom to top, a dish listed from the
 * axis outward along its lower face).
 */
export function wallPoly(outer: V2[], inner: V2[]): V2[] {
  return [...outer, ...[...inner].reverse()];
}

/** Offset a profile polyline along (dy, -dr), the side away from material on its left, by d. */
export function offsetCurve(pts: V2[], d: number): V2[] {
  const out: V2[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const dr = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dr, dy) || 1;
    out.push([pts[i][0] + (dy / l) * d, pts[i][1] + (-dr / l) * d]);
  }
  return out;
}

// ───────────────────────────── primitives ─────────────────────────────

/** Planar UVs in metres by dominant normal axis (for tiling textures on arbitrary geometry). */
export function uvMetres(g: THREE.BufferGeometry, scale = 1, offset = new THREE.Vector2()): THREE.BufferGeometry {
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const az = Math.abs(n.getZ(i));
    let u: number;
    let v: number;
    if (ax >= ay && ax >= az) {
      u = p.getZ(i) * Math.sign(n.getX(i) || 1);
      v = p.getY(i);
    } else if (ay >= az) {
      u = p.getX(i);
      v = p.getZ(i) * Math.sign(n.getY(i) || 1);
    } else {
      u = -p.getX(i) * Math.sign(n.getZ(i) || 1);
      v = p.getY(i);
    }
    uv[i * 2] = u * scale + offset.x;
    uv[i * 2 + 1] = v * scale + offset.y;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

export function box(w: number, h: number, d: number, uvScale = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  if (uvScale) uvMetres(g, uvScale);
  return g;
}

export function rbox(w: number, h: number, d: number, r: number, seg = 2, uvScale = 0): THREE.BufferGeometry {
  const rr = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  const g = new RoundedBoxGeometry(w, h, d, seg, Math.max(1e-4, rr));
  if (uvScale) uvMetres(g, uvScale);
  return g;
}

export function cyl(rTop: number, rBot: number, h: number, seg: number, open = false): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open);
}

const _up = new THREE.Vector3(0, 1, 0);
/** Cylinder strut between two points. */
export function strut(a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 8, r2 = r): THREE.BufferGeometry {
  const d = new THREE.Vector3().subVectors(b, a);
  const l = d.length();
  const g = new THREE.CylinderGeometry(r2, r, l, seg, 1, false);
  const q = new THREE.Quaternion().setFromUnitVectors(_up, d.normalize());
  g.applyQuaternion(q);
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

/** Smooth tube along a polyline (Catmull-Rom). */
export function tube(points: THREE.Vector3[], r: number, radial = 8, tubular = 0): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  return new THREE.TubeGeometry(curve, tubular || Math.max(8, points.length * 6), r, radial, false);
}

/** Map every vertex through f and recompute normals (bends flat details onto curved skins). */
export function bend(g: THREE.BufferGeometry, f: (v: THREE.Vector3) => void): THREE.BufferGeometry {
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    f(v);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

/** Rounded-rectangle outline (for window frames, hatches, panels). */
export function roundRect(w: number, h: number, r: number, cx = 0, cy = 0): THREE.Shape {
  const s = new THREE.Shape();
  const x0 = cx - w / 2;
  const y0 = cy - h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x0 + r, y0);
  s.lineTo(x0 + w - r, y0);
  s.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
  s.lineTo(x0 + w, y0 + h - r);
  s.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
  s.lineTo(x0 + r, y0 + h);
  s.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
  s.lineTo(x0, y0 + r);
  s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
}

export function roundRectPath(w: number, h: number, r: number): THREE.Path {
  const s = roundRect(w, h, r);
  const p = new THREE.Path();
  p.curves = s.curves;
  return p;
}

/** Extrude a shape along +Z by depth, with a small bevel. */
export function extrude(shape: THREE.Shape, depth: number, bevel = 0, curveSegments = 8): THREE.BufferGeometry {
  return new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: bevel > 0 ? 2 : 0,
    curveSegments,
  });
}

// ───────────────────────────── the kit ─────────────────────────────

interface CutParts {
  wedge: THREE.Group;
  /** The wedge's own section faces (shown only while cutting, so no seam shows when closed). */
  wedgeCaps: THREE.Group;
  caps: THREE.Group;
  inner: THREE.Group;
}

export class Kit {
  readonly detail: Detail;
  readonly hangar: boolean;
  /** Segment multiplier (detail and quality tier). */
  readonly q: number;
  readonly geos = new Set<THREE.BufferGeometry>();
  /** Materials created for this model only (disposed with it). */
  readonly ownMats = new Set<THREE.Material>();
  readonly wedges: { g: THREE.Group; dir: THREE.Vector3; dist: number }[] = [];
  readonly capGroups: THREE.Group[] = [];
  readonly innerGroups: THREE.Group[] = [];
  /** Groups faded out together with the wedges (appendages hiding the section). */
  readonly cutHide: THREE.Object3D[] = [];
  readonly fadeClones = new Map<THREE.Material, THREE.Material>();
  readonly labels: { text: string; anchor: THREE.Object3D }[] = [];

  constructor(detail: Detail) {
    this.detail = detail;
    this.hangar = detail === 'hangar';
    const t = tierSpec().detail;
    this.q = (this.hangar ? 1 : 0.42) * (0.55 + 0.45 * t);
  }

  seg(n: number, min = 8): number {
    return Math.max(min, Math.round(n * this.q));
  }

  /** A tagged mesh (castShadow/receiveShadow on), optionally added to a parent at a pose. */
  mesh(geo: THREE.BufferGeometry, mat: THREE.Material, part: PartId, material: MaterialId, parent?: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Mesh {
    ensureIndexed(geo);
    this.geos.add(geo);
    const m = new THREE.Mesh(geo, mat);
    m.userData.part = part;
    m.userData.material = material;
    m.userData.thermal = thermalClass(part, material);
    m.castShadow = true;
    m.receiveShadow = true;
    m.position.set(x, y, z);
    parent?.add(m);
    return m;
  }

  /** Cut groups of a parent (created on first use; hangar detail only). */
  cut(parent: THREE.Object3D, dir = new THREE.Vector3(0.62, 0.35, 0.62).normalize(), dist = 2.2): CutParts {
    let c = parent.userData.cut as CutParts | undefined;
    if (!c) {
      const wedge = new THREE.Group();
      wedge.name = 'cut-wedge';
      const caps = new THREE.Group();
      caps.name = 'cut-caps';
      caps.visible = false;
      const inner = new THREE.Group();
      inner.name = 'cut-inner';
      inner.visible = false;
      const wedgeCaps = new THREE.Group();
      wedgeCaps.name = 'cut-wedge-caps';
      wedgeCaps.visible = false;
      wedge.add(wedgeCaps);
      parent.add(wedge, caps, inner);
      c = { wedge, wedgeCaps, caps, inner };
      this.capGroups.push(wedgeCaps);
      parent.userData.cut = c;
      this.wedges.push({ g: wedge, dir: dir.clone().normalize(), dist });
      this.capGroups.push(caps);
      this.innerGroups.push(inner);
    }
    return c;
  }

  /** Parent for an item on a body of revolution at azimuth phi: inside the wedge or not. */
  at(parent: THREE.Object3D, phi: number): THREE.Object3D {
    if (!this.hangar) return parent;
    const p = ((phi % TAU) + TAU) % TAU;
    return p > WEDGE.phi0 + 1e-6 && p < WEDGE.phi1 - 1e-6 ? this.cut(parent).wedge : parent;
  }

  /** Parent for interior equipment (hidden unless cut, hangar only; null in flight detail). */
  inside(parent: THREE.Object3D): THREE.Object3D | null {
    return this.hangar ? this.cut(parent).inner : null;
  }

  /**
   * A solid of revolution with wall thickness: in hangar detail split into the kept part and a
   * sliding wedge (both with hatched section caps); in flight detail one closed sweep.
   */
  solid(parent: THREE.Object3D, poly: V2[], segs: number, mat: THREE.Material, capMat: THREE.Material | null, part: PartId, material: MaterialId, o: Partial<SweepOpts> = {}): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    if (!this.hangar || !capMat) {
      const { skin } = sweep(poly, true, { ...o, segs, phi0: 0, phi1: TAU });
      out.push(this.mesh(skin, mat, part, material, parent));
      return out;
    }
    const c = this.cut(parent);
    const kept = sweep(poly, true, { ...o, segs: Math.max(3, Math.round((segs * 3) / 4)), phi0: WEDGE.phi1, phi1: TAU, caps: true });
    const wedge = sweep(poly, true, { ...o, segs: Math.max(2, Math.round(segs / 4)), phi0: WEDGE.phi0, phi1: WEDGE.phi1, caps: true });
    out.push(this.mesh(kept.skin, mat, part, material, parent));
    out.push(this.mesh(wedge.skin, mat, part, material, c.wedge));
    if (kept.caps) this.mesh(kept.caps, capMat, part, material, c.caps).castShadow = false;
    if (wedge.caps) this.mesh(wedge.caps, capMat, part, material, c.wedgeCaps).castShadow = false;
    return out;
  }

  /** An open surface of revolution (single skin), split at the wedge in hangar detail. */
  surface(parent: THREE.Object3D, profile: V2[], segs: number, mat: THREE.Material, part: PartId, material: MaterialId, o: Partial<SweepOpts> = {}, cuttable = true): THREE.Mesh[] {
    if (!this.hangar || !cuttable) {
      const { skin } = sweep(profile, false, { ...o, segs, phi0: o.phi0 ?? 0, phi1: o.phi1 ?? TAU });
      return [this.mesh(skin, mat, part, material, parent)];
    }
    const c = this.cut(parent);
    const kept = sweep(profile, false, { ...o, segs: Math.max(3, Math.round((segs * 3) / 4)), phi0: WEDGE.phi1, phi1: TAU });
    const wedge = sweep(profile, false, { ...o, segs: Math.max(2, Math.round(segs / 4)), phi0: WEDGE.phi0, phi1: WEDGE.phi1 });
    return [this.mesh(kept.skin, mat, part, material, parent), this.mesh(wedge.skin, mat, part, material, c.wedge)];
  }

  /** Material clone for this model only. */
  own<T extends THREE.Material>(m: T): T {
    this.ownMats.add(m);
    return m;
  }

  /** Swap wedge (and cut-hide) materials for fading clones; call once after building. */
  prepareCut(): void {
    const swap = (root: THREE.Object3D) =>
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const orig = m.material as THREE.Material;
        let f = this.fadeClones.get(orig);
        if (!f) {
          f = orig.clone();
          // clone() does not carry shader hooks (the ablator's char uniform lives in one)
          f.onBeforeCompile = orig.onBeforeCompile;
          f.customProgramCacheKey = orig.customProgramCacheKey;
          f.transparent = true;
          this.fadeClones.set(orig, f);
          this.ownMats.add(f);
        }
        m.material = f;
        this.fadeMeshes.push({ m, shadow: m.castShadow });
      });
    for (const w of this.wedges) swap(w.g);
    for (const h of this.cutHide) swap(h);
  }

  private cutFade = 1;
  /** Meshes on fading materials: they stop casting shadows once the section opens. */
  private readonly fadeMeshes: { m: THREE.Mesh; shadow: boolean }[] = [];

  /** Fading clones follow their originals' opacity and visibility (posed state) times the cut fade. */
  syncFades(): void {
    const fade = this.cutFade;
    for (const [orig, m] of this.fadeClones) {
      m.opacity = orig.opacity * fade;
      m.visible = orig.visible;
      m.depthWrite = orig.depthWrite && fade > 0.6;
    }
  }

  /** Section view 0..1: wedges slide out along their direction and fade; caps and interiors show. */
  applyCut(a: number): void {
    const e = a * a * (3 - 2 * a);
    const fade = 1 - smooth(0.4, 1, a);
    for (const w of this.wedges) {
      w.g.position.copy(w.dir).multiplyScalar(w.dist * e);
      w.g.visible = a < 0.995;
    }
    for (const h of this.cutHide) h.visible = a < 0.995;
    this.cutFade = fade;
    for (const f of this.fadeMeshes) f.m.castShadow = f.shadow && a < 0.002;
    this.syncFades();
    const show = a > 0.002;
    for (const g of this.capGroups) g.visible = show;
    for (const g of this.innerGroups) g.visible = show;
  }

  /**
   * Merge the static meshes under every group per (part, material, look) into single meshes,
   * keeping animated hierarchies (groups) intact. Then drop geometries no longer referenced.
   */
  finalize(root: THREE.Object3D, animated: Set<THREE.Object3D> = new Set()): void {
    mergeTree(root, animated);
    const used = new Set<THREE.BufferGeometry>();
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh || (o as THREE.LineSegments).isLineSegments) used.add((o as THREE.Mesh).geometry);
    });
    for (const g of this.geos) if (!used.has(g)) g.dispose();
    this.geos.clear();
    for (const g of used) this.geos.add(g);
  }

  /**
   * Move the meshes of static groups (transform and visibility never change) up into their
   * parents, baking the group transform, until they reach an animated group or the body root, so
   * the merge sees them as siblings. `animated` holds every object the pose or the cut can change.
   */
  flatten(root: THREE.Object3D, animated: Set<THREE.Object3D>): void {
    const visit = (g: THREE.Object3D) => {
      for (const c of [...g.children]) visit(c);
      const p = g.parent;
      if (g === root || !p || (g as THREE.Mesh).isMesh || animated.has(g) || !g.visible) return;
      const s = g.scale;
      if (Math.abs(s.x - s.y) > 1e-9 || Math.abs(s.x - s.z) > 1e-9) return;
      g.updateMatrix();
      for (const c of [...g.children]) {
        const m = c as THREE.Mesh;
        if (!m.isMesh || m.children.length || m.userData.keep || animated.has(m)) continue;
        m.updateMatrix();
        m.applyMatrix4(g.matrix);
        p.add(m);
      }
    };
    visit(root);
  }

  dispose(): void {
    for (const g of this.geos) g.dispose();
    for (const m of this.ownMats) m.dispose();
    this.geos.clear();
    this.ownMats.clear();
  }
}

/**
 * Thermal-lens class of a mesh (see scene/hangar/thermal.ts): the heat shield sees the entry
 * peak, the backshell tiles and the engine bells are hot, everything else (MLI included) is
 * treated as ambient.
 */
export function thermalClass(part: PartId, material: MaterialId): number {
  if (part === 'heat-shield') return 4;
  if (part === 'backshell-tps' || part === 'apogee-engine' || material === 'niobium-c103') return 3;
  if (part === 'launch-abort-system' && material === 'nickel-superalloy') return 3;
  return 1;
}

export function smooth(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function mergeTree(g: THREE.Object3D, animated: Set<THREE.Object3D>): void {
  for (const c of [...g.children]) if (!(c as THREE.Mesh).isMesh || c.children.length) mergeTree(c, animated);
  const buckets = new Map<string, THREE.Mesh[]>();
  for (const c of g.children) {
    const m = c as THREE.Mesh;
    if (!m.isMesh || m.children.length || m.userData.keep || animated.has(m) || Array.isArray(m.material)) continue;
    const geo = m.geometry;
    const sig = Object.keys(geo.attributes).sort().join(',');
    const key = [m.userData.part, m.userData.material, m.userData.thermal, (m.material as THREE.Material).uuid, sig, m.castShadow, m.receiveShadow, m.renderOrder, m.visible].join('|');
    let list = buckets.get(key);
    if (!list) buckets.set(key, (list = []));
    list.push(m);
  }
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const parts: THREE.BufferGeometry[] = [];
    for (const m of list) {
      m.updateMatrix();
      const gg = m.geometry.clone();
      gg.applyMatrix4(m.matrix);
      if (m.matrix.determinant() < 0 && gg.index) {
        const ix = gg.index.array;
        for (let i = 0; i < ix.length; i += 3) {
          const t = ix[i + 1];
          ix[i + 1] = ix[i + 2];
          ix[i + 2] = t;
        }
      }
      parts.push(gg);
    }
    const merged = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    if (!merged) continue;
    const first = list[0];
    const mm = new THREE.Mesh(merged, first.material);
    mm.userData = { ...first.userData };
    mm.castShadow = first.castShadow;
    mm.receiveShadow = first.receiveShadow;
    mm.renderOrder = first.renderOrder;
    mm.name = `${first.userData.part}:${first.userData.material}`;
    for (const m of list) g.remove(m);
    g.add(mm);
  }
}
