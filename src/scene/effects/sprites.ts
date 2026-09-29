/**
 * Smoke, steam, vapour and spray sprites: camera-facing (or velocity-stretched) instanced
 * quads textured with a procedural billow atlas that carries a density and a normal, lit by
 * the Sun (wrap diffuse, forward scattering through thin edges), the sky and ground ambient,
 * and the rocket flame. Premultiplied alpha, so one sprite can both hide what is behind it and
 * glow (hot exhaust). Sorted back to front each frame and split in two draws around the plume,
 * so smoke in front of the flame covers it and smoke behind it does not.
 */
import * as THREE from 'three';
import { NOISE, OUTPUT } from './glsl';
import { Group, type Particle, type ParticleSystem } from './particles';

// ───────────────────────────── billow atlas ─────────────────────────────

function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Value noise on a periodic grid (for small surface detail). */
function makeNoise2(rand: () => number, n: number) {
  const g = Float32Array.from({ length: n * n }, () => rand());
  return (x: number, y: number) => {
    const fx = x * n;
    const fy = y * n;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const u = fx - x0;
    const v = fy - y0;
    const s = (i: number, j: number) => g[(((j % n) + n) % n) * n + (((i % n) + n) % n)];
    const uu = u * u * (3 - 2 * u);
    const vv = v * v * (3 - 2 * v);
    return (s(x0, y0) * (1 - uu) + s(x0 + 1, y0) * uu) * (1 - vv) + (s(x0, y0 + 1) * (1 - uu) + s(x0 + 1, y0 + 1) * uu) * vv;
  };
}

let atlas: THREE.DataTexture | null = null;

/**
 * 2 x 2 atlas of 128 px puffs. RGBA: density, normal x, normal y, unused. Tiles 0-1 are
 * cauliflower billows (steam, smoke), tiles 2-3 soft wisps (vapour, spray, puffs).
 */
export function billowAtlas(): THREE.DataTexture {
  if (atlas) return atlas;
  const T = 128;
  const S = T * 2;
  const data = new Uint8Array(S * S * 4);
  for (let tile = 0; tile < 4; tile++) {
    const rand = mulberry(1234 + tile * 977);
    const billowy = tile < 2;
    const n1 = makeNoise2(rand, 6);
    const n2 = makeNoise2(rand, 13);
    const n3 = makeNoise2(rand, 29);
    // bumps: spheres packed inside the unit disk, larger toward the centre
    const bumps: [number, number, number][] = [];
    const count = billowy ? 16 : 7;
    for (let i = 0; i < count; i++) {
      const r = billowy ? 0.2 + 0.26 * rand() : 0.35 + 0.3 * rand();
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * (0.92 - r);
      bumps.push([Math.cos(a) * d, Math.sin(a) * d, r]);
    }
    const H = new Float32Array(T * T);
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const px = ((x + 0.5) / T) * 2 - 1;
        const py = ((y + 0.5) / T) * 2 - 1;
        let h = 0;
        for (const [bx, by, br] of bumps) {
          const dd = (px - bx) ** 2 + (py - by) ** 2;
          if (dd < br * br) h = Math.max(h, Math.sqrt(br * br - dd) * (billowy ? 1 : 0.8));
        }
        // soft base dome so the billows sit on a body
        const rr = px * px + py * py;
        const dome = rr < 0.85 ? Math.sqrt(0.85 - rr) * 0.55 : 0;
        const u = (px + 1) / 2;
        const v = (py + 1) / 2;
        const detail = (n2(u, v) - 0.5) * 0.12 + (n3(u, v) - 0.5) * 0.06;
        H[y * T + x] = Math.max(h, dome) + detail * Math.min(1, h * 4 + dome * 3) + (n1(u, v) - 0.5) * 0.05;
      }
    const ox = (tile % 2) * T;
    const oy = Math.floor(tile / 2) * T;
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const h = H[y * T + x];
        const hx = H[y * T + Math.min(T - 1, x + 1)] - H[y * T + Math.max(0, x - 1)];
        const hy = H[Math.min(T - 1, y + 1) * T + x] - H[Math.max(0, y - 1) * T + x];
        const k = billowy ? 26 : 14;
        let nx = -hx * k;
        let ny = -hy * k;
        const nz = 1;
        const l = Math.hypot(nx, ny, nz);
        nx /= l;
        ny /= l;
        const px = ((x + 0.5) / T) * 2 - 1;
        const py = ((y + 0.5) / T) * 2 - 1;
        const rr = Math.sqrt(px * px + py * py);
        // density: from the height field, with a soft rim that reaches zero before the tile edge
        const edge = 1 - smooth(0.62, 0.98, rr);
        let d = smooth(0.0, billowy ? 0.2 : 0.45, h) * edge;
        if (!billowy) d *= 0.75 + 0.25 * n2((px + 1) / 2, (py + 1) / 2);
        const i = ((oy + y) * S + ox + x) * 4;
        data[i] = Math.round(Math.min(1, d) * 255);
        data[i + 1] = Math.round((nx * 0.5 + 0.5) * 255);
        data[i + 2] = Math.round((ny * 0.5 + 0.5) * 255);
        data[i + 3] = 255;
      }
  }
  const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  atlas = tex;
  return tex;
}

