/**
 * Satellite building blocks: the bus (structure panels inside quilted MLI blankets with taped
 * seams, optical-solar-reflector radiators), the separation ring, hydrazine thruster clusters,
 * star trackers, reaction wheels, tanks, avionics boxes, parabolic antennas.
 * Local frames: the bus is authored about the satellite axis (+Y up the stack).
 */
import * as THREE from 'three';
import type { PartId } from '../../vehicle/parts';
import type { MaterialId } from '../../content/materials/ids';
import { box, cyl, DEG, rbox, strut, sweep, uvMetres, type Kit, type V2 } from './kit';
import { hatch, mli, MLI_REPEAT, osr, P, radiator, tape, type Foil } from './mats';
import { rng } from './textures';

export type FaceId = 'px' | 'nx' | 'pz' | 'nz' | 'top' | 'bot';
export type SkinKind = Foil | 'osr' | 'radiator';
export interface Region {
  /** Fraction of the face height (0 bottom .. 1 top). */
  v0: number;
  v1: number;
  kind: SkinKind;
}

export interface BusSpec {
  hx: number;
  hz: number;
  y0: number;
  y1: number;
  faces: Record<FaceId, Region[]>;
  /** The face removed in the section view. */
  cutFace: 'pz';
}

const FACE_ROT: Record<FaceId, [number, number]> = {
  px: [0, 90],
  nx: [0, -90],
  pz: [0, 0],
  nz: [0, 180],
  top: [-90, 0],
  bot: [90, 0],
};

export function faceFrame(s: BusSpec, f: FaceId): { pos: THREE.Vector3; rot: THREE.Euler; w: number; h: number } {
  const yc = (s.y0 + s.y1) / 2;
  const H = s.y1 - s.y0;
  const [rx, ry] = FACE_ROT[f];
  const rot = new THREE.Euler(rx * DEG, ry * DEG, 0, 'YXZ');
  switch (f) {
    case 'px':
      return { pos: new THREE.Vector3(s.hx, yc, 0), rot, w: 2 * s.hz, h: H };
    case 'nx':
      return { pos: new THREE.Vector3(-s.hx, yc, 0), rot, w: 2 * s.hz, h: H };
    case 'pz':
      return { pos: new THREE.Vector3(0, yc, s.hz), rot, w: 2 * s.hx, h: H };
    case 'nz':
      return { pos: new THREE.Vector3(0, yc, -s.hz), rot, w: 2 * s.hx, h: H };
    case 'top':
      return { pos: new THREE.Vector3(0, s.y1, 0), rot, w: 2 * s.hx, h: 2 * s.hz };
    case 'bot':
      return { pos: new THREE.Vector3(0, s.y0, 0), rot, w: 2 * s.hx, h: 2 * s.hz };
  }
}

const TAG_BUS: [PartId, MaterialId] = ['satellite-bus', 'cfrp-sandwich'];
const TAG_MLI: [PartId, MaterialId] = ['mli-blankets', 'mli'];

/**
 * One MLI blanket in its face frame (plane XY, outward +Z): pillowed between seams (the
 * blanket billows between its stand-off buttons), with polyimide/aluminium tape over seams.
 */
