/**
 * Rigid-panel solar array wing with a yoke, stowed as an accordion stack against a mounting
 * face and deployed in sequence: the yoke swings out first carrying the folded stack parallel
 * to the face (clear of the body), then the panels unfold together (synchronised, as closed
 * cable loops do) into one flat wing.
 *
 * WING FRAME (the root group): origin on the mounting face at the wing axis, +X outward (the
 * deployed wing axis), +Y along the hinge lines, cells facing +Z when deployed.
 * Hinge chain: element 0 is the yoke (length w/2, so the deployed wing axis passes through the
 * root), elements 1..n the panels. Element k's mid-plane sits at c_k = +/- g/2 from its hinge
 * line and hinge k+1 at h_k = c_k - c_(k+1) (brackets stand the hinge lines off the panels), so
 * 180 degree folds stack the panels g apart and the deployed wing is flat.
 */
import * as THREE from 'three';
import type { PartId } from '../../vehicle/parts';
import type { MaterialId } from '../../content/materials/ids';
import { box, cyl, rbox, smooth, strut, uvMetres, type Kit } from './kit';
import { cells, P, panelBack } from './mats';
import { CELL_TILE } from './textures';

export interface WingSpec {
  panels: number;
  /** Panel length along the deployed wing axis (m); stowed, the width across the face. */
  w: number;
  /** Panel height along the hinge lines (m). */
  h: number;
  /** Panel thickness (m). */
  t?: number;
  /** Stack pitch (m). */
  g?: number;
  /** Hinge plane stand-off from the mounting face (m). */
  standoff?: number;
  part?: PartId;
  material?: MaterialId;
}

export interface Wing {
  root: THREE.Group;
  /** Deploy 0..1 (yoke first, then panels) and drive angle about the wing axis (rad). */
  set(deploy: number, drive?: number): void;
  /** Outer extent from the mounting face when stowed (m). */
  stackDepth: number;
  /** Deployed tip distance from the mounting face (m). */
  span: number;
}

const D90 = Math.PI / 2;

