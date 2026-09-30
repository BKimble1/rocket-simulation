/**
 * Geometry toolkit for the engine: one general "sweep a 2D profile along a path of frames"
 * generator covers solids of revolution (chamber, bell, domes, housings, manifolds), pipes
 * with real bends, scroll volutes and bellows. Profiles are closed polygons (solid walls with
 * thickness) or open polylines (single surfaces). Edges marked as section edges and the end
 * caps of a sector come out as separate geometry so they can be drawn as hatched technical
 * sections (the half-section of the cutaway is built explicitly, never by clipping planes).
 *
 * Conventions: revolve frames use the three.js lathe convention (x = r sin(phi),
 * z = r cos(phi)); phi in [PI/2, 3PI/2] is the back half (z <= 0) that stays in the cutaway.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type V2 = [number, number];
type V3 = THREE.Vector3;

export interface Loop {
  /** Polygon (closed: last point is NOT repeated) or polyline (open). Coordinates (u, v). */
  pts: V2[];
  /** Open polyline: a single surface (normal on the right-hand side of travel unless flip). */
  open?: boolean;
  flip?: boolean;
  /** This closed loop is a hole of the previous non-hole loop (for cap triangulation). */
  hole?: boolean;
  /** Edge i (pts[i] -> pts[i+1]) lies on a section plane: emitted as section geometry. */
  cut?: (i: number) => boolean;
  /** Force every joint smooth (e.g. circles with few segments). */
  smooth?: boolean;
}

export interface Frame {
  p: V3;
  n: V3;
  b: V3;
  /** Path coordinate written to uv.x. */
  u: number;
  /** Profile scale at this frame (default 1). */
  s?: number;
  /** Profile offset along n and b at this frame (default 0). */
  du?: number;
  dv?: number;
}

export interface SweepResult {
  surf: THREE.BufferGeometry | null;
  cut: THREE.BufferGeometry | null;
  caps: THREE.BufferGeometry | null;
}

