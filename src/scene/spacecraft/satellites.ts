/**
 * The three satellites carried inside the fairing (body 'satellite'). Each is authored in the
 * vehicle model frame, its separation ring on the payload adapter top (mountY + 0.9 m, the
 * 1575 mm ring), and sits inside a 1.7 m radius below 63 m while stowed.
 *
 *  leoSat      Earth-observation satellite (6.2 t): 2.3 x 2.3 x 3.6 m bus in MLI, telescope with a
 *              scarfed sun baffle on the nadir (+Y) deck, two 3-panel wings on +/-X, an X-band
 *              dish on a boom stowed on -Z, four hydrazine thruster clusters, reaction wheels.
 *  gtoSat      Geostationary communications satellite (3.6 t): two folded reflectors on the
 *              east/west (+/-X) faces, two 4-panel wings on the north/south (+/-Z) faces, liquid
 *              apogee engine in the separation ring, propellant tanks in the central tube.
 *  lunarProbe  Compact flyby probe (1.4 t): one wing, gimballed high-gain dish, camera pair.
 */
import * as THREE from 'three';
import { STATIONS } from '../../vehicle/spec';
import { buildWing, type Wing } from './arrays';
import { box, cyl, DEG, rbox, smooth, strut, sweep, tube, type Kit, type V2 } from './kit';
import { emptyAnchors, type Built, type SCState } from './model';
import { avionicsBox, buildBus, dish, pillTank, reactionWheel, sepRing, sphereTank, starTracker, thrusterCluster, type BusSpec } from './satparts';
import { hatch, mli, MLI_REPEAT, osr, P } from './mats';
import { uvMetres } from './kit';

/** Height of the payload adapter above the payload interface plane (the satellite's seat). */
export const ADAPTER_H = STATIONS.payloadAdapterTop - STATIONS.s2ForwardSkirtTop;
const MLI_T = 0.024;

interface SatFrame {
  body: THREE.Group;
  /** Attitude pivot (at the centre of mass) for slews. */
  att: THREE.Group;
  /** Geometry parent (model-frame coordinates). */
  sc: THREE.Group;
}

function satFrame(com: THREE.Vector3): SatFrame {
  const body = new THREE.Group();
  body.name = 'satellite';
  const att = new THREE.Group();
  att.position.copy(com);
  body.add(att);
  const sc = new THREE.Group();
  sc.position.copy(com).negate();
  att.add(sc);
  return { body, att, sc };
}

/**
 * Tube with a scarfed (slanted) mouth: the sun baffle. Height of the mouth varies with azimuth
 * between lMin and lMax (longest side at phiS). Outer skin, inner skin and the rim.
 */
function scarfTube(rOut: number, rIn: number, yb: number, lMin: number, lMax: number, phiS: number, segs: number, rows: number): { outer: THREE.BufferGeometry; inner: THREE.BufferGeometry; rim: THREE.BufferGeometry } {
  const top = (phi: number) => yb + lMin + ((lMax - lMin) * (1 + Math.cos(phi - phiS))) / 2;
  const make = (r: number, inward: boolean) => {
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (let j = 0; j <= rows; j++)
      for (let i = 0; i <= segs; i++) {
        const phi = (i / segs) * Math.PI * 2;
        const y = yb + (top(phi) - yb) * (j / rows);
        pos.push(r * Math.sin(phi), y, r * Math.cos(phi));
        uv.push((i / segs) * 2 * Math.PI * r * 2, y * 2);
      }
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < segs; i++) {
        const a = j * (segs + 1) + i;
        const b = a + 1;
        const c = a + segs + 1;
        const d = c + 1;
        if (inward) idx.push(a, c, b, b, c, d);
        else idx.push(a, b, c, b, d, c);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  const rimPos: number[] = [];
  const rimIdx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const phi = (i / segs) * Math.PI * 2;
    const y = top(phi);
    rimPos.push(rOut * Math.sin(phi), y, rOut * Math.cos(phi), rIn * Math.sin(phi), y, rIn * Math.cos(phi));
    if (i < segs) {
      const a = i * 2;
      rimIdx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const rim = new THREE.BufferGeometry();
  rim.setAttribute('position', new THREE.Float32BufferAttribute(rimPos, 3));
  rim.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((rimPos.length / 3) * 2).fill(0), 2));
  rim.setIndex(rimIdx);
  rim.computeVertexNormals();
  return { outer: make(rOut, false), inner: make(rIn, true), rim };
}

function cable(kit: Kit, parent: THREE.Object3D, pts: [number, number, number][], r = 0.012): void {
  kit.mesh(tube(pts.map((p) => new THREE.Vector3(...p)), r, 6), P.whitePaint(), 'satellite-bus', 'cfrp-sandwich', parent);
}

