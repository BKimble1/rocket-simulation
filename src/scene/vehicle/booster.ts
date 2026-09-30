/**
 * First stage (body `booster`): thrust section with the base heat shield and thrust structure,
 * the seven E-1 engines, the RP-1 tank with the LOX downcomer, the intertank, the LOX tank
 * with helium COPVs, the forward skirt, the raceway, the interstage with the stage separation
 * system, and the livery. Geometry is authored at its stacked position in the model frame.
 */
import * as THREE from 'three';
import { BODY_RADIUS as R, DOME_HEIGHT as H, STATIONS as S } from '../../vehicle/spec';
import { buildEngine } from './engine/buildEngine';
import type { EngineDetail } from './engine/types';
import type { Ctx, EngineMount } from './ctx';
import type { Section } from './kit';
import { AZ, ENGINES, EXPLODE, DEG, INTERSTAGE_WALL, INTERSTAGE_INNER_R } from './layout';
import { WALL } from './tanks';
import { wall, dome, jointBand, solidRing, sandwich } from './structures';
import { lathe, pipe, rod, radialFrame, bevelBox, platePlan, boltRing, rectPoly, mergeAll, loft, polar, type P2 } from './geom';
import { makeDecal, wordWidth } from './decals';
import { RigInstances, azimuthCopies, bakeModel } from './instancing';
import { GRAPHITE, WHITE } from './mats';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Feed-line interface on top of each engine (engine frame, before the mount yaw). */
export const ENGINE_IFACE = { y: 0.25, lox: new THREE.Vector3(0.41, 0, 0), rp1: new THREE.Vector3(0.41, 0, 0.215) };

export function sec(ctx: Ctx, id: string, body: 'booster' | 'upper' = 'booster'): Section {
  const e = EXPLODE[id] ?? [0, 0, 0];
  return ctx.kit.section(id, body, ctx.content[body]!, new THREE.Vector3(...e));
}

/**
 * Engine model detail for the booster cluster: always the light 'cluster' version (seven engines
 * share the base; the full engine is shown by the engine module's own close-up views).
 */
export function s1EngineDetail(hangar: boolean): EngineDetail {
  void hangar;
  return 'cluster';
}

/** Mount an engine at a gimbal point; detects whether the model gimbals itself. */
export function mountEngine(ctx: Ctx, parent: THREE.Object3D, id: string, kind: 'E-1' | 'E-1V', detail: EngineDetail, pivot: THREE.Vector3, yaw: number, centre: boolean): EngineMount {
  const engine = buildEngine(kind, detail);
  const mount = new THREE.Group();
  mount.name = `engine-mount:${id}`;
  mount.position.copy(pivot);
  mount.rotation.y = yaw;
  mount.add(engine.root);
  parent.add(mount);
  // does setOperating swing the engine? probe once with a small pitch
  mount.updateMatrixWorld(true);
  const before: THREE.Matrix4[] = [];
  engine.root.traverse((o) => before.push(o.matrixWorld.clone()));
  engine.setOperating({ pitch: 2, yaw: 0 });
  mount.updateMatrixWorld(true);
  let moved = false;
  let k = 0;
  engine.root.traverse((o) => {
    if (!moved && before[k] && !before[k].equals(o.matrixWorld)) moved = true;
    k++;
  });
  engine.setOperating({ pitch: 0, yaw: 0 });
  mount.updateMatrixWorld(true);
  engine.root.traverse((m) => {
    const mesh = m as THREE.Mesh;
    if (!mesh.isMesh) return;
    ctx.kit.register(mesh, { kind: 'foreign', part: (mesh.userData.part ?? null) as never, mat: (mesh.userData.material ?? null) as never, body: kind === 'E-1' ? 'booster' : 'upper' });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
  return { id, kind, centre, mount, engine, yaw, selfGimbal: moved, pivot: pivot.clone() };
}

/** Max radius of an engine's nozzle/chamber geometry within a band around engine-frame y. */
export function engineRadiusAt(m: EngineMount, y: number, band = 0.03): number {
  let best = 0;
  const v = new THREE.Vector3();
  m.engine.root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(m.engine.root.matrixWorld).invert();
  const wanted = new Set(['nozzle', 'combustion-chamber', 'engine', 'nozzle-extension', 'vacuum-engine']);
  m.engine.root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !wanted.has(mesh.userData.part)) return;
    if (mesh.userData.role && mesh.userData.role !== 'keep' && mesh.userData.role !== 'front') return;
    const pa = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const toRoot = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld);
    for (let i = 0; i < pa.count; i += 1) {
      v.fromBufferAttribute(pa, i).applyMatrix4(toRoot);
      if (Math.abs(v.y - y) < band) {
        const r = Math.hypot(v.x, v.z);
        // only the axisymmetric bell/chamber, not pipes beside it
        if (r > best && r < 0.62) best = r;
      }
    }
  });
  return best;
}

// ───────────────────────────── thrust section ─────────────────────────────

