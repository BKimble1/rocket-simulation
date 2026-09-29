/**
 * Spacecraft material variants, derived from the shared palette (`M()` in scene/materials.ts)
 * so the spacecraft speak the same material language as the launcher: crinkled MLI foils,
 * solar cells under cover glass, optical solar reflectors, reusable tiles, ablator (with a
 * per-model charring uniform), hatched section faces, the identity decal, textiles.
 * Shared variants are cached for the session; per-model materials are created by the builders.
 */
import * as THREE from 'three';
import { M, type MatKey } from '../materials';
import {
  ablatorTex,
  backshellStreaks,
  backshellTiles,
  canopyAlpha,
  crumple,
  fabricNormal,
  hatchTex,
  kimbleDecal,
  osrTiles,
  panelBackTex,
  quiltTex,
  radiatorTex,
  solarCells,
  type ConeSpec,
  type HatchKind,
} from './textures';

const shared = new Map<string, THREE.Material>();

function once<T extends THREE.Material>(key: string, make: () => T): T {
  let m = shared.get(key) as T | undefined;
  if (!m) {
    m = make();
    m.name = `sc-${key}`;
    shared.set(key, m);
  }
  return m;
}

/** A palette material cloned with overrides (shared). */
export function variant(key: MatKey, name: string, p: Record<string, unknown>): THREE.Material {
  return once(`${key}-${name}`, () => {
    const m = M(key).clone();
    Object.assign(m, p);
    return m;
  });
}

export type Foil = 'gold' | 'silver' | 'black' | 'white';

/**
 * Multilayer insulation outer layers: amber aluminised polyimide ("gold"), aluminised ("silver"),
 * carbon-loaded black polyimide, white beta cloth. UVs in metres / 0.6 (one crumple repeat).
 */
export const MLI_REPEAT = 0.6;
export function mli(kind: Foil): THREE.Material {
  return once(`mli-${kind}`, () => {
    const c = crumple();
    if (kind === 'white') {
      return new THREE.MeshStandardMaterial({ color: '#e8e4d8', roughness: 0.82, metalness: 0, normalMap: c.normal, normalScale: new THREE.Vector2(0.35, 0.35), map: c.lum });
    }
    if (kind === 'black') {
      return new THREE.MeshStandardMaterial({ color: '#2a2a2d', roughness: 0.42, metalness: 0.3, normalMap: c.normal, normalScale: new THREE.Vector2(0.7, 0.7), map: c.lum, roughnessMap: c.rough });
    }
    const gold = kind === 'gold';
    return new THREE.MeshStandardMaterial({
      color: gold ? '#e3ad48' : '#d6dade',
      roughness: gold ? 0.42 : 0.38,
      metalness: 1,
      map: c.lum,
      normalMap: c.normal,
      normalScale: new THREE.Vector2(1, 1),
      roughnessMap: c.rough,
    });
  });
}

/** Aluminium or polyimide tape over blanket seams (smooth, not crinkled). */
export function tape(kind: 'alu' | 'kapton' | 'black'): THREE.Material {
  return once(`tape-${kind}`, () =>
    new THREE.MeshStandardMaterial(
      kind === 'alu' ? { color: '#d9dcdf', roughness: 0.22, metalness: 1 } : kind === 'kapton' ? { color: '#c98a2c', roughness: 0.28, metalness: 0.9 } : { color: '#1f1f21', roughness: 0.5, metalness: 0.2 },
    ),
  );
}

/** Solar cell face (UVs in metres / CELL_TILE). */
export function cells(): THREE.Material {
  return once('cells', () => {
    const t = solarCells();
    return new THREE.MeshPhysicalMaterial({
      color: '#ffffff',
      map: t.map,
      normalMap: t.normal,
      normalScale: new THREE.Vector2(0.6, 0.6),
      roughness: 1,
      roughnessMap: t.rough,
      metalness: 0.15,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      specularIntensity: 0.6,
    });
  });
}

export function panelBack(): THREE.Material {
  return once('panelBack', () => new THREE.MeshStandardMaterial({ color: '#ffffff', map: panelBackTex(), roughness: 0.6, metalness: 0.1 }));
}

export function osr(): THREE.Material {
  return once('osr', () => {
    const t = osrTiles();
    return new THREE.MeshStandardMaterial({ color: '#ffffff', map: t.map, roughnessMap: t.rough, roughness: 1, metalness: 1 });
  });
}

export function radiator(): THREE.Material {
  return once('radiator', () => {
    const t = radiatorTex();
    return new THREE.MeshStandardMaterial({ color: '#ffffff', map: t.map, normalMap: t.normal, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.55, metalness: 0 });
  });
}

export function quilt(): THREE.Material {
  return once('quilt', () => {
    const t = quiltTex();
    return new THREE.MeshStandardMaterial({ color: '#ffffff', map: t.map, normalMap: t.normal, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.85, metalness: 0 });
  });
}

