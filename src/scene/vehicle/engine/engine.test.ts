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