class Buf {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  idx: number[] = [];
  get count() {
    return this.pos.length / 3;
  }
  v(p: V3, n: V3, u: number, v: number): number {
    this.pos.push(p.x, p.y, p.z);
    this.nor.push(n.x, n.y, n.z);
    this.uv.push(u, v);
    return this.count - 1;
  }
  geo(): THREE.BufferGeometry | null {
    if (!this.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    return g;
  }
}

function signedArea(p: V2[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x0, y0] = p[i];
    const [x1, y1] = p[(i + 1) % p.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _n = new THREE.Vector3();

function place(f: Frame, u: number, v: number, out: V3): V3 {
  const s = f.s ?? 1;
  const uu = u * s + (f.du ?? 0);
  const vv = v * s + (f.dv ?? 0);
  return out.copy(f.p).addScaledVector(f.n, uu).addScaledVector(f.b, vv);
}

/**
 * Sweep profile loops along frames. `crease` (deg): joints sharper than this get split
 * normals. `caps`: triangulated end faces for closed loops (emitted as section geometry).
 */
export function sweep(loops: Loop[], frames: Frame[], opts: { crease?: number; caps?: boolean; capStart?: boolean; capEnd?: boolean } = {}): SweepResult {
  const crease = Math.cos(((opts.crease ?? 32) * Math.PI) / 180);
  const surf = new Buf();
  const cut = new Buf();
  const caps = new Buf();
  const F = frames.length;
  const p0 = new THREE.Vector3();
  const p1 = new THREE.Vector3();

  for (const loop of loops) {
    const pts = loop.pts;
    const N = pts.length;
    const closed = !loop.open;
    const E = closed ? N : N - 1;
    const orient = closed ? Math.sign(signedArea(pts)) || 1 : loop.flip ? -1 : 1;
    // edge normals (outward): right-hand side for CCW polygons
    const en: V2[] = [];
    const isCut: boolean[] = [];
    for (let i = 0; i < E; i++) {
      const [u0, v0] = pts[i];
      const [u1, v1] = pts[(i + 1) % N];
      const du = u1 - u0;
      const dv = v1 - v0;
      const l = Math.hypot(du, dv) || 1;
      en.push([(orient * dv) / l, (-orient * du) / l]);
      isCut.push(!!loop.cut?.(i));
    }
    // profile arc length for uv.y
    const plen: number[] = [0];
    for (let i = 1; i <= E; i++) {
      const [u0, v0] = pts[i - 1];
      const [u1, v1] = pts[i % N];
      plen.push(plen[i - 1] + Math.hypot(u1 - u0, v1 - v0));
    }
    const joint = (a: number, b: number): V2 | null => {
      // smoothed normal between edge a (incoming) and b (outgoing), or null for a crease
      if (a < 0 || b >= E || a >= E || b < 0) return null;
      if (isCut[a] || isCut[b]) return null;
      const na = en[a];
      const nb = en[b];
      if (!loop.smooth && na[0] * nb[0] + na[1] * nb[1] < crease) return null;
      const x = na[0] + nb[0];
      const y = na[1] + nb[1];
      const l = Math.hypot(x, y) || 1;
      return [x / l, y / l];
    };
    for (let i = 0; i < E; i++) {
      const buf = isCut[i] ? cut : surf;
      const prev = i === 0 ? (closed ? E - 1 : -1) : i - 1;
      const next = i === E - 1 ? (closed ? 0 : E) : i + 1;
      const nA = joint(prev, i) ?? en[i];
      const nB = joint(i, next) ?? en[i];
      const [ua, va] = pts[i];
      const [ub, vb] = pts[(i + 1) % N];
      const base = buf.count;
      for (let f = 0; f < F; f++) {
        const fr = frames[f];
        place(fr, ua, va, _a);
        _n.copy(fr.n).multiplyScalar(nA[0]).addScaledVector(fr.b, nA[1]).normalize();
        buf.v(_a, _n, fr.u, plen[i]);
        place(fr, ub, vb, _a);
        _n.copy(fr.n).multiplyScalar(nB[0]).addScaledVector(fr.b, nB[1]).normalize();
        buf.v(_a, _n, fr.u, plen[i + 1]);
      }
      // winding: pick the largest quad to compare the geometric normal with the intended one
      let flip = false;
      let best = -1;
      for (let f = 0; f < F - 1; f++) {
        const a = base + f * 2;
        _a.fromArray(buf.pos, a * 3);
        _b.fromArray(buf.pos, (a + 1) * 3);
        _c.fromArray(buf.pos, (a + 2) * 3);
        const g = _b.sub(_a).cross(_c.sub(_a));
        const m = g.length();
        if (m > best) {
          best = m;
          _n.fromArray(buf.nor, a * 3);
          flip = g.dot(_n) < 0;
        }
        if (F > 8 && f > F / 2 && best > 0) break;
      }
      for (let f = 0; f < F - 1; f++) {
        const a = base + f * 2;
        const b = a + 1;
        const c = a + 3;
        const d = a + 2;
        // quad a(f,start) b(f,end) c(f+1,end) d(f+1,start); normal of (a,b,d)
        if (!flip) buf.idx.push(a, b, d, b, c, d);
        else buf.idx.push(a, d, b, b, d, c);
      }
    }
  }

  // caps (closed loops only), grouped outer + holes
  const wantA = opts.caps || opts.capStart;
  const wantB = opts.caps || opts.capEnd;
  if ((wantA || wantB) && F >= 2) {
    const groups: { outer: V2[]; holes: V2[][] }[] = [];
    for (const l of loops) {
      if (l.open) continue;
      if (l.hole && groups.length) groups[groups.length - 1].holes.push(l.pts);
      else groups.push({ outer: l.pts, holes: [] });
    }
    for (const [which, fi, fj] of [
      [wantA, 0, 1],
      [wantB, F - 1, F - 2],
    ] as [boolean, number, number][]) {
      if (!which) continue;
      for (const g of groups) {
        const contour = g.outer.map(([x, y]) => new THREE.Vector2(x, y));
        const holes = g.holes.map((h) => h.map(([x, y]) => new THREE.Vector2(x, y)));
        const tris = THREE.ShapeUtils.triangulateShape(contour, holes);
        const all = [...g.outer, ...g.holes.flat()];
        // cap normal: away from the neighbouring frame
        let cu = 0;
        let cv = 0;
        for (const [x, y] of g.outer) {
          cu += x;
          cv += y;
        }
        cu /= g.outer.length;
        cv /= g.outer.length;
        place(frames[fi], cu, cv, p0);
        place(frames[fj], cu, cv, p1);
        const nrm = p0.clone().sub(p1).normalize();
        const base = caps.count;
        for (const [x, y] of all) caps.v(place(frames[fi], x, y, _a), nrm, x, y);
        for (const [i, j, k] of tris) {
          _a.fromArray(caps.pos, (base + i) * 3);
          _b.fromArray(caps.pos, (base + j) * 3);
          _c.fromArray(caps.pos, (base + k) * 3);
          const gN = _b.sub(_a).cross(_c.sub(_a));
          if (gN.dot(nrm) >= 0) caps.idx.push(base + i, base + j, base + k);
          else caps.idx.push(base + i, base + k, base + j);
        }
      }
    }
  }
  return { surf: surf.geo(), cut: cut.geo(), caps: caps.geo() };
}

// ───────────────────────────── frames ─────────────────────────────

/** Frames for a solid of revolution about the Y axis (lathe convention). */
export function revolveFrames(phi0: number, phi1: number, segsFull: number, centre?: V3): Frame[] {
  const n = Math.max(2, Math.ceil((segsFull * Math.abs(phi1 - phi0)) / (Math.PI * 2)));
  const out: Frame[] = [];
  const c = centre ?? new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    const phi = phi0 + ((phi1 - phi0) * i) / n;
    out.push({ p: c, n: new THREE.Vector3(Math.sin(phi), 0, Math.cos(phi)), b: new THREE.Vector3(0, 1, 0), u: phi / (Math.PI * 2) });
  }
  return out;
}

/** Revolve (r, y) loops about the Y axis between phi0 and phi1. */
export function revolve(loops: Loop[], phi0: number, phi1: number, segsFull: number, opts: { crease?: number; caps?: boolean; centre?: V3 } = {}): SweepResult {
  const full = Math.abs(phi1 - phi0) >= Math.PI * 2 - 1e-6;
  return sweep(loops, revolveFrames(phi0, phi1, segsFull, opts.centre), { crease: opts.crease, caps: !full && opts.caps });
}

export const BACK: [number, number] = [Math.PI / 2, (Math.PI * 3) / 2];
export const FRONT: [number, number] = [-Math.PI / 2, Math.PI / 2];
export const FULL: [number, number] = [0, Math.PI * 2];

/** A path through corner points with circular-arc bends (like bent tubing). */
export function filletPath(points: V3[], radius: number, maxStep = 0.02, bendStepDeg = 7.5): { p: V3[]; t: V3[]; len: number[] } {
  const P: V3[] = [];
  const T: V3[] = [];
  const push = (p: V3, t: V3) => {
    const last = P[P.length - 1];
    if (last && last.distanceToSquared(p) < 1e-12) {
      T[T.length - 1].copy(t);
      return;
    }
    P.push(p.clone());
    T.push(t.clone().normalize());
  };
  const seg = (a: V3, b: V3) => {
    const d = b.clone().sub(a);
    const l = d.length();
    if (l < 1e-9) return;
    const n = Math.max(1, Math.ceil(l / maxStep));
    for (let i = 0; i <= n; i++) push(a.clone().lerp(b, i / n), d);
  };
  let cur = points[0].clone();
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1];
    const b = points[i];
    const d0 = b.clone().sub(a).normalize();
    const d1 = points[i + 1].clone().sub(b).normalize();
    const cosT = THREE.MathUtils.clamp(d0.dot(d1), -1, 1);
    const theta = Math.acos(cosT);
    if (theta < 1e-3) continue;
    const lenA = a.distanceTo(b);
    const lenB = b.distanceTo(points[i + 1]);
    const r = Math.min(radius, (Math.min(lenA * (i === 1 ? 1 : 0.5), lenB * (i === points.length - 2 ? 1 : 0.5)) / Math.tan(theta / 2)) * 0.999);
    const off = r * Math.tan(theta / 2);
    const s = b.clone().addScaledVector(d0, -off);
    const e = b.clone().addScaledVector(d1, off);
    seg(cur, s);
    // arc from s to e: centre along the bisector
    const bis = d1.clone().sub(d0).normalize();
    const centre = b.clone().addScaledVector(bis, r / Math.cos(theta / 2));
    const u = s.clone().sub(centre);
    const w = e.clone().sub(centre);
    const ang = u.angleTo(w);
    const n = Math.max(2, Math.ceil((ang * 180) / Math.PI / bendStepDeg));
    const axis = u.clone().cross(w).normalize();
    for (let k = 0; k <= n; k++) {
      const q = new THREE.Quaternion().setFromAxisAngle(axis, (ang * k) / n);
      const p = u.clone().applyQuaternion(q).add(centre);
      const t = d0.clone().applyQuaternion(q);
      push(p, t);
    }
    cur = e;
  }
  seg(cur, points[points.length - 1]);
  const len: number[] = [0];
  for (let i = 1; i < P.length; i++) len.push(len[i - 1] + P[i].distanceTo(P[i - 1]));
  return { p: P, t: T, len };
}

