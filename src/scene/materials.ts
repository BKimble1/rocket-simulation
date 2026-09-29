/**
 * The shared material language. Every scene draws with these physically based materials so
 * paint, bare aluminium, engine alloys, copper, composites, insulation and thermal protection
 * read as different things under the same light. Materials are created once and shared
 * (bounded GPU programs); a scene that needs a variant clones one.
 *
 * Roughness/metalness follow measured-appearance conventions (bare metals metalness 1 with
 * their own base colour; paints and composites metalness 0). Small surface detail comes from
 * procedural normal/roughness maps generated once on a canvas (no network assets).
 */
import * as THREE from 'three';

type MatKey =
  | 'paintWhite'
  | 'paintWhiteSoot'
  | 'paintGraphite'
  | 'accent'
  | 'aluminum'
  | 'aluminumMilled'
  | 'aluminumDark'
  | 'stainless'
  | 'inconel'
  | 'inconelHot'
  | 'copper'
  | 'niobium'
  | 'titanium'
  | 'carbon'
  | 'carbonSatin'
  | 'honeycomb'
  | 'foam'
  | 'mliGold'
  | 'mliSilver'
  | 'tileBlack'
  | 'tileWhite'
  | 'ablator'
  | 'ablatorChar'
  | 'glass'
  | 'rubber'
  | 'blackAnodized'
  | 'solarCell'
  | 'concrete'
  | 'steelPainted'
  | 'steelGalv'
  | 'frost'
  | 'cutFace'
  | 'loxLiquid'
  | 'rp1Liquid';

export const ACCENT = '#6a5af9';
export const GRAPHITE = '#2a2d33';
export const WHITE = '#f3f2ee';

// ───────────────────────────── procedural maps ─────────────────────────────

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!];
}

function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cache = new Map<string, THREE.Texture>();

/** Fine brushed-metal normal map (streaks along U). */
export function brushedNormal(): THREE.Texture {
  const key = 'brushed';
  if (cache.has(key)) return cache.get(key)!;
  const S = 256;
  const [c, g] = canvas(S);
  const r = mulberry(7);
  const img = g.createImageData(S, S);
  const rows = new Float32Array(S).map(() => r() * 2 - 1);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const ny = rows[y] * 0.25 + (r() - 0.5) * 0.05;
      img.data[i] = 128;
      img.data[i + 1] = 128 + ny * 127;
      img.data[i + 2] = 255;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  cache.set(key, t);
  return t;
}

/** Low-amplitude roughness variation (hand-applied paint, handling marks). */
export function roughnessNoise(seed = 3, amount = 0.12): THREE.Texture {
  const key = `rough${seed}-${amount}`;
  if (cache.has(key)) return cache.get(key)!;
  const S = 256;
  const [c, g] = canvas(S);
  const r = mulberry(seed);
  const img = g.createImageData(S, S);
  // value noise, two octaves
  const grid = (n: number) => Array.from({ length: n * n }, () => r());
  const g1 = grid(8);
  const g2 = grid(32);
  const sample = (gr: number[], n: number, x: number, y: number) => {
    const fx = (x / S) * n;
    const fy = (y / S) * n;
    const x0 = Math.floor(fx) % n;
    const y0 = Math.floor(fy) % n;
    const x1 = (x0 + 1) % n;
    const y1 = (y0 + 1) % n;
    const u = fx - Math.floor(fx);
    const v = fy - Math.floor(fy);
    const a = gr[y0 * n + x0] * (1 - u) + gr[y0 * n + x1] * u;
    const b = gr[y1 * n + x0] * (1 - u) + gr[y1 * n + x1] * u;
    return a * (1 - v) + b * v;
  };
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const v = 1 - amount + amount * (0.6 * sample(g1, 8, x, y) + 0.4 * sample(g2, 32, x, y));
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(v * 255);
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  cache.set(key, t);
  return t;
}

/** Twill weave normal map for exposed carbon composite. */
export function weaveNormal(): THREE.Texture {
  const key = 'weave';
  if (cache.has(key)) return cache.get(key)!;
  const S = 128;
  const [c, g] = canvas(S);
  const img = g.createImageData(S, S);
  const cell = 16;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const cx = Math.floor(x / cell);
      const cy = Math.floor(y / cell);
      const over = (cx + cy) % 4 < 2; // 2x2 twill
      const u = (x % cell) / cell - 0.5;
      const v = (y % cell) / cell - 0.5;
      const nx = over ? -u * 0.6 : 0;
      const ny = over ? 0 : -v * 0.6;
      img.data[i] = 128 + nx * 127;
      img.data[i + 1] = 128 + ny * 127;
      img.data[i + 2] = 255;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  cache.set(key, t);
  return t;
}

