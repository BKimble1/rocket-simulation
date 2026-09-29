import { test } from 'vitest';
import * as THREE from 'three';
import { engineDesign } from './design';
import { routes, TP } from './layout';
import { filletPath } from './geo';
import { writeFileSync } from 'node:fs';
test('clearances', () => {
  const out: string[] = [];
  const d = engineDesign('E-1');
  const R = routes(d);
  const lines: { name: string; pts: THREE.Vector3[]; r: number; bend: number }[] = [
    { name: 'loxDischarge', pts: R.loxDischarge, r: TP.loxLineR, bend: 0.1 },
    { name: 'movToDome', pts: R.movToDome, r: TP.loxLineR, bend: 0.1 },
    { name: 'fuelDischarge', pts: R.fuelDischarge, r: TP.fuelLineR, bend: 0.09 },
    { name: 'fuelDown', pts: R.fuelDown, r: TP.fuelLineR, bend: 0.2 },
    { name: 'loxTap', pts: R.loxTap, r: TP.tapR, bend: 0.05 },
    { name: 'fuelTap', pts: R.fuelTap, r: TP.tapR, bend: 0.05 },
    { name: 'exhaust', pts: R.exhaust, r: TP.exhaustR, bend: 0.1 },
    { name: 'ignInj', pts: R.igniterToInjector, r: 0.0055, bend: 0.04 },
    { name: 'ignGG', pts: R.igniterToGG, r: 0.0055, bend: 0.05 },
    ...R.helium.map((h, i) => ({ name: 'he' + i, pts: h, r: 0.0062, bend: 0.06 })),
    ...R.harness.map((h, i) => ({ name: 'harness' + i, pts: h, r: 0.0072, bend: 0.05 })),
  ];
  const sampled = lines.map((l) => ({ ...l, s: filletPath(l.pts, l.bend, 0.01, 5).p }));
  for (let i = 0; i < sampled.length; i++)
    for (let j = i + 1; j < sampled.length; j++) {
      const A = sampled[i];
      const B = sampled[j];
      let best = Infinity;
      let at = new THREE.Vector3();
      for (const p of A.s) for (const q of B.s) { const dd = p.distanceTo(q); if (dd < best) { best = dd; at = p; } }
      const gap = best - A.r - B.r;
      if (gap < 0.008) out.push(`${A.name} x ${B.name}: gap ${(gap * 1000).toFixed(1)} mm at ${at.toArray().map((v) => v.toFixed(3)).join(',')}`);
    }
  // vs the chamber / nozzle outer radius (plus bands 0.008)
  for (const A of sampled) {
    let worst = Infinity;
    let at = new THREE.Vector3();
    for (const p of A.s) {
      if (p.y > d.injY || p.y < d.exitY) continue;
      const g = Math.hypot(p.x, p.z) - A.r - d.rOut(p.y);
      if (g < worst) { worst = g; at = p; }
    }
    if (worst < 0.01) out.push(`${A.name} x wall: gap ${(worst * 1000).toFixed(1)} mm at ${at.toArray().map((v) => v.toFixed(3)).join(',')}`);
  }
  writeFileSync('/tmp/claude-0/-home-user/27a32fdd-e1b7-5170-a6d8-816a0def8caa/scratchpad/engine-review/clear.txt', out.join('\n'));
});
