/**
 * Site materials: variants of the shared palette (src/scene/materials.ts, cloned, never edited)
 * plus site-specific surfaces, all with the site haze. Created once and shared.
 */
import * as THREE from 'three';
import { M, ACCENT, GRAPHITE, type MatKey } from '../materials';
import { withHaze } from './haze';
import {
  hardstandTexture,
  concreteTexture,
  refractoryTexture,
  deflectorTexture,
  gratingTexture,
  chainLinkTexture,
  corrugationNormal,
  asphaltTexture,
  paintRoughness,
  PAD_TEX_EXT,
} from './textures';

export type SiteMatKey =
  | 'concrete'
  | 'concreteLight'
  | 'concreteDark'
  | 'hardstand'
  | 'refractory'
  | 'deflector'
  | 'towerSteel'
  | 'steelDark'
  | 'galv'
  | 'grating'
  | 'yellow'
  | 'white'
  | 'whiteMatte'
  | 'aluminum'
  | 'stainless'
  | 'graphite'
  | 'accent'
  | 'glass'
  | 'rubber'
  | 'asphalt'
  | 'concreteRoad'
  | 'roadPaint'
  | 'chainLink'
  | 'cladding'
  | 'claddingGrey'
  | 'frp'
  | 'lamp'
  | 'redLight'
  | 'copper'
  | 'soil'
  | 'embankment';

const mats = new Map<SiteMatKey, THREE.Material>();

/**
 * Alpha-tested cut-outs (foliage cards, grating, chain link) without alpha to coverage: with it,
 * partial coverage at a distance resolved into pale, sky-coloured specks. Instead the alpha is
 * boosted with the texture's mip level (k per level) so thin cut-outs keep their coverage as the
 * mips average them toward transparent, and the plain alpha test decides.
 */
export function alphaMip<T extends THREE.MeshStandardMaterial>(m: T, k: number): T {
  m.alphaToCoverage = false;
  const img = m.map?.image as { width?: number; height?: number } | undefined;
  const w = img?.width ?? 256;
  const h = img?.height ?? 256;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    prev?.call(m, shader, renderer);
    if (k <= 0) return;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <alphatest_fragment>',
      `#ifdef USE_MAP
{
  vec2 mipT = vMapUv * vec2( ${w.toFixed(1)}, ${h.toFixed(1)} );
  vec2 mdx = dFdx( mipT );
  vec2 mdy = dFdy( mipT );
  float mipL = max( 0.0, 0.5 * log2( max( dot( mdx, mdx ), dot( mdy, mdy ) ) ) );
  diffuseColor.a *= 1.0 + mipL * ${k.toFixed(3)};
}
#endif
#include <alphatest_fragment>`,
    );
  };
  const prevKey = m.customProgramCacheKey?.bind(m);
  m.customProgramCacheKey = () => `${prevKey ? prevKey() : ''}|alphamip:${w}x${h}:${k}`;
  return m;
}

function fromPalette(key: MatKey, adjust: (m: THREE.MeshStandardMaterial) => void = () => {}): THREE.MeshStandardMaterial {
  const m = (M(key) as THREE.MeshStandardMaterial).clone();
  adjust(m);
  return m;
}

