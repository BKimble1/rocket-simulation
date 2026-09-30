/**
 * Clearances between the engine's lines (propellant lines, taps, exhaust duct, igniter lines,
 * helium lines and wire harnesses) and between the lines and the chamber / bell wall: nothing
 * passes through anything else, except where a line is meant to join another (a tap leaving a
 * discharge line, the helium coil inside the exhaust duct, harness branches at their junction
 * box, the fuel line ending on the coolant inlet manifold).
 */
import { expect, test } from 'vitest';
import * as THREE from 'three';
import { engineDesign } from './design';
import { routes, TP } from './layout';
import { filletPath } from './geo';

/** Pairs that are joined by design (prefix match on the line names). */
const JOINED: [string, string][] = [
  ['loxDischarge', 'loxTap'],
  ['fuelDischarge', 'fuelTap'],
  ['exhaust', 'he'],
  ['harness', 'harness'],
];

test('lines clear each other and the chamber and bell', () => {
  for (const kind of ['E-1', 'E-1V'] as const) {
    const d = engineDesign(kind);
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
    const joined = (a: string, b: string) => JOINED.some(([p, q]) => (a.startsWith(p) && b.startsWith(q)) || (a.startsWith(q) && b.startsWith(p)));
    const sampled = lines.map((l) => ({ ...l, s: filletPath(l.pts, l.bend, 0.01, 5).p }));
    const bad: string[] = [];
    for (let i = 0; i < sampled.length; i++)
      for (let j = i + 1; j < sampled.length; j++) {
        const A = sampled[i];
        const B = sampled[j];
        if (joined(A.name, B.name)) continue;
        let best = Infinity;
        let at = new THREE.Vector3();
        for (const p of A.s)
          for (const q of B.s) {
            const dd = p.distanceTo(q);
            if (dd < best) {
              best = dd;
              at = p;
            }
          }
        const gap = best - A.r - B.r;
        if (gap < 0.002) bad.push(`${kind} ${A.name} x ${B.name}: gap ${(gap * 1000).toFixed(1)} mm at ${at.toArray().map((v) => v.toFixed(3)).join(',')}`);
      }
    // lines vs the chamber jacket and the tube wall (the fuel line ends on the manifold)
    for (const A of sampled) {
      let worst = Infinity;
      let at = new THREE.Vector3();
      for (const p of A.s) {
        if (p.y > d.injY || p.y < d.exitY) continue;
        if (A.name === 'fuelDown' && p.y < R.pts.manifoldIn.y + 0.06) continue;
        const g = Math.hypot(p.x, p.z) - A.r - d.rOut(p.y);
        if (g < worst) {
          worst = g;
          at = p;
        }
      }
      if (worst < 0.002) bad.push(`${kind} ${A.name} x wall: gap ${(worst * 1000).toFixed(1)} mm at ${at.toArray().map((v) => v.toFixed(3)).join(',')}`);
    }
    expect(bad).toEqual([]);
  }
});
