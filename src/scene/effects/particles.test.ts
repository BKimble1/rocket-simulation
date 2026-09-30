import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ParticleSystem, type Particle } from './particles';
import { copyEmitter, buildClusters, SnapshotCache, type ClusterSnap, type EmitterSnap, type Snapshot } from './snapshot';
import { MAX_VOLUMES, PlumeSet } from './plumes';
import { TRENCH_DIR } from './pad';
import { siteFrameQuaternion, sitePosition } from '../../world/frames';
import type { Emitter } from './input';
import { SyntheticSource } from './synthetic';
import { EXIT_PRESSURE, columnShape, makeColumnShape, pressureRatioAmb } from './physics';
import { stdPressure } from './synthetic';
import { E1 } from '../../vehicle/spec';

interface Snap {
  x: number;
  y: number;
  z: number;
  r: number;
  a: number;
}

function capture(sys: ParticleSystem): Snap[] {
  const out: Snap[] = [];
  for (let i = 0; i < sys.count; i++) {
    const p: Particle = sys.out[i];
    out.push({ x: p.pos.x, y: p.pos.y, z: p.pos.z, r: p.radius, a: p.alpha });
  }
  // slots are visited in a fixed order, but compare as sets to be robust
  return out.sort((a, b) => a.x - b.x || a.y - b.y || a.z - b.z);
}

function expectSame(a: Snap[], b: Snap[]) {
  expect(a.length).toBe(b.length);
  for (let i = 0; i < a.length; i++) {
    expect(Math.abs(a[i].x - b[i].x)).toBeLessThan(1e-6);
    expect(Math.abs(a[i].y - b[i].y)).toBeLessThan(1e-6);
    expect(Math.abs(a[i].z - b[i].z)).toBeLessThan(1e-6);
    expect(Math.abs(a[i].r - b[i].r)).toBeLessThan(1e-9);
    expect(Math.abs(a[i].a - b[i].a)).toBeLessThan(1e-9);
  }
}

describe('stateless effects particles', () => {
  it('seeking to a time shows exactly what playing to it shows', () => {
    const src = new SyntheticSource({ scenario: 'ascent' });
    const target = 40;

    const seek = new ParticleSystem(0.5);
    seek.setSource(src);
    seek.update(target, 1);
    const direct = capture(seek);
    expect(direct.length).toBeGreaterThan(300);

    const play = new ParticleSystem(0.5);
    play.setSource(src);
    let t = -8;
    play.update(t, 0);
    while (t < target) {
      t = Math.min(target, t + 1 / 30);
      play.update(t, 0);
    }
    expectSame(capture(play), direct);

    // and a backward jump rebuilds the same state again
    play.update(70, 0);
    play.update(target, 0);
    expectSame(capture(play), direct);
  });

  it('respawns only the slots whose schedule advanced during playback', () => {
    const src = new SyntheticSource({ scenario: 'ascent' });
    const sys = new ParticleSystem(1);
    sys.setSource(src);
    sys.update(20, 3);
    const full = sys.spawned;
    sys.update(20 + 1 / 60, 3);
    expect(sys.spawned).toBeLessThan(40);
    expect(full).toBeGreaterThan(sys.spawned * 10);
  });

  it('builds the ground cloud from the pad and keeps it after the vehicle has gone', () => {
    const src = new SyntheticSource({ scenario: 'ascent' });
    const sys = new ParticleSystem(1);
    sys.setSource(src);
    sys.update(90, 0);
    const ground = sys.out.slice(0, sys.count).filter((p) => p.group === 0);
    expect(ground.length).toBeGreaterThan(100);
    for (const p of ground) expect(p.height).toBeLessThan(600);
  });

  it('makes the ground cloud neutral white steam with some grey smoke, never tan', () => {
    const src = new SyntheticSource({ scenario: 'ascent' });
    const sys = new ParticleSystem(1);
    sys.setSource(src);
    for (const t of [0, 3, 8, 40]) {
      sys.update(t, 1);
      const ground = sys.out.slice(0, sys.count).filter((p) => p.group === 0);
      expect(ground.length).toBeGreaterThan(20);
      let white = 0;
      for (const p of ground) {
        const a = p.albedo;
        // neutral: no channel departs from the others by more than a few percent
        expect(Math.max(a.r, a.g, a.b) - Math.min(a.r, a.g, a.b)).toBeLessThan(0.03);
        expect(Math.min(a.r, a.g, a.b)).toBeGreaterThan(0.5);
        if (a.g > 0.88) white++;
      }
      expect(white / ground.length).toBeGreaterThan(0.7);
    }
  });

  it('diffuses the edges of old cloud puffs only', () => {
    const src = new SyntheticSource({ scenario: 'ascent' });
    const sys = new ParticleSystem(1);
    sys.setSource(src);
    sys.update(2, 2);
    const young = sys.out.slice(0, sys.count).filter((p) => p.group === 0);
    for (const p of young) expect(p.soft).toBeLessThan(0.05);
    sys.update(90, 3);
    const old = sys.out.slice(0, sys.count).filter((p) => p.group === 0);
    expect(old.reduce((s, p) => s + p.soft, 0) / old.length).toBeGreaterThan(0.6);
  });

  it('draws no smoke from a vacuum upper-stage burn', () => {
    const src = new SyntheticSource({ scenario: 'upper' });
    const sys = new ParticleSystem(1);
    sys.setSource(src);
    sys.update(10, 0);
    expect(sys.count).toBe(0);
  });
});

