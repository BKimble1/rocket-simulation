/**
 * CPU side of the sky: evaluates the atmosphere at the camera and at the focus subject each
 * frame and fills `skyState` (haze, sunlight after transmittance and Earth's shadow, sky and
 * ground ambient, exposure). Everything here is a pure function of the camera, the subject and
 * mission time, so seeking reproduces the same light.
 */
import * as THREE from 'three';
import { R_EARTH, SUN_DIRECTION } from '../../world/frames';
import { ATMO, SUN_RGB, integrateRay, makeRayResult, transmittanceSun, skyIrradianceGround } from './atmosphere';
import { skyState } from './skyState';

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _t = new THREE.Vector3();
const _e = new THREE.Vector3();
const _g = new THREE.Vector3();
const _hit = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const res = makeRayResult();

const lum = (v: THREE.Vector3) => 0.2126 * v.x + 0.7152 * v.y + 0.0722 * v.z;

/** Cosine-weighted directions about +Y (3 rings x 4 azimuths). */
const HEMI: [number, number, number][] = [];
for (let r = 0; r < 3; r++) {
  const u = (r + 0.5) / 3;
  const cosT = Math.sqrt(1 - u);
  const sinT = Math.sqrt(1 - cosT * cosT);
  for (let a = 0; a < 4; a++) {
    const phi = ((a + (r % 2) * 0.5) / 4) * Math.PI * 2 + 0.3;
    HEMI.push([sinT * Math.cos(phi), cosT, sinT * Math.sin(phi)]);
  }
}

const _q = new THREE.Quaternion();
const Y = new THREE.Vector3(0, 1, 0);

/** Mean surface albedo seen from a height (local coast and scrub near the ground, Earth with clouds from orbit). */
function albedoAt(alt: number) {
  const k = THREE.MathUtils.smoothstep(alt, 3000, 60000);
  return 0.13 + (0.3 - 0.13) * k;
}

/** Bond albedo of the Earth with its clouds, and the tint of its reflected light (Rayleigh blue). */
const EARTH_ALBEDO = 0.3;
const EARTH_TINT = new THREE.Vector3(0.86, 0.96, 1.12);

/**
 * Earthshine far from the Earth: irradiance on a surface facing the Earth from a Lambert sphere
 * of Bond albedo A at distance r, E = (2/3) A E_sun (R/r)^2 Phi(alpha), with the Lambert phase
 * law Phi(alpha) = (sin(alpha) + (pi - alpha) cos(alpha)) / pi and alpha the angle at the Earth
 * between the Sun and the point (0: the point sees a full Earth). Per channel, scene units.
 */
export function earthshine(p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  const r = p.length();
  const alpha = Math.acos(THREE.MathUtils.clamp(p.dot(SUN_DIRECTION) / r, -1, 1));
  const phi = (Math.sin(alpha) + (Math.PI - alpha) * Math.cos(alpha)) / Math.PI;
  const e = (2 / 3) * EARTH_ALBEDO * (R_EARTH / r) ** 2 * phi;
  return out.copy(EARTH_TINT).multiplyScalar(e).multiply(SUN_RGB);
}

/** Altitudes (m) over which the sampled ground irradiance hands over to the analytic earthshine
 *  (the sample directions stop resolving the Earth's disk as it shrinks). */
const FAR_A = 1_500_000;
const FAR_B = 4_000_000;
const _far = new THREE.Vector3();

/**
 * Irradiance from the sky (upper hemisphere) and from the ground/Earth (lower hemisphere) on
 * surfaces facing up and down at point p (frame I, relative to the Earth's centre).
 */
export function hemisphereIrradiance(p: THREE.Vector3, sky: THREE.Vector3, ground: THREE.Vector3): void {
  const r = p.length();
  const wFar = THREE.MathUtils.smoothstep(r - R_EARTH, FAR_A, FAR_B);
  if (wFar >= 1) {
    // deep space: no sky, the Earth a small disk
    sky.set(0, 0, 0);
    earthshine(p, ground);
    return;
  }
  const up = _a.copy(p).divideScalar(r);
  _q.setFromUnitVectors(Y, up);
  sky.set(0, 0, 0);
  ground.set(0, 0, 0);
  const alb = albedoAt(r - R_EARTH);
  const sun = SUN_DIRECTION;
  for (const h of HEMI) {
    for (const sgn of [1, -1]) {
      _d.set(h[0], h[1] * sgn, h[2]).applyQuaternion(_q);
      integrateRay(p, _d, sun, 8, res);
      _t.copy(res.L);
      if (res.tGround < Infinity) {
        _hit.copy(p).addScaledVector(_d, res.tGround);
        const n = _b.copy(_hit).normalize();
        const muG = n.dot(sun);
        transmittanceSun(R_EARTH + 1, muG, _e).multiplyScalar(Math.max(0, muG));
        skyIrradianceGround(muG, _g);
        _e.add(_g).multiplyScalar(alb / Math.PI);
        _t.add(_e.multiply(res.T));
      }
      (sgn > 0 ? sky : ground).add(_t);
    }
  }
  sky.multiplyScalar(Math.PI / HEMI.length).multiply(SUN_RGB);
  ground.multiplyScalar(Math.PI / HEMI.length).multiply(SUN_RGB);
  if (wFar > 0) ground.lerp(earthshine(p, _far), wFar);
}

