/**
 * The background pass: stars, Sun, atmosphere (sky from inside, limb from outside) and the
 * Earth globe, ray traced per pixel on a full-screen triangle.
 *
 * The globe is an exact sphere (no facets, so it meets the local terrain at the right height);
 * it writes its true logarithmic depth so everything drawn afterwards (terrain, vehicles,
 * clouds) is occluded correctly, including objects behind the Earth. Inside
 * LOCAL_TERRAIN.innerKm of the pad the globe writes no depth: the local terrain draws there.
 * The Moon mesh is drawn just before this pass; the pass blends the air in front of it.
 *
 * Output is premultiplied (opaque except over the Moon). Radiance is in scene light units
 * (tone mapped by the renderer like everything else).
 */
import * as THREE from 'three';
import { ATMOSPHERE_GLSL, NOISE_GLSL, CLOUD_GLSL, CLOUD_BASE, CLOUD_TOP } from './glsl';
import { SKYVIEW_GLSL } from './skyView';
import { atmosphereTextures, ATMO } from './atmosphere';

const VERT = /* glsl */ `
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

const FRAG = /* glsl */ `
${ATMOSPHERE_GLSL}
${NOISE_GLSL}
${CLOUD_GLSL}
${SKYVIEW_GLSL}

#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
uniform float logDepthBufFC;
#endif

varying vec3 vDir;
varying vec3 vDirView;

uniform vec3 uCamPos;       // camera relative to the Earth's centre (render axes = frame I)
uniform float uCamR;        // |uCamPos| (double precision on the CPU)
uniform vec3 uSun;          // unit direction to the Sun
uniform vec4 uC;            // |o|^2 - R^2 for: ground, atmosphere top, cloud mid, moon
uniform mat3 uToEF;         // render axes -> Earth-fixed (globe texture frame)
uniform mat3 uToEq;         // render axes -> equatorial (star map)
uniform vec3 uMoonRel;      // camera relative to the Moon's centre
uniform float uMoonR;
uniform vec3 uPadRel;       // pad position relative to the camera
uniform vec2 uHole;         // terrain disk: inner radius (no globe depth), outer radius (depth pushed back)
uniform float uHoleDebug;
uniform int uSteps;
uniform float uPixel;       // angular size of a pixel (rad)
uniform float uStarGain;
uniform float uStarVis;     // 0..1 overall star visibility (exposure adaptation)
uniform float uAirglow;
uniform float uNightFill;   // night-side fill irradiance on the ground (moonlight, airglow)
uniform float uCloudsOn;
uniform vec3 uSunViewT;     // transmittance from the camera toward the Sun
uniform sampler2D uDay;
uniform sampler2D uNight;
uniform sampler2D uWater;
uniform sampler2D uStars;

const float ALBEDO_SCALE = 0.72;
const float NIGHT_GAIN = 0.035;

vec4 sampleEquirect(sampler2D tex, vec3 n) {
  // n: unit vector in the map frame (+X lon 0, +Y north, -Z lon 90E); seam-free gradients
  float lon = atan(-n.z, n.x);
  float lat = asin(clamp(n.y, -1.0, 1.0));
  vec2 uv = vec2(0.5 + lon / (2.0 * PI), 0.5 + lat / PI);
  float u2 = fract(uv.x + 0.5);
  vec2 dx = dFdx(uv), dy = dFdy(uv);
  float dx2 = dFdx(u2), dy2 = dFdy(u2);
  if (abs(dx2) < abs(dx.x)) dx.x = dx2;
  if (abs(dy2) < abs(dy.x)) dy.x = dy2;
  return textureGrad(tex, uv, dx, dy);
}

