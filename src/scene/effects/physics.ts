/**
 * Physical models behind the exhaust effects (shared by the plume meshes and the particles so
 * the two always agree): nozzle exit conditions from isentropic flow, a standard-atmosphere
 * temperature profile, the plume's expansion with falling ambient pressure, and a light,
 * height-dependent wind. Values are illustrative but physically coherent with the K-1 dataset
 * (src/vehicle/spec.ts).
 */
import * as THREE from 'three';
import { E1, E1V } from '../../vehicle/spec';
import type { EmitterKind } from './input';

export const P_SL = 101325;

/** Hypergolic thrusters with a smaller exit radius (m) are attitude thrusters: puffs, no plume volume. */
export const SMALL_THRUSTER = 0.1;
export const RHO_SL = 1.225;
const R_AIR = 287.05;

// ───────────────────────────── nozzle flow ─────────────────────────────

/** Isentropic area ratio A/A* at Mach M. */
export function areaRatio(M: number, g: number): number {
  const t = (2 / (g + 1)) * (1 + ((g - 1) / 2) * M * M);
  return Math.pow(t, (g + 1) / (2 * (g - 1))) / M;
}

/** Supersonic exit Mach number for an expansion ratio (Newton iteration on the area-Mach relation). */
export function exitMach(eps: number, g: number): number {
  let M = 1.5 + Math.log(eps);
  for (let i = 0; i < 60; i++) {
    const h = 1e-5;
    const f = areaRatio(M, g) - eps;
    const df = (areaRatio(M + h, g) - areaRatio(M - h, g)) / (2 * h);
    const step = f / df;
    M = Math.max(1.001, M - step);
    if (Math.abs(step) < 1e-10) break;
  }
  return M;
}

/** Static-to-chamber pressure ratio at Mach M. */
export function pressureRatio(M: number, g: number): number {
  return Math.pow(1 + ((g - 1) / 2) * M * M, -g / (g - 1));
}

interface NozzleGas {
  /** Chamber pressure (Pa), expansion ratio, ratio of specific heats. */
  pc: number;
  eps: number;
  gamma: number;
}

/** Nozzle conditions per emitter kind. E-1/E-1V from the vehicle dataset; the rest illustrative. */
const NOZZLES: Record<EmitterKind, NozzleGas> = {
  'kerolox-sl': { pc: E1.chamberPressure, eps: E1.expansionRatio, gamma: 1.22 },
  'kerolox-vac': { pc: E1V.chamberPressure, eps: E1V.expansionRatio, gamma: 1.22 },
  hypergolic: { pc: 0.9e6, eps: 150, gamma: 1.25 },
  solid: { pc: 7e6, eps: 6, gamma: 1.18 },
  'cold-gas': { pc: 1.2e6, eps: 40, gamma: 1.4 },
  mono: { pc: 1.5e6, eps: 50, gamma: 1.3 },
};

/** Exit static pressure (Pa) at full throttle, per kind (E-1: about 69 kPa, slightly over-expanded at sea level). */
export const EXIT_PRESSURE: Record<EmitterKind, number> = Object.fromEntries(
  (Object.keys(NOZZLES) as EmitterKind[]).map((k) => {
    const n = NOZZLES[k];
    return [k, n.pc * pressureRatio(exitMach(n.eps, n.gamma), n.gamma)];
  }),
) as Record<EmitterKind, number>;

/** Exit-to-ambient pressure ratio (exit pressure scales with chamber pressure, i.e. throttle). */
export function pressureRatioAmb(kind: EmitterKind, throttle: number, ambient: number): number {
  return (EXIT_PRESSURE[kind] * Math.max(0.05, throttle)) / Math.max(ambient, 1e-3);
}

// ───────────────────────────── atmosphere ─────────────────────────────

/** US Standard Atmosphere 1976 temperature (K) by geometric altitude (m), to 86 km then flat. */
export function airTemperature(alt: number): number {
  const h = alt / 1000;
  if (h < 11) return 288.15 - 6.5 * Math.max(h, -0.5);
  if (h < 20) return 216.65;
  if (h < 32) return 216.65 + (h - 20);
  if (h < 47) return 228.65 + 2.8 * (h - 32);
  if (h < 51) return 270.65;
  if (h < 71) return 270.65 - 2.8 * (h - 51);
  if (h < 86) return 214.65 - 2.0 * (h - 71);
  return 186.87;
}

/** Air density (kg/m^3) from the ambient pressure the emitter reports and its altitude. */
export function airDensity(pressure: number, alt: number): number {
  return Math.max(0, pressure) / (R_AIR * airTemperature(alt));
}

/**
 * How much visible smoke a kerosene or solid exhaust leaves in air of this density
 * (1 at sea level, about 0.5 at 10 km, 0.1 near 30 km, vanishing above about 50 km).
 */
export function smokiness(rhoRatio: number): number {
  const x = Math.max(rhoRatio, 1e-9);
  const v = (Math.log10(x) + 3.4) / 3.4; // 0 at rho/rho0 = 4e-4 (~50 km), 1 at sea level
  return Math.min(1, Math.max(0, v)) ** 1.6;
}

// ───────────────────────────── wind ─────────────────────────────

/**
 * Illustrative wind profile [height m, toward-east m/s, toward-north m/s]: a light sea breeze
 * from the south-east at the pad, veering to strong westerlies near the tropopause (a jet
 * stream core near 11-12 km), weak in the stratosphere.
 */
const WIND: [number, number, number][] = [
  [0, -2.4, 2.8],
  [300, -3.0, 3.4],
  [1500, -1.2, 4.2],
  [4000, 5.5, 3.0],
  [8000, 17, 2.0],
  [11500, 29, 0],
  [15000, 17, -2.5],
  [20000, 6, -1.5],
  [30000, -4, 0.5],
  [45000, 7, 2],
  [60000, 12, 0],
  [90000, 0, 0],
];