export function blanket(kit: Kit, parent: THREE.Object3D, w: number, h: number, kind: Foil, seamsU: number[], seamsV: number[], seed: number): void {
  const r = rng(seed);
  if (!kit.hangar) {
    const g = new THREE.PlaneGeometry(w, h);
    uvMetres(g, 1 / MLI_REPEAT);
    kit.mesh(g, mli(kind), ...TAG_MLI, parent, 0, 0, 0.016);
    return;
  }
  const nu = Math.max(4, Math.round(w / 0.05));
  const nv = Math.max(4, Math.round(h / 0.05));
  const g = new THREE.PlaneGeometry(w, h, nu, nv);
  const us = [0, ...seamsU, 1];
  const vs = [0, ...seamsV, 1];
  const frac = (x: number, list: number[]) => {
    for (let i = 0; i < list.length - 1; i++) if (x >= list[i] && x <= list[i + 1]) return (x - list[i]) / (list[i + 1] - list[i]);
    return 0;
  };
  const ph = [r() * 6, r() * 6, r() * 6, r() * 6];
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const u = x / w + 0.5;
    const v = y / h + 0.5;
    const env = Math.sin(Math.PI * frac(u, us)) * Math.sin(Math.PI * frac(v, vs));
    const n = 0.55 + 0.25 * Math.sin(x * 7.1 + ph[0]) * Math.sin(y * 5.3 + ph[1]) + 0.2 * Math.sin(x * 17 + y * 11 + ph[2]);
    p.setZ(i, 0.012 + 0.011 * Math.pow(env, 0.6) * n);
  }
  g.computeVertexNormals();
  uvMetres(g, 1 / MLI_REPEAT, new THREE.Vector2(r(), r()));
  kit.mesh(g, mli(kind), ...TAG_MLI, parent);
  // tapes over the perimeter and the seams
  const tw = 0.045;
  const tz = 0.0125;
  const tm = kind === 'gold' ? tape('kapton') : kind === 'black' ? tape('black') : tape('alu');
  const lines: [number, number, number, number][] = [];
  for (const u of seamsU) lines.push([(u - 0.5) * w, 0, tw, h]);
  for (const v of seamsV) lines.push([0, (v - 0.5) * h, w, tw]);
  lines.push([-w / 2 + tw / 2, 0, tw, h], [w / 2 - tw / 2, 0, tw, h], [0, -h / 2 + tw / 2, w, tw], [0, h / 2 - tw / 2, w, tw]);
  for (const [x, y, lw, lh] of lines) kit.mesh(box(lw, lh, 0.0016), tm, ...TAG_MLI, parent, x, y, tz);
  // a few stand-off buttons (velcro/stand-off pins) and grounding tabs
  for (let k = 0; k < Math.round(w * h * 1.5); k++) {
    const bx = (r() - 0.5) * (w - 0.1);
    const by = (r() - 0.5) * (h - 0.1);
    const btn = kit.mesh(cyl(0.012, 0.012, 0.004, 10), tape('black'), ...TAG_MLI, parent, bx, by, 0.0135);
    btn.rotation.x = Math.PI / 2;
  }
}

/** A skin region in a face frame: MLI blanket, OSR mirror radiator, or white radiator. */
function skin(kit: Kit, parent: THREE.Object3D, w: number, h: number, yOff: number, kind: SkinKind, seed: number, seams: [number[], number[]]): void {
  const g = new THREE.Group();
  g.position.y = yOff;
  parent.add(g);
  if (kind === 'osr' || kind === 'radiator') {
    const m = kind === 'osr' ? osr() : radiator();
    const plate = kit.mesh(box(w - 0.02, h - 0.02, 0.012), m, 'satellite-bus', 'cfrp-sandwich', g, 0, 0, 0.006);
    uvMetres(plate.geometry, 1 / 0.16);
    // frame around the radiator
    for (const [x, y, lw, lh] of [
      [0, h / 2 - 0.01, w, 0.02],
      [0, -h / 2 + 0.01, w, 0.02],
      [w / 2 - 0.01, 0, 0.02, h],
      [-w / 2 + 0.01, 0, 0.02, h],
    ])
      kit.mesh(box(lw, lh, 0.016), tape('alu'), 'satellite-bus', 'cfrp-sandwich', g, x, y, 0.008);
    return;
  }
  blanket(kit, g, w, h, kind, seams[0], seams[1], seed);
}

export interface BusParts {
  /** Group holding the whole bus (kept). */
  bus: THREE.Group;
  /** Interior equipment parent (hangar only). */
  inner: THREE.Object3D | null;
  /** Face frames for mounting appendages. */
  frame: (f: FaceId) => ReturnType<typeof faceFrame>;
}

/**
 * The bus box: sandwich structure panels (visible in the section), blankets and radiators per
 * face region, rolled blanket corners. The cut face (+Z) and its blankets slide away in the
 * section view; exposed panel edges show hatched honeycomb.
 */
