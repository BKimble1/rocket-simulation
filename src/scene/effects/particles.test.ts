import { describe, expect, it } from 'vitest';
import { ParticleSystem, type Particle } from './particles';
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
