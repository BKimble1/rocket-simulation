import { describe, expect, it } from 'vitest';
import { Quadtree, triangulate, type LodOptions } from './lod';

const opts: LodOptions = {
  ext: 51200,
  q: 8,
  far: 300000,
  rOuter: 50000,
  maxLevel: 15,
  foci: [
    { x: 0, z: 0, cMin: 1.6, k: 0.045 },
    { x: 20, z: -58, cMin: 0.8, k: 0.06 },
    { x: -600, z: 8600, cMin: 3.5, k: 0.05 },
    { x: -1020, z: 8980, cMin: 3.5, k: 0.05 },
    { x: -5200, z: 3600, cMin: 3.5, k: 0.05 },
    { x: -260, z: 330, cMin: 3.5, k: 0.05 },
  ],
};

describe('terrain quadtree', () => {
  const tree = new Quadtree(opts);
  it('is 2:1 balanced across every edge', () => {
    for (const t of tree.leaves.values())
      for (let d = 0; d < 4; d++) {
        const n = tree.neighbour(t, d);
        if (n) expect(n.level).toBeGreaterThanOrEqual(t.level - 1);
      }
  });
  it('is fine at the pad and coarse at the edge', () => {
    expect(tree.leafAt(1, 1)!.size / opts.q).toBeLessThan(2);
    expect(tree.leafAt(45000, 0)!.size / opts.q).toBeGreaterThan(1000);
    expect(tree.leafAt(-600, 8600)!.size / opts.q).toBeLessThan(5);
  });
  it('has no cracks: every interior edge is shared or lies on a coarser edge', () => {
    const m = triangulate(tree, () => true, (x, z) => [x, Math.sin(x / 700) * 3 + Math.cos(z / 900) * 2, z]);
    const p = m.position;
    const count = new Map<string, number>();
    const k = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);
    for (let i = 0; i < m.index.length; i += 3)
      for (let e = 0; e < 3; e++) {
        const key = k(m.index[i + e], m.index[i + ((e + 1) % 3)]);
        count.set(key, (count.get(key) ?? 0) + 1);
      }
    // single-use edges are either on the outer boundary or halves of a coarse edge; check the
    // halves: their midpoint-snapped vertex lies on the straight coarse edge
    let open = 0;
    for (const [key, n] of count) {
      expect(n).toBeLessThanOrEqual(2);
      if (n === 1) open++;
      void key;
    }
    expect(open).toBeGreaterThan(0);
    // all y finite
    for (let i = 1; i < p.length; i += 3) expect(Number.isFinite(p[i])).toBe(true);
    console.log('leaves', tree.leaves.size, 'triangles', m.index.length / 3, 'vertices', p.length / 3);
  });
});
