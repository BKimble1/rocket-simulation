/**
 * Aerial perspective for everything the site draws, consistent with the sky module's
 * atmosphere (src/scene/space/atmosphere.ts).
 *
 * Near the ground (camera below ~60 m, where the local terrain's edge is below the horizon)
 * a cheap model: per-channel extinction by the same Rayleigh and Mie layers (sea-level
 * coefficients and scale heights from ATMO), integrated analytically along each straight view
 * ray from the camera to the fragment (the camera sits at the render origin, so a fragment's
 * world position is its offset from the eye), and the in-scattered radiance skyState.hazeColor
 * (the sky module's L / (1 - T) along its reference ray at the camera).
 *
 * From higher up (blending in by 400 m) the same single-plus-multiple scattering integral the
 * globe is drawn with (ATMOSPHERE_GLSL, its lookup tables and Sun irradiance), marched per
 * fragment along the view ray: the ground seen from 2, 10 or 35 km is hazed exactly as the globe
 * around the terrain disk, so the disk's fading edge does not show.
 */
import * as THREE from 'three';
import { skyState } from '../space/skyState';
import { ATMO, SUN_RGB, atmosphereTextures } from '../space/atmosphere';
import { ATMOSPHERE_GLSL } from '../space/glsl';
import { frame } from '../frame';
import { tierSpec } from '../quality';
import { SUN_DIRECTION } from '../../world/frames';

const lut = atmosphereTextures();

export const hazeUniforms = {
  uHazeColor: { value: new THREE.Color('#b8c6d6') },
  uHazeSun: { value: new THREE.Color('#fff1dc') },
  uSunW: { value: SUN_DIRECTION.clone() },
  uCamUpW: { value: new THREE.Vector3(0, 1, 0) },
  uCamAlt: { value: 0 },
  /** Sea-level extinction (1/m): Rayleigh per channel, Mie. */
  uRayleigh: { value: new THREE.Vector3(...ATMO.rayleigh) },
  uMieExt: { value: ATMO.mieExt },
  /** Scale heights (m): Rayleigh, Mie. */
  uHazeH: { value: new THREE.Vector2(ATMO.rayleighH, ATMO.mieH) },
  /** Camera position relative to the Earth's centre (render axes), the marched model's weight and steps. */
  uHazeCam: { value: new THREE.Vector3(0, 6371000, 0) },
  uHazeMarch: { value: 0 },
  uHazeSteps: { value: 8 },
  /** The sky module's atmosphere tables and Sun irradiance (shared objects: always current). */
  uTransLUT: { value: lut.trans },
  uMsLUT: { value: lut.ms },
  uIrrLUT: { value: lut.irr },
  uSunE: { value: SUN_RGB },
};

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Called once per frame by the site (before its objects are drawn). */
export function updateHaze() {
  const u = hazeUniforms;
  u.uCamAlt.value = frame.camAlt;
  u.uCamUpW.value.copy(frame.camUp);
  u.uSunW.value.copy(skyState.sunDir);
  u.uHazeColor.value.copy(skyState.hazeColor);
  // forward (Mie) scattering toward the Sun on top of the reference-ray colour
  u.uHazeSun.value.copy(skyState.sunColor).multiplyScalar(0.06 * skyState.sunIntensity);
  u.uHazeCam.value.copy(frame.camAbs);
  u.uHazeMarch.value = smoothstep(60, 400, frame.camAlt);
  u.uHazeSteps.value = Math.max(6, Math.min(12, tierSpec().atmoSamples[0]));
}

/** GLSL: declarations shared by vertex/fragment patches. */
export const HAZE_PARS_VERTEX = /* glsl */ `
varying vec3 vHazePos;
`;

export const HAZE_VERTEX = /* glsl */ `
{
  vec4 hazeWP = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    hazeWP = instanceMatrix * hazeWP;
  #endif
  vHazePos = ( modelMatrix * hazeWP ).xyz;
}
`;

export const HAZE_PARS_FRAGMENT = /* glsl */ `
${ATMOSPHERE_GLSL}
varying vec3 vHazePos;
uniform vec3 uHazeCam;
uniform float uHazeMarch;
uniform int uHazeSteps;
uniform vec3 uHazeColor;
uniform vec3 uHazeSun;
uniform vec3 uSunW;
uniform vec3 uCamUpW;
uniform float uCamAlt;
uniform vec3 uRayleigh;
uniform float uMieExt;
uniform vec2 uHazeH;
// mean relative density of an exponential layer (scale height H) along a straight path h0 -> h1
float hazeAvg( float H, float h0, float h1 ) {
  float dh = h1 - h0;
  float e0 = exp( -h0 / H );
  float e1 = exp( -h1 / H );
  return abs( dh ) > 0.5 ? ( e0 - e1 ) * H / dh : e0;
}
vec3 siteHaze( vec3 col, vec3 wp ) {
  float L = length( wp );
  vec3 v = wp / max( L, 1e-3 );
  float h0 = max( uCamAlt, 0.0 );
  float h1 = max( h0 + dot( wp, uCamUpW ), 0.0 );
  vec3 tau = L * ( uRayleigh * hazeAvg( uHazeH.x, h0, h1 ) + uMieExt * hazeAvg( uHazeH.y, h0, h1 ) );
  vec3 T = exp( -tau );
  float mu = max( dot( v, uSunW ), 0.0 );
  vec3 hc = uHazeColor + uHazeSun * ( pow( mu, 12.0 ) * 2.0 + pow( mu, 3.0 ) * 0.3 );
  vec3 cheap = col * T + hc * ( 1.0 - T );
  if ( uHazeMarch <= 0.0 ) return cheap;
  // the globe's scattering integral along the same ray (camera inside the atmosphere)
  vec3 Tm;
  vec3 Lm = integrateScattering( uHazeCam, v, uSunW, 0.0, L, uHazeSteps, 0.5, 0, Tm ) * SUN_E;
  return mix( cheap, col * Tm + Lm, uHazeMarch );
}
`;

export const HAZE_FRAGMENT = /* glsl */ `
gl_FragColor.rgb = siteHaze( gl_FragColor.rgb, vHazePos );
`;

type Shader = THREE.WebGLProgramParametersWithUniforms;

/** Inject the haze into a built-in material's shader (vertex world position + final mix). */
export function injectHaze(shader: Shader) {
  Object.assign(shader.uniforms, hazeUniforms);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${HAZE_PARS_VERTEX}`)
    .replace('#include <project_vertex>', `#include <project_vertex>\n${HAZE_VERTEX}`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${HAZE_PARS_FRAGMENT}`)
    .replace('#include <opaque_fragment>', `#include <opaque_fragment>\n${HAZE_FRAGMENT}`);
}

/** Give a material the site haze (keeps any previous onBeforeCompile). */
export function withHaze<T extends THREE.Material>(m: T, key = 'site-haze'): T {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    prev?.call(m, shader, renderer);
    injectHaze(shader);
  };
  const prevKey = m.customProgramCacheKey?.bind(m);
  m.customProgramCacheKey = () => `${prevKey ? prevKey() : ''}|${key}`;
  return m;
}
