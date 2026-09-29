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
import { airDensity, columnShape, makeColumnShape, pressureRatioAmb, RHO_SL, smokiness, type ColumnShape } from './physics';
import { resetParams, Volume, type VolumeLight, type VolumeParams } from './volume';

const C = (r: number, g: number, b: number) => new THREE.Color(r, g, b);

/**
 * Emission colours are linear and saturated on purpose: flames go through a per-channel
 * exposure curve (fxFlame in glsl.ts), so brightness shifts them from red through orange and
 * yellow toward white, as on film. Absorbing and scattering colours are albedos.
 */
const COL = {
  core: C(1.0, 0.62, 0.24),
  diamond: C(1.0, 0.86, 0.62),
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
  hypCore: C(1.0, 0.5, 0.42),
  hypRim: C(1.0, 0.44, 0.52),
  solidCore: C(1.0, 0.8, 0.55),
  solidA: C(1.0, 0.62, 0.26),
  solidB: C(1.0, 0.34, 0.08),
  solidSmokeA: C(0.84, 0.82, 0.78),
  solidSmokeB: C(0.9, 0.89, 0.87),
  ggSoot: C(0.045, 0.04, 0.035),
  ggSootB: C(0.14, 0.13, 0.12),
  ggFlameA: C(1.0, 0.34, 0.07),
  ggFlameB: C(0.9, 0.16, 0.02),
  cold: C(0.96, 0.97, 1.0),
  mono: C(0.92, 0.9, 0.85),
  none: C(0, 0, 0),
};

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** TEA-TEB (pyrophoric igniter) flash: bright green at the nozzle for the first ~0.5 s. */
/** Development switch: draw only one kind of plume volume ('core', 'column', 'gg', 'vac', 'cold'). */
export const plumeDebug = { only: null as string | null };

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
  const coreCol = bcol(solid ? COL.solidCore : COL.core).lerp(COL.green, green * 0.7);
  const rCore = re * 0.6 * Math.sqrt(p.Rbal / re);
  const coreI = (solid ? 16 : 3.6) * thr * st;
  blob(p, Lcore * 0.1, Lcore * 0.3, rCore, coreI, coreCol);
  blob(p, Lcore * 0.55, Lcore * 0.34, rCore * 0.8, coreI * 0.55, bcol(coreCol));
  // shock diamonds: Mach disks in the over- or near-ideally-expanded jet, fading as it balloons
  const vis = Math.exp(-(ln * ln) / 3) * (solid ? 0.35 : 1) * st;
  const s = D * 0.95 * Math.max(0.85, Math.sqrt(Math.max(pr, 0.5)));
  for (let n = 0; n < 5; n++) {
    const y = s * (0.62 + n);
    if (y > Lcore * 1.5) break;
    blob(p, y, 0.11 * s, re * (0.42 - 0.035 * n), 26 * thr * vis * Math.pow(0.72, n), bcol(COL.diamond).lerp(COL.green, green * 0.8));
  }
  // TEA-TEB: the pyrophoric igniter burns bright green at the exit for a fraction of a second
  blob(p, 0.6 * D, 1.2 * D, 1.1 * re, 2.6 * green, bcol(COL.green));
  // flame envelope around the core
  p.flameI = (solid ? 5 : 1.5) * thr * lumAir * (0.3 + 0.7 * st);
  p.flameSigma = solid ? 2.5 : 0.9;
  p.flameIn = [0.15 * D, 1.1 * D];
  p.flameLen = Lcore * 1.4;
  p.flameA.copy(solid ? COL.solidA : COL.flameA).lerp(COL.green, green * 0.8);
  p.flameB.copy(solid ? COL.solidB : COL.flameB);
  p.turb = 0.5;
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
  p.flameI = (solid ? 4 : 2.4) * s.lum * sq * st;
  p.flameSigma = (solid ? 2 : 1.1) * (0.4 + 0.6 * Math.min(1, s.rhoRatio * 3));
  p.flameIn = [1.2, solid ? 2 : 6];
  p.flameLen = s.flameLen * (0.4 + 0.6 * st);
  p.flameA.copy(solid ? COL.solidA : COL.colFlameA);
  p.flameB.copy(solid ? COL.solidB : COL.colFlameB);
  p.turb = 0.95;
  p.flow = 150;
  p.noiseK = 1.5;
  p.radK = 2.6;
  // sooty tail (thins with altitude) handing over to the smoke particles
  p.smokeSigma = (solid ? 0.5 : 0.42) * s.smoke * st;
  p.smokeIn = solid ? [s.smokeStart, s.smokeStart + 8] : [4, s.smokeStart + 14];
  p.sootOuter = solid ? 0 : 0.75;
  p.smokeA.copy(solid ? COL.solidSmokeA : COL.sootA);
  p.smokeB.copy(solid ? COL.solidSmokeB : COL.sootB);
  // the under-expanded plume at altitude: sunlit translucent envelope with an orange glow near the nozzles
  const wbal = smooth(1.6, 14, s.pr);
  p.scatSigma = 0.55 * wbal * sq;
  p.scatAlb.copy(COL.envelope);
  p.glowI = 1.4 * wbal * sq * st * (solid ? 2 : 1);
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
  const rg = 0.12 * (e.exitRadius / 0.53);
  const st = startUp(e.sinceIgnition - 0.15);
  p.Rc = rg;
  p.Rbal = rg * (1 + 5 * (1 - sm));
  p.Lb = 1.5 + 4 * (1 - sm);
  p.spread = 0.07 + 0.12 * (1 - sm);
  p.y0 = 0;
  p.y1 = (13 + 26 * (1 - sm)) * (0.3 + 0.7 * st);
  p.steps = steps;
  p.seed = hashId(e.id) * 31 + 5;
  p.margin = 1.4;
  p.smokeSigma = (0.8 + 6 * sm) * e.throttle * st;
  p.smokeIn = [0, 0.4];
  p.smokeA.copy(COL.ggSoot);
  p.smokeB.copy(COL.ggSootB);
  p.flameI = 1.6 * sm * e.throttle * st;
  p.flameSigma = 3;
  p.flameIn = [0, 0.25];
  p.flameLen = 2.2;
  p.flameA.copy(COL.ggFlameA);
  p.flameB.copy(COL.ggFlameB);
  p.turb = 0.6;
  p.flow = 60;
  p.noiseK = 0.8;
  p.radK = 2.2;
  p.endFade = p.y1 * 0.45;
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
  p.glowI = (hyp ? 0.9 : 1.2) * thr * st;
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

