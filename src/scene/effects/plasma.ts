/**
 * Entry plasma: the glowing shock layer between the bow shock and the heat shield (brightest at
 * the stagnation point), the hot gas turning around the shoulder, and a faint ionised wake
 * behind the body; for a booster falling tail first (entry burn), a heating glow around the
 * base. Ray-marched inside a bounding frustum (local frame: origin at the centre of the heated
 * face, +Y along the direction of travel, the body at y < 0). The body is cut out analytically,
 * so glow behind the vehicle is hidden by it.
 */
import * as THREE from 'three';
import { NOISE, OUTPUT } from './glsl';
import type { PlasmaSource } from './input';

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
  vec3 p = vec3(position.x * mix(uRb0, uRb1, u), mix(uY0, uY1, u), position.z * mix(uRb0, uRb1, u));
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
uniform float uTime;
uniform float uI;
uniform float uR;       // face radius
uniform float uRn;      // heat-shield sphere radius (0: flat base)
uniform float uDelta;   // shock stand-off at the stagnation point
uniform float uRs;      // shock curvature radius
uniform float uBodyLen;
uniform float uBodyR1;  // body radius at its far end
uniform float uNeck;    // wake neck distance behind the face (large: no neck)
uniform float uWake;    // wake e-folding length
uniform vec3 uColHot;
uniform vec3 uColRim;
uniform vec3 uColWake;
varying vec3 vLocal;

vec2 frustumHit(vec3 o, vec3 d, float y0, float y1, float r0, float r1) {
  float k = (r1 - r0) / (y1 - y0);
  float ka = r0 - k * y0;
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
      if (ya >= y0 && ya <= y1 && ka + k * ya >= 0.0) { tmin = min(tmin, ta); tmax = max(tmax, ta); }
      if (yb >= y0 && yb <= y1 && ka + k * yb >= 0.0) { tmin = min(tmin, tb); tmax = max(tmax, tb); }
    }
  }
  if (abs(d.y) > 1e-7) {
    float t0 = (y0 - o.y) / d.y;
    vec3 p0 = o + t0 * d;
    if (dot(p0.xz, p0.xz) <= r0 * r0) { tmin = min(tmin, t0); tmax = max(tmax, t0); }
    float t1 = (y1 - o.y) / d.y;
    vec3 p1 = o + t1 * d;
    if (dot(p1.xz, p1.xz) <= r1 * r1) { tmin = min(tmin, t1); tmax = max(tmax, t1); }
  }
  return vec2(tmin, tmax);
}

float faceY(float r) {
  if (uRn <= 0.0) return 0.0;
  return -(uRn - sqrt(max(uRn * uRn - r * r, 0.0)));
}

/** Nearest hit of the ray with the body (backshell or stage frustum plus the heat-shield cap). */
float bodyHit(vec3 o, vec3 d) {
  float rimY = faceY(uR);
  vec2 h = frustumHit(o, d, rimY - uBodyLen, rimY, uBodyR1, uR);
  float t = h.x <= h.y && h.y > 0.0 ? max(h.x, 0.0) : 1e20;
  if (uRn > 0.0) {
    vec3 c = vec3(0.0, -uRn, 0.0);
    vec3 oc = o - c;
    float b = dot(oc, d);
    float cc = dot(oc, oc) - uRn * uRn;
    float disc = b * b - cc;
    if (disc > 0.0) {
      float s = sqrt(disc);
      float ta = -b - s;
      float tb = -b + s;
      if (ta > 0.0 && o.y + ta * d.y > rimY) t = min(t, ta);
      else if (tb > 0.0 && o.y + tb * d.y > rimY && cc < 0.0) t = min(t, tb);
    }
  }
  return t;
}

