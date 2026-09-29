/**
 * Geometry toolkit for the launch vehicle: profile lathes with correct outward normals and
 * split hard edges, metric UVs, thick-shell profiles, cut-face (section) geometry, pipes with
 * bends, lofted cross-sections, and helpers that make every geometry mergeable.
 *
 * Profiles live in the (r, y) half-plane of the MODEL FRAME: r = distance from the vehicle
 * axis, y = height. Lathe azimuth phi is measured from +Z toward +X (three.js convention), so
 * a point is (r sin phi, y, r cos phi). A profile is walked with the solid on its LEFT, so the
 * outward normal of a segment with tangent (dr, dy) is (dy, -dr).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type P2 = [number, number];

const TAU = Math.PI * 2;

// ───────────────────────────── lathe ─────────────────────────────

export interface LatheOpts {
  seg: number;
  phi0?: number;
  phiLen?: number;
  /** Treat the profile as a closed loop (last point joins the first). */
  closed?: boolean;
  /** Corners sharper than this (deg) get split normals. */
  smooth?: number;
  /** Radius used for the metric U coordinate (arc length at this radius). */
  uR?: number;
  /** V coordinate: cumulative profile length (default) or height. */
  v?: 'arc' | 'y';
}

interface Row {
  r: number;
  y: number;
  nr: number;
  ny: number;
  v: number;
}

function segNormal(a: P2, b: P2): P2 {
  const dr = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dr, dy) || 1;
  return [dy / l, -dr / l];
}

/**
 * Lathe a profile polyline into a surface. Points on the axis (r = 0) collapse correctly.
 * Normals are analytic from the profile (smooth unless a corner is sharper than `smooth`).
 */
