/**
 * Layout decisions of the K-1 model that are not in spec.ts: azimuths of external hardware,
 * the cutaway wedge, exploded-view offsets. Azimuth phi is measured from +Z (south on the pad,
 * the livery side) toward +X (east); -X faces the service tower.
 */
import { S1_ENGINE_LAYOUT } from '../../vehicle/spec';

export const DEG = Math.PI / 180;

export const AZ = {
  /** Landing legs and grid fins on the diagonals (clear of the livery at +Z and the raceway at -X). */
  legs: [45, 135, 225, 315].map((d) => d * DEG),
  fins: [45, 135, 225, 315].map((d) => d * DEG),
  /** Booster cold-gas RCS pods (+X and -X). */
  rcs: [90, 270].map((d) => d * DEG),
  /** External raceway (cable and pressurant conduit), tower side. */
  raceway: 270 * DEG,
  /** Hold-down fittings on the aft skirt (between the legs). */
  holdDowns: [0, 90, 180, 270].map((d) => d * DEG),
  /** LOX vent ports (booster forward skirt and upper-stage forward skirt), toward the pad cameras. */
  vent: -68 * DEG,
  /** Upper-stage settling / attitude thruster pods. */
  s2Rcs: [90, 270].map((d) => d * DEG),
  /** Stage separation pushers. */
  pushers: [0, 90, 180, 270].map((d) => d * DEG),
  collets: 12,
  /** Helium bottles in the booster LOX tank (on the far wall seen through the cutaway). */
  copvs: [200, 250, 300].map((d) => d * DEG),
  s2Copvs: [165, 225, 285].map((d) => d * DEG),
};

/** Cutaway wedge: removed between these azimuths at full opening (on the +Z/+X side, 100 deg). */
export const WEDGE = { from: 20 * DEG, to: 120 * DEG };

/**
 * Engine positions (math angle a from +X toward +Z) and the mount yaw about the vehicle axis:
 * outer engines turn their turbopump outboard, between the thrust beams; the centre engine
 * turns it so both feed inlets fall between two beams.
 */
export const ENGINES = S1_ENGINE_LAYOUT.map((e) => {
  const a = Math.atan2(e.z, e.x);
  return { ...e, a, yaw: e.centre ? -16 * DEG : -a };
});

/** Exploded-view offsets (m, model frame) at full explosion. */
export const EXPLODE: Record<string, [number, number, number]> = {
  engines: [0, -2.4, 0],
  heatshield: [0, -1.0, 0],
  thrust: [0, 0, 0],
  rp1: [0, 2.6, 0],
  intertank: [0, 5.0, 0],
  lox: [0, 7.4, 0],
  fwdskirt: [0, 9.8, 0],
  interstage: [0, 12.2, 0],
  capAdapter: [0, 12.2, 0],
  s2engine: [0, 18.6, 0],
  s2aft: [0, 20.8, 0],
  s2tanks: [0, 23.0, 0],
  s2fwd: [0, 25.2, 0],
  adapter: [0, 27.2, 0],
  payload: [0, 29.4, 0],
  fairingA: [0, 29.4, 4.2],
  fairingB: [0, 29.4, -4.2],
  suborbitalPayload: [0, 14.4, 0],
};
