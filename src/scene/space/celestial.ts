/**
 * Orientation of the celestial sphere and the Moon in frame I.
 *
 * Star map: public/textures/sky/tycho_2880.jpg is the NASA/Goddard Tycho catalogue sky map in
 * EQUATORIAL (J2000 right ascension / declination) coordinates, equirectangular, not galactic:
 * the Milky Way draws an arch across it. Checked against known objects: the Pleiades
 * (RA 3h47m, Dec +24) sit at u = 0.656, v(top) = 0.366; Orion's belt (RA 5h36m, Dec -1) at
 * u = 0.73; open cluster NGC 2516 (RA 7h58m, Dec -60.9) at u = 0.832, v(top) = 0.838. So
 *   u = 0.5 + RA / 24h   (RA increasing to the right, 0h at the centre)
 *   v = 0.5 + Dec / 180 deg (north up)
 *
 * Frame I is tied to the pad at T-0 and the Sun direction is fixed there. The celestial frame is
 * built so both are consistent: the north celestial pole is Earth's axis (precession ignored),
 * and right ascension is set so the Sun sits at the RA that matches its declination on the
 * ecliptic (SUN_DIRECTION gives declination -3.1 deg, i.e. early October, RA about 12h29m).
 * The sky seen from the pad is therefore the real sky for that date and time of day.
 */
import * as THREE from 'three';
import { EARTH_AXIS, SUN_DIRECTION, MOON_ORBIT_NORMAL } from '../../world/frames';

const OBLIQUITY = (23.439 * Math.PI) / 180;

/** Rotation taking frame-I directions to equatorial (x: RA 0h, z: north celestial pole). */
export const I_TO_EQUATORIAL: THREE.Matrix3 = (() => {
  const z = EARTH_AXIS.clone().normalize();
  const s = SUN_DIRECTION.clone().normalize();
  const dec = Math.asin(Math.max(-1, Math.min(1, s.dot(z))));
  // ecliptic longitude from sin(dec) = sin(eps) sin(lambda); autumn branch (lambda in 90..270)
  const sinL = Math.max(-1, Math.min(1, Math.sin(dec) / Math.sin(OBLIQUITY)));
  const lambda = Math.PI - Math.asin(sinL);
  const ra = Math.atan2(Math.cos(OBLIQUITY) * Math.sin(lambda), Math.cos(lambda));
  // basis: sPerp = cos(ra) x + sin(ra) y ; w = z x sPerp = cos(ra) y - sin(ra) x
  const sPerp = s.clone().addScaledVector(z, -s.dot(z)).normalize();
  const w = new THREE.Vector3().crossVectors(z, sPerp);
  const x = sPerp.clone().multiplyScalar(Math.cos(ra)).addScaledVector(w, -Math.sin(ra));
  const y = sPerp.clone().multiplyScalar(Math.sin(ra)).addScaledVector(w, Math.cos(ra));
  // rows are the equatorial axes expressed in I
  return new THREE.Matrix3().set(x.x, x.y, x.z, y.x, y.y, y.z, z.x, z.y, z.z);
})();

/** Sun right ascension (h) and declination (deg) implied by the frame (for documentation/tests). */
export function sunEquatorial(): { raHours: number; decDeg: number } {
  const v = SUN_DIRECTION.clone().normalize().applyMatrix3(I_TO_EQUATORIAL);
  let ra = Math.atan2(v.y, v.x);
  if (ra < 0) ra += Math.PI * 2;
  return { raHours: (ra * 12) / Math.PI, decDeg: (Math.asin(v.z) * 180) / Math.PI };
}

const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _m = new THREE.Matrix4();

/**
 * Tidally locked Moon: sphere-local +X (selenographic longitude 0, map centre) toward the Earth,
 * +Y (north) along the orbit normal, -Z toward 90 deg E (the trailing side).
 */
export function moonQuaternion(moonPos: THREE.Vector3, out: THREE.Quaternion): THREE.Quaternion {
  _x.copy(moonPos).negate().normalize();
  _y.copy(MOON_ORBIT_NORMAL).addScaledVector(_x, -MOON_ORBIT_NORMAL.dot(_x)).normalize();
  _z.crossVectors(_x, _y);
  _m.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_m);
}
