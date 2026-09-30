/**
 * An original orbital station (body 'station'), authored about its centre in a local-vertical
 * frame: +Y zenith, +X along the velocity, Z cross-track. About 57 m across the arrays.
 *
 * Pressurized modules in a row along X (laboratory forward, habitat aft, a propulsion module at
 * the aft end) joined by a central node; an airlock on the node's +Z side; the capsule docking
 * port faces nadir (-Y) at the node, on a conical adapter. A zenith pylon carries a 54 m
 * cross-track truss with two rotary joints, four array wings (fore and aft at each end),
 * two radiator wings and antennas.
 */
import * as THREE from 'three';
import { box, cyl, DEG, rbox, strut, sweep, uvMetres, type Kit, type V2 } from './kit';
import { emptyAnchors, type Built, type SCState } from './model';
import { cells, hatch, mli, P, panelBack, quilt, radiator } from './mats';
import { dish } from './satparts';
import { CELL_TILE } from './textures';

const T_MOD = ['station', 'al-2219'] as const;
const T_MLI = ['station', 'mli'] as const;
const T_ARR = ['station', 'cfrp-sandwich'] as const;

export function buildStation(kit: Kit): Built {
  const body = new THREE.Group();
  body.name = 'station';
  const hangar = kit.hangar;
  const segs = kit.seg(96, 32);

  // modules are swept about local Y, then turned so local Y is world +X (section wedge on -Y/+Z)
  const along = (x0: number) => {
    const g = new THREE.Group();
    g.rotation.z = -Math.PI / 2;
    g.position.x = x0;
    body.add(g);
    return g;
  };
  const module = (x0: number, len: number, r: number, endR: number, interior: boolean) => {
    const g = along(x0);
    const e = 0.8;
    const t = 0.03;
    // pressure shell with conical end domes to the berthing rings (local y from 0 to len)
    const shell: V2[] = [
      [endR, -0.02],
      [r * 0.72, e * 0.55],
      [r, e],
      [r, len - e],
      [r * 0.72, len - e * 0.55],
      [endR, len + 0.02],
      [endR - t, len + 0.02],
      [r * 0.72 - t, len - e * 0.55],
      [r - t, len - e],
      [r - t, e],
      [r * 0.72 - t, e * 0.55],
      [endR - t, -0.02],
    ];
    kit.solid(g, shell, segs, P.aluMilled(), hatch('metal'), ...T_MOD, { crease: 0.3 });
    // micrometeoroid shield blanket over the cylinder (quilted beta cloth)
    const blanket: V2[] = [
      [r + 0.02, e + 0.05],
      [r + 0.1, e + 0.05],
      [r + 0.1, len - e - 0.05],
      [r + 0.02, len - e - 0.05],
    ];
    const bl = kit.solid(g, blanket, segs, quilt(), hatch('insulation'), ...T_MLI, { crease: 0.3, u: (phi) => (phi * (r + 0.1)) / 0.5, v: (p) => p[1] / 0.5 });
    void bl;
    // ring frames showing through as shallow ribs, berthing rings
    for (const y of [e + 0.02, len - e - 0.02]) kit.solid(g, [[r + 0.1, y - 0.05], [r + 0.14, y - 0.05], [r + 0.14, y + 0.05], [r + 0.1, y + 0.05]], segs, P.aluMilled(), hatch('metal'), ...T_MOD, { crease: 0.3 });
    for (const y of [-0.02, len + 0.02]) kit.solid(g, [[endR - 0.05, y - 0.12], [endR + 0.08, y - 0.12], [endR + 0.08, y + 0.12], [endR - 0.05, y + 0.12]], segs, P.aluMilled(), hatch('metal'), ...T_MOD, { crease: 0.3 });
    // handrails along the top and bottom
    if (hangar)
      for (const a of [0, Math.PI, Math.PI / 2]) {
        const rr = r + 0.18;
        for (let k = 0; k < Math.floor((len - 2 * e) / 1.2); k++) {
          const y = e + 0.4 + k * 1.2;
          const par = kit.at(g, a);
          kit.mesh(strut(new THREE.Vector3(Math.sin(a) * rr, y, Math.cos(a) * rr), new THREE.Vector3(Math.sin(a) * rr, y + 0.7, Math.cos(a) * rr), 0.015, 6), P.gold(), ...T_MOD, par);
          for (const yy of [y, y + 0.7]) kit.mesh(strut(new THREE.Vector3(Math.sin(a) * (r + 0.1), yy, Math.cos(a) * (r + 0.1)), new THREE.Vector3(Math.sin(a) * rr, yy, Math.cos(a) * rr), 0.012, 6), P.gold(), ...T_MOD, par);
        }
      }
    // interior racks (section view): four walls of rack faces around a square aisle
    const inner = interior ? kit.inside(g) : null;
    if (inner) {
      const a = 0.95;
      for (let k = 0; k < 4; k++) {
        const ang = (k * Math.PI) / 2 + Math.PI / 4;
        const rg = new THREE.Group();
        rg.rotation.y = ang;
        inner.add(rg);
        for (let y = e + 0.2; y < len - e - 1.0; y += 1.05) {
          kit.mesh(box(1.3, 1.0, 0.7), P.whitePaint(), ...T_MOD, rg, 0, y + 0.5, a + 0.35);
          kit.mesh(box(1.2, 0.9, 0.02), P.boxGrey(), ...T_MOD, rg, 0, y + 0.5, a - 0.005);
          kit.mesh(box(0.3, 0.2, 0.03), P.display(), ...T_MOD, rg, 0.3, y + 0.6, a - 0.02);
        }
      }
    }
    return g;
  };

  // node at the centre (short, fat, with six ports)
  const nodeR = 2.2;
  const node = along(-2.5);
  kit.solid(
    node,
    [
      [1.05, -0.02],
      [nodeR * 0.8, 0.45],
      [nodeR, 0.9],
      [nodeR, 4.1],
      [nodeR * 0.8, 4.55],
      [1.05, 5.02],
      [1.02, 5.02],
      [nodeR * 0.8 - 0.03, 4.55],
      [nodeR - 0.03, 4.1],
      [nodeR - 0.03, 0.9],
      [nodeR * 0.8 - 0.03, 0.45],
      [1.02, -0.02],
    ],
    segs,
    P.aluMilled(),
    hatch('metal'),
    ...T_MOD,
    { crease: 0.3 },
  );
  const nb = kit.solid(node, [[nodeR + 0.02, 0.95], [nodeR + 0.1, 0.95], [nodeR + 0.1, 4.05], [nodeR + 0.02, 4.05]], segs, quilt(), hatch('insulation'), ...T_MLI, { crease: 0.3, u: (phi) => (phi * (nodeR + 0.1)) / 0.5, v: (p) => p[1] / 0.5 });
  void nb;

  const lab = module(2.5, 11, 2.1, 1.05, true);
  const hab = module(-13.5, 11, 2.1, 1.05, true);
  void lab;
  void hab;
  // propulsion module at the aft end: engines, radiator fins
  const prop = along(-19.6);
  kit.solid(prop, [[0.9, 0], [1.6, 0.6], [1.6, 5.6], [1.05, 6.1], [1.02, 6.1], [1.57, 5.6], [1.57, 0.6], [0.87, 0]], segs, P.aluMilled(), hatch('metal'), ...T_MOD, { crease: 0.3 });
  kit.solid(prop, [[1.6, 0.7], [1.66, 0.7], [1.66, 5.5], [1.6, 5.5]], segs, mli('gold'), hatch('insulation'), ...T_MLI, { crease: 0.3, u: (phi) => phi * 1.66 / 0.6, v: (p) => p[1] / 0.6 });
  for (const z of [-0.45, 0.45]) {
    const noz = sweep(
      [
        [0.08, 0],
        [0.26, -0.55],
        [0.245, -0.55],
        [0.07, -0.01],
      ],
      true,
      { segs: kit.seg(32, 12) },
    ).skin;
    kit.mesh(noz, P.thruster(), ...T_MOD, prop, z, 0.02, 0);
  }
  for (const sz of [-1, 1]) {
    const fin = kit.mesh(box(0.05, 3.6, 2.2), radiator(), ...T_ARR, prop, 0, 3.1, sz * 2.75);
    uvMetres(fin.geometry, 1);
    kit.mesh(box(0.08, 0.3, 1.2), P.aluMilled(), ...T_MOD, prop, 0, 3.1, sz * 1.8);
  }

  // airlock on the node's +Z side with its hatch
  const al = new THREE.Group();
  al.rotation.x = Math.PI / 2;
  al.position.set(0, 0, 0);
  body.add(al);
  kit.solid(al, [[1.05, nodeR - 0.2], [1.05, 5.0], [1.02, 5.0], [1.02, nodeR - 0.2]], kit.seg(64, 24), quilt(), hatch('insulation'), ...T_MLI, { crease: 0.3, u: (phi) => (phi * 1.05) / 0.5, v: (p) => p[1] / 0.5 });
  kit.mesh(cyl(1.0, 1.0, 0.06, kit.seg(64, 24)), P.aluMilled(), ...T_MOD, al, 0, 5.0, 0);
  kit.mesh(new THREE.TorusGeometry(0.55, 0.04, 8, 40), P.aluMilled(), ...T_MOD, al, 0, 5.04, 0).rotation.x = Math.PI / 2;

  // nadir docking port: conical adapter and a passive docking ring (capture plane at y = -3.24)
  const port = new THREE.Group();
  body.add(port);
  const pr = kit.seg(72, 24);
  port.add(
    kit.mesh(
      sweep(
        [
          [1.2, -nodeR + 0.12],
          [0.6, -3.1],
          [0.57, -3.1],
          [1.17, -nodeR + 0.12],
        ],
        true,
        { segs: pr, crease: 0.4 },
      ).skin,
      quilt(),
      ...T_MLI,
    ),
  );
  port.add(
    kit.mesh(
      sweep(
        [
          [0.38, -3.1],
          [0.62, -3.1],
          [0.62, -3.16],
          [0.38, -3.16],
        ],
        true,
        { segs: pr, crease: 0.3 },
      ).skin,
      P.aluMilled(),
      ...T_MOD,
    ),
  );
  // passive face ring: the capture plane at y = -3.24 (the capsule's active ring with its guide
  // petals mates to it; nothing of the station protrudes below this plane)
  port.add(
    kit.mesh(
      sweep(
        [
          [0.4, -3.24],
          [0.62, -3.24],
          [0.62, -3.2],
          [0.4, -3.2],
        ],
        true,
        { segs: pr, crease: 0.3 },
      ).skin,
      P.alu(),
      ...T_MOD,
    ),
  );
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    port.add(kit.mesh(strut(new THREE.Vector3(Math.sin(a) * 0.5, -3.16, Math.cos(a) * 0.5), new THREE.Vector3(Math.sin(a + 0.25) * 0.5, -3.2, Math.cos(a + 0.25) * 0.5), 0.012, 6), P.steel(), ...T_MOD));
  }
  // capture strikers for the capsule's latches and guide-petal receptacles on the face ring
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const st = kit.mesh(rbox(0.07, 0.03, 0.04, 0.006, 1), P.steel(), ...T_MOD, port, Math.sin(a) * 0.58, -3.225, Math.cos(a) * 0.58);
    st.rotation.y = a;
  }
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 3;
    const rc = kit.mesh(rbox(0.2, 0.012, 0.07, 0.004, 1), P.graphite(), ...T_MOD, port, Math.sin(a) * 0.46, -3.237, Math.cos(a) * 0.46);
    rc.rotation.y = a;
  }
  // docking target on a stand-off beside the port and approach lights
  kit.mesh(box(0.5, 0.02, 0.5), P.white(), ...T_MOD, body, 1.3, -nodeR - 0.2, 0.9);
  kit.mesh(box(0.06, 0.4, 0.06), P.graphite(), ...T_MOD, body, 1.3, -nodeR - 0.38, 0.9);
  kit.mesh(cyl(0.05, 0.05, 0.3, 12), P.graphite(), ...T_MOD, body, 1.3, -nodeR - 0.05, 0.9);

  // zenith pylon and the cross-track truss
  const ty = 5.2;
  const half = 27;
  const tw = 0.8; // half-width of the square truss section
  const trussMat = P.aluMilled();
  const tr = hangar ? 0.045 : 0.06;
  const ts = hangar ? 8 : 5;
  for (const [x, z] of [
    [-0.8, -0.8],
    [0.8, -0.8],
    [-0.8, 0.8],
    [0.8, 0.8],
  ])
    kit.mesh(strut(new THREE.Vector3(x, nodeR - 0.05, z), new THREE.Vector3(x * 0.8, ty - tw, z * 0.8), 0.08, ts), trussMat, ...T_MOD, body);
  kit.mesh(box(1.6, 0.2, 1.6), P.aluMilled(), ...T_MOD, body, 0, nodeR + 0.02, 0);
  const corners: [number, number][] = [
    [-tw, -tw],
    [tw, -tw],
    [tw, tw],
    [-tw, tw],
  ];
  const segments: [number, number][] = [
    [-half, -20.8],
    [-19.2, 19.2],
    [20.8, half],
  ];
  const outboard: THREE.Group[] = [];
  const buildTruss = (parent: THREE.Object3D, z0: number, z1: number) => {
    for (const [x, y] of corners) kit.mesh(strut(new THREE.Vector3(x, ty + y, z0), new THREE.Vector3(x, ty + y, z1), tr * 1.4, ts), trussMat, ...T_MOD, parent);
    const bays = Math.max(1, Math.round((z1 - z0) / 1.6));
    for (let b = 0; b <= bays; b++) {
      const z = z0 + ((z1 - z0) * b) / bays;
      for (let c = 0; c < 4; c++) {
        const [xa, ya] = corners[c];
        const [xb, yb] = corners[(c + 1) % 4];
        kit.mesh(strut(new THREE.Vector3(xa, ty + ya, z), new THREE.Vector3(xb, ty + yb, z), tr, ts), trussMat, ...T_MOD, parent);
        if (b < bays) {
          const zn = z0 + ((z1 - z0) * (b + 1)) / bays;
          kit.mesh(strut(new THREE.Vector3(xa, ty + ya, b % 2 ? z : zn), new THREE.Vector3(xb, ty + yb, b % 2 ? zn : z), tr * 0.8, ts), trussMat, ...T_MOD, parent);
        }
      }
    }
  };
  buildTruss(body, segments[1][0], segments[1][1]);
  // rotary joints and outboard segments carrying the array wings
  for (const sz of [-1, 1]) {
    const jz = sz * 20;
    kit.mesh(cyl(1.05, 1.05, 1.6, kit.seg(48, 16)), P.whitePaint(), ...T_MOD, body, 0, ty, jz).rotation.x = Math.PI / 2;
    kit.mesh(new THREE.TorusGeometry(1.06, 0.05, 8, kit.seg(48, 16)), P.graphite(), ...T_MOD, body, 0, ty, jz);
    const ob = new THREE.Group();
    ob.position.set(0, ty, 0);
    body.add(ob);
    const obInner = new THREE.Group();
    obInner.position.set(0, -ty, 0);
    ob.add(obInner);
    buildTruss(obInner, sz > 0 ? 20.8 : -half, sz > 0 ? half : -20.8);
    outboard.push(ob);
  }

  // four array wings: blankets either side of a deployable mast, on beta gimbals
  const wings: THREE.Group[] = [];
  const wl = 16;
  const bw = 2.1;
  const cellsMat = cells();
  for (const [ob, sz] of [
    [outboard[0], -1],
    [outboard[1], 1],
  ] as [THREE.Group, number][]) {
    for (const sx of [-1, 1]) {
      const beta = new THREE.Group();
      beta.position.set(sx * 1.2, 0, sz * 24.2);
      ob.add(beta);
      kit.mesh(cyl(0.35, 0.35, 0.6, 20), P.whitePaint(), ...T_ARR, beta, -sx * 0.4, 0, 0).rotation.z = Math.PI / 2;
      const w = new THREE.Group();
      beta.add(w);
      wings.push(beta);
      // mast (lattice shown as a slim triangular tube) and the blanket box at the tip
      kit.mesh(strut(new THREE.Vector3(0, 0, 0), new THREE.Vector3(sx * wl, 0, 0), 0.09, hangar ? 10 : 6), P.aluMilled(), ...T_ARR, w);
      kit.mesh(box(0.5, 0.25, bw * 2 + 0.6), P.whitePaint(), ...T_ARR, w, sx * (wl + 0.2), 0, 0);
      kit.mesh(box(0.5, 0.25, bw * 2 + 0.6), P.whitePaint(), ...T_ARR, w, sx * 0.3, 0, 0);
      for (const side of [-1, 1]) {
        const cz = side * (bw / 2 + 0.2);
        const len = wl - 0.8;
        const nx = Math.floor(len / CELL_TILE.cellW);
        const ny = Math.floor((bw - 0.1) / CELL_TILE.cellH);
        const fw = nx * CELL_TILE.cellW;
        const fh = ny * CELL_TILE.cellH;
        const g = new THREE.PlaneGeometry(fw, fh);
        g.rotateX(-Math.PI / 2);
        const uv = g.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * fw) / CELL_TILE.w, (uv.getY(i) * fh) / CELL_TILE.h);
        kit.mesh(g, cellsMat, ...T_ARR, w, sx * (0.55 + fw / 2), 0.012, cz).castShadow = false;
        const back = kit.mesh(box(fw + 0.06, 0.018, fh + 0.06), panelBack(), ...T_ARR, w, sx * (0.55 + fw / 2), 0, cz);
        uvMetres(back.geometry, 1 / 0.6);
        // tension cables along the blanket edges
        for (const e of [-1, 1]) kit.mesh(strut(new THREE.Vector3(sx * 0.55, 0, cz + (e * (fh + 0.06)) / 2), new THREE.Vector3(sx * (0.55 + fw), 0, cz + (e * (fh + 0.06)) / 2), 0.012, 4), P.steel(), ...T_ARR, w);
      }
    }
  }

  // radiator wings hanging below the truss on each side of the pylon
  for (const sz of [-1, 1]) {
    const rz = sz * 10;
    kit.mesh(cyl(0.3, 0.3, 0.6, 16), P.whitePaint(), ...T_MOD, body, 0, ty - tw - 0.3, rz);
    for (let k = 0; k < 3; k++) {
      const p = kit.mesh(box(0.08, 2.8, 2.6), radiator(), ...T_ARR, body, 0, ty - tw - 0.6 - 1.45 - k * 2.9, rz);
      uvMetres(p.geometry, 1);
    }
  }

  // antennas: high-gain dish on a mast, a boom antenna on the laboratory
  const mast = new THREE.Group();
  mast.position.set(0, ty + tw, 3.2);
  body.add(mast);
  kit.mesh(strut(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1.6, 0), 0.07, 10), P.aluMilled(), ...T_MOD, mast);
  const hg = dish(kit, mast, 1.8, 0.8, { sub: true, part: 'station', material: 'al-2219' });
  hg.position.y = 1.7;
  hg.rotation.set(0.5, 0, 0.4);
  kit.mesh(strut(new THREE.Vector3(8, 2.1, 0), new THREE.Vector3(8, 4.2, 0), 0.03, 8), P.whitePaint(), ...T_MOD, body);
  kit.mesh(new THREE.ConeGeometry(0.12, 0.18, 16), P.whitePaint(), ...T_MOD, body, 8, 4.3, 0);
  // viewing windows on the laboratory's nadir side
  for (const x of [6, 7.2]) {
    kit.mesh(cyl(0.22, 0.22, 0.06, 24), P.ti(), ...T_MOD, body, x, -2.22, 0);
    kit.mesh(cyl(0.16, 0.16, 0.065, 24), P.pane(), ...T_MOD, body, x, -2.225, 0);
  }

  const dockPos = new THREE.Vector3(0, -3.24, 0);
  return {
    bodies: { station: body },
    anchors: { ...emptyAnchors(ty + tw + 2.5), dockPort: { pos: dockPos, axis: new THREE.Vector3(0, -1, 0) } },
    pose(s: SCState) {
      // array drive: rotary joints turn the outboard trusses; beta gimbals turn each wing
      const alpha = s.arrayDrive * 1.2;
      for (const ob of outboard) ob.rotation.z = alpha;
      for (let i = 0; i < wings.length; i++) wings[i].rotation.x = (i % 2 ? 1 : -1) * (25 * DEG) + s.arrayDrive * 0.8;
    },
  };
}
