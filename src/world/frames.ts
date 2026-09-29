/**
 * Reference frames and constants for the flight world.
 *
 * Frame I (inertial, non-rotating): origin at Earth's centre; axes aligned with the launch
 * site's local East-Up-South directions at mission time T-0:
 *   +X = east, +Y = up (local vertical at the pad at T-0), +Z = south.
 * three.js is right-handed with +Y up, so the launch scene can use this frame directly.
 * Earth rotates about its polar axis within I; the pad (and everything on the ground)
 * rotates with it. Mission time t = 0 is liftoff.
 *
 * All positions are double-precision JavaScript numbers in metres. The renderer subtracts a
 * floating origin (the camera) before handing anything to the GPU.
 */
import * as THREE from 'three';

export const MU_EARTH = 3.986004418e14; // m^3/s^2
export const R_EARTH = 6_371_000; // mean radius, m (spherical Earth: see ACCURACY.md)
export const OMEGA_EARTH = 7.2921159e-5; // sidereal rotation rate, rad/s
export const MU_MOON = 4.9048695e12;
export const R_MOON = 1_737_400;
export const MOON_DISTANCE = 384_400_000;
export const MOON_PERIOD = 27.321661 * 86400;
export const ATMOSPHERE_TOP = 100_000; // Karman line used for "in space" labels

/** The illustrative coastal launch site: 28.5 deg N on the Atlantic coast of Florida. */
export const SITE = { lat: 28.5, lon: -80.58, name: 'KIMBLE Launch Complex 1 (illustrative)' };

const DEG = Math.PI / 180;
export const deg = (d: number) => d * DEG;

/** Earth's north polar axis expressed in frame I (unit vector). */
export const EARTH_AXIS = new THREE.Vector3(0, Math.sin(deg(SITE.lat)), -Math.cos(deg(SITE.lat))).normalize();

/** Earth's rotation angle about EARTH_AXIS at mission time t (rad). */
export const earthAngle = (t: number) => OMEGA_EARTH * t;

const _q = new THREE.Quaternion();
/** Rotation carrying Earth-fixed directions (as they were at T-0) to where they are at time t. */
export function earthRotation(t: number, out = new THREE.Quaternion()): THREE.Quaternion {
  return out.setFromAxisAngle(EARTH_AXIS, earthAngle(t));
}

/**
 * Orientation of the Earth mesh (three.js SphereGeometry with an equirectangular map, whose
 * local frame is: +X toward longitude 0, +Y toward the north pole, -Z toward 90 deg E) in frame I
 * at T-0, such that the launch site's local east/north/up map to I's +X/-Z/+Y.
 */
export const EARTH_MESH_Q0: THREE.Quaternion = (() => {
  const lat = deg(SITE.lat);
  const lon = deg(SITE.lon);
  // ECEF (x to lon 0, y to lon 90E, z to north) → sphere-local (x, z, -y)
  const toLocal = (x: number, y: number, z: number) => new THREE.Vector3(x, z, -y);
  const up = toLocal(Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat));
  const east = toLocal(-Math.sin(lon), Math.cos(lon), 0);
  const north = new THREE.Vector3().crossVectors(up, east); // up × east = north
  const local = new THREE.Matrix4().makeBasis(east, up, north.clone().negate()); // columns: e, u, s
  const target = new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1));
  // M * local = target  →  M = target * local^T
  const m = target.multiply(local.transpose());
  return new THREE.Quaternion().setFromRotationMatrix(m);
})();

/** Earth mesh orientation in frame I at time t. */
export function earthMeshQuaternion(t: number, out = new THREE.Quaternion()): THREE.Quaternion {
  return earthRotation(t, out).multiply(EARTH_MESH_Q0);
}

/** Pad position in frame I at time t (on the spherical Earth surface, plus a height). */
export function sitePosition(t: number, height = 0, out = new THREE.Vector3()): THREE.Vector3 {
  out.set(0, R_EARTH + height, 0);
  return out.applyQuaternion(earthRotation(t, _q));
}

/**
 * Local east/north/up of the ground site at time t, as unit vectors in I, plus the
 * quaternion that rotates the site's local frame (x east, y up, z south) into I.
 */
export function siteFrameQuaternion(t: number, out = new THREE.Quaternion()): THREE.Quaternion {
  return earthRotation(t, out);
}

/** Point on the surface at geodetic-ish (spherical) latitude/longitude, in I at time t. */
export function surfacePoint(latDeg: number, lonDeg: number, height: number, t: number, out = new THREE.Vector3()): THREE.Vector3 {
  const lat = deg(latDeg);
  const lon = deg(lonDeg);
  const r = R_EARTH + height;
  out.set(r * Math.cos(lat) * Math.cos(lon), r * Math.sin(lat), -r * Math.cos(lat) * Math.sin(lon));
  return out.applyQuaternion(earthMeshQuaternion(t, _q));
}

/** Latitude/longitude (deg) under a point in I at time t. */
export function latLonOf(p: THREE.Vector3, t: number): { lat: number; lon: number; alt: number } {
  const inv = earthMeshQuaternion(t, _q).invert();
  const v = p.clone().applyQuaternion(inv);
  const r = v.length();
  return { lat: Math.asin(v.y / r) / DEG, lon: Math.atan2(-v.z, v.x) / DEG, alt: r - R_EARTH };
}

/**
 * Direction to the Sun in frame I (fixed during a lesson: the Earth's orbital motion over a
 * few days is ignored). Chosen so the pad sees a mid-morning Sun, high in the south-east, at
 * T-0, and a LEO orbit has day and night passes.
 */
export const SUN_DIRECTION = new THREE.Vector3(0.62, 0.66, 0.42).normalize();

/**
 * The Moon on a circular orbit whose plane contains the pad's eastward direction at T-0
 * inclined like the parking orbit (simplification stated in ACCURACY.md). `phase0` is the
 * Moon's angle at T-0, chosen per mission so the lunar flyby geometry works.
 */
export const MOON_ORBIT_NORMAL = new THREE.Vector3(0, Math.cos(deg(SITE.lat)), Math.sin(deg(SITE.lat))).normalize();
export function moonPosition(t: number, phase0 = 0, out = new THREE.Vector3()): THREE.Vector3 {
  const n = (2 * Math.PI) / MOON_PERIOD;
  const a = phase0 + n * t;
  // basis in the orbit plane: e1 = +X (east at T-0), e2 = normal × e1
  const e1 = new THREE.Vector3(1, 0, 0);
  const e2 = new THREE.Vector3().crossVectors(MOON_ORBIT_NORMAL, e1).normalize();
  return out.copy(e1).multiplyScalar(Math.cos(a) * MOON_DISTANCE).addScaledVector(e2, Math.sin(a) * MOON_DISTANCE);
}
export function moonVelocity(t: number, phase0 = 0, out = new THREE.Vector3()): THREE.Vector3 {
  const n = (2 * Math.PI) / MOON_PERIOD;
  const a = phase0 + n * t;
  const e1 = new THREE.Vector3(1, 0, 0);
  const e2 = new THREE.Vector3().crossVectors(MOON_ORBIT_NORMAL, e1).normalize();
  return out.copy(e1).multiplyScalar(-Math.sin(a) * MOON_DISTANCE * n).addScaledVector(e2, Math.cos(a) * MOON_DISTANCE * n);
}
