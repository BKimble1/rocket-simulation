/**
 * Exhaust plumes at the displayed mission time: one volume per nozzle (core, shock diamonds,
 * ignition flash), one merged column per cluster of first-stage (or abort-motor) nozzles
 * (turbulent afterburning flame, sooty tail, the ballooning under-expanded plume at altitude),
 * a sooty gas-generator exhaust jet beside each kerosene engine, and faint vacuum, hypergolic
 * and cold-gas jets. Shapes follow physics.ts (the particles use the same laws).
 */
import * as THREE from 'three';
import { R_EARTH } from '../../world/frames';
import type { ClusterSnap, EmitterSnap } from './snapshot';
import { airDensity, columnShape, makeColumnShape, pressureRatioAmb, RHO_SL, SMALL_THRUSTER, smokiness, type ColumnShape } from './physics';
import { resetParams, Volume, type VolumeLight, type VolumeParams } from './volume';

const C = (r: number, g: number, b: number) => new THREE.Color(r, g, b);

/**
 * Emission colours are linear and saturated on purpose: flames go through a per-channel
 * exposure curve (fxFlame in glsl.ts), so brightness shifts them from red through orange and
 * yellow toward white, as on film. Absorbing and scattering colours are albedos.
 */
const COL = {
  core: C(1.0, 0.62, 0.24),
  coreHigh: C(1.0, 0.8, 0.62),
  diamond: C(1.0, 0.8, 0.56),
  green: C(0.08, 1.0, 0.18),
  flameA: C(1.0, 0.42, 0.11),
  flameB: C(1.0, 0.25, 0.045),
  colFlameA: C(1.0, 0.44, 0.12),
  colFlameB: C(1.0, 0.2, 0.03),
  sootA: C(0.1, 0.085, 0.075),
  sootB: C(0.34, 0.32, 0.3),
  envelope: C(0.86, 0.86, 0.88),
  balloonGlow: C(1.0, 0.36, 0.1),
  balloonRim: C(1.0, 0.46, 0.26),
  vacCore: C(1.0, 0.55, 0.26),
  vacRim: C(0.42, 0.52, 1.0),
  // (faint emission of a saturated orange over black space reads as a brown smudge: the
  // hypergolic plume is pale, so its colours are desaturated)
  hypCore: C(1.0, 0.74, 0.6),
  hypRim: C(1.0, 0.68, 0.74),
  solidCore: C(1.0, 0.8, 0.55),
  solidA: C(1.0, 0.62, 0.26),
  solidB: C(1.0, 0.34, 0.08),
  solidSmokeA: C(0.84, 0.82, 0.78),
  solidSmokeB: C(0.9, 0.89, 0.87),
  ggSoot: C(0.045, 0.04, 0.035),
  ggSootB: C(0.14, 0.13, 0.12),
  ggFlameA: C(1.0, 0.34, 0.07),
  ggFlameB: C(0.9, 0.16, 0.02),
  none: C(0, 0, 0),
};

/**
 * Plume volumes drawn at most (one draw call each). With the two sprite batches and up to two
 * plasma volumes the effects stay within 25 draw calls.
 */
export const MAX_VOLUMES = 20;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Development switch: draw only one kind of plume volume ('core', 'column', 'gg', 'vac'). */
export const plumeDebug = { only: null as string | null };

/** TEA-TEB (pyrophoric igniter) flash: bright green at the nozzle for the first ~0.5 s. */
const GREEN_LIGHT = new THREE.Color(0.25, 1.0, 0.35);

export const greenFlash = (since: number) => smooth(0, 0.03, since) * (1 - smooth(0.18, 0.55, since));

/** Engine start transient: the flame builds over ~0.7 s. */
const startUp = (since: number) => smooth(0, 0.7, since);

function blob(p: VolumeParams, y: number, sy: number, sr: number, i: number, col: THREE.Color) {
  if (i <= 0) return;
  p.blobs.push({ y, sy, sr, i, col });
}

