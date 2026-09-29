/**
 * Volumetric clouds: the cloud field of glsl.ts ray marched through the layer between
 * CLOUD_BASE and CLOUD_TOP, lit by the Sun through the atmosphere (transmittance table) with
 * soft self-shadowing (a short march toward the Sun, multiple-scattering octaves), sky and
 * ground ambient, and aerial perspective in front of them.
 *
 * One full-screen march at reduced resolution covers the part of each view ray inside the
 * layer (from the camera when it is inside the layer, else from where the ray enters it). The
 * ray is split at the focus subject's distance (uSplit) into two layers written to two render
 * targets at once:
 *   front (camera side of the subject): depth of the layer entry, so a rocket inside or beyond
 *     a cloud is covered by it;
 *   back (beyond the subject): depth max(entry, split), so the subject and everything nearer
 *     stays in front of it.
 * Both are composited before the other transparent objects (pad steam in front of a cloud
 * stays in front), then a depth-only pass writes the depth of the dense clouds so transparent
 * objects behind them (a plume behind a cumulus) are hidden.
 * Nothing depends on proxy geometry, so the rocket climbing through the layer and the camera
 * climbing through it never pop, and the field is Earth-fixed and continuous to orbit.
 *
 * Both composites un-premultiply the filtered colour before tone mapping and blend with
 * straight alpha: tone mapping or sRGB-encoding a premultiplied colour turns every soft edge
 * into a bright halo.
 */
import * as THREE from 'three';
import { ATMOSPHERE_GLSL, NOISE_GLSL, CLOUD_GLSL } from './glsl';

const SCREEN_VERT = /* glsl */ `
varying vec3 vDir;
varying vec3 vDirView;
void main() {
  vec2 ndc = position.xy;
  vec3 dv = vec3((ndc.x + projectionMatrix[2][0]) / projectionMatrix[0][0], (ndc.y + projectionMatrix[2][1]) / projectionMatrix[1][1], -1.0);
  vDirView = dv;
  vDir = transpose(mat3(viewMatrix)) * dv;
  gl_Position = vec4(ndc, 0.0, 1.0);
}
`;

/** The part of the ray inside the layer: (t0, t1), t1 <= t0 when it misses. Shared by the march
 *  and the composites so both agree on where the layer starts. */
const LAYER_GLSL = /* glsl */ `
uniform vec3 uCamPos;
uniform float uCamR;
uniform vec4 uCs;          // |o|^2 - R^2 for cloud base, cloud top, ground, atmosphere top
uniform int uRegime;       // camera 0 below, 1 inside, 2 above the layer
uniform float uSplit;      // distance at which the ray is split into front and back layers
vec2 layerRange(vec3 d, out float b) {
  b = dot(uCamPos, d);
  vec2 iB = raySphere(b, uCs.x);
  vec2 iT = raySphere(b, uCs.y);
  vec2 iG = raySphere(b, uCs.z);
  float t0, t1;
  if (uRegime == 0) {
    t0 = iB.y;
    t1 = iT.y;
  } else if (uRegime == 1) {
    t0 = 0.0;
    t1 = iB.x > 0.0 ? iB.x : iT.y;
  } else {
    if (iT.x <= 0.0) return vec2(1.0, 0.0);
    t0 = iT.x;
    t1 = iB.x > 0.0 ? iB.x : iT.y;
  }
  if (iG.x > 0.0) t1 = min(t1, iG.x);
  return vec2(t0, t1);
}
`;

