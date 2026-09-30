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
  // ignition and liftoff: south-south-east, ~220 m out and a little above the hardstand, so the
  // whole vehicle stands on its mount with the tower behind it; the flame trench runs away from
  // this camera (north-north-east), so the ground cloud rolls out behind the pad, not over the lens
  ignition: { x: 60, y: 6, z: 210 },
  // tower clearance: south-east, 410 m out; the tower stands beside the vehicle (to its left) as
  // it climbs past the top, and the line of sight clears the integration hangar and the tanks
  towerSide: { x: 160, y: 20, z: 380 },
  towerTop: { x: -16, y: 82, z: -14 },
  // on scrubland about 5 km south-south-west of the pad (1.3 km from the nearest water in the
  // coastline map): a side-on view of the eastward climb
  tracking: { x: -1300, y: 45, z: 4830 },
  landing: { x: -1020, y: 12, z: 8980 },
};

/**
 * The detailed local terrain covers a disk around the pad; the globe does not draw inside
 * `innerKm` and the local terrain fades out between innerKm and outerKm, sampling the same
 * Earth imagery at its edge so the two meet without a seam.
 */
export const LOCAL_TERRAIN = { innerKm: 42, outerKm: 50 };