const blobCols = Array.from({ length: 64 }, () => new THREE.Color());
let blobColN = 0;
const bcol = (c: THREE.Color) => blobCols[blobColN++ % blobCols.length].copy(c);

/** Per-nozzle core of a kerosene sea-level engine or a solid motor. */
function engineCore(e: EmitterSnap, p: VolumeParams, steps: number) {
  resetParams(p);
  const re = e.exitRadius;
  const D = 2 * re;
  const thr = e.throttle;
  const solid = e.kind === 'solid';
  const pr = pressureRatioAmb(e.kind, thr, e.ambientPressure);
  const rhoR = airDensity(e.ambientPressure, e.altitude) / RHO_SL;
  const st = solid ? smooth(0, 0.08, e.sinceIgnition) : startUp(e.sinceIgnition);
  const green = solid ? 0 : greenFlash(e.sinceIgnition);
  const ln = Math.log(Math.max(pr, 1e-3));
  const bal = pr > 1 ? Math.min(3.4 * re, re * 0.9 * Math.sqrt(pr)) : re * (0.9 + 0.1 * pr);
  const lumAir = 0.45 + 0.55 * Math.min(1, rhoR * 4);
  const Lcore = D * (solid ? 6 : 4.2 + 1.3 * thr) * (pr > 1 ? Math.min(2.2, 1 + 0.22 * ln) : 1) * (0.25 + 0.75 * st);
  p.Rc = re;
  p.Rbal = Math.max(re * 0.6, bal);
  p.Lb = 1.2 * p.Rbal;
  p.spread = 0.06;
  p.y0 = -0.03;
  p.y1 = Lcore * 1.7 + D;
  p.steps = steps;
  p.seed = hashId(e.id) * 97;
  p.margin = 1.35;
  // hot inviscid core, brightest at the exit and fading along its length (slightly green
  // during the igniter flash). Blob intensities are per metre of line of sight.
  // Optical thickness of the afterburning soot envelope: opaque in the dense lower air, thin
  // above ~20 km (the gas is tenuous and burns out). An opaque medium with a dim source reads
  // as brown or bronze over a bright background (sky, clouds, the ballooned plume behind it).
  const thick = Math.max(0.03, Math.min(1, rhoR * 3)) ** 0.8;
  // High up there is little afterburning soot: the core is fainter and burns a paler cream
  // (an orange Gaussian fading through mid tones reads as brass streaks inside the plume)
  const coreCol = bcol(solid ? COL.solidCore : COL.core);
  if (!solid) coreCol.lerp(COL.coreHigh, 1 - thick);
  coreCol.lerp(COL.green, green * 0.7);
  const rCore = re * 0.6 * Math.sqrt(p.Rbal / re);
  const coreI = (solid ? 16 : 3.6 * (0.45 + 0.55 * thick)) * thr * st;
  // the luminous core hides what is behind it (without this, yellow over blue sky reads green)
  p.blobOcc = solid ? 0.3 : 1.4;
  blob(p, Lcore * 0.1, Lcore * 0.3, rCore, coreI, coreCol);
  blob(p, Lcore * 0.55, Lcore * 0.34, rCore * 0.8, coreI * 0.55, bcol(coreCol));
  // shock diamonds: Mach disks in the over- or near-ideally-expanded jet, fading as it balloons
  const vis = Math.exp(-(ln * ln) / 3) * (solid ? 0.35 : 1) * st;
  const s = D * 0.95 * Math.max(0.85, Math.sqrt(Math.max(pr, 0.5)));
  for (let n = 0; n < 5; n++) {
    const y = s * (0.62 + n);
    if (y > Lcore * 1.5) break;
    blob(p, y, 0.15 * s, re * (0.4 - 0.04 * n), 17 * thr * vis * Math.pow(0.6, n), bcol(COL.diamond).lerp(COL.green, green * 0.8));
  }
  // TEA-TEB: the pyrophoric igniter burns bright green at the exit for a fraction of a second
  blob(p, 0.6 * D, 1.2 * D, 1.1 * re, 7 * green, bcol(COL.green));
  // flame envelope around the core
  p.flameI = (solid ? 5 : 1.5) * thr * lumAir * (0.3 + 0.7 * st) / Math.sqrt(thick);
  p.flameSigma = (solid ? 2.5 : 0.9) * thick;
  p.flameIn = [0.15 * D, 1.1 * D];
  p.flameLen = Lcore * 1.4;
  p.flameA.copy(solid ? COL.solidA : COL.flameA).lerp(COL.green, green * 0.8);
  p.flameB.copy(solid ? COL.solidB : COL.flameB);
  // turbulent afterburning low down; a smooth expanding jet high up (streaks would read as metal)
  p.turb = 0.5 * (0.35 + 0.65 * thick);
  p.flow = 420;
  p.noiseK = 1.0;
  p.radK = 2.6;
  p.endFade = p.y1 * 0.3;
}