function smooth(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// ───────────────────────────── material ─────────────────────────────

const VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec3 iPos;
attribute vec4 iShape;  // radius, rotation, stretch length, variant
attribute vec3 iAxis;
attribute vec4 iAlb;    // albedo, opacity
attribute vec4 iEmit;   // emission, sun shadow
varying vec2 vUv;
varying vec2 vRot;
varying vec4 vAlb;
varying vec4 vEmit;
varying vec3 vView;
varying float vTile;
varying float vFade;
void main() {
  vec4 mv = viewMatrix * vec4(iPos, 1.0);
  float radius = iShape.x;
  float rot = iShape.y;
  float stretch = iShape.z;
  vec2 c = position.xy;
  vec3 ax = (viewMatrix * vec4(iAxis, 0.0)).xyz;
  float axl = length(ax.xy);
  vec2 X;
  float lx = radius;
  if (stretch > 0.0 && axl > 1e-3) {
    X = ax.xy / axl;
    lx = radius + 0.5 * stretch * axl;
  } else {
    X = vec2(cos(rot), sin(rot));
  }
  vec2 Y = vec2(-X.y, X.x);
  mv.xy += X * c.x * lx + Y * c.y * radius;
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
  vUv = c;
  vRot = X;
  vAlb = iAlb;
  vEmit = iEmit;
  vView = mv.xyz;
  vTile = iShape.w;
  float d = -(viewMatrix * vec4(iPos, 1.0)).z;
  vFade = smoothstep(radius * 0.15, radius * 1.1, d);
}
`;

const FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
${NOISE}
${OUTPUT}
uniform sampler2D uAtlas;
uniform vec3 uSunView;
uniform vec3 uSunCol;
uniform vec3 uSky;
uniform vec3 uGround;
uniform vec3 uUpView;
uniform vec3 uHaze;
uniform float uHazeDensity;
uniform vec3 uFlamePos[2];
uniform vec3 uFlameCol[2];
varying vec2 vUv;
varying vec2 vRot;
varying vec4 vAlb;
varying vec4 vEmit;
varying vec3 vView;
varying float vTile;
varying float vFade;
void main() {
  #include <logdepthbuf_fragment>
  float tile = floor(vTile + 0.5);
  vec2 base = vec2(mod(tile, 2.0), floor(tile / 2.0)) * 0.5;
  vec2 uvT = base + (vUv * 0.5 + 0.5) * 0.5;
  vec4 tx = texture2D(uAtlas, uvT);
  float dens = tx.r;
  float a = dens * vAlb.a * vFade;
  vec3 emitT = vEmit.rgb * dens * dens * vFade;
  if (a < 0.002 && dot(emitT, vec3(1.0)) < 0.002) discard;
  // tile-space normal rotated into view space
  vec2 nt = tx.gb * 2.0 - 1.0;
  vec2 nxy = vRot * nt.x + vec2(-vRot.y, vRot.x) * nt.y;
  vec3 n = normalize(vec3(nxy, sqrt(max(0.0, 1.0 - dot(nt, nt)))));
  vec3 toCam = normalize(-vView);
  float shadow = vEmit.a;
  float ndl = dot(n, uSunView);
  float wrap = clamp((ndl + 0.4) / 1.4, 0.0, 1.0);
  // forward scattering through thin, sunlit edges (Henyey-Greenstein, g = 0.55)
  float mu = dot(-uSunView, toCam);
  float g = 0.55;
  float hg = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * mu, 1.5) / 12.566;
  float sunVis = 1.0 - 0.72 * shadow;
  vec3 light = uSunCol * sunVis * (wrap * 0.92 + hg * (1.0 - dens) * 5.0);
  float up = dot(n, uUpView) * 0.5 + 0.5;
  light += mix(uGround, uSky, up) * (1.0 - 0.3 * shadow);
  for (int i = 0; i < 2; i++) {
    vec3 L = uFlamePos[i] - vView;
    float d2 = dot(L, L);
    float nl = dot(n, L * inversesqrt(max(d2, 1e-4))) * 0.5 + 0.5;
    light += uFlameCol[i] * nl / (d2 + 25.0);
  }
  vec3 col = vAlb.rgb * light * RECIPROCAL_PI;
  float dist = length(vView);
  float fog = 1.0 - exp(-dist * uHazeDensity);
  col = mix(col, uHaze, fog);
  emitT *= 1.0 - fog;
  gl_FragColor = vec4(fxOut(col) * a + fxOut(emitT), a);
}
`;

export interface SpriteLighting {
  /** Sun direction (frame I, unit), colour x intensity. */
  sunDir: THREE.Vector3;
  sunCol: THREE.Color;
  sky: THREE.Color;
  ground: THREE.Color;
  /** Local up (frame I) at the camera. */
  up: THREE.Vector3;
  haze: THREE.Color;
  hazeDensity: number;
  /** Up to two flame lights: render-space positions and colour x intensity (point-light units). */
  flames: { pos: THREE.Vector3; col: THREE.Color }[];
}

function makeMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uAtlas: { value: billowAtlas() },
      uSunView: { value: new THREE.Vector3(0, 1, 0) },
      uSunCol: { value: new THREE.Color(3, 3, 3) },
      uSky: { value: new THREE.Color(0.4, 0.5, 0.6) },
      uGround: { value: new THREE.Color(0.2, 0.2, 0.18) },
      uUpView: { value: new THREE.Vector3(0, 1, 0) },
      uHaze: { value: new THREE.Color(0.6, 0.7, 0.8) },
      uHazeDensity: { value: 0 },
      uFlamePos: { value: [new THREE.Vector3(), new THREE.Vector3()] },
      uFlameCol: { value: [new THREE.Color(0, 0, 0), new THREE.Color(0, 0, 0)] },
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
}

