/**
 * Service module (body 'service'), 3.7 m diameter and 3.2 m tall, stacked from mountY:
 * a graphite adapter skirt (0 to 1.05 m) enclosing the hypergolic main engine's nozzle, the
 * equipment section (1.05 to 3.2 m) with white radiator panels over aluminised MLI, four RCS
 * quads, two 3-panel solar wings stowed on +/-X, and the crew-module adapter ring on top that
 * the capsule's heat-shield rim sits on. Section view: propellant tanks (two NTO, two MMH),
 * helium pressurant spheres, feed lines.
 */
import * as THREE from 'three';
import { SERVICE_MODULE } from '../../vehicle/spec';
import { buildWing, type Wing } from './arrays';
import { box, cyl, DEG, rbox, strut, sweep, tube, uvMetres, type Kit, type V2 } from './kit';
import { hatch, mli, MLI_REPEAT, P, radiator } from './mats';
import { pillTank } from './satparts';

export const SM_R = SERVICE_MODULE.diameter / 2;
export const SM_H = SERVICE_MODULE.length;

export interface ServiceBuilt {
  group: THREE.Group;
  engineExit: THREE.Vector3;
  exitRadius: number;
  rcs: THREE.Vector3[];
  pose(s: { smArrays: number; arrayDrive: number }): void;
}