const MARCH_FRAG = /* glsl */ `
#include <common>
${ATMOSPHERE_GLSL}
${NOISE_GLSL}
${CLOUD_GLSL}
${LAYER_GLSL}

layout(location = 0) out highp vec4 outFront;
layout(location = 1) out highp vec4 outBack;

varying vec3 vDir;
uniform vec3 uSun;
uniform mat3 uToEF;
uniform vec3 uCamEF;
uniform int uSteps;
uniform int uLightSteps;
uniform float uPixel;
uniform float uFade;       // overall opacity (fade in once textures exist)
uniform float uLimbKeep;   // share kept of the clouds seen beyond the Earth's limb (0 from high up)
uniform float uNightFill;  // night-side fill irradiance from above (moonlight, airglow)

float hgPhase(float c, float g) {
  float g2 = g * g;
  return (1.0 - g2) / (4.0 * PI * pow(max(1.0 + g2 - 2.0 * g * c, 1e-4), 1.5));
}

float lightMarch(vec3 pEF, vec3 sunEF, float lod) {
  // optical depth toward the Sun: a few steps growing geometrically (60 m .. ~2 km)
  float od = 0.0;
  float t = 0.0;
  float step = 60.0;
  for (int i = 0; i < 6; i++) {
    if (i >= uLightSteps) break;
    vec3 q = pEF + sunEF * (t + step * 0.5);
    float hq = length(q) - A_RB;
    od += cloudDensity(q, hq, max(lod, float(i) * 0.22), 1.0) * step;
    t += step;
    step *= 2.2;
  }
  return od * C_SIGMA;
}

// per-pixel constants of the march
vec3 gDirEF;
vec3 gSunEF;
float gPh0, gPh1, gPh2;
vec3 gAmbSky, gAmbGnd;
bool gAmbSet;

/* March [ta, tb]: premultiplied radiance (no air) and opacity; tm = opacity-weighted distance. */
vec4 marchSegment(float ta, float tb, int steps, float jit, out float tm) {
  const float iso = 1.0 / (4.0 * PI);
  float Tl = 1.0;
  vec3 C = vec3(0.0);
  float tw = 0.0, wsum = 0.0;
  float dt = (tb - ta) / float(steps);
  for (int i = 0; i < 128; i++) {
    if (i >= steps) break;
    float t = ta + (float(i) + jit) * dt;
    vec3 pEF = uCamEF + gDirEF * t;
    float r = length(pEF);
    float h = r - A_RB;
    // the pixel's footprint on the layer, stretched along the view where the ray meets the layer
    // at a grazing angle (area-equivalent width): cells narrower than about two footprints are
    // replaced by their mean, else they alias into salt-like dots seen from altitude
    float sinG = abs(dot(gDirEF, pEF)) / r;
    float foot = t * uPixel * inversesqrt(max(sinG, 0.04));
    float lod = smoothstep(220.0, 1500.0, max(foot, dt * 0.35)) + smoothstep(3000.0, 12000.0, foot);
    float elod = smoothstep(40.0, 300.0, max(foot, dt * 0.2));
    float dens = cloudDensity(pEF, h, lod, elod);
    if (dens > 0.002) {
      float sig = dens * C_SIGMA;
      float muS = dot(pEF, gSunEF) / r;
      if (!gAmbSet) {
        // ambient light is smooth over the layer: evaluate it once per pixel
        gAmbSky = (SUN_E * skyIrradiance(muS) + uNightFill * (1.0 - smoothstep(-0.12, 0.02, muS))) * iso;
        gAmbGnd = SUN_E * (skyIrradiance(muS) + transmittanceSun(A_RB + 2.0, muS) * max(muS, 0.0)) * 0.14 * iso;
        gAmbSet = true;
      }
      vec3 Ta = transmittanceSun(r, muS);
      float od = lightMarch(pEF, gSunEF, lod);
      // single scattering (strong forward lobe: silver linings) plus multiple-scattering octaves
      // of decreasing anisotropy that reach deeper into the cloud (after Wrenninge et al.)
      float lsun = gPh0 * exp(-od)
        + 1.9 * (0.62 * gPh1 * exp(-od * 0.3) + 0.4 * gPh2 * exp(-od * 0.12) + 0.12 * iso * exp(-od * 0.06));
      float hf = clamp((h - C_BASE) / (C_TOP - C_BASE), 0.0, 1.0);
      // sky light enters from above (dimmer deep in the cloud), ground bounce from below
      vec3 amb = gAmbSky * (0.5 + 2.3 * exp(-od * 0.15)) * mix(0.55, 1.0, hf) + gAmbGnd * mix(1.6, 0.5, hf);
      vec3 S = sig * (SUN_E * Ta * lsun + amb);
      float segT = exp(-sig * dt);
      C += Tl * (S - S * segT) / sig;
      float w = Tl * (1.0 - segT);
      tw += w * t;
      wsum += w;
      Tl *= segT;
      if (Tl < 0.01) break;
    }
  }
  tm = wsum > 1e-5 ? tw / wsum : ta;
  return vec4(C, 1.0 - Tl);
}

/* Aerial perspective between the camera and a cloud layer at mean distance tm. */
vec4 withAir(vec4 c, float b, vec3 d, float tm) {
  if (c.a <= 1e-4) return vec4(0.0);
  vec2 iA = raySphere(b, uCs.w);
  float a0 = max(0.0, iA.x);
  vec3 Tap = vec3(1.0);
  vec3 Lap = vec3(0.0);
  // samples uniform along a path inside the cloud layer; from above it, dense toward the cloud,
  // where the air is densest (dense at the camera end would starve a grazing path near the
  // horizon of samples and redden far clouds)
  if (tm > a0) Lap = integrateScattering(uCamPos, d, uSun, a0, tm, 10, 0.5, uRegime == 2 ? 2 : 0, Tap) * SUN_E;
  return vec4((Lap * c.a + Tap * c.rgb) * uFade, c.a * uFade);
}

void main() {
  outFront = vec4(0.0);
  outBack = vec4(0.0);
  vec3 d = normalize(vDir);
  float b;
  vec2 rng = layerRange(d, b);
  float t0 = rng.x, t1 = rng.y;
  if (t1 <= t0 || uFade <= 0.0) return;
  // From high up, the layer beyond the limb is thinner than a pixel of this reduced-resolution
  // march: drawn, it steps and breaks into dashes along the horizon. The clouds on the globe
  // up to the limb remain.
  float keep = raySphere(b, uCs.z).x > 0.0 ? 1.0 : uLimbKeep;
  if (keep <= 0.0) return;

  gDirEF = uToEF * d;
  gSunEF = uToEF * uSun;
  float cosT = dot(d, uSun);
  gPh0 = mix(hgPhase(cosT, 0.75), hgPhase(cosT, -0.2), 0.22);
  gPh1 = mix(hgPhase(cosT, 0.4), hgPhase(cosT, -0.1), 0.2);
  gPh2 = hgPhase(cosT, 0.15);
  gAmbSet = false;
  // white-noise jitter (a structured pattern such as interleaved gradient noise leaves visible
  // hatching inside bright clouds once upsampled)
  float jit = hash12(gl_FragCoord.xy);

  float fa = t0, fb = min(t1, uSplit);
  float ba = max(t0, uSplit), bb = t1;
  if (fb > fa) {
    int n = int(clamp((fb - fa) / 90.0, 6.0, float(uSteps)));
    float tm;
    vec4 c = marchSegment(fa, fb, n, jit, tm);
    outFront = withAir(c, b, d, tm);
  }
  if (bb > ba) {
    int n = int(clamp((bb - ba) / 90.0, 8.0, float(uSteps)));
    float tm;
    vec4 c = marchSegment(ba, bb, n, jit, tm);
    outBack = withAir(c, b, d, tm);
  }
  outFront *= keep;
  outBack *= keep;
}
`;

