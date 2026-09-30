/**
 * Ground camera sites (V2): from every launch camera, the line of sight to the vehicle on the pad
 * and through its climb must not pass through the service tower, the integration hangar or the pad
 * buildings. (A first placement of the tower-clearance camera sat behind the 31 m hangar; the
 * picture showed a grey wall across its lower third.)
 */
import { describe, expect, it } from 'vitest';
import { GROUND_CAMS } from '../world/site';
import { BUILDINGS, GRADE, HANGAR, TOWER, WATER_TOWER } from '../scene/environment/layout';

interface Box {
  name: string;
  min: [number, number, number];
  max: [number, number, number];
}

const boxes: Box[] = [
  { name: 'tower', min: [TOWER.x - TOWER.half - 1, 0, TOWER.z - TOWER.half - 1], max: [TOWER.x + TOWER.half + 1, TOWER.height, TOWER.z + TOWER.half + 1] },
  { name: 'hangar', min: [HANGAR.x - HANGAR.w / 2, GRADE, HANGAR.z - HANGAR.d / 2], max: [HANGAR.x + HANGAR.w / 2, GRADE + HANGAR.h, HANGAR.z + HANGAR.d / 2] },
  { name: 'water tower', min: [WATER_TOWER.x - WATER_TOWER.tankR, GRADE, WATER_TOWER.z - WATER_TOWER.tankR], max: [WATER_TOWER.x + WATER_TOWER.tankR, WATER_TOWER.top, WATER_TOWER.z + WATER_TOWER.tankR] },
  ...(['padOps', 'pneumatics'] as const).map((k) => {
    const b = BUILDINGS[k];
    return { name: k, min: [b.x - b.w / 2, GRADE, b.z - b.d / 2] as [number, number, number], max: [b.x + b.w / 2, GRADE + b.h, b.z + b.d / 2] as [number, number, number] };
  }),
];

/** Segment p0 -> p1 intersects an axis-aligned box (slab method). */
function hits(p0: number[], p1: number[], b: Box): boolean {
  let t0 = 0;
  let t1 = 1;
  for (let k = 0; k < 3; k++) {
    const d = p1[k] - p0[k];
    if (Math.abs(d) < 1e-9) {
      if (p0[k] < b.min[k] || p0[k] > b.max[k]) return false;
      continue;
    }
    let a = (b.min[k] - p0[k]) / d;
    let c = (b.max[k] - p0[k]) / d;
    if (a > c) [a, c] = [c, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, c);
    if (t0 > t1) return false;
  }
  return true;
}

describe('ground camera sites', () => {
  for (const name of ['padWide', 'ignition', 'towerSide', 'tracking'] as const) {
    it(`${name}: clear line of sight to the vehicle from the mount through its climb`, () => {
      const c = GROUND_CAMS[name];
      for (let y = 12; y <= 400; y += 8) {
        // the vehicle's axis over the pad (it climbs nearly straight up past the tower)
        for (const b of boxes) expect(hits([c.x, c.y, c.z], [0, y, 0], b), `${name} -> y=${y} through ${b.name}`).toBe(false);
      }
    });
  }
});
