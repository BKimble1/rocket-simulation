/**
 * The KIMBLE K-1 launch vehicle model (contract: ./types.ts).
 *
 * Assembles the first stage, the upper stage, the fairing halves and the payload (from the
 * spacecraft module) at their stacked positions in the model frame, one group per body. Each
 * body group is posed by the integration; inside it a content group (moved only by the hangar
 * staging demonstration) holds the exploded-view sections.
 *
 * Views: intact / cutaway (a wedge on the +Z/+X side opens from its bisector; shells are clipped
 * by two planes through the axis and capped with hatched section faces; liquids at their
 * levels) / exploded (assemblies separate along Y). Highlight, ghosting and the materials lens
 * swap per-mesh materials from cached variants.
 */
import * as THREE from 'three';
import { S1, S2, E1, E1V, FAIRING, STATIONS as S, LEGS } from '../../vehicle/spec';
import { PARTS, type BodyId, type PartId } from '../../vehicle/parts';
import { buildSpacecraft } from '../spacecraft/buildSpacecraft';
import { MOUNT_Y, type SpacecraftModel } from '../spacecraft/types';
import { tierSpec } from '../quality';
import type { VehicleAnchors, VehicleConfig, VehicleModel, VehicleViewState, VehicleVisualState } from './types';
import { Kit, type Entry, type Section } from './kit';
import { VehicleMats } from './mats';
import type { Ctx, EngineMount } from './ctx';
import { buildBooster, updateBoots } from './booster';
import { buildRecovery, poseLegs, poseFins } from './recovery';
import { buildUpper } from './upper';
import { buildFairing, poseFairing, fairingProfile } from './fairing';
import { FlowOverlays } from './flow';
import { Liquid } from './liquids';
import { WEDGE, ENGINES, EXPLODE, DEG } from './layout';
import { TANKS, levelHeight, centroidAt } from './tanks';

export { LENS_COLORS } from './mats';
export { FLOW_COLORS } from './flow';

const DEFAULT_STATE: VehicleVisualState = {
  legs: 0,
  fins: 0,
  finDeflect: 0,
  fairingOpen: 0,
  satArrays: 0,
  satAntenna: 0,
  smArrays: 0,
  capDrogue: 0,
  capMain: 0,
  capNoseCone: 0,
  capChar: 0,
  s1Lox: 1,
  s1Rp1: 1,
  s2Lox: 1,
  s2Rp1: 1,
  s1GimbalPitch: 0,
  s1GimbalYaw: 0,
  s2GimbalPitch: 0,
  frost: 0,
  entryScorch: 0,
};

const ENGINE_DEMOS = new Set(['turbopump', 'combustion', 'nozzle-pressure', 'regen-cooling', 'tvc', 'gnc-loop']);
const SPACECRAFT_DEMOS = new Set(['spacecraft-ops', 'capsule-return', 'heat-shield-stack']);

const smooth = (x: number) => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};
const ramp = (p: number, a: number, b: number) => smooth((p - a) / (b - a));

