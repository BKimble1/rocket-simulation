/**
 * Assembles a built spacecraft into the SpacecraftModel contract: visual state (setState),
 * demonstrations (animate), the section view (setCut), the parts map and disposal.
 * Everything visible is a pure function of the stored state, the cut amount and the demo
 * progress, so seeking reproduces the same picture.
 */
import * as THREE from 'three';
import type { BodyId, PartId } from '../../vehicle/parts';
import type { VehicleVisualState } from '../vehicle/types';
import type { SpacecraftAnchors, SpacecraftKind, SpacecraftModel } from './types';
import { clamp01, smooth, type Kit } from './kit';

/** Everything a builder can pose (state channels plus demo-only extras). */
export interface SCState {
  satArrays: number;
  satAntenna: number;
  smArrays: number;
  capDrogue: number;
  capMain: number;
  capNoseCone: number;
  capChar: number;
  /** Attitude slew about the body's own axes (rad): yaw about +Y, pitch about +X. */
  slewYaw: number;
  slewPitch: number;
  /** Solar-array drive angle about the wing axis (rad). */
  arrayDrive: number;
  /** Antenna gimbal pointing offset (rad). */
  antennaSlew: number;
  /** Heat-shield layer separation for the close-up 0..1. */
  layerSep: number;
  /** Hide companion bodies (service module, abort tower) during capsule-only demos. */
  capsuleOnly: boolean;
}

export interface Built {
  bodies: Partial<Record<BodyId, THREE.Group>>;
  anchors: SpacecraftAnchors;
  pose(s: SCState): void;
  /** Extra disposal (per-model materials not registered with the kit). */
  dispose?(): void;
}

const STATE_KEYS = ['satArrays', 'satAntenna', 'smArrays', 'capDrogue', 'capMain', 'capNoseCone', 'capChar'] as const;

export function assemble(kind: SpacecraftKind, kit: Kit, built: Built): SpacecraftModel {
  const animated = findAnimated(kit, built);
  for (const g of Object.values(built.bodies))
    if (g) {
      kit.flatten(g, animated);
      kit.finalize(g, animated);
    }
  kit.prepareCut();
  const parts = new Map<PartId, THREE.Object3D[]>();
  for (const g of Object.values(built.bodies))
    g?.traverse((o) => {
      const id = o.userData.part as PartId | undefined;
      if (!id || !((o as THREE.Mesh).isMesh || (o as THREE.LineSegments).isLineSegments)) return;
      let list = parts.get(id);
      if (!list) parts.set(id, (list = []));
      list.push(o);
    });

  const state: Record<(typeof STATE_KEYS)[number], number> = { satArrays: 0, satAntenna: 0, smArrays: 0, capDrogue: 0, capMain: 0, capNoseCone: 0, capChar: 0 };
  let cut = 0;
  let demoCut = 0;
  let appliedCut = -1;
  const pose: SCState = { ...state, slewYaw: 0, slewPitch: 0, arrayDrive: 0, antennaSlew: 0, layerSep: 0, capsuleOnly: false };

  const applyCut = () => {
    const a = Math.max(cut, demoCut);
    if (a !== appliedCut) {
      appliedCut = a;
      kit.applyCut(a);
    } else kit.syncFades();
  };
  const base = () => {
    Object.assign(pose, state);
    pose.slewYaw = 0;
    pose.slewPitch = 0;
    pose.arrayDrive = 0;
    pose.antennaSlew = 0;
    pose.layerSep = 0;
    pose.capsuleOnly = false;
    demoCut = 0;
  };
  base();
  built.pose(pose);
  applyCut();

  const satellite = kind === 'leoSat' || kind === 'gtoSat' || kind === 'lunarProbe';
  const capsule = kind === 'capsule' || kind === 'researchCapsule';

  return {
    kind,
    bodies: built.bodies,
    parts,
    anchors: built.anchors,
    setState(s: Partial<VehicleVisualState>) {
      let changed = false;
      for (const k of STATE_KEYS) {
        const v = s[k];
        if (v !== undefined && Number.isFinite(v) && v !== state[k]) {
          state[k] = k === 'capMain' ? Math.max(0, Math.min(1, v)) : clamp01(v);
          changed = true;
        }
      }
      if (changed) {
        base();
        built.pose(pose);
        applyCut();
      }
    },
    setCut(amount: number) {
      cut = clamp01(amount);
      applyCut();
    },
    animate(_t: number, demo: string | null, progress: number) {
      const p = clamp01(progress);
      base();
      if (demo === 'spacecraft-ops') {
        // deploy arrays, then the antenna, then an attitude slew (arrays track the Sun)
        const dep = smooth(0, 0.45, p);
        if (satellite) {
          pose.satArrays = Math.max(pose.satArrays, dep);
          pose.satAntenna = Math.max(pose.satAntenna, smooth(0.3, 0.6, p));
        }
        if (kind === 'capsule') {
          pose.smArrays = Math.max(pose.smArrays, dep);
          pose.capNoseCone = Math.max(pose.capNoseCone, smooth(0.45, 0.65, p));
        }
        const sl = smooth(0.62, 0.82, p) - smooth(0.88, 1, p);
        pose.slewYaw = sl * 0.6;
        pose.slewPitch = sl * 0.25;
        pose.arrayDrive = -sl * 0.5;
        pose.antennaSlew = sl * 0.35;
      } else if (demo === 'capsule-return' && capsule) {
        // after entry: charred shield; drogues, then mains reefed, then disreefed
        pose.capChar = Math.max(pose.capChar, 1);
        pose.capsuleOnly = true;
        pose.capDrogue = smooth(0.05, 0.3, p) * (1 - smooth(0.46, 0.5, p));
        pose.capMain = p < 0.42 ? 0 : p < 0.7 ? 0.5 * smooth(0.42, 0.62, p) : 0.5 + 0.5 * smooth(0.7, 0.95, p);
      } else if (demo === 'heat-shield-stack' && capsule) {
        pose.capsuleOnly = true;
        demoCut = smooth(0, 0.35, p);
        pose.layerSep = smooth(0.3, 0.85, p);
      }
      built.pose(pose);
      applyCut();
    },
    dispose() {
      built.dispose?.();
      kit.dispose();
    },
  };
}