vec3 starsAt(vec3 d) {
  vec3 q = uToEq * d;
  float ra = atan(q.y, q.x);
  float dec = asin(clamp(q.z, -1.0, 1.0));
  vec2 uv = vec2(fract(0.5 + ra / (2.0 * PI)), 0.5 + dec / PI);
  float u2 = fract(uv.x + 0.5);
  vec2 dx = dFdx(uv), dy = dFdy(uv);
  float dx2 = dFdx(u2), dy2 = dFdy(u2);
  if (abs(dx2) < abs(dx.x)) dx.x = dx2;
  if (abs(dy2) < abs(dy.x)) dy.x = dy2;
  vec3 s;
  // pixels per map texel (the map has 8 texels per degree: a narrow lens magnifies it 2-9x)
  vec2 ts = vec2(textureSize(uStars, 0));
  float mag = 1.0 / max(max(length(dx * ts), length(dy * ts)), 1e-6);
  if (mag < 1.3) {
    s = textureGrad(uStars, uv, dx, dy).rgb;
  } else {
    // magnified, bilinear filtering turns each star into a soft blob several pixels wide (up to
    // 25 px through a 10 deg lens). Keep stars as points: interpolate the four nearest texels,
    // then sharpen the profile toward the brightest of them (q = 1 at a star's centre texel,
    // falling about 0.7 per texel, 0.7 / mag per pixel), so a star stays about 1.5 px across at
    // any field of view. The peak keeps its brightness; the blob's skirt is removed.
    vec2 p = uv * ts - 0.5;
    vec2 f = fract(p);
    ivec2 i0 = ivec2(floor(p));
    int W = int(ts.x);
    int x0 = i0.x < 0 ? W - 1 : min(i0.x, W - 1);
    int x1 = x0 + 1 >= W ? 0 : x0 + 1;
    int y0 = clamp(i0.y, 0, int(ts.y) - 1), y1 = clamp(i0.y + 1, 0, int(ts.y) - 1);
    vec3 a = texelFetch(uStars, ivec2(x0, y0), 0).rgb;
    vec3 b = texelFetch(uStars, ivec2(x1, y0), 0).rgb;
    vec3 c = texelFetch(uStars, ivec2(x0, y1), 0).rgb;
    vec3 e = texelFetch(uStars, ivec2(x1, y1), 0).rgb;
    s = mix(mix(a, b, f.x), mix(c, e, f.x), f.y);
    float peak = max(max(max(a.r, a.g), max(b.r, b.g)), max(max(c.r, c.g), max(e.r, e.g)));
    float q = clamp(max(s.r, s.g) / max(peak, 1e-5), 0.0, 1.0);
    s *= pow(q, 1.5 * (mag - 1.0));
  }
  // steepen: keep point stars, drop the scanned background floor
  float l = max(max(s.r, s.g), s.b);
  float k = smoothstep(0.004, 0.08, l);
  return s * k * uStarGain;
}

float ggx(float NdotH, float a) {
  float a2 = a * a;
  float d = NdotH * NdotH * (a2 - 1.0) + 1.0;
  return a2 / (PI * d * d);
}

