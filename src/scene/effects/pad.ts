/**
 * Pad-local points the ground effects come from (x east, y up, z south; origin at ground level
 * on the vehicle axis). Derived from PAD in src/world/site.ts and the K-1 stations, because the
 * effects source reports only the pad state (venting, deluge), not where the hardware is.
 */
import { PAD } from '../../world/site';
import { BODY_RADIUS, STATIONS } from '../../vehicle/spec';

const H = PAD.nozzleExitHeight;
const tl = Math.hypot(PAD.trenchDir.x, PAD.trenchDir.z);

/** Unit direction of the flame trench (pad-local, horizontal). */
export const TRENCH_DIR = { x: PAD.trenchDir.x / tl, z: PAD.trenchDir.z / tl };

/** Where the flame trench opens to the air (brief: about 60 m along the trench). */
export const TRENCH_EXIT = { x: TRENCH_DIR.x * 60, y: 1.5, z: TRENCH_DIR.z * 60 };

/** Flame hole under the vehicle in the launch mount (top of the opening). */
export const MOUNT_HOLE = { x: 0, y: PAD.deckHeight - 0.5, z: 0, radius: 5.5 };

export interface PadJet {
  pos: [number, number, number];
  /** Outward direction (unit, pad-local) and nominal speed (m/s). */
  dir: [number, number, number];
  speed: number;
}

const norm = (x: number, y: number, z: number): [number, number, number] => {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
};

/**
 * LOX boil-off vents on the vehicle skin (first-stage LOX tank forward dome, upper-stage LOX
 * tank), facing away from the service tower (which stands on the -X side).
 */
export const VENTS: PadJet[] = [
  { pos: [BODY_RADIUS + 0.05, H + STATIONS.s1LoxFwdEquator + 0.3, 0.35], dir: norm(1, 0.05, 0.25), speed: 3.2 },
  { pos: [BODY_RADIUS * 0.7, H + STATIONS.s1LoxFwdEquator + 0.1, -BODY_RADIUS * 0.72], dir: norm(0.6, 0.05, -0.8), speed: 2.6 },
  { pos: [BODY_RADIUS + 0.05, H + STATIONS.s2LoxFwdEquator - 0.4, -0.3], dir: norm(1, 0.1, -0.15), speed: 2.8 },
];

/**
 * Sound-suppression water: four water cannons around the mount deck throwing arcs across it,
 * and a ring of nozzles around the flame hole spraying into the exhaust.
 */
export const DELUGE: PadJet[] = [
  ...[0, 1, 2, 3].map((i): PadJet => {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const r = 21;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    return { pos: [x, 2.6, z], dir: norm(-x / r, 0.72, -z / r), speed: 16.5 };
  }),
  ...Array.from({ length: 8 }, (_, i): PadJet => {
    const a = (i * Math.PI) / 4 + Math.PI / 8;
    const r = MOUNT_HOLE.radius + 1.2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    return { pos: [x, PAD.deckHeight + 0.4, z], dir: norm(-x / r, -0.55, -z / r), speed: 9 };
  }),
];