// ───────────────────────────── renderer ─────────────────────────────

class Batch {
  geo = new THREE.InstancedBufferGeometry();
  mesh: THREE.Mesh;
  pos: THREE.InstancedBufferAttribute;
  shape: THREE.InstancedBufferAttribute;
  axis: THREE.InstancedBufferAttribute;
  alb: THREE.InstancedBufferAttribute;
  emit: THREE.InstancedBufferAttribute;

  constructor(
    readonly capacity: number,
    mat: THREE.ShaderMaterial,
  ) {
    const g = this.geo;
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const mk = (n: number) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * n), n);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.pos = mk(3);
    this.shape = mk(4);
    this.axis = mk(3);
    this.alb = mk(4);
    this.emit = mk(4);
    g.setAttribute('iPos', this.pos);
    g.setAttribute('iShape', this.shape);
    g.setAttribute('iAxis', this.axis);
    g.setAttribute('iAlb', this.alb);
    g.setAttribute('iEmit', this.emit);
    g.instanceCount = 0;
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
  }

  commit(n: number) {
    this.geo.instanceCount = n;
    for (const [a, w] of [
      [this.pos, 3],
      [this.shape, 4],
      [this.axis, 3],
      [this.alb, 4],
      [this.emit, 4],
    ] as [THREE.InstancedBufferAttribute, number][]) {
      a.clearUpdateRanges();
      if (n > 0) {
        a.addUpdateRange(0, n * w);
        a.needsUpdate = true;
      }
    }
    this.mesh.visible = n > 0;
  }

  dispose() {
    this.geo.dispose();
  }
}