/** Parallel-transport frames along a path (n, b span the cross-section). */
export function transportFrames(path: { p: V3[]; t: V3[]; len: number[] }, hint?: V3): Frame[] {
  const out: Frame[] = [];
  const t0 = path.t[0];
  let n = (hint ?? new THREE.Vector3(0, 0, 1)).clone();
  n.addScaledVector(t0, -n.dot(t0));
  if (n.lengthSq() < 1e-8) {
    n = new THREE.Vector3(1, 0, 0).addScaledVector(t0, -t0.x);
    if (n.lengthSq() < 1e-8) n.set(0, 1, 0).addScaledVector(t0, -t0.y);
  }
  n.normalize();
  for (let i = 0; i < path.p.length; i++) {
    const t = path.t[i];
    if (i > 0) {
      const tp = path.t[i - 1];
      const q = new THREE.Quaternion().setFromUnitVectors(tp, t);
      n.applyQuaternion(q);
      n.addScaledVector(t, -n.dot(t)).normalize();
    }
    const b = t.clone().cross(n).normalize();
    out.push({ p: path.p[i], n: n.clone(), b, u: path.len[i] });
  }
  return out;
}

/** Frames for a path lying in a section plane: b is the plane normal (v <= 0 is behind it). */
export function planarFrames(path: { p: V3[]; t: V3[]; len: number[] }, planeNormal: V3): Frame[] {
  return path.p.map((p, i) => {
    const t = path.t[i];
    const b = planeNormal.clone().addScaledVector(t, -planeNormal.dot(t)).normalize();
    const n = b.clone().cross(t).normalize();
    return { p, n, b, u: path.len[i] };
  });
}