const _sky = new THREE.Vector3();
const _gnd = new THREE.Vector3();
const _skyC = new THREE.Vector3();
const _gndC = new THREE.Vector3();
const _ts = new THREE.Vector3();
const _tc = new THREE.Vector3();

function setColorIntensity(c: THREE.Color, v: THREE.Vector3): number {
  const m = Math.max(v.x, v.y, v.z, 1e-9);
  c.setRGB(v.x / m, v.y / m, v.z / m, THREE.LinearSRGBColorSpace);
  return m;
}

export interface LightingResult {
  /** Sunlight at the subject (scene irradiance units) per channel. */
  sun: THREE.Vector3;
  sky: THREE.Vector3;
  ground: THREE.Vector3;
  /** Sunlit fraction of the camera (1 lit, 0 in Earth's shadow). */
  camLit: number;
  exposure: number;
}

const result: LightingResult = { sun: new THREE.Vector3(), sky: new THREE.Vector3(), ground: new THREE.Vector3(), camLit: 1, exposure: 1 };

/** Night-time fill so shapes stay faintly readable in Earth's shadow (moonlight, airglow). */
const NIGHT_FLOOR = 0.012 * 4.4;

/**
 * Evaluate the light at the subject and the camera and write skyState.
 * cam and subject are absolute (frame I).
 */
export function updateLighting(cam: THREE.Vector3, subject: THREE.Vector3): LightingResult {
  const sun = SUN_DIRECTION;
  // sunlight at the subject
  const rS = subject.length();
  transmittanceSun(rS, subject.dot(sun) / rS, _ts);
  result.sun.copy(_ts).multiply(SUN_RGB);
  skyState.sunIntensity = setColorIntensity(skyState.sunColor, result.sun);
  skyState.sunDir.copy(sun);

  // ambient at the subject
  hemisphereIrradiance(subject, _sky, _gnd);
  const floor = NIGHT_FLOOR * (1 - Math.min(1, lum(_ts) * 4));
  _sky.addScalar(floor * 0.6);
  _gnd.addScalar(floor * 0.4);
  result.sky.copy(_sky);
  result.ground.copy(_gnd);
  skyState.ambientIntensity = setColorIntensity(skyState.ambient, _sky);
  skyState.groundIntensity = setColorIntensity(skyState.ground, _gnd);

  // camera: sunlight and exposure
  const rC = cam.length();
  transmittanceSun(rC, cam.dot(sun) / rC, _tc);
  result.camLit = Math.min(1, lum(_tc) / 0.8);
  const camFar = cam.distanceTo(subject) > 3000;
  if (camFar) hemisphereIrradiance(cam, _skyC, _gndC);
  else {
    _skyC.copy(_sky);
    _gndC.copy(_gnd);
  }
  // key light the camera is exposed for: direct Sun plus sky, and the sunlit Earth when high
  const key = lum(_tc.multiply(SUN_RGB)) + lum(_skyC) + 0.5 * lum(_gndC);
  const exposure = THREE.MathUtils.clamp(Math.pow(4.6 / Math.max(key, 1e-3), 0.55), 0.85, 3.4);
  result.exposure = exposure;
  skyState.exposure = exposure;

  // haze at the camera: horizontal path near the ground, slant path to the ground when high
  const alt = rC - R_EARTH;
  _o.copy(cam);
  const up = _a.copy(cam).divideScalar(rC);
  // a horizontal direction roughly across the Sun's azimuth (neutral brightness)
  _b.crossVectors(up, sun);
  if (_b.lengthSq() < 1e-8) _b.set(1, 0, 0).addScaledVector(up, -up.x);
  _b.normalize();
  const wSlant = THREE.MathUtils.smoothstep(alt, 1500, 12000);
  const depress = THREE.MathUtils.degToRad(35) * wSlant;
  _d.copy(_b).multiplyScalar(Math.cos(depress)).addScaledVector(up, -Math.sin(depress)).normalize();
  const D = 30000 + alt * 2;
  integrateRay(_o, _d, sun, 10, res, D);
  const dist = Math.min(D, res.tGround);
  const Tg = Math.max(1e-6, res.T.y);
  const one = (x: number) => Math.max(1e-4, 1 - x);
  if (alt < ATMO.top - ATMO.bottom + 2e6) {
    skyState.hazeDensity = -Math.log(Tg) / Math.max(dist, 1);
    skyState.hazeColor.setRGB(
      (res.L.x * SUN_RGB.x) / one(res.T.x),
      (res.L.y * SUN_RGB.y) / one(res.T.y),
      (res.L.z * SUN_RGB.z) / one(res.T.z),
      THREE.LinearSRGBColorSpace,
    );
  } else {
    skyState.hazeDensity = 0;
  }
  skyState.camAltitude = alt;
  skyState.sunVisible = result.camLit;
  return result;
}