const fwd = new THREE.Vector3();
const tmp = new THREE.Vector3();
const cen = new THREE.Vector3();

/** Group-level sun shadowing for clouds: the far side from the Sun and the underside are darker. */
function shadeClouds(ps: Particle[], n: number, sunDir: THREE.Vector3) {
  for (const grp of [Group.Ground, Group.Trail, Group.Smoke]) {
    let w = 0;
    cen.set(0, 0, 0);
    let hMin = Infinity;
    let hMax = -Infinity;
    for (let i = 0; i < n; i++) {
      const p = ps[i];
      if (p.group !== grp) continue;
      const k = p.alpha * p.radius;
      cen.addScaledVector(p.pos, k);
      w += k;
      hMin = Math.min(hMin, p.height);
      hMax = Math.max(hMax, p.height + p.radius);
    }
    if (w <= 0) continue;
    cen.multiplyScalar(1 / w);
    let r2 = 0;
    for (let i = 0; i < n; i++) {
      const p = ps[i];
      if (p.group !== grp) continue;
      r2 += p.pos.distanceToSquared(cen) * p.alpha * p.radius;
    }
    const R = Math.sqrt(r2 / w) + 1;
    const span = Math.max(1, hMax - hMin);
    for (let i = 0; i < n; i++) {
      const p = ps[i];
      if (p.group !== grp) continue;
      const s = tmp.subVectors(p.pos, cen).dot(sunDir) / R;
      const side = smooth(0.5, -1.2, s);
      const low = grp === Group.Ground ? 1 - smooth(0, 0.8, (p.height - hMin) / span) : 0;
      p.shadow = Math.min(1, (grp === Group.Ground ? 0.75 : 0.35) * side + 0.45 * low);
    }
  }
}

