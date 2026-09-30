/**
 * Crew capsule and the uncrewed research capsule (body 'capsule').
 *
 * Authored about the heat-shield nadir (local y = 0) and placed so the heat-shield rim rests on
 * the ring below it (service-module top, or the booster's capsule adapter). Outer mould line:
 * a 4.6 m spherical-section heat shield, a 0.12 m toroidal shoulder at the 3.9 m base diameter,
 * a 25 deg backshell cone of reusable tiles, a forward-bay cover and nose cone; 3.3 m overall.
 *
 * Section (setCut): the +Z/+X quadrant slides away. Heat-shield stack, outside in: ablator
 * cast in a phenolic honeycomb (60 mm), composite carrier structure (35 mm), fibrous insulation
 * (40 mm), a 100 mm gap, the aluminium-lithium pressure vessel (20 mm skin with integral ribs).
 */
import * as THREE from 'three';
import { CAPSULE } from '../../vehicle/spec';
import { buildChutes } from './chutes';
import { box, cyl, DEG, extrude, rbox, strut, sweep, WEDGE, type Kit, type V2 } from './kit';
import { ablator, decal, hatch, P, streaks, textile, tiles } from './mats';
import { DECAL_UNITS, type ConeSpec } from './textures';

const HA = CAPSULE.sidewallDeg * DEG;
const SIN = Math.sin(HA);
const COS = Math.cos(HA);
const TAN = Math.tan(HA);

/** Outer mould line (metres, relative to the heat-shield nadir). */
export const OML = (() => {
  const R0 = CAPSULE.baseDiameter / 2;
  const RHS = CAPSULE.heatShieldRadius;
  const RS = 0.12;
  const tcR = R0 - RS;
  const a1 = Math.asin(tcR / (RHS - RS));
  const tcY = RHS - (RHS - RS) * Math.cos(a1);
  const p2r = tcR + RS * COS;
  const p2y = tcY + RS * SIN;
  const topY = 2.98;
  const L = (topY - p2y) / COS;
  return {
    R0,
    RHS,
    RS,
    tcR,
    tcY,
    a1,
    /** Shoulder/cone tangent point. */
    p2r,
    p2y,
    /** Top edge of the tiled cone and its slant length from the shoulder. */
    topY,
    L,
    deckY: 3.03,
    noseR: 0.66,
    H: CAPSULE.height,
    /** Height of the heat-shield outer surface at radius r (spherical part). */
    hsY: (r: number) => RHS - Math.sqrt(RHS * RHS - r * r),
    coneR: (y: number) => p2r - (y - p2y) * TAN,
    at: (s: number): V2 => [p2r - s * SIN, p2y + s * COS],
  };
})();

/** Height of the nadir below the ring the capsule rests on (heat shield meets r = 1.85 m, 5 mm clear). */
export const SEAT_DROP = OML.hsY(1.85) - 0.005;

const conePoint = (phi: number, s: number, z: number, out: THREE.Vector3) => {
  const r = OML.p2r - s * SIN + z * COS;
  const y = OML.p2y + s * COS + z * SIN;
  return out.set(r * Math.sin(phi), y, r * Math.cos(phi));
};

