import { test } from 'vitest';
import * as THREE from 'three';
import { buildEngineWith } from './buildEngine';
import { plainMaterialSet } from './mats';
test('probe', () => {
  for (const k of ['E-1', 'E-1V'] as const)
    for (const det of ['hangar', 'flight', 'cluster'] as const) {
      const e = buildEngineWith(k, det, plainMaterialSet());
      let calls = 0, tris = 0;
      e.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        for (let p: THREE.Object3D | null = m; p; p = p.parent) if (!p.visible) return;
        const g = m.geometry;
        calls++;
        tris += ((g.index ? g.index.count : g.attributes.position.count) / 3) * ((m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1);
      });
      console.log('BUDGET', k, det, calls, Math.round(tris));
    }
});
