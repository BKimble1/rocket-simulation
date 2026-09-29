/**
 * Physical atmosphere model shared by the GPU passes (sky, globe, clouds, environment) and the
 * CPU (lighting state for the rest of the scene).
 *
 * Single scattering by Rayleigh (air molecules) and Mie (aerosol) particles with ozone
 * absorption, over a spherical Earth, with precomputed tables:
 *   - transmittance to the top of the atmosphere T(r, mu), Bruneton's parameterisation;
 *   - Hillaire's (2020) isotropic multiple-scattering transfer Psi(r, mu_s), which adds the light
 *     scattered more than once (brightens the horizon and twilight a little; single scattering
 *     remains the main term);
 *   - sky irradiance on a horizontal surface at sea level as a function of the Sun's zenith cosine.
 *
 * Units: metres; radiance in scene units where the Sun's irradiance at the top of the
 * atmosphere is SUN_IRRADIANCE (the same units three.js lights use, so a directional light of
 * that intensity lights a white surface like the real Sun, before exposure).
 */
import * as THREE from 'three';
import { R_EARTH } from '../../world/frames';

export const ATMO = {
  bottom: R_EARTH,
  top: R_EARTH + 100_000,
  /** Rayleigh scattering at sea level (1/m) for R, G, B (680, 550, 440 nm). */
  rayleigh: [5.802e-6, 13.558e-6, 33.1e-6] as [number, number, number],
  rayleighH: 8000,
  /** Mie scattering / extinction at sea level (1/m): a light coastal marine haze. */
  mieSca: 9.0e-6,
  mieExt: 1.0e-5,
  mieH: 1200,
  mieG: 0.8,
  /** Ozone absorption at the peak of its layer (1/m). */
  ozone: [0.65e-6, 1.881e-6, 0.085e-6] as [number, number, number],
  ozoneCentre: 25_000,
  ozoneHalfWidth: 15_000,
  /** Sun angular radius (rad). */
  sunRadius: 0.004675,
  /** Mean ground albedo used by the multiple-scattering estimate. */
  groundAlbedo: 0.25,
};

/** Sun irradiance at the top of the atmosphere, in scene light units. */
export const SUN_IRRADIANCE = 4.4;

// ───────────────────────────── geometry helpers ─────────────────────────────

const Rb = ATMO.bottom;
const Rt = ATMO.top;
const H = Math.sqrt(Rt * Rt - Rb * Rb);

export function distanceToTop(r: number, mu: number): number {
  const disc = r * r * (mu * mu - 1) + Rt * Rt;
  return Math.max(0, -r * mu + Math.sqrt(Math.max(disc, 0)));
}
export function distanceToBottom(r: number, mu: number): number {
  const disc = r * r * (mu * mu - 1) + Rb * Rb;
  return Math.max(0, -r * mu - Math.sqrt(Math.max(disc, 0)));
}
export function hitsGround(r: number, mu: number): boolean {
  return mu < 0 && r * r * (mu * mu - 1) + Rb * Rb >= 0;
}

function densities(h: number, out: Float64Array) {
  out[0] = Math.exp(-h / ATMO.rayleighH);
  out[1] = Math.exp(-h / ATMO.mieH);
  out[2] = Math.max(0, 1 - Math.abs(h - ATMO.ozoneCentre) / ATMO.ozoneHalfWidth);
}

const _d = new Float64Array(3);
function extinction(h: number, c: number): number {
  densities(h, _d);
  return ATMO.rayleigh[c] * _d[0] + ATMO.mieExt * _d[1] + ATMO.ozone[c] * _d[2];
}

// ───────────────────────────── transmittance table ─────────────────────────────

export const TRANS_W = 256;
export const TRANS_H = 64;

const unitFromTex = (u: number, n: number) => (u - 0.5 / n) / (1 - 1 / n);
const texFromUnit = (x: number, n: number) => 0.5 / n + x * (1 - 1 / n);

/** Table data: RGB transmittance to the top of the atmosphere, TRANS_W x TRANS_H. */
const transData = new Float32Array(TRANS_W * TRANS_H * 3);