export function lathe(profile: P2[], o: LatheOpts): THREE.BufferGeometry {
  const pts = o.closed ? [...profile, profile[0]] : profile;
  const n = pts.length;
  const smoothCos = Math.cos(((o.smooth ?? 32) * Math.PI) / 180);
  const segN: P2[] = [];
  for (let i = 0; i < n - 1; i++) segN.push(segNormal(pts[i], pts[i + 1]));
  // rows + which consecutive row pairs form faces
  const rows: Row[] = [];
  const faces: [number, number][] = [];
  let acc = 0;
  let prevRow = -1;
  for (let i = 0; i < n; i++) {
    if (i > 0) acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const v = o.v === 'y' ? pts[i][1] : acc;
    let nIn = i > 0 ? segN[i - 1] : null;
    let nOut = i < n - 1 ? segN[i] : null;
    if (o.closed && i === 0) nIn = segN[n - 2];
    if (o.closed && i === n - 1) nOut = segN[0];
    const [r, y] = pts[i];
    if (nIn && nOut && nIn[0] * nOut[0] + nIn[1] * nOut[1] < smoothCos) {
      // hard corner: end the incoming face with its own normal, start a new row for the next
      if (i > 0) {
        rows.push({ r, y, nr: nIn[0], ny: nIn[1], v });
        faces.push([prevRow, rows.length - 1]);
      }
      if (i < n - 1) {
        rows.push({ r, y, nr: nOut[0], ny: nOut[1], v });
        prevRow = rows.length - 1;
      }
    } else {
      let nr = 0;
      let ny = 0;
      if (nIn) {
        nr += nIn[0];
        ny += nIn[1];
      }
      if (nOut) {
        nr += nOut[0];
        ny += nOut[1];
      }
      const l = Math.hypot(nr, ny) || 1;
      rows.push({ r, y, nr: nr / l, ny: ny / l, v });
      if (i > 0) faces.push([prevRow, rows.length - 1]);
      prevRow = rows.length - 1;
    }
  }
  const seg = Math.max(3, Math.round(o.seg));
  const phi0 = o.phi0 ?? 0;
  const phiLen = o.phiLen ?? TAU;
  const uR = o.uR ?? 1;
  const cols = seg + 1;
  const pos = new Float32Array(rows.length * cols * 3);
  const nor = new Float32Array(rows.length * cols * 3);
  const uv = new Float32Array(rows.length * cols * 2);
  for (let j = 0; j < rows.length; j++) {
    const R = rows[j];
    for (let i = 0; i < cols; i++) {
      const phi = phi0 + (i / seg) * phiLen;
      const s = Math.sin(phi);
      const c = Math.cos(phi);
      const k = j * cols + i;
      pos[k * 3] = R.r * s;
      pos[k * 3 + 1] = R.y;
      pos[k * 3 + 2] = R.r * c;
      nor[k * 3] = R.nr * s;
      nor[k * 3 + 1] = R.ny;
      nor[k * 3 + 2] = R.nr * c;
      uv[k * 2] = (phi - phi0) * uR;
      uv[k * 2 + 1] = R.v;
    }
  }
  const idx: number[] = [];
  for (const [a, b] of faces) {
    for (let i = 0; i < seg; i++) {
      const a0 = a * cols + i;
      const a1 = a0 + 1;
      const b0 = b * cols + i;
      const b1 = b0 + 1;
      // normal = dP/dphi x dP/ds (see file header)
      idx.push(a0, a1, b0, a1, b1, b0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Split a closed CCW polygon into lathe runs by material key (edge i: p[i] -> p[i+1]). */
export function latheRuns<K>(poly: P2[], edgeKey: (i: number, a: P2, b: P2) => K, o: Omit<LatheOpts, 'closed'>): { key: K; geom: THREE.BufferGeometry }[] {
  const n = poly.length;
  const keys = poly.map((_, i) => edgeKey(i, poly[i], poly[(i + 1) % n]));
  // rotate so that a run boundary is at index 0
  let start = 0;
  for (let i = 0; i < n; i++)
    if (keys[i] !== keys[(i - 1 + n) % n]) {
      start = i;
      break;
    }
  const out: { key: K; geom: THREE.BufferGeometry }[] = [];
  const allSame = keys.every((k) => k === keys[0]);
  if (allSame) return [{ key: keys[0], geom: lathe(poly, { ...o, closed: true }) }];
  let i = 0;
  while (i < n) {
    const k = keys[(start + i) % n];
    const run: P2[] = [poly[(start + i) % n]];
    while (i < n && keys[(start + i) % n] === k) {
      run.push(poly[(start + i + 1) % n]);
      i++;
    }
    out.push({ key: k, geom: lathe(run, o) });
  }
  return out;
}

// ───────────────────────────── profiles ─────────────────────────────

/** Ellipse quarter from the equator (t=0) to the apex (t=pi/2). dir +1 bulges up, -1 down. */
export function ellipseArc(a: number, b: number, yEq: number, dir: 1 | -1, n: number, rMin = 0): P2[] {
  const out: P2[] = [];
  const tMax = rMin > 0 ? Math.acos(Math.min(1, rMin / a)) : Math.PI / 2;
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * tMax;
    out.push([a * Math.cos(t), yEq + dir * b * Math.sin(t)]);
  }
  return out;
}

/** Offset a polyline by d along its left-hand normal (positive d: into the solid side... callers pass signed d). */
export function offsetPolyline(pts: P2[], d: number): P2[] {
  const n = pts.length;
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    const nn = segNormal(a, b);
    return [p[0] + nn[0] * d, p[1] + nn[1] * d];
  });
}

/** Closed polygon of a shell of thickness t whose OUTER surface follows `outer` (walked with the solid on the left). */
export function shellPoly(outer: P2[], t: number): P2[] {
  const inner = offsetPolyline(outer, -t);
  return [...outer, ...inner.reverse()];
}

/** Rectangle (r0..r1, y0..y1) as a CCW polygon with optional bevel. */
export function rectPoly(r0: number, r1: number, y0: number, y1: number, bevel = 0): P2[] {
  if (bevel <= 0) return [
    [r0, y0],
    [r1, y0],
    [r1, y1],
    [r0, y1],
  ];
  const b = Math.min(bevel, (r1 - r0) / 3, (y1 - y0) / 3);
  return [
    [r0 + b, y0],
    [r1 - b, y0],
    [r1, y0 + b],
    [r1, y1 - b],
    [r1 - b, y1],
    [r0 + b, y1],
    [r0, y1 - b],
    [r0, y0 + b],
  ];
}

/** A solid ring (closed lathe of a bevelled rectangle). */
export function ringGeom(r0: number, r1: number, y0: number, y1: number, seg: number, bevel = 0.002, phi0?: number, phiLen?: number): THREE.BufferGeometry {
  return lathe(rectPoly(r0, r1, y0, y1, bevel), { seg, closed: true, smooth: 50, phi0, phiLen });
}

// ───────────────────────────── caps (section faces) ─────────────────────────────

/** Flat cap in the local XY plane from a closed (r, y) polygon (x = r). UVs = coordinates in metres. */
export function capFromPoly(poly: P2[]): THREE.BufferGeometry {
  const shape = new THREE.Shape(poly.map(([r, y]) => new THREE.Vector2(r, y)));
  const g = new THREE.ShapeGeometry(shape, 1);
  return g;
}

/**
 * Cap strip between two matching polylines (outer and inner boundary of a layer), in the local
 * XY plane. U = arc length along the layer (m), V = 0 at the outer and 1 at the inner boundary.
 */
export function capStrip(outer: P2[], inner: P2[]): THREE.BufferGeometry {
  const n = Math.min(outer.length, inner.length);
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  let acc = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) acc += Math.hypot(outer[i][0] - outer[i - 1][0], outer[i][1] - outer[i - 1][1]);
    pos.push(outer[i][0], outer[i][1], 0, inner[i][0], inner[i][1], 0);
    nor.push(0, 0, 1, 0, 0, 1);
    uv.push(acc, 0, acc, 1);
  }
  const idx: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  // make winding face +Z regardless of the polyline direction
  fixWinding(g, new THREE.Vector3(0, 0, 1));
  return g;
}

