/**
 * Engine materials: variants of the shared palette (materials.ts) plus the few surfaces only
 * an engine has: the brazed tube-wall bell (procedural tube normal map and heat tint), the
 * injector faceplate (polar orifice map), hatched section faces (one hatch style per material
 * family, like a technical drawing), the niobium extension with its radiative glow, and the
 * flow-overlay dashes. Shared materials are created once per page; per-engine clones (fade,
 * glow) are made by `engineMaterialSet()`.
 */
import * as THREE from 'three';
import { M, brushedNormal, roughnessNoise, weaveNormal } from '../../materials';
import type { MaterialId } from '../../../content/materials/ids';
import { tierSpec } from '../../quality';

export type EMat =
  | 'copper'
  | 'jacket'
  | 'inconel'
  | 'inconelHot'
  | 'machined'
  | 'tubes'
  | 'stainless'
  | 'steel'
  | 'aluminum'
  | 'titanium'
  | 'gimbal'
  | 'actuator'
  | 'chrome'
  | 'braid'
  | 'anodized'
  | 'niobium'
  | 'faceplate'
  | 'soot'
  | 'ggHot'
  | 'bronze'
  | 'ceramic';

export type HatchFamily = 'cu' | 'ni' | 'ss' | 'al' | 'ti' | 'nb';

/** Material family for the Materials lens and the lessons. */
export const MATERIAL_OF: Record<EMat, MaterialId | undefined> = {
  copper: 'grcop',
  jacket: 'nickel-superalloy',
  inconel: 'nickel-superalloy',
  inconelHot: 'nickel-superalloy',
  machined: 'nickel-superalloy',
  tubes: 'stainless',
  stainless: 'stainless',
  steel: 'stainless',
  aluminum: 'al-2219',
  titanium: 'titanium',
  gimbal: 'stainless',
  actuator: 'stainless',
  chrome: 'stainless',
  braid: undefined,
  anodized: undefined,
  niobium: 'niobium-c103',
  faceplate: 'stainless',
  soot: 'nickel-superalloy',
  ggHot: 'nickel-superalloy',
  bronze: 'stainless',
  ceramic: undefined,
};

export const HATCH_OF: Record<EMat, HatchFamily> = {
  copper: 'cu',
  jacket: 'ni',
  inconel: 'ni',
  inconelHot: 'ni',
  machined: 'ni',
  tubes: 'ss',
  stainless: 'ss',
  steel: 'ss',
  aluminum: 'al',
  titanium: 'ti',
  gimbal: 'ss',
  actuator: 'ss',
  chrome: 'ss',
  braid: 'ss',
  anodized: 'al',
  niobium: 'nb',
  faceplate: 'ss',
  soot: 'ni',
  ggHot: 'ni',
  bronze: 'ss',
  ceramic: 'ni',
};

const hasDOM = typeof document !== 'undefined';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

// ───────────────────────────── procedural textures ─────────────────────────────

let tubeNormalTex: THREE.Texture | null = null;
/** Normal map of brazed coolant tubes running along V (8 tubes across U). */
function tubeNormal(): THREE.Texture {
  if (tubeNormalTex) return tubeNormalTex;
  const W = 256;
  const H = 64;
  const [c, g] = canvas(W, H);
  const img = g.createImageData(W, H);
  // (no per-row noise along the tubes: at the anisotropic mip level the bell is sampled at, it
  // aliased into dotted highlights along every braze line)
  const per = W / 8;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const t = ((x % per) + 0.5) / per; // 0..1 across one tube
      // round crown: slope of a circular arc, softened near the braze line between tubes
      const s = t * 2 - 1;
      const nx = Math.sin(s * Math.PI * 0.42) * 0.8;
      const nz = Math.sqrt(Math.max(0.05, 1 - nx * nx));
      const i = (y * W + x) * 4;
      img.data[i] = Math.round((nx * 0.5 + 0.5) * 255);
      img.data[i + 1] = 128;
      img.data[i + 2] = Math.round(nz * 255);
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 8;
  tubeNormalTex = t;
  return t;
}

