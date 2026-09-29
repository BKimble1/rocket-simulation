/**
 * GLSL shared by the space passes. The atmosphere functions mirror atmosphere.ts exactly (same
 * constants, same table parameterisation), so the CPU lighting state and the GPU picture agree.
 */
import { ATMO, TRANS_W, TRANS_H } from './atmosphere';

const f = (x: number) => {
  const s = x.toExponential(8);
  return s.includes('.') || s.includes('e') ? s.replace(/e\+?/, 'e') : `${s}.0`;
};
const v3 = (a: readonly number[]) => `vec3(${a.map(f).join(', ')})`;

export const ATMOSPHERE_GLSL = /* glsl */ `
#ifndef PI
#define PI 3.141592653589793
#endif
const float A_RB = ${f(ATMO.bottom)};
const float A_RT = ${f(ATMO.top)};
const vec3 A_RAYLEIGH = ${v3(ATMO.rayleigh)};
const float A_RAYLEIGH_H = ${f(ATMO.rayleighH)};
const float A_MIE_SCA = ${f(ATMO.mieSca)};
const float A_MIE_EXT = ${f(ATMO.mieExt)};
const float A_MIE_H = ${f(ATMO.mieH)};
const float A_MIE_G = ${f(ATMO.mieG)};
const vec3 A_OZONE = ${v3(ATMO.ozone)};
const float A_OZONE_C = ${f(ATMO.ozoneCentre)};
const float A_OZONE_W = ${f(ATMO.ozoneHalfWidth)};
const float A_SUN_R = ${f(ATMO.sunRadius)};
const float A_TW = ${f(TRANS_W)};
const float A_TH = ${f(TRANS_H)};
// Sun irradiance at the top of the atmosphere (scene units, camera white balance applied)
uniform vec3 uSunE;
#define SUN_E uSunE

uniform sampler2D uTransLUT;
uniform sampler2D uMsLUT;
uniform sampler2D uIrrLUT;

float texFromUnit(float x, float n) { return 0.5 / n + x * (1.0 - 1.0 / n); }

/* Stable ray/sphere: returns (near, far) distances or (-1,-1) on a miss. c = |o|^2 - R^2 is
   passed in precomputed (precision), b = dot(o, d). */
vec2 raySphere(float b, float c) {
  float disc = b * b - c;
  if (disc < 0.0) return vec2(-1.0);
  float s = sqrt(disc);
  float q = -b - sign(b) * s;       // stable form
  if (b == 0.0) q = s;
  float t0 = c / q;
  float t1 = q;
  return vec2(min(t0, t1), max(t0, t1));
}

vec3 transmittanceToTop(float r, float mu) {
  float H = sqrt(A_RT * A_RT - A_RB * A_RB);
  float rho = sqrt(max(0.0, r * r - A_RB * A_RB));
  float disc = r * r * (mu * mu - 1.0) + A_RT * A_RT;
  float d = max(0.0, -r * mu + sqrt(max(disc, 0.0)));
  float dMin = A_RT - r;
  float dMax = rho + H;
  float xmu = (d - dMin) / max(dMax - dMin, 1.0);
  vec2 uv = vec2(texFromUnit(clamp(xmu, 0.0, 1.0), A_TW), texFromUnit(clamp(rho / H, 0.0, 1.0), A_TH));
  return texture2D(uTransLUT, uv).rgb;
}

/* Sunlight transmittance at radius r (inside the atmosphere) for Sun zenith cosine muS,
   including the Earth's shadow softened over the solar disk. */
vec3 transmittanceSun(float r, float muS) {
  float sinH = A_RB / r;
  float cosH = -sqrt(max(0.0, 1.0 - sinH * sinH));
  return transmittanceToTop(r, muS) * smoothstep(-sinH * A_SUN_R, sinH * A_SUN_R, muS - cosH);
}

vec3 msTransfer(float r, float muS) {
  vec2 uv = vec2(muS * 0.5 + 0.5, (clamp(r, A_RB, A_RT) - A_RB) / (A_RT - A_RB));
  return texture2D(uMsLUT, uv).rgb;
}

/* Sky irradiance on a horizontal surface at sea level (per unit sun irradiance). */
vec3 skyIrradiance(float muS) {
  return texture2D(uIrrLUT, vec2(muS * 0.5 + 0.5, 0.5)).rgb;
}

vec3 atmoDensity(float h) {
  return vec3(exp(-h / A_RAYLEIGH_H), exp(-h / A_MIE_H), max(0.0, 1.0 - abs(h - A_OZONE_C) / A_OZONE_W));
}

float phaseRayleigh(float c) { return 3.0 / (16.0 * PI) * (1.0 + c * c); }
float phaseMie(float c, float g) {
  float g2 = g * g;
  return 3.0 / (8.0 * PI) * ((1.0 - g2) * (1.0 + c * c)) / ((2.0 + g2) * pow(max(1.0 + g2 - 2.0 * g * c, 1e-4), 1.5));
}

/* In-scattered radiance (per unit sun irradiance) and transmittance along o + d t, t in [t0, t1].
   o is relative to the Earth's centre. warp: 0 uniform, 1 dense near t0, 2 dense near t1. */
vec3 integrateScattering(vec3 o, vec3 d, vec3 sunDir, float t0, float t1, int steps, float jitter, int warp, out vec3 T) {
  T = vec3(1.0);
  vec3 L = vec3(0.0);
  if (t1 <= t0) return L;
  float c = dot(d, sunDir);
  float pR = phaseRayleigh(c);
  float pM = phaseMie(c, A_MIE_G);
  float len = t1 - t0;
  float fs = float(steps);
  for (int i = 0; i < 64; i++) {
    if (i >= steps) break;
    float a = float(i) / fs;
    float b = float(i + 1) / fs;
    float m = (float(i) + jitter) / fs;
    float wa = a, wb = b, wm = m;
    if (warp == 1) { wa = a * a; wb = b * b; wm = m * m; }
    else if (warp == 2) { wa = 1.0 - (1.0 - a) * (1.0 - a); wb = 1.0 - (1.0 - b) * (1.0 - b); wm = 1.0 - (1.0 - m) * (1.0 - m); }
    float t = t0 + len * wm;
    float dt = len * (wb - wa);
    vec3 p = o + d * t;
    float r = length(p);
    float h = r - A_RB;
    vec3 dens = atmoDensity(h);
    vec3 sR = A_RAYLEIGH * dens.x;
    float sM = A_MIE_SCA * dens.y;
    vec3 ext = sR + A_MIE_EXT * dens.y + A_OZONE * dens.z;
    float muS = dot(p, sunDir) / r;
    vec3 Ts = transmittanceSun(r, muS);
    vec3 S = (sR * pR + sM * pM) * Ts + (sR + sM) * msTransfer(r, muS);
    vec3 segT = exp(-ext * dt);
    L += T * (S - S * segT) / max(ext, vec3(1e-12));
    T *= segT;
  }
  return L;
}

/* Cheap transmittance-only integral (for the Moon, sun disk through clouds...). */
vec3 integrateTransmittance(vec3 o, vec3 d, float t0, float t1, int steps) {
  vec3 od = vec3(0.0);
  float dt = (t1 - t0) / float(steps);
  for (int i = 0; i < 32; i++) {
    if (i >= steps) break;
    vec3 p = o + d * (t0 + (float(i) + 0.5) * dt);
    vec3 dens = atmoDensity(length(p) - A_RB);
    od += (A_RAYLEIGH * dens.x + A_MIE_EXT * dens.y + A_OZONE * dens.z) * dt;
  }
  return exp(-od);
}
`;

