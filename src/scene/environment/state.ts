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
import { MOUNT, TRENCH, TU, TV, trenchXZ, trenchFloor, LOX_SPHERE, WATER_TOWER, TOWER, LZ_TOP_H, DELUGE, deflectorY } from './layout';
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
  const D = DELUGE;
  const deckTop = PAD.deckHeight;
  const deckBot = deckTop - MOUNT.thickness;
  // ring of spray heads under the deck around the flame hole (the nozzle tips of pad.ts's ring),
  // aimed at the plume below the engine nozzles
  for (let i = 0; i < D.ringCount; i++) {
    const a = (i / D.ringCount) * Math.PI * 2 + Math.PI / D.ringCount;
    const q = trenchXZ(Math.cos(a) * (D.ringR - D.tipIn), Math.sin(a) * (D.ringR - D.tipIn));
    const p = v(q.x, deckBot - D.tipDrop, q.z);
    const target = v(0, PAD.nozzleExitHeight - 3.5, 0);
    out.push({ pos: p, dir: target.sub(p).normalize(), flow: 0.4 });
  }
  // four rainbird cannons on the deck corners, firing across the deck toward the base of the
  // vehicle: the muzzle of each barrel, along the barrel
  for (const [sgn, sgv] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]) {
    const x = sgn * (MOUNT.halfS - D.rbInset);
    const z = sgv * (MOUNT.halfV - D.rbInset);
    const dl = v(-x, -D.rbDroop, -z).normalize();
    const m = v(x, deckTop + D.rbY, z).addScaledVector(dl, D.rbLen);
    const q = trenchXZ(m.x, m.z);
    const dq = trenchXZ(dl.x, dl.z);
    out.push({ pos: v(q.x, m.y, q.z), dir: v(dq.x, dl.y, dq.z).normalize(), flow: 3.0 });
  }
  // trench wall headers (above the deflector face), spraying across the trench and down
  const dl = Math.hypot(1, D.wallDip);
  for (const s of D.wallS) {
    for (const side of [-1, 1]) {
      const across = side * (TRENCH.halfWidth - D.wallOff - D.wallStub / dl);
      const q = trenchXZ(s, across);
      const p = v(q.x, D.wallY - (D.wallStub * D.wallDip) / dl, q.z);
      const d = v(-TV.x * side, -D.wallDip, -TV.z * side).normalize();
      out.push({ pos: p, dir: d, flow: 0.6 });
    }
  }
  return out;
}

const mouth = trenchXZ(TRENCH.sMouth - 4, 0);
// the plume axis is the vehicle axis (x = z = 0): it meets the deflector face at s = 0
const impactY = deflectorY(0);
const faceSlope = (deflectorY(0.5) - deflectorY(-0.5)) / 1.0;
const lzY = sphereY(LANDING_ZONE.x, LANDING_ZONE.z, LZ_TOP_H);

export const SITE_ANCHORS = {
  /** Sound-suppression spray heads (under-deck ring, deck rainbirds, trench walls). */
  delugeNozzles: delugeNozzles(),
  /** Centre of the flame-trench mouth (where the ground cloud leaves the trench) and its direction. */
  trenchExit: v(mouth.x, trenchFloor(TRENCH.sMouth - 4) + 2.8, mouth.z),
  trenchDir: v(TU.x, 0, TU.z),
  /** Where the plume axis meets the deflector face, and the face normal there. */
  deflectorImpact: v(0, impactY, 0),
  deflectorNormal: v(-TU.x * faceSlope, 1, -TU.z * faceSlope).normalize(),
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
