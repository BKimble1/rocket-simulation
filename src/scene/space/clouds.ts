/**
 * Volumetric clouds: the cloud field of glsl.ts ray marched through the layer between
 * CLOUD_BASE and CLOUD_TOP, lit by the Sun through the atmosphere (transmittance table) with
 * soft self-shadowing, sky and ground ambient, and aerial perspective in front of them.
 *
 * The march runs on proxy geometry chosen from the camera altitude, so clouds are depth tested
 * like any transparent object:
 *   below the layer: a cap of the base shell (seen from inside), marching base -> top;
 *   above it:        a cap of the top shell, marching top -> base (the global layer from orbit);
 *   inside it:       a sphere around the camera just beyond the focus subject, plus a
 *                    full-screen overlay for the cloud between the camera and that sphere.
 * The field is Earth-fixed and continuous from the pad to orbit; nothing pops when the camera
 * climbs through the layer.
 */
import * as THREE from 'three';
import { ATMOSPHERE_GLSL, NOISE_GLSL, CLOUD_GLSL } from './glsl';

const DOME_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
uniform float uShellR;     // shell radius
uniform float uDR;         // shell radius - camera radius (double precision on the CPU)
uniform float uThetaMax;   // angular radius of the cap (rad)
uniform mat3 uLocalToRender;
uniform float uNearR;      // >0: draw a camera-centred sphere of this radius instead
varying vec3 vPos;
void main() {
  vec3 p;
  if (uNearR > 0.0) {
    // unit sphere given as (s, phi): s in 0..1 maps pole to pole
    float th = position.x * PI;
    float ph = position.y;
    p = vec3(sin(th) * cos(ph), cos(th), sin(th) * sin(ph)) * uNearR;
  } else {
    float th = uThetaMax * pow(position.x, 1.7);
    float ph = position.y;
    float s = sin(th);
    float h = sin(th * 0.5);
    // shell point relative to the camera, in a frame whose +Y is the camera's up
    p = vec3(uShellR * s * cos(ph), uDR - 2.0 * uShellR * h * h, uShellR * s * sin(ph));
  }
  vec3 w = uLocalToRender * p;
  vPos = w;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const CLOUD_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
${ATMOSPHERE_GLSL}
${NOISE_GLSL}
${CLOUD_GLSL}

varying vec3 vPos;
uniform vec3 uCamPos;
uniform float uCamR;
uniform vec3 uSun;
uniform vec4 uCs;          // |o|^2 - R^2 for cloud base, cloud top, ground, atmosphere top
uniform mat3 uToEF;
uniform vec3 uCamEF;
uniform int uRegime;       // 0 below, 1 inside, 2 above
uniform float uNear;       // inside: march starts here
uniform int uSteps;
uniform int uLightSteps;
uniform float uPixel;
uniform float uOverlay;    // 1: full-screen overlay pass (march 0..uNear)
uniform float uSigma;      // extinction per unit density (1/m)
uniform float uFade;       // overall opacity (fade in once textures exist)
uniform vec2 uResolution;

#ifdef OVERLAY
varying vec3 vDirOv;
#endif

float hgPhase(float c, float g) {
  float g2 = g * g;
  return (1.0 - g2) / (4.0 * PI * pow(max(1.0 + g2 - 2.0 * g * c, 1e-4), 1.5));
}

float lightMarch(vec3 p, vec3 pEF, vec3 sunEF, float lod) {
  // optical depth toward the Sun: a few steps growing geometrically
  float od = 0.0;
  float t = 0.0;
  float step = 60.0;
  for (int i = 0; i < 6; i++) {
    if (i >= uLightSteps) break;
    float ts = t + step * 0.5;
    vec3 q = pEF + sunEF * ts;
    float hq = length(q) - A_RB;
    od += cloudDensity(q, hq, max(lod, float(i) * 0.25), 1.0) * step;
    t += step;
    step *= 2.1;
  }
  return od * uSigma;
}

void main() {
#ifdef OVERLAY
  vec3 d = normalize(vDirOv);
#else
  vec3 d = normalize(vPos);
#endif
  float b = dot(uCamPos, d);
  vec2 iB = raySphere(b, uCs.x);
  vec2 iT = raySphere(b, uCs.y);
  vec2 iG = raySphere(b, uCs.z);
  float t0, t1;
  if (uOverlay > 0.5) {
    t0 = 0.0;
    t1 = uNear;
    if (iB.x > 0.0) t1 = min(t1, iB.x);
    if (iT.y > 0.0) t1 = min(t1, iT.y);
  } else if (uRegime == 0) {
    t0 = iB.y;
    t1 = iT.y;
  } else if (uRegime == 1) {
    t0 = uNear;
    t1 = iB.x > 0.0 ? iB.x : iT.y;
  } else {
    if (iT.x <= 0.0) discard;
    t0 = iT.x;
    t1 = iB.x > 0.0 ? iB.x : iT.y;
  }
  if (iG.x > 0.0) t1 = min(t1, iG.x);
  if (t1 <= t0 || uFade <= 0.0) discard;

  vec3 dEF = uToEF * d;
  vec3 sunEF = uToEF * uSun;
  float cosT = dot(d, uSun);
  // phase: forward lobe (silver lining), back lobe, isotropic share
  float ph = mix(hgPhase(cosT, 0.6), hgPhase(cosT, -0.25), 0.3);

  int steps = uSteps;
  float len = t1 - t0;
  if (uOverlay > 0.5) steps = 8;
  else steps = int(clamp(len / 120.0, 6.0, float(uSteps)));
  float dt = len / float(steps);
  float jit = hash12(gl_FragCoord.xy + fract(uCamEF.xz * 0.0) );

  vec3 T = vec3(1.0);
  float Tl = 1.0;
  vec3 C = vec3(0.0);
  float tw = 0.0, wsum = 0.0;

  for (int i = 0; i < 128; i++) {
    if (i >= steps) break;
    float t = t0 + (float(i) + jit) * dt;
    vec3 pEF = uCamEF + dEF * t;
    float r = length(pEF);
    float h = r - A_RB;
    float foot = t * uPixel;
    float lod = smoothstep(120.0, 1400.0, max(foot, dt * 0.5));
    float elod = smoothstep(40.0, 260.0, max(foot, dt * 0.25));
    float dens = cloudDensity(pEF, h, lod, elod);
    if (dens > 0.003) {
      float sig = dens * uSigma;
      float muS = dot(pEF, sunEF) / r;
      vec3 Ta = transmittanceSun(r, muS);
      float od = lightMarch(pEF, pEF, sunEF, lod);
      // single scattering (phase, silver lining toward the Sun) plus a diffuse multiple-
      // scattering term that decays slowly with depth and needs optically thick cloud around
      float thick = 1.0 - exp(-sig * 320.0);
      float ms = thick * (0.17 * exp(-od * 0.08) + 0.05 * exp(-od * 0.02));
      float lsun = ph * exp(-od) + ms;
      float hf = clamp((h - C_BASE) / (C_TOP - C_BASE), 0.0, 1.0);
      vec3 Esky = SUN_E * skyIrradiance(muS);
      vec3 Egnd = SUN_E * (skyIrradiance(muS) + transmittanceSun(A_RB + 2.0, muS) * max(muS, 0.0)) * 0.12;
      vec3 amb = (Esky * (0.45 + 0.55 * hf) + Egnd * (1.0 - hf)) / (4.0 * PI) * (1.0 + 1.5 * thick);
      vec3 S = sig * (SUN_E * Ta * lsun + amb);
      float segT = exp(-sig * dt);
      vec3 inc = (S - S * segT) / max(sig, 1e-8);
      C += Tl * inc;
      float w = Tl * (1.0 - segT);
      tw += w * t;
      wsum += w;
      Tl *= segT;
      if (Tl < 0.015) break;
    }
  }
  if (wsum <= 1e-4) discard;
  float tm = tw / wsum;
  // aerial perspective between the camera and the cloud
  vec2 iA = raySphere(b, uCs.w);
  float a0 = max(0.0, iA.x);
  vec3 Tap = vec3(1.0);
  vec3 Lap = vec3(0.0);
  if (tm > a0) Lap = integrateScattering(uCamPos, d, uSun, a0, tm, 12, 0.5, uCamR < A_RT ? 1 : 2, Tap) * SUN_E;
  float alpha = (1.0 - Tl) * uFade;
  vec3 col = (Lap * (1.0 - Tl) + Tap * C) * uFade;
  gl_FragColor = vec4(col, alpha);
  #include <logdepthbuf_fragment>
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const OVERLAY_VERT = /* glsl */ `
varying vec3 vDirOv;
varying vec3 vPos;
void main() {
  vec2 ndc = position.xy;
  vec3 dv = vec3((ndc.x + projectionMatrix[2][0]) / projectionMatrix[0][0], (ndc.y + projectionMatrix[2][1]) / projectionMatrix[1][1], -1.0);
  vDirOv = transpose(mat3(viewMatrix)) * dv;
  vPos = vDirOv;
  gl_Position = vec4(ndc, 0.0, 1.0);
}
`;

const COMPOSITE_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D uCloudTex;
uniform vec2 uFullRes;
varying vec3 vPos;
uniform vec2 uLowRes;
void main() {
  vec2 uv = gl_FragCoord.xy / uFullRes;
  vec2 o = 0.6 / uLowRes;
  // small tent filter over the reduced-resolution march (hides the per-pixel jitter)
  vec4 c = texture2D(uCloudTex, uv) * 0.36
    + (texture2D(uCloudTex, uv + vec2(o.x, o.y)) + texture2D(uCloudTex, uv + vec2(-o.x, o.y))
     + texture2D(uCloudTex, uv + vec2(o.x, -o.y)) + texture2D(uCloudTex, uv + vec2(-o.x, -o.y))) * 0.16;
  if (c.a <= 0.0005) discard;
  gl_FragColor = c;
  #include <logdepthbuf_fragment>
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
    uPixel: { value: 0.001 },
    uCs: { value: new THREE.Vector4() },
    uCamEF: { value: new THREE.Vector3() },
    uRegime: { value: 0 },
    uNear: { value: 200 },
    uSteps: { value: 48 },
    uLightSteps: { value: 4 },
    uOverlay: { value: 0 },
    uSigma: { value: 0.012 },
    uFade: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uShellR: { value: 1 },
    uDR: { value: 1 },
    uThetaMax: { value: 0.1 },
    uLocalToRender: { value: new THREE.Matrix3() },
    uNearR: { value: 0 },
    uCloudTex: { value: null },
    uFullRes: { value: new THREE.Vector2(1, 1) },
    uLowRes: { value: new THREE.Vector2(1, 1) },
  };
}

function premultiplied(m: THREE.ShaderMaterial) {
  m.blending = THREE.CustomBlending;
  m.blendEquation = THREE.AddEquation;
  m.blendSrc = THREE.OneFactor;
  m.blendDst = THREE.OneMinusSrcAlphaFactor;
  m.blendSrcAlpha = THREE.OneFactor;
  m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
}

/** The ray march, rendered into a reduced-resolution target (no depth test, premultiplied output). */
export function makeCloudMaterial(uniforms: Record<string, THREE.IUniform>): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'space.clouds.march',
    uniforms,
    vertexShader: DOME_VERT,
    fragmentShader: CLOUD_FRAG.replace('#include <logdepthbuf_fragment>', ''),
    depthWrite: false,
    depthTest: false,
    blending: THREE.NoBlending,
    side: THREE.DoubleSide,
  });
}