/** Hash and value noise for per-pixel dithering and small procedural detail. */
export const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float ign(vec2 px) { return fract(52.9829189 * fract(dot(px, vec2(0.06711056, 0.00583715)))); }
`;

/**
 * The cloud field, evaluated in Earth-fixed coordinates (metres, sphere-local frame of the
 * globe: +X longitude 0, +Y north, -Z 90 deg E). One function serves the global layer seen from
 * orbit, the cumulus near the pad and the cloud shadows on the ground.
 *
 *   coverage (cube map, weather systems at ~10 km)  x  clusters (tile 26 km)
 *   x cumulus cells (tile 4.2 km, Perlin-Worley, towers about 1 km across)
 *   x vertical gradient (flat bases at CLOUD_BASE, dome tops), applied BEFORE the coverage
 *     threshold so towers narrow with height, then eroded by Worley detail (tile 0.9 km).
 * Far away (lod -> 1) the cells are replaced by a statistical mean whose optical depth gives
 * the same average opacity as the resolved cells, so the field neither sparkles nor turns into
 * an overcast sheet with distance.
 */
export const CLOUD_BASE = 1500;
export const CLOUD_TOP = 3500;
/** Extinction per unit cloud density (1/m): a mean free path of 50 m in the dense core. */
export const CLOUD_SIGMA = 0.02;

export const CLOUD_GLSL = /* glsl */ `
uniform samplerCube uCoverage;
uniform sampler3D uNoise;
uniform vec3 uPadEF;          // unit vector to the pad, Earth-fixed
uniform float uCloudTime;     // unused drift hook (clouds are static over a lesson)
const float C_BASE = ${f(CLOUD_BASE)};
const float C_TOP = ${f(CLOUD_TOP)};
const float C_SIGMA = ${f(CLOUD_SIGMA)};
const float C_CELL = ${f(1 / 4200)};
const float C_CLUSTER = ${f(1 / 26000)};
const float C_DETAIL = ${f(1 / 900)};
// thickness of cloud a vertical ray crosses in a typical cell (sets the far-field mean)
const float C_COLUMN = 700.0;

