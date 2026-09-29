/**
 * Thrust chamber assembly: LOX dome, injector (body, fuel manifold, faceplate, baffles),
 * regeneratively cooled chamber (copper-alloy liner with milled channels closed out by a
 * nickel-alloy jacket), brazed tube-wall nozzle with hatbands and the coolant inlet manifold,
 * and for the E-1V the radiatively cooled niobium extension.
 *
 * In hangar detail every solid of revolution is built as two explicit halves (back half kept,
 * front half removable) with hatched section caps; the chamber wall also has a stepped notch
 * whose floor shows the coolant channels and ribs in cross-section (a comb).
 */
import * as THREE from 'three';
import { contourSlice, radiusAt, wallNormal } from './contour';
import type { Design } from './design';
import { BACK, FRONT, FULL, circle, circleFrames, clippedTube, hexBolt, merge, revolve, ringOf, roundPoly, sweep, type Frame, type Loop, type V2 } from './geo';
import type { Kit, Tag } from './kit';
import type { EngineDetail } from './types';

const TAU = Math.PI * 2;

/** Point on the wall offset `off` along the outward wall normal from the gas-side contour at x. */
export function wallPt(d: Design, x: number, off: number): V2 {
  const r = radiusAt(d.contour, x);
  if (off === 0) return [r, d.y(x)];
  const [nx, nr] = wallNormal(d.contour, x);
  return [r + off * nr, d.y(x + off * nx)];
}

/** Largest turn of the wall between two samples (set per build from the detail level). */
let sampleTurn = (3 * Math.PI) / 180;

/**
 * Axial stations of the wall between x0 and x1: the dense design contour thinned so that the
 * wall turns at most `sampleTurn` between samples (a straight cylinder needs two, the throat
 * arcs and the bell get what their curvature needs; normals stay smooth across the joints).
 */
function xs(d: Design, x0: number, x1: number): number[] {
  const p = contourSlice(d.contour, x0, x1);
  if (p.length <= 2) return p.map((q) => q[0]);
  const dir = (a: [number, number], b: [number, number]) => Math.atan2(b[1] - a[1], b[0] - a[0]);
  const out = [p[0][0]];
  let last = 0;
  for (let i = 1; i < p.length - 1; i++) {
    const turn = Math.abs(dir(p[last], p[i + 1]) - dir(p[last], p[last + 1]));
    const far = p[i + 1][0] - p[last][0] > 0.35;
    // on the tube wall, a ring wherever the radius has grown by 6 %: its quads are trapezoids with
    // rectangular UVs, and each triangle's affine texture mapping kinks the brazed tubes at the
    // quad diagonal (V-shaped bands) unless the rings are close in radius
    const tubes = p[i][0] > d.xChamberEnd - 0.01 && p[i][0] < d.xRegenEnd + 0.01;
    const flare = tubes && Math.abs(Math.log(p[i + 1][1] / p[last][1])) > 0.06;
    if (turn > sampleTurn || far || flare) {
      out.push(p[i][0]);
      last = i;
    }
  }
  out.push(p[p.length - 1][0]);
  return out;
}

/** Closed wall profile between offsets dIn and dOut, from x0 (top) to x1 (bottom). */
export function wallLoop(d: Design, x0: number, x1: number, dIn: number, dOut: number): V2[] {
  const X = xs(d, x0, x1);
  const inner = X.map((x) => wallPt(d, x, dIn));
  const outer = X.map((x) => wallPt(d, x, dOut)).reverse();
  return [...inner, ...outer];
}

/** Solid of revolution: split into back/front halves with caps in hangar detail. */
export function lathe(k: Kit, loops: Loop[], t: Tag, segs: number, o: { centre?: THREE.Vector3; crease?: number; full?: boolean } = {}) {
  if (!k.section || o.full) {
    k.sweep(revolve(loops, FULL[0], FULL[1], segs, { centre: o.centre, crease: o.crease }), t);
    return;
  }
  k.sweep(revolve(loops, BACK[0], BACK[1], segs, { centre: o.centre, crease: o.crease, caps: true }), t);
  k.sweep(revolve(loops, FRONT[0], FRONT[1], segs, { centre: o.centre, crease: o.crease, caps: true }), { ...t, front: true });
}

