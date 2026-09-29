/**
 * Launch abort tower (body 'les'), 7.9 m from its feet on the capsule to the nose probe:
 * a four-leg truss from attach fittings on the upper backshell, the solid abort motor with
 * four nozzles canted 35 deg outward near the tower base (between the legs, so the jets clear
 * the capsule), a smaller jettison motor with two canted nozzles, and an ogive nose carrying
 * four canards and an air-data probe. Authored relative to the capsule nadir.
 */
import * as THREE from 'three';
import { ABORT_TOWER, CAPSULE } from '../../vehicle/spec';
import { OML, LES_FOOT_S } from './capsule';
import { cyl, DEG, rbox, strut, sweep, type Kit, type V2 } from './kit';
import { P } from './mats';

export interface LesBuilt {
  group: THREE.Group;
  /** Content group (hidden once the tower is gone in capsule-only views). */
  content: THREE.Group;
  nozzles: THREE.Vector3[];
  topY: number;
}

const TAG = ['launch-abort-system', 'cfrp-sandwich'] as const;
const TAGN = ['launch-abort-system', 'nickel-superalloy'] as const;

export function buildLes(kit: Kit, nadir: number): LesBuilt {
  const group = new THREE.Group();
  group.name = 'les';
  const content = new THREE.Group();
  content.position.y = nadir;
  group.add(content);
  const hangar = kit.hangar;
  const HA = CAPSULE.sidewallDeg * DEG;
  const [fr, fy] = OML.at(LES_FOOT_S);
  const footR = fr + 0.05 * Math.cos(HA);
  const footY = fy + 0.05 * Math.sin(HA);
  const len = ABORT_TOWER.length;
  const tipY = footY + len;
  const ringY = footY + 2.13;
  const ringR = 0.36;
  const legR = hangar ? 0.042 : 0.05;
  const seg = hangar ? 12 : 6;
  const legMat = P.graphite();

  // ── truss: four legs, a mid ring and X-bracing in both bays
  const feet: THREE.Vector3[] = [];
  const tops: THREE.Vector3[] = [];
  const mids: THREE.Vector3[] = [];
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    const f = new THREE.Vector3(Math.sin(a) * footR, footY, Math.cos(a) * footR);
    const t = new THREE.Vector3(Math.sin(a) * ringR, ringY, Math.cos(a) * ringR);
    feet.push(f);
    tops.push(t);
    mids.push(f.clone().lerp(t, 0.5));
    kit.mesh(strut(f, t, legR, seg), legMat, ...TAG, content);
    // foot clevis on the capsule fitting
    const clevis = kit.mesh(rbox(0.1, 0.12, 0.1, 0.015), P.ti(), ...TAG, content, f.x, f.y + 0.02, f.z);
    clevis.rotation.y = a;
  }
  for (let k = 0; k < 4; k++) {
    const j = (k + 1) % 4;
    kit.mesh(strut(mids[k], mids[j], legR * 0.7, seg), legMat, ...TAG, content);
    kit.mesh(strut(feet[k], mids[j], legR * 0.55, seg), legMat, ...TAG, content);
    kit.mesh(strut(mids[k], feet[j], legR * 0.55, seg), legMat, ...TAG, content);
    kit.mesh(strut(mids[k], tops[j], legR * 0.55, seg), legMat, ...TAG, content);
    kit.mesh(strut(tops[k], mids[j], legR * 0.55, seg), legMat, ...TAG, content);
  }
  kit.mesh(new THREE.TorusGeometry(ringR, 0.05, 10, kit.seg(48, 16)), legMat, ...TAG, content, 0, ringY, 0).rotation.x = Math.PI / 2;

  // ── abort motor: aft skirt, case, forward dome; four canted nozzles
  const mR = 0.38;
  const m0 = ringY - 0.02;
  const m1 = footY + 5.75;
  const cs = kit.seg(72, 24);
  const caseProf: V2[] = [
    [0.22, m0],
    [mR, m0 + 0.2],
    [mR, m1],
    [0.3, m1 + 0.12],
    [0.3, m1 + 0.2],
  ];
  kit.mesh(sweep(caseProf, false, { segs: cs, crease: 0.4 }).skin, P.white(), ...TAG, content);
  kit.mesh(cyl(0.22, 0.22, 0.02, cs), P.graphite(), ...TAG, content, 0, m0, 0);
  // graphite band and seam rings on the case
  kit.mesh(cyl(mR + 0.003, mR + 0.003, 0.5, cs, true), P.graphite(), ...TAG, content, 0, m1 - 0.35, 0);
  if (hangar) for (const y of [m0 + 1.2, m0 + 2.4]) kit.mesh(new THREE.TorusGeometry(mR + 0.002, 0.008, 6, cs), P.aluMilled(), ...TAG, content, 0, y, 0).rotation.x = Math.PI / 2;
  const nozzles: THREE.Vector3[] = [];
  const nozProf: V2[] = [
    [0.05, 0],
    [0.075, -0.06],
    [0.135, -0.38],
    [0.125, -0.38],
    [0.066, -0.06],
    [0.042, 0],
  ];
  const { skin: nozGeo } = sweep(nozProf, true, { segs: kit.seg(32, 12), crease: 0.8 });
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 + Math.PI / 4;
    const n = new THREE.Group();
    n.position.set(Math.sin(a) * 0.3, m0 + 0.18, Math.cos(a) * 0.3);
    n.rotation.set(0, a, 0, 'YXZ');
    n.rotateX(-35 * DEG);
    content.add(n);
    kit.mesh(nozGeo.clone(), P.inconel(), ...TAGN, n);
    kit.mesh(cyl(0.065, 0.065, 0.1, 16), P.inconel(), ...TAGN, n, 0, 0.04, 0);
    const exit = new THREE.Vector3(0, -0.38, 0);
    n.updateMatrix();
    exit.applyMatrix4(n.matrix);
    nozzles.push(exit.add(new THREE.Vector3(0, nadir, 0)));
  }
  kit.geos.add(nozGeo);

  // ── jettison motor with two canted nozzles
  const j0 = m1 + 0.2;
  const j1 = j0 + 0.75;
  kit.mesh(cyl(0.3, 0.3, j1 - j0, cs), P.white(), ...TAG, content, 0, (j0 + j1) / 2, 0);
  for (const a of [Math.PI / 2, -Math.PI / 2]) {
    const n = new THREE.Group();
    n.position.set(Math.sin(a) * 0.26, j0 + 0.15, Math.cos(a) * 0.26);
    n.rotation.set(0, a, 0, 'YXZ');
    n.rotateX(-30 * DEG);
    content.add(n);
    kit.mesh(
      sweep(
        [
          [0.03, 0],
          [0.07, -0.16],
          [0.064, -0.16],
          [0.025, -0.01],
        ],
        true,
        { segs: kit.seg(24, 10) },
      ).skin,
      P.inconel(),
      ...TAGN,
      n,
    );
  }

  // ── ogive nose with canards and the air-data probe
  const nL = tipY - 0.12 - j1;
  const nose: V2[] = [];
  const nn = hangar ? 18 : 8;
  const rho = (0.3 * 0.3 + nL * nL) / (2 * 0.3);
  for (let i = 0; i <= nn; i++) {
    const x = (nL * i) / nn;
    const r = Math.sqrt(Math.max(0, rho * rho - x * x)) + 0.3 - rho;
    nose.push([Math.max(0, r), j1 + x]);
  }
  kit.mesh(sweep(nose, false, { segs: cs, crease: 0.6 }).skin, P.white(), ...TAG, content);
  kit.mesh(cyl(0.302, 0.302, 0.12, cs, true), P.graphite(), ...TAG, content, 0, j1 + 0.06, 0);
  kit.mesh(cyl(0.012, 0.02, 0.14, 12), P.steel(), ...TAG, content, 0, tipY - 0.07, 0);
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    const y = j1 + nL * 0.45;
    const x = nL * 0.45;
    const r = Math.sqrt(rho * rho - x * x) + 0.3 - rho;
    const c = kit.mesh(rbox(0.012, 0.34, 0.1, 0.004, 1), P.graphite(), ...TAG, content, Math.sin(a) * (r + 0.012), y, Math.cos(a) * (r + 0.012));
    c.rotation.y = a + Math.PI / 2;
    c.rotateZ(-8 * DEG);
  }

  return { group, content, nozzles, topY: nadir + tipY };
}
