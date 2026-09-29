/**
 * Thrust chamber and nozzle contour (pure math, no three.js).
 *
 * Coordinates: x is the axial distance DOWNSTREAM of the throat (x < 0 in the chamber,
 * x > 0 in the nozzle), r the local radius of the gas-side (inner) wall. The engine frame
 * maps it to y = throatY - x.
 *
 * Chamber: cylinder of radius rc, a blend arc (r1) into a straight converging cone of
 * half-angle thetaC, and the upstream throat arc (r2 = 1.5 rt). Its length is chosen from a
 * characteristic length L* (chamber volume / throat area), the usual first sizing rule.
 *
 * Nozzle: the downstream throat arc (r3 = 0.382 rt) turns the wall to the initial angle
 * thetaN, then a quadratic Bezier (Rao's thrust-optimised parabola approximation) runs to the
 * exit with the exit angle thetaE. The two angles come from the bell length expressed as a
 * fraction of the equivalent 15 degree cone (Rao's design charts, smoothed).
 */

export interface ContourInput {
  /** Throat radius (m). */
  rt: number;
  /** Chamber radius (m). */
  rc: number;
  /** Exit radius (m). */
  re: number;
  /** Characteristic length L* (m). */
  lStar: number;
  /** Axial length from the throat to the exit plane (m). */
  nozzleLength: number;
  /** Converging half-angle (rad). */
  thetaC?: number;
}

export interface Contour {
  /** Dense polyline (x, r) from the injector face (first) to the exit (last). */
  pts: [number, number][];
  rt: number;
  rc: number;
  re: number;
  /** x of the injector face (negative). */
  xInj: number;
  /** x where the cylinder ends and the convergence starts. */
  xCylEnd: number;
  xExit: number;
  /** Cylindrical length (m). */
  lCyl: number;
  /** Initial and exit wall angles of the bell (rad). */
  thetaN: number;
  thetaE: number;
  /** Bell length as a fraction of the equivalent 15 degree cone. */
  bellFraction: number;
  /** Chamber volume injector to throat (m^3). */
  chamberVolume: number;
}

const DEG = Math.PI / 180;

/** Bell initial and exit angles from the length fraction (Rao charts, eps 15-100, smoothed). */
export function raoAngles(fraction: number): { thetaN: number; thetaE: number } {
  const f = Math.max(0.6, fraction);
  const thetaN = Math.max(15, 40 - 20 * ((f - 0.6) / 0.4)) * DEG;
  const thetaE = Math.max(2.5, 14 - 10 * ((f - 0.6) / 0.4)) * DEG;
  return { thetaN, thetaE };
}

/** Length of the equivalent 15 degree conical nozzle (throat to exit). */
export function cone15Length(rt: number, re: number): number {
  const r3 = 0.382 * rt;
  return (re - rt + r3 * (1 / Math.cos(15 * DEG) - 1)) / Math.tan(15 * DEG);
}

