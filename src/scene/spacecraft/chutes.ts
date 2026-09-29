/**
 * Parachutes: drogues (conical ribbon) and mains (ringsail) above the capsule along +Y.
 * Each chute is a riser from the attach point to a confluence, suspension lines to the skirt
 * and a canopy whose gores bulge between radial seams. The canopy shape is a function of the
 * inflation state (0 streaming, 0.5 reefed, 1 full), recomputed only when the state changes:
 *
 *   capDrogue 0..1   bag out, lines stretch, canopy inflates
 *   capMain   0..0.5 bags out, lines stretch, canopies fill to the reefed (narrow) shape
 *             0.5..1 reefing lines cut: canopies open to full diameter
 */
import * as THREE from 'three';
import { CAPSULE } from '../../vehicle/spec';
import { smooth, type Kit } from './kit';
import { canopy, lineMat } from './mats';

interface ChuteDef {
  /** Nominal (flat) diameter D0 (m). */
  d0: number;
  gores: number;
  sub: number;
  rings: number;
  riser: number;
  lines: number;
  kind: 'ringsail' | 'ribbon';
  /** Axis tilt from +Y at full inflation (rad) and its azimuth. */
  tilt: number;
  azimuth: number;
}

/** Shape keyframes in units of D0: [skirt radius, max radius, canopy height (skirt to apex)]. */
const SHAPE: [number, number, number, number][] = [
  // infl, skirtR, maxR, height
  [0, 0.012, 0.022, 0.5],
  [0.12, 0.025, 0.05, 0.42],
  [0.5, 0.055, 0.12, 0.3],
  [0.75, 0.2, 0.25, 0.24],
  [1, 0.3, 0.345, 0.21],
];

function shapeAt(f: number): { skirt: number; max: number; height: number } {
  for (let i = 0; i < SHAPE.length - 1; i++) {
    const [f0, s0, m0, h0] = SHAPE[i];
    const [f1, s1, m1, h1] = SHAPE[i + 1];
    if (f <= f1) {
      const t = (f - f0) / (f1 - f0);
      return { skirt: s0 + (s1 - s0) * t, max: m0 + (m1 - m0) * t, height: h0 + (h1 - h0) * t };
    }
  }
  const [, s, m, h] = SHAPE[SHAPE.length - 1];
  return { skirt: s, max: m, height: h };
}

class Chute {
  readonly group = new THREE.Group();
  private readonly canopyMesh: THREE.Mesh;
  private readonly lines: THREE.LineSegments;
  private readonly riser: THREE.LineSegments;
  private readonly def: ChuteDef;
  private readonly pos: Float32Array;
  private readonly linePos: Float32Array;
  private readonly riserPos: Float32Array;
  private packed = false;

