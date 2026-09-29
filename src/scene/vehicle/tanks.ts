/**
 * Propellant tank geometry as pure math (no three.js scene objects): the liquid region of each
 * tank in the (r, y) half-plane, its volume as a function of the free-surface height, the
 * inversion from "usable fraction left" to a free-surface height (3 % ullage at full load, as
 * in spec.ts), the liquid cross-section polygon for the cutaway, and centroids for the centre
 * of mass. All from STATIONS / BODY_RADIUS / DOME_HEIGHT.
 */
import { BODY_RADIUS as R, DOME_HEIGHT as H, STATIONS as S } from '../../vehicle/spec';

export type TankId = 's1Rp1' | 's1Lox' | 's2Rp1' | 's2Lox';
export type P2 = [number, number];

/** Wall build-up used by the geometry (m). */
export const WALL = {
  skin: 0.005,
  rib: 0.025, // orthogrid rib depth inside the skin
  ribW: 0.006,
  dome: 0.0045,
  land: 0.02, // weld land thickness at the dome/barrel joints
  /** Radius of the dome outer surface (it meets the inside of the ribs at the Y-ring). */
  domeA: R - 0.03,
  /** Common bulkhead: skin + insulating honeycomb core + skin. */
  cbSkin: 0.003,
  cbCore: 0.05,
  /** LOX downcomer (first stage) outer radius, and the small upper-stage LOX feed tunnel. */
  downcomer: 0.25,
  s2Tunnel: 0.12,
};

const CB_T = WALL.cbSkin * 2 + WALL.cbCore;

function ell(a: number, b: number, yEq: number, dir: 1 | -1, r: number): number {
  const q = Math.min(1, r / a);
  return yEq + dir * b * Math.sqrt(Math.max(0, 1 - q * q));
}

export interface TankDef {
  id: TankId;
  prop: 'lox' | 'rp1';
  /** Radial extent of the liquid (inside the ribs). */
  rWall: number;
  /** Inner radius (a pipe through the tank) or 0. */
  rIn: number;
  floor(r: number): number;
  ceil(r: number): number;
  yMin: number;
  yMax: number;
}

const a = WALL.domeA - WALL.dome; // dome inner surface semi-axis (horizontal)
const b = H - WALL.dome; // (vertical)
const rWall = R - WALL.skin - WALL.rib - 0.002;

export const TANKS: Record<TankId, TankDef> = {
  s1Rp1: {
    id: 's1Rp1',
    prop: 'rp1',
    rWall,
    rIn: WALL.downcomer + 0.01,
    floor: (r) => ell(a, b, S.s1FuelAftEquator, -1, r),
    ceil: (r) => ell(a, b, S.s1FuelFwdEquator, 1, r),
    yMin: S.s1FuelAftApex,
    yMax: S.s1FuelFwdApex,
  },
  s1Lox: {
    id: 's1Lox',
    prop: 'lox',
    rWall,
    rIn: 0,
    floor: (r) => ell(a, b, S.s1LoxAftEquator, -1, r),
    ceil: (r) => ell(a, b, S.s1LoxFwdEquator, 1, r),
    yMin: S.s1LoxAftApex,
    yMax: S.s1LoxFwdApex,
  },
  s2Rp1: {
    id: 's2Rp1',
    prop: 'rp1',
    rWall,
    rIn: WALL.s2Tunnel + 0.01,
    floor: (r) => ell(a, b, S.s2FuelAftEquator, -1, r),
    // bottom (RP-1 side) surface of the common bulkhead, bulging down
    ceil: (r) => ell(WALL.domeA, H, S.s2CommonBulkheadEquator, -1, r),
    yMin: S.s2FuelAftApex,
    yMax: S.s2CommonBulkheadEquator,
  },
  s2Lox: {
    id: 's2Lox',
    prop: 'lox',
    rWall,
    rIn: 0,
    // top (LOX side) surface of the common bulkhead
    floor: (r) => ell(WALL.domeA - CB_T, H - CB_T, S.s2CommonBulkheadEquator, -1, r),
    ceil: (r) => ell(a, b, S.s2LoxFwdEquator, 1, r),
    yMin: S.s2CommonBulkheadApex + CB_T,
    yMax: S.s2LoxFwdApex,
  },
};