function buildTransmittance() {
  const N = 96;
  for (let j = 0; j < TRANS_H; j++) {
    const xr = unitFromTex((j + 0.5) / TRANS_H, TRANS_H);
    const rho = H * xr;
    const r = Math.sqrt(rho * rho + Rb * Rb);
    for (let i = 0; i < TRANS_W; i++) {
      const xmu = unitFromTex((i + 0.5) / TRANS_W, TRANS_W);
      const dMin = Rt - r;
      const dMax = rho + H;
      const d = dMin + xmu * (dMax - dMin);
      let mu = d === 0 ? 1 : (H * H - rho * rho - d * d) / (2 * r * d);
      mu = Math.min(1, Math.max(-1, mu));
      const len = distanceToTop(r, mu);
      const dt = len / N;
      const od = [0, 0, 0];
      for (let k = 0; k <= N; k++) {
        const t = k * dt;
        const ri = Math.sqrt(t * t + 2 * r * mu * t + r * r);
        const w = k === 0 || k === N ? 0.5 : 1;
        const h = ri - Rb;
        for (let c = 0; c < 3; c++) od[c] += extinction(h, c) * dt * w;
      }
      const o = (j * TRANS_W + i) * 3;
      for (let c = 0; c < 3; c++) transData[o + c] = Math.exp(-od[c]);
    }
  }
}

function transUV(r: number, mu: number): [number, number] {
  const rho = Math.sqrt(Math.max(0, r * r - Rb * Rb));
  const d = distanceToTop(r, mu);
  const dMin = Rt - r;
  const dMax = rho + H;
  const xmu = dMax - dMin > 0 ? (d - dMin) / (dMax - dMin) : 0;
  return [texFromUnit(xmu, TRANS_W), texFromUnit(rho / H, TRANS_H)];
}

function bilinear(data: Float32Array, w: number, h: number, u: number, v: number, out: THREE.Vector3): THREE.Vector3 {
  const x = Math.min(w - 1, Math.max(0, u * w - 0.5));
  const y = Math.min(h - 1, Math.max(0, v * h - 0.5));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const a = (y0 * w + x0) * 3;
  const b = (y0 * w + x1) * 3;
  const c = (y1 * w + x0) * 3;
  const d = (y1 * w + x1) * 3;
  const f = (i: number) => (data[a + i] * (1 - fx) + data[b + i] * fx) * (1 - fy) + (data[c + i] * (1 - fx) + data[d + i] * fx) * fy;
  return out.set(f(0), f(1), f(2));
}

