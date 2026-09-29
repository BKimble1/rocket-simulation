/**
 * One-time GPU generation of the cloud field's textures:
 *   - a tileable 3D noise volume (R: Perlin-Worley cells, G/B/A: Worley fBm at 3 scales);
 *   - the global weather coverage cube map (Earth-fixed): R = cloud fraction, G = cloud-top
 *     factor. Built from domain-warped fBm with `cloudOctaves` octaves, a latitude climatology
 *     (tropical convergence band, clear subtropical highs, mid-latitude storm tracks), a few
 *     cyclone swirls turning the right way in each hemisphere, and fewer clouds over deserts.
 */
import * as THREE from 'three';

const NOISE_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const NOISE_FRAG = /* glsl */ `
varying vec2 vUv;
uniform float uZ;      // slice coordinate 0..1
uniform float uSize;

vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
// tileable Worley: distance to the nearest feature point (cells wrap with the period)
float worley(vec3 p, float period) {
  vec3 id = floor(p);
  vec3 fr = fract(p);
  float d = 1e9;
  for (int x = -1; x <= 1; x++)
  for (int y = -1; y <= 1; y++)
  for (int z = -1; z <= 1; z++) {
    vec3 o = vec3(float(x), float(y), float(z));
    vec3 c = mod(id + o, period);
    vec3 h = hash33(c + 17.0);
    vec3 r = o + h - fr;
    d = min(d, dot(r, r));
  }
  return sqrt(d);
}
float worleyFbm(vec3 p, float f) {
  return 1.0 - clamp(worley(p * f, f) * 0.625 + worley(p * f * 2.0, f * 2.0) * 0.25 + worley(p * f * 4.0, f * 4.0) * 0.125, 0.0, 1.0);
}
// tileable gradient noise
vec3 grad(vec3 c, float period) { return normalize(hash33(mod(c, period) + 3.7) * 2.0 - 1.0); }
float perlin(vec3 p, float period) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float n000 = dot(grad(i, period), f);
  float n100 = dot(grad(i + vec3(1, 0, 0), period), f - vec3(1, 0, 0));
  float n010 = dot(grad(i + vec3(0, 1, 0), period), f - vec3(0, 1, 0));
  float n110 = dot(grad(i + vec3(1, 1, 0), period), f - vec3(1, 1, 0));
  float n001 = dot(grad(i + vec3(0, 0, 1), period), f - vec3(0, 0, 1));
  float n101 = dot(grad(i + vec3(1, 0, 1), period), f - vec3(1, 0, 1));
  float n011 = dot(grad(i + vec3(0, 1, 1), period), f - vec3(0, 1, 1));
  float n111 = dot(grad(i + vec3(1, 1, 1), period), f - vec3(1, 1, 1));
  return mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y), mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
}
float perlinFbm(vec3 p, float f) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * perlin(p * f, f); f *= 2.0; a *= 0.5; }
  return s;
}
void main() {
  vec3 p = vec3(vUv, uZ);
  float pf = perlinFbm(p, 4.0) * 0.5 + 0.5;
  float w4 = worleyFbm(p, 4.0);
  // Perlin-Worley: billowy cells with Perlin's continuity
  float pw = clamp((pf - (1.0 - w4) * 0.55) / 0.72 + 0.12, 0.0, 1.0);
  // stretch each channel to use 0..1 (measured 5th-95th percentiles of the raw noise)
  vec4 raw = vec4(pw, worleyFbm(p, 4.0), worleyFbm(p, 8.0), worleyFbm(p, 16.0));
  gl_FragColor = clamp((raw - vec4(0.22, 0.28, 0.26, 0.27)) / vec4(0.42, 0.43, 0.44, 0.42), 0.0, 1.0);
}
`;

/** Tileable 3D noise volume rendered slice by slice on the GPU. */
export function generateNoiseVolume(gl: THREE.WebGLRenderer, size: number): THREE.WebGL3DRenderTarget {
  const rt = new THREE.WebGL3DRenderTarget(size, size, size, { depthBuffer: false, stencilBuffer: false });
  const tex = rt.texture;
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  const mat = new THREE.ShaderMaterial({ vertexShader: NOISE_VERT, fragmentShader: NOISE_FRAG, uniforms: { uZ: { value: 0 }, uSize: { value: size } }, depthTest: false, depthWrite: false });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const prev = gl.getRenderTarget();
  const prevTone = gl.toneMapping;
  gl.toneMapping = THREE.NoToneMapping;
  for (let z = 0; z < size; z++) {
    mat.uniforms.uZ.value = (z + 0.5) / size;
    gl.setRenderTarget(rt, z);
    gl.render(scene, cam);
  }
  gl.setRenderTarget(prev);
  gl.toneMapping = prevTone;
  geo.dispose();
  mat.dispose();
  return rt;
}

const COVER_VERT = /* glsl */ `
varying vec3 vDir;
void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const COVER_FRAG = /* glsl */ `
varying vec3 vDir;
uniform sampler2D uDay;
uniform sampler2D uWater;
uniform int uOct;

vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
float gnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  #define G(o) dot(normalize(hash33(i + o) * 2.0 - 1.0), f - o)
  float n = mix(mix(mix(G(vec3(0,0,0)), G(vec3(1,0,0)), u.x), mix(G(vec3(0,1,0)), G(vec3(1,1,0)), u.x), u.y),
                mix(mix(G(vec3(0,0,1)), G(vec3(1,0,1)), u.x), mix(G(vec3(0,1,1)), G(vec3(1,1,1)), u.x), u.y), u.z);
  #undef G
  return n;
}
const mat3 ROT = mat3(0.00, 0.80, 0.60, -0.80, 0.36, -0.48, -0.60, -0.48, 0.64);
float fbm(vec3 p, int oct) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 8; i++) {
    if (i >= oct) break;
    s += a * gnoise(p);
    p = ROT * p * 2.03 + 1.7;
    a *= 0.5;
  }
  return s;
}
vec3 rotAbout(vec3 v, vec3 k, float a) {
  float c = cos(a), s = sin(a);
  return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
}
vec3 latLon(float latD, float lonD) {
  float la = radians(latD), lo = radians(lonD);
  return vec3(cos(la) * cos(lo), sin(la), -cos(la) * sin(lo));
}
// a cyclone: rotate the lookup point about its centre by an angle falling off with distance
vec3 swirl(vec3 n, vec3 c, float radius, float strength) {
  float d = acos(clamp(dot(n, c), -1.0, 1.0));
  float w = exp(-(d * d) / (radius * radius));
  return rotAbout(n, c, strength * w);
}
void main() {
  vec3 n = normalize(vDir);
  float latD = degrees(asin(clamp(n.y, -1.0, 1.0)));
  // extratropical cyclones (counter-clockwise seen from above in the north: positive angle
  // about the local up turns the pattern clockwise in the lookup, i.e. the flow the other way)
  n = swirl(n, latLon(52.0, -32.0), 0.16, 2.6);
  n = swirl(n, latLon(47.0, 162.0), 0.18, 2.8);
  n = swirl(n, latLon(58.0, 12.0), 0.11, 1.8);
  n = swirl(n, latLon(-52.0, 20.0), 0.17, -2.8);
  n = swirl(n, latLon(-56.0, 118.0), 0.15, -2.4);
  n = swirl(n, latLon(-48.0, -120.0), 0.16, -2.6);
  n = swirl(n, latLon(-60.0, -50.0), 0.13, -2.0);
  n = swirl(n, latLon(16.0, 138.0), 0.05, 4.0);  // a tropical cyclone in the western Pacific
  n = normalize(n);

  vec3 p = n * 2.1;
  vec3 q = vec3(fbm(p + vec3(1.7, 9.2, 3.1), 3), fbm(p + vec3(8.3, 2.8, 5.6), 3), fbm(p + vec3(4.1, 6.5, 0.7), 3));
  p += 0.85 * q;
  float big = fbm(p * 1.4, max(uOct - 2, 2));
  float meso = fbm(p * 7.0 + 3.3, uOct);
  // stretch mid-latitude fronts east-west
  vec3 pz = vec3(n.x * 5.0, n.y * 14.0, n.z * 5.0) + q * 2.0;
  float fronts = fbm(pz, 4);

  float a = abs(latD);
  float clim = 0.52
    + 0.20 * exp(-pow((latD - 6.0) / 7.0, 2.0))          // tropical convergence band
    - 0.17 * exp(-pow((a - 22.0) / 8.0, 2.0))             // subtropical highs (trade cumulus remain)
    + 0.18 * exp(-pow((a - 55.0) / 11.0, 2.0))            // storm tracks
    - 0.08 * smoothstep(70.0, 85.0, a);
  float midlat = exp(-pow((a - 50.0) / 14.0, 2.0));
  float c = clim + 0.95 * big + 0.32 * meso + 0.35 * midlat * fronts;

  // deserts stay clear: bright, reddish land away from water
  vec3 m = normalize(vDir);
  float lon = atan(-m.z, m.x);
  float lat = asin(clamp(m.y, -1.0, 1.0));
  vec2 uv = vec2(0.5 + lon / 6.2831853, 0.5 + lat / 3.14159265);
  vec3 day = textureLod(uDay, uv, 3.0).rgb;
  float water = textureLod(uWater, uv, 3.0).r;
  float desert = (1.0 - water) * smoothstep(0.18, 0.4, day.r) * smoothstep(0.0, 0.08, day.r - day.b);
  c -= 0.35 * desert * (1.0 - midlat);

  // fairly sharp edges: organised systems read as distinct cloud from orbit, not a grey veil
  float cov = smoothstep(0.47, 0.7, c);
  // convective towers in the tropics, flatter decks elsewhere
  float tropic = exp(-pow(latD / 18.0, 2.0));
  float top = clamp(0.25 + 0.55 * cov * (0.5 + 0.5 * tropic) + 0.25 * meso, 0.0, 1.0);
  gl_FragColor = vec4(cov, top, 0.0, 1.0);
}
`;

/** Earth-fixed weather coverage cube map. */
export function generateCoverage(gl: THREE.WebGLRenderer, size: number, octaves: number, day: THREE.Texture, water: THREE.Texture): THREE.WebGLCubeRenderTarget {
  const rt = new THREE.WebGLCubeRenderTarget(size, {
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
  });
  rt.texture.colorSpace = THREE.NoColorSpace;
  const mat = new THREE.ShaderMaterial({
    vertexShader: COVER_VERT,
    fragmentShader: COVER_FRAG,
    uniforms: { uDay: { value: day }, uWater: { value: water }, uOct: { value: octaves } },
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
  });
  const geo = new THREE.SphereGeometry(1, 64, 32);
  const mesh = new THREE.Mesh(geo, mat);
  const scene = new THREE.Scene();
  scene.add(mesh);
  const cc = new THREE.CubeCamera(0.1, 10, rt);
  const prevTone = gl.toneMapping;
  const prev = gl.getRenderTarget();
  gl.toneMapping = THREE.NoToneMapping;
  cc.update(gl, scene);
  gl.setRenderTarget(prev);
  gl.toneMapping = prevTone;
  geo.dispose();
  mat.dispose();
  return rt;
}
