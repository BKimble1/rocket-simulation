import { test } from 'vitest';
import * as THREE from 'three';
import { buildEngineWith } from './buildEngine';
import { plainMaterialSet } from './mats';
import type { EngineDetail, EngineKind } from './types';

function stats(kind: EngineKind, det: EngineDetail, cut: number, overlay: boolean, verbose: boolean) {
  const e = buildEngineWith(kind, det, plainMaterialSet());
  e.setCut(cut);
  e.setFlowOverlay(overlay);
  e.setOperating({ flow: 1, gg: true, ignite: 0 });
  let calls = 0, tris = 0;
  const rows: [string, number][] = [];
  const byNode: Record<string, [number, number]> = {};
  e.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh && !(o as THREE.Line).isLine && !(o as THREE.Points).isPoints) return;
    let vis = true;
    for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) vis = false;
    if (!vis) return;
    const g = m.geometry;
    let t = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    const inst = (m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1;
    t *= inst;
    const mats = Array.isArray(m.material) ? m.material.length : 1;
    calls += mats;
    tris += t;
    const top = (() => { let p: THREE.Object3D | null = o; let s = ''; while (p && p !== e.root) { s = p.name + '/' + s; p = p.parent; } return s; })();
    rows.push([top + ' ' + m.name + (inst > 1 ? ` x${inst}` : ''), t]);
    const key = top.split('/').slice(0, 2).join('/');
    byNode[key] = byNode[key] ?? [0, 0];
    byNode[key][0]++; byNode[key][1] += t;
  });
  console.log(`${kind} ${det} cut=${cut} ov=${overlay}: calls=${calls} tris=${Math.round(tris)}`);
  if (verbose) {
    rows.sort((a, b) => b[1] - a[1]);
    console.log(rows.slice(0, 45).map(([n, t]) => `  ${Math.round(t)}\t${n}`).join('\n'));
    console.log(Object.entries(byNode).map(([k, [c, t]]) => `  node ${k}: ${c} calls ${Math.round(t)} tris`).join('\n'));
  }
  e.dispose();
}
test('stats', () => {
  const v = process.env.V === '1';
  for (const k of ['E-1', 'E-1V'] as EngineKind[]) {
    stats(k, 'hangar', 0, false, v && k === 'E-1');
    stats(k, 'hangar', 1, true, false);
    stats(k, 'flight', 0, false, v && k === 'E-1');
    stats(k, 'cluster', 0, false, v && k === 'E-1');
  }
}, 60000);
