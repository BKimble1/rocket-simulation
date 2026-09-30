/**
 * Stateless particles. Every particle slot has a spawn time on a fixed schedule in mission
 * time, a deterministic seed and a lifetime; its state is a closed-form function of its age
 * (spawn point from the effects source at the spawn time, initial velocity, drag toward the
 * co-rotating air, buoyancy, wind, growth, fade). So the smoke on screen at mission time t is
 * the same whether t was reached by playing or by seeking.
 *
 * Only spawn data is cached. It is recomputed for every live slot after a seek (seekEpoch
 * change) or a backward jump, otherwise only for slots whose spawn index changed.
 *
 * No WebGL here: the renderer (sprites.ts) reads `out` after update().
 */
import * as THREE from 'three';
import { EARTH_AXIS, MU_EARTH, OMEGA_EARTH, R_EARTH, siteFrameQuaternion, sitePosition } from '../../world/frames';
import type { EffectsSource } from './input';
import { TICK, SnapshotCache, type ClusterSnap, type EmitterSnap, type Snapshot } from './snapshot';
import { airDensity, columnRadius, columnShape, makeColumnShape, mixingTau, RHO_SL, SMALL_THRUSTER, windAt } from './physics';
import { DELUGE, GROUND_VENTS, MOUNT_HOLE, pickJet, TRENCH_DIR, TRENCH_EXIT, VENTS, type PadJet } from './pad';

// ───────────────────────────── records ─────────────────────────────

export const Mode = { Air: 0, Vacuum: 1, Ballistic: 2 } as const;
export type Mode = (typeof Mode)[keyof typeof Mode];

/** Particle families (shading groups). */
export const Group = { Ground: 0, Smoke: 1, Trail: 2, Vent: 3, Water: 4, Puff: 5 } as const;
export type Group = (typeof Group)[keyof typeof Group];

export interface Rec {
  k: number;
  ts: number;
  active: boolean;
  life: number;
  mode: Mode;
  group: Group;
  p0: THREE.Vector3;
  u0: THREE.Vector3;
  tau: number;
  wind: THREE.Vector3;
  up: THREE.Vector3;
  grav: THREE.Vector3;
  buoy: number;
  tauB: number;
  buoyLin: number;
  /** Minimum height above the ground (m) for ground deflection; < -1e6 disables it. */
  floor: number;
  horiz: THREE.Vector3;
  spreadK: number;
  /** Ballistic particles die below this height (m). */
  dieBelow: number;
  size0: number;
  size1: number;
  tauS: number;
  sizeLin: number;
  alpha0: number;
  fadeIn0: number;
  fadeIn1: number;
  fadeOut: number;
  thin: number;
  thinRef: number;
  alb0: THREE.Color;
  alb1: THREE.Color;
  tauC: number;
  emit: THREE.Color;
  tauE: number;
  rot0: number;
  spin: number;
  /**
   * Streak to the neighbouring spawns (continuous smoke from discrete particles): the
   * emitter's velocity through the air and the spawn interval (s); 0 disables it.
   */
  gapVel: THREE.Vector3;
  gapDt: number;
  /** Velocity-aligned streak (spray): streak length per m/s of speed. */
  stretchVel: number;
  variant: number;
}

const makeRec = (): Rec => ({
  k: NaN,
  ts: 0,
  active: false,
  life: 0,
  mode: Mode.Air,
  group: Group.Smoke,
  p0: new THREE.Vector3(),
  u0: new THREE.Vector3(),
  tau: 1,
  wind: new THREE.Vector3(),
  up: new THREE.Vector3(0, 1, 0),
  grav: new THREE.Vector3(),
  buoy: 0,
  tauB: 1,
  buoyLin: 0,
  floor: -1e9,
  horiz: new THREE.Vector3(),
  spreadK: 0,
  dieBelow: -1e9,
  size0: 1,
  size1: 1,
  tauS: 1,
  sizeLin: 0,
  alpha0: 1,
  fadeIn0: 0,
  fadeIn1: 0.1,
  fadeOut: 0.6,
  thin: 0,
  thinRef: 1,
  alb0: new THREE.Color(),
  alb1: new THREE.Color(),
  tauC: 1,
  emit: new THREE.Color(0, 0, 0),
  tauE: 1,
  rot0: 0,
  spin: 0,
  gapVel: new THREE.Vector3(),
  gapDt: 0,
  stretchVel: 0,
  variant: 0,
});

/** Evaluated particle (absolute frame-I position, double precision). */
export interface Particle {
  pos: THREE.Vector3;
  height: number;
  radius: number;
  rot: number;
  alpha: number;
  albedo: THREE.Color;
  emit: THREE.Color;
  axis: THREE.Vector3;
  stretch: number;
  variant: number;
  group: Group;
  shadow: number;
  /** 0..1: how diffuse the puff has become (old, spread-out clouds lose their crisp billow edges). */
  soft: number;
}

const makeParticle = (): Particle => ({
  pos: new THREE.Vector3(),
  height: 0,
  radius: 1,
  rot: 0,
  alpha: 0,
  albedo: new THREE.Color(),
  emit: new THREE.Color(),
  axis: new THREE.Vector3(0, 1, 0),
  stretch: 0,
  variant: 0,
  group: Group.Smoke,
  shadow: 0,
  soft: 0,
});

// ───────────────────────────── helpers ─────────────────────────────