/** Central thrust cylinder (CFRP) with its section. */
function centralTube(kit: Kit, parent: THREE.Object3D, r: number, y0: number, y1: number): void {
  const t = 0.014;
  const poly: V2[] = [
    [r, y0],
    [r, y1],
    [r - t, y1],
    [r - t, y0],
  ];
  kit.solid(parent, poly, kit.seg(72, 24), P.carbon(), hatch('composite'), 'satellite-bus', 'cfrp-sandwich', { crease: 0.3 });
  for (const y of [y0 + 0.02, y1 - 0.02, (y0 + y1) / 2])
    kit.solid(
      parent,
      [
        [r, y - 0.02],
        [r + 0.03, y - 0.02],
        [r + 0.03, y + 0.02],
        [r, y + 0.02],
      ],
      kit.seg(72, 24),
      P.aluMilled(),
      hatch('metal'),
      'satellite-bus',
      'al-2219',
      { crease: 0.3 },
    );
}

// ───────────────────────────── Earth-observation satellite ─────────────────────────────

export function buildLeoSat(kit: Kit, mountY: number): Built {
  const base = mountY + ADAPTER_H;
  const y0 = base + 0.3;
  const y1 = y0 + 3.6;
  const hx = 1.15;
  const hz = 1.15;
  const { body, att, sc } = satFrame(new THREE.Vector3(0, y0 + 1.6, 0));
  const spec: BusSpec = {
    hx,
    hz,
    y0,
    y1,
    cutFace: 'pz',
    faces: {
      px: [{ v0: 0, v1: 1, kind: 'gold' }],
      nx: [{ v0: 0, v1: 1, kind: 'gold' }],
      pz: [{ v0: 0, v1: 1, kind: 'gold' }],
      nz: [
        { v0: 0, v1: 0.32, kind: 'gold' },
        { v0: 0.32, v1: 1, kind: 'osr' },
      ],
      top: [{ v0: 0, v1: 1, kind: 'black' }],
      bot: [{ v0: 0, v1: 1, kind: 'silver' }],
    },
  };
  const bus = buildBus(kit, sc, spec);
  sepRing(kit, sc, base, y0, 0.62);

  // ── optical instrument on the nadir (+Y) deck: MLI-wrapped housing, scarfed sun baffle
  const ib = y1 + 0.02;
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const a2 = a + Math.PI / 6;
    kit.mesh(strut(new THREE.Vector3(Math.sin(a) * 0.62, ib, Math.cos(a) * 0.62), new THREE.Vector3(Math.sin(a2) * 0.5, ib + 0.14, Math.cos(a2) * 0.5), 0.018, 8), P.ti(), 'satellite-bus', 'cfrp-sandwich', sc);
  }
  const hs = kit.seg(72, 20);
  const housing = kit.mesh(cyl(0.56, 0.56, 0.8, hs, true), mli('silver'), 'mli-blankets', 'mli', sc, 0, ib + 0.14 + 0.4, 0);
  uvMetres(housing.geometry, 1 / MLI_REPEAT);
  kit.mesh(cyl(0.56, 0.56, 0.02, hs), P.cfrpPanel(), 'satellite-bus', 'cfrp-sandwich', sc, 0, ib + 0.14, 0);
  // taped seams around the housing
  for (const yy of [ib + 0.16, ib + 0.54, ib + 0.93]) kit.mesh(new THREE.TorusGeometry(0.562, 0.006, 6, hs), P.alu(), 'mli-blankets', 'mli', sc, 0, yy, 0).rotation.x = Math.PI / 2;
  const by = ib + 0.94;
  kit.mesh(cyl(0.56, 0.56, 0.03, hs), P.cfrpPanel(), 'satellite-bus', 'cfrp-sandwich', sc, 0, by, 0);
  const baffle = scarfTube(0.5, 0.485, by, 0.42, 1.0, Math.PI, hs, kit.hangar ? 8 : 2);
  kit.mesh(baffle.outer, P.whitePaint(), 'satellite-bus', 'cfrp-sandwich', sc);
  kit.mesh(baffle.inner, P.anod(), 'satellite-bus', 'cfrp-sandwich', sc);
  kit.mesh(baffle.rim, P.whitePaint(), 'satellite-bus', 'cfrp-sandwich', sc);
  // primary mirror, vanes, secondary mirror on a spider
  kit.mesh(cyl(0.44, 0.44, 0.03, hs), P.mirror(), 'satellite-bus', 'cfrp-sandwich', sc, 0, by + 0.03, 0);
  if (kit.hangar) {
    for (let k = 1; k <= 4; k++) kit.mesh(new THREE.TorusGeometry(0.47, 0.012, 4, hs), P.anod(), 'satellite-bus', 'cfrp-sandwich', sc, 0, by + 0.08 * k, 0).rotation.x = Math.PI / 2;
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      kit.mesh(strut(new THREE.Vector3(Math.sin(a) * 0.48, by + 0.34, Math.cos(a) * 0.48), new THREE.Vector3(0, by + 0.34, 0), 0.006, 6), P.anod(), 'satellite-bus', 'cfrp-sandwich', sc);
    }
    kit.mesh(cyl(0.09, 0.07, 0.06, 24), P.anod(), 'satellite-bus', 'cfrp-sandwich', sc, 0, by + 0.34, 0);
  }
  // instrument radiators on struts
  for (const sx of [-1, 1]) {
    const rad = kit.mesh(box(0.02, 0.62, 0.5), osr(), 'satellite-bus', 'cfrp-sandwich', sc, sx * 0.86, ib + 0.52, 0.1);
    uvMetres(rad.geometry, 1 / 0.16);
    for (const yy of [-0.2, 0.2]) kit.mesh(strut(new THREE.Vector3(sx * 0.56, ib + 0.52 + yy, 0.1), new THREE.Vector3(sx * 0.85, ib + 0.52 + yy, 0.1), 0.012, 6), P.ti(), 'satellite-bus', 'cfrp-sandwich', sc);
  }
  // deck equipment: GNSS antenna, sun sensors, S-band antennas
  kit.mesh(new THREE.SphereGeometry(0.07, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), P.whitePaint(), 'antenna', 'cfrp-sandwich', sc, 0.85, y1 + MLI_T, 0.85);
  for (const [x, z] of [
    [-0.9, 0.9],
    [0.9, -0.9],
  ]) {
    kit.mesh(rbox(0.1, 0.05, 0.1, 0.01), P.anod(), 'satellite-bus', 'cfrp-sandwich', sc, x, y1 + MLI_T + 0.025, z);
    kit.mesh(box(0.06, 0.004, 0.06), P.lens(), 'satellite-bus', 'cfrp-sandwich', sc, x, y1 + MLI_T + 0.052, z);
  }
  const helix = (x: number, y: number, z: number, down: boolean) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI * 6;
      pts.push(new THREE.Vector3(x + Math.cos(a) * 0.035, y + (down ? -1 : 1) * (0.03 + (i / 40) * 0.22), z + Math.sin(a) * 0.035));
    }
    kit.mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.004, 5), P.gold(), 'antenna', 'cfrp-sandwich', sc);
    kit.mesh(cyl(0.05, 0.05, 0.03, 16), P.whitePaint(), 'antenna', 'cfrp-sandwich', sc, x, y + (down ? -0.015 : 0.015), z);
  };
  if (kit.hangar) {
    helix(-0.88, y1 + MLI_T, -0.88, false);
    helix(0.8, y0 - MLI_T, -0.8, true);
  }

  // ── star trackers on the -Z face, looking outward and away from the Earth
  const stb = new THREE.Group();
  stb.position.set(0.42, y0 + 0.62, -hz - MLI_T);
  sc.add(stb);
  kit.mesh(rbox(0.5, 0.08, 0.14, 0.01), P.ti(), 'satellite-bus', 'cfrp-sandwich', stb, 0, 0, -0.07);
  for (const [i, az] of [
    [-1, -25],
    [0, 0],
    [1, 25],
  ]) {
    const st = starTracker(kit, stb);
    st.position.set(i * 0.16, 0.02, -0.11);
    st.rotation.set(-132 * DEG, az * DEG, 0, 'YXZ');
  }

  // ── thruster clusters under the four bottom corners
  const satRcs: THREE.Vector3[] = [];
  for (const [sx, sz] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ])
    satRcs.push(thrusterCluster(kit, sc, new THREE.Vector3(sx * 0.93, y0 - MLI_T - 0.02, sz * 0.93), new THREE.Vector3(sx, 0, sz)));

  // ── two stowed 3-panel wings on +/-X
  const wy = y0 + 1.8;
  const wings: Wing[] = [];
  for (const sx of [1, -1]) {
    const w = buildWing(kit, { panels: 3, w: 1.8, h: 2.9 });
    w.root.position.set(sx * (hx + MLI_T), wy, 0);
    if (sx < 0) w.root.scale.x = -1;
    sc.add(w.root);
    wings.push(w);
  }

  // ── X-band dish on a hinged boom, stowed on the -Z face over the radiator
  const hinge = new THREE.Group();
  hinge.position.set(0, y1 - 0.06, -hz - MLI_T - 0.02);
  sc.add(hinge);
  kit.mesh(rbox(0.26, 0.1, 0.1, 0.012), P.ti(), 'antenna', 'cfrp-sandwich', sc, 0, y1 - 0.06, -hz - MLI_T - 0.02 + 0.03);
  const boom = new THREE.Group();
  hinge.add(boom);
  kit.mesh(cyl(0.045, 0.045, 0.2, 16), P.alu(), 'antenna', 'cfrp-sandwich', boom, 0, 0, 0).rotation.z = Math.PI / 2;
  kit.mesh(strut(new THREE.Vector3(0, -0.04, -0.08), new THREE.Vector3(0, -1.46, -0.08), 0.032, kit.hangar ? 14 : 8), P.carbon(), 'antenna', 'cfrp-sandwich', boom);
  kit.mesh(strut(new THREE.Vector3(0, -0.02, -0.02), new THREE.Vector3(0, -0.3, -0.08), 0.02, 8), P.ti(), 'antenna', 'cfrp-sandwich', boom);
  const gimbal = new THREE.Group();
  gimbal.position.set(0, -1.55, -0.12);
  boom.add(gimbal);
  kit.mesh(rbox(0.12, 0.16, 0.1, 0.015), P.anod(), 'antenna', 'cfrp-sandwich', gimbal, 0, 0.06, 0.02);
  const dishHold = new THREE.Group();
  gimbal.add(dishHold);
  const xd = dish(kit, dishHold, 1.0, 0.42, { sub: true });
  xd.position.set(0, 0, -0.06);
  dishHold.rotation.x = -Math.PI / 2;
  // launch lock for the dish rim
  kit.mesh(rbox(0.12, 0.08, 0.16, 0.01), P.ti(), 'antenna', 'cfrp-sandwich', sc, 0, y1 - 0.06 - 2.1, -hz - MLI_T - 0.07);

  // ── interior (section view): central tube, hydrazine tank, reaction wheels, avionics, harness
  const inner = bus.inner;
  if (inner) {
    centralTube(kit, inner, 0.6, y0 + 0.02, y1 - 0.02);
    sphereTank(kit, inner, 0.5, y0 + 1.5);
    kit.mesh(strut(new THREE.Vector3(0, y0 + 1.0, 0), new THREE.Vector3(0.3, y0 + 0.3, 0.7), 0.012, 6), P.ti(), 'attitude-thrusters', 'titanium', inner);
    // wheel plate bolted to the floor panel (its top face at y0 + 0.025)
    const wheels = new THREE.Group();
    wheels.position.set(0, y0 + 0.04, 0.86);
    inner.add(wheels);
    kit.mesh(rbox(1.05, 0.03, 0.4, 0.01), P.aluMilled(), 'attitude-thrusters', 'titanium', wheels, 0, 0, 0);
    for (const [x, y, rz, rx] of [
      [-0.34, 0.2, 30, 0],
      [0.34, 0.2, -30, 0],
      [-0.2, 0.62, 0, 30],
      [0.2, 0.62, 0, -30],
    ]) {
      const w = reactionWheel(kit, wheels);
      w.position.set(x, y, 0.02);
      w.rotation.set(rx * DEG + 90 * DEG, 0, rz * DEG);
      if (y > 0.5) kit.mesh(strut(new THREE.Vector3(x, 0.02, -0.1), new THREE.Vector3(x, y - 0.1, -0.1), 0.02, 6), P.aluMilled(), 'attitude-thrusters', 'titanium', wheels);
      // saddle bracket under the lower wheels (their rims come down to the plate)
      else kit.mesh(rbox(0.16, 0.06, 0.13, 0.008), P.aluMilled(), 'attitude-thrusters', 'titanium', wheels, x, 0.045, 0.02);
    }
    for (const sx of [-1, 1]) {
      const xw = sx * (hx - 0.025);
      avionicsBox(kit, inner, 0.5, 0.3, 0.22, xw - sx * 0.11, y0 + 0.5, 0.45, (sx * Math.PI) / 2);
      avionicsBox(kit, inner, 0.4, 0.25, 0.18, xw - sx * 0.09, y0 + 1.2, 0.55, (sx * Math.PI) / 2);
      avionicsBox(kit, inner, 0.6, 0.35, 0.2, xw - sx * 0.1, y0 + 2.2, 0.35, (sx * Math.PI) / 2);
      avionicsBox(kit, inner, 0.36, 0.22, 0.16, xw - sx * 0.08, y0 + 2.9, 0.62, (sx * Math.PI) / 2);
      cable(kit, inner, [
        [xw - sx * 0.02, y0 + 0.66, 0.2],
        [xw - sx * 0.03, y0 + 1.4, 0.3],
        [xw - sx * 0.03, y0 + 2.4, 0.15],
        [xw - sx * 0.02, y0 + 3.1, 0.4],
      ]);
    }
    // battery modules on the floor
    for (const x of [-0.75, 0.75]) avionicsBox(kit, inner, 0.28, 0.32, 0.36, x, y0 + 0.025 + 0.16, -0.75);
  }

  const topY = by + 1.0;
  const anchors = { ...emptyAnchors(topY), satRcs };
  return {
    bodies: { satellite: body },
    anchors,
    pose(s: SCState) {
      att.rotation.set(s.slewPitch, s.slewYaw, 0, 'YXZ');
      for (const w of wings) w.set(s.satArrays, s.arrayDrive);
      const a = smooth(0, 1, s.satAntenna);
      boom.rotation.x = 110 * DEG * a;
      dishHold.rotation.x = -Math.PI / 2 - 20 * DEG * a + s.antennaSlew;
    },
  };
}

