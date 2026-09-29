/**
 * Mechanisms: the gimbal (a universal joint: fixed upper yoke, cross block turning in pitch,
 * lower yoke carrying the engine in yaw), the two TVC actuators at 90 degrees (hydraulic
 * cylinders from stage-side clevises to lugs on the chamber, re-posed every update so they
 * stay attached and visibly extend or retract), and the gimbal bellows in the propellant
 * feed ducts (between flanges on the stage side and on the engine side).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Design } from './design';
import { BACK, FRONT, FULL, bellowsLoop, hexBolt, merge, revolve, ringOf, roundPoly, type V2 } from './geo';
import type { Kit, Tag, Thermal } from './kit';
import { HE_UNION_DROP, TP, routes } from './layout';
import { MATERIAL_OF, type MaterialSet } from './mats';
import type { EngineDetail } from './types';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export interface Mechanisms {
  meshes: THREE.Mesh[];
  update(cross: THREE.Object3D, gimbal: THREE.Object3D): void;
  setCut(slide: number, fade: number): void;
  dispose(): void;
}

function tag(m: THREE.Mesh, part: Tag['part'], mat: Tag['mat'], thermal: Thermal = 1) {
  m.userData.part = part;
  m.userData.thermal = thermal;
  const id = MATERIAL_OF[mat];
  if (id) m.userData.material = id;
  m.name = `${part}:${mat}:dynamic`;
}

/** A lug plate with a rounded end around a pin (in a plane), extruded along `thickAxis`. */
function lug(width: number, len: number, th: number, pinR: number, fine = true): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-width / 2, len);
  s.lineTo(width / 2, len);
  s.lineTo(width / 2, 0);
  s.absarc(0, 0, width / 2, 0, Math.PI, true);
  s.lineTo(-width / 2, len);
  const hole = new THREE.Path();
  hole.absarc(0, 0, pinR, 0, Math.PI * 2, false);
  s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth: th, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002, bevelSegments: fine ? 2 : 1, curveSegments: fine ? 10 : 5 });
  g.translate(0, 0, -th / 2);
  return g;
}