export function buildBus(kit: Kit, parent: THREE.Object3D, s: BusSpec): BusParts {
  const bus = new THREE.Group();
  bus.name = 'bus';
  parent.add(bus);
  const cut = kit.hangar ? kit.cut(bus, new THREE.Vector3(0, 0.25, 1), 1.6) : null;
  const H = s.y1 - s.y0;
  const T = 0.025;
  let seed = 1;
  for (const f of Object.keys(s.faces) as FaceId[]) {
    const fr = faceFrame(s, f);
    const holder = new THREE.Group();
    holder.position.copy(fr.pos);
    holder.rotation.copy(fr.rot);
    (f === s.cutFace && cut ? cut.wedge : bus).add(holder);
    for (const reg of s.faces[f]) {
      const hh = (reg.v1 - reg.v0) * fr.h;
      const yOff = ((reg.v0 + reg.v1) / 2 - 0.5) * fr.h;
      const seamsU = fr.w > 1.6 ? [0.5] : [];
      const seamsV = hh > 1.8 ? [0.34, 0.67] : hh > 1 ? [0.5] : [];
      skin(kit, holder, fr.w, hh, yOff, reg.kind, seed++ * 13, [seamsU, seamsV]);
    }
    // structure panel (hangar: real thickness, aluminium face sheets over honeycomb)
    if (kit.hangar) {
      const panel = kit.mesh(box(fr.w - (f === 'px' || f === 'nx' ? 0 : 2 * T), fr.h - (f === 'top' || f === 'bot' ? 2 * T : 0), T), P.aluMilled(), ...TAG_BUS);
      panel.position.z = -T / 2;
      holder.add(panel);
    }
  }
  // rolled blanket corners along the vertical edges
  const cr = 0.022;
  for (const [sx, sz] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]) {
    const c = kit.mesh(cyl(cr, cr, H, kit.seg(12, 6), true), mli('gold'), ...TAG_MLI);
    c.position.set(sx * s.hx, (s.y0 + s.y1) / 2, sz * s.hz);
    uvMetres(c.geometry, 1 / MLI_REPEAT);
    (sz > 0 && cut ? cut.wedge : bus).add(c);
  }
  // section caps: honeycomb edges of the panels left open by the removed +Z face
  if (cut) {
    const hm = hatch('honeycomb');
    for (const sx of [-1, 1]) kit.mesh(box(T, H, 0.003), hm, ...TAG_BUS, cut.caps, sx * (s.hx - T / 2), (s.y0 + s.y1) / 2, s.hz + 0.0015);
    for (const yy of [s.y0 + T / 2, s.y1 - T / 2]) kit.mesh(box(2 * s.hx - 2 * T, T, 0.003), hm, ...TAG_BUS, cut.caps, 0, yy, s.hz - T + 0.0015);
  }
  return { bus, inner: cut ? cut.inner : null, frame: (f) => faceFrame(s, f) };
}

/** 1575 mm separation ring and a short aft cone up to the bus floor (satellite side of the clamp band). */
export function sepRing(kit: Kit, parent: THREE.Object3D, base: number, topY: number, rTop: number): void {
  const R = 1.575 / 2;
  const poly: V2[] = [
    [R - 0.05, base],
    [R, base],
    [R, base + 0.028],
    [R - 0.012, base + 0.034], // clamp-band groove
    [R - 0.012, base + 0.05],
    [R, base + 0.056],
    [R, base + 0.08],
    [R - 0.05, base + 0.08],
  ];
  kit.solid(parent, poly, kit.seg(128, 32), P.aluMilled(), hatch('metal'), 'satellite-bus', 'al-2219', { crease: 0.3 });
  const cone: V2[] = [
    [R - 0.025, base + 0.08],
    [rTop, topY],
    [rTop - 0.012, topY],
    [R - 0.037, base + 0.08],
  ];
  kit.solid(parent, cone, kit.seg(96, 24), P.cfrpPanel(), hatch('composite'), 'satellite-bus', 'al-2219', { crease: 0.3 });
  if (kit.hangar) {
    // separation springs and umbilical connectors
    for (let k = 0; k < 4; k++) {
      const a = (k + 0.5) * (Math.PI / 2);
      kit.mesh(cyl(0.028, 0.028, 0.06, 12), P.steel(), 'satellite-bus', 'al-2219', parent, Math.sin(a) * (R - 0.03), base + 0.11, Math.cos(a) * (R - 0.03));
    }
    for (const a of [0.3, Math.PI + 0.3]) kit.mesh(rbox(0.09, 0.07, 0.06, 0.01), P.anod(), 'satellite-bus', 'al-2219', parent, Math.sin(a) * (R - 0.06), base + 0.12, Math.cos(a) * (R - 0.06));
  }
}

/** One monopropellant thruster: valve, catalyst bed with heat shield, nozzle along -Y. */
function thruster(kit: Kit, parent: THREE.Object3D, scale = 1): THREE.Group {
  const t = new THREE.Group();
  parent.add(t);
  const k = scale;
  kit.mesh(rbox(0.05 * k, 0.04 * k, 0.05 * k, 0.006 * k), P.steel(), 'attitude-thrusters', 'titanium', t, 0, 0.03 * k, 0);
  kit.mesh(cyl(0.017 * k, 0.017 * k, 0.05 * k, 12), P.gold(), 'attitude-thrusters', 'nickel-superalloy', t, 0, -0.01 * k, 0);
  const noz: V2[] = [
    [0.006 * k, -0.035 * k],
    [0.016 * k, -0.075 * k],
    [0.0145 * k, -0.075 * k],
    [0.004 * k, -0.035 * k],
  ];
  const { skin: g } = sweep(noz, true, { segs: kit.seg(16, 8) });
  kit.mesh(g, P.thruster(), 'attitude-thrusters', 'nickel-superalloy', t);
  return t;
}

