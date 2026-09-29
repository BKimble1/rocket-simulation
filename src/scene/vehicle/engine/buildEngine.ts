/**
 * E-1 / E-1V engine models (contract: ./types.ts). One LOX/RP-1 gas-generator core in two
 * versions, three levels of detail:
 *   hangar   everything, with explicit half-section internals for the cutaway, mechanisms
 *            (gimbal and actuators, turbopump shaft, main valves), glow and flow overlays;
 *   flight   exterior only, 40 segments, merged by material;
 *   cluster  very light exterior for seven engines on the booster (<= 8 draw calls each).
 *
 * Hierarchy: root (placed by the caller at the gimbal pivot) > fixed (stage-side mount, never
 * moves) and cross (gimbal cross, pitch about X) > gimbal (the engine, yaw about Z) > rotor
 * (turbopump shaft) and valve elements. The TVC actuators and propellant-inlet bellows join
 * the fixed side to the moving engine and are re-posed on every setOperating.
 *
 * Integration extras on root.userData: `ggExhaust` {pos, dir} (engine frame) for the turbine
 * exhaust soot jet, `design` numbers for lessons (throat, chamber, contour angles).
 */
import * as THREE from 'three';
import type { PartId } from '../../../vehicle/parts';
import { tierSpec } from '../../quality';
import { engineDesign } from './design';
import { Kit, type NodeGroups, type NodeId } from './kit';
import { engineMaterialSet, type MaterialSet } from './mats';
import { buildTCA } from './tca';
import { buildTurbomachinery } from './turbo';
import { buildPlumbing } from './plumbing';
import { buildMechanisms } from './mech';
import { buildGlow } from './glow';
import { buildFlowOverlay } from './flow';
import type { EngineDetail, EngineKind, EngineModel, EngineOperating } from './types';

const DEG = Math.PI / 180;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function buildEngine(kind: EngineKind, detail: EngineDetail): EngineModel {
  return buildEngineWith(kind, detail, engineMaterialSet());
}