// ───────────────────────────── geostationary communications satellite ─────────────────────────────

export function buildGtoSat(kit: Kit, mountY: number): Built {
  const base = mountY + ADAPTER_H;
  const y0 = base + 0.45;
  const y1 = y0 + 3.3;
  const hx = 0.95;
  const hz = 1.1;
  const { body, att, sc } = satFrame(new THREE.Vector3(0, y0 + 1.4, 0));
  const spec: BusSpec = {
    hx,
    hz,
    y0,
    y1,
    cutFace: 'pz',
    faces: {
      px: [{ v0: 0, v1: 1, kind: 'gold' }],
      nx: [{ v0: 0, v1: 1, kind: 'gold' }],
      pz: [
        { v0: 0, v1: 0.12, kind: 'gold' },
        { v0: 0.12, v1: 1, kind: 'osr' },
      ],
      nz: [
        { v0: 0, v1: 0.12, kind: 'gold' },
        { v0: 0.12, v1: 1, kind: 'osr' },
      ],
      top: [{ v0: 0, v1: 1, kind: 'gold' }],
      bot: [{ v0: 0, v1: 1, kind: 'silver' }],
    },
  };
  const bus = buildBus(kit, sc, spec);
  sepRing(kit, sc, base, y0, 0.6);

  // ── liquid apogee engine in the separation ring (radiatively cooled chamber and nozzle)
  const lae = new THREE.Group();
  sc.add(lae);
  const exitY = base - 0.02;
  const throatY = y0 - 0.12;
  const re = 0.14;
  const nozzle: V2[] = [];
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const r = 0.035 + (re - 0.035) * Math.pow(t, 0.62);
    nozzle.push([r, throatY - (throatY - exitY) * t]);
  }
  const nozIn = nozzle.map(([r, y]) => [r - 0.004, y] as V2);
  kit.solid(lae, [...nozzle, ...nozIn.reverse()], kit.seg(56, 18), P.thruster(), hatch('metal'), 'apogee-engine', 'niobium-c103', { crease: 1.2 });
  const chamber: V2[] = [
    [0.035, throatY],
    [0.055, throatY + 0.05],
    [0.055, throatY + 0.14],
    [0.04, throatY + 0.17],
    [0.0, throatY + 0.17],
  ];
  kit.mesh(sweep(chamber, false, { segs: kit.seg(40, 14) }).skin, P.thruster(), 'apogee-engine', 'niobium-c103', lae);
  kit.mesh(cyl(0.07, 0.07, 0.08, 20), P.steel(), 'apogee-engine', 'niobium-c103', lae, 0, throatY + 0.21, 0);
  kit.mesh(rbox(0.1, 0.06, 0.08, 0.01), P.steel(), 'apogee-engine', 'niobium-c103', lae, 0.08, throatY + 0.24, 0);
  // gold heat-shield blanket disc around the engine on the floor
  kit.mesh(cyl(0.5, 0.5, 0.01, kit.seg(48, 16)), mli('gold'), 'mli-blankets', 'mli', lae, 0, y0 - MLI_T - 0.006, 0);

  // ── two 4-panel wings on the north/south (+/-Z) faces
  const wy = (y0 + y1) / 2 + 0.05;
  const wings: Wing[] = [];
  const wingRoots: THREE.Group[] = [];
  for (const sz of [1, -1]) {
    const w = buildWing(kit, { panels: 4, w: 1.7, h: 2.6 });
    w.root.position.set(0, wy, sz * (hz + MLI_T));
    // wing axis along +/-Z; turned half a turn about that axis so the cells face +X at zero
    // drive (toward the usual three-quarter view) instead of showing the panel backs
    w.root.rotation.set(Math.PI, -Math.PI / 2, 0, 'YXZ');
    if (sz < 0) w.root.scale.x = -1;
    sc.add(w.root);
    wings.push(w);
    wingRoots.push(w.root);
  }
  // the +Z wing covers the section: it fades with the wedge (hangar detail has the section)
  if (kit.hangar) kit.cutHide.push(wingRoots[0]);

  // ── two reflectors folded against the east/west (+/-X) faces
  const refl: THREE.Group[] = [];
  const reflHold: THREE.Group[] = [];
  for (const sx of [1, -1]) {
    const side = new THREE.Group();
    side.position.set(sx * (hx + 0.1), y1 - 0.08, 0);
    if (sx < 0) side.scale.x = -1;
    sc.add(side);
    kit.mesh(rbox(0.12, 0.14, 0.3, 0.015), P.ti(), 'antenna', 'cfrp-sandwich', side, -0.06, 0, 0);
    const arm = new THREE.Group();
    side.add(arm);
    kit.mesh(cyl(0.05, 0.05, 0.34, 16), P.alu(), 'antenna', 'cfrp-sandwich', arm, 0, 0, 0).rotation.x = Math.PI / 2;
    kit.mesh(strut(new THREE.Vector3(0, 0, 0.1), new THREE.Vector3(0.08, -1.1, 0.25), 0.028, 10), P.carbon(), 'antenna', 'cfrp-sandwich', arm);
    kit.mesh(strut(new THREE.Vector3(0, 0, -0.1), new THREE.Vector3(0.08, -1.1, -0.25), 0.028, 10), P.carbon(), 'antenna', 'cfrp-sandwich', arm);
    const hold = new THREE.Group();
    hold.position.set(0.1, -1.2, 0);
    arm.add(hold);
    const d = dish(kit, hold, 1.8, 1.0, { front: P.whitePaint(), back: P.cfrpPanel(), horn: false });
    d.rotation.z = -Math.PI / 2; // boresight +X (outward) when stowed
    refl.push(arm);
    reflHold.push(hold);
    // launch locks at the reflector rim
    for (const yy of [-2.0, -0.35]) kit.mesh(rbox(0.1, 0.08, 0.12, 0.01), P.ti(), 'antenna', 'cfrp-sandwich', side, 0.0, yy, 0.0);
    // multibeam feed cluster on a tower at the Earth-deck edge, aimed at the deployed reflector
    const feed = new THREE.Group();
    feed.position.set(sx * 0.6, y1 + MLI_T, 0.2);
    sc.add(feed);
    for (const zz of [-0.07, 0.07]) kit.mesh(strut(new THREE.Vector3(0, 0, zz), new THREE.Vector3(0, 0.26, zz), 0.025, 8), P.cfrpPanel(), 'antenna', 'cfrp-sandwich', feed);
    const horn = new THREE.Group();
    horn.position.set(0, 0.3, 0);
    horn.rotation.z = -sx * 58 * DEG;
    feed.add(horn);
    kit.mesh(cyl(0.2, 0.2, 0.03, 24), P.aluMilled(), 'antenna', 'cfrp-sandwich', horn, 0, 0, 0);
    const hornGeo = sweep(
      [
        [0.018, 0],
        [0.05, 0.12],
        [0.045, 0.12],
        [0.014, 0.004],
      ],
      true,
      { segs: kit.seg(16, 8) },
    ).skin;
    const cluster: [number, number][] = [[0, 0], ...Array.from({ length: 6 }, (_, i) => [Math.cos((i * Math.PI) / 3) * 0.105, Math.sin((i * Math.PI) / 3) * 0.105] as [number, number])];
    for (const [hx2, hz2] of cluster) kit.mesh(hornGeo.clone(), P.gold(), 'antenna', 'cfrp-sandwich', horn, hx2, 0.015, hz2);
    kit.geos.add(hornGeo);
  }
  // small steerable spot-beam dish and omni antennas on the Earth deck
  const spot = dish(kit, sc, 0.6, 0.3, { sub: true });
  spot.position.set(-0.3, y1 + MLI_T + 0.22, -0.55);
  kit.mesh(strut(new THREE.Vector3(-0.3, y1, -0.55), new THREE.Vector3(-0.3, y1 + 0.2, -0.55), 0.04, 10), P.ti(), 'antenna', 'cfrp-sandwich', sc);
  // telemetry and command omni antenna: a biconical radiator on a mast
  kit.mesh(cyl(0.02, 0.025, 0.42, 10), P.whitePaint(), 'antenna', 'cfrp-sandwich', sc, 0.55, y1 + MLI_T + 0.21, -0.8);
  kit.mesh(cyl(0.09, 0.012, 0.07, 20), P.alu(), 'antenna', 'cfrp-sandwich', sc, 0.55, y1 + MLI_T + 0.47, -0.8);
  kit.mesh(cyl(0.012, 0.09, 0.07, 20), P.alu(), 'antenna', 'cfrp-sandwich', sc, 0.55, y1 + MLI_T + 0.54, -0.8);

  // ── thrusters: four clusters under the floor, four on the Earth-deck corners
  const satRcs: THREE.Vector3[] = [];
  for (const [sx, sz] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]) {
    satRcs.push(thrusterCluster(kit, sc, new THREE.Vector3(sx * 0.78, y0 - MLI_T - 0.02, sz * 0.92), new THREE.Vector3(sx, 0, sz)));
    const top = new THREE.Group();
    top.position.set(sx * 0.8, y1 + MLI_T + 0.03, sz * 0.95);
    top.rotation.z = Math.PI;
    sc.add(top);
    thrusterCluster(kit, top, new THREE.Vector3(), new THREE.Vector3(-sx, 0, sz));
  }

  // ── interior: central tube with oxidizer and fuel tanks, pressurant, amplifiers on the N/S walls
  const inner = bus.inner;
  if (inner) {
    centralTube(kit, inner, 0.6, y0 + 0.02, y1 - 0.02);
    // oxidizer below, fuel above: 1.4 m pills with a 0.1 m gap (they must not interpenetrate)
    pillTank(kit, inner, 0.5, 0.4, 0, y0 + 0.9, 0, 'attitude-thrusters', 'titanium');
    pillTank(kit, inner, 0.5, 0.4, 0, y0 + 2.4, 0, 'attitude-thrusters', 'titanium');
    // helium pressurant bottles (titanium, as tagged)
    for (const [x, z] of [
      [0.72, 0.62],
      [-0.72, 0.62],
    ]) {
      const cm = kit.mesh(new THREE.SphereGeometry(0.2, 32, 16), P.ti(), 'attitude-thrusters', 'titanium', inner, x, y0 + 0.35, z);
      cm.scale.y = 1.25;
    }
    // amplifier boxes on the north/south walls: the +Z wall's boxes leave with that wall in the
    // section view (they would float in front of the tanks otherwise)
    for (const sz of [1, -1])
      for (let k = 0; k < 3; k++)
        for (const x of [-0.5, 0.0, 0.5]) avionicsBox(kit, sz > 0 && bus.wall ? bus.wall : inner, 0.34, 0.16, 0.12, x, y0 + 0.8 + k * 0.8, sz * (hz - 0.09), sz > 0 ? Math.PI : 0);
  }

  const anchors = { ...emptyAnchors(y1 + 0.9), satRcs, satApogee: { exit: new THREE.Vector3(0, exitY, 0), exitRadius: re } };
  return {
    bodies: { satellite: body },
    anchors,
    pose(s: SCState) {
      att.rotation.set(s.slewPitch, s.slewYaw, 0, 'YXZ');
      for (const w of wings) w.set(s.satArrays, s.arrayDrive);
      const a = smooth(0, 0.7, s.satAntenna);
      const b = smooth(0.3, 1, s.satAntenna);
      for (const arm of refl) arm.rotation.z = 118 * DEG * a;
      for (const h of reflHold) h.rotation.z = -12 * DEG * b + s.antennaSlew * 0.3;
    },
  };
}

