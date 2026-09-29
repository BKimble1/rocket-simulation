import { it } from 'vitest';
import * as THREE from 'three';
import { ParticleSystem } from './particles';
import { SyntheticSource } from './synthetic';
import { R_EARTH } from '../../world/frames';
it('probe', () => {
  const src = new SyntheticSource({ scenario: 'ascent' });
  const sys = new ParticleSystem(0.35);
  sys.setSource(src);
  sys.update(30, 1);
  type R = { k: number; ts: number; active: boolean; p0: THREE.Vector3; u0: THREE.Vector3; tau: number; up: THREE.Vector3 };
  const pool = (sys as unknown as { pools: { sp: { name: string }; recs: R[] }[] }).pools.find((p) => p.sp.name === 'tail')!;
  const recs = pool.recs.filter((r) => r.active).sort((a, b) => b.ts - a.ts);
  const rows = recs.slice(0, 24).map((r) => `ts ${r.ts.toFixed(3)} h0 ${(r.p0.length() - R_EARTH).toFixed(1)} u0up ${r.u0.dot(r.up).toFixed(0)} tau ${r.tau.toFixed(2)}`);
  console.log('RECS\n' + rows.join('\n'));
});