vec3 earthSurface(vec3 p, vec3 n, vec3 d, float padDist) {
  vec3 nEF = normalize(uToEF * n);
  vec3 day = sampleEquirect(uDay, nEF).rgb;
  float water = sampleEquirect(uWater, nEF).r;
  vec3 night = sampleEquirect(uNight, nEF).rgb;

  // Blue Marble oceans show bathymetry: flatten deep water to a dark navy, keep shallow banks
  float shallow = clamp((day.g - 0.55 * day.b) * 6.0, 0.0, 1.0);
  vec3 deep = vec3(0.0045, 0.0105, 0.030);
  vec3 ocean = mix(deep, day * 0.55, 0.12 + 0.55 * shallow);
  vec3 albedo = mix(day * ALBEDO_SCALE, ocean, water);

  float muS = dot(n, uSun);
  vec3 Ts = transmittanceSun(A_RB + 2.0, muS);
  // cloud shadow: where the ray to the Sun crosses the middle of the cloud layer (not over the
  // local terrain's extent: the cloud-shadow pass of clouds.ts darkens the terrain and the globe
  // there, handing over to this one across the same 2.5 km at the terrain's outer radius)
  float shadow = 1.0;
  float gW = smoothstep(uHole.y - 2500.0, uHole.y, padDist);
  if (uCloudsOn > 0.5 && muS > -0.05 && gW > 0.0) {
    float hMid = ${((CLOUD_BASE + CLOUD_TOP) * 0.5).toFixed(1)};
    float ts = hMid / max(muS, 0.08);
    vec3 pc = uToEF * (uCamPos + p + uSun * ts);
    float fp = length(p) * uPixel / max(-dot(n, d), 0.2);
    float lodS = smoothstep(150.0, 1500.0, fp) + smoothstep(3000.0, 12000.0, fp);
    shadow = 1.0 - 0.8 * cloudColumn(pc, lodS) * gW;
  }
  vec3 Esun = SUN_E * Ts * max(muS, 0.0);
  vec3 Esky = SUN_E * skyIrradiance(muS);
  vec3 col = albedo / PI * (Esun * shadow + Esky * mix(1.0, 0.75, 1.0 - shadow));
  // the faint night fill the vehicles get in Earth's shadow, so the night side reads as a dark
  // globe (land, coasts) under the city lights rather than a hole
  col += albedo / PI * uNightFill * (1.0 - smoothstep(-0.12, 0.02, muS));

  // sea: sun glint on a wind-roughened surface, and the sky's reflection
  if (water > 0.01) {
    vec3 v = -d;
    vec3 h = normalize(v + uSun);
    float NdotL = max(muS, 0.0);
    float NdotV = max(dot(n, v), 1e-3);
    float NdotH = max(dot(n, h), 0.0);
    float VdotH = max(dot(v, h), 0.0);
    float a = 0.22;
    float F = 0.02 + 0.98 * pow(1.0 - VdotH, 5.0);
    float k = a * 0.5;
    float G = NdotL / (NdotL * (1.0 - k) + k) * NdotV / (NdotV * (1.0 - k) + k);
    vec3 spec = SUN_E * Ts * shadow * ggx(NdotH, a) * F * G / (4.0 * NdotV);
    float Fv = 0.02 + 0.98 * pow(1.0 - NdotV, 5.0);
    vec3 skyRefl = SUN_E * skyIrradiance(muS) / PI * 1.4;
    col += water * (spec + Fv * skyRefl);
  }
  // city lights come on after sunset (civil twilight), under the night side only
  float nightK = 1.0 - smoothstep(-0.16, -0.015, muS);
  vec3 lights = night * night * NIGHT_GAIN * nightK * (1.0 - 0.9 * water);
  if (nightK > 0.0 && max(lights.r, lights.g) > 0.0) {
    // below the map's 20 km texels: break each blob into clusters of towns (cellular noise at
    // 12, 6 and 3 km, mean about 1); each scale fades out before a pixel resolves fewer than
    // about four of its cells, so the lights never glitter
    float fp = length(p) * uPixel / max(-dot(n, d), 0.2);
    if (fp < 6000.0) {
      vec4 tz = texture(uNoise, nEF * (A_RB / 48000.0));
      float x = mix(tz.g, 0.5, smoothstep(2500.0, 6000.0, fp)) * 0.35
              + mix(tz.b, 0.5, smoothstep(1200.0, 3000.0, fp)) * 0.35
              + mix(tz.a, 0.5, smoothstep(600.0, 1500.0, fp)) * 0.3;
      lights *= mix(1.0, 8.0 * x * x * x, 1.0 - smoothstep(2500.0, 6000.0, fp));
    }
  }
  col += lights;
  return col;
}

/* The ground seen along d at distance tG (a hit, or the closest approach for a ray grazing just
   past the limb): aerial perspective plus the lit surface; depth for the depth buffer. */
vec3 groundColor(vec3 d, vec3 dvn, vec2 iA, float tG, bool inside, out float depth) {
  vec3 p = d * tG;
  vec3 n = normalize(uCamPos + p);
  float padDist = length(p - uPadRel);
  // under the local terrain (opaque, drawn over this) a short, cheap march is enough: the
  // colour only shows while the terrain is loading or in the dev harness
  int steps = padDist < uHole.x ? min(uSteps, 4) : uSteps;
  vec3 T = vec3(1.0);
  vec3 L = vec3(0.0);
  float tStart = max(0.0, iA.x);
  // samples uniform along a low path, dense toward the ground when looking down from altitude
  int warp = inside && uCamR - A_RB < 1000.0 ? 0 : 2;
  if (iA.y > 0.0 && tG > tStart) L = integrateScattering(uCamPos, d, uSun, tStart, tG, steps, 0.5, warp, T) * SUN_E;
  vec3 col = L + T * earthSurface(p, n, d, padDist);
  depth = 1.0;
  if (padDist < uHole.x) {
    // the local terrain draws here: no depth, so it always wins (clean edge at its inner radius)
    if (uHoleDebug > 0.5) col = mix(col, vec3(1.0, 0.0, 1.0), 0.6);
  } else {
    // push the globe back a hair under the terrain's fading edge so the terrain always wins
    float push = padDist < uHole.y ? 1.0 + 3e-4 : 1.0;
    float w = tG * (-dvn.z);
#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
    depth = log2(1.0 + w * push) * logDepthBufFC * 0.5;
#else
    vec4 clip = projectionMatrix * vec4(dvn * tG * push, 1.0);
    depth = clamp(0.5 * clip.z / clip.w + 0.5, 0.0, 1.0);
#endif
  }
  return col;
}

