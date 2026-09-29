/**
 * Launch-site layout (pad-local metres: x east, y up, z south, origin at ground level under the
 * vehicle axis at the pad). Shared by the environment model, the trajectory model (initial
 * position, landing zone) and the ground cameras, so they agree.
 */
export const PAD = {
  /** Launch mount deck top above ground (the vehicle's aft skirt rests on the hold-downs here). */
  deckHeight: 9.0,
  /** Height of the first-stage nozzle exit plane above ground while on the mount. */
  nozzleExitHeight: 7.7,
  /** Service tower centre offset from the vehicle axis (m, pad-local x/z). */
  tower: { x: -14.5, z: 0, height: 92 },
  /** Flame trench runs from under the mount toward the north-east (unit direction, pad-local). */
  trenchDir: { x: 0.35, z: -0.94 },
  /** Distance from the pad to the shoreline (the ocean lies to the east). */
  shorelineEast: 900,
};

/** Return-to-launch-site landing zone (pad-local, on the coast south of the pad). */
export const LANDING_ZONE = { x: -600, z: 8600, radius: 45 };

/** Named ground camera sites (pad-local x east, y up, z south). */
export const GROUND_CAMS = {
  padWide: { x: -260, y: 18, z: 330 },
  padClose: { x: -48, y: 4, z: 58 },
  towerTop: { x: -16, y: 82, z: -14 },
  tracking: { x: -5200, y: 45, z: 3600 },
  landing: { x: -1020, y: 12, z: 8980 },
};