const COMPOSITE_FRAG = /* glsl */ `
#include <common>
${ATMOSPHERE_GLSL}
${LAYER_GLSL}
#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
uniform float logDepthBufFC;
#endif
varying vec3 vDir;
varying vec3 vDirView;
uniform sampler2D uCloudTex;
uniform sampler2D uCloudTexBack;
uniform vec2 uFullRes;
uniform vec2 uLowRes;
uniform float uBack;       // 1: the back layer (depth at least the split distance)

// small tent filter over the reduced-resolution march (hides the per-pixel jitter)
vec4 tent(sampler2D tex, vec2 uv) {
  vec2 o = 0.6 / uLowRes;
  return texture2D(tex, uv) * 0.36
    + (texture2D(tex, uv + vec2(o.x, o.y)) + texture2D(tex, uv + vec2(-o.x, o.y))
     + texture2D(tex, uv + vec2(o.x, -o.y)) + texture2D(tex, uv + vec2(-o.x, -o.y))) * 0.16;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uFullRes;
  vec3 d = normalize(vDir);
  vec3 dv = normalize(vDirView);
  float b;
  vec2 rng = layerRange(d, b);
  float t = max(rng.x, 0.0);
#ifdef DEPTH_ONLY
  // depth of the dense part of the clouds, for the transparent objects drawn after them
  if (tent(uCloudTex, uv).a > 0.6) {}
  else if (tent(uCloudTexBack, uv).a > 0.6) t = max(t, uSplit);
  else discard;
  vec4 c = vec4(0.0);
#else
  vec4 c = tent(uCloudTex, uv);
  if (c.a <= 0.002) discard;
  if (uBack > 0.5) t = max(t, uSplit);
#endif
#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
  gl_FragDepth = log2(1.0 + t * (-dv.z)) * logDepthBufFC * 0.5;
#else
  vec4 clip = projectionMatrix * vec4(dv * max(t, 0.2), 1.0);
  gl_FragDepth = clamp(0.5 * clip.z / clip.w + 0.5, 0.0, 1.0);
#endif
  gl_FragColor = vec4(c.rgb / max(c.a, 1e-4), min(c.a, 1.0));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function makeCloudUniforms(shared: Record<string, THREE.IUniform>): Record<string, THREE.IUniform> {
  return {
    uTransLUT: shared.uTransLUT,
    uMsLUT: shared.uMsLUT,
    uIrrLUT: shared.uIrrLUT,
    uSunE: shared.uSunE,
    uCoverage: shared.uCoverage,
    uNoise: shared.uNoise,
    uPadEF: shared.uPadEF,
    uCloudTime: shared.uCloudTime,
    uCamPos: shared.uCamPos,
    uCamR: shared.uCamR,
    uSun: shared.uSun,
    uToEF: shared.uToEF,
    uNightFill: shared.uNightFill,
    uPixel: { value: 0.001 },
    uCs: { value: new THREE.Vector4() },
    uCamEF: { value: new THREE.Vector3() },
    uRegime: { value: 0 },
    uSplit: { value: 0 },
    uSteps: { value: 48 },
    uLightSteps: { value: 4 },
    uFade: { value: 0 },
    uLimbKeep: { value: 1 },
    uFullRes: { value: new THREE.Vector2(1, 1) },
    uLowRes: { value: new THREE.Vector2(1, 1) },
  };
}

/** The ray march into a two-attachment, reduced-resolution target (front, back; premultiplied). */
export function makeCloudMaterial(uniforms: Record<string, THREE.IUniform>): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'space.clouds.march',
    uniforms,
    vertexShader: SCREEN_VERT,
    fragmentShader: MARCH_FRAG,
    glslVersion: THREE.GLSL3,
    depthWrite: false,
    depthTest: false,
    blending: THREE.NoBlending,
    toneMapped: false,
  });
}

/**
 * Full-resolution composite of one layer (straight alpha, depth tested with the layer's
 * per-pixel depth, no depth write), or with `depthOnly` the pass that writes the depth of the
 * dense clouds (both layers) without colour.
 */
export function makeCloudCompositeMaterial(uniforms: Record<string, THREE.IUniform>, mode: 'front' | 'back' | 'depth'): THREE.ShaderMaterial {
  const depth = mode === 'depth';
  return new THREE.ShaderMaterial({
    name: `space.clouds.${mode}`,
    uniforms: { ...uniforms, uCloudTex: { value: null }, uCloudTexBack: { value: null }, uBack: { value: mode === 'back' ? 1 : 0 } },
    vertexShader: SCREEN_VERT,
    fragmentShader: COMPOSITE_FRAG,
    defines: depth ? { DEPTH_ONLY: 1 } : {},
    transparent: true,
    blending: depth ? THREE.NoBlending : THREE.NormalBlending,
    colorWrite: !depth,
    depthWrite: depth,
    depthTest: true,
  });
}

const PROBE_FRAG = /* glsl */ `
${ATMOSPHERE_GLSL}
${CLOUD_GLSL}
uniform vec3 uCamEF;
void main() {
  float d = cloudDensity(uCamEF, length(uCamEF) - A_RB, 0.0, 0.0);
  gl_FragColor = vec4(clamp(d, 0.0, 1.0), 0.0, 0.0, 1.0);
}
`;

/** One pixel: the cloud density at the camera (read back for skyState.inCloud). */
export function makeCloudProbeMaterial(uniforms: Record<string, THREE.IUniform>): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'space.clouds.probe',
    uniforms,
    vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: PROBE_FRAG,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
    toneMapped: false,
  });
}