/** Flip triangles whose geometric normal disagrees with `want`. */
export function fixWinding(g: THREE.BufferGeometry, want: THREE.Vector3) {
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const ix = g.getIndex()!;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < ix.count; i += 3) {
    a.fromBufferAttribute(p, ix.getX(i));
    b.fromBufferAttribute(p, ix.getX(i + 1));
    c.fromBufferAttribute(p, ix.getX(i + 2));
    b.sub(a);
    c.sub(a);
    if (b.cross(c).dot(want) < 0) {
      const t = ix.getX(i + 1);
      ix.setX(i + 1, ix.getX(i + 2));
      ix.setX(i + 2, t);
    }
  }
  ix.needsUpdate = true;
}

// ───────────────────────────── pipes, lofts, primitives ─────────────────────────────

/** A polyline with rounded bends (radius br) as a smooth curve. */
export function bentPath(points: THREE.Vector3[], br: number): THREE.CurvePath<THREE.Vector3> {
  const path = new THREE.CurvePath<THREE.Vector3>();
  let cur = points[0].clone();
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const dIn = p.clone().sub(points[i - 1]);
    const dOut = points[i + 1].clone().sub(p);
    const r = Math.min(br, dIn.length() * 0.45, dOut.length() * 0.45);
    const a = p.clone().addScaledVector(dIn.normalize(), -r);
    const b = p.clone().addScaledVector(dOut.normalize(), r);
    if (a.distanceTo(cur) > 1e-4) path.add(new THREE.LineCurve3(cur, a));
    path.add(new THREE.QuadraticBezierCurve3(a, p.clone(), b));
    cur = b;
  }
  path.add(new THREE.LineCurve3(cur, points[points.length - 1].clone()));
  return path;
}

export function pipe(points: THREE.Vector3[], radius: number, bend: number, radial: number, perMetre = 6): THREE.BufferGeometry {
  const path = bentPath(points, bend);
  const len = path.getLength();
  const g = new THREE.TubeGeometry(path as unknown as THREE.Curve<THREE.Vector3>, Math.max(4, Math.ceil(len * perMetre)), radius, radial, false);
  return g;
}

