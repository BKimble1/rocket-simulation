/**
 * Pad-local points the ground effects come from (x east, y up, z south; origin at ground level
 * on the vehicle axis). The flame trench, the deluge spray heads and the ground LOX vents come
 * from the launch site's published anchors (SITE_ANCHORS), so the cloud leaves the trench the
 * site actually draws; the vehicle's own LOX vents from the K-1 stations.
 */
import { PAD } from '../../world/site';
import { BODY_RADIUS, STATIONS } from '../../vehicle/spec';
import { SITE_ANCHORS } from '../environment/state';

const H = PAD.nozzleExitHeight;
const A = SITE_ANCHORS;
const tl = Math.hypot(A.trenchDir.x, A.trenchDir.z) || 1;

/** Unit direction of the flame trench (pad-local, horizontal), from the mount toward the mouth. */
export const TRENCH_DIR = { x: A.trenchDir.x / tl, z: A.trenchDir.z / tl };

/** Centre of the trench mouth, where the exhaust, steam and smoke leave the trench. */
export const TRENCH_EXIT = { x: A.trenchExit.x, y: A.trenchExit.y, z: A.trenchExit.z };

/** Flame hole in the launch mount deck (deck top height and hole radius). */
export const MOUNT_HOLE = { x: 0, y: A.mountDeck.y, z: 0, radius: A.flameHoleRadius };

export interface PadJet {
  pos: [number, number, number];
  /** Outward direction (unit, pad-local) and nominal speed (m/s). */
  dir: [number, number, number];
  speed: number;
  /** Share of the spawns (relative water or gas flow). */
  weight: number;
  /** Water cannon (long arcs) rather than a spray head. */
  cannon?: boolean;
}

const norm = (x: number, y: number, z: number): [number, number, number] => {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
};

/**
 * LOX boil-off: vents on the vehicle skin (first-stage LOX tank forward dome, upper-stage LOX
 * tank) facing away from the service tower (which stands on the -X side).
 */
export const VENTS: PadJet[] = [
  { pos: [BODY_RADIUS + 0.05, H + STATIONS.s1LoxFwdEquator + 0.3, 0.35], dir: norm(1, 0.05, 0.25), speed: 3.2, weight: 1 },
  { pos: [BODY_RADIUS * 0.7, H + STATIONS.s1LoxFwdEquator + 0.1, -BODY_RADIUS * 0.72], dir: norm(0.6, 0.05, -0.8), speed: 2.6, weight: 1 },
  { pos: [BODY_RADIUS + 0.05, H + STATIONS.s2LoxFwdEquator - 0.4, -0.3], dir: norm(1, 0.1, -0.15), speed: 2.8, weight: 1 },
];

/** Ground LOX storage vent stacks: a slow, continuous boil-off plume. */
export const GROUND_VENTS: PadJet[] = A.loxVents.map((p) => ({ pos: [p.x, p.y, p.z] as [number, number, number], dir: norm(0, 1, 0), speed: 1.6, weight: 1 }));

/**
 * Sound-suppression water from the site's spray heads that are above ground: the rainbird
 * cannons on the deck corners (most of the water, long arcs) and the ring of heads under the
 * deck aimed into the plume. The heads inside the trench are out of sight.
 */
export const DELUGE: PadJet[] = A.delugeNozzles
  .filter((n) => n.pos.y > 0.5)
  .map((n) => {
    const cannon = n.flow >= 1;
    return {
      pos: [n.pos.x, n.pos.y, n.pos.z] as [number, number, number],
      // cannons loft their water: aim a little above the line to the target
      dir: cannon ? norm(n.dir.x, n.dir.y + 0.45, n.dir.z) : norm(n.dir.x, n.dir.y, n.dir.z),
      speed: cannon ? 15 : 9,
      weight: n.flow,
      cannon,
    };
  });

/** Pick a jet by weight with a uniform random number in [0, 1). */
export function pickJet(list: PadJet[], u: number): PadJet {
  let total = 0;
  for (const j of list) total += j.weight;
  let x = u * total;
  for (const j of list) {
    x -= j.weight;
    if (x < 0) return j;
  }
  return list[list.length - 1];
}