// ───────────────────────────── lunar flyby probe ─────────────────────────────

export function buildLunarProbe(kit: Kit, mountY: number): Built {
  const base = mountY + ADAPTER_H;
  const y0 = base + 0.25;
  const y1 = y0 + 1.4;
  const hx = 0.72;
  const hz = 0.72;
  const { body, att, sc } = satFrame(new THREE.Vector3(0, y0 + 0.7, 0));
  const spec: BusSpec = {
    hx,
    hz,
    y0,
    y1,
    cutFace: 'pz',
    faces: {
      px: [{ v0: 0, v1: 1, kind: 'gold' }],
      nx: [
        { v0: 0, v1: 0.4, kind: 'gold' },
        { v0: 0.4, v1: 1, kind: 'osr' },
      ],
      pz: [{ v0: 0, v1: 1, kind: 'gold' }],
      nz: [{ v0: 0, v1: 1, kind: 'gold' }],
      top: [{ v0: 0, v1: 1, kind: 'black' }],
      bot: [{ v0: 0, v1: 1, kind: 'silver' }],
    },
  };
  const bus = buildBus(kit, sc, spec);
  sepRing(kit, sc, base, y0, 0.5);

  // one 3-panel wing on +X
  const wing = buildWing(kit, { panels: 3, w: 1.2, h: 1.25 });
  wing.root.position.set(hx + MLI_T, (y0 + y1) / 2, 0);
  sc.add(wing.root);

  // gimballed high-gain dish on a mast on the top deck
  const mast = new THREE.Group();
  mast.position.set(0, y1 + MLI_T, 0);
  sc.add(mast);
  kit.mesh(cyl(0.08, 0.1, 0.22, 20), P.ti(), 'antenna', 'cfrp-sandwich', mast, 0, 0.11, 0);
  const gim = new THREE.Group();
  gim.position.set(0, 0.26, 0);
  mast.add(gim);
  kit.mesh(rbox(0.16, 0.12, 0.16, 0.02), P.anod(), 'antenna', 'cfrp-sandwich', gim, 0, 0, 0);
  const hga = dish(kit, gim, 1.1, 0.45, { sub: true });
  hga.position.y = 0.08;

  // camera pair on a bracket at the top-deck edge, looking over the +Z face
  const cams = new THREE.Group();
  cams.position.set(0.25, y1 - 0.12, hz + MLI_T + 0.02);
  sc.add(cams);
  kit.mesh(rbox(0.5, 0.06, 0.2, 0.01), P.ti(), 'satellite-bus', 'cfrp-sandwich', cams, 0, 0.1, -0.06);
  const nac = new THREE.Group();
  nac.position.set(-0.08, 0.02, 0.08);
  nac.rotation.x = 80 * DEG;
  cams.add(nac);
  kit.mesh(cyl(0.1, 0.1, 0.42, 32), P.whitePaint(), 'satellite-bus', 'cfrp-sandwich', nac, 0, 0.21, 0);
  kit.mesh(cyl(0.1, 0.12, 0.2, 32, true), P.anod(), 'satellite-bus', 'cfrp-sandwich', nac, 0, 0.52, 0);
  kit.mesh(cyl(0.08, 0.08, 0.01, 32), P.lens(), 'satellite-bus', 'cfrp-sandwich', nac, 0, 0.42, 0);
  const wac = new THREE.Group();
  wac.position.set(0.17, 0.02, 0.06);
  wac.rotation.x = 70 * DEG;
  cams.add(wac);
  kit.mesh(rbox(0.12, 0.12, 0.12, 0.015), P.anod(), 'satellite-bus', 'cfrp-sandwich', wac, 0, 0.06, 0);
  kit.mesh(cyl(0.035, 0.045, 0.06, 20), P.anod(), 'satellite-bus', 'cfrp-sandwich', wac, 0, 0.15, 0);
  kit.mesh(cyl(0.028, 0.028, 0.005, 20), P.lens(), 'satellite-bus', 'cfrp-sandwich', wac, 0, 0.18, 0);
  // star trackers on the -X face
  for (const zz of [-0.25, 0.25]) {
    const st = starTracker(kit, sc);
    st.position.set(-hx - MLI_T - 0.02, y1 - 0.25, zz);
    st.rotation.set(0, 0, 105 * DEG);
  }

  const satRcs: THREE.Vector3[] = [];
  for (const [sx, sz] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ])
    satRcs.push(thrusterCluster(kit, sc, new THREE.Vector3(sx * 0.56, y0 - MLI_T - 0.02, sz * 0.56), new THREE.Vector3(sx, 0, sz)));

  const inner = bus.inner;
  if (inner) {
    centralTube(kit, inner, 0.42, y0 + 0.02, y1 - 0.02);
    sphereTank(kit, inner, 0.36, y0 + 0.7);
    const wh = new THREE.Group();
    wh.position.set(0, y0 + 0.12, 0.55);
    inner.add(wh);
    for (const x of [-0.24, 0.24]) {
      const w = reactionWheel(kit, wh, 0.1);
      w.position.set(x, 0.1, 0);
      w.rotation.x = Math.PI / 2;
    }
    avionicsBox(kit, inner, 0.36, 0.22, 0.14, hx - 0.1, y0 + 0.9, 0.3, Math.PI / 2);
    avionicsBox(kit, inner, 0.36, 0.22, 0.14, -hx + 0.1, y0 + 0.6, 0.3, -Math.PI / 2);
  }

  return {
    bodies: { satellite: body },
    anchors: { ...emptyAnchors(y1 + 0.9), satRcs },
    pose(s: SCState) {
      att.rotation.set(s.slewPitch, s.slewYaw, 0, 'YXZ');
      wing.set(s.satArrays, s.arrayDrive);
      const a = smooth(0, 1, s.satAntenna);
      gim.rotation.set(0, -35 * DEG * a, 0);
      hga.rotation.x = -65 * DEG * a + s.antennaSlew;
    },
  };
}