function thrustSection(ctx: Ctx) {
  const { kit } = ctx;
  const s = sec(ctx, 'thrust');
  wall(kit, s, {
    part: 'thrust-structure',
    mat: 'al-2219',
    y0: S.s1HeatShield,
    y1: S.s1ThrustSectionTop,
    skin: 0.006,
    outerLook: 'graphite',
    innerLook: 'alu',
    inner: 'cut',
    frames: [
      { y: 1.95, depth: 0.07 },
      { y: 2.6, depth: 0.07 },
    ],
    stringers: { count: 36, depth: 0.03, y0: 1.45, y1: 4.18 },
    endLands: { bottom: [0.1, 0.04], top: [0.12, 0.05] },
    bevelBottom: 0.014,
  });
  jointBand(kit, s, S.s1ThrustSectionTop - 0.02, 'graphite', 'thrust-structure', 'al-2219', { bolts: kit.hangar ? 120 : 0, h: 0.045 });
  // bottom rim band
  jointBand(kit, s, S.s1HeatShield + 0.05, 'graphite', 'thrust-structure', 'al-2219', { bolts: kit.hangar ? 96 : 0, h: 0.06, proud: 0.004 });

  // hold-down fittings: machined lugs the pad clamps grip, on doubler plates
  for (const phi of AZ.holdDowns) {
    const spec = { part: 'thrust-structure' as const, mat: 'titanium' as const, look: 'titanium', cut: true };
    kit.add(s.group, bevelBox(0.46, 0.66, 0.012, 0.004), spec, radialFrame(R + 0.006, phi, 1.72));
    const lug = bevelBox(0.28, 0.44, 0.13, 0.018);
    kit.add(s.group, lug, spec, radialFrame(R + 0.075, phi, 1.62));
    const pin = new THREE.CylinderGeometry(0.068, 0.068, 0.36, kit.seg.tiny * 2);
    pin.rotateZ(Math.PI / 2);
    kit.add(s.group, pin, spec, radialFrame(R + 0.1, phi, 1.46));
    const pinEnd = new THREE.CylinderGeometry(0.04, 0.04, 0.4, kit.seg.tiny);
    pinEnd.rotateZ(Math.PI / 2);
    kit.add(s.group, pinEnd, { ...spec, look: 'stainless', mat: 'stainless' }, radialFrame(R + 0.1, phi, 1.46));
    if (kit.hangar)
      for (let i = 0; i < 10; i++) {
        const bx = ((i % 5) - 2) * 0.085;
        const by = i < 5 ? 1.98 : 1.44;
        const b = new THREE.CylinderGeometry(0.011, 0.011, 0.008, 6);
        b.rotateX(Math.PI / 2);
        b.translate(bx, by - 1.72, 0.01);
        kit.add(s.group, b, spec, radialFrame(R + 0.006, phi, 1.72));
      }
  }

  if (!kit.hangar) return s;
  // ── thrust structure (visible in the cutaway): outer thrust ring, six radial I-beams between
  // the outer engines, a centre drum, and a bridge over each outer engine carrying its mount
  const yB0 = 2.64;
  const yB1 = 3.1;
  solidRing(kit, s, 1.72, R - 0.006, yB0 - 0.02, yB1 + 0.02, 'aluMilled', 'thrust-structure', 'al-2219', { internal: true });
  solidRing(kit, s, 1.66, 1.74, yB0 - 0.02, yB0 + 0.02, 'aluMilled', 'thrust-structure', 'al-2219', { internal: true });
  solidRing(kit, s, 1.66, 1.74, yB1 - 0.02, yB1 + 0.02, 'aluMilled', 'thrust-structure', 'al-2219', { internal: true });
  const inner = { part: 'thrust-structure' as const, mat: 'al-2219' as const, look: 'aluMilled', internal: true, cut: false };
  kit.add(s.group, lathe(rectPoly(0.2, 0.28, yB0 - 0.02, yB1 + 0.02, 0.004), { seg: kit.seg.small * 2, closed: true, smooth: 50 }), inner);
  kit.add(s.group, lathe(rectPoly(0.12, 0.34, yB1, yB1 + 0.04, 0.003), { seg: kit.seg.small * 2, closed: true, smooth: 50 }), inner);
  kit.add(s.group, lathe(rectPoly(0.12, 0.34, yB0 - 0.04, yB0, 0.003), { seg: kit.seg.small * 2, closed: true, smooth: 50 }), inner);
  const r0 = 0.28;
  const r1 = 1.72;
  const len = r1 - r0;
  const hgt = yB1 - yB0;
  for (let k = 0; k < 6; k++) {
    const a = k * 60 * DEG; // between the outer engines (engines at 30 + 60k)
    const web = new THREE.Shape();
    web.moveTo(0, 0);
    web.lineTo(len, 0);
    web.lineTo(len, hgt);
    web.lineTo(0, hgt);
    web.closePath();
    for (const cx of [0.3, 0.62, 0.94, 1.24]) {
      const h = new THREE.Path();
      h.absellipse(cx, hgt / 2, 0.1, 0.12, 0, Math.PI * 2, true, 0);
      web.holes.push(h);
    }
    const wg = new THREE.ExtrudeGeometry(web, { depth: 0.014, bevelEnabled: false, curveSegments: 12 });
    wg.translate(0, 0, -0.007);
    // local x radial (math angle a), y up, z tangential
    const m = new THREE.Matrix4().makeBasis(V(Math.cos(a), 0, Math.sin(a)), V(0, 1, 0), V(-Math.sin(a), 0, Math.cos(a)));
    m.setPosition(r0 * Math.cos(a), yB0, r0 * Math.sin(a));
    kit.add(s.group, wg, { ...inner, cut: true }, m);
    for (const y of [0, hgt]) {
      const fl = new THREE.BoxGeometry(len, 0.02, 0.15);
      fl.translate(len / 2, y + (y > 0 ? 0.01 : -0.01), 0);
      kit.add(s.group, fl, { ...inner, cut: true }, m);
    }
  }
  return s;
}

function thrustMounts(ctx: Ctx, s: Section) {
  const { kit } = ctx;
  if (!kit.hangar) return;
  const spec = { part: 'thrust-structure' as const, mat: 'titanium' as const, look: 'titanium', internal: true, cut: false };
  const yB0 = 2.64;
  for (const e of ENGINES) {
    // gimbal mount post from the engine's pivot block up to the structure
    const post = new THREE.CylinderGeometry(0.095, 0.12, yB0 - (S.s1Gimbal + 0.12), kit.seg.small);
    post.translate(e.x, (yB0 + S.s1Gimbal + 0.12) / 2, e.z);
    kit.add(s.group, post, spec);
    if (e.centre) continue;
    // bridge between the two neighbouring beams, tangential, over the engine axis
    const half = 1.2 * Math.tan(30 * DEG) - 0.01;
    const bridge = bevelBox(0.14, 0.22, half * 2, 0.012);
    const m = new THREE.Matrix4().makeBasis(V(Math.cos(e.a), 0, Math.sin(e.a)), V(0, 1, 0), V(-Math.sin(e.a), 0, Math.cos(e.a)));
    m.setPosition(e.x, yB0 + 0.11, e.z);
    kit.add(s.group, bridge, { ...spec, look: 'aluMilled', mat: 'al-2219' as never }, m);
  }
}

// ───────────────────────────── base heat shield & engines ─────────────────────────────

function heatShield(ctx: Ctx) {
  const { kit } = ctx;
  const s = sec(ctx, 'heatshield');
  const holes = ENGINES.map((e) => ({ x: e.x, z: e.z, r: 0.47 }));
  const spec = { part: 'base-heat-shield' as const, mat: 'nickel-superalloy' as const, look: 'heatShield', cut: false };
  kit.add(s.group, platePlan(R - 0.008, holes, S.s1HeatShield - 0.02, S.s1HeatShield + 0.035, kit.hangar ? 40 : 20, 0.006), spec);
  // bolted panel joints on the underside: six radial straps and a ring strap
  for (let k = 0; k < 6; k++) {
    const a = k * 60 * DEG;
    const strap = new THREE.BoxGeometry(1.26, 0.012, 0.05);
    strap.translate(1.19, 0, 0);
    strap.rotateY(-a);
    strap.translate(0, S.s1HeatShield - 0.026, 0);
    kit.add(s.group, strap, spec);
  }
  const ring = lathe(rectPoly(1.7, 1.78, S.s1HeatShield - 0.032, S.s1HeatShield - 0.02, 0.002), { seg: kit.seg.mid, closed: true, smooth: 50 });
  kit.add(s.group, ring, spec);
  if (kit.hangar) {
    const bolts: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 6; k++)
      for (let i = 0; i < 9; i++) {
        const a = k * 60 * DEG;
        const r = 0.62 + i * 0.13;
        const b = new THREE.CylinderGeometry(0.009, 0.009, 0.006, 6);
        b.translate(r * Math.cos(a), S.s1HeatShield - 0.035, r * Math.sin(a));
        bolts.push(b);
      }
    kit.add(s.group, mergeAll(bolts), { ...spec, noCast: true });
  }
  return s;
}