export function buildContour(inp: ContourInput): Contour {
  const { rt, rc, re, lStar, nozzleLength } = inp;
  const thetaC = inp.thetaC ?? 30 * DEG;
  const r1 = 0.9 * rc; // chamber-to-cone blend radius
  const r2 = 1.5 * rt; // upstream throat radius
  const r3 = 0.382 * rt; // downstream throat radius

  // upstream throat arc: centre (0, rt + r2), angles 0..thetaC going upstream (x < 0)
  const p2x = -r2 * Math.sin(thetaC);
  const p2r = rt + r2 * (1 - Math.cos(thetaC));
  // chamber blend arc end radius
  const p1r = rc - r1 * (1 - Math.cos(thetaC));
  const dx = (p1r - p2r) / Math.tan(thetaC);
  const p1x = p2x - dx;
  const xCylEnd = p1x - r1 * Math.sin(thetaC);

  // converging volume (numerical)
  const conv: [number, number][] = [];
  for (let i = 0; i <= 16; i++) {
    const a = (thetaC * i) / 16;
    conv.push([xCylEnd + r1 * Math.sin(a), rc - r1 * (1 - Math.cos(a))]);
  }
  for (let i = 0; i <= 24; i++) {
    const a = thetaC * (1 - i / 24);
    conv.push([-r2 * Math.sin(a), rt + r2 * (1 - Math.cos(a))]);
  }
  let vConv = 0;
  for (let i = 1; i < conv.length; i++) {
    const [xa, ra] = conv[i - 1];
    const [xb, rb] = conv[i];
    vConv += (Math.PI / 3) * (xb - xa) * (ra * ra + ra * rb + rb * rb);
  }
  const at = Math.PI * rt * rt;
  const lCyl = Math.max(0.02, (lStar * at - vConv) / (Math.PI * rc * rc));
  const xInj = xCylEnd - lCyl;

  // bell
  const bellFraction = nozzleLength / cone15Length(rt, re);
  const { thetaN, thetaE } = raoAngles(bellFraction);
  const nx = r3 * Math.sin(thetaN);
  const nr = rt + r3 * (1 - Math.cos(thetaN));
  const ex = nozzleLength;
  const er = re;
  const tn = Math.tan(thetaN);
  const te = Math.tan(thetaE);
  let qx = (er - nr + nx * tn - ex * te) / (tn - te);
  qx = Math.min(ex - 1e-3, Math.max(nx + 1e-3, qx));
  const qr = nr + tn * (qx - nx);

  const pts: [number, number][] = [];
  pts.push([xInj, rc]);
  for (const p of conv) pts.push(p);
  // downstream throat arc
  for (let i = 1; i <= 12; i++) {
    const a = (thetaN * i) / 12;
    pts.push([r3 * Math.sin(a), rt + r3 * (1 - Math.cos(a))]);
  }
  // Bezier N -> Q -> E, denser near the throat where curvature is highest
  const nb = 72;
  for (let i = 1; i <= nb; i++) {
    const s = i / nb;
    const t = Math.pow(s, 1.3); // denser near the throat
    const u = 1 - t;
    pts.push([u * u * nx + 2 * u * t * qx + t * t * ex, u * u * nr + 2 * u * t * qr + t * t * er]);
  }
  // dedupe consecutive near-identical points
  const clean: [number, number][] = [];
  for (const p of pts) {
    const q = clean[clean.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-5) clean.push(p);
  }
  return {
    pts: clean,
    rt,
    rc,
    re,
    xInj,
    xCylEnd,
    xExit: ex,
    lCyl,
    thetaN,
    thetaE,
    bellFraction,
    chamberVolume: vConv + Math.PI * rc * rc * lCyl,
  };
}

/** Wall radius at axial position x (linear interpolation on the dense polyline). */
export function radiusAt(c: Contour, x: number): number {
  const p = c.pts;
  if (x <= p[0][0]) return p[0][1];
  if (x >= p[p.length - 1][0]) return p[p.length - 1][1];
  let lo = 0;
  let hi = p.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (p[m][0] <= x) lo = m;
    else hi = m;
  }
  const [xa, ra] = p[lo];
  const [xb, rb] = p[hi];
  return ra + ((rb - ra) * (x - xa)) / Math.max(1e-9, xb - xa);
}

/** Axial position (x >= 0, in the nozzle) where the wall reaches radius r. */
export function xAtRadius(c: Contour, r: number): number {
  const p = c.pts;
  for (let i = 1; i < p.length; i++) {
    if (p[i][0] < 0) continue;
    if (p[i][1] >= r) {
      const [xa, ra] = p[i - 1];
      const [xb, rb] = p[i];
      return xa + ((xb - xa) * (r - ra)) / Math.max(1e-9, rb - ra);
    }
  }
  return c.xExit;
}

/** Sub-polyline between x0 and x1 (inclusive, with interpolated end points). */
export function contourSlice(c: Contour, x0: number, x1: number): [number, number][] {
  const out: [number, number][] = [[x0, radiusAt(c, x0)]];
  for (const p of c.pts) if (p[0] > x0 + 1e-6 && p[0] < x1 - 1e-6) out.push([p[0], p[1]]);
  out.push([x1, radiusAt(c, x1)]);
  return out;
}

/** Unit outward wall normal (dx, dr) at x (perpendicular to the contour, pointing away from the gas). */
export function wallNormal(c: Contour, x: number): [number, number] {
  const h = 2e-3;
  const dr = radiusAt(c, x + h) - radiusAt(c, x - h);
  const l = Math.hypot(2 * h, dr);
  return [-dr / l, (2 * h) / l];
}
