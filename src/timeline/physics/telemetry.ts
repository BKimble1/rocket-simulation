/**
 * Reference telemetry at a mission time, read from a body's sampled track (pure function of t):
 * altitude, speeds, the sensed (non-gravitational) acceleration from the track's velocity change
 * minus gravity (Earth, and the Moon on the lunar mission), Mach and dynamic pressure in the
 * co-rotating air, mass, ground distance from the pad, and the osculating apsides.
 */
import type { BodyId } from '../../vehicle/parts';
import type { MissionTimeline, TelemetrySample } from '../types';
import { bodyAt, bracket, makeBodyState } from '../sample';
import { MU_EARTH, MU_MOON, R_EARTH, R_MOON, EARTH_AXIS, OMEGA_EARTH, moonPosition, sitePosition } from '../../world/frames';
import { atmosphere } from './atmosphere';
import { SOI_MOON } from './cislunar';
import { CAPSULE_ITEM, LES_ITEM, PAYLOAD_COM, SM_COM, fairingHalf } from './vehicle';
import * as THREE from 'three';

const OMEGA = EARTH_AXIS.clone().multiplyScalar(OMEGA_EARTH);
/** Half-width of the central difference for the acceleration (s). */
const H = 0.25;
/** Near the Moon (inside its sphere of influence, as the lunar events use) the altitude is measured above the Moon. */
const MOON_SOI = SOI_MOON;

/** Gravity in the Earth-centred frame I; the Moon's pull minus the Earth's own acceleration toward it (as craft.ts). */
function gravity(p: THREE.Vector3, moon: THREE.Vector3 | null): THREE.Vector3 {
  const g = p.clone().multiplyScalar(-MU_EARTH / p.length() ** 3);
  if (moon) {
    const d = moon.clone().sub(p);
    g.addScaledVector(d, MU_MOON / d.length() ** 3).addScaledVector(moon, -MU_MOON / moon.length() ** 3);
  }
  return g;
}

/**
 * The point of a body that telemetry reports (model frame): the centre of mass of a spacecraft,
 * payload, tower or fairing half (a capsule afloat reads about 1 m, not the tens of metres below
 * the sea where the shared model-frame origin lies); the model origin, the first-stage nozzle
 * exit plane, for the two stages and the station (0 m for a booster standing on the pad).
 */
export function telemetryPoint(tl: MissionTimeline, body: BodyId): THREE.Vector3 {
  const c =
    body === 'capsule' ? (tl.payload === 'researchCapsule' ? PAYLOAD_COM.researchCapsule : CAPSULE_ITEM.c)
    : body === 'service' ? SM_COM
    : body === 'les' ? LES_ITEM.c
    : body === 'satellite' ? PAYLOAD_COM[tl.payload]
    : body === 'fairingA' ? fairingHalf('A', 1).c
    : body === 'fairingB' ? fairingHalf('B', 1).c
    : { x: 0, y: 0, z: 0 };
  return new THREE.Vector3(c.x, c.y, c.z);
}

type Track = NonNullable<MissionTimeline['bodies'][BodyId]>;

/**
 * Velocity of the track's origin as the rendered motion has it: the time derivative of the cubic
 * Hermite position (equal to the sampled velocities at the samples). Differencing it gives the
 * acceleration of a coast to a fraction of a mm/s^2 even with minute-long samples, where the
 * straight-line velocity interpolation would show a spurious 0.03 g on a weightless station.
 */
function hermiteVel(tr: Track, t: number, out: THREE.Vector3): THREE.Vector3 {
  const T = tr.t;
  const n = T.length;
  const P = tr.pos;
  const V = tr.vel;
  if (n < 2 || t <= T[0] || t >= T[n - 1]) {
    const k = 3 * (t <= T[0] ? 0 : n - 1);
    return out.set(V[k], V[k + 1], V[k + 2]);
  }
  const i = bracket(T, t);
  const h = T[i + 1] - T[i];
  const u = (t - T[i]) / h;
  const d00 = (6 * u * u - 6 * u) / h;
  const d10 = 3 * u * u - 4 * u + 1;
  const d01 = -d00;
  const d11 = 3 * u * u - 2 * u;
  const a = 3 * i;
  const b = a + 3;
  return out.set(
    d00 * P[a] + d10 * V[a] + d01 * P[b] + d11 * V[b],
    d00 * P[a + 1] + d10 * V[a + 1] + d01 * P[b + 1] + d11 * V[b + 1],
    d00 * P[a + 2] + d10 * V[a + 2] + d01 * P[b + 2] + d11 * V[b + 2],
  );
}

/** Position and velocity of the model-frame point `c` of a track at time t. */
function pointState(tr: Track, c: THREE.Vector3, t: number) {
  const s = bodyAt(tr, t, makeBodyState());
  const pos = c.clone().applyQuaternion(s.quat).add(s.pos);
  const vel = hermiteVel(tr, t, new THREE.Vector3());
  if (c.lengthSq() > 0) {
    // the point's own velocity: the origin's plus the rate of change of the rotated offset
    const e = 0.05;
    const a = c.clone().applyQuaternion(bodyAt(tr, t - e, makeBodyState()).quat);
    const b = c.clone().applyQuaternion(bodyAt(tr, t + e, makeBodyState()).quat);
    vel.add(b.sub(a).divideScalar(2 * e));
  }
  return { pos, vel, mass: s.mass };
}

export function telemetryAt(tl: MissionTimeline, body: BodyId, t: number): TelemetrySample | null {
  const tr = tl.bodies[body];
  if (!tr) return null;
  const cLocal = telemetryPoint(tl, body);
  const s = pointState(tr, cLocal, t);
  const r = s.pos.length();
  const lunar = tl.id === 'lunar';
  const moon = lunar ? moonPosition(t, tl.moonPhase0) : null;
  const dMoon = moon ? moon.distanceTo(s.pos) : Infinity;
  const alt = dMoon < MOON_SOI ? dMoon - R_MOON : r - R_EARTH;
  // sensed acceleration: velocity change over +-H (inside the track's span) minus gravity
  const t0 = Math.max(tr.t[0], t - H);
  const t1 = Math.min(tr.t[tr.t.length - 1], t + H);
  let acc = 0;
  if (t1 > t0) {
    const v0 = pointState(tr, cLocal, t0).vel;
    const v1 = pointState(tr, cLocal, t1).vel;
    const aTot = v1.sub(v0).divideScalar(t1 - t0);
    acc = aTot.sub(gravity(s.pos, moon)).length();
  }
  // ground distance from the pad (the pad moves with the rotating Earth)
  const pad = sitePosition(t, 0);
  const downrange = R_EARTH * s.pos.angleTo(pad);
  const air = s.vel.clone().sub(new THREE.Vector3().crossVectors(OMEGA, s.pos));
  // the air is the Earth's: near the Moon (altitude above the Moon) there is none
  const a = atmosphere(dMoon < MOON_SOI ? 1e6 : Math.max(0, alt));
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
    acceleration: acc,
    mach: vAir / a.speedOfSound,
    dynamicPressure: 0.5 * a.density * vAir * vAir,
    mass: s.mass,
    downrange,
    apoapsis: apo,
    periapsis: peri,
  };
}