/** Cold-gas (nitrogen) or hydrazine thruster jet: visible only by scattered sunlight. */
function coldJet(e: EmitterSnap, p: VolumeParams, steps: number) {
  resetParams(p);
  const re = Math.max(0.02, e.exitRadius);
  const mono = e.kind === 'mono';
  p.Rc = re;
  p.Rbal = re;
  p.Lb = 1;
  p.spread = mono ? 0.3 : 0.34;
  p.y0 = 0;
  p.y1 = (mono ? 18 : 40) * re + (mono ? 0.4 : 1.6);
  p.steps = steps;
  p.seed = hashId(e.id) * 7;
  p.margin = 1.3;
  p.scatSigma = (mono ? 3 : 14) * e.throttle;
  p.scatAlb.copy(mono ? COL.mono : COL.cold);
  p.radK = 1.8;
  p.turb = 0.4;
  p.flow = 60;
  p.noiseK = 1.1;
  p.endFade = p.y1 * 0.6;
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

  private take(): Volume {
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
    for (const e of emitters) {
      if (e.throttle <= 0.003) continue;
      const k = e.kind;
      const f = flicker(hashId(e.id));
      const only = plumeDebug.only;
      if ((k === 'kerolox-sl' || k === 'solid') && (!only || only === 'core')) {
        const v = this.take();
        engineCore(e, v.p, Math.max(8, Math.round(steps * 0.85)));
        v.p.opacity = f;
        this.put(v, e.pos, e.dir, origin, light, time, camFwd);
      } else if ((k === 'kerolox-vac' || k === 'hypergolic') && (!only || only === 'vac')) {
        const v = this.take();
        vacuumPlume(e, v.p, Math.max(8, Math.round(steps * 0.75)));
        v.p.opacity = 0.9 + 0.1 * f;
        this.put(v, e.pos, e.dir, origin, light, time, camFwd);
      } else if ((k === 'cold-gas' || k === 'mono') && (!only || only === 'cold')) {
        const v = this.take();
        coldJet(e, v.p, 8);
        this.put(v, e.pos, e.dir, origin, light, time, camFwd);
      }
      if (e.gg && (k === 'kerolox-sl' || k === 'kerolox-vac') && (!only || only === 'gg')) {
        const v = this.take();
        ggJet(e, v.p, Math.max(8, Math.round(steps * 0.7)));
        this.put(v, e.gg.pos, e.gg.dir, origin, light, time, camFwd);
      }
    }
    for (const c of clusters) {
      if (c.kind !== 'kerolox-sl' && c.kind !== 'solid') continue;
      const s = columnShape(c.kind, c.Rc, c.Req, c.throttle, c.ambientPressure, c.altitude, this.shape);
      if (plumeDebug.only && plumeDebug.only !== 'column') continue;
      const v = this.take();
      column(c, s, v.p, steps);
      v.p.opacity = 0.85 + 0.15 * flicker(0.5);
      this.put(v, c.centroid, c.dir, origin, light, time, camFwd);
      const w = c.flow * s.lum;
      if (w > bestW) {
        bestW = w;
        best = c;
        this.splitDepth = v.depth;
      }
      // light from the flame on the vehicle, the pad and the smoke
      if (best === c) {
        const L = this.lights[0];
        L.pos.copy(c.centroid).addScaledVector(c.dir, Math.min(14, s.flameLen * 0.3));
        L.col.setRGB(1.0, 0.56, 0.24);
        const since = startUp(c.sinceIgnition);
        L.intensity = (c.kind === 'solid' ? 1500 : 1150) * Math.min(1.3, c.flow / 1.97) * s.lum * (0.2 + 0.8 * since) * flicker(0.77) * (0.3 + 0.7 * Math.min(1, s.rhoRatio * 3 + 0.2));
        // exhaust flashing out of the flame trench while the vehicle is on or just above the mount
        const hN = c.centroid.length() - R_EARTH;
        if (hN < 40) {
          const L2 = this.lights[1];
          L2.intensity = 520 * Math.min(1.2, c.flow / 1.97) * (1 - smooth(18, 40, hN)) * since * flicker(0.31);
          L2.col.setRGB(1.0, 0.58, 0.28);
        }
      }
    }
    if (!best) {
      // no cluster: a vacuum engine still lights its surroundings faintly
      this.splitDepth = Infinity;
      for (const e of emitters) {
        if ((e.kind === 'kerolox-vac' || e.kind === 'hypergolic') && e.throttle > 0.01) {
          const L = this.lights[0];
          L.pos.copy(e.pos).addScaledVector(e.dir, e.exitRadius * 2);
          L.col.setRGB(1.0, 0.72, 0.5);
          L.intensity = (e.kind === 'hypergolic' ? 30 : 160) * e.throttle;
          const v = this.vols[0];
          if (v) this.splitDepth = v.depth;
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
