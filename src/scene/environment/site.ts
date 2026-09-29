/**
 * Assembles the launch site once (imperative three.js; geometry built once, transforms and
 * uniforms updated per frame) and returns the root group plus the per-frame update:
 * terrain and water, roads, the pad (hardstand, trench, deflector, mount, hold-downs), the
 * service tower and its arms, the facilities around the complex and the landing zone.
 */
import * as THREE from 'three';
import { tierSpec } from '../quality';
import type { SiteMaps } from './map';
import { buildOverlay } from './overlay';
import { buildTerrain } from './terrain';
import { buildRoads } from './roads';
import { buildPad } from './pad';
import { buildTower } from './tower';
import { buildFacilities } from './facilities';
import { buildLandingZone } from './lz';
import { buildVegetation } from './vegetation';
import { updateHaze } from './haze';
import { SM } from './mats';
import { siteState } from './state';

export interface Site {
  root: THREE.Group;
  update(): void;
  dispose(): void;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function buildSite(maps: SiteMaps): Site {
  const detail = tierSpec().detail;
  const root = new THREE.Group();
  root.name = 'launch-site';
  const overlay = buildOverlay();
  const terrain = buildTerrain(maps, overlay);
  const roads = buildRoads(maps);
  const pad = buildPad();
  const tower = buildTower(detail);
  const facilities = buildFacilities(maps, detail);
  const lz = buildLandingZone();
  const vegetation = buildVegetation(maps, overlay);
  root.add(terrain.group, roads, pad.group, tower.group, facilities.group, lz.group, vegetation.group);

  // the deck and trench darken and turn glossy under the sound-suppression water
  const wetMats = (['hardstand', 'concreteDark', 'refractory'] as const).map((k) => {
    const m = SM(k) as THREE.MeshStandardMaterial;
    return { m, color: m.color.clone(), rough: m.roughness };
  });
  let lastWet = -1;

  return {
    root,
    update() {
      updateHaze();
      terrain.update();
      pad.update();
      tower.update();
      facilities.update();
      const wet = smooth(0.05, 0.6, siteState.deluge);
      if (wet !== lastWet) {
        lastWet = wet;
        for (const w of wetMats) {
          w.m.color.copy(w.color).multiplyScalar(1 - 0.38 * wet);
          w.m.roughness = w.rough + (0.25 - w.rough) * wet;
        }
      }
    },
    dispose() {
      terrain.dispose();
      lz.dispose();
      vegetation.dispose();
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh && mesh.geometry) mesh.geometry.dispose();
        if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
      });
      overlay.tex.dispose();
    },
  };
}