vec3 field(vec3 p) {
  float r = length(p.xz);
  float y = p.y;
  float R = uR;
  float yf = faceY(min(r, R));
  float ys = uDelta - r * r / (2.0 * uRs);
  vec3 e = vec3(0.0);
  // shock layer between the face and the bow shock
  if (r < R * 1.25) {
    float th = max(ys - yf, 1e-3);
    float s = (y - yf) / th;
    float layer = smoothstep(-0.08, 0.3, s) * (1.0 - smoothstep(0.78, 1.08, s));
    float radial = clamp(1.15 - 0.55 * (r / R) * (r / R), 0.25, 1.15) * (1.0 - smoothstep(1.02, 1.25, r / R));
    e += mix(uColRim, uColHot, clamp(1.2 - r / R, 0.0, 1.0)) * (layer * radial * 26.0);
  }
  // hot gas turning around the shoulder
  float yr = faceY(R);
  float dsh = length(vec2(r - R * 1.03, y - yr * 1.1)) / (0.2 * R);
  e += uColRim * exp(-dsh * dsh) * 7.0;
  // shear layer and wake behind the body
  if (y < yr) {
    float x = yr - y;
    float conv = smoothstep(0.0, uNeck, x);
    float rsl = R * (1.02 - 0.8 * conv) + max(0.0, x - uNeck) * 0.05;
    float w = 0.12 * R + 0.07 * x;
    float nz = fxNoise(vec3(p.x * 1.3, (y + uTime * 60.0) * 0.35, p.z * 1.3) / R);
    float sl = exp(-pow((r - rsl) / w, 2.0)) * exp(-x / uWake) * (0.6 + 0.8 * nz);
    e += mix(uColRim, uColWake, clamp(x / (uWake * 0.6), 0.0, 1.0)) * sl * 2.6;
  }
  // soft glow around the stagnation region (the eye sees the bright layer bleed)
  float hd = length(vec2(r, y - uDelta * 0.5)) / (1.25 * R);
  e += uColHot * exp(-hd * hd) * 0.55;
  return e;
}

