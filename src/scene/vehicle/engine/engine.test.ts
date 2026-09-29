import { describe, expect, test } from 'vitest';
import * as THREE from 'three';
import { buildEngineWith } from './buildEngine';
import { plainMaterialSet } from './mats';
import { engineDesign } from './design';
import { buildContour, cone15Length, radiusAt } from './contour';
import { E1, E1V, STATIONS } from '../../../vehicle/spec';
import { PART_IDS } from '../../../vehicle/parts';
import type { EngineDetail, EngineKind } from './types';

const kinds: EngineKind[] = ['E-1', 'E-1V'];
const details: EngineDetail[] = ['hangar', 'flight', 'cluster'];

/** Radius (plan view) and y extent of all engine geometry (overlays and glow excluded). */
function extent(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  let rMax = 0;
  let yMin = Infinity;
  let yMax = -Infinity;
  const v = new THREE.Vector3();
  const m = new THREE.Matrix4();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    let p: THREE.Object3D | null = mesh;
    while (p) {
      if (p.name === 'flow-overlay' || p.name === 'glow') return;
      p = p.parent;
    }
    const pos = mesh.geometry.attributes.position;
    const inst = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh) : null;
    const n = inst ? inst.count : 1;
    for (let k = 0; k < n; k++) {
      if (inst) inst.getMatrixAt(k, m);
      for (let i = 0; i < pos.count; i += 3) {
        v.fromBufferAttribute(pos, i);
        if (inst) v.applyMatrix4(m);
        v.applyMatrix4(mesh.matrixWorld);
        rMax = Math.max(rMax, Math.hypot(v.x, v.z));
        yMin = Math.min(yMin, v.y);
        yMax = Math.max(yMax, v.y);
      }
    }
  });
  return { rMax, yMin, yMax };
}

describe('engine design', () => {
  test('nozzle matches the spec and the vehicle stations', () => {
    for (const k of kinds) {
      const d = engineDesign(k);
      const spec = k === 'E-1' ? E1 : E1V;
      expect((d.exitR / d.rt) ** 2).toBeCloseTo(spec.expansionRatio, 0);
      expect(d.rc / d.rt).toBeCloseTo(1.7, 5);
      const stations = k === 'E-1' ? STATIONS.s1Gimbal - STATIONS.s1NozzleExit : STATIONS.s2Gimbal - STATIONS.s2NozzleExit;
      expect(-d.exitY).toBeCloseTo(stations, 6);
      // the contour reaches the exit radius exactly at the exit plane
      expect(radiusAt(d.contour, d.contour.xExit)).toBeCloseTo(d.exitR, 6);
      expect(d.throatY - d.contour.xExit).toBeCloseTo(d.exitY, 6);
      // L* sizing reproduced
      expect(d.contour.chamberVolume / (Math.PI * d.rt ** 2)).toBeCloseTo(1.15, 2);
    }
  });
  test('Rao bell: monotonic, tangent to the throat arc, angles in range', () => {
    const c = buildContour({ rt: 0.125, rc: 0.2125, re: 0.53, lStar: 1.15, nozzleLength: 1.45 });
    let prev = 0;
    for (const [x, r] of c.pts) {
      if (x <= 0) continue;
      expect(r).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = r;
    }
    expect(c.bellFraction).toBeGreaterThan(0.8);
    expect(c.bellFraction).toBeLessThan(1.05);
    expect(c.thetaN * (180 / Math.PI)).toBeGreaterThan(15);
    expect(c.thetaE).toBeLessThan(c.thetaN);
    expect(cone15Length(0.125, 0.53)).toBeGreaterThan(1.4);
  });
});

