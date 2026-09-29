/**
 * The baked launch-site maps (tools/site/bake_site.py): a 16-bit signed distance to the coast
 * (land positive) on 50 m texels over +-51.2 km, and a cover map (open ocean vs lagoon, marsh,
 * towns) on 100 m texels. Loaded once; kept on the CPU too, so the terrain heights, the
 * vegetation scatter and the roads agree with what the shader draws.
 *
 * Heights are "height above the sphere" h (m): the pad frame's origin (hardstand top) is h = 0.
 * Pad-local y of a point = sphereY(x, z, h) (the ground drops by d^2 / 2R with distance d).
 */
import * as THREE from 'three';
import { asset } from '../../config';
import { R_EARTH } from '../../world/frames';
import { LANDING_ZONE } from '../../world/site';
import { SITE_MAP } from './generated/regionalMap';
import { LZ_TOP_H, GRADE, inPadPit } from './layout';

export interface SiteMaps {
  sdfTex: THREE.Texture;
  coverTex: THREE.Texture;
  /** Signed coast distance (m), row-major [z][x], SITE_MAP.sdfSize square. */
  sdf: Float32Array;
  /** Cover RGBA bytes, SITE_MAP.coverSize square. */
  cover: Uint8ClampedArray;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Sea level (h) around the site: 6.5 m below the pad datum near the pad (the hardstand stands
 * on land ~1.5 m above the sea), -1.8 m from 7 km (the landing-zone slab is at h = 0), and
 * exactly on the sphere from 41 km, where the terrain overlaps the globe.
 */
export function seaLevel(d: number): number {
  return lerp(lerp(-6.5, -1.8, smooth(1500, 7000, d)), 0, smooth(30000, 41000, d));
}

/** Pad-local y of a point at horizontal (x, z) and height h above the sphere (double precision). */
export function sphereY(x: number, z: number, h: number): number {
  const r = R_EARTH + h;
  return Math.sqrt(r * r - x * x - z * z) - R_EARTH;
}

// ───────────────────────────── hash noise (mirrors the shader) ─────────────────────────────

function hash2(ix: number, iz: number, seed: number): number {
  let h = (Math.imul(ix | 0, 374761393) + Math.imul(iz | 0, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 8) / 16777216;
}

export function vnoise(x: number, z: number, seed = 0): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return (a + (b - a) * ux) * (1 - uz) + (c + (d - c) * ux) * uz;
}

export function fbm(x: number, z: number, wavelength: number, octaves = 3, seed = 0): number {
  let s = 0;
  let amp = 0.5;
  let norm = 0;
  let f = 1 / wavelength;
  for (let o = 0; o < octaves; o++) {
    s += amp * (vnoise(x * f, z * f, seed + o * 17) * 2 - 1);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return s / norm;
}

// ───────────────────────────── loading ─────────────────────────────

let cached: Promise<SiteMaps> | null = null;
let ready: SiteMaps | null = null;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${url}`));
    img.src = url;
  });
}

function pixels(img: HTMLImageElement): Uint8ClampedArray {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  return g.getImageData(0, 0, c.width, c.height).data;
}

export function loadSiteMaps(): Promise<SiteMaps> {
  if (cached) return cached;
  cached = Promise.all([loadImage(asset('textures/site/coast_sdf.png')), loadImage(asset('textures/site/cover.png'))]).then(([sImg, cImg]) => {
    const sp = pixels(sImg);
    const n = SITE_MAP.sdfSize * SITE_MAP.sdfSize;
    const sdf = new Float32Array(n);
    for (let i = 0; i < n; i++) sdf[i] = (sp[i * 4] * 256 + sp[i * 4 + 1]) * SITE_MAP.sdfStep - SITE_MAP.sdfRange;
    const cover = pixels(cImg);
    const sdfTex = new THREE.Texture(sImg);
    sdfTex.flipY = false;
    sdfTex.magFilter = sdfTex.minFilter = THREE.NearestFilter;
    sdfTex.generateMipmaps = false;
    sdfTex.colorSpace = THREE.NoColorSpace;
    sdfTex.needsUpdate = true;
    const coverTex = new THREE.Texture(cImg);
    coverTex.flipY = false;
    coverTex.colorSpace = THREE.NoColorSpace;
    coverTex.minFilter = THREE.LinearMipmapLinearFilter;
    coverTex.magFilter = THREE.LinearFilter;
    coverTex.wrapS = coverTex.wrapT = THREE.ClampToEdgeWrapping;
    coverTex.needsUpdate = true;
    ready = { sdfTex, coverTex, sdf, cover };
    return ready;
  });
  return cached;
}

/** Suspense-style accessor for React components. */
export function useSiteMaps(): SiteMaps {
  if (ready) return ready;
  throw loadSiteMaps();
}

export function siteMapsReady(): SiteMaps | null {
  return ready;
}

// ───────────────────────────── sampling ─────────────────────────────

/** Signed distance to the coast (m, land positive), bilinear like the shader. */
export function coastDist(m: SiteMaps, x: number, z: number): number {
  const N = SITE_MAP.sdfSize;
  const tx = ((x + SITE_MAP.ext) / (2 * SITE_MAP.ext)) * N - 0.5;
  const tz = ((z + SITE_MAP.ext) / (2 * SITE_MAP.ext)) * N - 0.5;
  const ix = Math.max(0, Math.min(N - 2, Math.floor(tx)));
  const iz = Math.max(0, Math.min(N - 2, Math.floor(tz)));
  const fx = Math.min(1, Math.max(0, tx - ix));
  const fz = Math.min(1, Math.max(0, tz - iz));
  const s = m.sdf;
  const a = s[iz * N + ix];
  const b = s[iz * N + ix + 1];
  const c = s[(iz + 1) * N + ix];
  const d = s[(iz + 1) * N + ix + 1];
  return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
}

/** Cover channel (0 ocean, 1 marsh, 2 town), bilinear, 0..1. */
export function coverAt(m: SiteMaps, x: number, z: number, ch: 0 | 1 | 2): number {
  const N = SITE_MAP.coverSize;
  const tx = ((x + SITE_MAP.ext) / (2 * SITE_MAP.ext)) * N - 0.5;
  const tz = ((z + SITE_MAP.ext) / (2 * SITE_MAP.ext)) * N - 0.5;
  const ix = Math.max(0, Math.min(N - 2, Math.floor(tx)));
  const iz = Math.max(0, Math.min(N - 2, Math.floor(tz)));
  const fx = Math.min(1, Math.max(0, tx - ix));
  const fz = Math.min(1, Math.max(0, tz - iz));
  const c = m.cover;
  const at = (i: number, k: number) => c[(k * N + i) * 4 + ch] / 255;
  return (at(ix, iz) * (1 - fx) + at(ix + 1, iz) * fx) * (1 - fz) + (at(ix, iz + 1) * (1 - fx) + at(ix + 1, iz + 1) * fx) * fz;
}

/**
 * Natural ground height h (m above the sphere) at pad-local (x, z), before any structure:
 * water at sea level, beaches rising from the waterline, a dune ridge behind the Atlantic
 * beach, low flat scrubland (~1.5 m above the sea), the graded launch complex at GRADE, the
 * pit under the hardstand (hidden by it) and the graded landing zone.
 */
export function groundH(m: SiteMaps, x: number, z: number): number {
  const d = Math.hypot(x, z);
  const sea = seaLevel(d);
  const sdf = coastDist(m, x, z);
  let h: number;
  if (sdf <= 0) h = sea;
  else {
    const ocean = coverAt(m, x, z, 0);
    const beach = 42 + 18 * vnoise(x / 260, z / 260, 5);
    let land = 1.1 * smooth(0, beach, sdf);
    // dune ridge behind the ocean beach (sea oats), fading inland
    const dune = smooth(beach - 8, beach + 30, sdf) * (1 - smooth(beach + 60, beach + 150, sdf));
    land += dune * (2.6 + 1.4 * vnoise(x / 180, z / 180, 9)) * smooth(0.25, 0.6, ocean);
    // gentle inland undulation
    land += smooth(beach, beach + 250, sdf) * (0.5 + 0.45 * fbm(x, z, 1400, 3, 13));
    h = sea + land;
  }
  // launch complex grading
  const w = 1 - smooth(420, 700, d);
  if (w > 0) h = lerp(h, GRADE, w);
  if (inPadPit(x, z)) h = -12;
  // landing zone grading (top of the slab at LZ_TOP_H)
  const dl = Math.hypot(x - LANDING_ZONE.x, z - LANDING_ZONE.z);
  const wl = 1 - smooth(LANDING_ZONE.radius + 60, LANDING_ZONE.radius + 160, dl);
  if (wl > 0) h = lerp(h, LZ_TOP_H - 0.45, wl);
  return h;
}

/** Pad-local y of the natural ground at (x, z). */
export function groundY(m: SiteMaps, x: number, z: number): number {
  return sphereY(x, z, groundH(m, x, z));
}