const NR = 240;

function radii(t: TankDef): number[] {
  // denser toward the wall where the domes are steep
  const out: number[] = [];
  for (let i = 0; i <= NR; i++) {
    const u = i / NR;
    out.push(t.rIn + (t.rWall - t.rIn) * Math.sin((u * Math.PI) / 2));
  }
  return out;
}

const radiiCache = new Map<TankId, number[]>();
function rs(t: TankDef) {
  let r = radiiCache.get(t.id);
  if (!r) radiiCache.set(t.id, (r = radii(t)));
  return r;
}

/** Liquid volume (m^3) with the free surface at height h. */
export function volumeAt(t: TankDef, h: number): number {
  const r = rs(t);
  let v = 0;
  for (let i = 0; i < r.length - 1; i++) {
    const rm = (r[i] + r[i + 1]) / 2;
    const dr = r[i + 1] - r[i];
    const col = Math.min(h, t.ceil(rm)) - t.floor(rm);
    if (col > 0) v += 2 * Math.PI * rm * dr * col;
  }
  return v;
}

const volCache = new Map<TankId, number>();
/** Total internal volume of the liquid region (m^3). */
export function tankVolumeOf(t: TankDef): number {
  let v = volCache.get(t.id);
  if (v === undefined) volCache.set(t.id, (v = volumeAt(t, t.yMax + 0.01)));
  return v;
}

/** Free-surface height for a usable fraction left (1 = full load, 3 % ullage). */
export function levelHeight(t: TankDef, frac: number): number {
  const f = Math.max(0, Math.min(1, frac));
  const want = f * 0.97 * tankVolumeOf(t);
  let lo = t.yMin;
  let hi = t.yMax;
  for (let k = 0; k < 44; k++) {
    const m = (lo + hi) / 2;
    if (volumeAt(t, m) < want) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

/** Centroid height of the liquid at free-surface height h. */
export function centroidAt(t: TankDef, h: number): number {
  const r = rs(t);
  let v = 0;
  let m = 0;
  for (let i = 0; i < r.length - 1; i++) {
    const rm = (r[i] + r[i + 1]) / 2;
    const dr = r[i + 1] - r[i];
    const top = Math.min(h, t.ceil(rm));
    const bot = t.floor(rm);
    if (top > bot) {
      const w = 2 * Math.PI * rm * dr;
      v += w * (top - bot);
      m += (w * (top * top - bot * bot)) / 2;
    }
  }
  return v > 0 ? m / v : h;
}

/**
 * Closed CCW polygon of the liquid cross-section (r, y) at free-surface height h:
 * bottom chain outward, then the top (flat free surface, or the ceiling where it is lower)
 * back inward. Empty if there is no liquid.
 */
export function liquidPoly(t: TankDef, h: number, n = 72): P2[] {
  const rr: number[] = [];
  for (let i = 0; i <= n; i++) rr.push(t.rIn + (t.rWall - t.rIn) * Math.sin(((i / n) * Math.PI) / 2));
  const col = (r: number) => Math.min(h, t.ceil(r)) - t.floor(r);
  const bottom: P2[] = [];
  const top: P2[] = [];
  let prevOk = false;
  for (let i = 0; i < rr.length; i++) {
    const r = rr[i];
    const c = col(r);
    const ok = c > 1e-4;
    if (i > 0 && ok !== prevOk) {
      // exact crossing between rr[i-1] and r
      let lo = rr[i - 1];
      let hi = r;
      for (let k = 0; k < 30; k++) {
        const m = (lo + hi) / 2;
        if (col(m) > 1e-4 === prevOk) lo = m;
        else hi = m;
      }
      const rx = (lo + hi) / 2;
      const yx = t.floor(rx);
      bottom.push([rx, yx]);
      top.push([rx, yx + 1e-4]);
    }
    if (ok) {
      bottom.push([r, t.floor(r)]);
      top.push([r, t.floor(r) + c]);
    }
    prevOk = ok;
  }
  if (bottom.length < 2) return [];
  // merge near-duplicates
  const poly: P2[] = [...bottom, ...top.reverse()];
  const out: P2[] = [];
  for (const p of poly) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-5) out.push(p);
  }
  return out;
}