/** A cluster of three thrusters on a bracket (one axial, two canted); returns the exit point. */
export function thrusterCluster(kit: Kit, parent: THREE.Object3D, pos: THREE.Vector3, outward: THREE.Vector3): THREE.Vector3 {
  const g = new THREE.Group();
  g.position.copy(pos);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(outward.x, 0, outward.z).normalize());
  parent.add(g);
  kit.mesh(rbox(0.16, 0.03, 0.16, 0.008), P.aluMilled(), 'attitude-thrusters', 'titanium', g, 0, 0.02, 0);
  const a = thruster(kit, g);
  a.position.set(0.02, -0.02, 0);
  if (kit.hangar) {
    const b = thruster(kit, g);
    b.position.set(0.02, -0.01, 0.05);
    b.rotation.x = 50 * DEG;
    const c = thruster(kit, g);
    c.position.set(0.02, -0.01, -0.05);
    c.rotation.x = -50 * DEG;
    const d = thruster(kit, g);
    d.position.set(0.06, 0, 0);
    d.rotation.z = 60 * DEG;
  }
  return pos.clone().add(new THREE.Vector3(0, -0.09, 0));
}

/** Star tracker head: electronics box, lens and a scarfed black baffle along local +Y. */
export function starTracker(kit: Kit, parent: THREE.Object3D): THREE.Group {
  const g = new THREE.Group();
  parent.add(g);
  kit.mesh(rbox(0.13, 0.1, 0.13, 0.01), P.anod(), 'satellite-bus', 'cfrp-sandwich', g, 0, 0.05, 0);
  const prof: V2[] = [
    [0.035, 0.1],
    [0.065, 0.1],
    [0.075, 0.26],
    [0.068, 0.26],
    [0.04, 0.12],
  ];
  const { skin } = sweep(prof, true, { segs: kit.seg(24, 12) });
  kit.mesh(skin, P.whitePaint(), 'satellite-bus', 'cfrp-sandwich', g);
  const inner: V2[] = [
    [0.066, 0.255],
    [0.038, 0.12],
  ];
  kit.mesh(sweep(inner, false, { segs: kit.seg(24, 12) }).skin, P.anod(), 'satellite-bus', 'cfrp-sandwich', g);
  kit.mesh(cyl(0.035, 0.035, 0.01, 20), P.lens(), 'satellite-bus', 'cfrp-sandwich', g, 0, 0.115, 0);
  return g;
}

/** Reaction wheel in its housing (axis local +Y). */
export function reactionWheel(kit: Kit, parent: THREE.Object3D, r = 0.17): THREE.Group {
  const g = new THREE.Group();
  parent.add(g);
  const prof: V2[] = [
    [0, -0.05],
    [r * 0.95, -0.05],
    [r, -0.035],
    [r, 0.03],
    [r * 0.8, 0.055],
    [0, 0.065],
  ];
  kit.mesh(sweep(prof, false, { segs: kit.seg(36, 16), crease: 0.5 }).skin, P.aluDark(), 'attitude-thrusters', 'titanium', g);
  kit.mesh(cyl(r * 1.08, r * 1.08, 0.012, kit.seg(36, 16)), P.anod(), 'attitude-thrusters', 'titanium', g, 0, -0.055, 0);
  kit.mesh(rbox(0.12, 0.05, 0.08, 0.008), P.anod(), 'attitude-thrusters', 'titanium', g, r + 0.06, -0.03, 0);
  return g;
}

/** Spherical titanium propellant tank with a girth weld land and mounting tabs. */
export function sphereTank(kit: Kit, parent: THREE.Object3D, r: number, y: number, part: PartId = 'attitude-thrusters'): void {
  const n = kit.seg(48, 16);
  const g = new THREE.SphereGeometry(r, n, Math.round(n / 2));
  kit.mesh(g, P.ti(), part, 'titanium', parent, 0, y, 0);
  kit.mesh(new THREE.TorusGeometry(r, 0.012, 8, n), P.ti(), part, 'titanium', parent, 0, y, 0).rotation.x = Math.PI / 2;
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 + Math.PI / 4;
    kit.mesh(strut(new THREE.Vector3(Math.sin(a) * r * 0.98, y, Math.cos(a) * r * 0.98), new THREE.Vector3(Math.sin(a) * (r + 0.1), y - 0.12, Math.cos(a) * (r + 0.1)), 0.015, 8), P.ti(), part, 'titanium', parent);
  }
}