  constructor(kit: Kit, def: ChuteDef) {
    this.def = def;
    const nu = def.gores * def.sub;
    const nv = def.rings;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array((nu + 1) * (nv + 1) * 3);
    const col = new Float32Array((nu + 1) * (nv + 1) * 3);
    const uv = new Float32Array((nu + 1) * (nv + 1) * 2);
    const orange = new THREE.Color('#e2672a');
    const white = new THREE.Color('#f1eee6');
    const idx: number[] = [];
    for (let j = 0; j <= nv; j++)
      for (let i = 0; i <= nu; i++) {
        const k = j * (nu + 1) + i;
        const gore = Math.floor(i / def.sub) % def.gores;
        const v = j / nv;
        let c: THREE.Color;
        if (def.kind === 'ringsail') c = gore % 4 < 2 ? white : gore % 4 === 2 ? orange : white;
        else c = Math.floor(v * 9) % 2 ? orange : white;
        if (def.kind === 'ringsail' && v > 0.9) c = orange; // skirt band
        col.set([c.r, c.g, c.b], k * 3);
        uv.set([(i / def.sub) * 0.999, v], k * 2);
        if (i < nu && j < nv) {
          const a = k;
          const b = k + 1;
          const cc = k + nu + 1;
          const d = cc + 1;
          idx.push(a, cc, b, b, cc, d);
        }
      }
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.pos.length), 3));
    g.setIndex(idx);
    this.canopyMesh = kit.mesh(g, canopy(def.kind), 'parachutes', 'textiles', this.group);
    this.canopyMesh.userData.keep = true;
    this.canopyMesh.frustumCulled = false;
    // suspension lines: one per gore seam from the skirt to the confluence
    const lg = new THREE.BufferGeometry();
    this.linePos = new Float32Array(def.gores * 2 * 3);
    lg.setAttribute('position', new THREE.BufferAttribute(this.linePos, 3));
    this.lines = new THREE.LineSegments(lg, lineMat('#b9b3a4', 0.85));
    this.lines.userData = { part: 'parachutes', material: 'textiles', keep: true };
    this.lines.frustumCulled = false;
    kit.geos.add(lg);
    this.group.add(this.lines);
    const rg = new THREE.BufferGeometry();
    this.riserPos = new Float32Array(2 * 3);
    rg.setAttribute('position', new THREE.BufferAttribute(this.riserPos, 3));
    this.riser = new THREE.LineSegments(rg, lineMat('#6f6a60'));
    this.riser.userData = { part: 'parachutes', material: 'textiles', keep: true };
    this.riser.frustumCulled = false;
    kit.geos.add(rg);
    this.group.add(this.riser);
    this.group.visible = false;
  }

  /** ext 0..1 lines paying out; infl 0..1 canopy shape (0.5 = reefed). */
  update(ext: number, infl: number): void {
    const d = this.def;
    // canopy tilt grows as the cluster spreads with inflation
    this.group.rotation.set(0, d.azimuth, 0);
    this.group.rotateZ(-d.tilt * (0.25 + 0.75 * infl));
    this.group.visible = ext > 0.001;
    if (!this.group.visible) {
      // packed: collapse the canopy and lines onto the attach point (bounds stay the capsule's)
      if (!this.packed) {
        this.packed = true;
        this.pos.fill(0);
        this.linePos.fill(0);
        this.riserPos.fill(0);
        for (const o of [this.canopyMesh, this.lines, this.riser]) {
          o.geometry.attributes.position.needsUpdate = true;
          o.geometry.computeBoundingSphere();
          o.geometry.computeBoundingBox();
        }
      }
      return;
    }
    this.packed = false;
    const D = d.d0;
    const sh = shapeAt(infl);
    const skirtR = sh.skirt * D;
    const maxR = sh.max * D;
    const H = sh.height * D;
    const Lr = d.riser * ext;
    const Ll = d.lines * ext;
    const conf = Lr;
    const ySkirt = conf + Math.sqrt(Math.max(0.01, Ll * Ll - skirtR * skirtR));
    const nu = d.gores * d.sub;
    const nv = d.rings;
    const vent = 0.035 * D * (0.3 + 0.7 * infl);
    const bulge = 0.02 + 0.06 * infl;
    const yM = H * 0.3; // height of the widest point above the skirt
    for (let j = 0; j <= nv; j++) {
      const v = j / nv; // 0 vent .. 1 skirt
      // meridian: crown quarter-ellipse to the widest point, then an in-curve to the skirt
      let r: number;
      let y: number;
      const vm = 0.68;
      if (v <= vm) {
        const a = (v / vm) * (Math.PI / 2);
        r = vent + (maxR - vent) * Math.sin(a);
        y = yM + (H - yM) * Math.cos(a);
      } else {
        const t = (v - vm) / (1 - vm);
        r = maxR + (skirtR - maxR) * t * t;
        y = yM * (1 - t);
      }
      for (let i = 0; i <= nu; i++) {
        const phi = (i / nu) * Math.PI * 2;
        const frac = (i % d.sub) / d.sub;
        const b = Math.sin(Math.PI * frac);
        const rr = r * (1 + bulge * b * Math.sin(Math.PI * Math.min(1, v * 1.2)));
        const scallop = v > 0.9 ? (v - 0.9) * 10 * b * 0.04 * maxR : 0;
        const k = (j * (nu + 1) + i) * 3;
        this.pos[k] = rr * Math.sin(phi);
        this.pos[k + 1] = ySkirt + y + scallop;
        this.pos[k + 2] = rr * Math.cos(phi);
      }
    }
    const g = this.canopyMesh.geometry;
    g.attributes.position.needsUpdate = true;
    g.computeVertexNormals();
    g.computeBoundingSphere();
    g.computeBoundingBox();
    for (let s = 0; s < d.gores; s++) {
      const phi = (s / d.gores) * Math.PI * 2;
      const k = s * 6;
      this.linePos.set([skirtR * Math.sin(phi), ySkirt, skirtR * Math.cos(phi), 0, conf, 0], k);
    }
    this.lines.geometry.attributes.position.needsUpdate = true;
    this.lines.geometry.computeBoundingSphere();
    this.lines.geometry.computeBoundingBox();
    this.riserPos.set([0, 0, 0, 0, conf, 0]);
    this.riser.geometry.attributes.position.needsUpdate = true;
    this.riser.geometry.computeBoundingSphere();
    this.riser.geometry.computeBoundingBox();
  }
}

export interface ChuteSet {
  group: THREE.Group;
  set(drogue: number, main: number): void;
}

/** Two drogues and three mains at the riser attach point (capsule model frame). */
export function buildChutes(kit: Kit, attach: THREE.Vector3): ChuteSet {
  const group = new THREE.Group();
  group.name = 'parachutes';
  group.position.copy(attach);
  const hangar = kit.hangar;
  const drogues = [0, 1].map(
    (i) =>
      new Chute(kit, {
        d0: CAPSULE.drogueDiameter,
        gores: hangar ? 20 : 12,
        sub: hangar ? 4 : 2,
        rings: hangar ? 22 : 10,
        riser: 3.2 * CAPSULE.drogueDiameter,
        lines: 1.3 * CAPSULE.drogueDiameter,
        kind: 'ribbon',
        tilt: 0.12,
        azimuth: Math.PI / 2 + i * Math.PI,
      }),
  );
  const mains = [0, 1, 2].map(
    (i) =>
      new Chute(kit, {
        d0: CAPSULE.mainDiameter,
        gores: hangar ? 36 : 16,
        sub: hangar ? 5 : 2,
        rings: hangar ? 28 : 12,
        riser: 12,
        lines: 1.15 * CAPSULE.mainDiameter,
        kind: 'ringsail',
        tilt: 0.3,
        azimuth: (i * Math.PI * 2) / 3 + Math.PI / 6,
      }),
  );
  for (const c of [...drogues, ...mains]) group.add(c.group);
  let last = '';
  return {
    group,
    set(drogue: number, main: number) {
      const key = `${drogue.toFixed(4)}|${main.toFixed(4)}`;
      if (key === last) return;
      last = key;
      const de = smooth(0, 0.35, drogue);
      const di = smooth(0.2, 1, drogue);
      for (const c of drogues) c.update(de, di);
      const me = smooth(0, 0.18, main);
      const mi = main <= 0.5 ? 0.5 * smooth(0.1, 0.5, main) : 0.5 + 0.5 * smooth(0.5, 1, main);
      for (const c of mains) c.update(me, mi);
    },
  };
}