export function buildServiceModule(kit: Kit, mountY: number): ServiceBuilt {
  const group = new THREE.Group();
  group.name = 'service';
  const sm = new THREE.Group();
  sm.position.y = mountY;
  group.add(sm);
  const hangar = kit.hangar;
  const segs = kit.seg(160, 48);
  const R = SM_R;
  const yS = 1.05; // skirt top / aft bulkhead
  const yT = SM_H; // top of the crew-module adapter ring

  // ── adapter skirt (graphite composite) with flanges
  kit.solid(
    sm,
    [
      [R - 0.02, 0.04],
      [R, 0.04],
      [R, yS],
      [R - 0.02, yS],
    ],
    segs,
    P.carbonSatin(),
    hatch('composite'),
    'service-module',
    'al-2219',
    { crease: 0.3 },
  );
  for (const [y0, y1] of [
    [0, 0.04],
    [yS - 0.03, yS + 0.01],
  ])
    kit.solid(
      sm,
      [
        [R - 0.07, y0],
        [R + 0.004, y0],
        [R + 0.004, y1],
        [R - 0.07, y1],
      ],
      segs,
      P.aluMilled(),
      hatch('metal'),
      'service-module',
      'al-2219',
      { crease: 0.3 },
    );
  // skirt stringers inside (visible through the open bottom and in section)
  if (hangar)
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2 + 0.07;
      const par = kit.at(sm, a);
      kit.mesh(box(0.04, yS - 0.08, 0.03), P.aluMilled(), 'service-module', 'al-2219', par, Math.sin(a) * (R - 0.035), yS / 2 + 0.02, Math.cos(a) * (R - 0.035)).rotation.y = a;
    }

  // ── aft bulkhead with the engine opening, gold MLI underneath
  kit.solid(
    sm,
    [
      [0.5, yS],
      [R - 0.02, yS],
      [R - 0.02, yS + 0.03],
      [0.5, yS + 0.03],
    ],
    segs,
    P.aluMilled(),
    hatch('metal'),
    'service-module',
    'al-2219',
    { crease: 0.3 },
  );
  const aftMli = kit.solid(
    sm,
    [
      [0.52, yS - 0.03],
      [R - 0.03, yS - 0.03],
      [R - 0.03, yS - 0.002],
      [0.52, yS - 0.002],
    ],
    segs,
    mli('gold'),
    hatch('insulation'),
    'mli-blankets',
    'mli',
    { crease: 0.3 },
  );
  for (const m of aftMli) uvMetres(m.geometry, 1 / MLI_REPEAT);
  // thrust cone from the bulkhead opening to the engine mount
  kit.solid(
    sm,
    [
      [0.5, yS + 0.03],
      [0.26, 2.25],
      [0.24, 2.25],
      [0.48, yS + 0.03],
    ],
    kit.seg(96, 32),
    P.aluMilled(),
    hatch('metal'),
    'service-module',
    'al-2219',
    { crease: 0.3 },
  );

  // ── equipment-section wall, aluminised MLI skin, crew-module adapter ring
  kit.solid(
    sm,
    [
      [R - 0.015, yS],
      [R, yS],
      [R, yT - 0.06],
      [R - 0.015, yT - 0.06],
    ],
    segs,
    P.aluMilled(),
    hatch('metal'),
    'service-module',
    'al-2219',
    { crease: 0.3 },
  );
  const skin = kit.solid(
    sm,
    [
      [R, yS + 0.02],
      [R + 0.01, yS + 0.02],
      [R + 0.01, yT - 0.08],
      [R, yT - 0.08],
    ],
    segs,
    mli('silver'),
    hatch('insulation'),
    'mli-blankets',
    'mli',
    { crease: 0.3 },
  );
  for (const m of skin) uvMetres(m.geometry, 1 / MLI_REPEAT);
  kit.solid(
    sm,
    [
      [R - 0.08, yT - 0.08],
      [R + 0.006, yT - 0.08],
      [R + 0.006, yT - 0.035],
      [R - 0.01, yT],
      [R - 0.08, yT],
    ],
    segs,
    P.aluMilled(),
    hatch('metal'),
    'service-module',
    'al-2219',
    { crease: 0.3 },
  );
  // forward deck under the heat shield (gold MLI on top)
  kit.solid(
    sm,
    [
      [0, 2.66],
      [R - 0.015, 2.66],
      [R - 0.015, 2.69],
      [0, 2.69],
    ],
    segs,
    mli('gold'),
    hatch('metal'),
    'mli-blankets',
    'mli',
    { crease: 0.3 },
  );

  // ── white radiator panels on stand-offs, avoiding the wing platforms and RCS quads
  const radMat = radiator();
  const panels: [number, number][] = [
    [-39, 39],
    [141, 219],
    [51, 69],
    [111, 129],
    [231, 249],
    [291, 309],
  ];
  for (const [d0, d1] of panels) {
    for (const [a, b] of splitDeg(d0, d1)) {
      const { skin: g, caps } = sweep(
        [
          [R + 0.012, 1.18],
          [R + 0.024, 1.18],
          [R + 0.024, 3.02],
          [R + 0.012, 3.02],
        ],
        true,
        { phi0: a * DEG, phi1: b * DEG, segs: Math.max(4, Math.round(((b - a) / 360) * segs)), caps: true, crease: 0.3, u: (phi) => phi * (R + 0.024), v: (p) => p[1] },
      );
      const par = kit.at(sm, ((a + b) / 2) * DEG);
      kit.mesh(g, radMat, 'service-module', 'al-2219', par);
      if (caps) kit.mesh(caps, P.aluMilled(), 'service-module', 'al-2219', par);
    }
  }

  // ── RCS quads (four nozzles each) on the equipment section
  const rcs: THREE.Vector3[] = [];
  for (const deg of [45, 135, 225, 315]) {
    const a = deg * DEG;
    const par = kit.at(sm, a);
    const pod = new THREE.Group();
    // the mounting plate's back face sits on the MLI skin (R + 0.01), not 7 mm off it
    pod.position.set(Math.sin(a) * (R + 0.012), 2.4, Math.cos(a) * (R + 0.012));
    pod.rotation.y = a;
    par.add(pod);
    kit.mesh(rbox(0.26, 0.36, 0.14, 0.03, 2), P.whitePaint(), 'attitude-thrusters', 'nickel-superalloy', pod, 0, 0, 0.07);
    kit.mesh(rbox(0.3, 0.4, 0.03, 0.01, 1), P.aluMilled(), 'attitude-thrusters', 'nickel-superalloy', pod, 0, 0, 0.012);
    const noz = (dir: THREE.Vector3, at: THREE.Vector3) => {
      const g = sweep(
        [
          [0.012, 0],
          [0.032, 0.07],
          [0.028, 0.07],
          [0.009, 0.004],
        ],
        true,
        { segs: kit.seg(16, 8) },
      ).skin;
      const m = kit.mesh(g, P.thruster(), 'attitude-thrusters', 'nickel-superalloy', pod);
      m.position.copy(at);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    };
    noz(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0.17, 0.08));
    noz(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, -0.17, 0.08));
    noz(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0.12, 0, 0.08));
    noz(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(-0.12, 0, 0.08));
    rcs.push(new THREE.Vector3(Math.sin(a) * (R + 0.2), mountY + 2.4, Math.cos(a) * (R + 0.2)));
  }

  // ── hypergolic main engine: gimbal, injector and valves, chamber, radiatively cooled nozzle
  const eng = new THREE.Group();
  sm.add(eng);
  const exitY = 0.95;
  const throatY = 1.9;
  const re = 0.36;
  const rt = 0.075;
  const noz: V2[] = [];
  const nN = hangar ? 18 : 8;
  for (let i = 0; i <= nN; i++) {
    const t = i / nN;
    const r = rt + (re - rt) * (1 - Math.pow(1 - t, 1.7));
    noz.push([r, throatY - (throatY - exitY) * t]);
  }
  const nozIn = noz.map(([r, y]) => [r - 0.006, y] as V2);
  // the chamber and the radiatively cooled niobium (C103) nozzle run hot (thermal lens class 3)
  kit.mesh(sweep([...noz, ...[...nozIn].reverse()], true, { segs: kit.seg(72, 24), crease: 1.2 }).skin, P.thruster(), 'service-module', 'niobium-c103', eng).userData.thermal = 3;
  if (hangar) for (const t of [0.35, 0.7, 0.98]) {
    const y = throatY - (throatY - exitY) * t;
    const r = rt + (re - rt) * (1 - Math.pow(1 - t, 1.7));
    kit.mesh(new THREE.TorusGeometry(r + 0.004, 0.008, 6, kit.seg(72, 24)), P.niobium(), 'service-module', 'niobium-c103', eng, 0, y, 0).rotation.x = Math.PI / 2;
  }
  const chamber: V2[] = [
    [rt, throatY],
    [0.13, throatY + 0.1],
    [0.13, throatY + 0.26],
    [0.1, throatY + 0.3],
    [0, throatY + 0.32],
  ];
  // fuel-cooled chamber and the injector head (steel): no titanium in the engine itself
  kit.mesh(sweep(chamber, false, { segs: kit.seg(48, 16) }).skin, P.inconel(), 'service-module', 'stainless', eng).userData.thermal = 3;
  kit.mesh(cyl(0.16, 0.16, 0.06, kit.seg(40, 14)), P.steel(), 'service-module', 'stainless', eng, 0, throatY + 0.35, 0);
  if (hangar) {
    for (const [x, z] of [
      [0.2, 0.08],
      [-0.2, -0.08],
    ])
      kit.mesh(rbox(0.12, 0.14, 0.1, 0.015), P.steel(), 'service-module', 'stainless', eng, x, throatY + 0.4, z);
    for (const a of [0, Math.PI / 2]) kit.mesh(strut(new THREE.Vector3(Math.sin(a) * 0.14, throatY + 0.2, Math.cos(a) * 0.14), new THREE.Vector3(Math.sin(a) * 0.3, 2.2, Math.cos(a) * 0.3), 0.018, 8), P.steel(), 'service-module', 'stainless', eng);
  }

  // ── two solar wings on flat platforms at +/-X
  const wings: Wing[] = [];
  const wy = 2.0;
  for (const sx of [1, -1]) {
    const plat = kit.mesh(rbox(0.1, 1.9, 1.34, 0.015, 2), P.aluMilled(), 'service-module', 'al-2219', sm, sx * (R + 0.035), wy, 0);
    void plat;
    const w = buildWing(kit, { panels: 3, w: 1.25, h: 1.7, standoff: 0.05 });
    w.root.position.set(sx * (R + 0.085), wy, 0);
    if (sx < 0) w.root.scale.x = -1;
    sm.add(w.root);
    wings.push(w);
  }

  // ── interior: propellant tanks, pressurant spheres, feed lines
  const inner = kit.inside(sm);
  if (inner) {
    for (const deg of [45, 135, 225, 315]) {
      const a = deg * DEG;
      pillTank(kit, inner, 0.4, 0.66, Math.sin(a) * 1.08, 1.9, Math.cos(a) * 1.08, 'service-module', 'titanium');
      kit.mesh(tube([new THREE.Vector3(Math.sin(a) * 1.0, 1.2, Math.cos(a) * 1.0), new THREE.Vector3(Math.sin(a) * 0.6, 1.35, Math.cos(a) * 0.6), new THREE.Vector3(Math.sin(a) * 0.25, 2.2, Math.cos(a) * 0.25)], 0.025, 8), P.ti(), 'service-module', 'titanium', inner);
    }
    for (const deg of [0, 180]) {
      const a = deg * DEG;
      // helium pressurant spheres (titanium, as tagged)
      kit.mesh(new THREE.SphereGeometry(0.26, 32, 16), P.ti(), 'service-module', 'titanium', inner, Math.sin(a) * 1.25, 2.3, Math.cos(a) * 1.25);
    }
    for (const deg of [90, 270]) {
      const a = deg * DEG;
      kit.mesh(rbox(0.4, 0.3, 0.3, 0.02), P.boxGrey(), 'service-module', 'al-2219', inner, Math.sin(a) * 1.5, 1.5, Math.cos(a) * 1.5).rotation.y = a;
    }
  }

  return {
    group,
    engineExit: new THREE.Vector3(0, mountY + exitY, 0),
    exitRadius: re,
    rcs,
    pose(s) {
      for (const w of wings) w.set(s.smArrays, s.arrayDrive);
    },
  };
}

function splitDeg(a: number, b: number): [number, number][] {
  const out: [number, number][] = [];
  let s = a;
  for (const c of [0, 90, 360, 450, -360, -270].filter((c) => c > a + 1e-6 && c < b - 1e-6).sort((x, y) => x - y)) {
    out.push([s, c]);
    s = c;
  }
  out.push([s, b]);
  return out;
}
