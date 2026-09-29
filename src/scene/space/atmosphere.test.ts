import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ATMO, SUN_WB, buildTables, integrateRay, makeRayResult, transmittanceSun, transmittanceToTop, skyIrradianceGround } from './atmosphere';
import { sunEquatorial, I_TO_EQUATORIAL } from './celestial';
import { R_EARTH, SUN_DIRECTION } from '../../world/frames';

buildTables();

describe('atmosphere model', () => {
  it('transmits most sunlight at zenith and reddens it at the horizon', () => {
    const t = transmittanceToTop(R_EARTH + 1, 1, new THREE.Vector3());
    // Rayleigh + light haze + ozone: about 0.9 red, 0.85 green, 0.7 blue at sea level
    expect(t.x).toBeGreaterThan(0.85);
    expect(t.z).toBeLessThan(t.x);
    expect(t.z).toBeGreaterThan(0.6);
    const h = transmittanceSun(R_EARTH + 1, 0.02, new THREE.Vector3());
    expect(h.z).toBeLessThan(0.05);
    expect(h.x / Math.max(h.z, 1e-9)).toBeGreaterThan(5);
  });

  it('puts the Earth shadow on points behind the planet', () => {
    const t = transmittanceSun(R_EARTH + 400_000, -0.9, new THREE.Vector3());
    expect(t.length()).toBe(0);
    const lit = transmittanceSun(R_EARTH + 400_000, 0.5, new THREE.Vector3());
    expect(lit.x).toBeCloseTo(1, 5);
  });

  it('gives a blue sky brighter toward the horizon than at the zenith', () => {
    const o = new THREE.Vector3(0, R_EARTH + 2, 0);
    const sun = new THREE.Vector3(0, Math.sin(0.7), Math.cos(0.7));
    const r = makeRayResult();
    integrateRay(o, new THREE.Vector3(0, 1, 0), sun, 64, r);
    const zen = r.L.clone();
    expect(zen.z).toBeGreaterThan(zen.x * 2);
    integrateRay(o, new THREE.Vector3(1, 0.02, 0).normalize(), sun, 64, r);
    expect(r.L.y).toBeGreaterThan(zen.y);
  });

  it('keeps the far-cloud aerial perspective consistent with the full horizon integral', () => {
    // in-scatter to 150 km along a grazing ray must stay below the full path's value
    const o = new THREE.Vector3(0, R_EARTH + 2, 0);
    const sun = new THREE.Vector3(0, Math.sin(0.72), -Math.cos(0.72));
    const d = new THREE.Vector3(Math.cos(0.005), Math.sin(0.005), 0);
    const full = makeRayResult();
    const part = makeRayResult();
    integrateRay(o, d, sun, 128, full);
    integrateRay(o, d, sun, 128, part, 150_000);
    expect(part.L.y).toBeLessThanOrEqual(full.L.y * 1.001);
    expect(part.T.y).toBeLessThan(0.2);
  });

  it('has sky irradiance growing with the Sun elevation', () => {
    const a = skyIrradianceGround(0.1, new THREE.Vector3());
    const b = skyIrradianceGround(0.8, new THREE.Vector3());
    expect(b.y).toBeGreaterThan(a.y);
    expect(b.z).toBeGreaterThan(b.x);
  });

  it('balances the camera toward ground sunlight', () => {
    expect(SUN_WB.y).toBe(1);
    expect(SUN_WB.x).toBeLessThan(1);
    expect(SUN_WB.z).toBeGreaterThan(1);
  });
});

describe('celestial frame', () => {
  it('places the Sun at its October equatorial position', () => {
    const s = sunEquatorial();
    expect(s.decDeg).toBeCloseTo(-3.1, 0);
    expect(s.raHours).toBeGreaterThan(12.2);
    expect(s.raHours).toBeLessThan(12.8);
  });
  it('is a rotation', () => {
    expect(I_TO_EQUATORIAL.determinant()).toBeCloseTo(1, 6);
    const v = SUN_DIRECTION.clone().applyMatrix3(I_TO_EQUATORIAL);
    expect(v.length()).toBeCloseTo(1, 6);
  });
});

describe('diagnostics', () => {
  it('prints reference values', () => {
    const o = new THREE.Vector3(0, R_EARTH + 2, 0);
    const el = Math.asin(0.6612);
    const sun = new THREE.Vector3(0, Math.sin(el), Math.cos(el));
    const r = makeRayResult();
    const rows: string[] = [];
    for (const [name, dir] of [
      ['zenith', new THREE.Vector3(0, 1, 0)],
      ['el30 away', new THREE.Vector3(0, 0.5, -0.866)],
      ['el5 away', new THREE.Vector3(0, 0.087, -0.996)],
      ['el0.3 away', new THREE.Vector3(0, 0.005, -1).normalize()],
    ] as [string, THREE.Vector3][]) {
      integrateRay(o, dir, sun, 128, r);
      rows.push(`${name}: L=${r.L.toArray().map((x) => x.toFixed(4))} T=${r.T.toArray().map((x) => x.toFixed(3))}`);
      integrateRay(o, dir, sun, 128, r, 150_000);
      rows.push(`  to150km: L=${r.L.toArray().map((x) => x.toFixed(4))} T=${r.T.toArray().map((x) => x.toFixed(3))}`);
      integrateRay(o, dir, sun, 8, r);
      rows.push(`  8 samples: L=${r.L.toArray().map((x) => x.toFixed(4))}`);
    }
    rows.push(`WB ${SUN_WB.toArray().map((x) => x.toFixed(3))} top ${ATMO.top}`);
    console.log(rows.join('\n'));
    expect(rows.length).toBeGreaterThan(0);
  });
});
