/**
 * Earth, Moon and star-map textures (served from public/, loaded once, resolution by tier).
 * <SpaceWorld/> suspends until the first set arrives (bounded by a timeout); a texture that fails
 * never throws: its uniform keeps a plain 1x1 colour and the load is retried in the background.
 */
import * as THREE from 'three';
import { asset } from '../../config';
import { tierSpec, whenTierKnown } from '../quality';

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

/** Loading state: `ready` once every texture has arrived or failed at least once (a failed
 *  texture keeps its plain-colour placeholder and is retried in the background). */
export const spaceAssets = { ready: false, loaded: 0, total: 5, failed: [] as string[], version: 0, promise: null as Promise<void> | null, cloudsReady: false, envReady: false };

/** Delays (ms) before retrying a texture that failed to load. */
const RETRY_MS = [2000, 5000, 12000, 30000, 60000];

let started = '';
let generation = 0;

/** Start loading (idempotent per resolution); resolves when every texture has arrived or failed
 *  once. Never rejects. */
export function loadSpaceTextures(maxAniso = 8): Promise<void> {
  const spec = tierSpec();
  const big = spec.maxTexture >= 4096;
  // anisotropic filtering: sharp globe at grazing angles; cheap on GPUs, bounded on low tiers
  const aniso = Math.min(maxAniso, spec.maxTexture >= 8192 ? 8 : spec.maxTexture >= 4096 ? 4 : 1);
  const key = big ? 'big' : 'small';
  if (started === key && spaceAssets.promise) return spaceAssets.promise;
  started = key;
  const gen = ++generation;
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
  spaceAssets.failed = [];
  const setup = (k: keyof SpaceTextures, t: THREE.Texture, srgb: boolean) => {
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
    spaceAssets.version++;
  };
  spaceAssets.promise = Promise.all(
    list.map(
      ([k, path, srgb]) =>
        new Promise<void>((resolve) => {
          let settled = false;
          const settle = () => {
            if (settled) return;
            settled = true;
            spaceAssets.loaded++;
            resolve();
          };
          const attempt = (n: number) => {
            try {
              loader.load(
                asset(path),
                (t) => {
                  if (gen !== generation) {
                    t.dispose(); // a newer tier's load superseded this one
                    return settle();
                  }
                  setup(k, t, srgb);
                  spaceAssets.failed = spaceAssets.failed.filter((f) => f !== path);
                  settle();
                },
                undefined,
                () => {
                  if (!spaceAssets.failed.includes(path)) spaceAssets.failed.push(path);
                  settle(); // keep the placeholder colour; the rest of the scene goes on
                  if (gen === generation && n < RETRY_MS.length) setTimeout(() => gen === generation && attempt(n + 1), RETRY_MS[n]);
                },
              );
            } catch {
              settle();
            }
          };
          attempt(0);
        }),
    ),
  ).then(() => {
    if (gen !== generation) return;
    spaceAssets.ready = true;
    spaceAssets.version++;
  });
  return spaceAssets.promise;
}

let firstLoad: Promise<void> | null = null;

/**
 * Promise for <SpaceWorld/> to suspend on: resolves when the first set of textures has arrived
 * (or failed, keeping placeholders) or after `timeoutMs`, whichever comes first, so a slow or
 * missing asset never holds the flight location back for long. Never rejects.
 */
export function spaceTexturesSettled(maxAniso = 8, timeoutMs = 8000): Promise<void> {
  if (firstLoad) return firstLoad;
  // wait for the device tier first, so a low-tier device never downloads the 4K maps
  firstLoad = whenTierKnown()
    .then(() => Promise.race([loadSpaceTextures(maxAniso), new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))]))
    .catch(() => undefined);
  return firstLoad;
}