/* Sky (sky-view table), stars, Sun, and the air in front of the Moon when the ray meets it. */
vec3 skyColor(vec3 d, vec3 dvn, bool hitM, vec2 iM, out float alpha, out float depth) {
  vec4 sv = texture2D(uSkyView, skyViewUV(d));
  vec3 col = sv.rgb;
  float Tavg = sv.a;
  alpha = 1.0;
  depth = 1.0;
  if (hitM) {
    // the Moon (drawn before this pass) shows through the air: the air's light adds to the
    // attenuated Moon (premultiplied), so a new Moon vanishes into the daytime sky as it should
    alpha = 1.0 - Tavg;
    float w = max(iM.x, 0.0) * (-dvn.z);
#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
    depth = log2(1.0 + w) * logDepthBufFC * 0.5;
#endif
    return col;
  }
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
#ifndef ENV_MODE
  // gone against any daylit or twilight sky (the eye and camera adapt to the sky)
  col += Tavg * starsAt(d) * uStarVis * exp(-lum * 150.0);
#endif
  float sinA = length(cross(d, uSun));
  float cosA = dot(d, uSun);
  if (cosA > 0.0) {
#ifdef ENV_MODE
    // a soft sun spot for reflections (the directional light carries the sharp highlight)
    col += uSunViewT * SUN_E * 0.25 * exp(-sinA / 0.02) / (2.0 * PI * 0.0004);
#else
    float edge = max(uPixel * 0.75, 1e-5);
    float disk = smoothstep(A_SUN_R + edge, A_SUN_R - edge, sinA);
    float rr = clamp(sinA / A_SUN_R, 0.0, 1.0);
    float limb = 1.0 - 0.6 * (1.0 - sqrt(1.0 - rr * rr));
    vec3 sunRad = SUN_E / (PI * A_SUN_R * A_SUN_R) * limb;
    col += min(uSunViewT * sunRad * disk, vec3(90.0));
    // restrained glare of the optics around the disk (no lens-flare ghosts): a core that burns
    // out to about 0.8 deg, a halo to about 2 deg and a faint wide skirt. Without it the Sun is a
    // 7-pixel dot pasted on the sky, which reads as a small lamp, not a star 100000 times
    // brighter than the sky around it.
    float g = 9.0 * exp(-sinA / 0.0035) + 0.3 * exp(-sinA / 0.012) + 0.05 * exp(-sinA / 0.05);
    col += uSunViewT * SUN_E * g;
#endif
  }
  return col;
}