function engines(ctx: Ctx, hs: Section) {
  const s = sec(ctx, 'engines');
  const detail = s1EngineDetail(ctx.hangar);
  // The engine facing the pad cameras is a full engine model (its sub-parts can be selected and
  // it runs the engine demonstrations); the other six are instances of one baked engine model
  // (one draw call per material for all six), gimballed rigidly per instance.
  const primary = ENGINES.reduce((a, b) => (b.z > a.z ? b : a)).id;
  const others = ENGINES.filter((e) => e.id !== primary);
  const template = buildEngine('E-1', detail);
  const baked = bakeModel(template.root);
  const meshes = baked.map((b) => {
    const im = new THREE.InstancedMesh(b.geometry, b.material, others.length);
    im.name = `engine-cluster:${b.part ?? 'engine'}`;
    im.castShadow = true;
    im.receiveShadow = true;
    im.userData.subPart = b.part;
    s.group.add(im);
    ctx.kit.register(im, { kind: 'solid', part: 's1-engine-cluster', mat: b.mat ?? 'stainless', body: 'booster' });
    return im;
  });
  ctx.movers.cluster = {
    meshes,
    set(i, m) {
      for (const im of meshes) im.setMatrixAt(i, m);
    },
    commit() {
      for (const im of meshes) {
        im.instanceMatrix.needsUpdate = true;
        im.boundingSphere = null;
        im.boundingBox = null;
      }
    },
  };
  for (const e of ENGINES) {
    const pivot = V(e.x, S.s1Gimbal, e.z);
    if (e.id === primary) {
      ctx.movers.engines.push(mountEngine(ctx, s.group, e.id, 'E-1', detail, pivot, e.yaw, e.centre));
      continue;
    }
    const k = others.indexOf(e);
    const mount = new THREE.Group();
    mount.name = `engine-pose:${e.id}`;
    mount.position.copy(pivot);
    mount.rotation.y = e.yaw;
    mount.updateMatrix();
    ctx.movers.cluster.set(k, mount.matrix);
    ctx.movers.engines.push({ id: e.id, kind: 'E-1', centre: e.centre, mount, engine: template, yaw: e.yaw, selfGimbal: false, pivot, instance: k });
  }
  ctx.movers.cluster.commit();

  // flexible thermal boots between the plate cut-outs and each nozzle (live geometry follows the
  // gimbal): all seven in one mesh
  const yBot = S.s1HeatShield - 0.24;
  const yEng = yBot - S.s1Gimbal;
  const live = ctx.movers.engines.find((m) => m.instance === undefined)!;
  let rb = engineRadiusAt(live, yEng);
  if (rb < 0.12 || rb > 0.45) rb = 0.24;
  const folds = 5;
  const segs = ctx.kit.seg.small * 2;
  const rows = folds * 4 + 1;
  const per = (segs + 1) * rows;
  const count = ctx.movers.engines.length;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(per * count * 3), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(per * count * 3), 3));
  const uv = new Float32Array(per * count * 2);
  const idx: number[] = [];
  for (let k = 0; k < count; k++) {
    const o = k * per;
    for (let j = 0; j < rows; j++) for (let i = 0; i <= segs; i++) uv.set([(i / segs) * 12, (j / (rows - 1)) * 2], (o + j * (segs + 1) + i) * 2);
    for (let j = 0; j < rows - 1; j++)
      for (let i = 0; i < segs; i++) {
        const a = o + j * (segs + 1) + i;
        const b = a + segs + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  const mesh = new THREE.Mesh(g, ctx.mats.get('boot'));
  mesh.name = 'engine-boots';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  hs.group.add(mesh);
  ctx.kit.register(mesh, { kind: 'solid', part: 'base-heat-shield', mat: 'ceramic-tiles', body: 'booster' });
  ctx.movers.engines.forEach((m, k) => ctx.movers.boots.push({ mesh, offset: k * per, segs, engine: m, rTop: 0.47, yTop: S.s1HeatShield - 0.015, rBot: rb + 0.012, yBotEngine: yEng, folds }));
}

const _bb = new THREE.Vector3();
let _ring = new Float64Array(0);
const _bq = new THREE.Quaternion();

/** Update the boot shapes for the current engine gimbal rotations (no allocations). */
export function updateBoots(ctx: Ctx, rot: (m: EngineMount, out: THREE.Quaternion) => THREE.Quaternion, only?: (m: EngineMount) => boolean) {
  const boots = ctx.movers.boots;
  if (!boots.length) return;
  const geo = boots[0].mesh.geometry;
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const nor = geo.getAttribute('normal') as THREE.BufferAttribute;
  const P = pos.array as Float32Array;
  const N = nor.array as Float32Array;
  for (const b of boots) {
    if (only && !only(b.engine)) continue;
    const q = rot(b.engine, _bq);
    const segs = b.segs;
    const cols = segs + 1;
    const rows = b.folds * 4 + 1;
    const piv = b.engine.pivot;
    // the two rings once per column: top ring fixed on the plate, bottom ring on the nozzle
    // (rotates with the engine); the rows in between are blends of them
    if (_ring.length < cols * 8) _ring = new Float64Array(cols * 8);
    const RG = _ring;
    for (let i = 0; i <= segs; i++) {
      const phi = (i / segs) * Math.PI * 2;
      const sn = Math.sin(phi);
      const c = Math.cos(phi);
      _bb.set(b.rBot * sn, b.yBotEngine, b.rBot * c).applyQuaternion(q).add(piv);
      const o = i * 8;
      RG[o] = piv.x + b.rTop * sn;
      RG[o + 1] = b.yTop;
      RG[o + 2] = piv.z + b.rTop * c;
      RG[o + 3] = _bb.x;
      RG[o + 4] = _bb.y;
      RG[o + 5] = _bb.z;
      RG[o + 6] = sn;
      RG[o + 7] = c;
    }
    for (let j = 0; j < rows; j++) {
      const t = j / (rows - 1);
      const bulge = Math.sin(t * Math.PI) * 0.035 + (j % 4 === 1 ? 0.018 : j % 4 === 3 ? -0.008 : 0.006);
      const w = t * t * (3 - 2 * t) * 0.35 + t * 0.65;
      const w0 = 1 - w;
      for (let i = 0; i <= segs; i++) {
        const o = i * 8;
        const k = (b.offset + j * cols + i) * 3;
        P[k] = RG[o] * w0 + RG[o + 3] * w + RG[o + 6] * bulge;
        P[k + 1] = RG[o + 1] * w0 + RG[o + 4] * w;
        P[k + 2] = RG[o + 2] * w0 + RG[o + 5] * w + RG[o + 7] * bulge;
      }
    }
    // grid normals from central differences (the grid is a closed loop in i, open in j): far
    // cheaper than re-deriving them from the triangles every frame
    for (let j = 0; j < rows; j++) {
      const ja = (j > 0 ? j - 1 : j) * cols;
      const jb = (j < rows - 1 ? j + 1 : j) * cols;
      for (let i = 0; i <= segs; i++) {
        const il = i > 0 ? i - 1 : segs - 1;
        const ir = i < segs ? i + 1 : 1;
        const a = (b.offset + j * cols + il) * 3;
        const c2 = (b.offset + j * cols + ir) * 3;
        const d = (b.offset + ja + i) * 3;
        const e = (b.offset + jb + i) * 3;
        const ux = P[c2] - P[a];
        const uy = P[c2 + 1] - P[a + 1];
        const uz = P[c2 + 2] - P[a + 2];
        const vx = P[e] - P[d];
        const vy = P[e + 1] - P[d + 1];
        const vz = P[e + 2] - P[d + 2];
        // down the boot x around (+phi) points outward
        let nx = vy * uz - vz * uy;
        let ny = vz * ux - vx * uz;
        let nz = vx * uy - vy * ux;
        const l = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz + 1e-20);
        nx *= l;
        ny *= l;
        nz *= l;
        const k = (b.offset + j * cols + i) * 3;
        N[k] = nx;
        N[k + 1] = ny;
        N[k + 2] = nz;
      }
    }
  }
  pos.needsUpdate = true;
  nor.needsUpdate = true;
}

// ───────────────────────────── tanks ─────────────────────────────

const RIBS = { pitch: 0.36, depth: WALL.rib, width: WALL.ribW, axial: 32 };

function baffles(ctx: Ctx, s: Section, ys: number[], part: 's1-lox-tank' | 's1-fuel-tank' | 's2-tanks') {
  const r1 = R - WALL.skin - WALL.rib;
  for (const y of ys) {
    // annular slosh baffle plate with a stiffening lip
    solidRing(ctx.kit, s, r1 - 0.2, r1 + 0.004, y - 0.003, y + 0.003, 'aluMilled', part, 'al-2219', { internal: true });
    solidRing(ctx.kit, s, r1 - 0.2, r1 - 0.19, y - 0.04, y + 0.003, 'aluMilled', part, 'al-2219', { internal: true });
  }
}

function antiVortex(ctx: Ctx, s: Section, x: number, y: number, z: number, size: number, part: 's1-lox-tank' | 's1-fuel-tank' | 's2-tanks', up = 1) {
  const spec = { part, mat: 'al-2219' as const, look: 'aluMilled', internal: true, cut: false };
  for (let k = 0; k < 2; k++) {
    const p = new THREE.BoxGeometry(size, size * 0.9, 0.008);
    p.rotateY(k * (Math.PI / 2) + Math.PI / 4);
    p.translate(x, y + (up * size * 0.9) / 2, z);
    ctx.kit.add(s.group, p, spec);
  }
  const disc = new THREE.CylinderGeometry(size * 0.62, size * 0.62, 0.008, 24);
  disc.translate(x, y + up * size * 0.9, z);
  ctx.kit.add(s.group, disc, spec);
}