/** Transmittance from a point at radius r (<= top) to the top of the atmosphere along mu. */
export function transmittanceToTop(r: number, mu: number, out: THREE.Vector3): THREE.Vector3 {
  const [u, v] = transUV(Math.min(r, Rt), mu);
  return bilinear(transData, TRANS_W, TRANS_H, u, v, out);
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Transmittance of sunlight reaching a point at radius r whose zenith makes cos mu_s with the
 * Sun, including the Earth's shadow with a soft edge the size of the solar disk. Works above the
 * atmosphere too (the ray to the Sun may still graze it).
 */
export function transmittanceSun(r: number, muS: number, out: THREE.Vector3): THREE.Vector3 {
  if (r > Rt) {
    // move to where the sun ray enters the atmosphere, if it does
    const disc = r * r * (muS * muS - 1) + Rt * Rt;
    if (muS >= 0 || disc <= 0) {
      // ray goes away from the Earth or misses the atmosphere: check the solid Earth only
      const discG = r * r * (muS * muS - 1) + Rb * Rb;
      if (muS < 0 && discG > 0) return out.set(0, 0, 0);
      return out.set(1, 1, 1);
    }
    const t = -r * muS - Math.sqrt(disc); // entry distance toward the Sun
    const rE = Rt;
    const muE = (r * muS + t) / rE;
    return transmittanceSun(rE * 0.999999, muE, out);
  }
  const sinH = Rb / r;
  const cosH = -Math.sqrt(Math.max(0, 1 - sinH * sinH));
  transmittanceToTop(r, muS, out);
  const k = smoothstep(-sinH * ATMO.sunRadius, sinH * ATMO.sunRadius, muS - cosH);
  return out.multiplyScalar(k);
}

// ───────────────────────────── multiple scattering table ─────────────────────────────

export const MS_N = 32;
const msData = new Float32Array(MS_N * MS_N * 3);

function msUVtoParams(i: number, j: number): [number, number] {
  const muS = -1 + (2 * (i + 0.5)) / MS_N;
  const h = ((j + 0.5) / MS_N) * (Rt - Rb);
  return [muS, Rb + h];
}

function buildMultipleScattering() {
  // directions on a sphere (Fibonacci)
  const ND = 48;
  const dirs: [number, number, number][] = [];
  for (let k = 0; k < ND; k++) {
    const y = 1 - (2 * (k + 0.5)) / ND;
    const rr = Math.sqrt(1 - y * y);
    const phi = k * Math.PI * (3 - Math.sqrt(5));
    dirs.push([Math.cos(phi) * rr, y, Math.sin(phi) * rr]);
  }
  const STEPS = 20;
  const tS = new THREE.Vector3();
  const iso = 1 / (4 * Math.PI);
  for (let j = 0; j < MS_N; j++)
    for (let i = 0; i < MS_N; i++) {
      const [muS, r] = msUVtoParams(i, j);
      const sun = [Math.sqrt(Math.max(0, 1 - muS * muS)), muS, 0];
      const L2 = [0, 0, 0];
      const F = [0, 0, 0];
      for (const w of dirs) {
        const mu = w[1];
        const ground = hitsGround(r, mu);
        const tMax = ground ? distanceToBottom(r, mu) : distanceToTop(r, mu);
        const dt = tMax / STEPS;
        const T = [1, 1, 1];
        const L = [0, 0, 0];
        const f = [0, 0, 0];
        for (let s = 0; s < STEPS; s++) {
          const t = (s + 0.5) * dt;
          const px = w[0] * t;
          const py = r + w[1] * t;
          const pz = w[2] * t;
          const ri = Math.sqrt(px * px + py * py + pz * pz);
          const h = ri - Rb;
          densities(h, _d);
          const muSi = (px * sun[0] + py * sun[1] + pz * sun[2]) / ri;
          transmittanceSun(ri, muSi, tS);
          for (let c = 0; c < 3; c++) {
            const sca = ATMO.rayleigh[c] * _d[0] + ATMO.mieSca * _d[1];
            const ext = ATMO.rayleigh[c] * _d[0] + ATMO.mieExt * _d[1] + ATMO.ozone[c] * _d[2];
            const segT = Math.exp(-ext * dt);
            const integ = ext > 0 ? (1 - segT) / ext : dt;
            L[c] += T[c] * sca * tS.getComponent(c) * iso * integ;
            f[c] += T[c] * sca * integ;
            T[c] *= segT;
          }
        }
        if (ground) {
          const px = w[0] * tMax;
          const py = r + w[1] * tMax;
          const pz = w[2] * tMax;
          const ri = Math.sqrt(px * px + py * py + pz * pz);
          const muG = (px * sun[0] + py * sun[1] + pz * sun[2]) / ri;
          transmittanceSun(ri, muG, tS);
          for (let c = 0; c < 3; c++) L[c] += T[c] * tS.getComponent(c) * Math.max(0, muG) * (ATMO.groundAlbedo / Math.PI);
        }
        for (let c = 0; c < 3; c++) {
          L2[c] += L[c] / ND;
          F[c] += f[c] / ND;
        }
      }
      const o = (j * MS_N + i) * 3;
      for (let c = 0; c < 3; c++) msData[o + c] = L2[c] / Math.max(1e-6, 1 - F[c]);
    }
}

/** Multiple-scattering transfer at radius r for a Sun zenith cosine muS. */
export function multipleScattering(r: number, muS: number, out: THREE.Vector3): THREE.Vector3 {
  const u = muS * 0.5 + 0.5;
  const v = (Math.min(Rt, Math.max(Rb, r)) - Rb) / (Rt - Rb);
  return bilinear(msData, MS_N, MS_N, u, v, out);
}

// ───────────────────────────── phase functions ─────────────────────────────

export const phaseRayleigh = (c: number) => (3 / (16 * Math.PI)) * (1 + c * c);
export function phaseMie(c: number, g = ATMO.mieG) {
  const g2 = g * g;
  return ((3 / (8 * Math.PI)) * ((1 - g2) * (1 + c * c))) / ((2 + g2) * Math.pow(1 + g2 - 2 * g * c, 1.5));
}

// ───────────────────────────── CPU ray integration ─────────────────────────────

const _ts = new THREE.Vector3();
const _ms = new THREE.Vector3();

export interface RayResult {
  /** In-scattered radiance per unit sun irradiance. */
  L: THREE.Vector3;
  /** Transmittance along the segment. */
  T: THREE.Vector3;
  /** Distance to the ground hit (Infinity if none). */
  tGround: number;
}

export const makeRayResult = (): RayResult => ({ L: new THREE.Vector3(), T: new THREE.Vector3(), tGround: Infinity });

/**
 * Integrate single + multiple scattering along a ray starting at `o` (relative to the Earth's
 * centre) in unit direction `d`, up to `tLimit` (or the ground / top of the atmosphere).
 */
export function integrateRay(o: THREE.Vector3, d: THREE.Vector3, sun: THREE.Vector3, steps: number, out: RayResult, tLimit = Infinity): RayResult {
  out.L.set(0, 0, 0);
  out.T.set(1, 1, 1);
  out.tGround = Infinity;
  const r0 = o.length();
  const mu0 = o.dot(d) / r0;
  // segment inside the atmosphere
  let t0 = 0;
  let t1: number;
  if (r0 > Rt) {
    const disc = r0 * r0 * (mu0 * mu0 - 1) + Rt * Rt;
    if (mu0 >= 0 || disc <= 0) return out;
    t0 = -r0 * mu0 - Math.sqrt(disc);
    t1 = -r0 * mu0 + Math.sqrt(disc);
  } else t1 = distanceToTop(r0, mu0);
  if (hitsGround(r0, mu0)) {
    const tg = r0 > Rb ? -r0 * mu0 - Math.sqrt(Math.max(0, r0 * r0 * (mu0 * mu0 - 1) + Rb * Rb)) : 0;
    out.tGround = tg;
    t1 = Math.min(t1, tg);
  }
  t1 = Math.min(t1, tLimit);
  if (t1 <= t0) return out;
  const c = d.dot(sun);
  const pR = phaseRayleigh(c);
  const pM = phaseMie(c);
  const T = [1, 1, 1];
  const L = [0, 0, 0];
  const inside = r0 <= Rt;
  for (let i = 0; i < steps; i++) {
    const a = i / steps;
    const b = (i + 1) / steps;
    const m = (i + 0.5) / steps;
    // denser sampling near the camera when inside the atmosphere
    const w = (x: number) => (inside ? x * x : x);
    const t = t0 + (t1 - t0) * w(m);
    const dt = (t1 - t0) * (w(b) - w(a));
    const px = o.x + d.x * t;
    const py = o.y + d.y * t;
    const pz = o.z + d.z * t;
    const ri = Math.sqrt(px * px + py * py + pz * pz);
    const h = ri - Rb;
    densities(h, _d);
    const muS = (px * sun.x + py * sun.y + pz * sun.z) / ri;
    transmittanceSun(ri, muS, _ts);
    multipleScattering(ri, muS, _ms);
    for (let k = 0; k < 3; k++) {
      const sR = ATMO.rayleigh[k] * _d[0];
      const sM = ATMO.mieSca * _d[1];
      const ext = sR + ATMO.mieExt * _d[1] + ATMO.ozone[k] * _d[2];
      const segT = Math.exp(-ext * dt);
      const S = (sR * pR + sM * pM) * _ts.getComponent(k) + (sR + sM) * _ms.getComponent(k);
      L[k] += T[k] * (ext > 0 ? (S * (1 - segT)) / ext : S * dt);
      T[k] *= segT;
    }
  }
  out.L.set(L[0], L[1], L[2]);
  out.T.set(T[0], T[1], T[2]);
  return out;
}

// ───────────────────────────── sky irradiance at the ground ─────────────────────────────

export const IRR_N = 64;
const irrData = new Float32Array(IRR_N * 3);

function buildIrradiance() {
  const o = new THREE.Vector3(0, Rb + 2, 0);
  const d = new THREE.Vector3();
  const sun = new THREE.Vector3();
  const res = makeRayResult();
  const NA = 12;
  const NE = 6;
  for (let i = 0; i < IRR_N; i++) {
    const muS = -1 + (2 * (i + 0.5)) / IRR_N;
    sun.set(Math.sqrt(1 - muS * muS), muS, 0);
    const E = [0, 0, 0];
    for (let e = 0; e < NE; e++) {
      // cosine-weighted rings: sample elevation so that each ring carries equal weight
      const u = (e + 0.5) / NE;
      const cosT = Math.sqrt(1 - u); // cos of zenith angle
      const sinT = Math.sqrt(1 - cosT * cosT);
      for (let a = 0; a < NA; a++) {
        const phi = ((a + 0.5) / NA) * Math.PI * 2;
        d.set(sinT * Math.cos(phi), cosT, sinT * Math.sin(phi));
        integrateRay(o, d, sun, 16, res);
        E[0] += res.L.x;
        E[1] += res.L.y;
        E[2] += res.L.z;
      }
    }
    // cosine-weighted Monte Carlo: E = pi * mean(L)
    for (let c = 0; c < 3; c++) irrData[i * 3 + c] = (Math.PI * E[c]) / (NA * NE);
  }
}

/** Sky irradiance on a horizontal surface at sea level, per unit sun irradiance. */
export function skyIrradianceGround(muS: number, out: THREE.Vector3): THREE.Vector3 {
  const x = Math.min(IRR_N - 1, Math.max(0, (muS * 0.5 + 0.5) * IRR_N - 0.5));
  const i0 = Math.floor(x);
  const i1 = Math.min(IRR_N - 1, i0 + 1);
  const f = x - i0;
  return out.set(
    irrData[i0 * 3] * (1 - f) + irrData[i1 * 3] * f,
    irrData[i0 * 3 + 1] * (1 - f) + irrData[i1 * 3 + 1] * f,
    irrData[i0 * 3 + 2] * (1 - f) + irrData[i1 * 3 + 2] * f,
  );
}

// ───────────────────────────── build + GPU textures ─────────────────────────────

let built = false;
export function buildTables() {
  if (built) return;
  built = true;
  buildTransmittance();
  buildMultipleScattering();
  buildIrradiance();
}

function toHalfRGBA(src: Float32Array, n: number): Uint16Array {
  const out = new Uint16Array(n * 4);
  for (let i = 0; i < n; i++) {
    out[i * 4] = THREE.DataUtils.toHalfFloat(src[i * 3]);
    out[i * 4 + 1] = THREE.DataUtils.toHalfFloat(src[i * 3 + 1]);
    out[i * 4 + 2] = THREE.DataUtils.toHalfFloat(src[i * 3 + 2]);
    out[i * 4 + 3] = THREE.DataUtils.toHalfFloat(1);
  }
  return out;
}

function dataTex(src: Float32Array, w: number, h: number): THREE.DataTexture {
  const t = new THREE.DataTexture(toHalfRGBA(src, w * h), w, h, THREE.RGBAFormat, THREE.HalfFloatType);
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

let gpu: { trans: THREE.DataTexture; ms: THREE.DataTexture; irr: THREE.DataTexture } | null = null;

/** GPU copies of the tables (built on first use, shared by every pass). */
export function atmosphereTextures() {
  if (gpu) return gpu;
  buildTables();
  gpu = { trans: dataTex(transData, TRANS_W, TRANS_H), ms: dataTex(msData, MS_N, MS_N), irr: dataTex(irrData, IRR_N, 1) };
  return gpu;
}