describe('engine models', () => {
  for (const k of kinds)
    for (const det of details)
      test(`${k} ${det}: silhouette, tags, parts`, () => {
        const e = buildEngineWith(k, det, plainMaterialSet());
        expect(e.exitY).toBeLessThan(0);
        expect(e.exitRadius).toBeCloseTo((k === 'E-1' ? E1 : E1V).exitDiameter / 2, 6);
        const ext = extent(e.root);
        // everything above the exit plane and below the stage interface
        expect(ext.yMin).toBeGreaterThan(e.exitY - 0.06);
        expect(ext.yMax).toBeLessThan(0.26);
        // seven E-1s fit the booster base: stay inside the exit circle plus a small margin
        if (k === 'E-1') expect(ext.rMax).toBeLessThan(E1.exitDiameter / 2 + 0.045);
        else expect(ext.rMax).toBeLessThan(E1V.exitDiameter / 2 + 0.03);
        // every mesh is tagged with a known part
        e.root.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          let p: THREE.Object3D | null = m;
          while (p) {
            if (p.name === 'flow-overlay' || p.name === 'glow') return;
            p = p.parent;
          }
          expect(PART_IDS).toContain(m.userData.part);
        });
        if (k === 'E-1' && det === 'hangar')
          for (const id of ['engine', 'turbopump', 'gas-generator', 'injector', 'combustion-chamber', 'nozzle', 'main-valves', 'tvc-actuators', 'igniter'] as const) expect(e.parts.get(id)?.length ?? 0).toBeGreaterThan(0);
        if (k === 'E-1V') {
          expect(e.parts.get('vacuum-engine')?.length ?? 0).toBeGreaterThan(0);
          expect(e.parts.get('nozzle-extension')?.length ?? 0).toBeGreaterThan(0);
        }
        e.dispose();
      });

  test('cluster detail stays within 12 draw calls per engine', () => {
    for (const k of kinds) {
      const e = buildEngineWith(k, 'cluster', plainMaterialSet());
      let calls = 0;
      e.root.traverse((o) => {
        const m = o as THREE.Mesh;
        let vis = true;
        let p: THREE.Object3D | null = m;
        while (p) {
          if (!p.visible) vis = false;
          p = p.parent;
        }
        if (m.isMesh && vis) calls++;
      });
      expect(calls).toBeLessThanOrEqual(12);
      e.dispose();
    }
  });

  /** Visible draw calls and triangles of the main pass (instances counted), and the shadow casters. */
  function budget(root: THREE.Object3D) {
    let calls = 0;
    let tris = 0;
    let casters = 0;
    let casterTris = 0;
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      for (let p: THREE.Object3D | null = m; p; p = p.parent) if (!p.visible) return;
      const g = m.geometry;
      const t = ((g.index ? g.index.count : g.attributes.position.count) / 3) * ((m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1);
      calls++;
      tris += t;
      // what a caller that switches shadows on for every mesh gets
      m.castShadow = true;
      if (m.castShadow) {
        casters++;
        casterTris += t;
      }
    });
    return { calls, tris, casters, casterTris };
  }

  test('draw call and triangle budgets per engine (main pass and shadow pass)', () => {
    for (const k of kinds) {
      const h = buildEngineWith(k, 'hangar', plainMaterialSet());
      const bh = budget(h.root);
      // hangar: <= 160 calls and <= 450 k triangles including the shadow pass
      expect(bh.calls + bh.casters).toBeLessThanOrEqual(160);
      expect(bh.tris + bh.casterTris).toBeLessThanOrEqual(450_000);
      // the detailed meshes never cast: only the shadow shells and the two actuators
      expect(bh.casters).toBeLessThanOrEqual(4);
      h.setCut(1);
      h.setFlowOverlay(true);
      h.setOperating({ flow: 1, gg: true, ignite: 1 });
      const bc = budget(h.root);
      expect(bc.calls + bc.casters).toBeLessThanOrEqual(160);
      expect(bc.tris + bc.casterTris).toBeLessThanOrEqual(450_000);
      h.dispose();
      const f = budget(buildEngineWith(k, 'flight', plainMaterialSet()).root);
      expect(f.calls).toBeLessThanOrEqual(30);
      expect(f.tris).toBeLessThanOrEqual(60_000);
      const c = budget(buildEngineWith(k, 'cluster', plainMaterialSet()).root);
      expect(c.calls).toBeLessThanOrEqual(12);
      expect(c.tris).toBeLessThanOrEqual(25_000);
    }
  });

  test('gimbal: actuators stay attached, lengths change with pitch', () => {
    const e = buildEngineWith('E-1', 'hangar', plainMaterialSet());
    const rods = [] as THREE.InstancedMesh[];
    e.root.traverse((o) => {
      if ((o as THREE.InstancedMesh).isInstancedMesh && o.name.includes('chrome')) rods.push(o as THREE.InstancedMesh);
    });
    const rod = rods[0];
    const m = new THREE.Matrix4();
    const at = () => {
      rod.getMatrixAt(0, m);
      return new THREE.Vector3().setFromMatrixPosition(m);
    };
    const p0 = at();
    e.setOperating({ pitch: 5 });
    const p1 = at();
    expect(p0.distanceTo(p1)).toBeGreaterThan(0.02);
    // the rod end follows the chamber lug: compare with the lug point carried by the gimbal
    const d = engineDesign('E-1');
    const phi = d.tvc.phis[0];
    const lugPt = new THREE.Vector3(Math.sin(phi) * d.tvc.rB, d.tvc.yB, Math.cos(phi) * d.tvc.rB).applyAxisAngle(new THREE.Vector3(1, 0, 0), (5 * Math.PI) / 180);
    expect(p1.distanceTo(lugPt)).toBeLessThan(1e-3);
    e.setOperating({ pitch: 99 });
    // clamped to the gimbal range
    const cross = e.root.getObjectByName('cross')!;
    expect(cross.rotation.x).toBeCloseTo((E1.gimbalRangeDeg * Math.PI) / 180, 6);
    e.dispose();
  });

  test('section view: caps appear and the front half fades', () => {
    const e = buildEngineWith('E-1', 'hangar', plainMaterialSet());
    const caps = e.root.getObjectByName('gimbal:section')!;
    const front = e.root.getObjectByName('gimbal:front')!;
    expect(caps.visible).toBe(false);
    e.setCut(1);
    expect(caps.visible).toBe(true);
    expect(front.visible).toBe(false);
    e.setCut(0.3);
    expect(front.visible).toBe(true);
    expect(front.position.z).toBeGreaterThan(0);
    e.dispose();
  });
});

