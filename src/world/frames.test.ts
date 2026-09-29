import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { EARTH_AXIS, latLonOf, R_EARTH, SITE, sitePosition, surfacePoint, earthMeshQuaternion, EARTH_MESH_Q0 } from './frames';

describe('world frames', () => {
  it('puts the launch site at +Y at T-0 with east +X and north -Z', () => {
    const p = surfacePoint(SITE.lat, SITE.lon, 0, 0);
    expect(p.x).toBeCloseTo(0, 0);
    expect(p.y).toBeCloseTo(R_EARTH, 0);
    expect(p.z).toBeCloseTo(0, 0);
    const n = surfacePoint(SITE.lat + 0.01, SITE.lon, 0, 0).sub(p).normalize();
    const e = surfacePoint(SITE.lat, SITE.lon + 0.01, 0, 0).sub(p).normalize();
    expect(n.z).toBeLessThan(-0.99);
    expect(e.x).toBeGreaterThan(0.99);
  });
  it('agrees with sitePosition as Earth rotates, and the axis points to the north pole', () => {
    for (const t of [0, 600, 5400, 86400 / 4]) {
      const a = surfacePoint(SITE.lat, SITE.lon, 0, t);
      const b = sitePosition(t);
      expect(a.distanceTo(b)).toBeLessThan(1);
    }
    const pole = surfacePoint(90, 0, 0, 0).normalize();
    expect(pole.dot(EARTH_AXIS)).toBeGreaterThan(0.99999);
  });
  it('rotates eastward (the site moves toward +X)', () => {
    const p1 = sitePosition(60);
    expect(p1.x).toBeGreaterThan(0);
    const ll = latLonOf(sitePosition(3600), 3600);
    expect(ll.lat).toBeCloseTo(SITE.lat, 3);
    expect(ll.lon).toBeCloseTo(SITE.lon, 3);
  });
  it('keeps the mesh quaternion a pure rotation', () => {
    expect(EARTH_MESH_Q0.length()).toBeCloseTo(1, 6);
    const q = earthMeshQuaternion(1000);
    expect(new THREE.Vector3(1, 0, 0).applyQuaternion(q).length()).toBeCloseTo(1, 6);
  });
});
