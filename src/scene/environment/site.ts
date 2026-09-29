/**
 * Assembles the launch site once (imperative three.js; geometry built once, transforms and
 * uniforms updated per frame) and returns the root group plus the per-frame update.
 */
import * as THREE from 'three';
import { frame } from '../frame';
import type { SiteMaps } from './map';
import { buildOverlay } from './overlay';
import { buildTerrain } from './terrain';
import { updateHaze } from './haze';

export interface Site {
  root: THREE.Group;
  update(): void;
  dispose(): void;
}

export function buildSite(maps: SiteMaps): Site {
  const root = new THREE.Group();
  root.name = 'launch-site';
  root.matrixAutoUpdate = true;
  const overlay = buildOverlay();
  const terrain = buildTerrain(maps, overlay);
  root.add(terrain.group);
  const updaters: (() => void)[] = [terrain.update];
  const disposers: (() => void)[] = [terrain.dispose];

  return {
    root,
    update() {
      updateHaze();
      for (const u of updaters) u();
      void frame;
    },
    dispose() {
      for (const d of disposers) d();
    },
  };
}