/** Cylinder between two points (open or capped). */
export function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, seg: number, capped = true, r2 = r): THREE.BufferGeometry {
  const d = b.clone().sub(a);
  const len = d.length();
  const g = new THREE.CylinderGeometry(r2, r, len, seg, 1, !capped);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  g.applyQuaternion(q);
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

/** Box with chamfered edges on all sides (centred at the origin). */
export function bevelBox(w: number, h: number, d: number, bevel: number): THREE.BufferGeometry {
  const b = Math.min(bevel, w / 4, h / 4, d / 4);
  if (b <= 0) return new THREE.BoxGeometry(w, h, d);
  const iw = w / 2 - b;
  const ih = h / 2 - b;
  const c = Math.min(b * 0.8, iw * 0.5, ih * 0.5);
  const s = new THREE.Shape();
  s.moveTo(-iw + c, -ih);
  s.lineTo(iw - c, -ih);
  s.lineTo(iw, -ih + c);
  s.lineTo(iw, ih - c);
  s.lineTo(iw - c, ih);
  s.lineTo(-iw + c, ih);
  s.lineTo(-iw, ih - c);
  s.lineTo(-iw, -ih + c);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 1, curveSegments: 1 });
  g.translate(0, 0, -(d - 2 * b) / 2);
  return g;
}

/**
 * Loft: closed cross-sections (each an array of local 2D points (x, z)) placed along stations.
 * frame(s) returns the origin and the axes (x, z) of the section plane at station index s.
 */
export function loft(sectionsIn: P2[][], frames: { o: THREE.Vector3; ax: THREE.Vector3; az: THREE.Vector3 }[], capEnds = true): THREE.BufferGeometry {
  // orientation: outward side normals need CCW sections (in x, z) when (ax, along, az) is right-handed
  let area = 0;
  const s0 = sectionsIn[0];
  for (let i = 0; i < s0.length; i++) {
    const [x1, z1] = s0[i];
    const [x2, z2] = s0[(i + 1) % s0.length];
    area += x1 * z2 - x2 * z1;
  }
  const along = frames[frames.length - 1].o.clone().sub(frames[0].o);
  const hand = new THREE.Vector3().crossVectors(frames[0].ax, along).dot(frames[0].az);
  const sections = area * hand < 0 ? sectionsIn.map((s) => [...s].reverse()) : sectionsIn;
  const m = sections[0].length;
  const pos: number[] = [];
  const uv: number[] = [];
  let acc = 0;
  for (let s = 0; s < sections.length; s++) {
    const f = frames[s];
    if (s > 0) acc += f.o.distanceTo(frames[s - 1].o);
    for (let i = 0; i <= m; i++) {
      const [x, z] = sections[s][i % m];
      const p = f.o.clone().addScaledVector(f.ax, x).addScaledVector(f.az, z);
      pos.push(p.x, p.y, p.z);
      uv.push(i / m, acc);
    }
  }
  const idx: number[] = [];
  const cols = m + 1;
  for (let s = 0; s < sections.length - 1; s++)
    for (let i = 0; i < m; i++) {
      const a = s * cols + i;
      const b = a + cols;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (capEnds) {
    const caps: THREE.BufferGeometry[] = [g];
    for (const s of [0, sections.length - 1]) {
      const f = frames[s];
      const shape = new THREE.Shape(sections[s].map(([x, z]) => new THREE.Vector2(x, z)));
      const cg = new THREE.ShapeGeometry(shape, 1);
      const pa = cg.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pa.count; i++) {
        const p = f.o.clone().addScaledVector(f.ax, pa.getX(i)).addScaledVector(f.az, pa.getY(i));
        pa.setXYZ(i, p.x, p.y, p.z);
      }
      const nrm = new THREE.Vector3().crossVectors(f.ax, f.az).normalize();
      const along = s === 0 ? frames[1].o.clone().sub(f.o) : f.o.clone().sub(frames[s - 1].o);
      const want = along.normalize().multiplyScalar(s === 0 ? -1 : 1);
      if (nrm.dot(want) < 0) nrm.negate();
      const na = new Float32Array(pa.count * 3);
      for (let i = 0; i < pa.count; i++) na.set([want.x, want.y, want.z], i * 3);
      cg.setAttribute('normal', new THREE.BufferAttribute(na, 3));
      fixWinding(cg, want);
      caps.push(cg);
    }
    g = mergeAll(caps);
  }
  return g;
}