void main() {
  #include <logdepthbuf_fragment>
  vec3 o = uCam;
  vec3 d = normalize(vLocal - uCam);
  vec2 tt = frustumHit(o, d, uY0, uY1, uRb0, uRb1);
  float t0 = max(tt.x, 0.0);
  float t1 = min(tt.y, bodyHit(o, d));
  if (t1 <= t0) discard;
  vec3 col = vec3(0.0);
  float jit = fxIGN(gl_FragCoord.xy);
  // dense march over the front (layer, shoulder), coarse march over the wake
  float yCut = faceY(uR) - 0.35 * uR;
  float tc = t1;
  if (abs(d.y) > 1e-5) {
    float tcut = (yCut - o.y) / d.y;
    if (tcut > t0 && tcut < t1) tc = tcut;
  }
  float ta = t0;
  float tb = tc;
  float tc0 = tc;
  float tc1 = t1;
  if (o.y + t0 * d.y < yCut) {
    // entering from the wake side: wake first, then the front
    ta = tc; tb = t1; tc0 = t0; tc1 = tc;
  }
  float dt = (tb - ta) / 22.0;
  for (int i = 0; i < 22; i++) {
    vec3 p = o + (ta + (float(i) + jit) * dt) * d;
    col += field(p) * dt;
  }
  float dw = (tc1 - tc0) / 14.0;
  for (int i = 0; i < 14; i++) {
    vec3 p = o + (tc0 + (float(i) + jit) * dw) * d;
    col += field(p) * dw;
  }
  col *= uI;
  gl_FragColor = vec4(fxOut(col), 1.0);
}
`;

let geo: THREE.CylinderGeometry | null = null;

export class PlasmaVolume {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  depth = 0;
  booster = false;

  constructor() {
    geo ??= new THREE.CylinderGeometry(1, 1, 1, 32, 1, false);
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uY0: { value: -10 },
        uY1: { value: 1 },
        uRb0: { value: 3 },
        uRb1: { value: 3 },
        uCam: { value: new THREE.Vector3() },
        uTime: { value: 0 },
        uI: { value: 1 },
        uR: { value: 2 },
        uRn: { value: 4.6 },
        uDelta: { value: 0.3 },
        uRs: { value: 4 },
        uBodyLen: { value: 3 },
        uBodyR1: { value: 1 },
        uNeck: { value: 4 },
        uWake: { value: 20 },
        uColHot: { value: new THREE.Color(1.0, 0.7, 0.45) },
        uColRim: { value: new THREE.Color(1.0, 0.46, 0.36) },
        uColWake: { value: new THREE.Color(0.95, 0.34, 0.52) },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 22;
    this.mesh.visible = false;
  }

  /** Place for a plasma source (`rel`: face centre in render coordinates). */
  place(s: PlasmaSource, rel: THREE.Vector3, time: number, camFwd: THREE.Vector3) {
    const u = this.mat.uniforms;
    const R = s.radius;
    const booster = /booster|stage|s1/i.test(s.id);
    this.booster = booster;
    const I = Math.pow(Math.max(0, Math.min(1.5, s.intensity)), 1.3);
    const m = this.mesh;
    m.position.copy(rel);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), s.dir);
    m.updateMatrix();
    m.matrixAutoUpdate = false;
    const qi = m.quaternion.clone().invert();
    const cam = (u.uCam.value as THREE.Vector3).copy(rel).negate().applyQuaternion(qi);
    u.uTime.value = time;
    u.uI.value = I;
    u.uR.value = R;
    if (booster) {
      u.uRn.value = 0;
      u.uDelta.value = 0.55 * R;
      u.uRs.value = 1.6 * R;
      u.uBodyLen.value = 40;
      u.uBodyR1.value = R;
      u.uNeck.value = 1e4;
      u.uWake.value = 5 * R;
      (u.uColHot.value as THREE.Color).setRGB(1.0, 0.62, 0.34);
      (u.uColRim.value as THREE.Color).setRGB(1.0, 0.44, 0.2);
      (u.uColWake.value as THREE.Color).setRGB(0.9, 0.34, 0.18);
    } else {
      u.uRn.value = 2.36 * R;
      u.uDelta.value = 0.18 * R;
      u.uRs.value = 2.05 * R;
      u.uBodyLen.value = 1.62 * R;
      u.uBodyR1.value = 0.36 * R;
      u.uNeck.value = 2.4 * R;
      u.uWake.value = 9 * R;
      (u.uColHot.value as THREE.Color).setRGB(1.0, 0.7, 0.46);
      (u.uColRim.value as THREE.Color).setRGB(1.0, 0.46, 0.36);
      (u.uColWake.value as THREE.Color).setRGB(0.95, 0.34, 0.52);
    }
    const wake = (u.uWake.value as number) * 2.6;
    u.uY0.value = -Math.min(wake, booster ? 16 : 60);
    u.uY1.value = (u.uDelta.value as number) + 1.4 * R;
    u.uRb0.value = booster ? 2.2 * R : 2.4 * R;
    u.uRb1.value = 2.1 * R;
    // camera inside the bounds: draw back faces
    const y0 = u.uY0.value as number;
    const y1 = u.uY1.value as number;
    const r0 = u.uRb0.value as number;
    const r1 = u.uRb1.value as number;
    const inside = cam.y > y0 - 0.5 && cam.y < y1 + 0.5 && Math.hypot(cam.x, cam.z) < r0 + ((r1 - r0) * (cam.y - y0)) / (y1 - y0) + 0.5;
    this.mat.side = inside ? THREE.BackSide : THREE.FrontSide;
    this.depth = rel.dot(camFwd);
    m.visible = I > 0.002;
  }

  hide() {
    this.mesh.visible = false;
  }

  dispose() {
    this.mat.dispose();
  }
}

export function disposePlasmaShared() {
  geo?.dispose();
  geo = null;
}