/** Full-resolution, depth-tested proxy that composites the marched clouds over the scene. */
export function makeCloudCompositeMaterial(uniforms: Record<string, THREE.IUniform>): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    name: 'space.clouds',
    uniforms,
    vertexShader: DOME_VERT,
    fragmentShader: COMPOSITE_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
  });
  premultiplied(m);
  return m;
}

export function makeCloudOverlayMaterial(uniforms: Record<string, THREE.IUniform>): THREE.ShaderMaterial {
  const u = { ...uniforms, uOverlay: { value: 1 } };
  const m = new THREE.ShaderMaterial({
    name: 'space.cloudOverlay',
    uniforms: u,
    vertexShader: OVERLAY_VERT,
    fragmentShader: CLOUD_FRAG.replace('#include <logdepthbuf_fragment>', ''),
    defines: { OVERLAY: 1 },
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });
  premultiplied(m);
  return m;
}

/** Polar grid (s, phi) for the shell cap; s is remapped in the vertex shader. */
export function capGeometry(rings: number, segs: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= rings; i++)
    for (let j = 0; j <= segs; j++) pos.push(i / rings, (j / segs) * Math.PI * 2, 0);
  for (let i = 0; i < rings; i++)
    for (let j = 0; j < segs; j++) {
      const a = i * (segs + 1) + j;
      const b = a + segs + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

/** Unit sphere as (s, phi) pairs for the camera-centred proxy. */
export function nearSphereGeometry(rings: number, segs: number): THREE.BufferGeometry {
  return capGeometry(rings, segs);
}