/** Hatched section face (engineering-drawing convention). */
export function hatch(kind: HatchKind): THREE.Material {
  return once(`hatch-${kind}`, () =>
    new THREE.MeshStandardMaterial({ color: '#ffffff', map: hatchTex(kind), roughness: 0.75, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
  );
}

/** Backshell tiles (shared per detail). */
export function tiles(spec: ConeSpec, small: boolean): THREE.Material {
  return once(`tiles-${small ? 's' : 'l'}`, () => {
    const t = backshellTiles(spec, small);
    return new THREE.MeshStandardMaterial({ color: '#ffffff', map: t.map, normalMap: t.normal, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.92, roughnessMap: t.rough, metalness: 0 });
  });
}

/** Entry streak overlay (per model: its opacity follows capChar). */
export function streaks(spec: ConeSpec): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: '#ffffff',
    map: backshellStreaks(spec),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    roughness: 0.95,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

/**
 * Ablator with a per-model char uniform: as `uChar` rises the surface darkens to char with
 * lighter scoured patches and radial flow streaks (texture), and gets rougher.
 */
export function ablator(): { mat: THREE.MeshStandardMaterial; char: { value: number } } {
  const t = ablatorTex();
  const char = { value: 0 };
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', map: t.map, normalMap: t.normal, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.9, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uChar = char;
    sh.uniforms.charMap = { value: t.char };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uChar;\nuniform sampler2D charMap;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          float cp = texture2D(charMap, vMapUv).r;
          float k = clamp(uChar * 1.25 - (1.0 - cp) * 0.35 * (1.0 - uChar), 0.0, 1.0);
          vec3 charCol = vec3(0.045, 0.040, 0.036) * (0.55 + 1.6 * cp);
          diffuseColor.rgb = mix(diffuseColor.rgb, charCol, k);
        }`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.97, uChar);');
  };
  mat.customProgramCacheKey = () => 'sc-ablator-char';
  return { mat, char };
}

export function decal(): THREE.Material {
  return once('decal', () =>
    new THREE.MeshStandardMaterial({
      map: kimbleDecal(),
      transparent: true,
      roughness: 0.6,
      metalness: 0,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    }),
  );
}

/** Parachute canopy: nylon, double-sided, vertex colours for the gores, slots by alpha. */
export function canopy(kind: 'ringsail' | 'ribbon'): THREE.Material {
  return once(`canopy-${kind}`, () =>
    new THREE.MeshStandardMaterial({
      color: '#ffffff',
      vertexColors: true,
      roughness: 0.78,
      metalness: 0,
      side: THREE.DoubleSide,
      alphaMap: canopyAlpha(kind),
      alphaTest: 0.5,
      normalMap: fabricNormal(),
      normalScale: new THREE.Vector2(0.25, 0.25),
      emissive: '#2a1a10',
      emissiveIntensity: 0.25,
    }),
  );
}

export function textile(color = '#e4dccb'): THREE.Material {
  return once(`textile-${color}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, normalMap: fabricNormal(), normalScale: new THREE.Vector2(0.4, 0.4) }));
}

export function lineMat(color: string, opacity = 1): THREE.LineBasicMaterial {
  return once(`line-${color}-${opacity}`, () => new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }));
}

/** Frequently used palette entries and small variants. */
export const P = {
  white: () => M('paintWhite'),
  graphite: () => M('paintGraphite'),
  accent: () => M('accent'),
  alu: () => M('aluminum'),
  aluMilled: () => M('aluminumMilled'),
  aluDark: () => M('aluminumDark'),
  steel: () => M('stainless'),
  ti: () => M('titanium'),
  inconel: () => M('inconel'),
  niobium: () => M('niobium'),
  carbon: () => M('carbon'),
  carbonSatin: () => M('carbonSatin'),
  anod: () => M('blackAnodized'),
  rubber: () => M('rubber'),
  glass: () => M('glass'),
  tileBlack: () => M('tileBlack'),
  tileWhite: () => M('tileWhite'),
  honeycomb: () => M('honeycomb'),
  /** Dark nozzle interior / soot. */
  soot: () => variant('niobium', 'soot', { color: new THREE.Color('#1e1c1b'), roughness: 0.8, metalness: 0.4 }),
  /** Thruster chamber (silicide-coated niobium: dull dark grey-violet). */
  thruster: () => variant('niobium', 'thruster', { color: new THREE.Color('#4d4a52'), roughness: 0.5 }),
  /** Composite structure panel (satellite panels edge-on, carrier structure). */
  cfrpPanel: () => variant('carbonSatin', 'panel', { color: new THREE.Color('#34363b'), roughness: 0.55 }),
  /** White thermal paint (instrument housings, star-tracker baffles outside). */
  whitePaint: () => variant('paintWhite', 'thermal', { roughness: 0.7, clearcoat: 0 }),
  /** Sensor glass (star trackers, camera lenses): dark, glossy. */
  lens: () => variant('glass', 'lens', { color: new THREE.Color('#0d1420'), transmission: 0, opacity: 1, transparent: false, roughness: 0.04, metalness: 0.2 }),
  /** Window pane: dark glass that reflects. */
  pane: () => variant('glass', 'pane', { color: new THREE.Color('#141c24'), transmission: 0, opacity: 1, transparent: false, roughness: 0.03, metalness: 0.1, clearcoat: 1 }),
  /** Mirror (telescope primary). */
  mirror: () => variant('aluminum', 'mirror', { color: new THREE.Color('#dfe6ee'), roughness: 0.03, normalMap: null }),
  /** Interior equipment (avionics boxes, lockers). */
  boxGrey: () => variant('aluminumMilled', 'box', { color: new THREE.Color('#a9adb3'), roughness: 0.55 }),
  seat: () => variant('carbonSatin', 'seat', { color: new THREE.Color('#3a3d44'), roughness: 0.8 }),
  cushion: () => variant('paintGraphite', 'cushion', { color: new THREE.Color('#5a5f6a'), roughness: 0.95, clearcoat: 0 }),
  display: () => variant('glass', 'display', { color: new THREE.Color('#0f1a26'), transmission: 0, opacity: 1, transparent: false, roughness: 0.15, emissive: new THREE.Color('#2a5a8a'), emissiveIntensity: 0.35 }),
  gold: () => variant('copper', 'goldplate', { color: new THREE.Color('#d8a64a'), roughness: 0.25 }),
};