/** Merged column behind a cluster (or a single kerosene engine, e.g. a landing burn). */
function column(c: ClusterSnap, s: ColumnShape, p: VolumeParams, steps: number) {
  resetParams(p);
  const solid = c.kind === 'solid';
  const st = solid ? smooth(0, 0.1, c.sinceIgnition) : startUp(c.sinceIgnition - 0.1);
  p.Rc = s.Rc;
  p.Rbal = s.Rbal;
  p.Lb = s.Lb;
  p.spread = s.spread;
  p.y0 = 0;
  p.y1 = s.L * (0.3 + 0.7 * st);
  p.steps = steps;
  p.seed = 13.7;
  p.margin = 1.25;
  const sq = Math.sqrt(s.throttle);
  // opaque luminous soot low down, optically thin high up (see engineCore)
  const thick = Math.max(0.03, Math.min(1, s.rhoRatio * 3)) ** 0.8;
  p.flameI = ((solid ? 4 : 3.4) * s.lum * sq * st) / Math.sqrt(thick);
  p.flameSigma = (solid ? 2 : 1.5) * thick;
  p.flameIn = [1.2, solid ? 2 : 6];
  p.flameLen = s.flameLen * (0.4 + 0.6 * st);
  p.flameA.copy(solid ? COL.solidA : COL.colFlameA);
  p.flameB.copy(solid ? COL.solidB : COL.colFlameB);
  p.turb = 0.95;
  p.flow = 150;
  p.noiseK = 1.5;
  p.radK = 2.6;
  // sooty tail (thins with altitude) handing over to the smoke particles
  p.smokeSigma = (solid ? 0.9 : 1.0) * s.smoke * st;
  p.smokeIn = solid ? [s.smokeStart, s.smokeStart + 8] : [4, s.smokeStart + 14];
  p.sootOuter = solid ? 0 : 0.75;
  // kerosene soot near the ground; higher up the tail is mostly condensed water (ice): paler
  p.smokeA.copy(solid ? COL.solidSmokeA : COL.sootA);
  p.smokeB.copy(solid ? COL.solidSmokeB : COL.sootB);
  if (!solid) {
    p.smokeA.lerp(COL.sootB, 1 - s.smoke);
    p.smokeB.lerp(COL.envelope, 0.8 * (1 - s.smoke));
  }
  // the under-expanded plume at altitude: sunlit translucent envelope with an orange glow near the nozzles
  const wbal = smooth(1.6, 14, s.pr);
  // condensed exhaust and afterburning keep the ballooned plume bright as it spreads; a small
  // motor's plume balloons as wide but carries far less gas, so it is fainter (abort tower)
  const size = Math.min(1, s.Req / 1.2);
  p.exK = 1 - 0.45 * wbal;
  p.scatSigma = 0.4 * wbal * sq * size;
  p.scatAlb.copy(COL.envelope);
  p.glowI = 1.4 * wbal * sq * st * (solid ? 1.4 : 1) * size;
  // the ballooned plume is smooth: fine turbulence would only show as grain over its width;
  // its glow sits near the nozzles of a long volume, so march it with more samples
  p.turb *= 1 - 0.6 * wbal;
  p.steps = Math.round(steps + 10 * wbal);
  p.glowDecay = 0.5 * s.Rbal + 6;
  p.glowCore.copy(COL.balloonGlow);
  p.glowRim.copy(COL.balloonRim);
  p.endFade = p.y1 * 0.38;
}