float remap01(float v, float a, float b) { return clamp((v - a) / (b - a), 0.0, 1.0); }

/* Weather coverage 0..1 and cloud-top factor 0..1 at an Earth-fixed direction, with the pad's
   local weather: scattered fair-weather cumulus, a mostly clear column right above the pad. */
vec2 cloudWeather(vec3 pEF, out float padDist) {
  vec3 n = normalize(pEF);
  vec4 cv = textureCube(uCoverage, n);
  float cov = cv.r;
  float top = cv.g;
  padDist = length(n - uPadEF) * A_RB;
  // the local weather blends into the global field over hundreds of kilometres, along an
  // irregular edge (cv.b), so from orbit it reads as a cumulus field over the coast, not a disk
  float wPad = 1.0 - smoothstep(50000.0, 420000.0, padDist * (0.4 + 1.3 * cv.b));
  cov = mix(cov, 0.44, wPad);
  top = mix(top, 0.5, wPad);
  // keep the column over the pad and the first kilometres of the ascent mostly clear
  cov *= mix(1.0, 0.3 + 0.7 * smoothstep(1800.0, 6500.0, padDist), wPad);
  return vec2(cov, top);
}

/* Lookup of the cumulus cells, domain-warped by the cluster noise (a, sampled at 26 km): the
   4.2 km tile of the noise volume would otherwise repeat visibly over a wide overcast area seen
   from orbit. The warp changes where cells sit, not their statistics. */
vec3 cellCoord(vec3 pEF, vec4 a) {
  vec3 w = vec3(a.g, a.r, 0.5 * (a.g + a.r)) - 0.5;
  return pEF * C_CELL + vec3(0.37, 0.11, 0.73) + w * 0.9;
}

/* Vertical gradient: fast rise at a flat base, parabolic fall to the tallest tops (topH). */
float heightGradient(float hf, float topF) {
  float topH = mix(0.42, 1.0, topF);
  float x = hf / topH;
  return smoothstep(0.0, 0.045, hf) * clamp(1.0 - x * x, 0.0, 1.0);
}

/* Shape (0..1) at a point. lod 0 = full detail; toward 1 the cells are replaced by their mean
   (what a long step or a wide pixel sees); from 1 to 2 the cluster pattern too. */