let tubeColorTex: THREE.Texture | null = null;
/** Heat-tint gradient of the tube-wall bell along V (0 = top joint, 1 = exit lip). */
function tubeColor(): THREE.Texture {
  if (tubeColorTex) return tubeColorTex;
  const W = 64;
  const H = 512;
  const [c, g] = canvas(W, H);
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#a08b76');
  grad.addColorStop(0.08, '#94806f');
  grad.addColorStop(0.2, '#7f7584');
  grad.addColorStop(0.34, '#8c7f73');
  grad.addColorStop(0.62, '#7d7268');
  grad.addColorStop(0.86, '#655d56');
  grad.addColorStop(0.96, '#4a4541');
  grad.addColorStop(1, '#3a3633');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // faint per-tube variation (one streak per tube, 8 tubes across the tile, along V)
  const r = rng(9);
  for (let x = 0; x < W; x += W / 8) {
    g.fillStyle = `rgba(${r() < 0.5 ? '255,240,220' : '40,30,25'},${0.02 + r() * 0.03})`;
    g.fillRect(x, 0, W / 8, H);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = false; // canvas row 0 = v 0 = top of the bell
  tubeColorTex = t;
  return t;
}

let niobiumTex: THREE.Texture | null = null;
/**
 * Mottling of the silicide-coated niobium extension (multiplies its colour, about +-6 %): a
 * coating sprayed and fired by hand is never uniform, and faint streaks run down the bell from
 * the joint (V: 0 at the joint, 1 at the exit). Without it the 2.8 m bell reads as flat plastic.
 */
function niobiumColor(): THREE.Texture | null {
  if (!hasDOM) return null;
  if (niobiumTex) return niobiumTex;
  const W = 256;
  const H = 512;
  const [c, g] = canvas(W, H);
  const img = g.createImageData(W, H);
  const r = rng(71);
  const grid = (nx: number, ny: number) => Array.from({ length: nx * ny }, () => r());
  const oct = [
    { nx: 6, ny: 5, a: 0.05, g: grid(6, 5) },
    { nx: 24, ny: 20, a: 0.025, g: grid(24, 20) },
    { nx: 96, ny: 64, a: 0.012, g: grid(96, 64) },
  ];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const noise = (o: (typeof oct)[number], x: number, y: number) => {
    const fx = (x / W) * o.nx;
    const fy = (y / H) * (o.ny - 1);
    const x0 = Math.floor(fx) % o.nx;
    const x1 = (x0 + 1) % o.nx;
    const y0 = Math.min(o.ny - 1, Math.floor(fy));
    const y1 = Math.min(o.ny - 1, y0 + 1);
    const u = smooth(fx - Math.floor(fx));
    const v = smooth(fy - Math.floor(fy));
    const a = o.g[y0 * o.nx + x0] * (1 - u) + o.g[y0 * o.nx + x1] * u;
    const b = o.g[y1 * o.nx + x0] * (1 - u) + o.g[y1 * o.nx + x1] * u;
    return (a * (1 - v) + b * v - 0.5) * 2;
  };
  // streaks: a smoothed random value per column, strongest near the joint
  const col = Array.from({ length: W }, () => r() - 0.5);
  const streak = col.map((_v, x) => {
    let sum = 0;
    for (let k = -3; k <= 3; k++) sum += col[(x + k + W) % W];
    return sum / 7;
  });
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let m = 0.93;
      for (const o of oct) m += o.a * noise(o, x, y);
      m += streak[x] * 0.12 * (1 - (y / H) * 0.7);
      const v = Math.max(0, Math.min(1, m));
      const i = (y * W + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(v * 255);
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.repeat.set(3, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.flipY = false;
  niobiumTex = t;
  return t;
}

const hatchTex = new Map<HatchFamily, THREE.Texture>();
const HATCH_STYLE: Record<HatchFamily, { base: string; line: string; angle: number; pattern: 'single' | 'double' | 'dash' | 'cross' }> = {
  cu: { base: '#e2a07a', line: '#8a4a2a', angle: 45, pattern: 'dash' },
  ni: { base: '#d3cbbf', line: '#6b6258', angle: 45, pattern: 'single' },
  ss: { base: '#d9dde1', line: '#5f666e', angle: 45, pattern: 'double' },
  al: { base: '#d6e0ea', line: '#61738a', angle: -45, pattern: 'single' },
  ti: { base: '#c9c9cc', line: '#606066', angle: -45, pattern: 'double' },
  nb: { base: '#b5ab9d', line: '#5a5147', angle: 45, pattern: 'cross' },
};
/** Section hatch: 128 px tile = HATCH_TILE metres; 4 hatch periods per tile. */
export const HATCH_TILE = 0.04;
function hatch(f: HatchFamily): THREE.Texture {
  const hit = hatchTex.get(f);
  if (hit) return hit;
  const S = 128;
  const [c, g] = canvas(S, S);
  const st = HATCH_STYLE[f];
  g.fillStyle = st.base;
  g.fillRect(0, 0, S, S);
  g.strokeStyle = st.line;
  g.lineCap = 'butt';
  // line families x + y = c (45 deg) or x - y = c (-45 deg) with c stepping S/4: seamless tiles
  const step = S / 4;
  const diag = S * Math.SQRT2;
  const lines = (sign: number, width: number, offset: number, dashed = false) => {
    g.lineWidth = width;
    g.setLineDash(dashed ? [(diag / 12) * 0.6, (diag / 12) * 0.4] : []);
    for (let j = -6; j <= 10; j++) {
      const c = j * step + offset;
      g.beginPath();
      if (sign > 0) {
        g.moveTo(c, 0);
        g.lineTo(c - S, S);
      } else {
        g.moveTo(c, 0);
        g.lineTo(c + S, S);
      }
      g.stroke();
    }
  };
  const sgn = st.angle > 0 ? 1 : -1;
  // line widths about 2 mm at the 4 cm tile: thinner lines vanish at viewing distance and the
  // section faces read as plain white
  if (st.pattern === 'single') lines(sgn, 6, 0);
  else if (st.pattern === 'double') {
    lines(sgn, 4, -step * 0.16);
    lines(sgn, 4, step * 0.16);
  } else if (st.pattern === 'dash') {
    lines(sgn, 5.5, 0);
    lines(sgn, 3.2, step * 0.5, true);
  } else {
    lines(sgn, 4.6, 0);
    lines(-sgn, 2.8, 0);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  hatchTex.set(f, t);
  return t;
}

let faceTex: { map: THREE.Texture; normal: THREE.Texture } | null = null;
/**
 * Injector faceplate in polar coordinates (U = angle, V = radius / chamber radius): concentric
 * rings of unlike-impinging doublets (a fuel and an oxidizer orifice side by side), ring
 * grooves, heat discolouration and soot toward the wall.
 */
function faceplate(): { map: THREE.Texture; normal: THREE.Texture } {
  if (faceTex) return faceTex;
  const big = tierSpec().maxTexture >= 4096;
  const W = big ? 2048 : 1024;
  const H = big ? 512 : 256;
  const [c, g] = canvas(W, H);
  const [cn, gn] = canvas(W, H);
  // base: straw-to-bronze heat tint, darker near the wall (v = 1)
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#b9ad98');
  grad.addColorStop(0.45, '#a8957a');
  grad.addColorStop(0.8, '#8a7662');
  grad.addColorStop(1, '#5d5047');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  gn.fillStyle = 'rgb(128,128,255)';
  gn.fillRect(0, 0, W, H);
  const Rc = 0.2125; // reference radius the pattern is laid out for (m)
  const pxPerM = H / Rc;
  // concentric ring grooves between element rows
  const rings: number[] = [];
  for (let r = 0.028; r < Rc - 0.012; r += 0.0125) rings.push(r);
  for (const r of rings) {
    const y = r * pxPerM;
    g.fillStyle = 'rgba(60,48,40,0.25)';
    g.fillRect(0, y + 0.0062 * pxPerM, W, 1);
  }
  const hole = (x: number, y: number, rr: number, rx: number) => {
    // dark orifice with a bright chamfer ring
    g.fillStyle = 'rgba(235,225,205,0.85)';
    g.beginPath();
    g.ellipse(x, y, rx * 1.55, rr * 1.55, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#16110e';
    g.beginPath();
    g.ellipse(x, y, rx, rr, 0, 0, Math.PI * 2);
    g.fill();
    // normal: a small cone (chamfer) around the hole
    for (const [k, a] of [
      [1.55, 0.5],
      [1.15, 0.9],
    ] as [number, number][]) {
      const gr = gn.createRadialGradient(x, y, 0, x, y, rr * k);
      gr.addColorStop(0, `rgba(128,128,${Math.round(255 * a)},1)`);
      gr.addColorStop(1, 'rgba(128,128,255,0)');
      gn.fillStyle = gr;
      gn.beginPath();
      gn.ellipse(x, y, rx * k, rr * k, 0, 0, Math.PI * 2);
      gn.fill();
    }
  };
  const holeR = 0.0015; // 3 mm orifices (m)
  for (const r of rings) {
    const circ = 2 * Math.PI * r;
    const pairs = Math.floor(circ / 0.0135);
    const y = r * pxPerM;
    const rr = holeR * pxPerM;
    const rx = (holeR / circ) * W; // angular extent in pixels
    for (let k = 0; k < pairs; k++) {
      const u = ((k + (rings.indexOf(r) % 2) * 0.5) / pairs) * W;
      const sep = (0.0034 / circ) * W; // doublet spacing along the ring
      hole(u - sep, y, rr, rx);
      hole(u + sep, y, rr, rx);
    }
  }
  // centre: igniter port and a small cluster of elements
  g.fillStyle = '#1b1612';
  g.fillRect(0, 0, W, 0.006 * pxPerM);
  // soot and streaks (polar, so streaks along V are radial on the face)
  const r = rng(21);
  for (let k = 0; k < 900; k++) {
    const x = r() * W;
    const y = r() * H;
    g.fillStyle = `rgba(30,24,20,${0.02 + r() * 0.05})`;
    g.fillRect(x, y, 2 + r() * 10, 1 + r() * 30);
  }
  const map = new THREE.CanvasTexture(c);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  map.flipY = false; // canvas row 0 = v 0 = centre of the face
  const normal = new THREE.CanvasTexture(cn);
  normal.wrapS = THREE.RepeatWrapping;
  normal.wrapT = THREE.ClampToEdgeWrapping;
  normal.colorSpace = THREE.NoColorSpace;
  normal.flipY = false;
  faceTex = { map, normal };
  return faceTex;
}

let dashTex: THREE.Texture | null = null;
/** Flow dash: bright head, fading tail, along U (repeats every 1/REPEAT m). */
function dash(): THREE.Texture {
  if (dashTex) return dashTex;
  const W = 128;
  const H = 8;
  const [c, g] = canvas(W, H);
  const grad = g.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0.10)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.35)');
  grad.addColorStop(0.86, 'rgba(255,255,255,1)');
  grad.addColorStop(0.93, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0.10)');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  dashTex = t;
  return t;
}
/** Dashes per metre of flow path. */
export const DASH_PER_M = 9;

// ───────────────────────────── shared materials ─────────────────────────────

const shared = new Map<string, THREE.Material>();
function once<T extends THREE.Material>(key: string, make: () => T): T {
  let m = shared.get(key) as T | undefined;
  if (!m) {
    m = make();
    m.name = `engine:${key}`;
    shared.set(key, m);
  }
  return m;
}

const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(p);

export function baseMaterial(k: EMat): THREE.Material {
  switch (k) {
    case 'copper':
      return once(k, () => std({ color: '#c47a4f', roughness: 0.3, metalness: 1, roughnessMap: roughnessNoise(31, 0.18) }));
    case 'jacket':
      return once(k, () => std({ color: '#8e867b', roughness: 0.36, metalness: 1, roughnessMap: roughnessNoise(33, 0.22), normalMap: brushedNormal(), normalScale: new THREE.Vector2(0.12, 0.12) }));
    case 'inconel':
      return M('inconel');
    case 'inconelHot':
      return M('inconelHot');
    case 'machined':
      return once(k, () => std({ color: '#b3ab9f', roughness: 0.24, metalness: 1, normalMap: brushedNormal(), normalScale: new THREE.Vector2(0.15, 0.15) }));
    case 'tubes':
      return once(k, () => patchTubes(std({ color: '#ffffff', map: tubeColor(), roughness: 0.42, metalness: 1, normalMap: tubeNormal(), normalScale: new THREE.Vector2(0.7, 0.7), roughnessMap: roughnessNoise(37, 0.25) })));
    case 'stainless':
      return M('stainless');
    case 'steel':
      return once(k, () => std({ color: '#b9bcbf', roughness: 0.3, metalness: 1, normalMap: brushedNormal(), normalScale: new THREE.Vector2(0.14, 0.14) }));
    case 'aluminum':
      return M('aluminumMilled');
    case 'titanium':
      return M('titanium');
    case 'gimbal':
      return once(k, () => std({ color: '#7f8388', roughness: 0.3, metalness: 1, normalMap: brushedNormal(), normalScale: new THREE.Vector2(0.2, 0.2) }));
    case 'actuator':
      return once(k, () => std({ color: '#5a5d62', roughness: 0.38, metalness: 0.9, roughnessMap: roughnessNoise(41, 0.15) }));
    case 'chrome':
      return once(k, () => std({ color: '#e4e6e8', roughness: 0.1, metalness: 1 }));
    case 'braid':
      return once(k, () => std({ color: '#2c2d30', roughness: 0.78, metalness: 0.2, normalMap: weaveNormal(), normalScale: new THREE.Vector2(0.6, 0.6) }));
    case 'anodized':
      return M('blackAnodized');
    case 'niobium':
      // silicide-coated niobium alloy: matte dark grey with a slight bronze tint
      return once(k, () => std({ color: '#35302b', map: niobiumColor(), roughness: 0.72, metalness: 0.3, roughnessMap: roughnessNoise(43, 0.2) }));
    case 'faceplate':
      return once(k, () => {
        const f = faceplate();
        return std({ color: '#ffffff', map: f.map, normalMap: f.normal, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.55, metalness: 0.85 });
      });
    case 'soot':
      return once(k, () => std({ color: '#2b2724', roughness: 0.86, metalness: 0.35, roughnessMap: roughnessNoise(47, 0.2) }));
    case 'ggHot':
      return once(k, () => std({ color: '#5f4c40', roughness: 0.5, metalness: 1, roughnessMap: roughnessNoise(49, 0.3) }));
    case 'bronze':
      return once(k, () => std({ color: '#a48a6a', roughness: 0.34, metalness: 1 }));
    case 'ceramic':
      return once(k, () => std({ color: '#d8d2c6', roughness: 0.85, metalness: 0 }));
  }
}

/**
 * The brazed-tube relief fades out where a tube covers less than about three pixels: past that
 * the normal map only makes moire rings; full relief from about 10 px per tube (mipmapping alone does not remove them on a bell seen
 * from metres away). The tubes stay visible as long as they are resolvable.
 */
function patchTubes(m: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  m.onBeforeCompile = (sh) => {
    // Tangent frame from the geometry, not from screen-space derivatives: the bell is a solid of
    // revolution about the object's Y axis with u growing with the plan angle (x = r sin phi,
    // z = r cos phi), so the tangent is (z, 0, -x). Derivative tangents are constant per
    // triangle and draw V-shaped bands along the quad diagonals of the coarser bells; vertex
    // tangent attributes would not survive the vehicle's baking of the cluster engines.
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTubeT;').replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      {
        vec3 tO = vec3(position.z, 0.0, -position.x);
        float tl = length(tO);
        vec4 tw = vec4(tl > 1e-6 ? tO / tl : vec3(1.0, 0.0, 0.0), 0.0);
        #ifdef USE_INSTANCING
          tw = instanceMatrix * tw;
        #endif
        vTubeT = (modelViewMatrix * tw).xyz;
      }`,
    );
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vTubeT;').replace(
      '#include <normal_fragment_begin>',
      `#include <normal_fragment_begin>
      {
        vec3 tT = vTubeT - normal * dot(normal, vTubeT);
        tT = dot(tT, tT) > 1e-12 ? normalize(tT) : vec3(1.0, 0.0, 0.0);
        #ifdef DOUBLE_SIDED
          tT *= faceDirection;
        #endif
        tbn = mat3(tT, cross(normal, tT), normal);
      }`,
    );
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      THREE.ShaderChunk.normal_fragment_maps.replace(
        'mapN.xy *= normalScale;',
        // 8 tubes per texture repeat across u
        'mapN.xy *= normalScale * (1.0 - smoothstep(0.1, 0.26, fwidth(vNormalMapUv.x) * 8.0));',
      ) +
        `
      {
        // braze groove between neighbouring tubes: a dark crevice (the filtered normal map turns
        // flat right at the seam and would otherwise draw a thin bright line there), widened by
        // one pixel for antialiasing and faded out with the relief when tubes get too small
        float u8 = vNormalMapUv.x * 8.0;
        float fwT = fwidth(u8);
        float e = fract(u8);
        float edge = min(e, 1.0 - e);
        float groove = smoothstep(0.0, 0.05 + 1.5 * fwT, edge);
        float amt = 1.0 - smoothstep(0.1, 0.26, fwT);
        diffuseColor.rgb *= 1.0 - 0.78 * amt * (1.0 - groove);
        roughnessFactor = mix(roughnessFactor, 0.9, amt * (1.0 - groove));
        // specular antialiasing: widen the highlight where the relief changes faster than the
        // pixel grid can follow (thin, slanted highlights on the tube crowns break into dots)
        vec3 ndx = dFdx(normal);
        vec3 ndy = dFdy(normal);
        float kernel = min(2.5 * (dot(ndx, ndx) + dot(ndy, ndy)), 0.3);
        roughnessFactor = sqrt(min(1.0, roughnessFactor * roughnessFactor + kernel));
      }`,
    );
  };
  m.customProgramCacheKey = () => 'engine-tubes-aa-gs';
  return m;
}

export function hatchMaterial(f: HatchFamily): THREE.Material {
  return once(`hatch-${f}`, () => {
    const t = hatch(f);
    return std({ color: '#ffffff', map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.1, roughness: 0.62, metalness: 0.1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  });
}

// ───────────────────────────── per-engine material set ─────────────────────────────

export interface MaterialSet {
  /** Material for a merged bucket. */
  get(mat: EMat, role: 'keep' | 'front' | 'cap' | 'fcap'): THREE.Material;
  /** Opacity of the front half (1 intact, 0 removed). */
  setFade(opacity: number): void;
  /** Radiative glow of the niobium extension (0..1). */
  setGlow(g: number): void;
  flow(color: string, ghost: boolean): THREE.MeshBasicMaterial;
  dashTexture(): THREE.Texture | null;
  dispose(): void;
}

/** Radiative glow shader patch for the nozzle extension (uv.y: 0 at the joint, 1 at the exit). */
function patchGlow(m: THREE.MeshStandardMaterial, uniform: { value: number }) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uGlow = uniform;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vGlowT;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvGlowT = uv.y;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uGlow;\nvarying float vGlowT;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          // radiatively cooled niobium: brightest just below the joint (about 1300 K, a dark
          // red-orange), dimming toward the exit (dull red, then nothing visible)
          float t = clamp(vGlowT, 0.0, 1.0);
          // (kept below about 0.5 linear: AgX tone mapping desaturates brighter emission to a
          // pale peach; these values display as about rgb(182, 89, 55) at the joint and
          // rgb(125, 47, 29) a fifth of the way down)
          float hot = exp(-4.6 * t);
          vec3 c = mix(vec3(0.40, 0.026, 0.003), vec3(0.6, 0.065, 0.006), hot);
          totalEmissiveRadiance += c * hot * 0.8 * uGlow;
          // where it glows, emission dominates the look (a lit, reflective surface would wash the
          // dark red-orange out to a pale peach in a bright hangar)
          float lit = 1.0 - 0.85 * smoothstep(0.0, 0.5, hot * uGlow);
          diffuseColor.rgb *= lit;
          roughnessFactor = mix(roughnessFactor, 0.85, 1.0 - lit);
        }`,
      );
  };
  m.customProgramCacheKey = () => 'engine-nb-glow';
}

export function engineMaterialSet(): MaterialSet {
  const fades = new Map<string, THREE.Material>();
  const fadeList: THREE.Material[] = [];
  const owned: THREE.Material[] = [];
  const ownedTex: THREE.Texture[] = [];
  const glow = { value: 0 };
  let fade = 1;
  let niobium: THREE.MeshStandardMaterial | null = null;
  const niobiumMat = () => {
    if (!niobium) {
      niobium = (baseMaterial('niobium') as THREE.MeshStandardMaterial).clone();
      patchGlow(niobium, glow);
      owned.push(niobium);
    }
    return niobium;
  };
  const base = (mat: EMat) => (mat === 'niobium' ? niobiumMat() : baseMaterial(mat));
  const fadeOf = (key: string, src: THREE.Material) => {
    let m = fades.get(key);
    if (!m) {
      m = src.clone();
      if (src === niobium) patchGlow(m as THREE.MeshStandardMaterial, glow);
      if (key === 'tubes') patchTubes(m as THREE.MeshStandardMaterial);
      // always blended (opacity 1 when intact): toggling `transparent` later would not
      // recompile the program, so the fade would pop instead of dissolving
      m.transparent = true;
      m.opacity = fade;
      m.depthWrite = fade > 0.5;
      // one pass for double-sided section faces while they fade (not two)
      m.forceSinglePass = true;
      fades.set(key, m);
      fadeList.push(m);
      owned.push(m);
    }
    return m;
  };
  return {
    get(mat, role) {
      if (role === 'keep') return base(mat);
      if (role === 'front') return fadeOf(mat, base(mat));
      const h = hatchMaterial(HATCH_OF[mat]);
      if (role === 'cap') return h;
      return fadeOf(`hatch-${HATCH_OF[mat]}`, h);
    },
    setFade(o) {
      if (o === fade) return;
      fade = o;
      for (let i = 0; i < fadeList.length; i++) {
        fadeList[i].opacity = o;
        fadeList[i].depthWrite = o > 0.5;
      }
    },
    setGlow(g) {
      glow.value = g;
    },
    flow(color, ghost) {
      const m = new THREE.MeshBasicMaterial({
        color,
        map: hasDOM ? dash().clone() : null,
        transparent: true,
        opacity: ghost ? 0.28 : 0.95,
        depthWrite: false,
        depthTest: !ghost,
        toneMapped: false,
      });
      if (m.map) {
        m.map.repeat.set(DASH_PER_M, 1);
        m.map.needsUpdate = true;
        ownedTex.push(m.map);
      }
      owned.push(m);
      return m;
    },
    dashTexture: () => (hasDOM ? dash() : null),
    dispose() {
      for (const m of owned) m.dispose();
      for (const t of ownedTex) t.dispose();
      owned.length = 0;
      ownedTex.length = 0;
      fades.clear();
      fadeList.length = 0;
    },
  };
}

/** Minimal material set for tests and headless builds (no canvas). */
export function plainMaterialSet(): MaterialSet {
  const m = new THREE.MeshBasicMaterial();
  return {
    get: () => m,
    setFade() {},
    setGlow() {},
    flow: () => new THREE.MeshBasicMaterial(),
    dashTexture: () => null,
    dispose() {},
  };
}
