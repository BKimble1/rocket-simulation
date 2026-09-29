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
import { thermalClass } from './geom';

export interface Site {
  root: THREE.Group;
  /** Per frame, after the root is placed; `fovDeg` is the camera's vertical field of view. */
  update(fovDeg?: number): void;
  dispose(): void;
}

/**
 * Camera-distance culling (m from the camera to the object's pad-local bounding box, scaled to a
 * 60 deg field of view: a telephoto camera sees farther): beyond these distances the objects are
 * well below a pixel, so they cost triangles and shimmer without adding anything. The vegetation
 * sets its own (userData.lodMax, and userData.lodMaxH: the highest camera above the plants that
 * still draws them; seen from above, foliage cards are edge-on specks) per scatter region.
 */
const LOD_MAX: Record<string, number> = {
  'fence-posts': 2500,
  'fence-mesh': 2500,
  'tower-rails': 2500,
  'tower-stairs': 2500,
  'road-markings': 3500,
  pad: 22000,
  'service-tower': 22000,
  facilities: 22000,
  'landing-zone': 22000,
};

interface LodEntry {
  o: THREE.Object3D;
  box: THREE.Box3;
  max: number;
  maxH: number;
}

const TAN30 = Math.tan(Math.PI / 6);

const _cam = new THREE.Vector3();
const _qi = new THREE.Quaternion();

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

  // every mesh carries a thermal-lens class (the plume-facing deflector and trench 3, the rest 1)
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && typeof o.userData.thermal !== 'number') o.userData.thermal = thermalClass(o.userData.part as string | undefined);
  });
  // pad-local bounding boxes of the distance-culled objects (the root is still at the identity)
  root.updateMatrixWorld(true);
  const lods: LodEntry[] = [];
  root.traverse((o) => {
    const maxH = (o.userData.lodMaxH as number | undefined) ?? Infinity;
    const max = (o.userData.lodMax as number | undefined) ?? LOD_MAX[o.name] ?? (maxH < Infinity ? Infinity : undefined);
    if (max === undefined) return;
    const box = new THREE.Box3().setFromObject(o);
    if (!box.isEmpty()) lods.push({ o, box, max, maxH });
  });

  // the deck and trench darken and turn glossy under the sound-suppression water
  const wetMats = (['hardstand', 'concreteDark', 'refractory'] as const).map((k) => {
    const m = SM(k) as THREE.MeshStandardMaterial;
    return { m, color: m.color.clone(), rough: m.roughness };
  });
  let lastWet = -1;

  return {
    root,
    update(fovDeg = 60) {
      // the camera sits at the render origin: its pad-local position undoes the root's transform
      _cam.copy(root.position).negate().applyQuaternion(_qi.copy(root.quaternion).invert());
      const zoom = Math.min(2, Math.max(0.02, Math.tan((fovDeg * Math.PI) / 360) / TAN30));
      for (const l of lods) l.o.visible = l.box.distanceToPoint(_cam) * zoom < l.max && _cam.y - l.box.max.y < l.maxH;
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