// ───────────────────────────── profiles ─────────────────────────────

export function circle(r: number, n: number, a0 = 0, a1 = Math.PI * 2, cx = 0, cy = 0): V2[] {
  const out: V2[] = [];
  const full = Math.abs(a1 - a0) >= Math.PI * 2 - 1e-9;
  const m = full ? n : n + 1;
  for (let i = 0; i < m; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

/** Full pipe wall (outer surface, inner surface as a hole). */
export function annulus(ro: number, ri: number, n: number): Loop[] {
  return [
    { pts: circle(ro, n), smooth: true },
    { pts: circle(ri, n).reverse(), smooth: true, hole: true },
  ];
}

/** Back half of a pipe wall (v <= 0) with the two section edges on v = 0. */
export function halfAnnulus(ro: number, ri: number, n: number): Loop {
  const m = Math.max(4, Math.round(n / 2));
  const pts: V2[] = [];
  for (let i = 0; i <= m; i++) {
    const a = Math.PI + (Math.PI * i) / m;
    pts.push([ro * Math.cos(a), ro * Math.sin(a)]);
  }
  for (let i = 0; i <= m; i++) {
    const a = Math.PI * 2 - (Math.PI * i) / m;
    pts.push([ri * Math.cos(a), ri * Math.sin(a)]);
  }
  // edges: 0..m-1 outer arc, m: (ro,0)->(ri,0) cut, m+1..2m inner arc, 2m+1: (-ri,0)->(-ro,0) cut
  return { pts, cut: (i) => i === m || i === 2 * m + 1 };
}

/** Front half of a pipe wall (v >= 0). */
export function frontHalfAnnulus(ro: number, ri: number, n: number): Loop {
  const m = Math.max(4, Math.round(n / 2));
  const h = halfAnnulus(ro, ri, n);
  // mirrored and reversed: the section edges keep their indices (m and 2m + 1)
  return { pts: h.pts.map(([u, v]) => [u, -v] as V2).reverse(), cut: (i) => i === m || i === 2 * m + 1 };
}

/** Round the corners of a closed polygon (radius clamped to half the shorter edge). */
export function roundPoly(pts: V2[], radius: number | ((i: number) => number), segs = 3): V2[] {
  const N = pts.length;
  const out: V2[] = [];
  for (let i = 0; i < N; i++) {
    const p = pts[i];
    const a = pts[(i - 1 + N) % N];
    const b = pts[(i + 1) % N];
    const r0 = typeof radius === 'number' ? radius : radius(i);
    if (r0 <= 0) {
      out.push(p);
      continue;
    }
    const d0: V2 = [p[0] - a[0], p[1] - a[1]];
    const d1: V2 = [b[0] - p[0], b[1] - p[1]];
    const l0 = Math.hypot(...d0);
    const l1 = Math.hypot(...d1);
    const cosT = (d0[0] * d1[0] + d0[1] * d1[1]) / (l0 * l1);
    const theta = Math.acos(Math.max(-1, Math.min(1, cosT)));
    if (theta < 1e-3) {
      out.push(p);
      continue;
    }
    const off = Math.min(r0 * Math.tan(theta / 2), l0 * 0.45, l1 * 0.45);
    const s: V2 = [p[0] - (d0[0] / l0) * off, p[1] - (d0[1] / l0) * off];
    const e: V2 = [p[0] + (d1[0] / l1) * off, p[1] + (d1[1] / l1) * off];
    // quadratic Bezier through the corner (close to a circular arc for these small radii)
    for (let k = 0; k <= segs; k++) {
      const t = k / segs;
      const u = 1 - t;
      out.push([u * u * s[0] + 2 * u * t * p[0] + t * t * e[0], u * u * s[1] + 2 * u * t * p[1] + t * t * e[1]]);
    }
  }
  return out;
}

/** Offset an open polyline (r, y) along its left normal by d (positive = away from the axis for downward paths). */
export function offsetPolyline(pts: V2[], d: number): V2[] {
  const out: V2[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const tx = b[0] - a[0];
    const ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1;
    out.push([pts[i][0] + (ty / l) * d * -1, pts[i][1] + (tx / l) * d]);
  }
  return out;
}

// ───────────────────────────── small parts ─────────────────────────────

/** Hex bolt head with washer, +Y up, base at y = 0 (`light`: the hex head alone). */
export function hexBolt(size: number, height: number, light = false): THREE.BufferGeometry {
  if (light) {
    const h = new THREE.CylinderGeometry(size * 0.5, size * 0.5, height * 0.8, 6, 1, false);
    h.translate(0, height * 0.4, 0);
    return h;
  }
  const washer = new THREE.CylinderGeometry(size * 0.62, size * 0.62, height * 0.22, 10);
  washer.translate(0, height * 0.11, 0);
  const head = new THREE.CylinderGeometry(size * 0.5, size * 0.5, height * 0.7, 6, 1, false);
  head.translate(0, height * 0.22 + height * 0.35, 0);
  const g = merge([washer, head]);
  washer.dispose();
  head.dispose();
  return g;
}

/** Copies of a geometry around a circle (Y axis = axis), each copy placed by a callback-able filter. */
export function ringOf(
  geo: THREE.BufferGeometry,
  count: number,
  radius: number,
  opts: { phase?: number; centre?: V3; axis?: V3; y?: number; faceOut?: boolean; filter?: (p: V3) => boolean } = {},
): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = [];
  const centre = opts.centre ?? new THREE.Vector3();
  const axis = (opts.axis ?? new THREE.Vector3(0, 1, 0)).clone().normalize();
  const qAxis = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const phi = (opts.phase ?? 0) + (i * Math.PI * 2) / count;
    const local = new THREE.Vector3(radius * Math.sin(phi), opts.y ?? 0, radius * Math.cos(phi));
    const pos = local.clone().applyQuaternion(qAxis).add(centre);
    if (opts.filter && !opts.filter(pos)) continue;
    const q = qAxis.clone();
    if (opts.faceOut) {
      // copy's +Y points radially outward
      const qr = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(Math.sin(phi), 0, Math.cos(phi)));
      q.multiply(qr);
    } else q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), phi));
    m.compose(pos, q, new THREE.Vector3(1, 1, 1));
    parts.push(geo.clone().applyMatrix4(m));
  }
  if (!parts.length) return null;
  const out = merge(parts);
  for (const p of parts) p.dispose();
  return out;
}