function rp1Tank(ctx: Ctx) {
  const { kit } = ctx;
  const s = sec(ctx, 'rp1');
  wall(kit, s, {
    part: 's1-fuel-tank',
    mat: 'al-li',
    y0: S.s1ThrustSectionTop,
    y1: S.s1FuelFwdEquator,
    skin: WALL.skin,
    outerLook: 'paintSeam',
    innerLook: 'alu',
    inner: 'cut',
    ribs: RIBS,
    lands: [{ y: S.s1FuelAftEquator, h: 0.12, t: 0.032 }],
    endLands: { bottom: [0.08, 0.02], top: [0.1, 0.03] },
  });
  dome(kit, s, { part: 's1-fuel-tank', mat: 'al-2219', yEq: S.s1FuelAftEquator, dir: -1, a: WALL.domeA, b: H, t: WALL.dome, rHole: 0.262, look: 'alu', gores: 8 });
  dome(kit, s, { part: 's1-fuel-tank', mat: 'al-2219', yEq: S.s1FuelFwdEquator, dir: 1, a: WALL.domeA, b: H, t: WALL.dome, rHole: 0.262, look: 'alu', gores: 8 });
  if (!kit.hangar) return s;
  // downcomer collars where it passes through both domes
  const yAftHole = S.s1FuelAftEquator - H * Math.sqrt(1 - (0.262 / WALL.domeA) ** 2);
  const yFwdHole = S.s1FuelFwdEquator + H * Math.sqrt(1 - (0.262 / WALL.domeA) ** 2);
  solidRing(kit, s, 0.252, 0.31, yAftHole - 0.05, yAftHole + 0.04, 'aluMilled', 's1-fuel-tank', 'al-2219', { internal: true, cut: false });
  solidRing(kit, s, 0.252, 0.31, yFwdHole - 0.04, yFwdHole + 0.05, 'aluMilled', 's1-fuel-tank', 'al-2219', { internal: true, cut: false });
  baffles(ctx, s, [8.0, 10.95, 13.7], 's1-fuel-tank');
  // RP-1 outlets above each engine: sump fittings, flanges and anti-vortex cruciforms
  for (const o of rp1Outlets()) {
    const yd = S.s1FuelAftEquator - H * Math.sqrt(1 - (Math.hypot(o.x, o.z) / WALL.domeA) ** 2);
    const spec = { part: 's1-fuel-tank' as const, mat: 'al-2219' as const, look: 'aluMilled', internal: true, cut: false };
    kit.add(s.group, lathe(rectPoly(0.07, 0.092, yd - 0.16, yd + 0.05, 0.004), { seg: kit.seg.small, closed: true, smooth: 50 }), spec, new THREE.Matrix4().makeTranslation(o.x, 0, o.z));
    kit.add(s.group, lathe(rectPoly(0.07, 0.14, yd - 0.18, yd - 0.15, 0.003), { seg: kit.seg.small, closed: true, smooth: 50 }), spec, new THREE.Matrix4().makeTranslation(o.x, 0, o.z));
    antiVortex(ctx, s, o.x, yd + 0.02, o.z, 0.18, 's1-fuel-tank');
  }
  // LOX downcomer: through the RP-1 tank centre from the LOX outlet into the thrust section
  const dSpec = { part: 'lox-downcomer' as const, mat: 'al-2219' as const, look: 'alu', internal: true, cut: false };
  const bSpec = { part: 'lox-downcomer' as const, mat: 'stainless' as const, look: 'stainless', internal: true, cut: false };
  const tube = (y0: number, y1: number) => kit.add(s.group, lathe(rectPoly(WALL.downcomer - 0.007, WALL.downcomer, y0, y1, 0.002), { seg: kit.seg.small * 2, closed: true, smooth: 50 }), dSpec);
  const flange = (y: number) => kit.add(s.group, lathe(rectPoly(WALL.downcomer - 0.007, WALL.downcomer + 0.045, y - 0.025, y + 0.025, 0.004), { seg: kit.seg.small * 2, closed: true, smooth: 50 }), dSpec);
  const bellows = (y0: number, y1: number) => {
    const pts: P2[] = [];
    const n = 9;
    for (let i = 0; i <= n * 2; i++) {
      const y = y1 - ((y1 - y0) * i) / (n * 2);
      pts.push([WALL.downcomer + (i % 2 ? 0.03 : 0.004), y]);
    }
    kit.add(s.group, lathe(pts, { seg: kit.seg.small * 2, smooth: 80 }), bSpec);
  };
  bellows(17.0, 17.26);
  flange(16.97);
  tube(4.95, 16.97);
  flange(4.95);
  flange(10.4);
  bellows(4.28, 4.92);
  flange(4.27);
  tube(3.72, 4.27);
  // mid-span support: clamp ring and three struts to the wall (clear of the cutaway wedge)
  solidRing(kit, s, WALL.downcomer, WALL.downcomer + 0.05, 10.3, 10.5, 'aluMilled', 'lox-downcomer', 'al-2219', { internal: true, cut: false });
  for (const d of [10, 130, 250]) {
    const phi = d * DEG;
    kit.add(s.group, rod(polar(WALL.downcomer + 0.04, phi, 10.4), polar(R - 0.035, phi, 10.9), 0.022, 8), { ...dSpec, look: 'aluMilled' });
  }
  // RP-1 pressurant inlet and diffuser under the forward dome
  const phiP = AZ.raceway;
  const yIn = S.s1FuelFwdEquator + H * Math.sqrt(1 - (0.6 / WALL.domeA) ** 2);
  const pSpec = { part: 'pressurization' as const, mat: 'titanium' as const, look: 'titanium', internal: true, cut: false };
  kit.add(s.group, rod(polar(0.6, phiP, yIn + 0.1), polar(0.6, phiP, yIn - 0.3), 0.022, 10), pSpec);
  diffuser(ctx, s, polar(0.6, phiP, yIn - 0.3), 0.065, 0.32, 'pressurization');
  ctx.liquids.push({ tank: 's1Rp1', section: s });
  return s;
}

/** Engine feed interfaces (model frame, zero gimbal): top of the LOX and RP-1 inlet flanges. */
export function engineIface(e: (typeof ENGINES)[number]): { lox: THREE.Vector3; fuel: THREE.Vector3 } {
  const cy = Math.cos(e.yaw);
  const sy = Math.sin(e.yaw);
  const to = (v: THREE.Vector3) => V(e.x + v.x * cy + v.z * sy, S.s1Gimbal + ENGINE_IFACE.y, e.z - v.x * sy + v.z * cy);
  return { lox: to(ENGINE_IFACE.lox), fuel: to(ENGINE_IFACE.rp1) };
}

/** RP-1 outlets on the aft dome: inboard of each fuel inlet (the centre engine's at r 0.62). */
export function rp1Outlets(): { x: number; z: number; engine: string }[] {
  return ENGINES.map((e) => {
    const f = engineIface(e).fuel;
    if (e.centre) {
      const r = Math.hypot(f.x, f.z);
      return { x: (f.x / r) * 0.64, z: (f.z / r) * 0.64, engine: e.id };
    }
    const cy = Math.cos(e.yaw);
    const sy = Math.sin(e.yaw);
    const v = V(-0.03, 0, ENGINE_IFACE.rp1.z);
    return { x: e.x + v.x * cy + v.z * sy, z: e.z - v.x * sy + v.z * cy, engine: e.id };
  });
}