/** Gas-generator turbine exhaust: a dark, sooty jet (fuel-rich), burning orange at the outlet in air. */
function ggJet(e: EmitterSnap, p: VolumeParams, steps: number) {
  resetParams(p);
  const rhoR = airDensity(e.ambientPressure, e.altitude) / RHO_SL;
  const sm = smokiness(rhoR);
  // duct radius about 0.3 of the nozzle exit radius (E-1: ~16 cm)
  const rg = 0.3 * e.exitRadius;
  const st = startUp(e.sinceIgnition - 0.15);
  p.Rc = rg;
  // in thin air the turbine exhaust expands into a wide, faint fan
  p.Rbal = rg * (1.15 + 6 * (1 - sm));
  p.Lb = 0.8 + 4 * (1 - sm);
  p.spread = 0.085 + 0.12 * (1 - sm);
  p.y0 = 0;
  // in dense air the rich exhaust burns within ~10 m; in thin air it streams out much farther
  p.y1 = (11 + 32 * (1 - sm)) * (0.3 + 0.7 * st);
  p.steps = steps;
  p.seed = hashId(e.id) * 31 + 5;
  p.margin = 1.4;
  // fuel-rich, sooty and nearly black at the outlet, turning grey-brown as it mixes
  // (in thin air the fan is tenuous: nearly transparent, never a dark smudge over the plume)
  p.smokeSigma = (0.12 + 10 * sm) * e.throttle * st;
  p.smokeIn = [0, 0.3];
  p.smokeA.copy(COL.ggSoot);
  p.smokeB.copy(COL.ggSootB);
  // in dense air the rich exhaust afterburns in patches along its edge
  p.flameI = 1.6 * sm * e.throttle * st;
  p.flameSigma = 2.5;
  p.flameIn = [0.4, 1.2];
  p.flameLen = 8;
  p.flameA.copy(COL.ggFlameA);
  p.flameB.copy(COL.ggFlameB);
  p.turb = 0.75;
  p.flow = 60;
  p.noiseK = 0.9;
  p.radK = 2.0;
  p.endFade = p.y1 * 0.5;
}

/** Vacuum-type plume (kerosene vacuum engine, hypergolic engine): faint, very wide, fading fast. */
function vacuumPlume(e: EmitterSnap, p: VolumeParams, steps: number) {
  resetParams(p);
  const re = e.exitRadius;
  const D = 2 * re;
  const thr = e.throttle;
  const hyp = e.kind === 'hypergolic';
  const green = hyp ? 0 : greenFlash(e.sinceIgnition);
  const st = hyp ? smooth(0, 0.1, e.sinceIgnition) : startUp(e.sinceIgnition);
  const pr = pressureRatioAmb(e.kind, thr, e.ambientPressure);
  // in the upper atmosphere the plume is narrower (still ambient pressure), fully open in vacuum
  const open = smooth(3, 60, pr);
  const tanA = (hyp ? 0.36 : 0.5) * (0.35 + 0.65 * open);
  p.Rc = re;
  p.Rbal = re;
  p.Lb = 1;
  p.spread = tanA;
  p.y0 = -0.05;
  p.y1 = D * (hyp ? 12 : 13);
  p.steps = steps;
  p.seed = hashId(e.id) * 17;
  p.margin = 1.3;
  p.glowI = (hyp ? 0.6 : 0.75) * thr * st;
  p.glowDecay = D * (hyp ? 2.6 : 3.2);
  p.glowCore.copy(hyp ? COL.hypCore : COL.vacCore).lerp(COL.green, green * 0.8);
  p.glowRim.copy(hyp ? COL.hypRim : COL.vacRim);
  p.radK = 1.4;
  p.turb = 0.25;
  p.flow = 900;
  p.noiseK = 0.9;
  blob(p, 0.25 * D, 0.5 * D, 0.55 * re, (hyp ? 0.5 : 1.2) * thr * st, bcol(hyp ? COL.hypCore : COL.vacCore).lerp(COL.green, green));
  blob(p, 0.5 * D, 1.1 * D, 1.0 * re, 1.3 * green, bcol(COL.green));
  // exhaust products scattering sunlight (very faint)
  p.scatSigma = 0.05 * thr * st;
  p.scatAlb.copy(COL.envelope);
  p.endFade = p.y1 * 0.5;
}

