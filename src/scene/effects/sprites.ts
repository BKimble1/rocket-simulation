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
 * cauliflower billows (a smooth union of spherical lobes: steam, smoke), tiles 2-3 soft wisps
 * (vapour, spray, puffs). The normals are the true slopes of the lobes, so the Sun lights each
 * lobe like a small sphere (bright tops, shaded undersides).
 */
export function billowAtlas(): THREE.DataTexture {
  if (atlas) return atlas;
  const T = 128;
  const S = T * 2;
  const data = new Uint8Array(S * S * 4);
  for (let tile = 0; tile < 4; tile++) {
    const rand = mulberry(1234 + tile * 977);
    const billowy = tile < 2;
    const n1 = makeNoise2(rand, 5);
    const n2 = makeNoise2(rand, 11);
    const bumps: [number, number, number][] = [];
    if (billowy) {
      bumps.push([(rand() - 0.5) * 0.1, (rand() - 0.5) * 0.1, 0.46 + 0.08 * rand()]);
      for (let i = 0; i < 11; i++) {
        const r = 0.16 + 0.17 * rand();
        const a = (i / 11) * Math.PI * 2 + rand() * 0.5;
        const d = (0.55 + 0.45 * rand()) * (0.9 - r);
        bumps.push([Math.cos(a) * d, Math.sin(a) * d, r]);
      }
      // small lobes on the rims of the big ones (cauliflower detail)
      const big = bumps.length;
      for (let i = 0; i < 30; i++) {
        const [bx, by, br] = bumps[Math.floor(rand() * big)];
        const r = 0.05 + 0.065 * rand();
        const a = rand() * Math.PI * 2;
        let x = bx + Math.cos(a) * br * 0.8;
        let y = by + Math.sin(a) * br * 0.8;
        const d = Math.hypot(x, y);
        if (d > 0.93 - r) {
          x *= (0.93 - r) / d;
          y *= (0.93 - r) / d;
        }
        bumps.push([x, y, r]);
      }
    } else {
      for (let i = 0; i < 6; i++) {
        const r = 0.3 + 0.3 * rand();
        const a = rand() * Math.PI * 2;
        const d = Math.sqrt(rand()) * (0.9 - r);
        bumps.push([Math.cos(a) * d, Math.sin(a) * d, r]);
      }
    }
    const K = 14;
    let H = new Float32Array(T * T);
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const px = ((x + 0.5) / T) * 2 - 1;
        const py = ((y + 0.5) / T) * 2 - 1;
        // smooth union of lobes (soft creases between them)
        let acc = 0;
        let any = false;
        for (const [bx, by, br] of bumps) {
          const dd = (px - bx) ** 2 + (py - by) ** 2;
          if (dd < br * br) {
            acc += Math.exp(K * Math.sqrt(br * br - dd));
            any = true;
          }
        }
        let h = any ? Math.log(acc) / K : 0;
        if (!billowy) h *= 0.55;
        const u = (px + 1) / 2;
        const v = (py + 1) / 2;
        if (h > 0) h += ((n1(u, v) - 0.5) * 0.05 + (n2(u, v) - 0.5) * 0.025) * Math.min(1, h * 6);
        H[y * T + x] = Math.max(0, h);
      }
    // two passes of a 5-tap blur to soften the lobe rims
    for (let pass = 0; pass < 2; pass++) {
      const B = new Float32Array(T * T);
      for (let y = 0; y < T; y++)
        for (let x = 0; x < T; x++) {
          let a = 0;
          let w = 0;
          for (let k = -2; k <= 2; k++) {
            const xx = Math.min(T - 1, Math.max(0, x + k));
            const wk = 3 - Math.abs(k);
            a += H[y * T + xx] * wk;
            w += wk;
          }
          B[y * T + x] = a / w;
        }
      const C = new Float32Array(T * T);
      for (let y = 0; y < T; y++)
        for (let x = 0; x < T; x++) {
          let a = 0;
          let w = 0;
          for (let k = -2; k <= 2; k++) {
            const yy = Math.min(T - 1, Math.max(0, y + k));
            const wk = 3 - Math.abs(k);
            a += B[yy * T + x] * wk;
            w += wk;
          }
          C[y * T + x] = a / w;
        }
      H = C;
    }
    const ox = (tile % 2) * T;
    const oy = Math.floor(tile / 2) * T;
    const step = 2 / T;
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const h = H[y * T + x];
        const hx = (H[y * T + Math.min(T - 1, x + 1)] - H[y * T + Math.max(0, x - 1)]) / (2 * step);
        const hy = (H[Math.min(T - 1, y + 1) * T + x] - H[Math.max(0, y - 1) * T + x]) / (2 * step);
        let nx = -hx;
        let ny = -hy;
        const l = Math.hypot(nx, ny, 1);
        nx /= l;
        ny /= l;
        const px = ((x + 0.5) / T) * 2 - 1;
        const py = ((y + 0.5) / T) * 2 - 1;
        const rr = Math.sqrt(px * px + py * py);
        const edge = 1 - smooth(0.8, 0.99, rr);
        let d = smooth(0.01, billowy ? 0.16 : 0.3, h) * edge;
        if (!billowy) d *= 0.7 + 0.3 * n2((px + 1) / 2, (py + 1) / 2);
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
varying float vCap;
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
  // a streak is a capsule: the puff's two halves at its ends, a flat run between them
  // (successive streaks overlap into one continuous column instead of a string of beads)
  float cap = (lx - radius) / radius;
  vUv = vec2(c.x * (1.0 + cap), c.y);
  vCap = cap;
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
varying float vCap;
varying vec2 vRot;
varying vec4 vAlb;
varying vec4 vEmit;
varying vec3 vView;
varying float vTile;
varying float vFade;
void main() {
  #include <logdepthbuf_fragment>
  // tiles 4-7: the same billows for thin media (puffs, vapour, spray), lit through
  float tile = floor(vTile + 0.02);
  float soft = clamp((vTile - tile) / 0.9, 0.0, 1.0);
  // a streak (one puff drawn along the path it covered in a spawn interval) has no billow
  // outline of its own: with the tile's crisp rim its flat run shows straight sides and the
  // column reads as a stack of boxes. Streaks take a soft, rounded profile instead.
  soft = max(soft, 0.85 * smoothstep(0.05, 0.5, vCap));
  float thinMedium = step(3.5, tile);
  tile = mod(tile, 4.0);
  vec2 base = vec2(mod(tile, 2.0), floor(tile / 2.0)) * 0.5;
  vec2 uv = vec2(sign(vUv.x) * max(0.0, abs(vUv.x) - vCap), vUv.y);
  vec2 uvT = base + (uv * 0.5 + 0.5) * 0.5;
  vec4 tx = texture2D(uAtlas, uvT);
  float ru = length(uv);
  // an old, diffuse puff: its outline fades out gradually instead of ending at the lobe rims
  float dens = tx.r * mix(1.0, 1.0 - smoothstep(0.15, 0.95, ru), soft);
  // a distant sprite samples the coarse mip levels, where the tiles bleed into each other and
  // the density no longer reaches zero at the quad's edge: window it so no square outline shows
  dens *= 1.0 - smoothstep(0.78, 1.0, ru);
  float a = dens * vAlb.a * vFade;
  vec3 emitT = vEmit.rgb * dens * dens * vFade;
  if (a < 0.002 && dot(emitT, vec3(1.0)) < 0.002) discard;
  // tile-space normal rotated into view space
  vec2 nt = tx.gb * 2.0 - 1.0;
  vec2 nxy = vRot * nt.x + vec2(-vRot.y, vRot.x) * nt.y;
  // thin media (gas puffs, vapour, spray) have no sharp lobes to shade: a flatter normal, or
  // a sunlit puff reads as dirty billowing smoke
  vec3 n = normalize(vec3(nxy * (1.0 - 0.5 * soft) * (1.0 - 0.55 * thinMedium), sqrt(max(0.0, 1.0 - dot(nt, nt)))));
  vec3 toCam = normalize(-vView);
  float shadow = vEmit.a;
  float ndl = dot(n, uSunView);
  float wrap = clamp((ndl + 0.4) / 1.4, 0.0, 1.0);
  // forward scattering through thin, sunlit edges (Henyey-Greenstein, g = 0.55)
  float mu = dot(-uSunView, toCam);
  float g = 0.55;
  float hg = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * mu, 1.5) / 12.566;
  float sunVis = 1.0 - 0.72 * shadow;
  // a thick cloud scatters many times: its sunlit side is brighter than a white wall would be
  vec3 light = uSunCol * sunVis * mix(wrap * 1.3 + hg * (1.0 - dens) * 5.0, 0.8 + 0.4 * wrap + hg * 6.0, thinMedium);
  // multiple scattering: sunlight diffuses through a thick cloud and leaves it on every side,
  // so a sunlit steam cloud stays white on its shaded side (a few times darker than its lit
  // side, not ten), greyer toward its far side and its base
  light += uSunCol * (0.4 * (1.0 - thinMedium) * (1.0 - 0.6 * shadow) * (0.6 + 0.4 * dens));
  float up = dot(n, uUpView) * 0.5 + 0.5;
  // inside a thick cloud light scatters many times and mixes: its shaded parts take a more
  // neutral grey than the blue sky alone would give
  vec3 amb = mix(uGround, uSky, up);
  amb = mix(amb, vec3(dot(amb, vec3(0.3, 0.5, 0.2))), 0.45 * (1.0 - thinMedium));
  light += amb * (1.25 - 0.35 * shadow);
  // the flame is an extended source tens of metres long: soften the falloff near it
  for (int i = 0; i < 2; i++) {
    vec3 L = uFlamePos[i] - vView;
    float d2 = dot(L, L);
    float nl = dot(n, L * inversesqrt(max(d2, 1e-4))) * 0.5 + 0.5;
    light += uFlameCol[i] * nl / (d2 + 400.0);
  }
  vec3 col = vAlb.rgb * light * RECIPROCAL_PI;
  float dist = length(vView);
  float fog = 1.0 - exp(-dist * uHazeDensity);
  col = mix(col, uHaze, fog);
  emitT *= 1.0 - fog;
  gl_FragColor = fxComposite(fxOut(col), a, fxGlow(emitT));
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
/** Occlusion grid for the overdraw control (screen cells). */
const GW = 24;
const GH = 14;
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
  private depth = new Float32Array(0);
  private idx: number[] = [];
  capacity: number;
  /** Most screen area the sprites may cover, in screens (set from the quality tier). */
  fillBudget = 40;
  private grid = new Float32Array(GW * GH);
  /** Screen area covered by the last frame's sprites, and what the overdraw control dropped (diagnostics). */
  fill = 0;
  culled = { offscreen: 0, hidden: 0, budget: 0 };

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
   * Overdraw control, nearest sprites first: (1) sprites off screen are dropped; (2) sprites
   * hidden behind nearer ones (a coarse screen grid accumulates their opacity) are dropped, so
   * the inside of a dense cloud costs nothing; (3) the screen area of what remains is capped
   * (fillBudget, in screens), keeping the nearest. Marks dropped entries of idx with -1.
   */
  private cull(ps: Particle[], idx: number[], depth: Float32Array, camera: THREE.Camera, ox: number, oy: number, oz: number) {
    const P = camera.projectionMatrix.elements;
    const p0 = P[0];
    const p5 = P[5];
    // camera basis from its world matrix (matrixWorldInverse is only refreshed at render time)
    const W = camera.matrixWorld.elements;
    const rxX = W[0], rxY = W[1], rxZ = W[2];
    const uyX = W[4], uyY = W[5], uyZ = W[6];
    const cpX = W[12], cpY = W[13], cpZ = W[14];
    const rl = Math.hypot(rxX, rxY, rxZ) || 1;
    const ul = Math.hypot(uyX, uyY, uyZ) || 1;
    const T = this.grid;
    T.fill(1);
    let fill = 0;
    const cs = this.culled;
    cs.offscreen = cs.hidden = cs.budget = 0;
    for (let q = idx.length - 1; q >= 0; q--) {
      const i = idx[q];
      const p = ps[i];
      const d = depth[i];
      const x = p.pos.x - ox - cpX;
      const y = p.pos.y - oy - cpY;
      const z = p.pos.z - oz - cpZ;
      const cx = ((x * rxX + y * rxY + z * rxZ) / rl) * (p0 / d);
      const cy = ((x * uyX + y * uyY + z * uyZ) / ul) * (p5 / d);
      const r = p.radius + 0.5 * p.stretch;
      const rx = (r * p0) / d;
      const ry = (r * p5) / d;
      if (cx - rx > 1 || cx + rx < -1 || cy - ry > 1 || cy + ry < -1) {
        idx[q] = -1;
        cs.offscreen++;
        continue;
      }
      // grid cells under the dense middle of the sprite (60 % of its radius)
      const ix0 = Math.max(0, Math.floor(((cx - 0.6 * rx + 1) / 2) * GW));
      const ix1 = Math.min(GW - 1, Math.floor(((cx + 0.6 * rx + 1) / 2) * GW));
      const iy0 = Math.max(0, Math.floor(((cy - 0.6 * ry + 1) / 2) * GH));
      const iy1 = Math.min(GH - 1, Math.floor(((cy + 0.6 * ry + 1) / 2) * GH));
      const glows = p.emit.r + p.emit.g + p.emit.b > 0.05;
      if (ix1 >= ix0 && iy1 >= iy0 && !glows) {
        let tMax = 0;
        for (let gy = iy0; gy <= iy1 && tMax < 0.04; gy++) for (let gx = ix0; gx <= ix1; gx++) tMax = Math.max(tMax, T[gy * GW + gx]);
        if (tMax < 0.04) {
          idx[q] = -1;
          cs.hidden++;
          continue;
        }
      }
      const cov = Math.min(1.5, Math.PI * rx * ry * 0.25);
      if (cov > 0.02 && fill + cov > this.fillBudget) {
        idx[q] = -1;
        cs.budget++;
        continue;
      }
      fill += cov;
      // only sprites whose dense middle spans whole cells hide what is behind them
      if (0.6 * rx >= 2 / GW && 0.6 * ry >= 2 / GH) {
        const k = 1 - 0.7 * Math.min(1, p.alpha);
        for (let gy = iy0; gy <= iy1; gy++) for (let gx = ix0; gx <= ix1; gx++) T[gy * GW + gx] *= k;
      }
    }
    this.fill = fill;
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
    }
    shadeClouds(ps, n, L.sunDir);
    camera.getWorldDirection(fwd);
    const ox = origin.x;
    const oy = origin.y;
    const oz = origin.z;
    const cw = camera.matrixWorld.elements;
    const idx = this.idx;
    idx.length = 0;
    for (let i = 0; i < n; i++) {
      const p = ps[i];
      const x = p.pos.x - ox - cw[12];
      const y = p.pos.y - oy - cw[13];
      const z = p.pos.z - oz - cw[14];
      const d = x * fwd.x + y * fwd.y + z * fwd.z;
      // behind the camera, or so close that the near fade (vFade) hides it
      if (d < p.radius * 0.18) continue;
      // nearly transparent: skip
      if (p.alpha < 0.01 && p.emit.r + p.emit.g + p.emit.b < 0.01) continue;
      this.depth[i] = d;
      idx.push(i);
    }
    const depth = this.depth;
    idx.sort((a, b) => depth[b] - depth[a]);
    this.cull(ps, idx, depth, camera, ox, oy, oz);
    let nf = 0;
    let nn = 0;
    for (const i of idx) {
      if (i < 0) continue;
      const p = ps[i];
      const b = depth[i] > splitDepth ? this.far : this.near;
      const j = b === this.far ? nf++ : nn++;
      b.pos.array[j * 3] = p.pos.x - ox;
      b.pos.array[j * 3 + 1] = p.pos.y - oy;
      b.pos.array[j * 3 + 2] = p.pos.z - oz;
      b.shape.array[j * 4] = p.radius;
      b.shape.array[j * 4 + 1] = p.rot;
      b.shape.array[j * 4 + 2] = p.stretch;
      // tile index, plus the edge softness in the fractional part
      b.shape.array[j * 4 + 3] = p.variant + (p.group === Group.Puff || p.group === Group.Vent || p.group === Group.Water ? 4 : 0) + 0.9 * Math.min(1, Math.max(0, p.soft));
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
