import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildTables } from './atmosphere';
import { updateLighting } from './lighting';
import { skyState } from './skyState';
import { R_EARTH, SUN_DIRECTION, sitePosition } from '../../world/frames';

buildTables();

const at = (dir: THREE.Vector3, alt: number) => dir.clone().normalize().multiplyScalar(R_EARTH + alt);

describe('lighting state (skyState)', () => {
  it('lights the pad at T-0 with warm-white sunlight, blue sky fill and ground haze', () => {
    const cam = sitePosition(0, 2);
    const subject = sitePosition(0, 50);
    const r = updateLighting(cam, subject);
    expect(skyState.sunIntensity).toBeGreaterThan(2.5);
    expect(skyState.sunVisible).toBeGreaterThan(0.95);
    // sky fill is bluish; the ground bounce is warmer (less blue than the sky)
    expect(skyState.ambient.b).toBeGreaterThanOrEqual(skyState.ambient.r);
    expect(r.ground.z / r.ground.x).toBeLessThan(r.sky.z / r.sky.x);
    expect(r.ground.y).toBeGreaterThan(0.05);
    expect(skyState.hazeDensity).toBeGreaterThan(5e-6);
    expect(skyState.hazeDensity).toBeLessThan(2e-4);
    expect(skyState.exposure).toBeGreaterThanOrEqual(0.85);
    expect(skyState.exposure).toBeLessThan(1.6);
    expect(skyState.camAltitude).toBeCloseTo(2, 0);
  });

  it('puts a subject in low orbit on the night side in the Earth shadow (no sunlight, longer exposure)', () => {
    const p = at(SUN_DIRECTION.clone().negate(), 400_000);
    updateLighting(p, p.clone().add(new THREE.Vector3(30, 0, 0)));
    expect(skyState.sunIntensity).toBeLessThan(1e-6);
    expect(skyState.sunVisible).toBeLessThan(1e-6);
    expect(skyState.exposure).toBeGreaterThan(2.5);
  });

  it('keeps full sunlight and a short exposure in sunlit orbit and at the geostationary distance', () => {
    const p = at(SUN_DIRECTION, 400_000);
    updateLighting(p, p);
    expect(skyState.sunIntensity).toBeGreaterThan(4);
    expect(skyState.exposure).toBeLessThan(1.2);
    // the sunlit Earth below fills the shadow side of a spacecraft
    expect(skyState.groundIntensity).toBeGreaterThan(0.1);
    const g = at(new THREE.Vector3(0.3, -0.2, 1), 35_786_000);
    updateLighting(g, g);
    expect(skyState.sunIntensity).toBeGreaterThan(4);
    expect(skyState.hazeDensity).toBe(0);
  });

  it('eclipses a spacecraft behind the Earth at the geostationary distance', () => {
    const g = at(SUN_DIRECTION.clone().negate(), 35_786_000);
    updateLighting(g, g);
    expect(skyState.sunIntensity).toBeLessThan(1e-6);
  });
});