/** Rewrite uv so v runs 0..1 from yTop to yBot and u is multiplied by uScale. */
function uvAlong(g: THREE.BufferGeometry | null, yTop: number, yBot: number, uScale = 1) {
  if (!g) return;
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, uv.getX(i) * uScale, (yTop - p.getY(i)) / (yTop - yBot));
  uv.needsUpdate = true;
}

/** Thin quad strip lying just in front of the section plane (for drawn section detail). */
function planeStrip(pts: V2[], width: number, zOff = 0.0006): THREE.BufferGeometry {
  // pts: centre line (x, y) in the plane; builds a ribbon of the given width facing +Z
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const tx = b[0] - a[0];
    const ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1;
    const nx = -ty / l;
    const ny = tx / l;
    pos.push(pts[i][0] + (nx * width) / 2, pts[i][1] + (ny * width) / 2, zOff, pts[i][0] - (nx * width) / 2, pts[i][1] - (ny * width) / 2, zOff);
    if (i > 0) {
      const q = (i - 1) * 2;
      idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  // make every triangle face +Z
  const P = g.attributes.position;
  const ix = g.index!;
  for (let t = 0; t < ix.count; t += 3) {
    const A = new THREE.Vector3().fromBufferAttribute(P, ix.getX(t));
    const B = new THREE.Vector3().fromBufferAttribute(P, ix.getX(t + 1));
    const C = new THREE.Vector3().fromBufferAttribute(P, ix.getX(t + 2));
    if (B.sub(A).cross(C.sub(A)).z < 0) {
      const tmp = ix.getX(t + 1);
      ix.setX(t + 1, ix.getX(t + 2));
      ix.setX(t + 2, tmp);
    }
  }
  const n = new Float32Array(P.count * 3);
  for (let i = 0; i < P.count; i++) n[i * 3 + 2] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  return g;
}

/** Mirror a plane-strip geometry to the -X side of the section. */
function mirrorX(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const m = g.clone();
  m.scale(-1, 1, 1);
  // restore winding after the mirror
  const ix = m.index!;
  for (let t = 0; t < ix.count; t += 3) {
    const tmp = ix.getX(t + 1);
    ix.setX(t + 1, ix.getX(t + 2));
    ix.setX(t + 2, tmp);
  }
  const n = m.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setX(i, -n.getX(i));
  return m;
}

// ───────────────────────────── injector and dome ─────────────────────────────

function domeAndInjector(k: Kit, d: Design, segs: number, detail: EngineDetail) {
  const a = d.domeR;
  const yb = d.domeBaseY;
  const b = d.domeH;
  const td = 0.012;
  const bossR = 0.07;
  const bossTop = -0.095;
  const inj: Tag = { part: 'injector', mat: 'stainless' };
  const ell = (r: number, sa: number, sb: number) => yb + sb * Math.sqrt(Math.max(0, 1 - (r / sa) ** 2));
  // dome shell with the gimbal boss and base flange
  const outer: V2[] = [];
  const n = detail === 'hangar' ? 16 : 8;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const ang = Math.asin(bossR / a) + (Math.PI / 2 - Math.asin(bossR / a)) * t;
    const r = a * Math.sin(ang);
    outer.push([r, Math.max(yb + 0.018, ell(r, a, b))]);
  }
  const inner: V2[] = [];
  for (let i = n; i >= 0; i--) {
    const ang = (Math.PI / 2) * (i / n);
    inner.push([(a - td) * Math.sin(ang), yb + (b - td) * Math.cos(ang)]);
  }
  const domeLoop: V2[] = [[0.0005, bossTop], [bossR, bossTop], ...outer, [a + 0.022, yb + 0.018], [a + 0.022, yb], [a - td, yb], ...inner.slice(1, inner.length - 1), [0.0005, yb + b - td]];
  // the LOX dome is full of liquid oxygen: cryogenic in the thermal lens
  const domeT: Tag = { ...inj, thermal: 0 };
  if (detail === 'cluster') {
    lathe(k, [{ pts: [[0.0005, bossTop], [bossR, bossTop], ...outer, [a + 0.012, yb], [0.0005, yb]] }], { part: 'injector', mat: 'jacket', thermal: 0 }, segs);
  } else if (detail === 'flight') lathe(k, [{ pts: domeLoop }], domeT, segs);
  else lathe(k, [{ pts: roundPoly(domeLoop, (i) => (i === 1 || (i >= outer.length + 2 && i <= outer.length + 4) ? 0.003 : 0), 2) }], domeT, segs);

  // injector body: top flange, fuel manifold bulge, bottom flange; internal fuel manifold cavity
  const yF = d.injY;
  const body: V2[] = [
    [0.0005, yb],
    [a + 0.022, yb],
    [a + 0.022, yb - 0.018],
    [a - 0.004, yb - 0.018],
    [a - 0.004, -0.281],
    [a + 0.014, -0.286],
    [a + 0.014, -0.33],
    [a - 0.004, -0.335],
    [a - 0.004, yF + 0.018],
    [a + 0.022, yF + 0.018],
    [a + 0.022, yF + 0.0012],
    [0.0005, yF + 0.0012],
  ];
  const bodyR = detail === 'hangar' ? roundPoly(body, (i) => (i === 0 || i === body.length - 1 ? 0 : i === 5 || i === 6 ? 0.01 : 0.0025), 2) : body;
  if (detail === 'cluster') {
    lathe(k, [{ pts: [[0.0005, yb], [a + 0.016, yb], [a + 0.016, yF], [0.0005, yF]] }], { part: 'injector', mat: 'jacket' }, segs);
    return;
  }
  const cavity: V2[] = roundPoly(
    [
      [d.rc + 0.012, -0.328],
      [a + 0.004, -0.328],
      [a + 0.004, -0.29],
      [d.rc + 0.012, -0.29],
    ],
    0.008,
    3,
  ).reverse();
  lathe(k, detail === 'hangar' ? [{ pts: bodyR }, { pts: cavity, hole: true }] : [{ pts: bodyR }], inj, segs);

  // bolts: dome to injector (on top of the flange) and injector to chamber (under the flange)
  if (detail === 'hangar') {
    const bolt = hexBolt(0.016, 0.014);
    const front = (p: THREE.Vector3) => p.z > 0;
    const back = (p: THREE.Vector3) => p.z <= 0;
    for (const [y, flip] of [
      [yb + 0.018, false],
      [yF, true],
    ] as [number, boolean][]) {
      const g = bolt.clone();
      if (flip) g.rotateX(Math.PI);
      k.add(ringOf(g, 36, a + 0.011, { y, filter: back, phase: TAU / 72 }), inj);
      k.add(ringOf(g, 36, a + 0.011, { y, filter: front, phase: TAU / 72 }), { ...inj, front: true });
      g.dispose();
    }
    // bolts through the dome/injector flange also show on the injector top flange underside
    const g2 = bolt.clone().rotateX(Math.PI);
    k.add(ringOf(g2, 36, a + 0.011, { y: yb - 0.018, filter: back, phase: TAU / 72 }), inj);
    k.add(ringOf(g2, 36, a + 0.011, { y: yb - 0.018, filter: front, phase: TAU / 72 }), { ...inj, front: true });
    g2.dispose();
    bolt.dispose();
  }

  // faceplate: polar-mapped orifice pattern (u = angle, v = r / rc)
  const face: Loop = { pts: [[0.0005, yF], [d.rc + 0.002, yF]], open: true };
  const addFace = (phi: [number, number], front: boolean) => {
    const r = revolve([face], phi[0], phi[1], segs);
    if (r.surf) {
      const uv = r.surf.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) / d.rc);
    }
    k.add(r.surf, { part: 'injector', mat: 'faceplate', front });
  };
  if (k.section) {
    addFace(BACK, false);
    addFace(FRONT, true);
  } else addFace(FULL, false);

  if (detail !== 'hangar') return;

  // baffles: a circumferential ring and six radial blades (combustion stability)
  const bh = 0.055;
  const rh = 0.45 * d.rc;
  const bt = 0.008;
  const baffle: Tag = { part: 'injector', mat: 'inconel' };
  const ring = roundPoly(
    [
      [rh - bt / 2, yF + 0.001],
      [rh + bt / 2, yF + 0.001],
      [rh + bt / 2, yF - bh],
      [rh - bt / 2, yF - bh],
    ],
    (i) => (i >= 2 ? 0.0035 : 0),
    3,
  );
  lathe(k, [{ pts: ring }], baffle, segs);
  for (let i = 0; i < 6; i++) {
    const phi = (i * TAU) / 6;
    // blade profile in (radial, y), extruded +-bt/2 tangentially
    const prof = roundPoly(
      [
        [rh, yF + 0.001],
        [d.rc - 0.003, yF + 0.001],
        [d.rc - 0.003, yF - bh * 0.92],
        [rh, yF - bh],
      ],
      (j) => (j >= 2 ? 0.0035 : 0),
      3,
    );
    const radial = new THREE.Vector3(Math.sin(phi), 0, Math.cos(phi));
    const tang = new THREE.Vector3(Math.cos(phi), 0, -Math.sin(phi));
    const frames: Frame[] = [-bt / 2, bt / 2].map((o) => ({ p: tang.clone().multiplyScalar(o), n: radial.clone(), b: new THREE.Vector3(0, 1, 0), u: 0 }));
    const res = sweep([{ pts: prof }], frames, { caps: true });
    const front = Math.cos(phi) > 0.01;
    k.add(res.surf, { ...baffle, front });
    k.add(res.caps, { ...baffle, front });
  }

  // drilled passages in section (LOX feeds from the dome, fuel ring grooves fed from the manifold)
  const soot: Tag = { part: 'injector', mat: 'soot' };
  const strips: THREE.BufferGeometry[] = [];
  let ringNo = 0;
  for (let r = 0.028; r < d.rc - 0.012; r += 0.0125, ringNo++) {
    if (ringNo % 2 === 0) strips.push(planeStrip([[r, yb - 0.001], [r, yF + 0.0015]], 0.0022));
    else {
      strips.push(planeStrip([[r, -0.321], [r, yF + 0.0015]], 0.002));
      const groove = circle(0.0032, 10).map(([u, v]) => [r + u, -0.321 + v] as V2);
      const gg = new THREE.ShapeGeometry(new THREE.Shape(groove.map(([u, v]) => new THREE.Vector2(u, v))));
      gg.translate(0, 0, 0.0006);
      strips.push(gg);
    }
  }
  strips.push(planeStrip([[d.rc + 0.014, -0.309], [d.rc - 0.02, -0.309]], 0.003));
  const one = merge(strips);
  k.detail_(one, soot);
  k.detail_(mirrorX(one), soot);
}