function make(key: SiteMatKey): THREE.Material {
  const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(p);
  switch (key) {
    case 'concrete':
      return fromPalette('concrete', (m) => {
        m.map = concreteTexture(5, '#b0ada5');
        m.color.set('#ffffff');
      });
    case 'concreteLight':
      return fromPalette('concrete', (m) => {
        m.map = concreteTexture(8, '#c4c1b9', 0.08);
        m.color.set('#ffffff');
      });
    case 'concreteDark':
      return fromPalette('concrete', (m) => {
        m.map = concreteTexture(6, '#8f8b83', 0.18);
        m.color.set('#ffffff');
      });
    case 'hardstand': {
      const t = hardstandTexture();
      const m = std({ map: t, roughness: 0.9, metalness: 0 });
      m.userData.padTexExt = PAD_TEX_EXT;
      return m;
    }
    case 'refractory':
      return std({ map: refractoryTexture(), roughness: 0.93, metalness: 0 });
    case 'deflector':
      return std({ map: deflectorTexture(), color: '#ffffff', roughness: 0.55, metalness: 0.85, roughnessMap: paintRoughness() });
    case 'towerSteel':
      // painted structural steel: a dielectric paint layer
      return std({ color: '#8a8f95', roughness: 0.58, metalness: 0, roughnessMap: paintRoughness() });
    case 'steelDark':
      return std({ color: '#4b4f55', roughness: 0.6, metalness: 0, roughnessMap: paintRoughness() });
    case 'galv':
      return fromPalette('steelGalv');
    case 'grating': {
      return alphaMip(std({ map: gratingTexture(), color: '#ffffff', roughness: 0.55, metalness: 0.8, alphaTest: 0.5, side: THREE.DoubleSide }), 0.1);
    }
    case 'yellow':
      return std({ color: '#c9a531', roughness: 0.5, metalness: 0, roughnessMap: paintRoughness() });
    case 'white':
      return std({ color: '#e4e3de', roughness: 0.45, metalness: 0, roughnessMap: paintRoughness() });
    case 'whiteMatte':
      return std({ color: '#dddcd6', roughness: 0.8, metalness: 0 });
    case 'aluminum':
      return fromPalette('aluminumMilled');
    case 'stainless':
      return fromPalette('stainless');
    case 'graphite':
      return std({ color: GRAPHITE, roughness: 0.55, metalness: 0 });
    case 'accent':
      return std({ color: ACCENT, roughness: 0.5, metalness: 0 });
    case 'glass':
      return std({ color: '#1f2a33', roughness: 0.08, metalness: 0.2 });
    case 'rubber':
      return fromPalette('rubber');
    case 'asphalt':
      return std({ map: asphaltTexture(), roughness: 0.92, metalness: 0 });
    case 'concreteRoad':
      return std({ map: concreteTexture(11, '#aeaaa2', 0.1), roughness: 0.9, metalness: 0 });
    case 'roadPaint':
      return std({ color: '#e6e3da', roughness: 0.6, metalness: 0 });
    case 'chainLink': {
      // no boost: seen from afar a chain-link fence is mostly air and fades out
      return alphaMip(std({ map: chainLinkTexture(), color: '#ffffff', roughness: 0.5, metalness: 0.8, alphaTest: 0.35, side: THREE.DoubleSide }), 0);
    }
    case 'cladding': {
      const t = corrugationNormal();
      return std({ color: '#e7e6e1', roughness: 0.5, metalness: 0, normalMap: t, normalScale: new THREE.Vector2(0.6, 0.6) });
    }
    case 'claddingGrey': {
      const t = corrugationNormal();
      return std({ color: '#9aa0a6', roughness: 0.5, metalness: 0, normalMap: t, normalScale: new THREE.Vector2(0.6, 0.6) });
    }
    case 'frp':
      return std({ color: '#d8cfa6', roughness: 0.55, metalness: 0 });
    case 'lamp':
      return std({ color: '#f4f1e6', roughness: 0.2, metalness: 0, emissive: new THREE.Color('#fff6e0'), emissiveIntensity: 0.15 });
    case 'redLight':
      return std({ color: '#b3261e', roughness: 0.3, metalness: 0, emissive: new THREE.Color('#ff2a1a'), emissiveIntensity: 1.2 });
    case 'copper':
      return fromPalette('copper');
    case 'soil':
      return std({ color: '#7d7462', roughness: 0.97, metalness: 0 });
    case 'embankment':
      return std({ map: concreteTexture(14, '#a8a49b', 0.16), roughness: 0.94, metalness: 0 });
  }
}

/** A site material (shared; do not dispose individually). */
export function SM(key: SiteMatKey): THREE.Material {
  let m = mats.get(key);
  if (!m) {
    m = withHaze(make(key));
    m.name = `site.${key}`;
    mats.set(key, m);
  }
  return m;
}

export function disposeSiteMaterials() {
  for (const m of mats.values()) m.dispose();
  mats.clear();
}
