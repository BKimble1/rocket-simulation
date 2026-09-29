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
 * levels) / exploded (assemblies separate along Y). Highlight, ghosting, the materials lens and
 * the thermal lens swap per-mesh materials from cached variants. Every mesh carries
 * `userData.part`, `userData.material` and `userData.thermal` (0 cryogenic .. 4 very hot).
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
import { SandwichCoupon } from './coupon';
import { lockNoCast } from './instancing';
import { Liquid } from './liquids';
import { WEDGE, EXPLODE, DEG, s2StackedGimbalLimit } from './layout';
import { TANKS, levelHeight, centroidAt } from './tanks';
import { classifyThermal, sectionOf, THERMAL_COLORS } from './thermal';

export { LENS_COLORS } from './mats';
export { FLOW_COLORS } from './flow';
export { THERMAL_LENS, THERMAL_COLORS, type ThermalClass, type ThermalLevel } from './thermal';

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

const ENGINE_DEMOS = new Set(['turbopump', 'combustion', 'nozzle-pressure', 'regen-cooling', 'tvc']);
const SPACECRAFT_DEMOS = new Set(['spacecraft-ops', 'capsule-return', 'heat-shield-stack']);

const smooth = (x: number) => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};
const ramp = (p: number, a: number, b: number) => smooth((p - a) / (b - a));
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

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
    movers: {
      engines: [],
      legs: [],
      fins: [],
      boots: [],
      collets: [],
      pusherRods: [],
      fairing: { A: null, B: null },
      sandwichLayers: [],
      inst: { legs: null, fins: null, collets: null, pushers: null },
      cluster: null,
    },
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
  // repeated rigs become instanced meshes of their posed template
  for (const r of Object.values(ctx.movers.inst)) r?.build();

  // liquids, flow overlays and the sandwich coupon (hangar only)
  const liquids: Liquid[] = hangar ? ctx.liquids.map((l) => new Liquid(kit, mats, l.tank, l.section, seg.mid)) : [];
  const flows = new FlowOverlays(kit, ctx.flows);
  const coupon = hangar
    ? satellite
      ? new SandwichCoupon(kit, content.fairingA!, (S.fairingBase + S.fairingCylinderTop) / 2, 'fairing', 'fairingA')
      : new SandwichCoupon(kit, content.booster!, (S.s1ForwardSkirtTop + S.interstageTop) / 2, full ? 'interstage' : 'payload-adapter', 'booster')
    : null;
  // overlays, cut faces and liquids never cast shadows (integrations switch shadows on for every mesh)
  for (const e of kit.registry) if (e.kind === 'overlay' || e.kind === 'cap' || e.kind === 'liquid') lockNoCast(e.mesh);

  // thermal class of every mesh (explicit pieces keep theirs; the rest follow the part rules)
  for (const e of kit.registry) {
    if (!e.thermal) {
      const ud = e.mesh.userData;
      const sub = (ud.subPart ?? e.part ?? null) as string | null;
      const look = Array.isArray(e.base) ? e.base[0]?.name ?? '' : e.base.name;
      e.thermal = classifyThermal(sub, e.mat, sectionOf(e.mesh), look, e.kind, ud.fluid as string | undefined);
    }
    e.mesh.userData.thermal = e.thermal.level;
  }

  // ── parts map
  const parts = new Map<PartId, THREE.Object3D[]>();
  const push = (p: PartId, o: THREE.Object3D) => {
    let l = parts.get(p);
    if (!l) parts.set(p, (l = []));
    if (!l.includes(o)) l.push(o);
  };
  const s1Engines = ctx.movers.engines.filter((m) => m.kind === 'E-1');
  const liveS1 = s1Engines.filter((m) => m.instance === undefined);
  const s2Engine = ctx.movers.engines.find((m) => m.kind === 'E-1V') ?? null;
  const meshesOf = (m: EngineMount) => {
    const out: THREE.Mesh[] = [];
    m.engine.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
    });
    return out;
  };
  const engineMeshes = new Set<THREE.Object3D>();
  // the full (selectable) E-1 is the one facing the pad cameras; the other six are instances
  for (const m of liveS1)
    for (const mesh of meshesOf(m)) {
      engineMeshes.add(mesh);
      push('s1-engine-cluster', mesh);
      push('engine', mesh);
      const p = mesh.userData.part as PartId | undefined;
      if (p && p !== 'engine' && PARTS[p]) push(p, mesh);
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

  // ── anchors (nozzle exits follow the gimbals)
  const exits = ctx.movers.engines.map((m) => new THREE.Vector3(m.pivot.x, m.pivot.y + m.engine.exitY, m.pivot.z));
  const s1Nozzles = s1Engines.map((m) => ({ id: m.id, exit: exits[ctx.movers.engines.indexOf(m)], exitRadius: m.engine.exitRadius, centre: m.centre }));
  const s2Nozzle = s2Engine ? { exit: exits[ctx.movers.engines.indexOf(s2Engine)], exitRadius: s2Engine.engine.exitRadius } : { exit: new THREE.Vector3(0, S.s2NozzleExit, 0), exitRadius: E1V.exitDiameter / 2 };
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

  // ── clipping planes: updated from the root's world matrix right before rendering (cutaway only)
  const localPlanes = [new THREE.Plane(), new THREE.Plane()];
  const hookGeo = new THREE.BufferGeometry();
  hookGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  const hookMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false });
  const hook = new THREE.Mesh(hookGeo, hookMat);
  hook.name = 'vehicle:clip-hook';
  hook.frustumCulled = false;
  hook.renderOrder = -1e9;
  hook.raycast = () => {};
  hook.visible = false;
  // a helper, not hardware: tagged with the structure it serves (the cut shells)
  hook.userData.part = 's1-lox-tank';
  hook.userData.material = null;
  hook.userData.thermal = 0;
  hook.userData.helper = true;
  lockNoCast(hook);
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
  // last applied look (highlight / ghosting / lens), compared field by field (no per-frame allocation)
  const look: Pick<VehicleViewState, 'highlight' | 'dimOthers' | 'lens' | 'material'> = { highlight: null, dimOthers: false, lens: 'systems', material: null };
  let stackLift = 0;
  // last applied values (NaN = never applied)
  const done = { legs: NaN, fins: NaN, defl: NaN, open: NaN, frost: NaN, scorch: NaN, gp: NaN, gy: NaN, gp2: NaN, stk: NaN, collet: NaN, push: NaN, apart: NaN };
  // E-1V gimbal limit while it sits in the interstage: the extension rim keeps at least 10 cm
  // from the interstage inner face sheet (full range once the stages are apart)
  const s2Engine0 = ctx.movers.engines.find((m) => m.kind === 'E-1V') ?? null;
  const s2StackedLimit = s2Engine0 ? Math.min(E1V.gimbalRangeDeg, s2StackedGimbalLimit(s2Engine0.engine.exitRadius, -s2Engine0.engine.exitY)) : E1V.gimbalRangeDeg;
  let stacked = false;

  // scratch objects (setState/animate run every frame: no allocations)
  const _q = new THREE.Quaternion();
  const _qy = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const _Y = new THREE.Vector3(0, 1, 0);
  const _X = new THREE.Vector3(1, 0, 0);
  let angP = 0;
  let angY = 0;
  /** Gimbal rotation: pitch about the model X axis, yaw about the model Z axis. */
  const gimbalQ = (pitchDeg: number, yawDeg: number, out: THREE.Quaternion) => out.setFromEuler(_e.set(pitchDeg * DEG, 0, yawDeg * DEG, 'XZY'));
  const engineAngles = (m: EngineMount) => {
    if (m.kind === 'E-1V') {
      // inside the interstage the nozzle extension may only swing as far as its clearance allows
      angP = clampDeg(eff.s2GimbalPitch, stacked ? s2StackedLimit : E1V.gimbalRangeDeg);
      angY = 0;
      return;
    }
    // outer engines gimbal less than the centre (landing) engine
    const k = m.centre ? 1 : 0.7;
    angP = clampDeg(eff.s1GimbalPitch * k, E1.gimbalRangeDeg);
    angY = clampDeg(eff.s1GimbalYaw * k, E1.gimbalRangeDeg);
  };
  const bootRot = (m: EngineMount, out: THREE.Quaternion) => {
    engineAngles(m);
    return gimbalQ(angP, angY, out);
  };
  const applyGimbals = () => {
    let cluster = false;
    ctx.movers.engines.forEach((m, i) => {
      engineAngles(m);
      gimbalQ(angP, angY, _q);
      if (m.instance !== undefined) {
        m.mount.quaternion.copy(_q).multiply(_qy.setFromAxisAngle(_Y, m.yaw));
        m.mount.updateMatrix();
        ctx.movers.cluster?.set(m.instance, m.mount.matrix);
        cluster = true;
      } else if (m.selfGimbal) {
        // express the model-frame command in the engine frame (the mount is yawed about Y)
        const c = Math.cos(m.yaw);
        const s = Math.sin(m.yaw);
        m.engine.setOperating({ pitch: angP * c - angY * s, yaw: angP * s + angY * c });
      } else {
        m.mount.quaternion.copy(_q).multiply(_qy.setFromAxisAngle(_Y, m.yaw));
      }
      exits[i].set(0, m.engine.exitY, 0).applyQuaternion(_q).add(m.pivot);
    });
    if (cluster) ctx.movers.cluster?.commit();
    if (ctx.movers.boots.length) updateBoots(ctx, bootRot);
  };

  const setLiquidVisibility = () => {
    const on = cutA > 0.001;
    for (const l of liquids) {
      l.mesh.visible = on && !l.empty;
      for (const c of l.caps) c.visible = on && !l.empty;
    }
  };

  const applyState = () => {
    if (eff.legs !== done.legs) {
      done.legs = eff.legs;
      poseLegs(ctx, clamp01(eff.legs));
    }
    if (eff.fins !== done.fins || eff.finDeflect !== done.defl) {
      done.fins = eff.fins;
      done.defl = eff.finDeflect;
      poseFins(ctx, eff.fins, eff.finDeflect);
    }
    if (eff.fairingOpen !== done.open) {
      done.open = eff.fairingOpen;
      poseFairing(ctx, eff.fairingOpen);
    }
    let liquidsChanged = false;
    for (const l of liquids) {
      const f = l.tank === 's1Lox' ? eff.s1Lox : l.tank === 's1Rp1' ? eff.s1Rp1 : l.tank === 's2Lox' ? eff.s2Lox : eff.s2Rp1;
      if (l.setLevel(f)) liquidsChanged = true;
    }
    if (liquidsChanged) setLiquidVisibility();
    if (eff.frost !== done.frost) {
      done.frost = eff.frost;
      mats.uniforms.uFrost.value = clamp01(eff.frost);
    }
    if (eff.entryScorch !== done.scorch) {
      done.scorch = eff.entryScorch;
      mats.uniforms.uScorch.value = clamp01(eff.entryScorch);
    }
    stacked = stackLift < 0.3 && attached(bodies.booster, bodies.upper);
    const stk = stacked ? 1 : 0;
    if (eff.s1GimbalPitch !== done.gp || eff.s1GimbalYaw !== done.gy || eff.s2GimbalPitch !== done.gp2 || stk !== done.stk) {
      done.gp = eff.s1GimbalPitch;
      done.gy = eff.s1GimbalYaw;
      done.gp2 = eff.s2GimbalPitch;
      done.stk = stk;
      applyGimbals();
    }
  };

  // ── enclosed hardware: the E-1V inside the interstage and a satellite inside the closed fairing
  // cannot be seen in the plain intact view, so they are not drawn then (large draw-call saving)
  const s2Mount = s2Engine?.mount ?? null;
  const payloadGroups = satellite ? payloadSections.map((s) => s.group) : [];
  const attached = (a: THREE.Object3D | undefined, b: THREE.Object3D | undefined) =>
    !!a && !!b && a.visible && b.visible && a.position.distanceToSquared(b.position) < 1e-4 && Math.abs(a.quaternion.dot(b.quaternion)) > 0.999999;
  const updateEnclosure = () => {
    // only ghosting (dimOthers) makes the shells see-through; a highlight alone does not
    const ghost = view.dimOthers && (view.lens === 'materials' ? view.material !== null : view.highlight !== null);
    const plain = cutA <= 0.001 && exA <= 0.001 && !ghost && stackLift === 0;
    if (s2Mount) s2Mount.visible = !(plain && engineDemo === null && attached(bodies.booster, bodies.upper));
    if (payloadGroups.length) {
      const closed = plain && eff.fairingOpen <= 1e-4 && !(demo && SPACECRAFT_DEMOS.has(demo)) && attached(bodies.upper, bodies.fairingA) && attached(bodies.upper, bodies.fairingB);
      for (const g of payloadGroups) g.visible = !closed;
    }
  };

  const sections = [...kit.sections.values()];
  const inRange = (sec: Section, phi: number) => {
    const norm = (a: number) => ((((a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
    if (sec.id === 'fairingA') return Math.abs(norm(phi)) <= Math.PI / 2;
    if (sec.id === 'fairingB') return Math.abs(norm(phi)) >= Math.PI / 2;
    return true;
  };
  const _n = new THREE.Vector3();

  const applyCut = (a: number) => {
    const on = hangar && a > 0.001;
    if (on) {
      const mid = (WEDGE.from + WEDGE.to) / 2;
      const half = ((WEDGE.to - WEDGE.from) / 2) * smooth(a);
      const f1 = mid - half;
      const f2 = mid + half;
      // a point is removed when it is on the inner side of both planes (clipIntersection)
      localPlanes[0].set(_n.set(-Math.cos(f1), 0, Math.sin(f1)), 0);
      localPlanes[1].set(_n.set(Math.cos(f2), 0, -Math.sin(f2)), 0);
      for (const s of sections) {
        s.caps[0].rotation.y = f1 - Math.PI / 2;
        s.caps[1].rotation.y = f2 - Math.PI / 2;
        s.caps[0].visible = inRange(s, f1);
        s.caps[1].visible = inRange(s, f2);
      }
    } else {
      localPlanes[0].set(_X, 1e6);
      localPlanes[1].set(_X, 1e6);
      for (const s of sections) s.caps[0].visible = s.caps[1].visible = false;
    }
    hook.visible = on;
    root.updateWorldMatrix(true, false);
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
    if (view.lens !== 'systems' && e.kind !== 'liquid' && e.kind !== 'overlay') {
      const clipped = !!m.userData.clipped;
      const mode = sel ? 'hi' : view.dimOthers && anySel ? 'dim' : 'plain';
      return view.lens === 'materials' ? mats.lens(e.mat, clipped, mode) : mats.thermal(e.thermal, clipped, mode);
    }
    if (view.lens === 'thermal' && e.kind === 'liquid') {
      // propellants in their class colour (LOX cryogenic blue, RP-1 ambient), still translucent
      const t = mats.tint(m, THERMAL_COLORS[e.thermal?.level ?? 1]);
      return sel ? mats.highlight(t) : view.dimOthers && anySel ? mats.dim(t) : t;
    }
    if (sel) return mats.highlight(m);
    if (view.dimOthers && anySel) return mats.dim(m);
    return m;
  };
  const applyLooks = () => {
    const lensOn = view.lens !== 'systems';
    // the materials lens selects by material id; the systems and thermal views by part
    const byMaterial = view.lens === 'materials';
    const anySel = byMaterial ? view.material !== null : view.highlight !== null;
    selectedSet = new Set();
    if (byMaterial && view.material) {
      for (const e of kit.registry) if (e.mat === view.material) selectedSet.add(e.mesh);
    } else if (!byMaterial && view.highlight) {
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
    const c = view.mode === 'cutaway' ? clamp01(view.amount) : 0;
    const x = view.mode === 'exploded' ? clamp01(view.amount) : 0;
    if (c !== cutA) {
      cutA = c;
      applyCut(c);
      applyVisibility();
    }
    if (x !== exA) {
      exA = x;
      applyExplode(x);
    }
    if (look.highlight !== view.highlight || look.dimOthers !== view.dimOthers || look.lens !== view.lens || look.material !== view.material) {
      look.highlight = view.highlight;
      look.dimOthers = view.dimOthers;
      look.lens = view.lens;
      look.material = view.material;
      applyLooks();
    }
  };

  // demonstrations (hangar): effective state = base state + the running demo
  const colletHinge = ctx.movers.collets[0] ?? null;
  const colletQ0 = colletHinge ? colletHinge.quaternion.clone() : null;
  const pusherRod = ctx.movers.pusherRods[0] ?? null;
  const pusherY0 = pusherRod ? pusherRod.position.y : 0;
  const applyDemo = () => {
    Object.assign(eff, base);
    const p = demoP;
    let lift = 0;
    let colletOpen = 0;
    let pushOut = 0;
    let apart = 0;
    switch (demo) {
      case 'tank-drain':
        eff.s1Lox = base.s1Lox * (1 - p * 0.97);
        eff.s1Rp1 = base.s1Rp1 * (1 - p * 0.97);
        eff.s2Lox = base.s2Lox * (1 - ramp(p, 0.55, 1) * 0.6);
        eff.s2Rp1 = base.s2Rp1 * (1 - ramp(p, 0.55, 1) * 0.6);
        break;
      case 'staging-sequence':
        colletOpen = ramp(p, 0.05, 0.3);
        pushOut = ramp(p, 0.32, 0.62);
        lift = pushOut * 0.45 + ramp(p, 0.62, 1) * 1.1;
        break;
      case 'fairing-sep':
        eff.fairingOpen = ramp(p, 0.05, 0.95);
        break;
      case 'booster-recovery':
        eff.fins = ramp(p, 0.02, 0.3);
        eff.finDeflect = p > 0.3 && p < 0.62 ? Math.sin(((p - 0.3) / 0.32) * Math.PI * 2) * 14 : 0;
        eff.legs = ramp(p, 0.64, 0.98);
        break;
      case 'sandwich-panel':
        apart = ramp(p, 0.08, 0.38) - ramp(p, 0.68, 0.95);
        break;
      case 'tvc':
      case 'gnc-loop': {
        // steering corrections: the computer commands small gimbal angles (slowed, illustrative)
        const w = demo === 'tvc' ? 1 : 0.5;
        eff.s1GimbalPitch = Math.sin(demoT * 1.3) * E1.gimbalRangeDeg * w;
        eff.s1GimbalYaw = Math.cos(demoT * 1.3) * E1.gimbalRangeDeg * w;
        eff.s2GimbalPitch = Math.sin(demoT * 1.1) * E1V.gimbalRangeDeg * w;
        break;
      }
    }
    // staging mechanism (hangar demonstration: the upper stack moves up a little)
    if (colletHinge && colletQ0 && colletOpen !== done.collet) {
      done.collet = colletOpen;
      colletHinge.quaternion.copy(colletQ0).multiply(_q.setFromAxisAngle(_X, -0.55 * colletOpen));
      ctx.movers.inst.collets?.update();
    }
    if (pusherRod && pushOut !== done.push) {
      done.push = pushOut;
      pusherRod.position.y = pusherY0 + pushOut * 0.45;
      ctx.movers.inst.pushers?.update();
    }
    if (lift !== stackLift) {
      stackLift = lift;
      for (const id of Object.keys(content) as BodyId[]) if (id !== 'booster') content[id]!.position.y = lift;
    }
    if (coupon && (demo === 'sandwich-panel') !== coupon.group.visible) coupon.set(demo === 'sandwich-panel', apart);
    if (coupon && demo === 'sandwich-panel' && apart !== done.apart) {
      done.apart = apart;
      coupon.set(true, apart);
    }
    applyState();
  };

  // engine demonstrations run on the full booster engine and the E-1V (the hangar also shows them
  // on the engine stands)
  let engineDemo: string | null = null;
  const liveEngines = ctx.movers.engines.filter((m) => m.instance === undefined);
  const applyEngineDemo = (t: number) => {
    const on = demo && ENGINE_DEMOS.has(demo) ? demo : null;
    if (on !== engineDemo) {
      for (const m of liveEngines) {
        m.engine.setFlowOverlay(on === 'regen-cooling' || on === 'combustion' || on === 'turbopump' || on === 'nozzle-pressure');
        if (!on) m.engine.setOperating({ flow: 0, gg: false, ignite: 0, shaftAngle: 0 });
      }
      engineDemo = on;
    }
    if (!on) return;
    const flow = on === 'tvc' ? 0 : 1;
    for (const m of liveEngines) m.engine.setOperating({ flow, gg: flow > 0, shaftAngle: t * Math.PI * 2 * 0.5, ignite: on === 'combustion' ? Math.max(0, 1 - demoP * 8) : 0 });
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
      updateEnclosure();
    },
    setView(v) {
      Object.assign(view, v);
      applyView();
      updateEnclosure();
    },
    animate(t, d, progress) {
      demo = d;
      demoP = clamp01(progress);
      demoT = t;
      applyDemo();
      flows.update(d, t);
      applyEngineDemo(t);
      updateEnclosure();
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
      for (const e of kit.registry) {
        if (e.kind === 'foreign' || e.kind === 'liquid') continue;
        geos.add(e.mesh.geometry);
        if ((e.mesh as THREE.InstancedMesh).isInstancedMesh) (e.mesh as THREE.InstancedMesh).dispose();
      }
      for (const g of geos) g.dispose();
      for (const l of liquids) l.dispose();
      flows.dispose();
      coupon?.dispose();
      for (const e of new Set(ctx.movers.engines.map((m) => m.engine))) e.dispose();
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
  updateEnclosure();
  look.highlight = view.highlight;
  look.dimOthers = view.dimOthers;
  look.lens = view.lens;
  look.material = view.material;
  // anything built outside the kit (helpers) still carries the three tags
  root.traverse((o) => {
    const ud = o.userData;
    if (!(o as THREE.Mesh).isMesh) return;
    if (ud.part === undefined) ud.part = null;
    if (ud.material === undefined) ud.material = null;
    if (ud.thermal === undefined) ud.thermal = 1;
  });
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
  }
  if (full && (config.payload === 'leoSat' || config.payload === 'gtoSat' || config.payload === 'lunarProbe')) {
    // fairing halves (satellite configurations): area centroid of each half-shell
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
    // spacecraft bodies: bounds of the hardware shown at launch (stowed parachutes, folded arrays;
    // hidden deployed states excluded), centroid a little below mid-height (heavy base)
    root.updateMatrixWorld(true);
    const mb = new THREE.Box3();
    const shown = (o: THREE.Object3D, top: THREE.Object3D) => {
      for (let p: THREE.Object3D | null = o; p && p !== top; p = p.parent) if (!p.visible) return false;
      return true;
    };
    for (const [id, g] of Object.entries(sc.bodies) as [BodyId, THREE.Group][]) {
      if (!g) continue;
      const box = new THREE.Box3();
      g.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || !shown(m, g)) return;
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        box.union(mb.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld));
      });
      if (box.isEmpty()) continue;
      com[id] = new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y + (box.max.y - box.min.y) * 0.42, (box.min.z + box.max.z) / 2);
    }
  }
  return com;
}