/** Bend a flat detail (x along the parallel, y up the slant, z along the normal) onto the cone. */
function onCone(g: THREE.BufferGeometry, phiC: number, sC: number): THREE.BufferGeometry {
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const s = sC + y;
    const r = OML.p2r - s * SIN;
    conePoint(phiC + x / r, s, z, v);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

/** A grid patch of the cone (phi, s ranges) at normal offset z, with custom UVs. */
function conePatch(phiA: number, phiB: number, sA: number, sB: number, z: number, nu: number, nv: number, uvf: (phi: number, s: number) => [number, number]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const v = new THREE.Vector3();
  for (let j = 0; j <= nv; j++)
    for (let i = 0; i <= nu; i++) {
      const phi = phiA + ((phiB - phiA) * i) / nu;
      const s = sA + ((sB - sA) * j) / nv;
      conePoint(phi, s, z, v);
      pos.push(v.x, v.y, v.z);
      nor.push(Math.sin(phi) * COS, SIN, Math.cos(phi) * COS);
      uv.push(...uvf(phi, s));
      if (i < nu && j < nv) {
        const a = j * (nu + 1) + i;
        idx.push(a, a + 1, a + nu + 1, a + 1, a + nu + 2, a + nu + 1);
      }
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Split a phi range at the wedge boundaries so each piece lies wholly in or out of the wedge. */
function splitPhi(a: number, b: number): [number, number][] {
  const cuts = [WEDGE.phi0, WEDGE.phi1, WEDGE.phi0 - Math.PI * 2, WEDGE.phi1 - Math.PI * 2, WEDGE.phi0 + Math.PI * 2].filter((c) => c > a + 1e-6 && c < b - 1e-6).sort((x, y) => x - y);
  const out: [number, number][] = [];
  let s = a;
  for (const c of cuts) {
    out.push([s, c]);
    s = c;
  }
  out.push([s, b]);
  return out;
}

/** Closed band around a rounded rectangle (window and hatch frames), finely sampled for bending. */
function frameBand(w: number, h: number, r: number, band: number, depth: number, step = 0.02): THREE.BufferGeometry {
  const loop = (ww: number, hh: number, rr: number): THREE.Vector2[] => {
    const pts: THREE.Vector2[] = [];
    const cs = [
      [ww / 2 - rr, hh / 2 - rr, 0],
      [-ww / 2 + rr, hh / 2 - rr, Math.PI / 2],
      [-ww / 2 + rr, -hh / 2 + rr, Math.PI],
      [ww / 2 - rr, -hh / 2 + rr, (3 * Math.PI) / 2],
    ];
    for (let c = 0; c < 4; c++) {
      const [cx, cy, a0] = cs[c];
      const n = Math.max(3, Math.ceil((rr * Math.PI) / 2 / step));
      for (let i = 0; i <= n; i++) {
        const a = a0 + (i / n) * (Math.PI / 2);
        pts.push(new THREE.Vector2(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr));
      }
      const [nx, ny] = cs[(c + 1) % 4];
      const a1 = a0 + Math.PI / 2;
      const ex = cx + Math.cos(a1) * rr;
      const ey = cy + Math.sin(a1) * rr;
      const sx = nx + Math.cos(a1) * rr;
      const sy = ny + Math.sin(a1) * rr;
      const len = Math.hypot(sx - ex, sy - ey);
      const m = Math.max(1, Math.ceil(len / step));
      for (let i = 1; i < m; i++) pts.push(new THREE.Vector2(ex + ((sx - ex) * i) / m, ey + ((sy - ey) * i) / m));
    }
    return pts;
  };
  const outer = loop(w, h, r);
  const inner = loop(w - 2 * band, h - 2 * band, Math.max(0.005, r - band));
  // resample inner to the same count by nearest parameter
  const n = outer.length;
  const innerR: THREE.Vector2[] = [];
  for (let i = 0; i < n; i++) innerR.push(inner[Math.floor((i / n) * inner.length)]);
  const pos: number[] = [];
  const idx: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[]) => {
    const base = pos.length / 3;
    pos.push(...a, ...b, ...c, ...d);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const o0 = outer[i];
    const o1 = outer[j];
    const i0 = innerR[i];
    const i1 = innerR[j];
    quad([o0.x, o0.y, depth], [o1.x, o1.y, depth], [i1.x, i1.y, depth], [i0.x, i0.y, depth]);
    quad([o0.x, o0.y, 0], [o1.x, o1.y, 0], [o1.x, o1.y, depth], [o0.x, o0.y, depth]);
    quad([i1.x, i1.y, 0], [i0.x, i0.y, 0], [i0.x, i0.y, depth], [i1.x, i1.y, depth]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const ng = g.toNonIndexed();
  g.dispose();
  ng.computeVertexNormals();
  return ng;
}

export interface CapsuleBuilt {
  group: THREE.Group;
  /** Nadir height in the model frame. */
  nadir: number;
  rcs: THREE.Vector3[];
  dock: { pos: THREE.Vector3; axis: THREE.Vector3 } | null;
  chuteAttach: THREE.Vector3;
  topY: number;
  pose(s: { capDrogue: number; capMain: number; capNoseCone: number; capChar: number; layerSep: number }): void;
  dispose(): void;
}

/**
 * The capsule at nadir height `nadir` (model frame). crewed: docking system under a hinged nose
 * cone, crew seats and displays; uncrewed: fixed forward cover, experiment racks.
 */
export function buildCapsule(kit: Kit, nadir: number, crewed: boolean): CapsuleBuilt {
  const group = new THREE.Group();
  group.name = 'capsule';
  const cap = new THREE.Group();
  cap.position.y = nadir;
  group.add(cap);
  const hangar = kit.hangar;
  const segs = kit.seg(160, 48);
  const { RHS, RS, tcR, tcY, a1 } = OML;

  // ── heat-shield stack (each layer its own group so the close-up can separate them)
  const abl = ablator();
  kit.own(abl.mat);
  const layerGroups: THREE.Group[] = [];
  const layer = () => {
    const g = new THREE.Group();
    cap.add(g);
    layerGroups.push(g);
    return g;
  };
  const sphere = (R: number, aTo: number, n: number): V2[] => {
    const pts: V2[] = [];
    for (let i = 0; i <= n; i++) {
      const a = (aTo * i) / n;
      pts.push([R * Math.sin(a), RHS - R * Math.cos(a)]);
    }
    return pts;
  };
  const torus = (rr: number, b0: number, b1: number, n: number): V2[] => {
    const pts: V2[] = [];
    for (let i = 1; i <= n; i++) {
      const b = b0 + ((b1 - b0) * i) / n;
      pts.push([tcR + rr * Math.cos(b), tcY + rr * Math.sin(b)]);
    }
    return pts;
  };
  const b1 = -(Math.PI / 2 - a1);
  const nS = hangar ? 26 : 12;
  const nT = hangar ? 10 : 5;
  const tA = CAPSULE.heatShieldThickness;
  // ablator: sphere + shoulder, 60 mm
  const ablOuter = [...sphere(RHS, a1, nS), ...torus(RS, b1, HA, nT)];
  const ablInner = [...sphere(RHS - tA, a1, nS), ...torus(RS - tA, b1, HA, nT)];
  const gAbl = layer();
  const ablMeshes = kit.solid(gAbl, [...ablOuter, ...[...ablInner].reverse()], segs, abl.mat, hatch('ablatorCells'), 'heat-shield', 'ablator', { crease: 0.9 });
  // disc mapping for the ablator texture (x, z over the base diameter)
  for (const m of ablMeshes) {
    const p = m.geometry.attributes.position;
    const uv = m.geometry.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + p.getX(i) / (2 * OML.R0 * 1.02), 0.5 - p.getZ(i) / (2 * OML.R0 * 1.02));
    uv.needsUpdate = true;
  }
  // carrier structure, 35 mm composite sandwich, wrapping the shoulder to horizontal
  const tC = 0.035;
  const carOuter = [...sphere(RHS - tA, a1, nS), ...torus(RS - tA, b1, 0.15, 4)];
  const carInner = [...sphere(RHS - tA - tC, a1, nS), ...torus(Math.max(0.012, RS - tA - tC), b1, 0.15, 4)];
  const gCar = layer();
  kit.solid(gCar, [...carOuter, ...[...carInner].reverse()], segs, P.cfrpPanel(), hatch('composite'), 'heat-shield', 'cfrp-sandwich', { crease: 0.9 });
  // insulation, 40 mm
  const tI = 0.04;
  const aIns = Math.asin(1.74 / (RHS - tA - tC));
  const gIns = layer();
  kit.solid(gIns, [...sphere(RHS - tA - tC, aIns, nS), ...[...sphere(RHS - tA - tC - tI, aIns, nS)].reverse()], segs, variantInsulation(), hatch('insulation'), 'heat-shield', 'ceramic-tiles', { crease: 0.9 });

  // ── pressure vessel (aluminium-lithium): aft bulkhead, conical sidewall, forward bulkhead, tunnel
  const pvIn = 0.125 / COS; // horizontal inset of the vessel's outer surface from the OML cone
  const tPV = 0.02;
  const Rpv = RHS - tA - tC - tI - 0.1;
  let jy = 0.6;
  let jr = 0;
  for (let k = 0; k < 20; k++) {
    jr = OML.coneR(jy) - pvIn;
    jy = RHS - Math.sqrt(Rpv * Rpv - jr * jr);
  }
  const aJ = Math.asin(jr / Rpv);
  const pv = new THREE.Group();
  cap.add(pv);
  const pvMat = P.aluMilled();
  kit.solid(pv, [...sphere(Rpv, aJ, nS), ...[...sphere(Rpv - tPV, aJ * 0.995, nS)].reverse()], segs, pvMat, hatch('metal'), 'capsule', 'al-li', { crease: 0.9 });
  const yFwd = 2.3;
  const side: V2[] = [
    [jr, jy],
    [OML.coneR(yFwd) - pvIn, yFwd],
    [OML.coneR(yFwd) - pvIn - tPV / COS, yFwd],
    [jr - tPV / COS, jy + 0.01],
  ];
  kit.solid(pv, side, segs, pvMat, hatch('metal'), 'capsule', 'al-li', { crease: 0.3 });
  const rT = crewed ? 0.42 : 0.36;
  const rFwd = OML.coneR(yFwd) - pvIn;
  kit.solid(
    pv,
    [
      [rT, yFwd - 0.02],
      [rFwd, yFwd - 0.02],
      [rFwd, yFwd],
      [rT, yFwd],
    ],
    segs,
    pvMat,
    hatch('metal'),
    'capsule',
    'al-li',
    { crease: 0.3 },
  );
  const tunnelTop = crewed ? 3.02 : 2.95;
  kit.solid(
    pv,
    [
      [rT, yFwd - 0.02],
      [rT, tunnelTop],
      [rT - tPV, tunnelTop],
      [rT - tPV, yFwd - 0.02],
    ],
    segs,
    pvMat,
    hatch('metal'),
    'capsule',
    'al-li',
    { crease: 0.3 },
  );

  // ── backshell: reusable tiles (50 mm) on an aluminium-lithium substructure (15 mm), ring frames to the vessel
  const coneSpec: ConeSpec = {
    L: OML.L,
    r: (s: number) => OML.p2r - s * SIN,
    wakes: [
      { phi: -Math.PI / 2, s: 0.8, w: 0.9 },
      { phi: (236 * Math.PI) / 180, s: 1.45, w: 0.3 },
      { phi: (304 * Math.PI) / 180, s: 1.45, w: 0.3 },
      ...[45, 135, 225, 315].map((d) => ({ phi: (d * Math.PI) / 180, s: 1.95, w: 0.16 })),
    ],
    blackTo: 0.95,
  };
  const tileMat = tiles(coneSpec, !hangar);
  const tT = 0.05;
  const nC = hangar ? 12 : 2;
  const coneOuter: V2[] = [];
  const coneInner: V2[] = [];
  for (let i = 0; i <= nC; i++) {
    const s = (OML.L * i) / nC;
    const [r, y] = OML.at(s);
    coneOuter.push([r, y]);
    coneInner.push([r - tT * COS, y - tT * SIN]);
  }
  const vCone = (p: V2) => Math.max(0, Math.min(1, (p[1] - OML.p2y) / COS / OML.L));
  kit.solid(cap, [...coneOuter, ...[...coneInner].reverse()], segs, tileMat, hatch('ceramic'), 'backshell-tps', 'ceramic-tiles', { crease: 0.5, v: vCone });
  const subOuter = coneInner.map(([r, y]) => [r, y] as V2);
  const subInner = coneInner.map(([r, y]) => [r - 0.015 * COS, y - 0.015 * SIN] as V2);
  kit.solid(cap, [...subOuter, ...[...subInner].reverse()], segs, P.aluMilled(), hatch('metal'), 'capsule', 'al-li', { crease: 0.5 });
  if (hangar) {
    for (const s of [0.35, 0.95, 1.55]) {
      const [r, y] = OML.at(s);
      const ro = r - 0.065 * COS;
      const yo = y - 0.065 * SIN;
      const ri = r - pvIn - 0.005;
      kit.solid(
        cap,
        [
          [ri, yo - 0.02],
          [ro, yo - 0.02],
          [ro, yo + 0.02],
          [ri, yo + 0.02],
        ],
        kit.seg(120, 40),
        P.aluMilled(),
        hatch('metal'),
        'capsule',
        'al-li',
        { crease: 0.3 },
      );
    }
  }
  // entry streak overlay (opacity follows capChar)
  const strk = streaks(coneSpec);
  kit.own(strk);
  const streakProf: V2[] = [];
  for (let i = 0; i <= nC; i++) {
    const [r, y] = OML.at((OML.L * i) / nC);
    streakProf.push([r + 0.004 * COS, y + 0.004 * SIN]);
  }
  const streakMeshes = kit.surface(cap, streakProf, segs, strk, 'backshell-tps', 'ceramic-tiles', { v: vCone });
  for (const m of streakMeshes) {
    m.castShadow = false;
    m.renderOrder = 2;
  }

  // ── forward-bay cover (lip + deck ring) and the nose cone: jettisoned before the parachutes
  const cover = new THREE.Group();
  cap.add(cover);
  const lip: V2[] = [
    [OML.coneR(OML.topY), OML.topY],
    [0.8, 3.0],
    [0.785, 3.018],
    [0.76, OML.deckY],
    [OML.noseR, OML.deckY],
    [OML.noseR, OML.deckY - 0.03],
    [0.76, OML.deckY - 0.03],
    [OML.coneR(OML.topY) - tT * COS, OML.topY - tT * SIN],
  ];
  kit.solid(cover, lip, segs, P.tileWhite(), hatch('ceramic'), 'backshell-tps', 'ceramic-tiles', { crease: 0.7 });
  const nose = new THREE.Group();
  nose.position.set(-OML.noseR, OML.deckY, 0);
  cover.add(nose);
  const noseProf: V2[] = [];
  const nN = hangar ? 14 : 6;
  const hN = OML.H - OML.deckY;
  for (let i = 0; i <= nN; i++) {
    const a = (i / nN) * (Math.PI / 2);
    noseProf.push([OML.noseR * Math.cos(a), hN * Math.sin(a)]);
  }
  const noseIn = noseProf.map(([r, y]) => [Math.max(0, r - 0.02), Math.max(0, y - 0.02)] as V2);
  const noseShell = new THREE.Group();
  noseShell.position.set(OML.noseR, 0, 0);
  nose.add(noseShell);
  // nose cone is not cut (it moves); build full sweep
  const { skin: noseSkin } = sweep([...noseProf, ...[...noseIn].reverse()], true, { segs: kit.seg(96, 32), crease: 0.9 });
  kit.mesh(noseSkin, P.tileWhite(), 'backshell-tps', 'ceramic-tiles', noseShell);
  kit.mesh(new THREE.TorusGeometry(OML.noseR - 0.005, 0.012, 8, kit.seg(96, 32)), P.graphite(), 'backshell-tps', 'ceramic-tiles', noseShell, 0, 0.004, 0).rotation.x = Math.PI / 2;
  if (hangar && crewed) {
    // hinge and latch of the opening nose cone
    kit.mesh(rbox(0.1, 0.05, 0.22, 0.01), P.steel(), 'docking-system', 'stainless', nose, 0.02, 0.02, 0);
    kit.mesh(rbox(0.08, 0.04, 0.1, 0.01), P.steel(), 'docking-system', 'stainless', noseShell, OML.noseR - 0.03, 0.02, 0);
  }

  // ── docking system (crewed): androgynous ring with guide petals, soft- and hard-capture
  let dock: CapsuleBuilt['dock'] = null;
  if (crewed) {
    const d = new THREE.Group();
    d.position.y = tunnelTop;
    cap.add(d);
    const ds = kit.seg(96, 32);
    const ring = (r0: number, r1: number, y0: number, y1: number, m: THREE.Material, mat: 'al-2219' | 'stainless') =>
      kit.mesh(
        sweep(
          [
            [r0, y0],
            [r1, y0],
            [r1, y1],
            [r0, y1],
          ],
          true,
          { segs: ds, crease: 0.3 },
        ).skin,
        m,
        'docking-system',
        mat,
        d,
      );
    ring(0.38, 0.52, 0, 0.045, P.aluMilled(), 'al-2219');
    ring(0.42, 0.5, 0.1, 0.13, P.alu(), 'al-2219');
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const b = a + (k % 2 ? 0.25 : -0.25);
      kit.mesh(strut(new THREE.Vector3(Math.sin(a) * 0.47, 0.045, Math.cos(a) * 0.47), new THREE.Vector3(Math.sin(b) * 0.46, 0.1, Math.cos(b) * 0.46), 0.012, 8), P.steel(), 'docking-system', 'stainless', d);
    }
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + Math.PI / 6;
      const petal = new THREE.Shape();
      petal.moveTo(-0.16, 0);
      petal.lineTo(0.16, 0);
      petal.lineTo(0.06, 0.15);
      petal.lineTo(-0.06, 0.15);
      petal.closePath();
      const pg = extrude(petal, 0.012, 0.003, 2);
      const pm = kit.mesh(pg, P.aluMilled(), 'docking-system', 'al-2219', d);
      pm.position.set(Math.sin(a) * 0.47, 0.125, Math.cos(a) * 0.47);
      pm.rotation.set(0, a, 0, 'YXZ');
      pm.rotateX(-24 * DEG);
      // capture latch between petals
      const la = a + Math.PI / 3;
      kit.mesh(rbox(0.06, 0.05, 0.04, 0.008), P.steel(), 'docking-system', 'stainless', d, Math.sin(la) * 0.46, 0.15, Math.cos(la) * 0.46).rotation.y = la;
    }
    if (hangar)
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        const hook = kit.mesh(rbox(0.035, 0.05, 0.025, 0.006), P.steel(), 'docking-system', 'stainless', d, Math.sin(a) * 0.5, 0.06, Math.cos(a) * 0.5);
        hook.rotation.y = a;
      }
    // docking camera and light on the deck
    kit.mesh(cyl(0.03, 0.03, 0.06, 16), P.anod(), 'docking-system', 'al-2219', d, 0.3, 0.03, -0.1).rotation.x = 0.2;
    dock = { pos: new THREE.Vector3(0, nadir + tunnelTop + 0.13, 0), axis: new THREE.Vector3(0, 1, 0) };
  } else {
    // forward hatch lid on the shorter tunnel
    kit.mesh(cyl(0.37, 0.37, 0.03, kit.seg(64, 24)), P.aluMilled(), 'capsule', 'al-li', cap, 0, tunnelTop + 0.015, 0);
    kit.mesh(rbox(0.2, 0.03, 0.05, 0.01), P.steel(), 'capsule', 'titanium', cap, 0, tunnelTop + 0.045, 0);
  }

  // ── surface details on the backshell
  const place = (m: THREE.Mesh, phi: number) => {
    const par = kit.at(cap, phi);
    if (par !== cap) {
      cap.remove(m);
      par.add(m);
    }
  };
  const frame = (w: number, h: number, r: number, band: number, depth: number, phi: number, s: number, mat: THREE.Material, part: 'capsule' | 'backshell-tps', matId: 'titanium' | 'ceramic-tiles') => {
    const g = onCone(frameBand(w, h, r, band, depth), phi, s);
    place(kit.mesh(g, mat, part, matId, cap), phi);
  };
  const pane = (w: number, h: number, r: number, z: number, phi: number, s: number) => {
    const g = new THREE.ShapeGeometry(roundRectShape(w, h, r), 6);
    g.translate(0, 0, z);
    onCone(g, phi, s);
    place(kit.mesh(g, P.pane(), 'capsule', 'titanium', cap), phi);
  };
  // windows: two side, two forward-looking; the hatch (with its own round window) faces -X
  const windows: [number, number, number, number][] = [
    [236, 1.5, 0.3, 0.36],
    [304, 1.5, 0.3, 0.36],
    [251, 2.25, 0.22, 0.26],
    [289, 2.25, 0.22, 0.26],
  ];
  for (const [deg, s, w, h] of windows) {
    const phi = deg * DEG;
    frame(w + 0.08, h + 0.08, 0.07, 0.05, 0.03, phi, s, P.ti(), 'capsule', 'titanium');
    pane(w - 0.01, h - 0.01, 0.045, 0.014, phi, s);
  }
  const hatchPhi = -Math.PI / 2;
  const hatchS = (1.7 - OML.p2y) / COS;
  {
    const hw = 0.86;
    const hh = 0.96;
    const rC = OML.p2r - hatchS * SIN;
    const pa = hatchPhi - hw / 2 / rC;
    const pb = hatchPhi + hw / 2 / rC;
    // the door skin (tiles like the cone around it) and its handle plate only read up close
    if (hangar) {
      const door = conePatch(pa, pb, hatchS - hh / 2, hatchS + hh / 2, 0.006, 16, 12, (phi, s) => [(((phi / (Math.PI * 2)) % 1) + 1) % 1, s / OML.L]);
      place(kit.mesh(door, tileMat, 'backshell-tps', 'ceramic-tiles', cap), hatchPhi);
    }
    frame(0.96, 1.06, 0.1, 0.07, 0.016, hatchPhi, hatchS, P.ti(), 'capsule', 'titanium');
    // round hatch window and the handle plate
    const ww = hatchS + 0.22;
    const wg = onCone(new THREE.TorusGeometry(0.085, 0.018, 8, 32), hatchPhi, ww);
    place(kit.mesh(wg, P.ti(), 'capsule', 'titanium', cap), hatchPhi);
    const wp = onCone(new THREE.CircleGeometry(0.08, 32).translate(0, 0, 0.012), hatchPhi, ww);
    place(kit.mesh(wp, P.pane(), 'capsule', 'titanium', cap), hatchPhi);
    if (hangar) {
      const hp = onCone(rbox(0.22, 0.1, 0.02, 0.01, 2).translate(0, 0, 0.012), hatchPhi, hatchS - 0.18);
      place(kit.mesh(hp, P.graphite(), 'capsule', 'titanium', cap), hatchPhi);
    }
  }
  // reaction control thrusters: four clusters of three (pitch/yaw, roll)
  const rcs: THREE.Vector3[] = [];
  const v = new THREE.Vector3();
  for (const deg of [45, 135, 225, 315]) {
    const phi = deg * DEG;
    const s = 1.95;
    const plate = onCone(cyl(0.085, 0.085, 0.012, 24).rotateX(Math.PI / 2).translate(0, 0, 0.006), phi, s);
    place(kit.mesh(plate, P.inconel(), 'attitude-thrusters', 'nickel-superalloy', cap), phi);
    for (const [x, y] of [
      [-0.04, -0.02],
      [0.04, -0.02],
      [0, 0.04],
    ]) {
      const nz = onCone(cyl(0.02, 0.026, 0.03, 16, true).rotateX(Math.PI / 2).translate(x, y, 0.02), phi, s);
      place(kit.mesh(nz, P.soot(), 'attitude-thrusters', 'nickel-superalloy', cap), phi);
    }
    conePoint(phi, s, 0.04, v);
    rcs.push(new THREE.Vector3(v.x, v.y + nadir, v.z));
  }
  // abort-tower attach fittings (crewed)
  if (crewed)
    for (const deg of [0, 90, 180, 270]) {
      const phi = deg * DEG;
      const f = onCone(rbox(0.12, 0.16, 0.05, 0.012, 2).translate(0, 0, 0.02), phi, LES_FOOT_S);
      place(kit.mesh(f, P.ti(), 'capsule', 'titanium', cap), phi);
    }

  // ── identity decal on the +Z side: KIMBLE mark and wordmark with ONE / FAB (never mirrored)
  {
    const sC = 1.24;
    const rC = OML.p2r - sC * SIN;
    const W = 1.36;
    const H = (W * DECAL_UNITS.h) / DECAL_UNITS.w;
    const half = W / 2 / rC;
    const dm = decal();
    for (const [a, b] of splitPhi(-half, half)) {
      const g = conePatch(a, b, sC - H / 2, sC + H / 2, 0.0035, hangar ? 24 : 8, hangar ? 6 : 2, (phi, s) => [0.5 + (phi * rC) / W, 0.5 + (s - sC) / H]);
      const m = kit.mesh(g, dm, 'backshell-tps', 'ceramic-tiles', cap);
      m.castShadow = false;
      m.renderOrder = 3;
      place(m, (a + b) / 2);
    }
  }

  // ── forward bay: parachute packs and drogue mortars around the tunnel
  // packs and mortar lids each in one group (merged; hidden as the chutes leave)
  const bags = new THREE.Group();
  cap.add(bags);
  const lids = new THREE.Group();
  cap.add(lids);
  {
    const y0 = yFwd + 0.02;
    const y1 = 2.78;
    const rIn = rT + 0.04;
    const rOut = (y: number) => OML.coneR(y) - pvIn + 0.02;
    const bagPoly = (): V2[] => {
      const c = 0.05;
      return [
        [rIn + c, y0],
        [rOut(y0) - c, y0],
        [rOut(y0 + c), y0 + c],
        [rOut(y1 - c) - 0.02, y1 - c],
        [rOut(y1) - c - 0.02, y1],
        [rIn + c, y1],
        [rIn, y1 - c],
        [rIn, y0 + c],
      ];
    };
    const tex = textile('#e7dfcc');
    for (let k = 0; k < 3; k++) {
      const a0 = (k * 120 + 8) * DEG;
      const a1b = a0 + 84 * DEG;
      const { skin, caps } = sweep(bagPoly(), true, { phi0: a0, phi1: a1b, segs: kit.seg(24, 8), caps: true, crease: 0.6 });
      kit.mesh(skin, tex, 'parachutes', 'textiles', bags);
      if (caps) kit.mesh(caps, tex, 'parachutes', 'textiles', bags);
    }
    // drogue mortars (hangar detail: at flight distances they never show)
    for (const deg of hangar ? [100, 340] : []) {
      const phi = deg * DEG;
      const rr = (rIn + rOut((y0 + y1) / 2)) / 2;
      const mg = new THREE.Group();
      mg.position.set(Math.sin(phi) * rr, y0, Math.cos(phi) * rr);
      cap.add(mg);
      kit.mesh(cyl(0.11, 0.11, 0.42, 24, true), P.aluMilled(), 'parachutes', 'textiles', mg, 0, 0.21, 0);
      kit.mesh(cyl(0.11, 0.11, 0.02, 24), P.graphite(), 'parachutes', 'textiles', mg, 0, 0.01, 0);
      kit.mesh(cyl(0.115, 0.115, 0.02, 24), P.graphite(), 'parachutes', 'textiles', lids, mg.position.x, y0 + 0.43, mg.position.z);
    }
  }

  // ── interior (section view)
  const inner = kit.inside(cap);
  if (inner) {
    const fl = 0.78;
    kit.mesh(cyl(1.45, 1.45, 0.03, kit.seg(96, 32)), P.aluMilled(), 'capsule', 'al-li', inner, 0, fl, 0);
    if (crewed) {
      for (const x of [-0.62, 0, 0.62]) {
        const seat = new THREE.Group();
        seat.position.set(x, fl + 0.32, 0.05);
        inner.add(seat);
        const back = kit.mesh(rbox(0.5, 0.08, 0.95, 0.03, 2), P.seat(), 'capsule', 'al-li', seat, 0, 0, -0.1);
        back.rotation.x = -12 * DEG;
        kit.mesh(rbox(0.46, 0.06, 0.88, 0.03, 2), P.cushion(), 'capsule', 'al-li', seat, 0, 0.06, -0.1).rotation.x = -12 * DEG;
        kit.mesh(rbox(0.5, 0.36, 0.08, 0.03, 2), P.seat(), 'capsule', 'al-li', seat, 0, 0.22, 0.42).rotation.x = -30 * DEG;
        kit.mesh(rbox(0.5, 0.08, 0.42, 0.03, 2), P.seat(), 'capsule', 'al-li', seat, 0, 0.4, 0.72).rotation.x = 10 * DEG;
        kit.mesh(rbox(0.28, 0.16, 0.12, 0.03, 2), P.cushion(), 'capsule', 'al-li', seat, 0, 0.12, -0.62);
        for (const sx of [-0.23, 0.23]) kit.mesh(strut(new THREE.Vector3(sx, -0.3, -0.3), new THREE.Vector3(sx, -0.02, -0.1), 0.02, 8), P.aluDark(), 'capsule', 'al-li', seat);
      }
      // display and control console above the crew
      const con = new THREE.Group();
      con.position.set(0, 1.95, 0.35);
      con.rotation.x = 60 * DEG;
      inner.add(con);
      kit.mesh(rbox(1.5, 0.08, 0.5, 0.02, 2), P.graphite(), 'capsule', 'al-li', con);
      for (const x of [-0.5, 0, 0.5]) kit.mesh(box(0.38, 0.01, 0.3), P.display(), 'capsule', 'al-li', con, x, -0.045, 0);
    } else {
      // experiment racks: locker stacks around a central column, their faces toward it, on the
      // wall opposite the section quadrant (0..90 deg) so the section view shows their fronts;
      // clear of the side hatch at 270 deg (the crew stowage lockers are not fitted)
      for (const deg of [150, 195, 240]) {
        const phi = deg * DEG;
        const rack = new THREE.Group();
        rack.position.set(Math.sin(phi) * 0.78, fl + 0.02, Math.cos(phi) * 0.78);
        rack.rotation.y = phi + Math.PI;
        inner.add(rack);
        kit.mesh(rbox(0.56, 1.08, 0.46, 0.015, 1), P.boxGrey(), 'capsule', 'al-li', rack, 0, 0.54, 0);
        for (let k = 0; k < 4; k++) {
          kit.mesh(rbox(0.5, 0.22, 0.02, 0.01, 1), P.whitePaint(), 'capsule', 'al-li', rack, 0, 0.14 + k * 0.26, 0.235);
          kit.mesh(box(0.14, 0.025, 0.02), P.aluDark(), 'capsule', 'al-li', rack, 0, 0.2 + k * 0.26, 0.25);
        }
      }
      kit.mesh(cyl(0.18, 0.2, 1.3, 32), P.aluMilled(), 'capsule', 'al-li', inner, 0, fl + 0.65, 0);
    }
    // crew stowage lockers on the -X/-Z walls
    if (crewed)
      for (const [x, z] of [
        [-1.05, -0.55],
        [-0.55, -1.05],
      ])
        kit.mesh(rbox(0.36, 0.5, 0.36, 0.02, 1), P.whitePaint(), 'capsule', 'al-li', inner, x, 1.25, z);
  }

  // ── parachutes
  const attach = new THREE.Vector3(0, tunnelTop + 0.02, 0);
  const chutes = buildChutes(kit, attach);
  cap.add(chutes.group);

  // ── heat-shield stack labels (close-up); anchors ride on the layers at the +X section plane
  const lab = (text: string, parent: THREE.Object3D, r: number, y: number) => {
    const o = new THREE.Object3D();
    o.position.set(r, y, 0);
    o.name = `label:${text}`;
    parent.add(o);
    kit.labels.push({ text, anchor: o });
  };
  const r0 = 1.25;
  lab('Ablator in a honeycomb carrier (60 mm)', gAbl, r0, OML.hsY(r0) + 0.03);
  lab('Composite carrier structure (35 mm)', gCar, r0, OML.hsY(r0) + tA + 0.018);
  lab('Fibrous insulation (40 mm)', gIns, r0, OML.hsY(r0) + tA + tC + 0.02);
  lab('Pressure vessel, aluminium-lithium (20 mm)', pv, r0, RHS - Math.sqrt(Rpv * Rpv - r0 * r0) + 0.01);

  const topY = nadir + OML.H;
  return {
    group,
    nadir,
    rcs,
    dock,
    chuteAttach: attach.clone().add(new THREE.Vector3(0, nadir, 0)),
    topY,
    pose(s) {
      abl.char.value = s.capChar;
      strk.opacity = Math.min(1, s.capChar * 1.1);
      strk.visible = s.capChar > 0.001;
      const sep = s.layerSep;
      gAbl.position.y = -0.5 * sep;
      gCar.position.y = -0.32 * sep;
      gIns.position.y = -0.15 * sep;
      const chutesOut = s.capDrogue > 0.001 || s.capMain > 0.001;
      cover.visible = !chutesOut;
      nose.rotation.z = 125 * DEG * s.capNoseCone;
      bags.visible = s.capMain < 0.02;
      lids.visible = s.capDrogue < 0.01;
      chutes.set(s.capDrogue, s.capMain);
    },
    dispose() {},
  };
}

/** Slant position of the abort-tower attach fittings on the backshell. */
export const LES_FOOT_S = (2.62 - OML.p2y) / COS;

function roundRectShape(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const x0 = -w / 2;
  const y0 = -h / 2;
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

let insulationMat: THREE.Material | null = null;
function variantInsulation(): THREE.Material {
  if (!insulationMat) insulationMat = new THREE.MeshStandardMaterial({ color: '#e3d6a8', roughness: 0.95, metalness: 0, name: 'sc-insulation' });
  return insulationMat;
}
