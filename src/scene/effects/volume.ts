/**
 * Ray-marched exhaust volume inside a bounding frustum mesh (plume-local frame: origin at the
 * nozzle exit centre, +Y along the flow). One shader for every plume, parameterised:
 *
 *   - analytic Gaussian emitters (hot core, shock diamonds, the green TEA-TEB ignition flash):
 *     integrated in closed form along the view ray, so thin bright features never alias;
 *   - a marched turbulent flame (afterburning soot glow, colour cooling downstream);
 *   - a marched thin glow (vacuum and hypergolic plumes);
 *   - marched smoke and a sunlit expanded envelope (absorbing and scattering).
 *
 * The plume radius follows R(y) = Rc + (Rbal - Rc)(1 - exp(-y/Lb)) + y * spread, the same law
 * the particles use (physics.ts). Everything below the ground plane is cut. The output is
 * premultiplied: scattered light occludes, emission adds.
 */
import * as THREE from 'three';
import { NOISE, OUTPUT } from './glsl';

export const MAX_BLOBS = 8;

/** Development switch: draw the bounding frustums instead of the volumes. */
export const volumeDebug = { mode: 0 };

const VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
uniform float uY0;
uniform float uY1;
uniform float uRb0;
uniform float uRb1;
varying vec3 vLocal;
void main() {
  float u = position.y + 0.5;
  float y = mix(uY0, uY1, u);
  float r = mix(uRb0, uRb1, u);
  vec3 p = vec3(position.x * r, y, position.z * r);
  vLocal = p;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
${NOISE}
${OUTPUT}
uniform float uY0;
uniform float uY1;
uniform float uRb0;
uniform float uRb1;
uniform vec3 uCam;
uniform vec4 uGround;
uniform float uSteps;
uniform vec3 uAdv;      // two advection phases (m) and their blend weight (bounded flow noise)
uniform float uSeed;
uniform float uOpacity;
// shape
uniform float uRc;
uniform float uRbal;
uniform float uLb;
uniform float uSpread;
// analytic emitters: (y centre, sigma y, sigma r, intensity)
uniform vec4 uBlob[${MAX_BLOBS}];
uniform vec3 uBlobCol[${MAX_BLOBS}];
// flame
uniform float uFlameI;
uniform float uFlameSigma;
uniform vec2 uFlameIn;
uniform float uFlameLen;
uniform vec3 uFlameA;
uniform vec3 uFlameB;
uniform float uTurb;
uniform float uFlow;
uniform float uNoiseK;
uniform float uRadK;
// thin glow
uniform float uGlowI;
uniform float uGlowDecay;
uniform vec3 uGlowCore;
uniform vec3 uGlowRim;
// smoke and envelope
uniform float uSmokeSigma;
uniform vec2 uSmokeIn;
uniform vec3 uSmokeA;
uniform vec3 uSmokeB;
uniform float uScatSigma;
uniform vec3 uScatAlb;
uniform float uEndFade;
uniform float uSootOuter;
uniform float uDebug;
// light (already divided by pi)
uniform vec3 uSunLocal;
uniform vec3 uSunCol;
uniform vec3 uAmb;
varying vec3 vLocal;

float plumeR(float y) {
  float yy = max(y, 0.0);
  return uRc + (uRbal - uRc) * (1.0 - exp(-yy / uLb)) + yy * uSpread;
}

vec2 frustum(vec3 o, vec3 d) {
  float k = (uRb1 - uRb0) / (uY1 - uY0);
  float ka = uRb0 - k * uY0;
  float tmin = 1e20;
  float tmax = -1e20;
  float rr = ka + k * o.y;
  float A = d.x * d.x + d.z * d.z - k * k * d.y * d.y;
  float B = o.x * d.x + o.z * d.z - k * rr * d.y;
  float C = o.x * o.x + o.z * o.z - rr * rr;
  if (abs(A) > 1e-7) {
    float disc = B * B - A * C;
    if (disc >= 0.0) {
      float s = sqrt(disc);
      float ta = (-B - s) / A;
      float tb = (-B + s) / A;
      float ya = o.y + ta * d.y;
      float yb = o.y + tb * d.y;
      if (ya >= uY0 && ya <= uY1 && ka + k * ya >= 0.0) { tmin = min(tmin, ta); tmax = max(tmax, ta); }
      if (yb >= uY0 && yb <= uY1 && ka + k * yb >= 0.0) { tmin = min(tmin, tb); tmax = max(tmax, tb); }
    }
  }
  if (abs(d.y) > 1e-7) {
    float t0 = (uY0 - o.y) / d.y;
    vec3 p0 = o + t0 * d;
    if (dot(p0.xz, p0.xz) <= uRb0 * uRb0) { tmin = min(tmin, t0); tmax = max(tmax, t0); }
    float t1 = (uY1 - o.y) / d.y;
    vec3 p1 = o + t1 * d;
    if (dot(p1.xz, p1.xz) <= uRb1 * uRb1) { tmin = min(tmin, t1); tmax = max(tmax, t1); }
  }
  return vec2(tmin, tmax);
}

void main() {
  #include <logdepthbuf_fragment>
  vec3 o = uCam;
  vec3 d = normalize(vLocal - uCam);
  vec2 tt = frustum(o, d);
  if (uDebug > 0.5 && uDebug < 1.5) {
    gl_FragColor = tt.y > tt.x ? vec4(0.0, 0.25, 0.0, 0.25) : vec4(0.3, 0.0, 0.0, 0.3);
    return;
  }
  float t0 = max(tt.x, 0.0);
  float t1 = tt.y;
  // cut at the ground
  float g0 = dot(uGround.xyz, o) + uGround.w;
  float gd = dot(uGround.xyz, d);
  if (abs(gd) > 1e-6) {
    float tg = -g0 / gd;
    if (gd > 0.0) t0 = max(t0, tg); else t1 = min(t1, tg);
  } else if (g0 < 0.0) discard;
  if (t1 <= t0) discard;

  vec3 emit = vec3(0.0);
  // analytic Gaussian emitters
  for (int i = 0; i < ${MAX_BLOBS}; i++) {
    vec4 b = uBlob[i];
    if (b.w <= 0.0) continue;
    vec3 sc = vec3(1.0 / b.z, 1.0 / b.y, 1.0 / b.z);
    vec3 qo = (o - vec3(0.0, b.x, 0.0)) * sc;
    vec3 qd = d * sc;
    float A = dot(qd, qd);
    float B = dot(qo, qd);
    float C = dot(qo, qo);
    float ts = -B / A;
    float dm = max(C - B * B / A, 0.0);
    if (dm > 16.0) continue;
    float sa = sqrt(A);
    float I = exp(-dm) * 0.886227 / sa * (fxErf(sa * (t1 - ts)) - fxErf(sa * (t0 - ts)));
    emit += uBlobCol[i] * (b.w * I);
  }

  // marched components
  float n = uSteps;
  float dt = (t1 - t0) / n;
  float jit = fxIGN(gl_FragCoord.xy);
  float T = 1.0;
  vec3 scat = vec3(0.0);
  float mu = dot(-uSunLocal, -d);
  float hg = (1.0 - 0.09) / pow(1.0 + 0.09 - 0.6 * mu, 1.5) * 0.08;
  vec3 light = uSunCol * (0.55 + hg * 5.0) + uAmb;
  for (int i = 0; i < 48; i++) {
    if (float(i) >= n) break;
    float t = t0 + (float(i) + jit) * dt;
    vec3 p = o + t * d;
    float y = p.y;
    if (y < 0.0) continue;
    float R = plumeR(y);
    float r = length(p.xz);
    float ex = (uRc * uRc) / (R * R);
    // eddies scale with the local width and are stretched along the flow
    float kq = uNoiseK / max(R, 0.05);
    vec3 an = vec3(kq, kq * 0.42, kq);
    vec3 q1 = vec3(p.x, y - uAdv.x, p.z) * an + vec3(uSeed);
    vec3 q2 = vec3(p.x, y - uAdv.y, p.z) * an + vec3(uSeed + 19.31);
    float nA = fxNoise(q1) * 0.62 + fxNoise(q1 * 2.13 + 7.7) * 0.38;
    float nB = fxNoise(q2) * 0.62 + fxNoise(q2 * 2.13 + 7.7) * 0.38;
    float nz = mix(nA, nB, uAdv.z);
    nz = 0.5 + (nz - 0.5) * (1.0 + 0.9 * (1.0 - abs(2.0 * uAdv.z - 1.0)));
    // value noise has a small variance: stretch it to full contrast
    float n2 = smoothstep(0.28, 0.72, nz);
    float x = r / R * (1.0 + (n2 - 0.5) * 0.55 * uTurb);
    float rad = exp(-x * x * uRadK);
    if (rad < 0.003) continue;
    float turb = mix(1.0, 0.15 + 1.7 * n2, uTurb);
    float endF = 1.0 - smoothstep(uY1 - uEndFade, uY1, y);
    // flame: luminous soot, emission-absorption (radiance saturates at the source colour)
    float fa = smoothstep(uFlameIn.x, uFlameIn.y, y) * (1.0 - smoothstep(uFlameLen * 0.45, uFlameLen, y));
    float u = clamp(y / uFlameLen, 0.0, 1.0);
    float dF = fa * rad * turb * ex;
    float sigF = uFlameSigma * dF;
    // soot cools downstream: colour reddens and brightness falls; turbulence shows as hot and cool patches
    float cool = 1.0 - 0.78 * u;
    // outer layers mix with air and run cooler (redder, dimmer) than the core
    float xr = clamp(x, 0.0, 1.2);
    vec3 src = mix(uFlameA, uFlameB, clamp(u + 0.32 * xr + (0.5 - n2) * 0.3 * uTurb, 0.0, 1.0)) * (uFlameI * cool * cool * (1.0 - 0.45 * xr) * (0.3 + 1.35 * n2));
    // thin glow (optically thin emission)
    vec3 e = mix(uGlowCore, uGlowRim, clamp(x, 0.0, 1.0)) * (uGlowI * rad * ex * exp(-y / uGlowDecay));
    // absorption and scattering
    float sa = smoothstep(uSmokeIn.x, uSmokeIn.y, y) * mix(1.0, (0.15 + smoothstep(0.25, 0.9, x)) * (1.6 - 1.4 * n2), uSootOuter);
    float sig = uSmokeSigma * sa * rad * mix(turb, 1.0, uSootOuter) * endF * min(1.0, ex * 4.0);
    float sigS = uScatSigma * rad * ex * endF * (0.6 + 0.8 * n2);
    float ext = sig + sigS + sigF * endF;
    vec3 alb = mix(uSmokeA, uSmokeB, smoothstep(uSmokeIn.x, uY1, y));
    vec3 S = (alb * sig + uScatAlb * sigS) * light;
    float w = ext > 1e-5 ? (1.0 - exp(-ext * dt)) / ext : dt;
    // flame source term: optically thick where sigF is large, thin (sigF * src * dt) otherwise
    e += src * (uFlameSigma > 0.0 ? sigF : dF);
    emit += T * e * endF * w;
    scat += T * S * w;
    T *= exp(-ext * dt);
    if (T < 0.01) break;
  }
  if (uDebug > 1.5) {
    gl_FragColor = uDebug < 2.5 ? vec4(emit * 0.2, 1.0) : vec4(vec3(1.0 - T), 1.0);
    return;
  }
  float a = (1.0 - T) * uOpacity;
  emit *= uOpacity;
  vec3 sc = a > 1e-4 ? scat * uOpacity / a : vec3(0.0);
  gl_FragColor = vec4(fxOut(sc) * a + fxFlame(emit), a);
}
`;

export interface VolumeParams {
  y0: number;
  y1: number;
  Rc: number;
  Rbal: number;
  Lb: number;
  spread: number;
  steps: number;
  seed: number;
  opacity: number;
  blobs: { y: number; sy: number; sr: number; i: number; col: THREE.Color }[];
  /** Flame source brightness, and its absorption scale (1/m; 0: optically thin emission). */
  flameI: number;
  flameSigma: number;
  flameIn: [number, number];
  flameLen: number;
  flameA: THREE.Color;
  flameB: THREE.Color;
  turb: number;
  flow: number;
  noiseK: number;
  radK: number;
  glowI: number;
  glowDecay: number;
  glowCore: THREE.Color;
  glowRim: THREE.Color;
  smokeSigma: number;
  smokeIn: [number, number];
  smokeA: THREE.Color;
  smokeB: THREE.Color;
  scatSigma: number;
  scatAlb: THREE.Color;
  endFade: number;
  /** 0: smoke spread through the section; 1: soot concentrated in the outer, cooler layers. */
  sootOuter: number;
  /** Bounding margin factor on the plume radius. */
  margin: number;
}

export const makeParams = (): VolumeParams => ({
  y0: 0,
  y1: 10,
  Rc: 1,
  Rbal: 1,
  Lb: 1,
  spread: 0.05,
  steps: 16,
  seed: 0,
  opacity: 1,
  blobs: [],
  flameI: 0,
  flameSigma: 0,
  flameIn: [0, 1],
  flameLen: 10,
  flameA: new THREE.Color(),
  flameB: new THREE.Color(),
  turb: 0.5,
  flow: 100,
  noiseK: 1.2,
  radK: 2.2,
  glowI: 0,
  glowDecay: 10,
  glowCore: new THREE.Color(),
  glowRim: new THREE.Color(),
  smokeSigma: 0,
  smokeIn: [0, 1],
  smokeA: new THREE.Color(),
  smokeB: new THREE.Color(),
  scatSigma: 0,
  scatAlb: new THREE.Color(),
  endFade: 1,
  sootOuter: 0,
  margin: 1.3,
});

export function resetParams(p: VolumeParams): VolumeParams {
  p.blobs.length = 0;
  p.flameI = 0;
  p.flameSigma = 0;
  p.glowI = 0;
  p.smokeSigma = 0;
  p.scatSigma = 0;
  p.opacity = 1;
  p.turb = 0.5;
  p.radK = 2.2;
  p.noiseK = 1.2;
  p.margin = 1.3;
  p.endFade = 1;
  p.sootOuter = 0;
  return p;
}

const plumeR = (p: VolumeParams, y: number) => {
  const yy = Math.max(0, y);
  return p.Rc + (p.Rbal - p.Rc) * (1 - Math.exp(-yy / p.Lb)) + yy * p.spread;
};

let geo: THREE.CylinderGeometry | null = null;
let base: THREE.ShaderMaterial | null = null;

function baseMaterial(): THREE.ShaderMaterial {
  if (base) return base;
  const blobs = Array.from({ length: MAX_BLOBS }, () => new THREE.Vector4());
  const blobCols = Array.from({ length: MAX_BLOBS }, () => new THREE.Color());
  base = new THREE.ShaderMaterial({
    uniforms: {
      uY0: { value: 0 },
      uY1: { value: 1 },
      uRb0: { value: 1 },
      uRb1: { value: 1 },
      uCam: { value: new THREE.Vector3() },
      uGround: { value: new THREE.Vector4(0, 1, 0, 1e7) },
      uSteps: { value: 16 },
      uAdv: { value: new THREE.Vector3() },
      uSeed: { value: 0 },
      uOpacity: { value: 1 },
      uRc: { value: 1 },
      uRbal: { value: 1 },
      uLb: { value: 1 },
      uSpread: { value: 0.05 },
      uBlob: { value: blobs },
      uBlobCol: { value: blobCols },
      uFlameI: { value: 0 },
      uFlameSigma: { value: 0 },
      uFlameIn: { value: new THREE.Vector2(0, 1) },
      uFlameLen: { value: 10 },
      uFlameA: { value: new THREE.Color() },
      uFlameB: { value: new THREE.Color() },
      uTurb: { value: 0.5 },
      uFlow: { value: 100 },
      uNoiseK: { value: 1.2 },
      uRadK: { value: 2.2 },
      uGlowI: { value: 0 },
      uGlowDecay: { value: 10 },
      uGlowCore: { value: new THREE.Color() },
      uGlowRim: { value: new THREE.Color() },
      uSmokeSigma: { value: 0 },
      uSmokeIn: { value: new THREE.Vector2(0, 1) },
      uSmokeA: { value: new THREE.Color() },
      uSmokeB: { value: new THREE.Color() },
      uScatSigma: { value: 0 },
      uScatAlb: { value: new THREE.Color() },
      uEndFade: { value: 1 },
      uSootOuter: { value: 0 },
      uDebug: { value: 0 },
      uSunLocal: { value: new THREE.Vector3(0, 1, 0) },
      uSunCol: { value: new THREE.Color() },
      uAmb: { value: new THREE.Color() },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  return base;
}

const Yax = new THREE.Vector3(0, 1, 0);
const qInv = new THREE.Quaternion();
const tv = new THREE.Vector3();

export interface VolumeLight {
  sunDir: THREE.Vector3;
  /** Colour x intensity / pi. */
  sunCol: THREE.Color;
  amb: THREE.Color;
}

/** One plume volume (mesh + its own uniforms, shared program). */
export class Volume {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  p = makeParams();
  /** View depth of the volume centre (for layering with the smoke). */
  depth = 0;

  constructor(radialSegments = 28) {
    geo ??= new THREE.CylinderGeometry(1, 1, 1, radialSegments, 1, false);
    this.mat = baseMaterial().clone();
    // clone() copies uniform values; make the arrays independent
    this.mat.uniforms.uBlob.value = Array.from({ length: MAX_BLOBS }, () => new THREE.Vector4());
    this.mat.uniforms.uBlobCol.value = Array.from({ length: MAX_BLOBS }, () => new THREE.Color());
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
    this.mesh.visible = false;
  }

  /**
   * Place the volume: nozzle exit (render coordinates), flow direction (unit), local up at the
   * exit and its height above the ground (m), the camera's render position (origin), lighting.
   */
  place(exit: THREE.Vector3, dir: THREE.Vector3, up: THREE.Vector3, height: number, light: VolumeLight, time: number, camFwd: THREE.Vector3) {
    const p = this.p;
    const m = this.mesh;
    m.position.copy(exit);
    m.quaternion.setFromUnitVectors(Yax, dir);
    m.updateMatrix();
    m.matrixAutoUpdate = false;
    qInv.copy(m.quaternion).invert();
    const u = this.mat.uniforms;
    // bounding frustum pivoting on the far end, containing R(y) * margin at every sample
    const y0 = p.y0;
    const y1 = p.y1;
    const r1 = plumeR(p, y1) * p.margin + 0.05;
    let r0 = plumeR(p, Math.max(0, y0)) * p.margin + 0.05;
    for (let i = 0; i <= 16; i++) {
      const s = i / 16;
      const y = y0 + (y1 - y0) * s;
      if (s >= 1) break;
      const need = plumeR(p, y) * p.margin + 0.05;
      // line through (y1, r1) must be >= need at y
      r0 = Math.max(r0, (need - r1 * s) / (1 - s));
    }
    u.uY0.value = y0;
    u.uY1.value = y1;
    u.uRb0.value = r0;
    u.uRb1.value = r1;
    const cam = (u.uCam.value as THREE.Vector3).copy(exit).negate().applyQuaternion(qInv);
    // camera inside the bounds: draw back faces (the entry is then the camera itself)
    const yc = cam.y;
    const inside = yc > y0 - 0.5 && yc < y1 + 0.5 && Math.hypot(cam.x, cam.z) < r0 + ((r1 - r0) * (yc - y0)) / (y1 - y0) + 0.5;
    this.mat.side = inside ? THREE.BackSide : THREE.FrontSide;
    // ground plane (local): n . p + w >= 0 above ground
    const gn = tv.copy(up).applyQuaternion(qInv);
    (u.uGround.value as THREE.Vector4).set(gn.x, gn.y, gn.z, height < 3000 ? height : 1e7);
    (u.uSunLocal.value as THREE.Vector3).copy(light.sunDir).applyQuaternion(qInv);
    (u.uSunCol.value as THREE.Color).copy(light.sunCol);
    (u.uAmb.value as THREE.Color).copy(light.amb);
    u.uSteps.value = p.steps;
    // flow noise advected along the plume, kept in a bounded range by two phases crossfading
    const cyc = 48;
    const ph = (((time * p.flow) / cyc) % 1 + 1) % 1;
    const ph2 = (ph + 0.5) % 1;
    // layer 1 wraps at ph = 0 (weight 1 on layer 2), layer 2 wraps at ph = 0.5 (weight 0)
    (u.uAdv.value as THREE.Vector3).set(ph * cyc, ph2 * cyc, Math.abs(2 * ph - 1));
    u.uSeed.value = p.seed;
    u.uOpacity.value = p.opacity;
    u.uRc.value = p.Rc;
    u.uRbal.value = p.Rbal;
    u.uLb.value = Math.max(0.01, p.Lb);
    u.uSpread.value = p.spread;
    const B = u.uBlob.value as THREE.Vector4[];
    const BC = u.uBlobCol.value as THREE.Color[];
    for (let i = 0; i < MAX_BLOBS; i++) {
      const b = p.blobs[i];
      if (b && b.i > 0) {
        B[i].set(b.y, Math.max(1e-3, b.sy), Math.max(1e-3, b.sr), b.i);
        BC[i].copy(b.col);
      } else B[i].set(0, 1, 1, 0);
    }
    u.uFlameI.value = p.flameI;
    u.uFlameSigma.value = p.flameSigma;
    (u.uFlameIn.value as THREE.Vector2).set(p.flameIn[0], Math.max(p.flameIn[1], p.flameIn[0] + 1e-3));
    u.uFlameLen.value = Math.max(0.01, p.flameLen);
    (u.uFlameA.value as THREE.Color).copy(p.flameA);
    (u.uFlameB.value as THREE.Color).copy(p.flameB);
    u.uTurb.value = p.turb;
    u.uFlow.value = p.flow;
    u.uNoiseK.value = p.noiseK;
    u.uRadK.value = p.radK;
    u.uGlowI.value = p.glowI;
    u.uGlowDecay.value = Math.max(0.01, p.glowDecay);
    (u.uGlowCore.value as THREE.Color).copy(p.glowCore);
    (u.uGlowRim.value as THREE.Color).copy(p.glowRim);
    u.uSmokeSigma.value = p.smokeSigma;
    (u.uSmokeIn.value as THREE.Vector2).set(p.smokeIn[0], Math.max(p.smokeIn[1], p.smokeIn[0] + 1e-3));
    (u.uSmokeA.value as THREE.Color).copy(p.smokeA);
    (u.uSmokeB.value as THREE.Color).copy(p.smokeB);
    u.uScatSigma.value = p.scatSigma;
    (u.uScatAlb.value as THREE.Color).copy(p.scatAlb);
    u.uEndFade.value = Math.max(0.01, p.endFade);
    u.uSootOuter.value = p.sootOuter;
    u.uDebug.value = volumeDebug.mode;
    this.depth = tv.copy(dir).multiplyScalar((y0 + y1) * 0.5).add(exit).dot(camFwd);
    m.visible = p.opacity > 0.001;
  }

  hide() {
    this.mesh.visible = false;
  }

  dispose() {
    this.mat.dispose();
  }
}

export function disposeShared() {
  geo?.dispose();
  base?.dispose();
  geo = null;
  base = null;
}