/** Wind at a height as a pad-local vector (x east, y up = 0, z south). */
export function windAt(h: number, out: THREE.Vector3): THREE.Vector3 {
  const n = WIND.length;
  if (h <= WIND[0][0]) return out.set(WIND[0][1], 0, -WIND[0][2]);
  if (h >= WIND[n - 1][0]) return out.set(0, 0, 0);
  let i = 0;
  while (i < n - 2 && WIND[i + 1][0] < h) i++;
  const a = WIND[i];
  const b = WIND[i + 1];
  const u = (h - a[0]) / (b[0] - a[0]);
  const s = u * u * (3 - 2 * u);
  return out.set(a[1] + (b[1] - a[1]) * s, 0, -(a[2] + (b[2] - a[2]) * s));
}

// ───────────────────────────── plume shape ─────────────────────────────

/**
 * The merged exhaust column behind a cluster of engines (or one engine), as a function of the
 * ambient pressure and throttle. Used by the column mesh and by the smoke particles, which
 * start where the column ends.
 */
export interface ColumnShape {
  kind: EmitterKind;
  /** Radius enclosing the cluster's nozzle exits (m). */
  Rc: number;
  /** Radius of one nozzle with the cluster's total exit area (m). */
  Req: number;
  throttle: number;
  /** Exit-to-ambient pressure ratio (> 1: under-expanded, the plume balloons). */
  pr: number;
  rhoRatio: number;
  /** Radius the under-expanded plume grows to, and the length over which it does so (m). */
  Rbal: number;
  Lb: number;
  /** Turbulent mixing growth of the radius per metre. */
  spread: number;
  /** Drawn length (m), luminous flame length, start of the smoky tail. */
  L: number;
  flameLen: number;
  smokeStart: number;
  /** Luminosity factor (afterburning of the fuel-rich exhaust in air, soot glow). */
  lum: number;
  /** Visible smoke factor (0 in vacuum). */
  smoke: number;
  /** Where the smoke particles take over (m downstream) and the jet speed there (m/s, air frame). */
  handoff: number;
  uJet: number;
}

export const makeColumnShape = (): ColumnShape => ({
  kind: 'kerolox-sl',
  Rc: 1,
  Req: 1,
  throttle: 1,
  pr: 1,
  rhoRatio: 1,
  Rbal: 1,
  Lb: 1,
  spread: 0.08,
  L: 60,
  flameLen: 40,
  smokeStart: 30,
  lum: 1,
  smoke: 1,
  handoff: 40,
  uJet: 200,
});

export function columnShape(kind: EmitterKind, Rc: number, Req: number, throttle: number, ambient: number, alt: number, out: ColumnShape): ColumnShape {
  const thr = Math.max(0.02, throttle);
  const pr = pressureRatioAmb(kind, thr, ambient);
  const rhoRatio = airDensity(ambient, alt) / RHO_SL;
  out.kind = kind;
  out.Rc = Rc;
  out.Req = Req;
  out.throttle = thr;
  out.pr = pr;
  out.rhoRatio = rhoRatio;
  const sq = Math.sqrt(thr);
  if (kind === 'solid') {
    // aluminised solid motor: short, very bright flame, dense white alumina smoke
    out.Rbal = Math.max(Rc, Req * 0.9 * Math.sqrt(Math.max(1, pr)));
    out.Rbal = Math.min(out.Rbal, 250);
    out.Lb = 0.9 * out.Rbal + 1;
    out.spread = 0.1;
    out.flameLen = 16 * sq;
    out.L = Math.max(34 * sq, 4 * out.Rbal);
    out.smokeStart = 5;
    out.lum = 1;
    out.smoke = smokiness(rhoRatio);
    out.handoff = out.L * 0.6;
    out.uJet = 260 * sq;
    return out;
  }
  // kerosene: over-expanded at sea level (pr < 1: slight necking), ballooning above ~5 km
  const bal = pr > 1 ? Req * 0.9 * Math.sqrt(pr) : Req * (0.93 + 0.07 * pr);
  out.Rbal = Math.min(Math.max(Rc * (pr > 1 ? 1 : 0.97), bal), 380);
  out.Lb = 0.9 * out.Rbal + 2;
  const thick = Math.min(1, rhoRatio * 3);
  out.spread = 0.05 + 0.035 * thick;
  // luminous afterburning flame about one vehicle length long at sea level
  out.flameLen = 66 * sq * (0.55 + 0.45 * thick);
  out.L = Math.max(96 * sq, 4.6 * out.Rbal);
  out.smokeStart = 30 * sq;
  out.lum = 0.5 + 0.5 * Math.min(1, rhoRatio * 4);
  out.smoke = kind === 'kerolox-sl' ? smokiness(rhoRatio) : 0;
  out.handoff = Math.min(out.L * 0.72, 64 * sq + 0.4 * out.Rbal);
  out.uJet = 210 * sq;
  return out;
}

/** Column radius at y metres downstream of the nozzle exit plane. */
export function columnRadius(s: ColumnShape, y: number): number {
  const yy = Math.max(0, y);
  return s.Rc + (s.Rbal - s.Rc) * (1 - Math.exp(-yy / s.Lb)) + yy * s.spread;
}

/** Drag time constant (s) with which exhaust gas slows to the surrounding air. */
export function mixingTau(rhoRatio: number): number {
  return Math.min(40, 0.45 / Math.sqrt(Math.max(rhoRatio, 1e-6)));
}
