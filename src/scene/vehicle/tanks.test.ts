import { describe, expect, it } from 'vitest';
import { TANKS, tankVolumeOf, levelHeight, volumeAt, liquidPoly, centroidAt } from './tanks';
import { S1, S2, tankVolume } from '../../vehicle/spec';

describe('vehicle tanks', () => {
  it('internal volumes hold the specified propellant loads (within 6 %)', () => {
    const want = {
      s1Lox: tankVolume(S1.lox, 'lox'),
      s1Rp1: tankVolume(S1.rp1, 'rp1'),
      s2Lox: tankVolume(S2.lox, 'lox'),
      s2Rp1: tankVolume(S2.rp1, 'rp1'),
    } as const;
    for (const id of Object.keys(want) as (keyof typeof want)[]) {
      const v = tankVolumeOf(TANKS[id]);
      expect(Math.abs(v / want[id] - 1)).toBeLessThan(0.06);
    }
  });

  it('level height is monotonic and matches the requested usable fraction', () => {
    for (const t of Object.values(TANKS)) {
      let prev = -Infinity;
      for (let f = 0; f <= 1.0001; f += 0.1) {
        const h = levelHeight(t, f);
        expect(h).toBeGreaterThanOrEqual(prev - 1e-9);
        prev = h;
        expect(volumeAt(t, h) / tankVolumeOf(t)).toBeCloseTo(f * 0.97, 2);
      }
    }
  });

  it('liquid cross-sections are closed, non-empty polygons inside the tank', () => {
    for (const t of Object.values(TANKS))
      for (const f of [0.05, 0.5, 1]) {
        const poly = liquidPoly(t, levelHeight(t, f));
        expect(poly.length).toBeGreaterThan(4);
        for (const [r, y] of poly) {
          expect(r).toBeGreaterThanOrEqual(t.rIn - 1e-6);
          expect(r).toBeLessThanOrEqual(t.rWall + 1e-6);
          expect(y).toBeGreaterThanOrEqual(t.yMin - 0.01);
          expect(y).toBeLessThanOrEqual(t.yMax + 0.01);
        }
      }
  });

  it('full-load centroids sit between the tank ends', () => {
    for (const t of Object.values(TANKS)) {
      const c = centroidAt(t, levelHeight(t, 1));
      expect(c).toBeGreaterThan(t.yMin);
      expect(c).toBeLessThan(t.yMax);
    }
  });
});