export class SpriteRenderer {
  readonly group = new THREE.Group();
  private mat = makeMaterial();
  private far: Batch;
  private near: Batch;
  private order = new Uint32Array(0);
  private depth = new Float32Array(0);
  private idx: number[] = [];
  capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.far = new Batch(capacity, this.mat);
    this.near = new Batch(capacity, this.mat);
    this.far.mesh.renderOrder = 10;
    this.near.mesh.renderOrder = 30;
    this.far.mesh.name = 'effects-smoke-far';
    this.near.mesh.name = 'effects-smoke-near';
    this.group.add(this.far.mesh, this.near.mesh);
  }

  resize(capacity: number) {
    if (capacity <= this.capacity) return;
    this.group.remove(this.far.mesh, this.near.mesh);
    this.far.dispose();
    this.near.dispose();
    this.capacity = capacity;
    this.far = new Batch(capacity, this.mat);
    this.near = new Batch(capacity, this.mat);
    this.far.mesh.renderOrder = 10;
    this.near.mesh.renderOrder = 30;
    this.group.add(this.far.mesh, this.near.mesh);
  }

  /**
   * Fill the batches from the evaluated particles. `origin` is the floating origin (frame I);
   * `splitDepth` is the view depth of the plume: particles farther than it draw before the plume.
   */
  update(sys: ParticleSystem, origin: THREE.Vector3, camera: THREE.Camera, splitDepth: number, L: SpriteLighting) {
    const n = sys.count;
    const ps = sys.out;
    if (this.depth.length < n) {
      this.depth = new Float32Array(Math.ceil(n * 1.3));
      this.order = new Uint32Array(Math.ceil(n * 1.3));
    }
    shadeClouds(ps, n, L.sunDir);
    camera.getWorldDirection(fwd);
    const ox = origin.x;
    const oy = origin.y;
    const oz = origin.z;
    const idx = this.idx;
    idx.length = 0;
    for (let i = 0; i < n; i++) {
      const p = ps[i];
      const x = p.pos.x - ox;
      const y = p.pos.y - oy;
      const z = p.pos.z - oz;
      const d = x * fwd.x + y * fwd.y + z * fwd.z;
      const reach = p.radius + p.stretch;
      if (d < -reach) continue;
      // sub-pixel and nearly transparent: skip
      if (p.alpha < 0.01 && p.emit.r + p.emit.g + p.emit.b < 0.01) continue;
      this.depth[i] = d;
      idx.push(i);
    }
    const depth = this.depth;
    idx.sort((a, b) => depth[b] - depth[a]);
    let nf = 0;
    let nn = 0;
    for (const i of idx) {
      const p = ps[i];
      const b = depth[i] > splitDepth ? this.far : this.near;
      const j = b === this.far ? nf++ : nn++;
      b.pos.array[j * 3] = p.pos.x - ox;
      b.pos.array[j * 3 + 1] = p.pos.y - oy;
      b.pos.array[j * 3 + 2] = p.pos.z - oz;
      b.shape.array[j * 4] = p.radius;
      b.shape.array[j * 4 + 1] = p.rot;
      b.shape.array[j * 4 + 2] = p.stretch;
      b.shape.array[j * 4 + 3] = p.variant;
      b.axis.array[j * 3] = p.axis.x;
      b.axis.array[j * 3 + 1] = p.axis.y;
      b.axis.array[j * 3 + 2] = p.axis.z;
      b.alb.array[j * 4] = p.albedo.r;
      b.alb.array[j * 4 + 1] = p.albedo.g;
      b.alb.array[j * 4 + 2] = p.albedo.b;
      b.alb.array[j * 4 + 3] = p.alpha;
      b.emit.array[j * 4] = p.emit.r;
      b.emit.array[j * 4 + 1] = p.emit.g;
      b.emit.array[j * 4 + 2] = p.emit.b;
      b.emit.array[j * 4 + 3] = p.shadow;
    }
    this.far.commit(nf);
    this.near.commit(nn);

    // lighting uniforms (view space)
    const u = this.mat.uniforms;
    const view = camera.matrixWorldInverse;
    (u.uSunView.value as THREE.Vector3).copy(L.sunDir).transformDirection(view);
    (u.uUpView.value as THREE.Vector3).copy(L.up).transformDirection(view);
    (u.uSunCol.value as THREE.Color).copy(L.sunCol);
    (u.uSky.value as THREE.Color).copy(L.sky);
    (u.uGround.value as THREE.Color).copy(L.ground);
    (u.uHaze.value as THREE.Color).copy(L.haze);
    u.uHazeDensity.value = L.hazeDensity;
    const fp = u.uFlamePos.value as THREE.Vector3[];
    const fc = u.uFlameCol.value as THREE.Color[];
    for (let i = 0; i < 2; i++) {
      const f = L.flames[i];
      if (f) {
        fp[i].copy(f.pos).applyMatrix4(view);
        fc[i].copy(f.col);
      } else fc[i].setRGB(0, 0, 0);
    }
    return nf + nn;
  }

  dispose() {
    this.far.dispose();
    this.near.dispose();
    this.mat.dispose();
  }
}