float cloudShape(vec3 pEF, float hf, vec2 wc, float lod) {
  float cov = wc.x;
  float g = heightGradient(hf, wc.y);
  float thr = 1.0 - cov;
  // the mean field's tops rise and fall with the clusters (up to 1.4x the top factor, below)
  float gHi = lod > 0.0 && lod < 1.999 ? heightGradient(hf, min(1.0, wc.y * 1.4)) : g;
  if (max(g, gHi) <= thr) return 0.0;
  vec4 a = texture(uNoise, pEF * C_CLUSTER);
  // lod beyond 1: a pixel wider than the cluster pattern sees its mean (the channels are
  // stretched to 0..1 around 0.5), else the 26 km pattern aliases into grain seen from far away
  float clusters = mix(a.r * 0.6 + a.g * 0.4, 0.5, clamp(lod - 1.0, 0.0, 1.0));
  lod = min(lod, 1.0);
  float mean = 0.0;
  if (lod > 0.0) {
    // area fraction of the thresholded cells at this height, as an optical depth over a column.
    // The clusters lift and lower its top as they do the cells' (taller cells where they are
    // high), so a dense deck whose cells are below a pixel keeps a lumpy top that the Sun shades
    // instead of turning into a flat plain.
    float gm = heightGradient(hf, clamp(wc.y * (0.6 + 0.8 * clusters), 0.0, 1.0));
    float area = clamp((gm - thr) / max(gm, 1e-3), 0.0, 1.0) * (0.55 + 0.9 * clusters);
    mean = -log(1.0 - min(area, 0.93)) / (C_SIGMA * C_COLUMN);
  }
  if (lod >= 0.999) return mean;
  vec4 b = texture(uNoise, cellCoord(pEF, a));
  float n = (b.r * 0.85 + b.g * 0.15) * 0.74 + clusters * 0.26;
  float detailed = remap01(n * g, thr, 1.0);
  return mix(detailed, mean, lod);
}

/* Density (0..1) at an Earth-fixed point pEF with altitude h. */
float cloudDensity(vec3 pEF, float h, float lod, float erodeLod) {
  float hf = (h - C_BASE) / (C_TOP - C_BASE);
  if (hf <= 0.0 || hf >= 1.0) return 0.0;
  float pd;
  vec2 wc = cloudWeather(pEF, pd);
  if (wc.x < 0.02) return 0.0;
  float s = cloudShape(pEF, hf, wc, lod);
  if (s <= 0.0) return 0.0;
  if (erodeLod < 1.0) {
    vec4 e = texture(uNoise, pEF * C_DETAIL + vec3(0.5, 0.2, 0.9));
    float er = e.g * 0.5 + e.b * 0.3 + e.a * 0.2;
    // billowy tops, wispier bottoms
    float amt = (0.32 + 0.22 * (1.0 - hf)) * (1.0 - erodeLod);
    s = remap01(s, er * amt, 1.0);
  }
  return s;
}

/* Column opacity for shadows cast on the ground (0 = clear, 1 = opaque): the towers' footprint
   near the base, less the eroded fringe, so shadows match the clouds. lod -> 1 (a pixel wider
   than a cell) gives the mean shade instead of aliasing cells. */
float cloudColumn(vec3 pEF, float lod) {
  float pd;
  vec2 wc = cloudWeather(pEF, pd);
  if (wc.x < 0.02) return 0.0;
  float g = heightGradient(0.18, wc.y);
  float thr = 1.0 - wc.x;
  if (g <= thr) return 0.0;
  vec4 a = texture(uNoise, pEF * C_CLUSTER);
  float clusters = mix(a.r * 0.6 + a.g * 0.4, 0.5, clamp(lod - 1.0, 0.0, 1.0));
  lod = min(lod, 1.0);
  float mean = clamp((g - thr) / g * (0.55 + 0.9 * clusters), 0.0, 1.0) * 0.8;
  if (lod >= 0.999) return mean;
  vec4 b = texture(uNoise, cellCoord(pEF, a));
  float n = (b.r * 0.85 + b.g * 0.15) * 0.74 + clusters * 0.26;
  float detailed = smoothstep(0.18, 0.55, remap01(n * g, thr, 1.0));
  return mix(detailed, mean, lod);
}
`;