export function emptyAnchors(topY: number): SpacecraftAnchors {
  return { satRcs: [], satApogee: null, capsuleRcs: [], smEngine: null, smRcs: [], lesNozzles: [], dockPort: null, chuteAttach: null, topY };
}

/** Pose samples that together move everything a builder can move (for the static-group flattening). */
const PROBES: Partial<SCState>[] = [
  ...[0.1, 0.3, 0.5, 0.7, 0.9, 1].map((v) => ({ satArrays: v, smArrays: v })),
  ...[0.3, 0.7, 1].map((v) => ({ satAntenna: v })),
  ...[0.1, 0.5, 1].map((v) => ({ capDrogue: v })),
  ...[0.1, 0.3, 0.5, 0.6, 0.8, 1].map((v) => ({ capMain: v })),
  { capNoseCone: 0.5 },
  { capNoseCone: 1 },
  { capChar: 1 },
  { slewYaw: 0.5, slewPitch: 0.3, arrayDrive: 0.5, antennaSlew: 0.3 },
  { satArrays: 1, satAntenna: 1, smArrays: 1, slewYaw: -0.4, slewPitch: -0.2, arrayDrive: -0.6, antennaSlew: -0.3 },
  { layerSep: 0.5 },
  { layerSep: 1 },
  { capsuleOnly: true },
];

/**
 * Every object whose transform, visibility, material or geometry changes with the pose, plus the
 * section-view groups the kit moves. Poses the builder through the probe states and restores
 * the neutral pose afterwards.
 */
function findAnimated(kit: Kit, built: Built): Set<THREE.Object3D> {
  const roots = Object.values(built.bodies).filter((g): g is THREE.Group => !!g);
  const sig = (o: THREE.Object3D) => {
    const m = o as THREE.Mesh;
    let s = [...o.position.toArray(), ...o.quaternion.toArray(), ...o.scale.toArray(), o.visible ? 1 : 0].map((x) => (typeof x === 'number' ? x.toFixed(7) : x)).join(',');
    if (m.isMesh || (o as THREE.LineSegments).isLineSegments) {
      const mat = m.material;
      s += `|${Array.isArray(mat) ? mat.map((x) => x.uuid).join('+') : mat.uuid}|${m.geometry.uuid}`;
      for (const a of Object.values(m.geometry.attributes)) s += `:${(a as THREE.BufferAttribute).version ?? 0}`;
    }
    return s;
  };
  const neutral: SCState = { satArrays: 0, satAntenna: 0, smArrays: 0, capDrogue: 0, capMain: 0, capNoseCone: 0, capChar: 0, slewYaw: 0, slewPitch: 0, arrayDrive: 0, antennaSlew: 0, layerSep: 0, capsuleOnly: false };
  built.pose({ ...neutral });
  const base = new Map<THREE.Object3D, string>();
  for (const r of roots) r.traverse((o) => base.set(o, sig(o)));
  const animated = new Set<THREE.Object3D>();
  for (const probe of PROBES) {
    built.pose({ ...neutral, ...probe });
    for (const r of roots) r.traverse((o) => {
      if (base.get(o) !== sig(o)) animated.add(o);
    });
  }
  built.pose({ ...neutral });
  for (const w of kit.wedges) animated.add(w.g);
  for (const g of kit.capGroups) animated.add(g);
  for (const g of kit.innerGroups) animated.add(g);
  for (const h of kit.cutHide) animated.add(h);
  for (const l of kit.labels) animated.add(l.anchor);
  return animated;
}