/** Perforated pressurant diffuser (cylinder hanging from a port). */
function diffuser(ctx: Ctx, s: Section, top: THREE.Vector3, r: number, len: number, part: 'pressurization') {
  const spec = { part, mat: 'titanium' as const, look: 'titanium', internal: true, cut: false };
  const g = lathe(
    [
      [0.0, top.y - len],
      [r, top.y - len],
      [r, top.y],
      [r * 0.4, top.y + 0.02],
    ],
    { seg: 20, smooth: 40 },
  );
  ctx.kit.add(s.group, g, spec, new THREE.Matrix4().makeTranslation(top.x, 0, top.z));
  // rows of holes suggested by dark rings
  for (let i = 1; i < 6; i++) {
    const ring = lathe(rectPoly(r - 0.001, r + 0.002, top.y - (len * i) / 6 - 0.006, top.y - (len * i) / 6 + 0.006, 0), { seg: 20, closed: true, smooth: 50 });
    ctx.kit.add(s.group, ring, { ...spec, look: 'blackAnod' }, new THREE.Matrix4().makeTranslation(top.x, 0, top.z));
  }
}

function intertank(ctx: Ctx) {
  const { kit } = ctx;
  const s = sec(ctx, 'intertank');
  wall(kit, s, {
    part: 's1-intertank',
    mat: 'al-li',
    y0: S.s1FuelFwdEquator,
    y1: S.s1LoxAftEquator,
    skin: 0.004,
    outerLook: 'paintSeam',
    innerLook: 'alu',
    inner: 'cut',
    frames: [
      { y: 16.55, depth: 0.1, flange: 0.06 },
      { y: 17.75, depth: 0.1, flange: 0.06 },
    ],
    stringers: { count: 48, depth: 0.034 },
    endLands: { bottom: [0.06, 0.02], top: [0.06, 0.02] },
  });
  jointBand(kit, s, S.s1FuelFwdEquator + 0.025, 'paint', 's1-intertank', 'al-2219', { bolts: kit.hangar ? 144 : 0 });
  jointBand(kit, s, S.s1LoxAftEquator - 0.025, 'paint', 's1-intertank', 'al-2219', { bolts: kit.hangar ? 144 : 0 });
  // access door toward the pad cameras
  const phiD = -32 * DEG;
  const dSpec = { part: 's1-intertank' as const, mat: 'al-li' as const, look: 'paint', cut: true };
  kit.add(s.group, bevelBox(0.62, 0.82, 0.008, 0.003), dSpec, radialFrame(R + 0.002, phiD, 17.15));
  if (kit.hangar) {
    const bolts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 24; i++) {
      const t = i / 24;
      const per = 2 * (0.56 + 0.76);
      let d = t * per;
      let x: number;
      let y: number;
      if (d < 0.56) [x, y] = [-0.28 + d, 0.38];
      else if ((d -= 0.56) < 0.76) [x, y] = [0.28, 0.38 - d];
      else if ((d -= 0.76) < 0.56) [x, y] = [0.28 - d, -0.38];
      else [x, y] = [-0.28, -0.38 + (d - 0.56)];
      const b = new THREE.CylinderGeometry(0.009, 0.009, 0.006, 6);
      b.rotateX(Math.PI / 2);
      b.translate(x, y, 0.007);
      bolts.push(b);
    }
    kit.add(s.group, mergeAll(bolts), { ...dSpec, noCast: true }, radialFrame(R + 0.002, phiD, 17.15));
    // RP-1 pressurant line: from the raceway through the intertank to the RP-1 forward dome
    const yIn = S.s1FuelFwdEquator + H * Math.sqrt(1 - (0.6 / WALL.domeA) ** 2);
    const pts = [polar(R + 0.03, AZ.raceway, 18.3), polar(1.7, AZ.raceway, 18.3), polar(1.2, AZ.raceway, 17.35), polar(0.6, AZ.raceway, 17.35), polar(0.6, AZ.raceway, yIn + 0.1)];
    kit.add(s.group, pipe(pts, 0.022, 0.15, 10), { part: 'pressurization', mat: 'titanium', look: 'titanium', internal: true, cut: false });
  }
  return s;
}

function loxTank(ctx: Ctx) {
  const { kit } = ctx;
  const s = sec(ctx, 'lox');
  wall(kit, s, {
    part: 's1-lox-tank',
    mat: 'al-li',
    y0: S.s1LoxAftEquator,
    y1: S.s1LoxFwdEquator,
    skin: WALL.skin,
    outerLook: 'paintSeam',
    innerLook: 'alu',
    inner: 'cut',
    ribs: RIBS,
    endLands: { bottom: [0.1, 0.03], top: [0.1, 0.03] },
  });
  dome(kit, s, { part: 's1-lox-tank', mat: 'al-2219', yEq: S.s1LoxAftEquator, dir: -1, a: WALL.domeA, b: H, t: WALL.dome, rHole: 0.235, look: 'alu', gores: 8 });
  dome(kit, s, { part: 's1-lox-tank', mat: 'al-2219', yEq: S.s1LoxFwdEquator, dir: 1, a: WALL.domeA, b: H, t: WALL.dome, rHole: 0.2, look: 'alu', gores: 8 });
  livery(ctx, s);
  if (!kit.hangar) return s;
  const yOut = S.s1LoxAftEquator - H * Math.sqrt(1 - (0.235 / WALL.domeA) ** 2);
  solidRing(kit, s, 0.225, 0.3, yOut - 0.06, yOut + 0.03, 'aluMilled', 's1-lox-tank', 'al-2219', { internal: true, cut: false });
  antiVortex(ctx, s, 0, yOut + 0.03, 0, 0.42, 's1-lox-tank');
  const yTop = S.s1LoxFwdEquator + H * Math.sqrt(1 - (0.2 / WALL.domeA) ** 2);
  solidRing(kit, s, 0.19, 0.3, yTop - 0.02, yTop + 0.05, 'aluMilled', 's1-lox-tank', 'al-2219', { internal: true, cut: false });
  kit.add(s.group, lathe(rectPoly(0, 0.3, yTop + 0.05, yTop + 0.075, 0.004), { seg: 32, closed: true, smooth: 50 }), { part: 's1-lox-tank', mat: 'al-2219', look: 'aluMilled', internal: true, cut: false });
  kit.add(s.group, boltRing(0.27, yTop + 0.075, 20, 0.008, 0.006), { part: 's1-lox-tank', mat: 'al-2219', look: 'stainless', internal: true, cut: false }, new THREE.Matrix4().makeRotationX(0));
  baffles(ctx, s, [21.4, 24.6, 27.8, 31.0], 's1-lox-tank');
  // helium COPVs on brackets near the top of the tank (submerged in LOX at full load)
  const pSpec = { part: 'pressurization' as const, mat: 'cfrp-copv' as const, look: 'copv', internal: true, cut: false };
  const tSpec = { part: 'pressurization' as const, mat: 'titanium' as const, look: 'titanium', internal: true, cut: false };
  const rc = 0.28;
  const y0 = 32.3;
  const y1 = 33.9;
  const tops: THREE.Vector3[] = [];
  for (const phi of AZ.copvs) {
    const c = polar(1.47, phi, 0);
    const prof: P2[] = [];
    for (let i = 0; i <= 10; i++) {
      const t = (-Math.PI / 2) * (1 - i / 10);
      prof.push([rc * Math.cos(t), y0 + rc * Math.sin(t)]);
    }
    for (let i = 0; i <= 10; i++) {
      const t = (Math.PI / 2) * (i / 10);
      prof.push([rc * Math.cos(t), y1 + rc * Math.sin(t)]);
    }
    kit.add(s.group, lathe(prof, { seg: kit.seg.small * 2, smooth: 40, uR: rc }), pSpec, new THREE.Matrix4().makeTranslation(c.x, 0, c.z));
    for (const yb of [y0 - rc - 0.04, y1 + rc]) {
      const boss = new THREE.CylinderGeometry(0.05, 0.06, 0.06, 14);
      boss.translate(c.x, yb + 0.02, c.z);
      kit.add(s.group, boss, tSpec);
    }
    const rad = polar(1, phi, 0);
    const tan = V(Math.cos(phi), 0, -Math.sin(phi));
    for (const yb of [32.7, 33.5]) {
      const band = new THREE.TorusGeometry(rc + 0.008, 0.012, 6, 32);
      band.rotateX(Math.PI / 2);
      band.translate(c.x, yb, c.z);
      kit.add(s.group, band, tSpec);
      for (const d of [-1, 1]) {
        const a = c.clone().addScaledVector(rad, rc * 0.8).addScaledVector(tan, d * rc * 0.55).setY(yb);
        const b = polar(R - 0.034, phi + d * 0.09, yb + 0.12);
        kit.add(s.group, rod(a, b, 0.014, 6), tSpec);
      }
    }
    tops.push(c.clone().setY(y1 + rc + 0.06));
  }
  // pressurant lines: bottles -> collector -> diffuser at the forward dome apex
  const yC = 35.1;
  const lines: THREE.Vector3[][] = [];
  for (const t of tops) lines.push([t, t.clone().setY(yC - 0.3), polar(1.3, Math.atan2(t.x, t.z), yC)]);
  const arc: THREE.Vector3[] = [];
  for (let i = 0; i <= 12; i++) arc.push(polar(1.3, AZ.copvs[0] + ((AZ.copvs[2] - AZ.copvs[0]) * i) / 12, yC));
  for (const l of lines) kit.add(s.group, pipe(l, 0.018, 0.12, 8), tSpec);
  kit.add(s.group, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arc), 40, 0.024, 8, false), tSpec);
  const mid = polar(1.3, AZ.copvs[1], yC);
  const diffTop = V(0, yTop - 0.03, 0);
  kit.add(s.group, pipe([mid, polar(0.9, AZ.copvs[1], yC + 0.25), V(0.15 * Math.sin(AZ.copvs[1]), yTop - 0.35, 0.15 * Math.cos(AZ.copvs[1])), V(0.08 * Math.sin(AZ.copvs[1]), yTop - 0.2, 0.08 * Math.cos(AZ.copvs[1]))], 0.022, 0.2, 10), tSpec);
  diffuser(ctx, s, diffTop, 0.1, 0.5, 'pressurization');
  // RP-1 pressurant takeoff: up through the forward dome toward the raceway
  const phiR = AZ.raceway;
  const yDomeR = S.s1LoxFwdEquator + H * Math.sqrt(1 - (1.25 / WALL.domeA) ** 2);
  kit.add(s.group, pipe([polar(1.3, phiR, yC), polar(1.25, phiR, yC + 0.3), polar(1.25, phiR, yDomeR + 0.06)], 0.02, 0.12, 8), tSpec);
  ctx.liquids.push({ tank: 's1Lox', section: s });
  ctx.flows.push(
    ...tops.map((t) => ({ kind: 'he' as const, demo: 'tank-pressure' as const, points: [t, t.clone().setY(yC - 0.3), polar(1.3, Math.atan2(t.x, t.z), yC), mid, polar(0.9, AZ.copvs[1], yC + 0.25), diffTop.clone().setY(yTop - 0.4)], radius: 0.035, section: s })),
  );
  return s;
}

