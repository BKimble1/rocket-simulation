/**
 * The launch site's public state and anchor points.
 *
 * `siteState` is written each frame by the flight integration from the mission channels
 * (pad.holddown, pad.arms, pad.deluge) and the payload configuration; the site reads it in
 * its render loop (no React state). `SITE_ANCHORS` are fixed points in pad-local metres
 * (x east, y up, z south, origin on the hardstand top under the vehicle axis) for the effects
 * module and the cameras: convert with sitePosition(t) / siteFrameQuaternion(t).
 */
import * as THREE from 'three';
import { PAD, LANDING_ZONE } from '../../world/site';
import { MOUNT, TRENCH, TU, TV, trenchXZ, trenchFloor, LOX_SPHERE, WATER_TOWER, TOWER, LZ_TOP_H, DEFLECTOR } from './layout';
import { sphereY } from './map';

export type SiteConfig = 'satellite' | 'capsule';

export const siteState = {
  /** 0 clamped .. 1 released (clamps swung clear). */
  holddown: 0,
  /** 0 attached .. 1 retracted (umbilical and access arms swing ~70 deg away). */
  arms: 0,
  /** 0 .. 1 sound-suppression water flow (the site shows the valves/state; the spray is the effects module's). */
  deluge: 0,
  /** Which arm the tower offers at the payload: fairing conditioning arm or crew access arm. */
  config: 'satellite' as SiteConfig,
};

export interface Nozzle {
  pos: THREE.Vector3;
  /** Spray direction (unit). */
  dir: THREE.Vector3;
  /** Relative flow (the rainbirds carry most of the water). */
  flow: number;
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function delugeNozzles(): Nozzle[] {
  const out: Nozzle[] = [];
  const deckY = PAD.deckHeight;
  // ring of spray heads under the deck around the flame hole, aimed at the plume below the nozzles
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + Math.PI / 16;
    const r = MOUNT.holeR + 0.55;
    const p = v(Math.cos(a) * r, deckY - MOUNT.thickness - 0.15, Math.sin(a) * r);
    const target = v(0, PAD.nozzleExitHeight - 3.5, 0);
    out.push({ pos: p, dir: target.sub(p).normalize(), flow: 0.4 });
  }
  // four rainbird cannons on the deck corners, firing across the deck toward the base of the vehicle
  for (const [sgn, sgv] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]) {
    const q = trenchXZ(sgn * (MOUNT.halfS - 0.7), sgv * (MOUNT.halfV - 0.7));
    const p = v(q.x, deckY + 1.6, q.z);
    const target = v(0, deckY + 0.6, 0);
    out.push({ pos: p, dir: target.sub(p).normalize(), flow: 3.0 });
  }
  // deflector face and trench wall nozzles
  for (let i = 0; i < 6; i++) {
    const s = -5 + i * 2.6;
    for (const side of [-1, 1]) {
      const q = trenchXZ(s, side * (TRENCH.halfWidth - 0.15));
      const y = Math.max(trenchFloor(s) + 2.0, -3.2);
      const p = v(q.x, y, q.z);
      const d = v(-TV.x * side, -0.35, -TV.z * side).normalize();
      out.push({ pos: p, dir: d, flow: 0.6 });
    }
  }
  return out;
}

const mouth = trenchXZ(TRENCH.sMouth - 4, 0);
const impact = trenchXZ(-1.2, 0);
const lzY = sphereY(LANDING_ZONE.x, LANDING_ZONE.z, LZ_TOP_H);

export const SITE_ANCHORS = {
  /** Sound-suppression spray heads (under-deck ring, deck rainbirds, trench walls). */
  delugeNozzles: delugeNozzles(),
  /** Centre of the flame-trench mouth (where the ground cloud leaves the trench) and its direction. */
  trenchExit: v(mouth.x, trenchFloor(TRENCH.sMouth - 4) + 2.8, mouth.z),
  trenchDir: v(TU.x, 0, TU.z),
  /** Where the plume axis meets the deflector face, and the face normal there. */
  deflectorImpact: v(impact.x, DEFLECTOR[5][1] + 0.5, impact.z),
  deflectorNormal: v(TU.x * 0.55, 0.83, TU.z * 0.55).normalize(),
  /** Launch mount deck top centre and flame-hole radius. */
  mountDeck: v(0, PAD.deckHeight, 0),
  flameHoleRadius: MOUNT.holeR,
  /** Ground LOX storage vent stacks (continuous boil-off) and the tower's vehicle vent hood. */
  loxVents: [v(LOX_SPHERE.x + 3.2, LOX_SPHERE.r * 2 + 5.6 + 4.8, LOX_SPHERE.z - 3.2), v(LOX_SPHERE.x - 11.5, 9.5, LOX_SPHERE.z + 6)],
  /** Sound-suppression water tower tank centre. */
  waterTower: v(WATER_TOWER.x, WATER_TOWER.top - WATER_TOWER.tankR, WATER_TOWER.z),
  /** Service tower top (lightning mast tip). */
  towerTop: v(TOWER.x, TOWER.mastTop, TOWER.z),
  /** Landing-zone target centre on the slab surface (y includes the Earth's curvature: -5.8 m). */
  lzCentre: v(LANDING_ZONE.x, lzY, LANDING_ZONE.z),
  lzRadius: LANDING_ZONE.radius,
};
