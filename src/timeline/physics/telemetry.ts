/** Reference telemetry at a mission time (minimal version; see the physics module). */
import type { BodyId } from '../../vehicle/parts';
import type { MissionTimeline, TelemetrySample } from '../types';
import { bodyAt, makeBodyState } from '../sample';
import { MU_EARTH, R_EARTH, EARTH_AXIS, OMEGA_EARTH } from '../../world/frames';
import { atmosphere } from './atmosphere';
import * as THREE from 'three';

const OMEGA = EARTH_AXIS.clone().multiplyScalar(OMEGA_EARTH);

export function telemetryAt(tl: MissionTimeline, body: BodyId, t: number): TelemetrySample | null {
  const tr = tl.bodies[body];
  if (!tr) return null;
  const s = bodyAt(tr, t, makeBodyState());
  const r = s.pos.length();
  const alt = r - R_EARTH;
  const air = s.vel.clone().sub(new THREE.Vector3().crossVectors(OMEGA, s.pos));
  const a = atmosphere(Math.max(0, alt));
  const v2 = s.vel.lengthSq();
  const energy = v2 / 2 - MU_EARTH / r;
  let apo: number | null = null;
  let peri: number | null = null;
  if (energy < 0) {
    const sma = -MU_EARTH / (2 * energy);
    const h = new THREE.Vector3().crossVectors(s.pos, s.vel).length();
    const e = Math.sqrt(Math.max(0, 1 - (h * h) / (MU_EARTH * sma)));
    apo = sma * (1 + e) - R_EARTH;
    peri = sma * (1 - e) - R_EARTH;
  }
  const vAir = air.length();
  return {
    t,
    altitude: alt,
    speed: s.vel.length(),
    groundSpeed: vAir,
    verticalSpeed: s.vel.dot(s.pos) / r,
    acceleration: 0,
    mach: vAir / a.speedOfSound,
    dynamicPressure: 0.5 * a.density * vAir * vAir,
    mass: s.mass,
    downrange: 0,
    apoapsis: apo,
    periapsis: peri,
  };
}