function livery(ctx: Ctx, s: Section) {
  const { kit } = ctx;
  // KIMBLE wordmark reading bottom-to-top, K mark above it, facing +Z (the pad cameras)
  const cap = 1.5;
  const len = wordWidth('kimble', cap);
  const yStart = 20.4;
  const markSize = 1.95;
  const markY = yStart + len + 0.85 + markSize / 2;
  const d = makeDecal(ctx.mats, {
    key: 's1-kimble',
    r: R + 0.0025,
    phiC: 0,
    halfW: 1.0,
    y0: yStart - 0.3,
    y1: markY + markSize / 2 + 0.2,
    color: GRAPHITE,
    items: [
      { kind: 'kimble', s: cap / 2, y: yStart, cap, vertical: true },
      { kind: 'mark', s: 0, y: markY, size: markSize },
    ],
    ppm: 300,
    maxTex: ctx.maxTex,
  });
  kit.add(s.group, d.geom, { part: 's1-lox-tank', mat: 'al-li', look: d.look, cut: true, shadow: false });
}

function forwardSkirt(ctx: Ctx) {
  const { kit } = ctx;
  const s = sec(ctx, 'fwdskirt');
  const top = S.s1ForwardSkirtTop;
  wall(kit, s, {
    part: 's1-lox-tank',
    mat: 'al-li',
    y0: S.s1LoxFwdEquator,
    y1: top,
    skin: 0.005,
    outerLook: 'paint',
    innerLook: 'alu',
    inner: 'cut',
    frames: [
      { y: 36.78, depth: 0.07 },
      { y: 37.38, depth: 0.07 },
    ],
    stringers: { count: 36, depth: 0.03 },
    endLands: { top: [0.1, 0.045], bottom: [0.06, 0.02] },
  });
  jointBand(kit, s, S.s1LoxFwdEquator + 0.02, 'paint', 's1-lox-tank', 'al-2219', { h: 0.04 });
  jointBand(kit, s, top - 0.025, 'paint', 's1-lox-tank', 'al-2219', { bolts: kit.hangar ? 144 : 0 });
  // LOX vent port (louvred) toward the pad cameras
  const vy = 37.05;
  const vSpec = { part: 's1-lox-tank' as const, mat: 'al-2219' as const, look: 'aluDark', cut: true };
  kit.add(s.group, bevelBox(0.34, 0.24, 0.02, 0.006), { ...vSpec, look: 'paint' }, radialFrame(R + 0.004, AZ.vent, vy));
  kit.add(s.group, bevelBox(0.28, 0.18, 0.012, 0.003), { ...vSpec, look: 'glassDark' }, radialFrame(R + 0.008, AZ.vent, vy));
  for (let i = 0; i < 4; i++) {
    const slat = new THREE.BoxGeometry(0.27, 0.012, 0.03);
    slat.rotateX(-0.5);
    kit.add(s.group, slat, vSpec, radialFrame(R + 0.016, AZ.vent, vy - 0.06 + i * 0.04));
  }
  ctx.vents.push(polar(R + 0.05, AZ.vent, vy));
  if (kit.hangar) {
    // vent duct from the LOX forward dome to the port
    const yD = S.s1LoxFwdEquator + H * Math.sqrt(1 - (0.9 / WALL.domeA) ** 2);
    kit.add(s.group, pipe([polar(0.9, AZ.vent, yD - 0.05), polar(0.9, AZ.vent, yD + 0.22), polar(1.45, AZ.vent, vy + 0.1), polar(R - 0.03, AZ.vent, vy)], 0.07, 0.18, 14), { part: 's1-lox-tank', mat: 'al-2219', look: 'alu', internal: true, cut: false, thermal: 0 });
    // RP-1 pressurant line from the dome takeoff to the raceway top
    const yDomeR = S.s1LoxFwdEquator + H * Math.sqrt(1 - (1.25 / WALL.domeA) ** 2);
    // (it follows the dome up to the skin and leaves through it under the RCS pod, into the raceway)
    kit.add(s.group, pipe([polar(1.25, AZ.raceway, yDomeR + 0.05), polar(1.25, AZ.raceway, yDomeR + 0.2), polar(1.62, AZ.raceway, 37.02), polar(1.79, AZ.raceway, 36.72), polar(R + 0.03, AZ.raceway, 36.64)], 0.02, 0.12, 8), { part: 'pressurization', mat: 'titanium', look: 'titanium', internal: true, cut: false });
  }
  return s;
}