describe('plume physics', () => {
  it('E-1 exit pressure is below sea-level pressure (slightly over-expanded) and the plume balloons with altitude', () => {
    expect(EXIT_PRESSURE['kerolox-sl']).toBeGreaterThan(40e3);
    expect(EXIT_PRESSURE['kerolox-sl']).toBeLessThan(101325);
    expect(pressureRatioAmb('kerolox-sl', 1, stdPressure(0))).toBeLessThan(1);
    const s = makeColumnShape();
    const Rc = 1.2 + E1.exitDiameter / 2;
    const Req = (E1.exitDiameter / 2) * Math.sqrt(7);
    const r0 = columnShape('kerolox-sl', Rc, Req, 1, stdPressure(0), 0, s).Rbal;
    const r20 = columnShape('kerolox-sl', Rc, Req, 1, stdPressure(20000), 20000, s).Rbal;
    const r45 = columnShape('kerolox-sl', Rc, Req, 1, stdPressure(45000), 45000, s).Rbal;
    const r80 = columnShape('kerolox-sl', Rc, Req, 1, stdPressure(80000), 80000, s).Rbal;
    expect(r0).toBeLessThan(Rc * 1.05);
    expect(r20).toBeGreaterThan(r0 * 1.5);
    expect(r45).toBeGreaterThan(r20 * 3);
    expect(r80).toBeGreaterThan(r45 * 5);
  });
});

const emptySnap = (): Snapshot => ({ t: 0, emitters: [], clusters: [], pad: { venting: 0, deluge: 0, holddown: 0, arms: 0 } });
const light = { sunDir: new THREE.Vector3(0, 1, 0), sunCol: new THREE.Color(1, 1, 1), amb: new THREE.Color(0.1, 0.1, 0.1) };
const fwd = new THREE.Vector3(0, 0, -1);

describe('ground cloud', () => {
  it('rolls out of the flame trench along its direction', () => {
    const sys = new ParticleSystem(1);
    sys.setSource(new SyntheticSource({ scenario: 'ascent' }));
    sys.update(4, 0);
    const q = siteFrameQuaternion(4, new THREE.Quaternion()).invert();
    const o = sitePosition(4, 0, new THREE.Vector3());
    const mean = new THREE.Vector3();
    let n = 0;
    for (let i = 0; i < sys.count; i++) {
      const p = sys.out[i];
      if (p.group !== 0) continue;
      mean.add(p.pos.clone().sub(o).applyQuaternion(q));
      n++;
    }
    expect(n).toBeGreaterThan(50);
    mean.multiplyScalar(1 / n);
    const along = (mean.x * TRENCH_DIR.x + mean.z * TRENCH_DIR.z) / Math.hypot(mean.x, mean.z);
    expect(along).toBeGreaterThan(0.7);
  });
});

describe('plume volumes (draw budget)', () => {
  it('draws cold-gas thrusters as puffs only', () => {
    const cache = new SnapshotCache(4);
    cache.setSource(new SyntheticSource({ scenario: 'rcs' }));
    const snap = cache.compute(0.3, emptySnap())!;
    expect(snap.emitters.length).toBeGreaterThan(0);
    const set = new PlumeSet();
    set.update(snap.emitters, snap.clusters, new THREE.Vector3(), light, 0, fwd, 12, () => 1);
    expect(set.count).toBe(0);
    set.dispose();
  });

  it('never draws more than MAX_VOLUMES plume volumes', () => {
    const em: EmitterSnap[] = [];
    for (let i = 0; i < 30; i++) {
      const e: Emitter = {
        id: `e${i}`,
        kind: 'kerolox-sl',
        pos: new THREE.Vector3((i % 6) * 1.4, 6.4e6, Math.floor(i / 6) * 1.4),
        dir: new THREE.Vector3(0, -1, 0),
        exitRadius: 0.5,
        throttle: 1,
        ambientPressure: 101325,
        altitude: 0,
        airVel: new THREE.Vector3(),
        ggExhaust: { pos: new THREE.Vector3((i % 6) * 1.4 + 0.7, 6.4e6, 0), dir: new THREE.Vector3(0, -1, 0) },
        sinceIgnition: 5,
      };
      em.push(copyEmitter(e, { id: '', kind: 'kerolox-sl', pos: new THREE.Vector3(), dir: new THREE.Vector3(), exitRadius: 1, throttle: 0, ambientPressure: 0, altitude: 0, airVel: new THREE.Vector3(), gg: null, sinceIgnition: 0 }));
    }
    const clusters = buildClusters(em, [], [] as ClusterSnap[]);
    const set = new PlumeSet();
    set.update(em, clusters, new THREE.Vector3(0, 6.4e6, 0), light, 0, fwd, 12, () => 1);
    expect(set.count).toBe(MAX_VOLUMES);
    set.dispose();
  });
});