/** Transform a +Y-aligned geometry so its origin sits at `at` and +Y points along `dir`. */
export function orient(geo: THREE.BufferGeometry, at: V3, dir: V3, roll = 0): THREE.BufferGeometry {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  if (roll) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), roll));
  return geo.applyMatrix4(new THREE.Matrix4().compose(at, q, new THREE.Vector3(1, 1, 1)));
}

/** Normalise attributes so geometries can be merged (position, normal, uv; indexed). */
export function normalise(g: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.index) {
    const n = g.attributes.position.count;
    const idx: number[] = new Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    g.setIndex(idx);
  }
  g.clearGroups();
  return g;
}

export function merge(geos: (THREE.BufferGeometry | null | undefined)[]): THREE.BufferGeometry {
  const list = geos.filter((g): g is THREE.BufferGeometry => !!g).map((g) => normalise(g));
  if (!list.length) return new THREE.BufferGeometry();
  if (list.length === 1) return list[0];
  const m = mergeGeometries(list, false);
  if (!m) throw new Error('engine geometry merge failed');
  return m;
}

/** Sinusoidal bellows convolution profile as a closed thin wall (r, y), y from 0 to len. */
export function bellowsLoop(r: number, len: number, conv: number, amp: number, wall: number, steps = 10): Loop {
  const outer: V2[] = [];
  const n = conv * steps;
  for (let i = 0; i <= n; i++) {
    const y = (len * i) / n;
    const a = (i / steps) * Math.PI * 2;
    outer.push([r + amp * (0.5 - 0.5 * Math.cos(a)), y]);
  }
  const inner = outer.map(([x, y]) => [x - wall, y] as V2).reverse();
  return { pts: [...outer, ...inner] };
}