// ───────────────────────────── chamber ─────────────────────────────

function chamber(k: Kit, d: Design, segs: number, detail: EngineDetail) {
  const x0 = d.contour.xInj;
  const x1 = d.xChamberEnd;
  const tw = d.tw;
  const hc = d.hc;
  const tj = d.tj;
  const cu: Tag = { part: 'combustion-chamber', mat: 'copper' };
  const ni: Tag = { part: 'combustion-chamber', mat: 'jacket' };
  const jOut = tw + hc + tj;

  if (!k.section) {
    // exterior jacket, and the gas-side liner surface (seen looking up the nozzle)
    if (detail === 'cluster') {
      lathe(k, [{ pts: wallLoop(d, x0, x1, 0, jOut) }], ni, segs);
      return;
    }
    lathe(k, [{ pts: wallLoop(d, x0, x1, tw + hc, jOut) }], ni, segs);
    const X = xs(d, x0, x1);
    lathe(k, [{ pts: X.map((x) => wallPt(d, x, 0)), open: true, flip: true }], cu, segs);
  } else {
    const hot = (a: number, b: number) => wallLoop(d, a, b, 0, tw);
    const jac = (a: number, b: number) => wallLoop(d, a, b, tw + hc, jOut);
    const xa = d.x(d.notch.yTop);
    const xb = d.x(d.notch.yBot);
    const [n0, n1] = [d.notch.phi0, d.notch.phi1];
    for (const [loop, tag] of [
      [hot, cu],
      [jac, ni],
    ] as [(a: number, b: number) => V2[], Tag][]) {
      // front half
      k.sweep(revolve([{ pts: loop(x0, x1) }], FRONT[0], FRONT[1], segs, { caps: true }), { ...tag, front: true });
      // back half outside the notch sector, split along x so only the notch span gets a side cap
      for (const [a, b, capStart] of [
        [x0, xa, false],
        [xa, xb, true],
        [xb, x1, false],
      ] as [number, number, boolean][]) {
        const fr = revolveFramesRange(n1, BACK[1], segs);
        k.sweep(sweep([{ pts: loop(a, b) }], fr, { capStart, capEnd: true }), tag);
      }
      // notch sector: above and below the notch, capped on the section plane
      for (const [a, b] of [
        [x0, xa],
        [xb, x1],
      ] as [number, number][]) {
        const fr = revolveFramesRange(n0, n1, segs);
        k.sweep(sweep([{ pts: loop(a, b) }], fr, { capStart: true }), tag);
      }
      // the notch itself is filled while the engine is intact and leaves with the front half
      k.sweep(sweep([{ pts: loop(xa, xb) }], revolveFramesRange(n0, n1, segs), { capStart: true }), { ...tag, front: true });
    }
    // transverse section faces at the notch ceiling (x = xa) and floor (x = xb)
    for (const [x, up] of [
      [xa, false],
      [xb, true],
    ] as [number, boolean][]) {
      for (const [o0, o1, tag] of [
        [0, tw, cu],
        [tw + hc, jOut, ni],
      ] as [number, number, Tag][]) {
        const p0 = wallPt(d, x, o0);
        const p1 = wallPt(d, x, o1);
        const y = (p0[1] + p1[1]) / 2;
        const loop: Loop = { pts: up ? [[p0[0], y], [p1[0], y]] : [[p1[0], y], [p0[0], y]], open: true };
        const r = revolve([loop], n0, n1, segs);
        k.section_(r.surf, tag);
      }
    }
    // coolant channel ribs near the section planes (constant rib width, channels widen with r)
    const N = d.ribs;
    const wr = 0.0026;
    const ribAt = (phi: number, a: number, b: number, capA: boolean, capB: boolean) => {
      const X = xs(d, a, b);
      const t = new THREE.Vector3(Math.cos(phi), 0, -Math.sin(phi));
      const frames: Frame[] = X.map((x) => {
        const [r, y] = wallPt(d, x, 0);
        const [nx, nr] = wallNormal(d.contour, x);
        const n = new THREE.Vector3(nr * Math.sin(phi), -nx, nr * Math.cos(phi));
        return { p: new THREE.Vector3(r * Math.sin(phi), y, r * Math.cos(phi)), n, b: t, u: x };
      });
      const prof: V2[] = [
        [tw - 0.0003, -wr / 2],
        [tw + hc + 0.0003, -wr / 2],
        [tw + hc + 0.0003, wr / 2],
        [tw - 0.0003, wr / 2],
      ];
      const res = sweep([{ pts: prof }], frames, { capStart: capA, capEnd: capB });
      k.add(res.surf, cu);
      k.section_(res.caps, cu);
    };
    for (let i = 0; i < N; i++) {
      const phi = Math.PI / 2 + ((i + 0.5) * TAU) / N;
      const deg = (phi * 180) / Math.PI;
      const nearPlus = deg <= 90 + 48;
      const nearMinus = deg >= 270 - 22 && deg <= 270;
      if (!nearPlus && !nearMinus) continue;
      if (phi > n0 && phi < n1) {
        ribAt(phi, x0, xa, false, true);
        ribAt(phi, xb, x1, true, false);
      } else ribAt(phi, x0, x1, false, false);
    }
  }

  // jacket flanges: top (to the injector) and bottom (to the tube-wall nozzle)
  const a = d.domeR;
  const yTop = d.injY;
  const topFl: V2[] = roundPoly(
    [
      [wallPt(d, x0, jOut)[0] - 0.002, yTop],
      [a + 0.022, yTop],
      [a + 0.022, yTop - 0.018],
      [wallPt(d, x0, jOut)[0] - 0.002, yTop - 0.03],
    ],
    (i) => (i === 1 || i === 2 ? 0.0025 : 0),
    2,
  );
  lathe(k, [{ pts: topFl }], ni, segs);
  const [rj, yj] = wallPt(d, x1, jOut);
  const botFl: V2[] = roundPoly(
    [
      [rj - 0.004, yj + 0.03],
      [rj + 0.026, yj + 0.012],
      [rj + 0.026, yj - 0.004],
      [rj - 0.004, yj - 0.004],
    ],
    (i) => (i === 1 || i === 2 ? 0.0025 : 0),
    2,
  );
  lathe(k, [{ pts: botFl }], { part: 'combustion-chamber', mat: 'inconel' }, segs);
  if (detail === 'cluster') return;
  // reinforcing bands on the cylinder and the actuator attach band with clevis lugs
  const cylTopY = d.injY - 0.05;
  const rJ = d.rc + jOut;
  for (const yy of [cylTopY - 0.02, d.tvc.yB]) {
    const hgt = yy === d.tvc.yB ? 0.05 : 0.022;
    const band: V2[] = roundPoly(
      [
        [rJ - 0.001, yy + hgt / 2],
        [rJ + 0.008, yy + hgt / 2],
        [rJ + 0.008, yy - hgt / 2],
        [rJ - 0.001, yy - hgt / 2],
      ],
      (i) => (i === 1 || i === 2 ? 0.002 : 0),
      2,
    );
    lathe(k, [{ pts: band }], ni, segs);
  }
  if (detail === 'hangar') {
    // bolt ring on the nozzle joint flange
    const bolt = hexBolt(0.014, 0.012).rotateX(Math.PI);
    const back = (p: THREE.Vector3) => p.z <= 0;
    const front = (p: THREE.Vector3) => p.z > 0;
    const tag: Tag = { part: 'combustion-chamber', mat: 'inconel' };
    k.add(ringOf(bolt, 40, rj + 0.014, { y: yj - 0.004, filter: back }), tag);
    k.add(ringOf(bolt, 40, rj + 0.014, { y: yj - 0.004, filter: front }), { ...tag, front: true });
    bolt.dispose();
    // chamber pressure transducer boss (back) with a small sensor body
    const phi = (200 * Math.PI) / 180;
    const dir = new THREE.Vector3(Math.sin(phi), 0, Math.cos(phi));
    const at = dir.clone().multiplyScalar(rJ + 0.006).setY(-0.47);
    const boss = new THREE.CylinderGeometry(0.014, 0.016, 0.02, 20);
    boss.translate(0, 0.01, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    boss.applyQuaternion(q).translate(at.x, at.y, at.z);
    k.add(boss, { part: 'combustion-chamber', mat: 'steel' });
    const sensor = new THREE.CylinderGeometry(0.011, 0.011, 0.05, 20);
    sensor.translate(0, 0.045, 0);
    sensor.applyQuaternion(q).translate(at.x, at.y, at.z);
    k.add(sensor, { part: 'engine', mat: 'anodized' });
  }
}

// ───────────────────────────── nozzle ─────────────────────────────

function nozzle(k: Kit, d: Design, segs: number, detail: EngineDetail) {
  const x0 = d.xChamberEnd;
  const x1 = d.xRegenEnd;
  const tube = d.tube;
  const yTop = d.y(x0);
  const yBot = d.y(x1);
  const t: Tag = { part: 'nozzle', mat: 'tubes' };
  const uScale = d.tubes / 8;
  const add = (phi: [number, number], front: boolean) => {
    // starts exactly where the copper liner ends: an overlap would put two gas-side surfaces on
    // the same contour (z-fighting, a saw-tooth seam seen looking up the nozzle)
    const res = revolve([{ pts: wallLoop(d, x0, x1, 0, tube) }], phi[0], phi[1], segs, { caps: k.section && phi !== FULL });
    uvAlong(res.surf, yTop, yBot, uScale);
    k.add(res.surf, { ...t, front });
    k.section_(res.caps, { ...t, front });
  };
  if (k.section) {
    add(BACK, false);
    add(FRONT, true);
    // tube bores in section: dark band between the thin inner and outer tube walls
    const X = xs(d, x0, x1);
    const band = planeStrip(
      X.map((x) => wallPt(d, x, tube / 2)),
      tube - 0.003,
    );
    k.detail_(band, { part: 'nozzle', mat: 'soot' });
    k.detail_(mirrorX(band), { part: 'nozzle', mat: 'soot' });
  } else add(FULL, false);

  const hb: Tag = { part: 'nozzle', mat: 'inconel' };
  const hatband = (x: number, h: number, th: number) => {
    const [r, y] = wallPt(d, x, tube);
    const [rA, yA] = wallPt(d, x - 0.01, tube);
    const [rB, yB] = wallPt(d, x + 0.01, tube);
    const L = Math.hypot(rB - rA, yB - yA);
    const s0: V2 = [(rB - rA) / L, (yB - yA) / L]; // along the wall, downstream
    let out: V2 = [-s0[1], s0[0]];
    if (out[0] < 0) out = [-out[0], -out[1]];
    const pts = (
      [
        [-h / 2, -0.001],
        [h / 2, -0.001],
        [h / 2, th],
        [-h / 2, th],
      ] as V2[]
    ).map(([sv, o]) => [r + s0[0] * sv + out[0] * o, y + s0[1] * sv + out[1] * o] as V2);
    lathe(k, [{ pts: detail === 'hangar' ? roundPoly(pts, (i) => (i >= 2 ? 0.002 : 0), 2) : pts }], hb, segs);
  };
  const L = x1 - x0;
  const bands = d.vac ? [0.35, 0.75] : [0.22, 0.47, 0.72];
  for (const f of bands) hatband(x0 + L * f, 0.03, 0.007);

  // coolant inlet manifold (torus) low on the nozzle, fed from the main fuel valve line
  const xm = d.manifoldX;
  const [rm0, ym] = wallPt(d, xm, tube);
  const mr = 0.03;
  const centre = new THREE.Vector3(0, ym, 0);
  const R = d.manifoldR;
  // full of RP-1 entering the cooling tubes: ambient in the thermal lens (the tubes are hot)
  const man: Tag = { part: 'nozzle', mat: 'inconelHot', thermal: 1 };
  const frames = circleFrames(centre, R, 0, TAU, detail === 'hangar' ? 96 : segs);
  if (detail === 'cluster') {
    k.add(clippedTube(frames, { ro: mr, segs: 8 }).back.surf, man);
  } else {
    const tt = clippedTube(frames, { ro: mr, ri: detail === 'hangar' ? mr - 0.004 : undefined, segs: detail === 'hangar' ? 20 : 10, clipZ: k.section ? 0 : undefined });
    k.tube(tt, man);
    // saddle between manifold and tube wall
    const saddle: V2[] = [
      [rm0 - 0.002, ym + 0.022],
      [R - 0.01, ym + 0.02],
      [R - 0.01, ym - 0.02],
      [rm0 - 0.002, ym - 0.022],
    ];
    lathe(k, [{ pts: saddle }], man, segs);
  }
  if (!d.vac) {
    // exit stiffening ring at the lip
    const [re, ye] = wallPt(d, x1, 0);
    const lip: V2[] = roundPoly(
      [
        [re - 0.002, ye + 0.03],
        [re + tube + 0.012, ye + 0.03],
        [re + tube + 0.012, ye],
        [re - 0.002, ye],
      ],
      (i) => (i === 1 || i === 2 ? 0.003 : 0),
      2,
    );
    lathe(k, [{ pts: lip }], hb, segs);
  } else {
    // bolted joint to the nozzle extension: regen-side flange (nickel alloy) and extension flange (niobium)
    const [re, ye] = wallPt(d, x1, 0);
    const fl: V2[] = roundPoly(
      [
        [re - 0.002, ye + 0.028],
        [re + tube + 0.03, ye + 0.012],
        [re + tube + 0.03, ye],
        [re - 0.002, ye],
      ],
      (i) => (i === 1 || i === 2 ? 0.003 : 0),
      2,
    );
    lathe(k, [{ pts: fl }], hb, segs);
    if (detail !== 'cluster') {
      const bolt = hexBolt(0.014, 0.012, detail !== 'hangar');
      const tag: Tag = { part: 'nozzle-extension', mat: 'inconel' };
      if (k.section) {
        k.add(ringOf(bolt, 48, re + tube + 0.018, { y: ye + 0.012, filter: (p) => p.z <= 0 }), tag);
        k.add(ringOf(bolt, 48, re + tube + 0.018, { y: ye + 0.012, filter: (p) => p.z > 0 }), { ...tag, front: true });
      } else k.add(ringOf(bolt, 48, re + tube + 0.018, { y: ye + 0.012 }), tag);
      bolt.dispose();
    }
  }
}

function extension(k: Kit, d: Design, segs: number, detail: EngineDetail) {
  if (!d.vac) return;
  const x0 = d.xRegenEnd;
  const x1 = d.contour.xExit;
  const th = detail === 'cluster' ? 0.004 : 0.0035;
  const yTop = d.y(x0);
  const yBot = d.y(x1);
  const t: Tag = { part: 'nozzle-extension', mat: 'niobium' };
  // extension flange (thick ring) chamfered into the thin wall: one simple (non-self-intersecting)
  // profile, down the outside and back up the gas side, whose top inner ring meets the regen
  // tube wall's last ring exactly (a pinched figure-eight profile turns the flange inside out)
  const [r0, y0] = wallPt(d, x0, 0);
  const outer = xs(d, x0 + 0.03, x1).map((x) => wallPt(d, x, th));
  const inner = xs(d, x0, x1)
    .map((x) => wallPt(d, x, 0))
    .reverse();
  const loop: V2[] = [[r0, y0], [r0 + d.tube + 0.03, y0], [r0 + d.tube + 0.03, y0 - 0.012], ...outer, ...inner.slice(0, -1)];
  // lip at the exit (rolled edge)
  const segsExt = Math.max(segs, detail === 'hangar' ? 144 : segs);
  const add = (phi: [number, number], front: boolean) => {
    const res = revolve([{ pts: loop }], phi[0], phi[1], segsExt, { caps: k.section && phi !== FULL, crease: 40 });
    uvAlong(res.surf, yTop, yBot);
    k.add(res.surf, { ...t, front });
    k.section_(res.caps, { ...t, front });
  };
  if (k.section) {
    add(BACK, false);
    add(FRONT, true);
  } else add(FULL, false);
  if (detail === 'cluster') return;
  // stiffener rings (hat sections) and the exit lip
  const ring = (x: number, h: number, dep: number) => {
    const [r, y] = wallPt(d, x, th);
    const hat: V2[] = [
      [r - 0.001, y + h / 2],
      [r + dep, y + h / 2 - 0.004],
      [r + dep, y - h / 2 + 0.004],
      [r - 0.001, y - h / 2],
    ];
    const p: V2[] = detail === 'hangar' ? roundPoly(hat, (i) => (i === 1 || i === 2 ? 0.003 : 0), 2) : hat;
    const res = (phi: [number, number], front: boolean) => {
      const rr = revolve([{ pts: p }], phi[0], phi[1], segsExt, { caps: k.section && phi !== FULL });
      uvAlong(rr.surf, yTop, yBot);
      k.add(rr.surf, { ...t, front });
      k.section_(rr.caps, { ...t, front });
    };
    if (k.section) {
      res(BACK, false);
      res(FRONT, true);
    } else res(FULL, false);
  };
  const L = x1 - x0;
  for (const f of [0.22, 0.45, 0.68, 0.88]) ring(x0 + L * f, 0.045, 0.014);
  ring(x1 - 0.012, 0.024, 0.01);
}

/** Frames of a revolve between two angles (not normalised to the full-circle segment count). */
function revolveFramesRange(phi0: number, phi1: number, segsFull: number): Frame[] {
  const n = Math.max(2, Math.ceil((segsFull * Math.abs(phi1 - phi0)) / TAU));
  const out: Frame[] = [];
  const c = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    const phi = phi0 + ((phi1 - phi0) * i) / n;
    out.push({ p: c, n: new THREE.Vector3(Math.sin(phi), 0, Math.cos(phi)), b: new THREE.Vector3(0, 1, 0), u: phi / TAU });
  }
  return out;
}

export function buildTCA(k: Kit, d: Design, detail: EngineDetail, segs: number) {
  sampleTurn = k.contourTurn;
  // the dome and injector (0.37 m radius) are smooth at 96 segments; the bell gets the full count
  domeAndInjector(k, d, Math.min(segs, 96), detail);
  chamber(k, d, segs, detail);
  nozzle(k, d, segs, detail);
  extension(k, d, segs, detail);
}