// ───────────────────────────── merge helpers ─────────────────────────────

/** Make a geometry mergeable: indexed, exactly position/normal/uv (+ optional extra attributes). */
export function normalize(g: THREE.BufferGeometry): THREE.BufferGeometry {
  if (!g.getIndex()) {
    const n = g.getAttribute('position').count;
    const ix = new Array(n);
    for (let i = 0; i < n; i++) ix[i] = i;
    g.setIndex(ix);
  }
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv' && k !== 'aVeh') g.deleteAttribute(k);
  // non-interleaved float32 copies
  for (const k of ['position', 'normal', 'uv']) {
    const a = g.getAttribute(k) as THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
    if ((a as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute || !(a.array instanceof Float32Array)) {
      const n = a.count;
      const size = a.itemSize;
      const arr = new Float32Array(n * size);
      for (let i = 0; i < n; i++) for (let c = 0; c < size; c++) arr[i * size + c] = a.getComponent(i, c);
      g.setAttribute(k, new THREE.BufferAttribute(arr, size));
    }
  }
  g.morphAttributes = {};
  g.clearGroups();
  return g;
}

export function mergeAll(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (list.length === 1) return normalize(list[0]);
  const norm = list.map(normalize);
  const out = mergeGeometries(norm, false);
  if (!out) throw new Error('vehicle: geometry merge failed');
  for (const g of norm) g.dispose();
  return out;
}

/** Radius at azimuth phi, height y as a model-frame point. */
export function polar(r: number, phi: number, y: number, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(r * Math.sin(phi), y, r * Math.cos(phi));
}

/** Matrix that places local +Z radially outward at azimuth phi, local +Y up, local +X along increasing phi. */
export function radialFrame(r: number, phi: number, y: number): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  const ex = new THREE.Vector3(Math.cos(phi), 0, -Math.sin(phi));
  const ey = new THREE.Vector3(0, 1, 0);
  const ez = new THREE.Vector3(Math.sin(phi), 0, Math.cos(phi));
  m.makeBasis(ex, ey, ez);
  m.setPosition(r * Math.sin(phi), y, r * Math.cos(phi));
  return m;
}

/** Hex-head bolt ring on a cylinder of radius r at height y (heads pointing outward). */
export function boltRing(r: number, y: number, count: number, head = 0.009, h = 0.006, phi0 = 0): THREE.BufferGeometry {
  const proto = new THREE.CylinderGeometry(head, head, h, 6, 1, false);
  proto.rotateX(Math.PI / 2); // axis along +Z (outward)
  proto.translate(0, 0, h / 2);
  const list: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const phi = phi0 + (i / count) * TAU;
    const g = proto.clone();
    g.applyMatrix4(radialFrame(r, phi, y));
    list.push(g);
  }
  proto.dispose();
  return mergeAll(list);
}

/** Shape of a circle with holes, extruded (for plates with cut-outs), lying in XZ with its top at y1. */
export function platePlan(outerR: number, holes: { x: number; z: number; r: number }[], y0: number, y1: number, curveSeg: number, bevel = 0.006): THREE.BufferGeometry {
  const s = new THREE.Shape();
  // the bevel pushes the side walls out by `bevel`: compensate so the finished edges land on the given radii
  s.absarc(0, 0, outerR - bevel, 0, TAU, false);
  for (const h of holes) {
    const p = new THREE.Path();
    p.absarc(h.x, -h.z, h.r + bevel, 0, TAU, true);
    s.holes.push(p);
  }
  const depth = y1 - y0 - 2 * bevel;
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, depth), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: curveSeg });
  // shape XY -> model XZ (y of the shape = -z), extrusion along +Z -> +Y
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0 + bevel, 0);
  return g;
}