/** Crinkled foil normal map (multilayer insulation). */
export function crinkleNormal(): THREE.Texture {
  const key = 'crinkle';
  if (cache.has(key)) return cache.get(key)!;
  const S = 256;
  const [c, g] = canvas(S);
  const r = mulberry(11);
  g.fillStyle = 'rgb(128,128,255)';
  g.fillRect(0, 0, S, S);
  for (let k = 0; k < 420; k++) {
    const x = r() * S;
    const y = r() * S;
    const a = r() * Math.PI;
    const len = 10 + r() * 40;
    const nx = Math.cos(a + Math.PI / 2);
    const ny = Math.sin(a + Math.PI / 2);
    g.strokeStyle = `rgb(${128 + nx * 90},${128 + ny * 90},230)`;
    g.lineWidth = 1 + r() * 2.5;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  cache.set(key, t);
  return t;
}

// ───────────────────────────── the palette ─────────────────────────────

const mats = new Map<MatKey, THREE.Material>();

function make(key: MatKey): THREE.Material {
  const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(p);
  const phys = (p: THREE.MeshPhysicalMaterialParameters) => new THREE.MeshPhysicalMaterial(p);
  switch (key) {
    case 'paintWhite':
      return phys({ color: WHITE, roughness: 0.46, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.5, roughnessMap: roughnessNoise(3, 0.1) });
    case 'paintWhiteSoot':
      return phys({ color: '#d9d6cf', roughness: 0.6, metalness: 0, roughnessMap: roughnessNoise(5, 0.2) });
    case 'paintGraphite':
      return phys({ color: GRAPHITE, roughness: 0.52, metalness: 0, clearcoat: 0.15, clearcoatRoughness: 0.6 });
    case 'accent':
      return phys({ color: ACCENT, roughness: 0.45, metalness: 0, clearcoat: 0.2 });
    case 'aluminum':
      return std({ color: '#c9ccd1', roughness: 0.34, metalness: 1, normalMap: brushedNormal(), normalScale: new THREE.Vector2(0.25, 0.25) });
    case 'aluminumMilled':
      return std({ color: '#bfc3c9', roughness: 0.42, metalness: 1, roughnessMap: roughnessNoise(9, 0.18) });
    case 'aluminumDark':
      return std({ color: '#8d9299', roughness: 0.5, metalness: 1 });
    case 'stainless':
      return std({ color: '#d4d6d8', roughness: 0.26, metalness: 1, normalMap: brushedNormal(), normalScale: new THREE.Vector2(0.18, 0.18) });
    case 'inconel':
      return std({ color: '#8f877d', roughness: 0.38, metalness: 1, roughnessMap: roughnessNoise(13, 0.2) });
    case 'inconelHot':
      return std({ color: '#6f5a4a', roughness: 0.45, metalness: 1, roughnessMap: roughnessNoise(14, 0.25) });
    case 'copper':
      return std({ color: '#c77b4e', roughness: 0.32, metalness: 1 });
    case 'niobium':
      return std({ color: '#5a5d63', roughness: 0.55, metalness: 0.85, roughnessMap: roughnessNoise(17, 0.2) });
    case 'titanium':
      return std({ color: '#7d7f84', roughness: 0.48, metalness: 1, roughnessMap: roughnessNoise(19, 0.25) });
    case 'carbon':
      return phys({ color: '#1c1d20', roughness: 0.38, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.35, normalMap: weaveNormal(), normalScale: new THREE.Vector2(0.35, 0.35) });
    case 'carbonSatin':
      return std({ color: '#26272b', roughness: 0.62, metalness: 0 });
    case 'honeycomb':
      return std({ color: '#b8b0a0', roughness: 0.6, metalness: 0.4 });
    case 'foam':
      return std({ color: '#d48a3a', roughness: 0.9, metalness: 0 });
    case 'mliGold':
      return std({ color: '#d9a441', roughness: 0.28, metalness: 1, normalMap: crinkleNormal(), normalScale: new THREE.Vector2(0.6, 0.6) });
    case 'mliSilver':
      return std({ color: '#cfd3d8', roughness: 0.3, metalness: 1, normalMap: crinkleNormal(), normalScale: new THREE.Vector2(0.5, 0.5) });
    case 'tileBlack':
      return std({ color: '#1e1e1f', roughness: 0.85, metalness: 0 });
    case 'tileWhite':
      return std({ color: '#e8e6df', roughness: 0.88, metalness: 0 });
    case 'ablator':
      return std({ color: '#5a4636', roughness: 0.92, metalness: 0 });
    case 'ablatorChar':
      return std({ color: '#1b1714', roughness: 0.96, metalness: 0 });
    case 'glass':
      return phys({ color: '#9fb4c4', roughness: 0.05, metalness: 0, transmission: 0.6, transparent: true, opacity: 0.55 });
    case 'rubber':
      return std({ color: '#161718', roughness: 0.85, metalness: 0 });
    case 'blackAnodized':
      return std({ color: '#202225', roughness: 0.45, metalness: 0.9 });
    case 'solarCell':
      return phys({ color: '#1a2744', roughness: 0.22, metalness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.1 });
    case 'concrete':
      return std({ color: '#a9a69f', roughness: 0.92, metalness: 0, roughnessMap: roughnessNoise(23, 0.15) });
    case 'steelPainted':
      return std({ color: '#5d6166', roughness: 0.6, metalness: 0.4 });
    case 'steelGalv':
      return std({ color: '#a8acb0', roughness: 0.5, metalness: 0.9, roughnessMap: roughnessNoise(29, 0.25) });
    case 'frost':
      return std({ color: '#f4f6f7', roughness: 0.95, metalness: 0 });
    case 'cutFace':
      return std({ color: '#e7ddc8', roughness: 0.7, metalness: 0, side: THREE.DoubleSide });
    case 'loxLiquid':
      return phys({ color: '#9cc8ec', roughness: 0.1, metalness: 0, transparent: true, opacity: 0.72, transmission: 0.2, side: THREE.DoubleSide });
    case 'rp1Liquid':
      return phys({ color: '#d9c27a', roughness: 0.12, metalness: 0, transparent: true, opacity: 0.72, transmission: 0.2, side: THREE.DoubleSide });
  }
}

export function M(key: MatKey): THREE.Material {
  let m = mats.get(key);
  if (!m) {
    m = make(key);
    m.name = key;
    mats.set(key, m);
  }
  return m;
}

export type { MatKey };