export function buildWing(kit: Kit, s: WingSpec): Wing {
  const part: PartId = s.part ?? 'solar-arrays';
  const mat: MaterialId = s.material ?? 'cfrp-sandwich';
  const n = s.panels;
  const w = s.w;
  const h = s.h;
  const t = s.t ?? 0.024;
  const g = s.g ?? 0.045;
  const xH = s.standoff ?? 0.06;
  const Ly = w / 2;
  const hangar = kit.hangar;
  const root = new THREE.Group();
  root.name = 'wing';
  const drive = new THREE.Group();
  drive.position.set(xH, 0, 0);
  root.add(drive);
  const c = (k: number) => (k % 2 === 1 ? g / 2 : -g / 2);
  const hk = (k: number) => c(k) - c(k + 1);

  // ── static root hardware: drive housing, hold-down release units, tie-down rods
  const sadm = kit.mesh(cyl(0.11, 0.13, xH + 0.02, kit.seg(24, 12)), P.whitePaint(), part, 'cfrp-sandwich', root);
  sadm.rotation.z = -D90;
  sadm.position.set((xH + 0.02) / 2 - 0.02, 0, 0);
  const rods: THREE.Mesh[] = [];
  const stackDepth = xH + (n + 0.5) * g + t / 2;
  if (hangar) {
    kit.mesh(cyl(0.05, 0.05, 0.06, 16), P.anod(), part, mat, root, xH, 0, 0).rotation.z = -D90;
    for (const zz of [-0.35 * w, 0.35 * w])
      for (const yy of [-0.42 * h, 0.42 * h]) {
        const unit = kit.mesh(rbox(0.09, 0.12, 0.09, 0.012, 2), P.anod(), part, mat, root, 0.045, yy, zz);
        unit.name = 'hold-down';
        const rod = kit.mesh(cyl(0.012, 0.012, stackDepth + 0.02, 8), P.steel(), part, 'cfrp-sandwich', root, (stackDepth + 0.02) / 2, yy, zz);
        rod.rotation.z = -D90;
        rod.userData.keep = true;
        rods.push(rod);
        kit.mesh(cyl(0.028, 0.028, 0.012, 12), P.steel(), part, 'cfrp-sandwich', rod, 0, stackDepth / 2 + 0.01, 0).userData.keep = true;
      }
  }

  // ── the hinge chain
  const pivots: THREE.Group[] = [];
  let parent: THREE.Object3D = drive;
  const knuckle = (grp: THREE.Object3D, x: number, z: number) => {
    if (!hangar) return;
    for (const yy of [-0.38 * h, 0.38 * h]) {
      kit.mesh(cyl(0.022, 0.022, 0.1, 12), P.alu(), part, mat, grp, x, yy, z);
      kit.mesh(box(0.05, 0.08, Math.abs(z) + 0.012 || 0.012), P.aluMilled(), part, mat, grp, x - Math.sign(x || 1) * 0.02, yy, z / 2);
    }
  };
  for (let k = 0; k <= n; k++) {
    const pv = new THREE.Group();
    pv.name = k === 0 ? 'yoke' : `panel-${k}`;
    if (k > 0) pv.position.set(k === 1 ? Ly : w, 0, hk(k - 1));
    parent.add(pv);
    pivots.push(pv);
    const ck = c(k);
    if (k === 0) {
      // yoke: an A-frame from two root hinges to the two panel hinges
      const rr = hangar ? 0.022 : 0.03;
      const seg = hangar ? 10 : 6;
      const yr = Math.min(0.18, h * 0.08);
      for (const sgn of [-1, 1]) {
        kit.mesh(strut(new THREE.Vector3(0.03, sgn * yr, ck), new THREE.Vector3(Ly - 0.03, sgn * 0.38 * h, ck), rr, seg), P.carbon(), part, mat, pv);
        kit.mesh(cyl(0.03, 0.03, 0.09, 12), P.alu(), part, mat, pv, 0, sgn * yr, 0);
      }
      kit.mesh(strut(new THREE.Vector3(Ly * 0.55, -0.38 * h * 0.6, ck), new THREE.Vector3(Ly * 0.55, 0.38 * h * 0.6, ck), rr * 0.8, seg), P.carbon(), part, mat, pv);
      kit.mesh(strut(new THREE.Vector3(Ly - 0.03, -0.38 * h, ck), new THREE.Vector3(Ly - 0.03, 0.38 * h, ck), rr * 0.8, seg), P.carbon(), part, mat, pv);
      knuckle(pv, Ly, hk(0));
    } else {
      const panel = kit.mesh(hangar ? rbox(w - 0.01, h, t, 0.004, 1) : box(w - 0.01, h, t), panelBack(), part, mat, pv, w / 2, 0, ck);
      uvMetres(panel.geometry, 1 / 0.6);
      // cell field: an integer number of cells, inset from the frame
      const cw = CELL_TILE.cellW;
      const ch = CELL_TILE.cellH;
      const nx = Math.floor((w - 0.06) / cw);
      const ny = Math.floor((h - 0.06) / ch);
      const fw = nx * cw;
      const fh = ny * ch;
      const cg = new THREE.PlaneGeometry(fw, fh);
      const uv = cg.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * fw) / CELL_TILE.w, (uv.getY(i) * fh) / CELL_TILE.h);
      kit.mesh(cg, cells(), part, mat, pv, w / 2, 0, ck + t / 2 + 0.0008).castShadow = false;
      if (hangar) {
        // edge frame (aluminium) and hold-down cups at the tie-down points
        for (const yy of [-h / 2 + 0.01, h / 2 - 0.01]) kit.mesh(box(w - 0.01, 0.02, t + 0.004), P.aluMilled(), part, mat, pv, w / 2, yy, ck);
        for (const xx of [0.15 * w, 0.85 * w])
          for (const yy of [-0.42 * h, 0.42 * h]) {
            const cup = kit.mesh(cyl(0.03, 0.03, t + 0.012, 14), P.aluMilled(), part, mat, pv, xx, yy, ck);
            cup.rotation.x = D90;
          }
        // harness strip along the root edge (back side)
        kit.mesh(box(0.03, h * 0.9, 0.006), P.gold(), part, mat, pv, 0.05, 0, ck - t / 2 - 0.003);
      }
      if (k < n) knuckle(pv, w, hk(k));
    }
    parent = pv;
  }

  const set = (d: number, driveAngle = 0) => {
    const a = smooth(0, 0.35, d);
    const b = smooth(0.3, 1, d);
    pivots[0].rotation.y = -D90 * (1 - a);
    for (let k = 1; k <= n; k++) {
      if (k === 1) pivots[1].rotation.y = Math.PI - D90 * a - D90 * b;
      else pivots[k].rotation.y = (k % 2 === 0 ? -Math.PI : Math.PI) * (1 - b);
    }
    drive.rotation.x = driveAngle;
    for (const r of rods) r.visible = d < 0.004;
  };
  set(0);
  return { root, set, stackDepth, span: xH + Ly + n * w };
}
