import { test } from 'vitest';
import * as THREE from 'three';
import { buildEngineWith } from './buildEngine';
import { plainMaterialSet } from './mats';
test('probe', () => {
  const e = buildEngineWith('E-1', 'hangar', plainMaterialSet());
  e.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.name.startsWith('combustion-chamber:jacket')) return;
    const pos = m.geometry.attributes.position;
    let best: number[] = [];
    let bz = Infinity;
    const zs: number[] = [];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (x < -0.15 && Math.abs(z) < 0.003) zs.push(Math.round(y * 1000) / 1000 + Math.hypot(x, z) / 1000);
    }
    zs.sort((a, b) => a - b);
    const ys = new Map<number, number>();
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i); const rr = Math.hypot(x, z); if (x < -0.15 && Math.abs(z) < 0.003 && rr > 0.2445 && rr < 0.2452) ys.set(Math.round(y * 1000) / 1000, Math.max(ys.get(Math.round(y * 1000) / 1000) ?? 0, Math.hypot(x, z))); }
    console.log('JF', m.name, [...ys.entries()].sort((a, b) => b[0] - a[0]).map(([y, r]) => `${y}:${r.toFixed(4)}`).join(' '));
    void best; void bz;
  });
});