describe('thermal lens tags', () => {
  test('every surface mesh carries a thermal class; key parts have the expected class', () => {
    for (const k of kinds)
      for (const det of details) {
        const e = buildEngineWith(k, det, plainMaterialSet());
        const seen = new Map<string, Set<number>>();
        e.root.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh || m.userData.lensExempt) return;
          const th = m.userData.thermal as number;
          expect(Number.isInteger(th) && th >= 0 && th <= 4).toBe(true);
          const p = (m.userData.subPart ?? m.userData.part) as string;
          if (!seen.has(p)) seen.set(p, new Set());
          seen.get(p)!.add(th);
        });
        if (det === 'hangar') {
          expect(seen.get('combustion-chamber')).toEqual(new Set([4]));
          expect(seen.get('turbopump')!.has(0)).toBe(true); // LOX pump
          expect(seen.get('turbopump')!.has(3)).toBe(true); // turbine side
          expect(seen.get('gas-generator')!.has(4)).toBe(true);
          expect(seen.get('nozzle')!.has(3)).toBe(true);
          expect(seen.get('engine')!.has(0)).toBe(true); // LOX lines and bellows
          expect(seen.get('engine')!.has(1)).toBe(true); // fuel lines
          expect(seen.get('main-valves')).toEqual(new Set([1]));
          if (k === 'E-1V') expect(seen.get('nozzle-extension')).toEqual(new Set([4]));
        }
        e.dispose();
      }
  });
  test('effect meshes keep their materials when a lens swaps materials', () => {
    const e = buildEngineWith('E-1', 'hangar', plainMaterialSet());
    const swap = new THREE.MeshBasicMaterial();
    let exempt = 0;
    e.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.userData.lensExempt) return;
      exempt++;
      const before = m.material;
      m.material = swap;
      expect(m.material).toBe(before);
    });
    expect(exempt).toBeGreaterThan(4);
    swap.dispose();
    e.dispose();
  });
});

describe('mechanisms', () => {
  test('shaft, valves, glow and flow overlay respond to the operating state', () => {
    const e = buildEngineWith('E-1V', 'hangar', plainMaterialSet());
    const rotor = e.root.getObjectByName('rotor')!;
    const mov = e.root.getObjectByName('mov')!;
    const mfv = e.root.getObjectByName('mfv')!;
    const overlay = e.root.getObjectByName('flow-overlay')!;
    const closedBall = mov.rotation.y;
    e.setOperating({ shaftAngle: 1.25 });
    expect(rotor.rotation.y).toBeCloseTo(1.25, 6);
    e.setOperating({ flow: 1 });
    expect(Math.abs(mov.rotation.y - closedBall)).toBeGreaterThan(1);
    expect(mfv.rotation.z).toBeGreaterThan(1);
    expect(overlay.visible).toBe(false);
    e.setFlowOverlay(true);
    expect(overlay.visible).toBe(true);
    // the engine swings about the gimbal pivot
    e.setOperating({ yaw: 3 });
    expect(e.root.getObjectByName('gimbal')!.rotation.z).toBeCloseTo((3 * Math.PI) / 180, 6);
    e.dispose();
  });
});