void main() {
  vec3 d = normalize(vDir);
  vec3 dvn = normalize(vDirView);
  float b = dot(uCamPos, d);
  vec2 iG = raySphere(b, uC.x);
  vec2 iA = raySphere(b, uC.y);
  bool hitG = iG.x > 0.0;
  // Moon (slightly enlarged so the mesh's antialiased edge is blended, not overwritten)
  float bm = dot(uMoonRel, d);
  vec2 iM = raySphere(bm, uC.w);
  bool hitM = iM.y > 0.0;
#ifdef ENV_MODE
  hitM = false;
#endif
  if (hitM && hitG && iM.x > iG.x) hitM = false;

  // pixel coverage of the Earth's silhouette, antialiased analytically: the ray's distance from
  // the limb (b^2 - c = -(p^2 - R^2), p = the ray's closest approach to the centre) over the
  // tangent length, in pixels. The limb is a long, high-contrast edge from every altitude.
  float gCov = hitG ? 1.0 : 0.0;
  if (b < 0.0 && !hitM) {
    float disc = b * b - uC.x;
    gCov = clamp(0.5 + disc / (2.0 * A_RB * sqrt(max(uC.x, 1.0)) * max(uPixel, 1e-7)), 0.0, 1.0);
  }
  if (hitM) gCov = 0.0;

  bool inside = uCamR < A_RT;
  vec3 col = vec3(0.0);
  float alpha = 1.0;
  float depth = 1.0;
  if (gCov > 0.0) {
    // a grazing ray just past the limb shades the closest point (just above the ground)
    float tG = hitG ? iG.x : -b;
    col = groundColor(d, dvn, iA, tG, inside, depth);
  }
  if (gCov < 1.0) {
    float aS, dS;
    vec3 cS = skyColor(d, dvn, hitM, iM, aS, dS);
    col = mix(cS, col, gCov);
    alpha = mix(aS, 1.0, gCov);
    if (gCov < 0.5) depth = dS;
  }
  // night-side airglow: a thin shell at 86-100 km, seen edge-on at the limb
  if (uAirglow > 0.0 && !hitM) {
    float r1 = A_RB + 100000.0, r0 = A_RB + 86000.0;
    vec2 a1 = raySphere(b, uC.y + (A_RT - r1) * (A_RT + r1));
    vec2 a0 = raySphere(b, uC.y + (A_RT - r0) * (A_RT + r0));
    float lim = hitG ? iG.x : 1e12;
    float len = 0.0;
    if (a1.y > 0.0) {
      float s0 = max(a1.x, 0.0), s1 = min(a1.y, lim);
      len = max(0.0, s1 - s0);
      if (a0.y > 0.0) len -= max(0.0, min(a0.y, lim) - max(a0.x, 0.0));
    }
    vec3 pm = uCamPos + d * max(0.0, (a1.x + a1.y) * 0.5);
    float night = 1.0 - smoothstep(-0.25, 0.05, dot(normalize(pm), uSun));
    col += vec3(0.35, 1.0, 0.45) * 2.2e-9 * max(len, 0.0) * night * uAirglow;
  }

#ifdef ENV_MODE
  gl_FragColor = vec4(col, 1.0);
#else
  gl_FragColor = vec4(col, alpha);
  gl_FragDepth = depth;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  // half-LSB dither of the 8-bit output: the sky's slow gradients otherwise band into contours
  gl_FragColor.rgb += (ign(gl_FragCoord.xy) - 0.5) / 255.0;
#endif
}
`;

export interface SkyUniforms {
  [k: string]: THREE.IUniform;
}

export function makeSkyUniforms(): SkyUniforms {
  const lut = atmosphereTextures();
  return {
    uTransLUT: { value: lut.trans },
    uMsLUT: { value: lut.ms },
    uIrrLUT: { value: lut.irr },
    uCamPos: { value: new THREE.Vector3(0, ATMO.bottom + 2, 0) },
    uCamR: { value: ATMO.bottom + 2 },
    uSun: { value: new THREE.Vector3(0, 1, 0) },
    uC: { value: new THREE.Vector4() },
    uToEF: { value: new THREE.Matrix3() },
    uToEq: { value: new THREE.Matrix3() },
    uMoonRel: { value: new THREE.Vector3(0, 0, 1e9) },
    uMoonR: { value: 1 },
    uPadRel: { value: new THREE.Vector3() },
    uHole: { value: new THREE.Vector2(42000, 52000) },
    uHoleDebug: { value: 0 },
    uSteps: { value: 12 },
    uPixel: { value: 0.001 },
    uStarGain: { value: 1 },
    uStarVis: { value: 1 },
    uAirglow: { value: 1 },
    uNightFill: { value: 0 },
    uCloudsOn: { value: 0 },
    uDay: { value: null },
    uNight: { value: null },
    uWater: { value: null },
    uStars: { value: null },
    uCoverage: { value: null },
    uNoise: { value: null },
    uPadEF: { value: new THREE.Vector3(0, 1, 0) },
    uPadSunEF: { value: new THREE.Vector3(0, 1, 0) },
    uCloudTime: { value: 0 },
    uSunE: { value: new THREE.Vector3(4.4, 4.4, 4.4) },
    uSunViewT: { value: new THREE.Vector3(1, 1, 1) },
    uSkyView: { value: null },
    uUp: { value: new THREE.Vector3(0, 1, 0) },
    uSunH: { value: new THREE.Vector3(1, 0, 0) },
    uSideH: { value: new THREE.Vector3(0, 0, 1) },
    uZh: { value: Math.PI / 2 },
    uSkyViewSize: { value: new THREE.Vector2(192, 108) },
  };
}

/** Main-view material (depth, blending) or environment-map material (ENV_MODE). */
export function makeSkyMaterial(uniforms: SkyUniforms, env = false): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    name: env ? 'space.skyEnv' : 'space.sky',
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    defines: env ? { ENV_MODE: 1 } : {},
    depthTest: false,
    depthWrite: !env,
    toneMapped: !env,
  });
  if (!env) {
    // premultiplied: the sky is opaque (alpha 1) except over the Moon, where the air in front
    // adds its light to the Moon attenuated by the air's transmittance
    m.blending = THREE.CustomBlending;
    m.blendEquation = THREE.AddEquation;
    m.blendSrc = THREE.OneFactor;
    m.blendDst = THREE.OneMinusSrcAlphaFactor;
    m.blendSrcAlpha = THREE.OneFactor;
    m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  }
  return m;
}

/** A clip-space triangle covering the screen. */
export function fullScreenGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  return g;
}