export function buildVehicle(config: VehicleConfig): VehicleModel {
  const hangar = config.detail === 'hangar';
  const tier = tierSpec();
  const det = tier.detail;
  const seg = hangar
    ? { body: Math.max(128, Math.round(176 * det)), mid: Math.max(72, Math.round(112 * det)), small: Math.max(16, Math.round(28 * det)), tiny: Math.max(8, Math.round(12 * det)) }
    : { body: Math.max(48, Math.round(80 * det)), mid: Math.max(32, Math.round(48 * det)), small: Math.max(10, Math.round(16 * det)), tiny: 6 };
  const mats = new VehicleMats(hangar);
  const kit = new Kit(mats, config.detail, seg);
  const root = new THREE.Group();
  root.name = 'vehicle';
  const bodies: Partial<Record<BodyId, THREE.Group>> = {};
  const content: Partial<Record<BodyId, THREE.Group>> = {};
  const addBody = (id: BodyId) => {
    const g = new THREE.Group();
    g.name = `body:${id}`;
    const c = new THREE.Group();
    c.name = `${id}:content`;
    g.add(c);
    root.add(g);
    bodies[id] = g;
    content[id] = c;
    kit.own(g, id);
    return c;
  };
  const full = config.stack === 'full';
  const satellite = full && (config.payload === 'leoSat' || config.payload === 'gtoSat' || config.payload === 'lunarProbe');
  addBody('booster');
  if (full) addBody('upper');
  if (satellite) {
    addBody('fairingA');
    addBody('fairingB');
  }
  const ctx: Ctx = {
    kit,
    mats,
    config,
    hangar,
    content,
    maxTex: Math.min(4096, tier.maxTexture),
    movers: { engines: [], legs: [], fins: [], boots: [], collets: [], pusherRods: [], fairing: { A: null, B: null }, sandwichLayers: [] },
    flows: [],
    liquids: [],
    s1Rcs: [],
    s2Rcs: [],
    vents: [],
  };

  const booster = buildBooster(ctx);
  if (config.recovery) buildRecovery(ctx, booster.thrust, booster.fs);
  if (full) buildUpper(ctx);
  if (satellite) buildFairing(ctx);

  // ── payload from the spacecraft module
  const mountY = full ? MOUNT_Y.upperStage : MOUNT_Y.boosterCapsuleAdapter;
  let sc: SpacecraftModel | null = null;
  const payloadSections: Section[] = [];
  try {
    sc = buildSpacecraft(config.payload, config.detail, mountY);
  } catch (err) {
    console.error('vehicle: spacecraft build failed', err);
    sc = null;
  }
  if (sc) {
    for (const [id, g] of Object.entries(sc.bodies) as [BodyId, THREE.Group][]) {
      if (!g) continue;
      const c = addBody(id);
      const off = EXPLODE[full ? 'payload' : 'suborbitalPayload'];
      const s = kit.section(`payload:${id}`, id, c, new THREE.Vector3(...off));
      s.group.add(g);
      payloadSections.push(s);
      g.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) kit.register(m, { kind: 'foreign', part: (m.userData.part ?? null) as never, mat: (m.userData.material ?? null) as never, body: id });
      });
    }
  }

  kit.flush(root);

  // liquids and flow overlays (hangar only)
  const liquids: Liquid[] = hangar ? ctx.liquids.map((l) => new Liquid(kit, mats, l.tank, l.section, seg.mid)) : [];
  const flows = new FlowOverlays(kit, ctx.flows);

  // ── parts map
  const parts = new Map<PartId, THREE.Object3D[]>();
  const push = (p: PartId, o: THREE.Object3D) => {
    let l = parts.get(p);
    if (!l) parts.set(p, (l = []));
    if (!l.includes(o)) l.push(o);
  };
  const primary = ENGINES.reduce((a, b) => (b.z > a.z ? b : a)).id; // the engine facing +Z
  const s1Engines = ctx.movers.engines.filter((m) => m.kind === 'E-1');
  const s2Engine = ctx.movers.engines.find((m) => m.kind === 'E-1V') ?? null;
  const meshesOf = (m: EngineMount) => {
    const out: THREE.Mesh[] = [];
    m.engine.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
    });
    return out;
  };
  const engineMeshes = new Set<THREE.Object3D>();
  for (const m of s1Engines)
    for (const mesh of meshesOf(m)) {
      engineMeshes.add(mesh);
      push('s1-engine-cluster', mesh);
      if (m.id === primary) {
        push('engine', mesh);
        const p = mesh.userData.part as PartId | undefined;
        if (p && p !== 'engine' && PARTS[p]) push(p, mesh);
      }
    }
  if (s2Engine)
    for (const mesh of meshesOf(s2Engine)) {
      engineMeshes.add(mesh);
      push('vacuum-engine', mesh);
      if (mesh.userData.part === 'nozzle-extension') push('nozzle-extension', mesh);
    }
  for (const e of kit.registry) {
    if (engineMeshes.has(e.mesh) || e.kind === 'overlay' || !e.part) continue;
    if (e.kind === 'foreign') continue; // spacecraft: taken from its own parts map below
    push(e.part, e.mesh);
  }
  if (sc) for (const [p, list] of sc.parts) for (const o of list) push(p, o);
  // the engine cluster also owns the thermal boots
  for (const b of ctx.movers.boots) push('s1-engine-cluster', b.mesh);

  // ── anchors
  const s1Nozzles = s1Engines.map((m) => ({ id: m.id, exit: new THREE.Vector3(m.pivot.x, m.pivot.y + m.engine.exitY, m.pivot.z), exitRadius: m.engine.exitRadius, centre: m.centre }));
  const s2Nozzle = s2Engine ? { exit: new THREE.Vector3(0, s2Engine.pivot.y + s2Engine.engine.exitY, 0), exitRadius: s2Engine.engine.exitRadius } : { exit: new THREE.Vector3(0, S.s2NozzleExit, 0), exitRadius: E1V.exitDiameter / 2 };
  const anchors: VehicleAnchors = {
    s1Nozzles,
    s2Nozzle,
    s1Rcs: ctx.s1Rcs,
    s2Rcs: ctx.s2Rcs,
    capsuleRcs: sc ? sc.anchors.capsuleRcs : [],
    smEngine: sc ? sc.anchors.smEngine : null,
    lesNozzles: sc ? sc.anchors.lesNozzles : [],
    satApogee: sc ? sc.anchors.satApogee : null,
    vents: ctx.vents,
    com: computeCom(config, sc, root),
  };

  // ── clipping planes: updated from the root's world matrix right before rendering
  const localPlanes = [new THREE.Plane(), new THREE.Plane()];
  const hookGeo = new THREE.BufferGeometry();
  hookGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  const hookMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false });
  const hook = new THREE.Mesh(hookGeo, hookMat);
  hook.name = 'vehicle:clip-hook';
  hook.frustumCulled = false;
  hook.renderOrder = -1e9;
  hook.raycast = () => {};
  const syncPlanes = () => {
    for (let k = 0; k < 2; k++) mats.planes[k].copy(localPlanes[k]).applyMatrix4(root.matrixWorld);
  };
  hook.onBeforeRender = (renderer) => {
    if (!renderer.localClippingEnabled) renderer.localClippingEnabled = true;
    syncPlanes();
  };
  if (hangar) root.add(hook);

  // ── state
  const base: VehicleVisualState = { ...DEFAULT_STATE };
  const eff: VehicleVisualState = { ...DEFAULT_STATE };
  const view: VehicleViewState = { mode: 'intact', amount: 0, highlight: null, dimOthers: false, lens: 'systems', material: null };
  let demo: string | null = null;
  let demoP = 0;
  let demoT = 0;
  let cutA = -1;
  let exA = -1;
  let lookKey = '';
  let stackLift = 0;

  const gimbalQ = (m: EngineMount, pitchDeg: number, yawDeg: number) => {
    // pitch about the model X axis, yaw about the model Z axis
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitchDeg * DEG, 0, yawDeg * DEG, 'XZY'));
    void m;
    return q;
  };
  const engineAngles = (m: EngineMount): [number, number] => {
    if (m.kind === 'E-1V') return [clampDeg(eff.s2GimbalPitch, E1V.gimbalRangeDeg), 0];
    const k = m.centre ? 1 : 0.7;
    return [clampDeg(eff.s1GimbalPitch * k, E1.gimbalRangeDeg), clampDeg(eff.s1GimbalYaw * k, E1.gimbalRangeDeg)];
  };
  const applyGimbals = () => {
    for (const m of ctx.movers.engines) {
      const [p, y] = engineAngles(m);
      if (m.selfGimbal) {
        // express the model-frame command in the engine frame (the mount is yawed about Y)
        const c = Math.cos(m.yaw);
        const s = Math.sin(m.yaw);
        const lp = p * c - y * s;
        const ly = p * s + y * c;
        m.engine.setOperating({ pitch: lp, yaw: ly });
        m.mount.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), m.yaw);
      } else {
        const q = gimbalQ(m, p, y);
        m.mount.quaternion.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), m.yaw));
      }
      const exit = m.kind === 'E-1' ? s1Nozzles.find((n) => n.id === m.id)!.exit : s2Nozzle.exit;
      exit.set(0, m.engine.exitY, 0).applyQuaternion(gimbalQ(m, p, y)).add(m.pivot);
    }
    if (ctx.movers.boots.length) updateBoots(ctx, (m) => gimbalQ(m, ...engineAngles(m)));
  };

  const applyState = () => {
    poseLegs(ctx, eff.legs);
    poseFins(ctx, eff.fins, eff.finDeflect);
    poseFairing(ctx, eff.fairingOpen);
    for (const l of liquids) {
      const f = l.tank === 's1Lox' ? eff.s1Lox : l.tank === 's1Rp1' ? eff.s1Rp1 : l.tank === 's2Lox' ? eff.s2Lox : eff.s2Rp1;
      if (l.setLevel(f)) setLiquidVisibility();
    }
    mats.uniforms.uFrost.value = Math.max(0, Math.min(1, eff.frost));
    mats.uniforms.uScorch.value = Math.max(0, Math.min(1, eff.entryScorch));
    applyGimbals();
  };

  const setLiquidVisibility = () => {
    const on = cutA > 0.001;
    for (const l of liquids) {
      l.mesh.visible = on && !l.empty;
      for (const c of l.caps) c.visible = on && !l.empty;
    }
  };

  const sections = [...kit.sections.values()];
  const inRange = (sec: Section, phi: number) => {
    const norm = (a: number) => ((((a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
    if (sec.id === 'fairingA') return Math.abs(norm(phi)) <= Math.PI / 2;
    if (sec.id === 'fairingB') return Math.abs(norm(phi)) >= Math.PI / 2;
    return true;
  };

  const applyCut = (a: number) => {
    const on = a > 0.001;
    if (!hangar) a = 0;
    if (on && hangar) {
      const mid = (WEDGE.from + WEDGE.to) / 2;
      const half = ((WEDGE.to - WEDGE.from) / 2) * smooth(a);
      const f1 = mid - half;
      const f2 = mid + half;
      const t = (f: number) => new THREE.Vector3(Math.cos(f), 0, -Math.sin(f));
      localPlanes[0].set(t(f1).negate(), 0);
      localPlanes[1].set(t(f2), 0);
      for (const s of sections) {
        s.caps[0].rotation.y = f1 - Math.PI / 2;
        s.caps[1].rotation.y = f2 - Math.PI / 2;
        s.caps[0].visible = inRange(s, f1);
        s.caps[1].visible = inRange(s, f2);
      }
    } else {
      localPlanes[0].set(new THREE.Vector3(1, 0, 0), 1e6);
      localPlanes[1].set(new THREE.Vector3(1, 0, 0), 1e6);
      for (const s of sections) s.caps[0].visible = s.caps[1].visible = false;
    }
    root.updateMatrixWorld(true);
    syncPlanes();
    setLiquidVisibility();
    sc?.setCut(hangar ? a : 0);
  };

  const applyExplode = (a: number) => {
    const e = smooth(a);
    for (const s of sections) s.group.position.copy(s.explode).multiplyScalar(e);
  };

  // highlight / ghost / materials lens
  const overridden = new Map<Entry, THREE.Material | THREE.Material[]>();
  let selectedSet = new Set<THREE.Object3D>();
  const isSelected = (e: Entry) => selectedSet.has(e.mesh);
  const variantOf = (m: THREE.Material, e: Entry, sel: boolean, anySel: boolean): THREE.Material => {
    if (view.lens === 'materials' && e.kind !== 'liquid' && e.kind !== 'overlay') {
      const clipped = !!m.userData.clipped;
      return mats.lens(e.mat, clipped, sel ? 'hi' : view.dimOthers && anySel ? 'dim' : 'plain');
    }
    if (sel) return mats.highlight(m);
    if (view.dimOthers && anySel) return mats.dim(m);
    return m;
  };
  const applyLooks = () => {
    const lensOn = view.lens === 'materials';
    const anySel = lensOn ? view.material !== null : view.highlight !== null;
    selectedSet = new Set();
    if (lensOn && view.material) {
      for (const e of kit.registry) if (e.mat === view.material) selectedSet.add(e.mesh);
    } else if (!lensOn && view.highlight) {
      for (const o of parts.get(view.highlight) ?? []) o.traverse((x) => selectedSet.add(x));
    }
    const neutral = !lensOn && !anySel;
    for (const e of kit.registry) {
      if (e.kind === 'overlay') continue;
      const sel = isSelected(e);
      if (neutral) {
        const orig = overridden.get(e);
        if (orig) {
          e.mesh.material = orig;
          overridden.delete(e);
        }
        continue;
      }
      if (!overridden.has(e)) overridden.set(e, e.mesh.material);
      const orig = overridden.get(e)!;
      e.mesh.material = Array.isArray(orig) ? orig.map((m) => variantOf(m, e, sel, anySel)) : variantOf(orig, e, sel, anySel);
    }
    applyVisibility();
  };
  const applyVisibility = () => {
    const on = cutA > 0.001;
    for (const e of kit.registry) if (e.internal) e.mesh.visible = on || isSelected(e);
  };

  const applyView = () => {
    const c = view.mode === 'cutaway' ? Math.max(0, Math.min(1, view.amount)) : 0;
    const x = view.mode === 'exploded' ? Math.max(0, Math.min(1, view.amount)) : 0;
    if (c !== cutA) {
      cutA = c;
      applyCut(c);
      applyVisibility();
    }
    if (x !== exA) {
      exA = x;
      applyExplode(x);
    }
    const key = `${view.highlight}|${view.dimOthers}|${view.lens}|${view.material}`;
    if (key !== lookKey) {
      lookKey = key;
      applyLooks();
    }
  };

  // demonstrations
  const applyDemo = () => {
    Object.assign(eff, base);
    const p = demoP;
    let lift = 0;
    let colletOpen = 0;
    let push = 0;
    switch (demo) {
      case 'tank-drain':
        eff.s1Lox = base.s1Lox * (1 - p * 0.97);
        eff.s1Rp1 = base.s1Rp1 * (1 - p * 0.97);
        break;
      case 'staging-sequence':
        colletOpen = ramp(p, 0.05, 0.3);
        push = ramp(p, 0.32, 0.62);
        lift = push * 0.45 + ramp(p, 0.62, 1) * 1.1;
        break;
      case 'fairing-sep':
        eff.fairingOpen = ramp(p, 0.05, 0.95);
        break;
      case 'booster-recovery':
        eff.fins = ramp(p, 0.02, 0.3);
        eff.finDeflect = p > 0.3 && p < 0.62 ? Math.sin(((p - 0.3) / 0.32) * Math.PI * 2) * 14 : 0;
        eff.legs = ramp(p, 0.64, 0.98);
        break;
      case 'tvc':
      case 'gnc-loop': {
        const w = demo === 'tvc' ? 1 : 0.4;
        eff.s1GimbalPitch = Math.sin(demoT * 1.3) * E1.gimbalRangeDeg * w;
        eff.s1GimbalYaw = Math.cos(demoT * 1.3) * E1.gimbalRangeDeg * w;
        eff.s2GimbalPitch = Math.sin(demoT * 1.1) * E1V.gimbalRangeDeg * w;
        break;
      }
    }
    // staging mechanism (hangar demonstration: the upper stack moves up a little)
    ctx.movers.collets.forEach((g, i) => {
      g.userData.q0 ??= g.quaternion.clone();
      g.quaternion.copy(g.userData.q0 as THREE.Quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.55 * colletOpen));
      void i;
    });
    for (const r of ctx.movers.pusherRods) {
      r.userData.y0 ??= r.position.y;
      r.position.y = (r.userData.y0 as number) + push * 0.45;
    }
    if (lift !== stackLift) {
      stackLift = lift;
      for (const id of Object.keys(content) as BodyId[]) if (id !== 'booster') content[id]!.position.y = lift;
    }
    applyState();
  };

  // engine demonstrations run on the booster engines (and the E-1V)
  let engineDemo: string | null = null;
  const applyEngineDemo = (t: number) => {
    const on = demo && ENGINE_DEMOS.has(demo) ? demo : null;
    if (on !== engineDemo) {
      for (const m of ctx.movers.engines) {
        m.engine.setFlowOverlay(on === 'regen-cooling' || on === 'combustion' || on === 'turbopump' || on === 'nozzle-pressure');
        if (!on) m.engine.setOperating({ flow: 0, gg: false, ignite: 0, shaftAngle: 0 });
      }
      engineDemo = on;
    }
    if (!on) return;
    const flow = on === 'tvc' || on === 'gnc-loop' ? 0 : 1;
    for (const m of ctx.movers.engines)
      m.engine.setOperating({ flow, gg: flow > 0, shaftAngle: t * Math.PI * 2 * 0.5, ignite: on === 'combustion' ? Math.max(0, 1 - demoP * 8) : 0 });
  };

  const model: VehicleModel = {
    config,
    root,
    bodies,
    parts,
    anchors,
    setState(s) {
      Object.assign(base, s);
      sc?.setState(s);
      applyDemo();
    },
    setView(v) {
      Object.assign(view, v);
      applyView();
    },
    animate(t, d, progress) {
      demo = d;
      demoP = Math.max(0, Math.min(1, progress));
      demoT = t;
      applyDemo();
      flows.update(d, t);
      applyEngineDemo(t);
      if (sc && (d === null || SPACECRAFT_DEMOS.has(d))) sc.animate(t, d, progress);
    },
    partBox(id, out) {
      const list = parts.get(id);
      if (!list || !list.length) return null;
      root.updateMatrixWorld(true);
      out.makeEmpty();
      for (const o of list) out.expandByObject(o, false);
      return out.isEmpty() ? null : out;
    },
    dispose() {
      root.removeFromParent();
      const geos = new Set<THREE.BufferGeometry>();
      for (const e of kit.registry) if (e.kind !== 'foreign') geos.add(e.mesh.geometry);
      for (const g of geos) g.dispose();
      for (const l of liquids) l.dispose();
      flows.dispose();
      for (const m of ctx.movers.engines) m.engine.dispose();
      sc?.dispose();
      mats.dispose();
      hookGeo.dispose();
      hookMat.dispose();
    },
  };

  applyCut(0);
  cutA = 0;
  exA = 0;
  applyExplode(0);
  applyDemo();
  lookKey = `${view.highlight}|${view.dimOthers}|${view.lens}|${view.material}`;
  return model;
}

function clampDeg(v: number, lim: number) {
  return Math.max(-lim, Math.min(lim, v));
}

/** Centre of mass per body at full load (model frame): propellant centroids + a dry-mass table. */
function computeCom(config: VehicleConfig, sc: SpacecraftModel | null, root: THREE.Group): Partial<Record<BodyId, THREE.Vector3>> {
  const com: Partial<Record<BodyId, THREE.Vector3>> = {};
  const full = config.stack === 'full';
  const lox1 = centroidAt(TANKS.s1Lox, levelHeight(TANKS.s1Lox, 1));
  const rp11 = centroidAt(TANKS.s1Rp1, levelHeight(TANKS.s1Rp1, 1));
  // first-stage dry mass split (kg, y): engines, thrust section, tanks, intertank, skirts, interstage, recovery hardware, plumbing
  const dry: [number, number][] = [
    [7 * E1.mass, 1.3],
    [3000, 2.8],
    [3600, 10.3],
    [900, 17.1],
    [5800, 27.3],
    [1100, 37.0],
    [full ? 1700 : 450, full ? 41.2 : 38.7],
    [LEGS.mass, 5.8],
    [800, 37.5],
  ];
  const dryUsed = dry.reduce((a, [m]) => a + m, 0);
  dry.push([Math.max(0, S1.dry - dryUsed), 12]);
  const b = [...dry, [S1.lox, lox1] as [number, number], [S1.rp1, rp11] as [number, number]];
  com.booster = new THREE.Vector3(0, b.reduce((a, [m, y]) => a + m * y, 0) / b.reduce((a, [m]) => a + m, 0), 0);
  if (full) {
    const lox2 = centroidAt(TANKS.s2Lox, levelHeight(TANKS.s2Lox, 1));
    const rp12 = centroidAt(TANKS.s2Rp1, levelHeight(TANKS.s2Rp1, 1));
    const u: [number, number][] = [
      [E1V.mass, S.s2Gimbal - 1.9],
      [700, 45.3],
      [2300, 49.6],
      [600, 53.2],
      [S2.dry - E1V.mass - 3600, 54.3],
      [S2.lox, lox2],
      [S2.rp1, rp12],
    ];
    com.upper = new THREE.Vector3(0, u.reduce((a, [m, y]) => a + m * y, 0) / u.reduce((a, [m]) => a + m, 0), 0);
    // fairing halves: area centroid of each half-shell
    const prof = fairingProfile(40);
    let A = 0;
    let Ay = 0;
    let Az = 0;
    for (let i = 0; i < prof.length - 1; i++) {
      const [r0, y0] = prof[i];
      const [r1, y1] = prof[i + 1];
      const r = (r0 + r1) / 2;
      const ds = Math.hypot(r1 - r0, y1 - y0);
      const dA = Math.PI * r * ds;
      A += dA;
      Ay += dA * (y0 + y1) / 2;
      Az += dA * ((2 * r) / Math.PI);
    }
    void FAIRING;
    com.fairingA = new THREE.Vector3(0, Ay / A, Az / A);
    com.fairingB = new THREE.Vector3(0, Ay / A, -Az / A);
  }
  if (sc) {
    root.updateMatrixWorld(true);
    for (const [id, g] of Object.entries(sc.bodies) as [BodyId, THREE.Group][]) {
      if (!g) continue;
      const box = new THREE.Box3().setFromObject(g);
      if (box.isEmpty()) continue;
      com[id] = new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y + (box.max.y - box.min.y) * 0.42, (box.min.z + box.max.z) / 2);
    }
  }
  return com;
}