/** Same as buildEngine with an explicit material set (tests use a plain one). */
export function buildEngineWith(kind: EngineKind, detail: EngineDetail, mats: MaterialSet): EngineModel {
  const d = engineDesign(kind);
  const tier = tierSpec();
  const segs = detail === 'hangar' ? Math.max(96, Math.round(128 * tier.detail)) : detail === 'flight' ? 40 : 28;

  const root = new THREE.Group();
  root.name = `engine:${kind}`;
  const pivots: Record<NodeId, THREE.Vector3> = {
    fixed: new THREE.Vector3(),
    cross: new THREE.Vector3(),
    gimbal: new THREE.Vector3(),
    rotor: new THREE.Vector3(d.tpX, 0, 0),
    mov: new THREE.Vector3(d.mov.x, d.mov.y, d.mov.z),
    mfv: new THREE.Vector3(d.mfv.x, d.mfv.y, d.mfv.z),
  };
  const groups = {} as Record<NodeId, NodeGroups>;
  const mk = (id: NodeId, parent: THREE.Object3D) => {
    const keep = new THREE.Group();
    keep.name = id;
    const front = new THREE.Group();
    front.name = `${id}:front`;
    const caps = new THREE.Group();
    caps.name = `${id}:section`;
    caps.visible = false;
    keep.add(front, caps);
    parent.add(keep);
    groups[id] = { keep, front, caps };
    return keep;
  };
  mk('fixed', root);
  const cross = mk('cross', root);
  const gimbal = mk('gimbal', cross);
  const rotor = mk('rotor', gimbal);
  rotor.position.copy(pivots.rotor);
  const mov = mk('mov', gimbal);
  mov.position.copy(pivots.mov);
  const mfv = mk('mfv', gimbal);
  mfv.position.copy(pivots.mfv);

  const kit = new Kit(pivots, detail === 'hangar');
  buildTCA(kit, d, detail, segs);
  buildTurbomachinery(kit, d, detail, segs);
  buildPlumbing(kit, d, detail, segs);
  const mech = buildMechanisms(kit, d, detail, segs, mats);

  const alias = kind === 'E-1V' ? (p: PartId): PartId => (p === 'nozzle-extension' ? p : 'vacuum-engine') : undefined;
  const meshes = kit.build(mats, groups, alias);
  for (const m of mech.meshes) {
    if (alias) {
      const p = m.userData.part as PartId;
      m.userData.part = alias(p);
      if (m.userData.part !== p) m.userData.subPart = p;
    }
    root.add(m);
  }

  const glow = detail === 'hangar' ? buildGlow(d, segs) : null;
  if (glow) gimbal.add(glow.group);
  const overlay = detail === 'hangar' ? buildFlowOverlay(d, mats) : null;
  if (overlay) gimbal.add(overlay.group);
  // effects never cast shadows (the caller switches shadows on for every mesh it finds)
  for (const g of [glow?.group, overlay?.group])
    g?.traverse((o) => {
      Object.defineProperty(o, 'castShadow', { get: () => false, set: () => {}, configurable: true });
      Object.defineProperty(o, 'receiveShadow', { get: () => false, set: () => {}, configurable: true });
    });

  // part index
  const parts = new Map<PartId, THREE.Object3D[]>();
  const whole: PartId = kind === 'E-1V' ? 'vacuum-engine' : 'engine';
  const put = (id: PartId, o: THREE.Object3D) => {
    const l = parts.get(id);
    if (l) l.push(o);
    else parts.set(id, [o]);
  };
  for (const m of [...meshes, ...mech.meshes]) {
    const role = m.userData.role as string | undefined;
    if (role === 'cap' || role === 'capx') continue;
    const p = m.userData.part as PartId;
    put(p, m);
    const sub = m.userData.subPart as PartId | undefined;
    if (sub && sub !== p && sub !== whole) put(sub, m);
    if (p !== whole) put(whole, m);
  }
  if (kind === 'E-1V') {
    // the whole E-1V includes its extension
    for (const m of parts.get('nozzle-extension') ?? []) if (!parts.get(whole)!.includes(m)) parts.get(whole)!.push(m);
  }

  const ggExit = new THREE.Vector3(d.ggExit.x, d.ggExit.y, d.ggExit.z);
  root.userData.ggExhaust = { pos: ggExit, dir: new THREE.Vector3(0.12, -1, -0.1).normalize() };
  root.userData.design = {
    throatY: d.throatY,
    injectorY: d.injY,
    chamberRadius: d.rc,
    contractionRatio: (d.rc / d.rt) ** 2,
    expansionRatio: (d.exitR / d.rt) ** 2,
    bellFraction: d.contour.bellFraction,
    thetaNDeg: d.contour.thetaN / DEG,
    thetaEDeg: d.contour.thetaE / DEG,
    lStar: d.contour.chamberVolume / (Math.PI * d.rt * d.rt),
  };

  // ── runtime state ──
  const op: EngineOperating = { flow: 0, shaftAngle: 0, pitch: 0, yaw: 0, gg: false, ignite: 0 };
  let cut = 0;
  let overlayOn = false;
  const range = d.spec.gimbalRangeDeg;
  const slideMax = d.vac ? 0.9 : 0.55;

  const applyCut = () => {
    const a = detail === 'hangar' ? Math.min(1, Math.max(0, cut)) : 0;
    const slide = smooth(0, 1, a) * slideMax;
    const fade = 1 - smooth(0.12, 0.8, a);
    for (const id of Object.keys(groups) as NodeId[]) {
      const g = groups[id];
      g.front.position.z = slide;
      g.front.visible = fade > 0.004;
      g.caps.visible = a > 0.001;
    }
    mats.setFade(fade);
    mech.setCut(slide, fade);
    glow?.update(op, a);
  };

  const applyOperating = () => {
    const p = THREE.MathUtils.clamp(op.pitch, -range, range) * DEG;
    const y = THREE.MathUtils.clamp(op.yaw, -range, range) * DEG;
    cross.rotation.x = p;
    gimbal.rotation.z = y;
    rotor.rotation.y = op.shaftAngle;
    const open = smooth(0.0, 0.12, op.flow);
    // ball valve: bore across the flow when closed, aligned when open (quarter turn about Y)
    mov.rotation.y = (1 - open) * (Math.PI / 2);
    // butterfly: disc across the bore when closed, edge-on when open (quarter turn about Z)
    mfv.rotation.z = open * (Math.PI / 2) * 0.96;
    root.updateMatrixWorld(true);
    mech.update(cross, gimbal);
    mats.setGlow(d.vac ? Math.min(1, Math.max(0, op.flow)) : 0);
    glow?.update(op, detail === 'hangar' ? cut : 0);
    overlay?.setSpeed(0.35 + 0.65 * Math.min(1, Math.max(0, op.flow)));
  };
  applyOperating();
  applyCut();

  return {
    kind,
    root,
    parts,
    exitY: d.exitY,
    exitRadius: d.exitR,
    throatY: d.throatY,
    throatRadius: d.rt,
    setOperating(o: Partial<EngineOperating>) {
      Object.assign(op, o);
      applyOperating();
    },
    setCut(amount: number) {
      if (amount === cut) return;
      cut = amount;
      applyCut();
    },
    setFlowOverlay(on: boolean) {
      if (on === overlayOn) return;
      overlayOn = on;
      if (overlay) overlay.group.visible = on;
    },
    dispose() {
      // GPU resources only: the caller owns the scene graph (and React may re-use it in dev)
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.geometry?.dispose();
      });
      overlay?.dispose();
      glow?.dispose();
      mech.dispose();
      mats.dispose();
    },
  };
}
