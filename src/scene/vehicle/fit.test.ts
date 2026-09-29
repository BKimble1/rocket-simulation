import { describe, expect, it } from 'vitest';
import { E1, E1V, BODY_RADIUS, DOME_HEIGHT, STATIONS as S } from '../../vehicle/spec';
import { ENGINES, INTERSTAGE_INNER_R, s2StackedGimbalLimit } from './layout';

const DEG = Math.PI / 180;

describe('engine fit', () => {
  it('the seven E-1 nozzle exits clear each other and stay within the base', () => {
    const r = E1.exitDiameter / 2;
    const depth = S.s1Gimbal - S.s1NozzleExit;
    let minGap = Infinity;
    for (let i = 0; i < ENGINES.length; i++)
      for (let j = i + 1; j < ENGINES.length; j++) {
        const d = Math.hypot(ENGINES[i].x - ENGINES[j].x, ENGINES[i].z - ENGINES[j].z);
        minGap = Math.min(minGap, d - 2 * r);
      }
    expect(minGap).toBeGreaterThan(0.1);
    // all engines gimbal together (outer ones to 70 % of the centre's angle): the largest relative
    // swing at the exits is smaller than the gap
    const rel = depth * (Math.sin(E1.gimbalRangeDeg * DEG) - Math.sin(0.7 * E1.gimbalRangeDeg * DEG));
    expect(rel).toBeLessThan(minGap - 0.03);
    for (const e of ENGINES) expect(Math.hypot(e.x, e.z) + r).toBeLessThan(BODY_RADIUS);
  });

  it('the E-1V nozzle extension fits inside the interstage with clearance', () => {
    const r = E1V.exitDiameter / 2;
    // exit plane inside the interstage, above the booster forward dome and skirt
    expect(S.s2NozzleExit).toBeGreaterThan(S.s1ForwardSkirtTop + 0.3);
    expect(S.s2NozzleExit).toBeGreaterThan(S.s1LoxFwdEquator + DOME_HEIGHT + 0.3);
    // radial clearance at rest (exit rim with its lip)
    expect(INTERSTAGE_INNER_R - (r + 0.015)).toBeGreaterThan(0.3);
    // while stacked the gimbal is limited so the rim keeps 10 cm; after separation the full range
    const lim = s2StackedGimbalLimit(r, S.s2Gimbal - S.s2NozzleExit);
    expect(lim).toBeGreaterThan(1.5);
    expect(lim).toBeLessThan(E1V.gimbalRangeDeg);
    const swing = (S.s2Gimbal - S.s2NozzleExit) * Math.sin(lim * DEG);
    expect(r + 0.015 + swing).toBeLessThanOrEqual(INTERSTAGE_INNER_R - 0.1 + 1e-6);
  });
});