export function buildMechanisms(k: Kit, d: Design, detail: EngineDetail, _segs: number, mats: MaterialSet): Mechanisms {
  const hangar = detail === 'hangar';
  const G: Tag = { part: 'tvc-actuators', mat: 'gimbal' };
  const s = hangar ? 48 : 20;

  // ── gimbal: mount pad and upper yoke (fixed), cross (pitch), lower yoke (engine) ──
  const pad = new RoundedBoxGeometry(0.26, 0.03, 0.26, 3, 0.006);
  pad.translate(0, 0.115, 0);
  k.add(pad, { ...G, node: 'fixed' });
  if (detail !== 'cluster') {
    const bolt = hexBolt(0.018, 0.016);
    for (const [px, pz] of [
      [0.1, 0.1],
      [-0.1, 0.1],
      [0.1, -0.1],
      [-0.1, -0.1],
      [0, 0.1],
      [0, -0.1],
      [0.1, 0],
      [-0.1, 0],
    ])
      k.add(bolt.clone().translate(px, 0.13, pz), { ...G, mat: 'steel', node: 'fixed', front: k.section && pz > 0 });
    bolt.dispose();
    for (const sx of [-1, 1]) {
      const l = lug(0.095, 0.1, 0.022, 0.0225, hangar);
      l.rotateY(Math.PI / 2);
      l.translate(sx * 0.068, 0, 0);
      k.add(l, { ...G, node: 'fixed' });
      const l2 = lug(0.095, 0.08, 0.022, 0.0225, hangar);
      l2.rotateZ(Math.PI);
      l2.translate(0, 0, sx * 0.068);
      k.add(l2, { ...G, node: 'gimbal' });
    }
  }
  const block = new RoundedBoxGeometry(0.086, 0.086, 0.086, 3, 0.01);
  k.add(block, { ...G, node: 'cross' });
  for (const axis of ['x', 'z'] as const) {
    const pin = new THREE.CylinderGeometry(0.0215, 0.0215, 0.19, 24);
    if (axis === 'x') pin.rotateZ(Math.PI / 2);
    else pin.rotateX(Math.PI / 2);
    k.add(pin, { ...G, mat: 'chrome', node: 'cross' });
    if (detail !== 'cluster')
      for (const sgn of [-1, 1]) {
        const nut = new THREE.CylinderGeometry(0.03, 0.03, 0.014, 6);
        if (axis === 'x') nut.rotateZ(Math.PI / 2).translate(sgn * 0.089, 0, 0);
        else nut.rotateX(Math.PI / 2).translate(0, 0, sgn * 0.089);
        k.add(nut, { ...G, mat: 'steel', node: 'cross', front: k.section && axis === 'z' && sgn > 0 });
      }
  }
  // lower yoke base plate on the dome boss
  const base = new THREE.CylinderGeometry(0.09, 0.09, 0.016, 40);
  base.translate(0, -0.087, 0);
  k.add(base, G);
  if (detail !== 'cluster') {
    for (const sz of [-1, 1]) {
      const web = new RoundedBoxGeometry(0.095, 0.02, 0.022, 2, 0.004);
      web.translate(0, -0.075, sz * 0.068);
      k.add(web, { ...G, front: k.section && sz > 0 });
    }
  }

  // ── actuator geometry (built along -Y from the upper eye at the origin; rod along +Y) ──
  const { rA, yA, rB, yB, phis } = d.tvc;
  const acts = phis.map((phi) => {
    const radial = V(Math.sin(phi), 0, Math.cos(phi));
    const A = radial.clone().multiplyScalar(rA).setY(yA);
    const B = radial.clone().multiplyScalar(rB).setY(yB);
    const t = V(Math.cos(phi), 0, -Math.sin(phi)); // clevis pin axis (tangential)
    return { phi, A, B, t };
  });
  // fixed arms from the mount pad to the upper clevises, and the clevis brackets
  for (const a of acts) {
    const from = V(Math.sin(a.phi) * 0.14, 0.115, Math.cos(a.phi) * 0.14);
    const to = a.A.clone().setY(0.115);
    const len = from.distanceTo(to);
    const arm = new RoundedBoxGeometry(0.045, 0.03, len + 0.04, 2, 0.005);
    arm.lookAt(to.clone().sub(from));
    arm.translate((from.x + to.x) / 2, 0.115, (from.z + to.z) / 2);
    const front = k.section && a.A.z > 0;
    k.add(arm, { ...G, node: 'fixed', front });
    if (detail !== 'cluster')
      for (const sgn of [-1, 1]) {
        const l = lug(0.05, 0.045, 0.012, 0.012, hangar);
        // plate normal along the pin axis t
        l.lookAt(a.t);
        l.translate(a.A.x + a.t.x * sgn * 0.024, a.A.y, a.A.z + a.t.z * sgn * 0.024);
        k.add(l, { ...G, node: 'fixed', front });
      }
    // lower clevis lugs on the chamber attach band (engine side)
    if (detail !== 'cluster') {
      const rBand = d.rc + d.tw + d.hc + d.tj + 0.006;
      const radial = V(Math.sin(a.phi), 0, Math.cos(a.phi));
      for (const sgn of [-1, 1]) {
        const len = rB - rBand;
        const l = new RoundedBoxGeometry(len + 0.03, 0.05, 0.012, 2, 0.004);
        const q = new THREE.Quaternion().setFromUnitVectors(V(1, 0, 0), radial);
        l.applyQuaternion(q);
        const mid = radial.clone().multiplyScalar(rBand + len / 2);
        l.translate(mid.x + a.t.x * sgn * 0.024, yB, mid.z + a.t.z * sgn * 0.024);
        k.add(l, { ...G, front: k.section && a.B.z > 0 });
      }
      const pin = new THREE.CylinderGeometry(0.009, 0.009, 0.066, 16);
      pin.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), a.t));
      pin.translate(a.B.x, a.B.y, a.B.z);
      k.add(pin, { ...G, mat: 'chrome', front: k.section && a.B.z > 0 });
      const pin2 = pin.clone().translate(a.A.x - a.B.x, a.A.y - a.B.y, a.A.z - a.B.z);
      k.add(pin2, { ...G, mat: 'chrome', node: 'fixed', front: k.section && a.A.z > 0 });
    }
  }

  const meshes: THREE.Mesh[] = [];
  const owned: THREE.BufferGeometry[] = [];
  const restLen = acts[0].A.distanceTo(acts[0].B);
  const barrelLen = restLen * 0.62;
  const rodLen = restLen * 0.64;
  const sAct = hangar ? 24 : 12;
  const lathe = (pts: V2[]) => revolve([{ pts: roundPoly(pts, 0.002, 2) }], FULL[0], FULL[1], sAct).surf!;
  // barrel assembly: eye, end cap, cylinder, gland; servo valve block and position sensor
  const barrelParts: THREE.BufferGeometry[] = [
    lathe([
      [0.0005, -0.03],
      [0.03, -0.03],
      [0.045, -0.045],
      [0.045, -0.07],
      [0.037, -0.074],
      [0.037, -barrelLen + 0.03],
      [0.044, -barrelLen + 0.026],
      [0.044, -barrelLen],
      [0.02, -barrelLen],
      [0.0005, -barrelLen],
    ]),
  ];
  const eye = new THREE.CylinderGeometry(0.019, 0.019, 0.034, 24);
  eye.rotateZ(Math.PI / 2);
  const neck = new THREE.CylinderGeometry(0.014, 0.018, 0.035, 16);
  neck.translate(0, -0.02, 0);
  barrelParts.push(eye, neck);
  if (detail !== 'cluster') {
    const valve = new RoundedBoxGeometry(0.05, 0.075, 0.04, 2, 0.005);
    valve.translate(0, -0.13, 0.052);
    const lvdt = new THREE.CylinderGeometry(0.0095, 0.0095, barrelLen * 0.62, 16);
    lvdt.translate(-0.048, -barrelLen * 0.52, 0);
    const clamp = new THREE.BoxGeometry(0.02, 0.012, 0.012);
    clamp.translate(-0.042, -barrelLen * 0.3, 0);
    const clamp2 = clamp.clone().translate(0, -barrelLen * 0.4, 0);
    const port1 = new THREE.CylinderGeometry(0.008, 0.008, 0.03, 12);
    port1.rotateX(Math.PI / 2);
    port1.translate(0.012, -0.12, 0.085);
    const port2 = port1.clone().translate(-0.024, 0, 0);
    barrelParts.push(valve, lvdt, clamp, clamp2, port1, port2);
  }
  const rodParts: THREE.BufferGeometry[] = [
    lathe([
      [0.0005, 0.018],
      [0.017, 0.022],
      [0.017, 0.05],
      [0.0162, 0.052],
      [0.0162, rodLen],
      [0.0005, rodLen],
    ]),
  ];
  const reye = new THREE.CylinderGeometry(0.021, 0.021, 0.034, 24);
  reye.rotateZ(Math.PI / 2);
  const ball = new THREE.SphereGeometry(0.014, 16, 10);
  rodParts.push(reye, ball);
  const barrelGeo = merge(barrelParts);
  const rodGeo = merge(rodParts);
  owned.push(barrelGeo, rodGeo);

  const frontActs = k.section; // actuators sit in front of the section plane
  const barrels = new THREE.InstancedMesh(barrelGeo, mats.get('actuator', frontActs ? 'front' : 'keep'), acts.length);
  const rods = new THREE.InstancedMesh(rodGeo, mats.get('chrome', frontActs ? 'front' : 'keep'), acts.length);
  tag(barrels, 'tvc-actuators', 'actuator');
  tag(rods, 'tvc-actuators', 'chrome');
  for (const m of [barrels, rods]) {
    m.frustumCulled = false;
    m.userData.front = frontActs;
    meshes.push(m);
  }

  // ── gimbal bellows in the feed ducts (unit bellows scaled per duct) and stage-side flanges ──
  const bel = [
    { x: d.tpX, z: 0, r: TP.loxDuctR },
    { x: d.tpX, z: TP.fuelDuctZ, r: TP.fuelDuctR },
  ];
  const [b0, b1] = TP.bellowsY;
  const unitLoop = bellowsLoop(1, 1, 9, 0.16, 0.035, hangar ? 6 : 3);
  const bellowsBack = hangar ? merge([revolve([unitLoop], BACK[0], BACK[1], 40, { caps: true }).surf]) : null;
  const bellowsFront = hangar ? merge([revolve([unitLoop], FRONT[0], FRONT[1], 40, { caps: true }).surf]) : null;
  const bellowsFull = !hangar && detail !== 'cluster' ? merge([revolve([unitLoop], FULL[0], FULL[1], 16).surf]) : null;
  /** Instanced bellows: which duct each instance shows and whether it leaves with the front half. */
  const bellowMeshes: { mesh: THREE.InstancedMesh; ids: number[]; slides: boolean }[] = [];
  if (bellowsBack && bellowsFront) {
    bellowMeshes.push(
      { mesh: new THREE.InstancedMesh(bellowsBack, mats.get('steel', 'keep'), 1), ids: [0], slides: false },
      { mesh: new THREE.InstancedMesh(bellowsBack, mats.get('steel', 'front'), 1), ids: [1], slides: true },
      { mesh: new THREE.InstancedMesh(bellowsFront, mats.get('steel', 'front'), 2), ids: [0, 1], slides: true },
    );
    owned.push(bellowsBack, bellowsFront);
  } else if (bellowsFull) {
    bellowMeshes.push({ mesh: new THREE.InstancedMesh(bellowsFull, mats.get('steel', 'keep'), 2), ids: [0, 1], slides: false });
    owned.push(bellowsFull);
  }
  for (const b of bellowMeshes) {
    // the LOX bellows (instance 0) is cryogenic; a mesh holding only the fuel bellows is ambient
    tag(b.mesh, 'engine', 'steel', b.ids.includes(0) ? 0 : 1);
    b.mesh.frustumCulled = false;
    b.mesh.userData.front = b.slides;
    meshes.push(b.mesh);
  }
  // helium hoses: braided flexible lines from the unions on the engine (see plumbing.ts) up to
  // bulkhead fittings at the stage interface, re-posed like the bellows so they stay attached
  const heEnds = detail === 'cluster' ? [] : routes(d).helium.map((h) => h[h.length - 1]);
  const heLo = heEnds.map((e) => V(e.x, e.y + 0.016, e.z));
  const heHi = heEnds.map((e) => V(e.x, d.topY - 0.02, e.z));
  let hoses: THREE.InstancedMesh | null = null;
  if (heEnds.length) {
    const hose = new THREE.CylinderGeometry(0.0082, 0.0082, 1, hangar ? 12 : 8, 1, true);
    hose.translate(0, 0.5, 0);
    owned.push(hose);
    hoses = new THREE.InstancedMesh(hose, mats.get('braid', 'keep'), heEnds.length);
    tag(hoses, 'engine', 'braid');
    hoses.frustumCulled = false;
    meshes.push(hoses);
    for (const e of heHi) {
      const fit = new THREE.CylinderGeometry(0.012, 0.012, 0.02, 6);
      fit.translate(e.x, e.y + 0.01, e.z);
      k.add(fit, { part: 'engine', mat: 'steel', node: 'fixed' });
    }
  }

  // stage-side flange, spool and interface flange above each bellows (fixed)
  for (const [i, b] of bel.entries()) {
    const t: Tag = { part: 'engine', mat: 'stainless', node: 'fixed', front: k.section && b.z > 0.01, thermal: i === 0 ? 0 : 1 };
    const c = V(b.x, 0, b.z);
    const prof: V2[] = roundPoly(
      [
        [b.r - 0.004, b1 - 0.004],
        [b.r + 0.022, b1 - 0.004],
        [b.r + 0.022, b1 + 0.012],
        [b.r + 0.002, b1 + 0.016],
        [b.r + 0.002, d.topY - 0.018],
        [b.r + 0.024, d.topY - 0.018],
        [b.r + 0.024, d.topY],
        [b.r - 0.004, d.topY],
      ],
      (j) => (j === 1 || j === 2 || j === 5 || j === 6 ? 0.002 : 0),
      2,
    );
    if (detail === 'cluster') continue;
    if (k.section && i === 0) {
      k.sweep(revolve([{ pts: prof }], BACK[0], BACK[1], s, { caps: true, centre: c }), { ...t, front: false });
      k.sweep(revolve([{ pts: prof }], FRONT[0], FRONT[1], s, { caps: true, centre: c }), { ...t, front: true });
    } else k.add(revolve([{ pts: prof }], FULL[0], FULL[1], s, { centre: c }).surf, t);
    // engine-side bellows flange ring
    const low: V2[] = roundPoly(
      [
        [b.r - 0.004, b0 - 0.012],
        [b.r + 0.02, b0 - 0.012],
        [b.r + 0.02, b0 + 0.004],
        [b.r - 0.004, b0 + 0.004],
      ],
      0.002,
      2,
    );
    const tl: Tag = { part: 'engine', mat: 'stainless', front: k.section && b.z > 0.01, thermal: i === 0 ? 0 : 1 };
    if (k.section && i === 0) {
      k.sweep(revolve([{ pts: low }], BACK[0], BACK[1], s, { caps: true, centre: c }), tl);
      k.sweep(revolve([{ pts: low }], FRONT[0], FRONT[1], s, { caps: true, centre: c }), { ...tl, front: true });
    } else k.add(revolve([{ pts: low }], FULL[0], FULL[1], s, { centre: c }).surf, tl);
    if (hangar) {
      const bolt = hexBolt(0.012, 0.011);
      const nut = bolt.clone().rotateX(Math.PI);
      // the LOX duct flanges are cut in half by the section: their bolts split with them
      const rings = (f?: (p: THREE.Vector3) => boolean) => [
        ringOf(bolt, 12, b.r + 0.012, { centre: V(b.x, b1 + 0.012, b.z), filter: f }),
        // interface flange: the nuts sit under it (the bolt heads are on the stage side)
        ringOf(nut, 12, b.r + 0.014, { centre: V(b.x, d.topY - 0.018, b.z), phase: Math.PI / 12, filter: f }),
      ];
      if (k.section && i === 0) {
        for (const g of rings((p) => p.z <= 0)) k.add(g, { ...t, front: false });
        for (const g of rings((p) => p.z > 0)) k.add(g, { ...t, front: true });
      } else for (const g of rings()) k.add(g, t);
      bolt.dispose();
      nut.dispose();
    }
  }

  // ── runtime (no allocation: runs every frame while a demonstration plays) ──
  const tmp = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = V(1, 1, 1);
  const B = new THREE.Vector3();
  const P = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const basisX = new THREE.Vector3();
  const basisY = new THREE.Vector3();
  const basisZ = new THREE.Vector3();
  const rot = new THREE.Matrix4();
  const yawM = new THREE.Matrix4();
  const up = V(0, 1, 0);
  const hoseScale = V(1, 1, 1);
  let slide = 0;
  const engineMatrix = new THREE.Matrix4();
  const inst = bel.map(() => ({ lo: new THREE.Vector3(), q: new THREE.Quaternion(), scale: new THREE.Vector3() }));
  const update = (cross: THREE.Object3D, gimbal: THREE.Object3D) => {
    // engine pose relative to root: cross (pitch) * gimbal (yaw)
    engineMatrix.makeRotationFromEuler(cross.rotation).multiply(yawM.makeRotationFromEuler(gimbal.rotation));
    for (let i = 0; i < acts.length; i++) {
      const a = acts[i];
      B.copy(a.B).applyMatrix4(engineMatrix);
      dir.copy(B).sub(a.A).normalize();
      // basis: local Y = from B to A (rod direction), local X = clevis pin axis
      basisY.copy(dir).negate();
      basisX.copy(a.t).addScaledVector(basisY, -a.t.dot(basisY)).normalize();
      basisZ.crossVectors(basisX, basisY);
      rot.makeBasis(basisX, basisY, basisZ);
      q.setFromRotationMatrix(rot);
      tmp.compose(P.set(a.A.x, a.A.y, a.A.z + slide), q, one);
      barrels.setMatrixAt(i, tmp);
      tmp.compose(P.set(B.x, B.y, B.z + slide), q, one);
      rods.setMatrixAt(i, tmp);
    }
    barrels.instanceMatrix.needsUpdate = true;
    rods.instanceMatrix.needsUpdate = true;
    // bellows: from the engine-side flange (moves) to the stage-side flange (fixed)
    for (let i = 0; i < bel.length; i++) {
      const b = bel[i];
      const it = inst[i];
      it.lo.set(b.x, b0, b.z).applyMatrix4(engineMatrix);
      dir.set(b.x, b1, b.z).sub(it.lo);
      const len = dir.length();
      it.q.setFromUnitVectors(up, dir.multiplyScalar(1 / len));
      it.scale.set(b.r, len, b.r);
    }
    if (hoses) {
      for (let i = 0; i < heLo.length; i++) {
        P.copy(heLo[i]).applyMatrix4(engineMatrix);
        dir.copy(heHi[i]).sub(P);
        const len = dir.length();
        q.setFromUnitVectors(up, dir.multiplyScalar(1 / len));
        tmp.compose(P, q, hoseScale.set(1, len, 1));
        hoses.setMatrixAt(i, tmp);
      }
      hoses.instanceMatrix.needsUpdate = true;
    }
    for (const bm of bellowMeshes) {
      for (let j = 0; j < bm.ids.length; j++) {
        const it = inst[bm.ids[j]];
        tmp.compose(P.set(it.lo.x, it.lo.y, it.lo.z + (bm.slides ? slide : 0)), it.q, it.scale);
        bm.mesh.setMatrixAt(j, tmp);
      }
      bm.mesh.instanceMatrix.needsUpdate = true;
    }
  };
  let lastCross: THREE.Object3D | null = null;
  let lastGimbal: THREE.Object3D | null = null;
  return {
    meshes,
    update(cross, gimbal) {
      lastCross = cross;
      lastGimbal = gimbal;
      update(cross, gimbal);
    },
    setCut(sl, fade) {
      slide = sl;
      for (const m of meshes) if (m.userData.front) m.visible = fade > 0.004;
      if (lastCross && lastGimbal) update(lastCross, lastGimbal);
    },
    dispose() {
      for (const g of owned) g.dispose();
    },
  };
}
