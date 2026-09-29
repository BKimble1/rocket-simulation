/**
 * Earth, Moon and star-map textures (served from public/, loaded once, resolution by tier).
 * Loading is imperative (no Suspense) so the rest of the flight scene never waits on the sky:
 * until an image arrives its uniform holds a neutral 1x1 texture.
 */
import * as THREE from 'three';
import { asset } from '../../config';
import { tierSpec } from '../quality';

export interface SpaceTextures {
  day: THREE.Texture;
  night: THREE.Texture;
  water: THREE.Texture;
  moon: THREE.Texture;
  stars: THREE.Texture;
}

function solid(r: number, g: number, b: number, srgb: boolean): THREE.Texture {
  const t = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

const placeholders: SpaceTextures = {
  day: solid(40, 60, 90, true),
  night: solid(0, 0, 0, true),
  water: solid(255, 255, 255, false),
  moon: solid(120, 120, 120, true),
  stars: solid(0, 0, 0, true),
};

/** Current textures (placeholders until loaded). */
export const spaceTextures: SpaceTextures = { ...placeholders };

/** Loading state: `ready` once every texture has arrived (or failed; failures keep a placeholder). */
export const spaceAssets = { ready: false, loaded: 0, total: 5, failed: [] as string[], version: 0, promise: null as Promise<void> | null, cloudsReady: false, envReady: false };

let started = '';

/** Start loading (idempotent per resolution); resolves when all textures are in. */
export function loadSpaceTextures(maxAniso = 8): Promise<void> {
  const spec = tierSpec();
  const big = spec.maxTexture >= 4096;
  // anisotropic filtering: sharp globe at grazing angles; cheap on GPUs, bounded on low tiers
  const aniso = Math.min(maxAniso, spec.maxTexture >= 8192 ? 8 : spec.maxTexture >= 4096 ? 4 : 1);
  const key = big ? 'big' : 'small';
  if (started === key && spaceAssets.promise) return spaceAssets.promise;
  started = key;
  const loader = new THREE.TextureLoader();
  const list: [keyof SpaceTextures, string, boolean][] = [
    ['day', big ? 'textures/earth/day_4096.jpg' : 'textures/earth/day_2048.jpg', true],
    ['night', 'textures/earth/night_2048.jpg', true],
    ['water', 'textures/earth/water_2048.png', false],
    ['moon', big ? 'textures/moon/lroc_4096.jpg' : 'textures/moon/lroc_2048.jpg', true],
    ['stars', 'textures/sky/tycho_2880.jpg', true],
  ];
  spaceAssets.loaded = 0;
  spaceAssets.ready = false;
  spaceAssets.promise = Promise.all(
    list.map(
      ([k, path, srgb]) =>
        new Promise<void>((resolve) => {
          loader.load(
            asset(path),
            (t) => {
              t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
              t.wrapS = THREE.RepeatWrapping;
              t.wrapT = THREE.ClampToEdgeWrapping;
              t.anisotropy = k === 'stars' ? 1 : aniso;
              t.minFilter = THREE.LinearMipmapLinearFilter;
              t.magFilter = THREE.LinearFilter;
              t.generateMipmaps = true;
              const old = spaceTextures[k];
              spaceTextures[k] = t;
              if (old !== placeholders[k]) old.dispose();
              spaceAssets.loaded++;
              spaceAssets.version++;
              resolve();
            },
            undefined,
            () => {
              spaceAssets.failed.push(path);
              spaceAssets.loaded++;
              resolve();
            },
          );
        }),
    ),
  ).then(() => {
    spaceAssets.ready = true;
    spaceAssets.version++;
  });
  return spaceAssets.promise;
}
