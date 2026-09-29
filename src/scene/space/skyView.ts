/**
 * Sky-view table (after Hillaire 2020): the sky's in-scattered radiance and mean transmittance
 * for every direction around the camera, integrated with many samples into a small texture each
 * frame. The full-screen pass then costs one lookup per sky pixel, and the horizon (where a
 * view ray crosses a thousand kilometres of air) is integrated accurately on every tier.
 *
 * Parameterisation around the camera's local vertical:
 *   v: view zenith angle z = Zh * (1 - (1 - v)^2), Zh = zenith angle of the geometric horizon
 *      (dense near the horizon, where the sky changes fastest; also covers the thin limb seen
 *      from orbit);
 *   u: azimuth from the Sun's vertical plane, phi = pi * u^2 (dense near the Sun's aureole; the
 *      sky is symmetric about that plane).
 */
import * as THREE from 'three';
import { ATMOSPHERE_GLSL } from './glsl';

export const SKYVIEW_GLSL = /* glsl */ `
uniform sampler2D uSkyView;
uniform vec3 uUp;
uniform vec3 uSunH;
uniform vec3 uSideH;
uniform float uZh;
uniform vec2 uSkyViewSize;

vec2 skyViewUV(vec3 d) {
  float cz = clamp(dot(d, uUp), -1.0, 1.0);
  float z = acos(cz);
  vec3 h = d - uUp * cz;
  float hl = length(h);
  float phi = hl > 1e-6 ? acos(clamp(dot(h / hl, uSunH), -1.0, 1.0)) : 0.0;
  float u = sqrt(phi / PI);
  float v = 1.0 - sqrt(max(0.0, 1.0 - z / uZh));
  // texel centres at the ends of the range
  return vec2((u * (uSkyViewSize.x - 1.0) + 0.5) / uSkyViewSize.x, (v * (uSkyViewSize.y - 1.0) + 0.5) / uSkyViewSize.y);
}
`;

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const FRAG = /* glsl */ `
${ATMOSPHERE_GLSL}
varying vec2 vUv;
uniform vec3 uCamPos;
uniform float uCamR;
uniform vec3 uSun;
uniform vec4 uC;
uniform vec3 uUp;
uniform vec3 uSunH;
uniform vec3 uSideH;
uniform float uZh;
uniform vec2 uSkyViewSize;
uniform int uViewSteps;
void main() {
  vec2 px = vUv * uSkyViewSize - 0.5;
  float u = clamp(px.x / (uSkyViewSize.x - 1.0), 0.0, 1.0);
  float v = clamp(px.y / (uSkyViewSize.y - 1.0), 0.0, 1.0);
  float phi = PI * u * u;
  float w = 1.0 - v;
  float z = uZh * (1.0 - w * w);
  // stay a hair above the geometric horizon so the ray never touches the ground
  z = min(z, uZh - 1e-5);
  vec3 d = uUp * cos(z) + (uSunH * cos(phi) + uSideH * sin(phi)) * sin(z);
  float b = dot(uCamPos, d);
  vec2 iA = raySphere(b, uC.y);
  vec2 iG = raySphere(b, uC.x);
  vec3 L = vec3(0.0);
  vec3 T = vec3(1.0);
  if (iA.y > 0.0) {
    float t0 = max(0.0, iA.x);
    float t1 = iA.y;
    if (iG.x > 0.0) t1 = min(t1, iG.x);
    bool inside = uCamR < A_RT;
    L = integrateScattering(uCamPos, d, uSun, t0, t1, uViewSteps, 0.5, inside ? 1 : 0, T) * SUN_E;
  }
  gl_FragColor = vec4(L, dot(T, vec3(1.0 / 3.0)));
}
`;

export function makeSkyViewMaterial(shared: Record<string, THREE.IUniform>): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'space.skyView',
    uniforms: {
      uTransLUT: shared.uTransLUT,
      uMsLUT: shared.uMsLUT,
      uIrrLUT: shared.uIrrLUT,
      uSunE: shared.uSunE,
      uCamPos: shared.uCamPos,
      uCamR: shared.uCamR,
      uSun: shared.uSun,
      uC: shared.uC,
      uUp: shared.uUp,
      uSunH: shared.uSunH,
      uSideH: shared.uSideH,
      uZh: shared.uZh,
      uSkyViewSize: shared.uSkyViewSize,
      uViewSteps: { value: 32 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
    toneMapped: false,
  });
}