// ───────────────────────────── clipped circular sweeps ─────────────────────────────

export interface TubeOpts {
  /** Outer radius (or per-frame function of the path fraction 0..1). */
  ro: number | ((t: number) => number);
  /** Inner radius (0 or undefined: solid rod, outer surface only). */
  ri?: number | ((t: number) => number);
  /** Radial segments of the full circle. */
  segs: number;
  /** Section plane z = clipZ: returns separate back (z <= clipZ) and front parts. */
  clipZ?: number;
  /** Cap the open ends (for rods and for the ends of isolated pieces). */
  endCaps?: boolean;
}

export interface ClippedTube {
  back: SweepResult;
  front: SweepResult;
}

/**
 * Sweep a circular (optionally hollow) cross-section along frames and cut it exactly by the
 * plane z = clipZ: each ring keeps only the arc on the requested side; the arc ends are joined
 * by flat section strips lying in the plane. Works for pipes at any angle, bends that cross the
 * plane, volutes and tori.
 */
export function clippedTube(frames: Frame[], o: TubeOpts): ClippedTube {
  const F = frames.length;
  const roOf = (i: number) => (typeof o.ro === 'number' ? o.ro : o.ro(i / Math.max(1, F - 1)));
  const riOf = (i: number) => (o.ri === undefined ? 0 : typeof o.ri === 'number' ? o.ri : o.ri(i / Math.max(1, F - 1)));
  const hollow = o.ri !== undefined && o.ri !== 0;
  const MF = Math.max(6, o.segs);
  const TAU = Math.PI * 2;
  const make = (side: 1 | -1): SweepResult => {
    const surf = new Buf();
    const cut = new Buf();
    const caps = new Buf();
    /** Kept arc [a0, a1] of the ring of radius r (full ring: seam at the point nearest the plane). */
    const arcOf = (f: Frame, r: number): { a0: number; a1: number; full: boolean; deg?: boolean } | null => {
      if (o.clipZ === undefined) return { a0: 0, a1: TAU, full: true };
      const A = Math.hypot(f.n.z, f.b.z);
      const th0 = A > 1e-9 ? Math.atan2(f.b.z, f.n.z) : 0;
      const base = side > 0 ? th0 : th0 + Math.PI;
      const dz = (o.clipZ - f.p.z) * side;
      // a ring lying in the plane belongs to both halves (rounding would otherwise give it to one
      // side only and leave a one-segment gap in the other, e.g. in a torus crossing the plane)
      if (A * r < 1e-9) return dz >= -1e-7 ? { a0: base, a1: base + TAU, full: true, deg: true } : null;
      const k = dz / (r * A);
      if (k >= 1) return { a0: base, a1: base + TAU, full: true };
      if (k <= -1) return null;
      const c = Math.acos(k);
      return { a0: base + c, a1: base + TAU - c, full: false };
    };
    /**
     * Arc of ring i. A ring parallel to the plane has no direction toward the plane, so its seam
     * angle would be arbitrary (atan2 of rounding noise) and could differ by half a turn from its
     * neighbours', twisting the strip between them into an hourglass: it takes a neighbour's.
     */
    const arcI = (i: number, r: number) => {
      const a = arcOf(frames[i], r);
      if (!a || !a.deg) return a;
      // the nearest regular ring of the same run, looking back first (a straight stretch along Z
      // then takes one seam angle throughout, the one of the bend it follows)
      for (const step of [-1, 1])
        for (let j = i + step; j >= 0 && j < F; j += step) {
          const b = arcOf(frames[j], r);
          if (!b) break;
          if (b.deg) continue;
          const base = (b.a0 + b.a1) / 2 - Math.PI;
          return { a0: base, a1: base + TAU, full: true };
        }
      return a;
    };
    const P = new THREE.Vector3();
    const Nn = new THREE.Vector3();
    const ringPt = (f: Frame, r: number, th: number) => P.copy(f.p).addScaledVector(f.n, r * Math.cos(th)).addScaledVector(f.b, r * Math.sin(th));
    const ringN = (f: Frame, th: number, s: number) => Nn.copy(f.n).multiplyScalar(Math.cos(th) * s).addScaledVector(f.b, Math.sin(th) * s);
    const tri = (buf: Buf, a: number, b: number, c: number, want: THREE.Vector3) => {
      const A = new THREE.Vector3().fromArray(buf.pos, a * 3);
      const g = new THREE.Vector3().fromArray(buf.pos, b * 3).sub(A).cross(new THREE.Vector3().fromArray(buf.pos, c * 3).sub(A));
      if (g.dot(want) >= 0) buf.idx.push(a, b, c);
      else buf.idx.push(a, c, b);
    };
    let run: number[] = [];
    // segments of the kept arc: proportional to the widest arc of the run (a half pipe gets
    // half the segments of a whole one, so the two halves together match an uncut pipe)
    let M = MF;
    const flush = () => {
      if (run.length < 2) {
        run = [];
        return;
      }
      let widest = 0;
      for (const i of run) {
        const a = arcI(i, roOf(i));
        if (a) widest = Math.max(widest, a.a1 - a.a0);
      }
      M = Math.max(4, Math.ceil((MF * widest) / TAU - 1e-6));
      const surface = (radius: (i: number) => number, s: 1 | -1, M: number) => {
        const cols = M + 1;
        const base = surf.count;
        for (const i of run) {
          const f = frames[i];
          const arc = arcI(i, radius(i));
          if (!arc) {
            // inner ring entirely on the removed side: collapse it onto the chord midpoint
            const ao = arcI(i, roOf(i))!;
            const mid = ringPt(f, roOf(i), ao.a0).clone().lerp(ringPt(f, roOf(i), ao.a1).clone(), 0.5);
            for (let m = 0; m <= M; m++) surf.v(mid, ringN(f, (ao.a0 + ao.a1) / 2, s), f.u, m / M);
            continue;
          }
          for (let m = 0; m <= M; m++) {
            const th = arc.a0 + ((arc.a1 - arc.a0) * m) / M;
            surf.v(ringPt(f, radius(i), th), ringN(f, th, s), f.u, m / M);
          }
        }
        const nrm = new THREE.Vector3();
        for (let j = 0; j < run.length - 1; j++)
          for (let m = 0; m < M; m++) {
            const a = base + j * cols + m;
            nrm.fromArray(surf.nor, a * 3);
            tri(surf, a, a + 1, a + cols, nrm);
            nrm.fromArray(surf.nor, (a + 1) * 3);
            tri(surf, a + 1, a + cols + 1, a + cols, nrm);
          }
      };
      surface(roOf, 1, M);
      // the bore is seen only at cut ends and openings: half the segments do
      if (hollow) surface(riOf, -1, Math.max(4, Math.ceil(M / 2)));
      // section strips in the plane: two strips per ring, [outer end -> inner end] on each side,
      // or both halves of the chord when the plane misses the bore (or for a solid rod)
      if (o.clipZ !== undefined) {
        const cBase = cut.count;
        const planeN = new THREE.Vector3(0, 0, side);
        let any = false;
        for (const i of run) {
          const f = frames[i];
          const ao = arcI(i, roOf(i))!;
          if (!ao.full) any = true;
          const e0 = ringPt(f, roOf(i), ao.a0).clone();
          const e1 = ringPt(f, roOf(i), ao.a1).clone();
          const ai = hollow ? arcI(i, riOf(i)) : null;
          let m0: THREE.Vector3;
          let m1: THREE.Vector3;
          if (hollow && ai && !ai.full) {
            m0 = ringPt(f, riOf(i), ai.a0).clone();
            m1 = ringPt(f, riOf(i), ai.a1).clone();
          } else {
            m0 = e0.clone().lerp(e1, 0.5);
            m1 = m0.clone();
          }
          cut.v(e0, planeN, f.u, 0);
          cut.v(m0, planeN, f.u, 1);
          cut.v(e1, planeN, f.u, 0);
          cut.v(m1, planeN, f.u, 1);
        }
        if (any) {
          for (let j = 0; j < run.length - 1; j++) {
            const a = cBase + j * 4;
            const b = a + 4;
            for (const k of [0, 2]) {
              tri(cut, a + k, a + k + 1, b + k, planeN);
              tri(cut, a + k + 1, b + k + 1, b + k, planeN);
            }
          }
        } else {
          cut.pos.length = cBase * 3;
          cut.nor.length = cBase * 3;
          cut.uv.length = cBase * 2;
        }
      }
      // end caps (annulus or disc) where a run starts or ends
      const capAt = (i: number, dirSign: number) => {
        const f = frames[i];
        const t = frames[Math.min(F - 1, i + 1)].p.clone().sub(frames[Math.max(0, i - 1)].p).normalize().multiplyScalar(dirSign);
        const ao = arcI(i, roOf(i));
        if (!ao) return;
        const ai = hollow ? arcI(i, riOf(i)) : null;
        const base = caps.count;
        for (let m = 0; m <= M; m++) {
          const th = ao.a0 + ((ao.a1 - ao.a0) * m) / M;
          caps.v(ringPt(f, roOf(i), th).clone(), t, 0, 0);
          if (hollow && ai) caps.v(ringPt(f, riOf(i), ai.a0 + ((ai.a1 - ai.a0) * m) / M).clone(), t, 0, 0);
          else caps.v(f.p.clone(), t, 0, 0);
        }
        for (let m = 0; m < M; m++) {
          const a = base + m * 2;
          tri(caps, a, a + 2, a + 1, t);
          tri(caps, a + 1, a + 2, a + 3, t);
        }
      };
      const first = run[0];
      const last = run[run.length - 1];
      if (o.endCaps || first > 0) capAt(first, -1);
      if (o.endCaps || last < F - 1) capAt(last, 1);
      run = [];
    };
    for (let i = 0; i < F; i++) {
      if (arcI(i, roOf(i))) run.push(i);
      else flush();
    }
    flush();
    return { surf: surf.geo(), cut: cut.geo(), caps: caps.geo() };
  };
  if (o.clipZ === undefined) return { back: make(1), front: { surf: null, cut: null, caps: null } };
  return { back: make(1), front: make(-1) };
}

/** Frames along a circle (radius R, around a vertical axis through `centre`), angles in the lathe convention. */
export function circleFrames(centre: THREE.Vector3, R: number, a0: number, a1: number, segsFull: number, opts: { dy?: (t: number) => number } = {}): Frame[] {
  const n = Math.max(2, Math.ceil((segsFull * Math.abs(a1 - a0)) / (Math.PI * 2)));
  const out: Frame[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = a0 + (a1 - a0) * t;
    const radial = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    const p = centre.clone().addScaledVector(radial, R);
    if (opts.dy) p.y += opts.dy(t);
    out.push({ p, n: radial, b: new THREE.Vector3(0, 1, 0), u: R * (a - a0) });
  }
  return out;
}