/** The external raceway (cable and pressurant conduit) on the -X side, in three segments. */
function raceway(ctx: Ctx, sections: [Section, number, number, ('bottom' | 'top')?][]) {
  const { kit } = ctx;
  const phi = AZ.raceway;
  const W = 0.15;
  const Hc = 0.105;
  const n = kit.hangar ? 16 : 10;
  const base = (x: number) => Math.sqrt(R * R - x * x) - R - 0.002;
  const cross = (h: number): P2[] => {
    const pts: P2[] = [];
    // walk around: base edge (following the body), up the side, over a rounded top, down
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const a = Math.PI * t;
      const x = -W * Math.cos(a);
      const z = h * Math.pow(Math.sin(a), 0.55);
      pts.push([x, Math.max(z, base(x) + 0.001)]);
    }
    for (let i = 1; i < 6; i++) {
      const x = W - (2 * W * i) / 6;
      pts.push([x, base(x)]);
    }
    return pts.reverse();
  };
  const m = radialFrame(R, phi, 0);
  const ax = V(1, 0, 0).transformDirection(m);
  const az = V(0, 0, 1).transformDirection(m);
  const origin = V(0, 0, 0).applyMatrix4(m);
  for (const [s, y0, y1, joined] of sections) {
    // tapered ends, except where the next section's segment continues the conduit (flat joint)
    const ys = [...(joined === 'bottom' ? [y0] : [y0, y0 + 0.08, y0 + 0.35]), ...(joined === 'top' ? [y1] : [y1 - 0.35, y1 - 0.08, y1])];
    const hs = [...(joined === 'bottom' ? [1] : [0.01, 0.04, 1]), ...(joined === 'top' ? [1] : [1, 0.04, 0.01])];
    const secs = ys.map((_, i) => cross(Hc * hs[i]));
    const frames = ys.map((y) => ({ o: origin.clone().setY(y), ax, az }));
    kit.add(s.group, loft(secs, frames), { part: 'raceway', mat: 'al-2219', look: 'paint', cut: true });
    // support straps
    const straps: THREE.BufferGeometry[] = [];
    for (let y = y0 + 0.6; y < y1 - 0.4; y += 1.2) {
      const c = cross(Hc + 0.006).map(([x, z]) => [x * 1.04, z] as P2);
      straps.push(loft([c, c], [0, 1].map((k) => ({ o: origin.clone().setY(y + k * 0.045), ax, az }))));
    }
    if (straps.length) kit.add(s.group, mergeAll(straps), { part: 'raceway', mat: 'al-2219', look: 'paint', cut: true });
  }
}

// ───────────────────────────── interstage & separation ─────────────────────────────

function interstage(ctx: Ctx) {
  const { kit } = ctx;
  const s = sec(ctx, 'interstage');
  const y0 = S.s1ForwardSkirtTop;
  const y1 = S.interstageTop;
  const outer: P2[] = [
    [R, y0],
    [R, y1],
  ];
  sandwich(kit, s, outer, { ...INTERSTAGE_WALL, part: 'interstage', mat: 'cfrp-sandwich', coreMat: 'honeycomb-core', outerLook: 'interstage', innerLook: 'fairingInner' });
  // metal end rings inside the shell
  const ri = INTERSTAGE_INNER_R;
  solidRing(kit, s, ri - 0.05, ri, y0, y0 + 0.1, 'aluMilled', 'interstage', 'al-2219');
  solidRing(kit, s, ri - 0.075, ri, y1 - 0.16, y1, 'aluMilled', 'stage-separation', 'al-2219');
  // top closeout band (the separation plane edge), and the violet pinstripe
  const band = rectPoly(R - 0.03, R + 0.0015, y1 - 0.012, y1, 0.001);
  kit.add(s.group, lathe(band, { seg: kit.seg.body, closed: true, smooth: 50 }), { part: 'stage-separation', mat: 'al-2219', look: 'aluMilled', cut: true });
  kit.cap(s, band, 'stage-separation', 'al-2219');
  const stripe = rectPoly(R + 0.0006, R + 0.0016, y1 - 0.34, y1 - 0.26, 0.0003);
  kit.add(s.group, lathe(stripe, { seg: kit.seg.body, closed: true, smooth: 80, v: 'y' }), { part: 'interstage', mat: 'cfrp-sandwich', look: 'accent', cut: true });
  // FAB / ONE (white on graphite), small
  const cap = 0.15;
  const w = wordWidth('onefab', cap);
  const d = makeDecal(ctx.mats, {
    key: 'interstage-onefab',
    r: R + 0.0025,
    phiC: 0,
    halfW: w / 2 + 0.06,
    y0: 40.05,
    y1: 40.45,
    color: WHITE,
    items: [{ kind: 'onefab', s: -w / 2, y: 40.18, cap }],
    ppm: 900,
    maxTex: ctx.maxTex,
  });
  kit.add(s.group, d.geom, { part: 'interstage', mat: 'cfrp-sandwich', look: d.look, cut: true, shadow: false });
  if (!kit.hangar) return s;
  // stage separation: release collets around the ring, pneumatic pushers
  const cSpec = { part: 'stage-separation' as const, mat: 'al-2219' as const, look: 'aluMilled', cut: true };
  const colletPhis: number[] = [];
  for (let i = 0; i < AZ.collets; i++) colletPhis.push(((i + 0.5) / AZ.collets) * Math.PI * 2);
  for (const phi of colletPhis) kit.add(s.group, bevelBox(0.13, 0.12, 0.08, 0.01), cSpec, radialFrame(ri - 0.1, phi, y1 - 0.2));
  // one finger on a hinge (animated in the staging demo); the others are instances of it
  for (const phi of colletPhis.slice(0, 1)) {
    const hinge = new THREE.Group();
    hinge.matrixAutoUpdate = true;
    const hm = radialFrame(ri - 0.12, phi, y1 - 0.15);
    hm.decompose(hinge.position, hinge.quaternion, hinge.scale);
    s.group.add(hinge);
    kit.own(hinge, 'booster');
    const finger = new THREE.BoxGeometry(0.05, 0.26, 0.026);
    finger.translate(0, 0.13, 0);
    const hook = new THREE.BoxGeometry(0.05, 0.03, 0.05);
    hook.translate(0, 0.25, 0.024);
    kit.add(hinge, mergeAll([finger, hook]), { ...cSpec, look: 'stainless', mat: 'stainless' });
    ctx.movers.collets.push(hinge);
    ctx.movers.inst.collets = new RigInstances(kit, s.group, [hinge], azimuthCopies(colletPhis));
  }
  const pSpec = { part: 'stage-separation' as const, mat: 'al-2219' as const, look: 'aluMilled', cut: true };
  for (const phi of AZ.pushers) {
    const c = polar(1.62, phi, 0);
    const housing = lathe(rectPoly(0, 0.055, y1 - 0.75, y1 - 0.16, 0.008), { seg: 20, closed: true, smooth: 50 });
    kit.add(s.group, housing, pSpec, new THREE.Matrix4().makeTranslation(c.x, 0, c.z));
    kit.add(s.group, bevelBox(0.12, 0.3, 0.2, 0.01), pSpec, radialFrame(1.7, phi, y1 - 0.5));
  }
  for (const phi of AZ.pushers.slice(0, 1)) {
    const c = polar(1.62, phi, 0);
    const rodG = new THREE.Group();
    rodG.position.set(c.x, y1 - 0.16, c.z);
    s.group.add(rodG);
    kit.own(rodG, 'booster');
    // the piston rod runs down into its housing: long enough to stay engaged at full stroke
    // (0.45 m in the staging demonstration)
    const r1 = new THREE.CylinderGeometry(0.022, 0.022, 0.75, 14);
    r1.translate(0, 0.17 - 0.375, 0);
    const pad = new THREE.CylinderGeometry(0.05, 0.05, 0.02, 16);
    pad.translate(0, 0.17, 0);
    kit.add(rodG, mergeAll([r1, pad]), { ...pSpec, look: 'stainless', mat: 'stainless' });
    ctx.movers.pusherRods.push(rodG);
    ctx.movers.inst.pushers = new RigInstances(kit, s.group, [rodG], azimuthCopies(AZ.pushers));
  }
  return s;
}