/** Capsule-shaped tank (cylinder with hemispherical ends) along Y. */
export function pillTank(kit: Kit, parent: THREE.Object3D, r: number, len: number, x: number, y: number, z: number, part: PartId, material: MaterialId, mat = P.ti()): void {
  const n = kit.seg(40, 14);
  const g = new THREE.CapsuleGeometry(r, len, Math.round(n / 4), n);
  kit.mesh(g, mat, part, material, parent, x, y, z);
}

/** Avionics box with connectors and a cable run (local +Z = outward face). */
export function avionicsBox(kit: Kit, parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, rotY = 0): void {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  parent.add(g);
  kit.mesh(rbox(w, h, d, 0.006, 1), P.boxGrey(), 'satellite-bus', 'cfrp-sandwich', g);
  for (let k = 0; k < Math.max(1, Math.round(w / 0.1)); k++) kit.mesh(cyl(0.012, 0.012, 0.03, 10), P.anod(), 'satellite-bus', 'cfrp-sandwich', g, -w / 2 + 0.05 + k * 0.1, h / 2 + 0.012, 0);
  // heat-sink fins on top
  for (let k = 0; k < 5; k++) kit.mesh(box(w * 0.8, 0.012, 0.004), P.aluDark(), 'satellite-bus', 'cfrp-sandwich', g, 0, h / 2 - 0.02 - k * 0.018, d / 2 + 0.002);
}

/**
 * Parabolic reflector with boresight +Y: front skin, back skin with a rim, radial back ribs,
 * optional Cassegrain subreflector on three struts and a feed horn at the vertex.
 */
export function dish(kit: Kit, parent: THREE.Object3D, D: number, f: number, opts: { sub?: boolean; horn?: boolean; front?: THREE.Material; back?: THREE.Material; part?: PartId; material?: MaterialId } = {}): THREE.Group {
  const g = new THREE.Group();
  parent.add(g);
  const part = opts.part ?? 'antenna';
  const mat = opts.material ?? 'cfrp-sandwich';
  const R = D / 2;
  const n = 14;
  const front: V2[] = [];
  for (let i = n; i >= 0; i--) {
    const r = (R * i) / n;
    front.push([r, (r * r) / (4 * f)]);
  }
  // front (concave) surface listed from the rim to the vertex: normals face the focus side
  const segs = kit.seg(64, 20);
  const depth = (R * R) / (4 * f);
  const th = 0.02;
  const poly: V2[] = [...front.map(([r, y]) => [r, y] as V2), ...[...front].reverse().map(([r, y]) => [r, y - th] as V2)];
  const { skin } = sweep(poly, true, { segs, crease: 0.9 });
  kit.mesh(skin, opts.front ?? P.whitePaint(), part, mat, g);
  // rim and back ribs
  if (kit.hangar) {
    kit.mesh(new THREE.TorusGeometry(R, 0.012, 8, segs), opts.back ?? P.cfrpPanel(), part, mat, g, 0, depth - th / 2, 0).rotation.x = Math.PI / 2;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const pts: THREE.Vector3[] = [];
      for (let i = 1; i <= 6; i++) {
        const r = (R * 0.95 * i) / 6;
        pts.push(new THREE.Vector3(Math.sin(a) * r, (r * r) / (4 * f) - th - 0.02 * (1 - i / 7), Math.cos(a) * r));
      }
      for (let i = 0; i < pts.length - 1; i++) kit.mesh(strut(pts[i], pts[i + 1], 0.008, 6), opts.back ?? P.cfrpPanel(), part, mat, g);
    }
  }
  // feed horn at the vertex (not on offset-fed reflectors)
  if (opts.horn === false) return g;
  const horn: V2[] = [
    [0.03, 0],
    [0.075, 0.12],
    [0.068, 0.12],
    [0.026, 0.01],
  ];
  kit.mesh(sweep(horn, true, { segs: kit.seg(24, 10) }).skin, P.gold(), part, mat, g);
  if (opts.sub) {
    const sy = f * 0.72;
    const sub: V2[] = [
      [0, sy - 0.01],
      [R * 0.16, sy + 0.015],
      [R * 0.16, sy + 0.025],
      [0, sy + 0.005],
    ];
    kit.mesh(sweep(sub, true, { segs: kit.seg(32, 12) }).skin, P.whitePaint(), part, mat, g);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      const rr = R * 0.62;
      kit.mesh(strut(new THREE.Vector3(Math.sin(a) * rr, (rr * rr) / (4 * f), Math.cos(a) * rr), new THREE.Vector3(Math.sin(a) * R * 0.14, sy + 0.01, Math.cos(a) * R * 0.14), 0.008, 6), P.cfrpPanel(), part, mat, g);
    }
  }
  return g;
}