function hashId(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

// ───────────────────────────── the plume set ─────────────────────────────

export interface FlameLight {
  /** Absolute position (frame I) and colour x intensity (point-light units). */
  pos: THREE.Vector3;
  col: THREE.Color;
  intensity: number;
}

const rel = new THREE.Vector3();
const up = new THREE.Vector3();

export class PlumeSet {
  readonly group = new THREE.Group();
  private vols: Volume[] = [];
  private used = 0;
  private shape = makeColumnShape();
  /** The brightest flame (lights the smoke, the vehicle and the pad) and a second one (trench). */
  lights: FlameLight[] = [
    { pos: new THREE.Vector3(), col: new THREE.Color(), intensity: 0 },
    { pos: new THREE.Vector3(), col: new THREE.Color(), intensity: 0 },
  ];
  /** View depth of the dominant plume (smoke farther than this draws before the plumes). */
  splitDepth = Infinity;

  /** Plume volumes drawn this frame. */
  get count(): number {
    return this.used;
  }

  private take(): Volume | null {
    if (this.used >= MAX_VOLUMES) return null;
    let v = this.vols[this.used];
    if (!v) {
      v = new Volume();
      this.vols.push(v);
      this.group.add(v.mesh);
    }
    this.used++;
    return v;
  }

  private put(v: Volume, pos: THREE.Vector3, dir: THREE.Vector3, origin: THREE.Vector3, light: VolumeLight, time: number, camFwd: THREE.Vector3) {
    rel.subVectors(pos, origin);
    up.copy(pos).normalize();
    const h = pos.length() - R_EARTH;
    v.place(rel, dir, up, h, light, time, camFwd);
  }

  update(emitters: EmitterSnap[], clusters: ClusterSnap[], origin: THREE.Vector3, light: VolumeLight, time: number, camFwd: THREE.Vector3, steps: number, flicker: (seed: number) => number) {
    this.used = 0;
    blobColN = 0;
    let best: ClusterSnap | null = null;
    let bestW = 0;
    this.lights[0].intensity = 0;
    this.lights[1].intensity = 0;
    this.splitDepth = Infinity;
    const only = plumeDebug.only;
    // 1. merged columns behind first-stage (or abort-motor) clusters: the dominant picture
    for (const c of clusters) {
      if (c.kind !== 'kerolox-sl' && c.kind !== 'solid') continue;
      const s = columnShape(c.kind, c.Rc, c.Req, c.throttle, c.ambientPressure, c.altitude, this.shape);
      if (only && only !== 'column') continue;
      const v = this.take();
      if (!v) break;
      column(c, s, v.p, steps);
      v.p.opacity = 0.85 + 0.15 * flicker(0.5);
      this.put(v, c.centroid, c.dir, origin, light, time, camFwd);
      const w = c.flow * s.lum;
      if (w <= bestW) continue;
      bestW = w;
      best = c;
      this.splitDepth = v.depth;
      // light from the flame on the vehicle, the pad and the smoke
      const L = this.lights[0];
      L.pos.copy(c.centroid).addScaledVector(c.dir, Math.min(14, s.flameLen * 0.3));
      L.col.setRGB(1.0, 0.56, 0.24);
      const since = startUp(c.sinceIgnition);
      L.intensity = (c.kind === 'solid' ? 1500 : 1150) * Math.min(1.3, c.flow / 1.97) * s.lum * (0.2 + 0.8 * since) * flicker(0.77) * (0.3 + 0.7 * Math.min(1, s.rhoRatio * 3 + 0.2));
      // the TEA-TEB igniter flash lights the pad green for a moment
      const g = c.kind === 'solid' ? 0 : greenFlash(c.sinceIgnition);
      if (g > 0) {
        L.col.lerp(GREEN_LIGHT, 0.9 * g);
        L.intensity = Math.max(L.intensity, 700 * g);
      }
      // exhaust flashing out of the flame trench while the vehicle is on or just above the mount
      const hN = c.centroid.length() - R_EARTH;
      const L2 = this.lights[1];
      L2.intensity = hN < 40 ? 520 * Math.min(1.2, c.flow / 1.97) * (1 - smooth(18, 40, hN)) * since * flicker(0.31) : 0;
      L2.col.setRGB(1.0, 0.58, 0.28);
    }
    // 2. per-nozzle cores (shock diamonds, ignition) and vacuum or hypergolic plumes. Cold-gas,
    // hydrazine and small hypergolic thrusters are drawn as puffs by the particles.
    for (const e of emitters) {
      if (e.throttle <= 0.003) continue;
      const k = e.kind;
      const core = k === 'kerolox-sl' || k === 'solid';
      const vac = k === 'kerolox-vac' || (k === 'hypergolic' && e.exitRadius >= SMALL_THRUSTER);
      if ((core && only && only !== 'core') || (vac && only && only !== 'vac') || (!core && !vac)) continue;
      const v = this.take();
      if (!v) break;
      const f = flicker(hashId(e.id));
      if (core) {
        engineCore(e, v.p, Math.max(8, Math.round(steps * 0.85)));
        v.p.opacity = f;
      } else {
        vacuumPlume(e, v.p, Math.max(8, Math.round(steps * 0.75)));
        v.p.opacity = 0.9 + 0.1 * f;
      }
      this.put(v, e.pos, e.dir, origin, light, time, camFwd);
    }
    // 3. gas-generator exhaust jets, while the volume budget lasts
    for (const e of emitters) {
      if (e.throttle <= 0.003 || !e.gg || (e.kind !== 'kerolox-sl' && e.kind !== 'kerolox-vac') || (only && only !== 'gg')) continue;
      const v = this.take();
      if (!v) break;
      ggJet(e, v.p, Math.max(8, Math.round(steps * 0.7)));
      this.put(v, e.gg.pos, e.gg.dir, origin, light, time, camFwd);
    }
    if (!best) {
      // no cluster: a vacuum engine still lights its surroundings faintly
      for (let i = 0; i < emitters.length; i++) {
        const e = emitters[i];
        if ((e.kind === 'kerolox-vac' || (e.kind === 'hypergolic' && e.exitRadius >= SMALL_THRUSTER)) && e.throttle > 0.01) {
          const L = this.lights[0];
          L.pos.copy(e.pos).addScaledVector(e.dir, e.exitRadius * 2);
          L.col.setRGB(1.0, 0.72, 0.5);
          L.intensity = (e.kind === 'hypergolic' ? 30 : 160) * e.throttle;
          const v = this.vols[0];
          if (v && this.used > 0) this.splitDepth = v.depth;
          break;
        }
      }
    }
    for (let i = this.used; i < this.vols.length; i++) this.vols[i].hide();
  }

  dispose() {
    for (const v of this.vols) v.dispose();
  }
}