/** Deterministic hash → [0, 1). */
export function hash01(k: number, salt: number, j: number): number {
  let h = Math.imul((k | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(salt + 0x632be5ab, 0xc2b2ae35) ^ Math.imul(j + 0x27d4eb2f, 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const OMEGA_VEC = EARTH_AXIS.clone().multiplyScalar(OMEGA_EARTH);
const qSite = new THREE.Quaternion();
const vS = new THREE.Vector3();
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const vW = new THREE.Vector3();

/** Pad-local point at time t → frame I. */
function padPoint(t: number, x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3 {
  siteFrameQuaternion(t, qSite);
  sitePosition(t, 0, out);
  return out.add(vS.set(x, y, z).applyQuaternion(qSite));
}
/** Pad-local direction at time t → frame I. */
function padDir(t: number, x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3 {
  siteFrameQuaternion(t, qSite);
  return out.set(x, y, z).applyQuaternion(qSite);
}
/** Frame-I point at time t → pad-local. */
function toPad(t: number, p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  siteFrameQuaternion(t, qSite);
  sitePosition(t, 0, out);
  out.subVectors(p, out);
  return out.applyQuaternion(qSite.invert());
}

/** Wind at a height, frame-I directions at time t. */
function windWorld(t: number, h: number, out: THREE.Vector3): THREE.Vector3 {
  windAt(h, vW);
  return padDir(t, vW.x, vW.y, vW.z, out);
}

/** Rotate p about Earth's axis by angle a (rad), in place (Rodrigues). */
function rotateEarth(p: THREE.Vector3, a: number) {
  if (a === 0) return;
  const k = EARTH_AXIS;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const kd = k.x * p.x + k.y * p.y + k.z * p.z;
  const cx = k.y * p.z - k.z * p.y;
  const cy = k.z * p.x - k.x * p.z;
  const cz = k.x * p.y - k.y * p.x;
  p.set(p.x * c + cx * s + k.x * kd * (1 - c), p.y * c + cy * s + k.y * kd * (1 - c), p.z * c + cz * s + k.z * kd * (1 - c));
}

const pT = new THREE.Vector3();
const pB = new THREE.Vector3();
/** Unit vector perpendicular to `n` at angle a around it (for lateral scatter). */
function perp(n: THREE.Vector3, a: number, out: THREE.Vector3): THREE.Vector3 {
  const t = Math.abs(n.y) < 0.9 ? pT.set(0, 1, 0) : pT.set(1, 0, 0);
  pB.crossVectors(n, t).normalize();
  const c = Math.cos(a);
  const s = Math.sin(a);
  pT.crossVectors(n, pB);
  return out.copy(pB).multiplyScalar(c).addScaledVector(pT, s);
}

/** Local horizontal unit vector at `up` with azimuth a. */
function horizontal(up: THREE.Vector3, a: number, out: THREE.Vector3): THREE.Vector3 {
  return perp(up, a, out);
}

const nozzleHeight = (c: { centroid: THREE.Vector3 }) => c.centroid.length() - R_EARTH;

// ───────────────────────────── species ─────────────────────────────

export interface SpeciesCtx {
  /** Particle budget multiplier (tierSpec().particles). */
  budget: number;
  /** Size and opacity compensation for a reduced budget. */
  sizeK: number;
  alphaK: number;
  /** Mission time until which the launch pad's own effects run (ground vents); -Infinity: no pad. */
  padUntil: number;
  /**
   * Window species: size of this spawn relative to the pool's mean (the schedule is denser at
   * the start of the window, where the young cloud needs finer puffs, and sparser later).
   */
  winSize: number;
}

interface Species {
  name: string;
  salt: number;
  /** Spawn interval in ticks (1/240 s). */
  dtT: number;
  /** Longest lifetime (s); sets the ring size. */
  life: number;
  /** 'window' species spawn once per slot inside [start, end] (ground cloud). */
  window: boolean;
  /** Lowest budget the spawn rate is scaled to (continuity needs a minimum rate). */
  budgetFloor?: number;
  /** dt: the pool's actual spawn interval (s), after the tier budget. */
  spawn(k: number, ts: number, dt: number, snap: Snapshot, rec: Rec, rnd: (j: number) => number, ctx: SpeciesCtx): boolean;
}

const shape = makeColumnShape();
const smokeClusters: ClusterSnap[] = [];
function smokeSources(snap: Snapshot): ClusterSnap[] {
  smokeClusters.length = 0;
  for (const c of snap.clusters) if ((c.kind === 'kerolox-sl' || c.kind === 'solid') && c.throttle > 0.03) smokeClusters.push(c);
  return smokeClusters;
}

/** Shared by the tail and the trail: start where the exhaust column hands over to smoke. */
function exhaustStart(c: ClusterSnap, ts: number, rec: Rec, rnd: (j: number) => number, dtS: number, m: number): number {
  columnShape(c.kind, c.Rc, c.Req, c.throttle, c.ambientPressure, c.altitude, shape);
  // modest scatter: large random offsets along the flow would bunch the few particles into beads
  const y = shape.handoff * (0.94 + 0.12 * rnd(1));
  const R = columnRadius(shape, y);
  const lat = perp(c.dir, rnd(2) * Math.PI * 2, v1);
  const rr = Math.sqrt(rnd(3)) * R * 0.4;
  rec.p0.copy(c.centroid).addScaledVector(c.dir, y).addScaledVector(lat, rr);
  // the gas leaves the column at uJet relative to the vehicle, which itself moves through the air
  rec.u0.copy(c.dir).multiplyScalar(shape.uJet * (0.9 + 0.2 * rnd(4))).addScaledVector(lat, shape.uJet * 0.12 * (rnd(5) - 0.3)).add(c.airVel);
  rec.tau = mixingTau(shape.rhoRatio) * (0.9 + 0.2 * rnd(6));
  rec.mode = Mode.Air;
  rec.up.copy(rec.p0).normalize();
  const h = rec.p0.length() - R_EARTH;
  windWorld(ts, h, rec.wind);
  rec.buoy = 0.8;
  rec.tauB = 20;
  rec.buoyLin = 0;
  rec.floor = 0;
  rec.spreadK = 0.9;
  // spread over the ground away from the impingement axis
  v2.copy(rec.p0).sub(c.centroid);
  v2.addScaledVector(rec.up, -v2.dot(rec.up));
  if (v2.lengthSq() < 1e-4) horizontal(rec.up, rnd(7) * Math.PI * 2, rec.horiz);
  else rec.horiz.copy(v2).normalize();
  rec.rot0 = rnd(8) * Math.PI * 2;
  rec.spin = (rnd(9) - 0.5) * 0.9;
  rec.variant = Math.floor(rnd(10) * 4);
  // spacing of successive spawns along the flight path must be covered by the particle size
  const spacing = c.airVel.length() * dtS * m;
  rec.gapVel.copy(c.airVel);
  return Math.max(R * (0.7 + 0.35 * rnd(11)), spacing * 0.55);
}

const TAIL: Species = {
  name: 'tail',
  salt: 11,
  dtT: 6,
  life: 5,
  window: false,
  budgetFloor: 0.6,
  spawn(k, ts, dt, snap, rec, rnd, ctx) {
    const list = smokeSources(snap);
    if (!list.length) return false;
    const c = list[((k % list.length) + list.length) % list.length];
    const hN = nozzleHeight(c);
    // on the mount the exhaust goes down the flame trench (the ground cloud shows it)
    if (rnd(0) > smoothstep(11, 28, hN)) return false;
    const dtS = dt * list.length;
    const s0 = exhaustStart(c, ts, rec, rnd, dtS, 1);
    if (shape.smoke < 0.004) return false;
    const solid = c.kind === 'solid';
    rec.group = Group.Smoke;
    rec.size0 = s0 * ctx.sizeK;
    // turbulent growth while the jet slows to the air (in thin air it would take tens of
    // seconds: capped so the tail stays about as wide as the plume)
    rec.size1 = rec.size0 + Math.min(shape.uJet * rec.tau * (0.07 + 0.06 * rnd(12)), 1.4 * s0) * ctx.sizeK;
    rec.tauS = Math.min(rec.tau, 1.5) * 1.3;
    rec.sizeLin = 1.2 + 0.8 * (1 - shape.smoke);
    rec.life = 3.4 + 1.4 * rnd(13);
    rec.alpha0 = Math.min(1, (solid ? 0.8 : 0.5) * Math.pow(shape.smoke, 0.8) * ctx.alphaK);
    rec.fadeIn0 = 0;
    rec.fadeIn1 = 0.05;
    rec.fadeOut = 0.55;
    rec.thin = 0.55;
    rec.thinRef = rec.size0;
    if (solid) {
      rec.alb0.setRGB(0.86, 0.84, 0.8);
      rec.alb1.setRGB(0.9, 0.89, 0.87);
      // the glowing exhaust belongs to the flame volume; the smoke leaving it cools fast
      rec.emit.setRGB(0.9, 0.4, 0.1).multiplyScalar(shape.lum);
      rec.tauE = 0.06;
    } else {
      // kerosene soot: nearly black at the end of the flame, greying slowly as it mixes. Higher
      // up, the exhaust's water condenses and freezes in the cold thin air: the tail pales
      // toward a white contrail instead of staying a dark (and, lit by the flame, brown) smoke.
      const ice = 1 - shape.smoke;
      const soot = 0.1 + 0.08 * rnd(14) + 0.35 * ice;
      rec.alb0.setRGB(soot * 1.06, soot, soot * 0.95);
      const g = 0.5 + 0.32 * ice;
      rec.alb1.setRGB(g, g * 0.99, g * 0.98);
      // the tail end of the afterburning flame: a brief, dim glow. Many sprites overlap here and
      // their glow adds up: kept faint and short, or red light over the grey smoke turns it pink
      // (the flame volume already carries the glow)
      rec.emit.setRGB(0.1, 0.03, 0.006).multiplyScalar(shape.lum * (0.5 + 0.8 * rnd(15)));
      rec.tauE = 0.04 + 0.05 * rnd(16);
    }
    rec.tauC = solid ? 1.2 : 2.6 + 1.4 * rnd(17);
    // overlap successive puffs along the path (a continuous column, not a string of beads)
    rec.gapDt = dtS;
    rec.stretchVel = 0;
    return true;
  },
};

const TRAIL: Species = {
  name: 'trail',
  salt: 23,
  dtT: 24,
  life: 185,
  window: false,
  spawn(k, ts, dt, snap, rec, rnd, ctx) {
    const list = smokeSources(snap);
    if (!list.length) return false;
    const c = list[((k % list.length) + list.length) % list.length];
    if (c.altitude > 52000) return false;
    const hN = nozzleHeight(c);
    if (hN < 11) return false;
    const dtS = dt * list.length;
    const s0 = exhaustStart(c, ts, rec, rnd, dtS, 1);
    if (shape.smoke < 0.01) return false;
    const solid = c.kind === 'solid';
    const spacing = c.airVel.length() * dtS;
    rec.group = Group.Trail;
    rec.size0 = s0 * ctx.sizeK;
    rec.size1 = Math.max(Math.min(rec.size0 + shape.uJet * rec.tau * 0.3, 2.2 * rec.size0 + 10), spacing * 0.62) * ctx.sizeK;
    rec.tauS = Math.min(rec.tau, 2) * 1.3;
    // turbulent diffusion widens the trail; faster in thin air
    rec.sizeLin = 0.7 + 1.6 * (1 - shape.smoke) + 0.4 * rnd(12);
    rec.life = 115 + 70 * rnd(13);
    // thinning with altitude: dense near the ground, faint by 30-40 km, gone above ~50 km
    rec.alpha0 = Math.min(1, (solid ? 0.75 : 0.42) * Math.pow(shape.smoke, 0.75) * ctx.alphaK);
    rec.fadeIn0 = 2.0;
    rec.fadeIn1 = 4.6;
    rec.fadeOut = 0.5;
    rec.thin = 0.6;
    rec.thinRef = rec.size1;
    if (solid) {
      rec.alb0.setRGB(0.88, 0.87, 0.84);
      rec.alb1.setRGB(0.9, 0.9, 0.89);
    } else {
      const g = 0.6 + 0.08 * rnd(14);
      rec.alb0.setRGB(g * 1.02, g, g * 0.96);
      rec.alb1.setRGB(0.8, 0.8, 0.8);
    }
    rec.tauC = 25;
    rec.emit.setRGB(0, 0, 0);
    rec.tauE = 1;
    // soft wisps stretched along the path so the trail reads as one continuous column
    rec.variant = rnd(10) < 0.7 ? 2 + Math.floor(rnd(18) * 2) : Math.floor(rnd(18) * 2);
    rec.gapDt = dtS;
    rec.stretchVel = 0;
    return true;
  },
};

const GROUND: Species = {
  name: 'ground',
  salt: 37,
  dtT: 6,
  life: 185,
  window: true,
  spawn(_k, ts, _dt, snap, rec, rnd, ctx) {
    let c: ClusterSnap | null = null;
    for (const x of snap.clusters) if ((x.kind === 'kerolox-sl' || x.kind === 'solid') && (!c || x.flow > c.flow)) c = x;
    if (!c) return false;
    const hN = nozzleHeight(c);
    const F = Math.min(1.2, c.flow / 1.97);
    const Hf = hN < 40 ? 1 : Math.exp(-(hN - 40) / 85);
    const start = smoothstep(0, 0.8, c.sinceIgnition);
    const I = F * Hf * (0.35 + 0.65 * start);
    if (rnd(0) > I) return false;
    const type = rnd(1);
    let x: number, y: number, z: number, ux: number, uy: number, uz: number;
    let hot = 0;
    const onMount = hN < 30;
    if ((onMount && type < 0.7) || (!onMount && type < 0.22)) {
      // out of the flame trench exit, rolling along the trench direction
      const yaw = (rnd(2) - 0.5) * 0.62;
      const cy = Math.cos(yaw);
      const sy = Math.sin(yaw);
      const dx = TRENCH_DIR.x * cy - TRENCH_DIR.z * sy;
      const dz = TRENCH_DIR.x * sy + TRENCH_DIR.z * cy;
      const lat = (rnd(3) - 0.5) * 10;
      x = TRENCH_EXIT.x - TRENCH_DIR.z * lat;
      z = TRENCH_EXIT.z + TRENCH_DIR.x * lat;
      y = TRENCH_EXIT.y + rnd(4) * 5;
      const sp = (48 + 40 * rnd(5)) * (onMount ? 1 : 0.6) * Math.sqrt(F);
      const el = 0.04 + 0.32 * rnd(6);
      ux = dx * sp * Math.cos(el);
      uz = dz * sp * Math.cos(el);
      uy = sp * Math.sin(el);
      rec.tau = 1.3 + 0.9 * rnd(7);
      // a few puffs carry the flame's glow out of the trench for a moment at engine start
      hot = onMount && rnd(8) < 0.16 ? 1 : 0;
    } else if (onMount) {
      // steam boiling up around the mount (deluge water flashing in the exhaust), blasted out
      // across the deck more than up: it climbs mostly by its own buoyancy
      const a = rnd(2) * Math.PI * 2;
      const r = MOUNT_HOLE.radius + rnd(3) * 9;
      x = Math.cos(a) * r;
      z = Math.sin(a) * r;
      y = 3 + rnd(4) * 5;
      const sp = 9 + 15 * rnd(5);
      ux = Math.cos(a) * sp;
      uz = Math.sin(a) * sp;
      uy = 3 + 7 * rnd(6);
      rec.tau = 1.6 + 0.8 * rnd(7);
    } else {
      // plume striking the pad: a radial wall of steam and smoke
      toPad(ts, c.centroid, v1);
      const a = rnd(2) * Math.PI * 2;
      const r = 4 + rnd(3) * 10;
      x = v1.x + Math.cos(a) * r;
      z = v1.z + Math.sin(a) * r;
      y = 1.5 + rnd(4) * 4;
      const sp = (32 + 48 * rnd(5)) * Math.sqrt(F * Math.max(0.15, Hf));
      ux = Math.cos(a) * sp;
      uz = Math.sin(a) * sp;
      uy = 2 + 7 * rnd(6);
      rec.tau = 1.1 + 0.7 * rnd(7);
      hot = hN < 60 && rnd(8) < 0.14 ? 1 : 0;
    }
    padPoint(ts, x, y, z, rec.p0);
    padDir(ts, ux, uy, uz, rec.u0);
    rec.mode = Mode.Air;
    rec.group = Group.Ground;
    rec.up.copy(rec.p0).normalize();
    windWorld(ts, 40, rec.wind);
    rec.buoy = 2.2 + 3 * rnd(9);
    rec.tauB = 16 + 22 * rnd(10);
    rec.buoyLin = 0.15;
    rec.floor = 0;
    rec.spreadK = 0.6;
    horizontal(rec.up, rnd(11) * Math.PI * 2, rec.horiz);
    rec.size0 = (4.5 + 5 * rnd(12)) * ctx.sizeK * ctx.winSize;
    rec.size1 = (20 + 24 * rnd(13)) * ctx.sizeK * ctx.winSize;
    rec.tauS = 6 + 7 * rnd(14);
    rec.sizeLin = 0.1;
    // persists for one to three minutes, drifting with the wind and thinning as it spreads
    rec.life = 100 + 85 * rnd(15);
    rec.alpha0 = Math.min(1, 0.88 * ctx.alphaK);
    rec.fadeIn0 = 0;
    rec.fadeIn1 = 0.15;
    rec.fadeOut = 0.55;
    rec.thin = 0.3;
    rec.thinRef = rec.size0 * 2;
    // mostly white steam (deluge water boiled by the exhaust, condensing as it cools), with
    // some neutral grey combustion smoke that pales as it mixes with the steam
    if (rnd(16) < 0.14) {
      const g = 0.56 + 0.08 * rnd(17);
      rec.alb0.setRGB(g, g, g * 1.02);
      rec.alb1.setRGB(0.84, 0.84, 0.85);
    } else {
      const w = 0.93 + 0.06 * rnd(17);
      rec.alb0.setRGB(w, w, w * 1.01);
      rec.alb1.setRGB(w, w, w * 1.01);
    }
    rec.tauC = 7;
    if (hot) {
      // a flash of flame out of the trench mouth that cools within a few tenths of a second
      rec.emit.setRGB(2.2, 0.72, 0.14).multiplyScalar(F);
      rec.tauE = 0.12 + 0.18 * rnd(18);
      rec.alpha0 *= 0.6;
    } else {
      rec.emit.setRGB(0, 0, 0);
      rec.tauE = 1;
    }
    rec.rot0 = rnd(19) * Math.PI * 2;
    rec.spin = (rnd(20) - 0.5) * 0.35;
    rec.variant = Math.floor(rnd(21) * 4);
    rec.gapDt = 0;
    rec.stretchVel = 0;
    return true;
  },
};

function vehicleOnPad(snap: Snapshot): boolean {
  for (const c of snap.clusters) if (c.kind === 'kerolox-sl' && nozzleHeight(c) > 14) return false;
  return true;
}

function jetSpawn(j: PadJet, ts: number, rec: Rec, rnd: (j: number) => number, spread: number, speedJit: number) {
  padPoint(ts, j.pos[0], j.pos[1], j.pos[2], rec.p0);
  v1.set(j.dir[0], j.dir[1], j.dir[2]);
  const off = perp(v1, rnd(2) * Math.PI * 2, v2).multiplyScalar(Math.tan(spread * Math.sqrt(rnd(3))));
  v1.add(off).normalize().multiplyScalar(j.speed * (1 + speedJit * (rnd(4) - 0.5)));
  padDir(ts, v1.x, v1.y, v1.z, rec.u0);
  rec.up.copy(rec.p0).normalize();
}

const VENT: Species = {
  name: 'vent',
  salt: 41,
  dtT: 5,
  life: 7.2,
  window: false,
  spawn(k, ts, _dt, snap, rec, rnd, ctx) {
    // every fourth slot: the ground LOX storage vents (continuous boil-off); the rest: the
    // vehicle's vents while it is being topped off (pad.venting)
    const ground = GROUND_VENTS.length > 0 && ((k % 4) + 4) % 4 === 0;
    let j: PadJet;
    if (ground) {
      if (ts > ctx.padUntil) return false;
      j = GROUND_VENTS[Math.floor(rnd(1) * GROUND_VENTS.length)];
    } else {
      const v = snap.pad.venting;
      if (v < 0.01 || rnd(0) > v || !vehicleOnPad(snap)) return false;
      j = VENTS[((k % VENTS.length) + VENTS.length) % VENTS.length];
    }
    jetSpawn(j, ts, rec, rnd, 0.35, 0.6);
    rec.mode = Mode.Air;
    rec.group = Group.Vent;
    rec.tau = 0.8 + 0.7 * rnd(5);
    windWorld(ts, j.pos[1], rec.wind);
    rec.buoy = -(0.7 + 0.9 * rnd(6));
    rec.tauB = 2.5 + 2 * rnd(7);
    rec.buoyLin = -0.35;
    rec.floor = 0;
    rec.spreadK = 0.3;
    horizontal(rec.up, rnd(8) * Math.PI * 2, rec.horiz);
    // (a continuous stream of overlapping wisps: isolated round puffs would read as smudges)
    rec.size0 = (0.3 + 0.25 * rnd(9)) * ctx.sizeK;
    rec.size1 = (2.6 + 2.6 * rnd(10)) * ctx.sizeK;
    rec.tauS = 2.4;
    rec.sizeLin = 0.12;
    rec.life = 3.8 + 3.2 * rnd(11);
    rec.alpha0 = Math.min(1, 0.62 * ctx.alphaK);
    rec.fadeIn0 = 0;
    rec.fadeIn1 = 0.1;
    rec.fadeOut = 0.3;
    rec.thin = 0.5;
    rec.thinRef = rec.size0 * 3;
    rec.alb0.setRGB(0.97, 0.98, 1);
    rec.alb1.setRGB(0.95, 0.96, 0.97);
    rec.tauC = 2;
    rec.emit.setRGB(0, 0, 0);
    rec.tauE = 1;
    rec.rot0 = rnd(12) * Math.PI * 2;
    rec.spin = (rnd(13) - 0.5) * 0.8;
    rec.variant = Math.floor(rnd(14) * 4);
    rec.gapDt = 0;
    rec.stretchVel = 0;
    return true;
  },
};

const WATER: Species = {
  name: 'deluge',
  salt: 53,
  dtT: 2,
  life: 2.9,
  window: false,
  spawn(_k, ts, _dt, snap, rec, rnd, ctx) {
    const d = snap.pad.deluge;
    if (d < 0.01 || rnd(0) > d) return false;
    if (!DELUGE.length) return false;
    const j = pickJet(DELUGE, rnd(1));
    const cannon = !!j.cannon;
    jetSpawn(j, ts, rec, rnd, cannon ? 0.07 : 0.2, cannon ? 0.16 : 0.3);
    rec.mode = Mode.Ballistic;
    rec.group = Group.Water;
    rec.tau = 1e9;
    rec.grav.copy(rec.up).multiplyScalar(-9.81);
    windWorld(ts, 10, rec.wind).multiplyScalar(0.4);
    rec.dieBelow = cannon ? 0.6 : j.pos[1] - 3.5;
    rec.floor = -1e9;
    rec.size0 = (cannon ? 0.35 : 0.25) * ctx.sizeK;
    rec.size1 = (cannon ? 1.5 + 1.1 * rnd(5) : 0.9 + 0.7 * rnd(5)) * ctx.sizeK;
    rec.tauS = 1.1;
    rec.sizeLin = 0;
    rec.life = 2.9;
    // a solid jet of water breaking up into spray: white and dense near the muzzle
    rec.alpha0 = Math.min(1, (cannon ? 0.5 : 0.36) * ctx.alphaK);
    rec.fadeIn0 = 0;
    rec.fadeIn1 = 0.05;
    rec.fadeOut = 0.8;
    rec.thin = 0.45;
    rec.thinRef = rec.size0 * 2;
    rec.alb0.setRGB(0.9, 0.93, 0.96);
    rec.alb1.setRGB(0.92, 0.94, 0.96);
    rec.tauC = 1;
    rec.emit.setRGB(0, 0, 0);
    rec.tauE = 1;
    rec.rot0 = rnd(6) * Math.PI * 2;
    rec.spin = 0;
    rec.variant = Math.floor(rnd(7) * 4);
    rec.gapDt = 0;
    // streaked along the flight path: the jets read as arcs of spray
    rec.stretchVel = 0.14;
    return true;
  },
};

const puffList: EmitterSnap[] = [];

/**
 * Attitude thrusters are safed on the pad and inhibited while the first stage is under power
 * (the stack steers by gimballing its engines): no puffs near the ground, and none from a
 * thruster within the powered stack's length of a firing first-stage (or abort-motor) cluster
 * or close to its own stage's firing main engine.
 * This also keeps a thruster channel that is left on from the start of a timeline (a key
 * missing before its first firing) from streaming puffs beside the rocket through the ascent.
 */
const vRel = new THREE.Vector3();
/** Is a thruster at p on the powered vehicle of an engine at `exit` firing along `dir` (ahead of its exit plane, within reach)? */
const onPoweredStack = (p: THREE.Vector3, exit: THREE.Vector3, dir: THREE.Vector3, reach: number) => {
  vRel.subVectors(p, exit);
  // a separated stage drifting behind the engine sits in its exhaust (downstream): not inhibited
  return vRel.lengthSq() < reach * reach && vRel.dot(dir) < 0;
};

function thrusterInhibited(e: EmitterSnap, snap: Snapshot): boolean {
  if (e.altitude < 150) return true;
  for (const c of snap.clusters) {
    if ((c.kind === 'kerolox-sl' || c.kind === 'solid') && c.throttle > 0.03 && onPoweredStack(e.pos, c.centroid, c.dir, 95)) return true;
  }
  // likewise a stage steering with its own gimballed main engine (upper stage, service module)
  for (const m of snap.emitters) {
    const main = m.kind === 'kerolox-vac' || (m.kind === 'hypergolic' && m.exitRadius >= SMALL_THRUSTER);
    if (main && m.throttle > 0.03 && onPoweredStack(e.pos, m.pos, m.dir, 30)) return true;
  }
  return false;
}

const PUFF: Species = {
  name: 'puff',
  salt: 67,
  dtT: 2,
  life: 1.5,
  window: false,
  spawn(k, ts, _dt, snap, rec, rnd, ctx) {
    puffList.length = 0;
    for (const e of snap.emitters) if ((e.kind === 'cold-gas' || e.kind === 'mono' || (e.kind === 'hypergolic' && e.exitRadius < SMALL_THRUSTER)) && e.throttle > 0.03 && !thrusterInhibited(e, snap)) puffList.push(e);
    if (!puffList.length) return false;
    const e = puffList[((k % puffList.length) + puffList.length) % puffList.length];
    if (rnd(0) > e.throttle) return false;
    // hypergolic attitude thrusters: a small, brief, pale puff with a faint orange-pink flash
    const hyp = e.kind === 'hypergolic';
    const mono = e.kind === 'mono' || hyp;
    const rho = airDensity(e.ambientPressure, e.altitude) / RHO_SL;
    const vac = e.altitude > 100000 || rho < 1e-7;
    // how much the air holds the puff back: 1 in the lower atmosphere, 0 in near-vacuum
    const dense = smoothstep(-6.5, -2.5, Math.log10(Math.max(rho, 1e-12)));
    rec.p0.copy(e.pos).addScaledVector(e.dir, e.exitRadius * 2);
    const off = perp(e.dir, rnd(2) * Math.PI * 2, v2).multiplyScalar(Math.tan(0.32 * Math.sqrt(rnd(3))));
    v1.copy(e.dir).add(off).normalize();
    // speed of the visible puff (its dense core; the fast rarefied fringe is invisible)
    const sp = mono ? (22 + 14 * rnd(4)) * (1 + 1.2 * dense) : (12 + 10 * rnd(4)) * (1 - dense) + (34 + 26 * rnd(4)) * 2.2 * dense;
    rec.up.copy(rec.p0).normalize();
    rec.group = Group.Puff;
    if (vac) {
      rec.mode = Mode.Vacuum;
      // inertial velocity: air-relative velocity plus the co-rotating air's velocity
      rec.u0.crossVectors(OMEGA_VEC, e.pos).add(e.airVel).addScaledVector(v1, sp);
      const r = e.pos.length();
      rec.grav.copy(e.pos).multiplyScalar(-MU_EARTH / (r * r * r));
      rec.tau = 1e9;
    } else {
      // leaves with the vehicle's velocity plus the jet's, and slows to the air (quickly in
      // dense air; in the thin upper air it keeps pace with the vehicle)
      rec.mode = Mode.Air;
      rec.u0.copy(e.airVel).addScaledVector(v1, sp);
      rec.tau = Math.min(mixingTau(rho) * 0.4, 30);
      windWorld(ts, e.altitude, rec.wind);
    }
    rec.buoy = 0;
    rec.buoyLin = 0;
    rec.tauB = 1;
    rec.floor = -1e9;
    rec.size0 = (mono ? 0.07 : 0.12 + 0.08 * rnd(5)) * ctx.sizeK;
    rec.size1 = (mono ? (0.9 + 0.5 * rnd(6)) * (1.3 - 0.3 * dense) * (hyp ? 0.75 : 1) : (0.9 + 0.9 * rnd(6)) * (1 - dense) + (2.2 + 2.2 * rnd(6)) * dense) * ctx.sizeK;
    rec.tauS = 0.4;
    // in vacuum the gas expands at its thermal speed and is gone in a fraction of a second (its
    // thinning fringe is invisible: the visible puff stays compact); in air it slows within
    // metres and disperses in about a second
    rec.sizeLin = (mono ? 2.5 : 2.2) * (1 - dense) + 0.5 * dense;
    // cold nitrogen condenses into a sunlit ice-crystal puff that stays visible for most of a
    // second even in vacuum; hot hydrazine or hypergolic products only flash
    rec.life = (mono ? 0.35 + 0.35 * rnd(7) : 0.6 + 0.4 * rnd(7)) * (1 - dense) + (0.8 + 0.6 * rnd(7)) * dense;
    rec.alpha0 = Math.min(1, (hyp ? 0.19 : mono ? 0.22 : 0.55 - 0.03 * dense) * ctx.alphaK);
    rec.fadeIn0 = 0;
    rec.fadeIn1 = 0.03;
    rec.fadeOut = 0.25;
    rec.thin = mono ? 1 - 0.2 * dense : 0.65 - 0.1 * dense;
    rec.thinRef = mono ? rec.size0 * 4 : rec.size1 * 0.5;
    if (hyp) {
      // a brief orange flash at the nozzle, then a faint, nearly white puff
      rec.alb0.setRGB(0.95, 0.92, 0.88);
      rec.alb1.setRGB(0.94, 0.93, 0.92);
    } else if (mono) {
      rec.alb0.setRGB(0.92, 0.9, 0.84);
      rec.alb1.setRGB(0.92, 0.9, 0.84);
    } else {
      rec.alb0.setRGB(0.97, 0.98, 1);
      rec.alb1.setRGB(0.97, 0.98, 1);
    }
    rec.tauC = hyp ? 0.25 : 1;
    if (hyp) {
      rec.emit.setRGB(1.0, 0.5, 0.26).multiplyScalar(0.8);
      rec.tauE = 0.05;
    } else {
      rec.emit.setRGB(0, 0, 0);
      rec.tauE = 1;
    }
    rec.rot0 = rnd(8) * Math.PI * 2;
    rec.spin = (rnd(9) - 0.5) * 2;
    // soft wisps (atlas tiles 2-3): a gas puff has no cauliflower billows
    rec.variant = 2 + Math.floor(rnd(10) * 2);
    rec.gapDt = 0;
    rec.stretchVel = 0;
    return true;
  },
};

export const SPECIES: Species[] = [GROUND, TRAIL, TAIL, VENT, WATER, PUFF];

// ───────────────────────────── pools ─────────────────────────────

/**
 * Window schedule warp: slot u in [0, 1] spawns at WIN_A u + (1 - WIN_A) u^2 of the window, so
 * the first seconds after engine start (a few isolated puffs would read as cotton balls) get
 * about three times the mean rate and the end of the window about 0.6 times.
 */
const WIN_A = 0.35;

class Pool {
  recs: Rec[];
  n: number;
  dtT: number;
  /** Window species: first spawn tick, span (ticks) and the count actually scheduled. */
  winStart = 0;
  winSpan = 0;
  winCount = 0;
  winKey = '';

  constructor(
    readonly sp: Species,
    budget: number,
  ) {
    if (sp.window) {
      this.n = Math.max(40, Math.round(720 * budget));
      this.dtT = sp.dtT;
    } else {
      this.dtT = Math.max(1, Math.round(sp.dtT / Math.max(budget, sp.budgetFloor ?? 0)));
      this.n = Math.ceil((sp.life * TICK) / this.dtT) + 1;
    }
    this.recs = Array.from({ length: this.n }, makeRec);
  }

  invalidate() {
    for (const r of this.recs) r.k = NaN;
  }

  /** Configure a window species for the source's ground blast interval. */
  setWindow(start: number | null, end: number | null) {
    const key = `${start}:${end}`;
    if (key === this.winKey) return;
    this.winKey = key;
    this.invalidate();
    if (start === null || end === null || !(end > start)) {
      this.winCount = 0;
      return;
    }
    const s = Math.ceil(start * TICK);
    const e = Math.floor(end * TICK);
    this.winStart = s;
    this.winSpan = e - s;
    // the densest gap (at the start, WIN_A x the mean) stays at least one tick
    this.winCount = Math.max(1, Math.min(this.n, Math.floor((e - s) * WIN_A) + 1));
    this.dtT = Math.max(1, Math.round((e - s) / this.winCount));
  }

  /** Spawn tick of window slot i (strictly increasing in i). */
  winTick(i: number): number {
    if (this.winCount <= 1) return this.winStart;
    const u = i / (this.winCount - 1);
    return this.winStart + Math.round(this.winSpan * (WIN_A * u + (1 - WIN_A) * u * u));
  }

  /** Size of window slot i's puff relative to the mean: the cube root of its local spacing. */
  winSize(i: number): number {
    if (this.winCount <= 1) return 1;
    const u = i / (this.winCount - 1);
    return Math.cbrt(WIN_A + 2 * (1 - WIN_A) * u);
  }
}

export class ParticleSystem {
  cache = new SnapshotCache(1024);
  pools: Pool[] = [];
  /** Evaluated live particles (valid after update, `count` of them). */
  out: Particle[] = [];
  count = 0;
  ctx: SpeciesCtx = { budget: 1, sizeK: 1, alphaK: 1, padUntil: -Infinity, winSize: 1 };
  private lastT = NaN;
  private lastEpoch = -1;
  /** Spawn computations done by the last update (diagnostics, tests). */
  spawned = 0;

  constructor(budget = 1) {
    this.setBudget(budget);
  }

  setBudget(b: number) {
    const budget = Math.min(2, Math.max(0.1, b));
    this.ctx = { budget, sizeK: Math.pow(budget, -0.3), alphaK: Math.pow(budget, -0.2), padUntil: this.ctx?.padUntil ?? -Infinity, winSize: 1 };
    this.pools = SPECIES.map((s) => new Pool(s, budget));
    this.lastT = NaN;
  }

  get capacity(): number {
    return this.pools.reduce((a, p) => a + p.n, 0);
  }

  setSource(src: EffectsSource | null) {
    if (src !== this.cache.source) {
      this.cache.setSource(src);
      for (const p of this.pools) {
        p.invalidate();
        p.winKey = '';
      }
    }
  }

  /**
   * Bring every slot to mission time t and evaluate the live particles into `out`.
   * `epoch` is effects.seekEpoch: a change rebuilds all spawn data from mission time.
   */
  update(t: number, epoch: number): number {
    const src = this.cache.source;
    this.spawned = 0;
    this.count = 0;
    if (!src) return 0;
    const full = epoch !== this.lastEpoch || !(t >= this.lastT - 1e-9);
    this.lastEpoch = epoch;
    this.lastT = t;
    // a mission launched from the pad: its ground vents run until ten minutes after the blast
    const padUntil = src.groundBlastStart !== null ? (src.groundBlastEnd ?? src.groundBlastStart) + 600 : -Infinity;
    if (padUntil !== this.ctx.padUntil) {
      this.ctx.padUntil = padUntil;
      for (const p of this.pools) p.invalidate();
    }
    for (const p of this.pools) {
      if (full) p.invalidate();
      if (p.sp.window) p.setWindow(src.groundBlastStart, src.groundBlastEnd);
      this.updatePool(p, t);
    }
    return this.count;
  }

  private updatePool(p: Pool, t: number) {
    const sp = p.sp;
    const tick = t * TICK;
    if (sp.window) {
      for (let i = 0; i < p.winCount; i++) {
        const kTick = p.winTick(i);
        const ts = kTick / TICK;
        const age = t - ts;
        if (age < 0 || age > sp.life) continue;
        const r = p.recs[i];
        if (r.k !== kTick) this.respawn(p, r, i, kTick, ts);
        if (r.active && age <= r.life) this.emit(r, age);
      }
      return;
    }
    const n = p.n;
    const K = Math.floor(tick / p.dtT);
    for (let i = 0; i < n; i++) {
      const k = K - ((((K - i) % n) + n) % n);
      const kTick = k * p.dtT;
      const ts = kTick / TICK;
      const age = t - ts;
      if (age > sp.life) continue;
      const r = p.recs[i];
      if (r.k !== k) this.respawn(p, r, k, kTick, ts);
      if (r.active && age <= r.life) this.emit(r, age);
    }
  }

  private respawn(p: Pool, r: Rec, k: number, kTick: number, ts: number) {
    r.k = p.sp.window ? kTick : k;
    r.ts = ts;
    r.active = false;
    const snap = this.cache.atTick(kTick);
    if (!snap) return;
    this.spawned++;
    const salt = p.sp.salt;
    const rnd = (j: number) => hash01(kTick, salt, j);
    this.ctx.winSize = p.sp.window ? p.winSize(k) : 1;
    r.active = p.sp.spawn(k, ts, p.dtT / TICK, snap, r, rnd, this.ctx);
  }

  private emit(r: Rec, age: number) {
    const o = this.out[this.count] ?? (this.out[this.count] = makeParticle());
    if (evalRec(r, age, o)) this.count++;
  }
}

// ───────────────────────────── closed-form state ─────────────────────────────

/** State of a particle at an age (s). Returns false if it is invisible. */
export function evalRec(r: Rec, a: number, o: Particle): boolean {
  let radius = r.size0 + (r.size1 - r.size0) * (1 - Math.exp(-a / r.tauS)) + r.sizeLin * a;
  const X = o.pos;
  let alive = true;
  if (r.mode === Mode.Vacuum) {
    X.copy(r.p0).addScaledVector(r.u0, a).addScaledVector(r.grav, 0.5 * a * a);
    o.height = X.length() - R_EARTH;
  } else {
    if (r.mode === Mode.Ballistic) {
      X.copy(r.p0).addScaledVector(r.u0, a).addScaledVector(r.grav, 0.5 * a * a).addScaledVector(r.wind, a);
      o.height = X.length() - R_EARTH;
      if (o.height < r.dieBelow) alive = false;
    } else {
      const f = r.tau * (1 - Math.exp(-a / r.tau));
      X.copy(r.p0).addScaledVector(r.u0, f).addScaledVector(r.wind, a);
      const rise = r.buoy * r.tauB * (1 - Math.exp(-a / r.tauB)) + r.buoyLin * a;
      X.addScaledVector(r.up, rise);
      let h = X.length() - R_EARTH;
      if (r.floor > -1e6) {
        const fl = r.floor + radius * 0.35;
        if (h < fl) {
          const d = fl - h;
          X.addScaledVector(r.up, d).addScaledVector(r.horiz, d * r.spreadK);
          radius += d * 0.15;
          h = fl;
        }
      }
      o.height = h;
    }
    // the air (and the pad) co-rotate with the Earth
    rotateEarth(X, OMEGA_EARTH * a);
  }
  if (!alive) return false;
  const fin = r.fadeIn1 > r.fadeIn0 ? smoothstep(r.fadeIn0, r.fadeIn1, a) : 1;
  const fout = 1 - smoothstep(r.life * r.fadeOut, r.life, a);
  const thin = r.thin > 0 ? Math.min(1, Math.pow(r.thinRef / Math.max(radius, 1e-3), r.thin)) : 1;
  const alpha = r.alpha0 * fin * fout * thin;
  const e = Math.exp(-a / r.tauE);
  const emitVisible = e * (r.emit.r + r.emit.g + r.emit.b) * fin > 0.004;
  if (alpha < 0.002 && !emitVisible) return false;
  o.radius = radius;
  o.alpha = alpha;
  const c = 1 - Math.exp(-a / r.tauC);
  o.albedo.copy(r.alb0).lerp(r.alb1, c);
  o.emit.copy(r.emit).multiplyScalar(e * fin * fout);
  o.rot = r.rot0 + r.spin * 6 * (1 - Math.exp(-a / 6));
  o.variant = r.variant;
  o.group = r.group;
  o.shadow = 0;
  // a young cloud billows with crisp edges; as it ages and spreads, its edges diffuse
  o.soft = r.group === Group.Ground || r.group === Group.Trail ? 0.9 * smoothstep(6, 45, a) : r.group === Group.Smoke ? 0.5 * smoothstep(1, 4, a) : 0;
  if (r.stretchVel > 0) {
    // velocity-aligned streak (spray)
    o.axis.copy(r.u0).addScaledVector(r.grav, a);
    const sp = o.axis.length();
    if (sp > 1e-3) o.axis.multiplyScalar(1 / sp);
    rotateEarth(o.axis, OMEGA_EARTH * a);
    o.stretch = sp * r.stretchVel;
  } else if (r.gapDt > 0 && r.mode === Mode.Air) {
    // the next particle was spawned one interval later, from where the emitter had moved:
    // the gap between them is (emitter velocity - particle velocity) x interval
    const k = Math.exp(-a / r.tau);
    const kb = r.buoy * Math.exp(-a / r.tauB) + r.buoyLin;
    o.axis.copy(r.gapVel).addScaledVector(r.u0, -k).addScaledVector(r.up, -kb);
    const g = o.axis.length();
    if (g > 1e-6) o.axis.multiplyScalar(1 / g);
    rotateEarth(o.axis, OMEGA_EARTH * a);
    o.stretch = Math.min(g * r.gapDt, radius * 12);
  } else o.stretch = 0;
  return true;
}