/** Suborbital stack: short conical adapter from the forward skirt to the research capsule. */
function capsuleAdapter(ctx: Ctx) {
  const { kit } = ctx;
  const s = sec(ctx, 'capAdapter');
  const y0 = S.s1ForwardSkirtTop;
  const y1 = 39.6;
  const r1 = 1.93;
  const outer: P2[] = [
    [R, y0],
    [R, y0 + 0.15],
    [r1, y1 - 0.2],
    [r1, y1 - 0.05],
    [r1 - 0.03, y1],
  ];
  sandwich(kit, s, outer, { face: 0.0015, core: 0.02, part: 'payload-adapter', mat: 'cfrp-sandwich', coreMat: 'honeycomb-core', outerLook: 'paint', innerLook: 'fairingInner', soot: 1 });
  solidRing(kit, s, r1 - 0.12, r1 - 0.02, y1 - 0.06, y1, 'aluMilled', 'payload-adapter', 'al-2219');
  jointBand(kit, s, y0 + 0.03, 'paint', 'payload-adapter', 'al-2219', { bolts: kit.hangar ? 144 : 0 });
  const cap = 0.12;
  const w = wordWidth('onefab', cap);
  // on the cone: a conical band 2.5 mm off the skin (radius follows the adapter's taper)
  const coneR = (y: number) => R + ((r1 - R) * (y - (y0 + 0.15))) / (y1 - 0.2 - (y0 + 0.15)) + 0.0025;
  const d = makeDecal(ctx.mats, {
    key: 'adapter-onefab',
    r: coneR(38.62),
    r1: coneR(38.95),
    phiC: 0,
    halfW: w / 2 + 0.05,
    y0: 38.62,
    y1: 38.95,
    color: GRAPHITE,
    items: [{ kind: 'onefab', s: -w / 2, y: 38.73, cap }],
    ppm: 900,
    maxTex: ctx.maxTex,
  });
  kit.add(s.group, d.geom, { part: 'payload-adapter', mat: 'cfrp-sandwich', look: d.look, cut: true, shadow: false });
  return s;
}

// ───────────────────────────── feed plumbing in the thrust section ─────────────────────────────

function feedLines(ctx: Ctx, thrust: Section) {
  const { kit } = ctx;
  const lox = { part: 'lox-downcomer' as const, mat: 'al-2219' as const, look: 'alu', internal: true, cut: false };
  const fuel = { part: 's1-fuel-tank' as const, mat: 'al-2219' as const, look: 'aluDark', internal: true, cut: false };
  const st = { mat: 'stainless' as const, look: 'stainless' };
  const yL = 3.56; // LOX distribution level (above the beams)
  const yF = 3.3; // RP-1 crossover level (between the beams and the LOX runs)
  if (kit.hangar) {
    // LOX distribution manifold at the bottom of the downcomer
    kit.add(
      thrust.group,
      lathe(
        [
          [0, yL - 0.2],
          [0.16, yL - 0.19],
          [0.27, yL - 0.1],
          [0.29, yL],
          [0.27, yL + 0.1],
          [WALL.downcomer, yL + 0.17],
          [WALL.downcomer, 3.74],
        ],
        { seg: 40, smooth: 40 },
      ),
      lox,
    );
  }
  const outlets = rp1Outlets();
  for (const e of ENGINES) {
    const { lox: lIn, fuel: fIn } = engineIface(e);
    const d = V(lIn.x, 0, lIn.z).normalize();
    const loxPts = [V(d.x * 0.24, yL, d.z * 0.24), V(lIn.x, yL, lIn.z), V(lIn.x, lIn.y + 0.06, lIn.z)];
    const o = outlets.find((x) => x.engine === e.id)!;
    const yd = S.s1FuelAftEquator - H * Math.sqrt(1 - (Math.hypot(o.x, o.z) / WALL.domeA) ** 2);
    const fuelPts = [V(o.x, yd - 0.17, o.z), V(o.x, yF, o.z), V(fIn.x, yF, fIn.z), V(fIn.x, fIn.y + 0.06, fIn.z)];
    if (kit.hangar) {
      kit.add(thrust.group, pipe(loxPts, 0.075, 0.2, 16, 8), lox);
      kit.add(thrust.group, pipe(fuelPts, 0.055, 0.16, 14, 8), fuel);
      // flanges and bellows at the engine interfaces and above the crossovers
      for (const [p, r, spec] of [
        [lIn, 0.075, lox],
        [fIn, 0.055, fuel],
      ] as const) {
        const tr = new THREE.Matrix4().makeTranslation(p.x, 0, p.z);
        kit.add(thrust.group, lathe(rectPoly(r - 0.008, r + 0.03, p.y + 0.06, p.y + 0.09, 0.004), { seg: 20, closed: true, smooth: 50 }), { ...spec, ...st }, tr);
        const bel: P2[] = [];
        for (let i = 0; i <= 10; i++) bel.push([r + (i % 2 ? 0.016 : 0.002), p.y + 0.3 - i * 0.018]);
        kit.add(thrust.group, lathe(bel, { seg: 20, smooth: 80 }), { ...spec, ...st }, tr);
      }
    }
    ctx.flows.push({ kind: 'lox', demo: 'feed-flow', points: [V(0, 17.2, 0), V(0, yL - 0.05, 0), ...loxPts], radius: 0.095, section: thrust });
    ctx.flows.push({ kind: 'rp1', demo: 'feed-flow', points: [V(o.x, yd + 0.6, o.z), ...fuelPts], radius: 0.072, section: thrust });
  }
}

// ───────────────────────────── assembly ─────────────────────────────

export function buildBooster(ctx: Ctx) {
  const thrust = thrustSection(ctx);
  thrustMounts(ctx, thrust);
  const hs = heatShield(ctx);
  engines(ctx, hs);
  const rp1 = rp1Tank(ctx);
  const it = intertank(ctx);
  const lox = loxTank(ctx);
  const fs = forwardSkirt(ctx);
  raceway(ctx, [
    [rp1, S.s1ThrustSectionTop + 0.2, S.s1FuelFwdEquator - 0.06],
    [it, S.s1FuelFwdEquator + 0.06, S.s1LoxAftEquator - 0.06],
    // continued up the forward skirt to the RCS pod (the pressurant line and the avionics harness
    // enter there): two segments with a flat joint at the tank/skirt seam
    [lox, S.s1LoxAftEquator + 0.06, S.s1LoxFwdEquator, 'top'],
    [fs, S.s1LoxFwdEquator, ctx.config.recovery ? 36.6 : S.s1LoxFwdEquator + 0.5, 'bottom'],
  ]);
  feedLines(ctx, thrust);
  // guidance loop (gnc-loop demonstration, schematic): actuator commands down the raceway to the
  // engine section (the centre engine is the landing engine)
  ctx.flows.push({
    kind: 'sig',
    demo: 'gnc-loop',
    points: [polar(R + 0.06, AZ.raceway, ctx.config.stack === 'full' ? S.interstageTop - 0.04 : S.s1ForwardSkirtTop - 0.1), polar(R + 0.06, AZ.raceway, S.s1ThrustSectionTop + 0.3), polar(R - 0.2, AZ.raceway, S.s1ThrustSectionTop - 0.5), polar(0.5, AZ.raceway, S.s1Gimbal + 0.9), V(0, S.s1Gimbal + 0.5, 0)],
    radius: 0.028,
    section: thrust,
  });
  if (ctx.config.stack === 'full') interstage(ctx);
  else capsuleAdapter(ctx);
  return { thrust, hs, rp1, it, lox, fs };
}
