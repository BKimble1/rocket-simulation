/**
 * Layout of the illustrative launch complex (pad-local metres: x east, y up, z south; origin
 * on the hardstand top under the vehicle axis). Built to the shared constants in
 * src/world/site.ts (PAD, LANDING_ZONE, GROUND_CAMS). Every builder reads positions from here
 * so the structures, the ground treatment, the vegetation scatter and the effects anchors agree.
 */
import { PAD, LANDING_ZONE } from '../../world/site';

/** Natural grade around the complex (the hardstand stands 5 m above it). */
export const GRADE = -5;
/** Top of the landing-zone slab (h above the sphere: the slab surface is at altitude 0). */
export const LZ_TOP_H = 0;

// ───────────────────────────── trench frame ─────────────────────────────

const tl = Math.hypot(PAD.trenchDir.x, PAD.trenchDir.z);
/** Unit vector along the flame trench (toward its exit). */
export const TU = { x: PAD.trenchDir.x / tl, z: PAD.trenchDir.z / tl };
/** Unit vector across the trench (TU rotated -90 deg about +y). */
export const TV = { x: -TU.z, z: TU.x };
/** Pad-local x, z of a point at (along, across) in the trench frame. */
export const trenchXZ = (s: number, v: number) => ({ x: TU.x * s + TV.x * v, z: TU.z * s + TV.z * v });
/** Trench frame coordinates of pad-local (x, z). */
export const toTrench = (x: number, z: number) => ({ s: x * TU.x + z * TU.z, v: x * TV.x + z * TV.z });

export const TRENCH = {
  /** Half width of the flame trench (m). */
  halfWidth: 5.5,
  /** Back wall (behind the vehicle axis) and the mouth (along TU). */
  sBack: -8,
  sMouth: 66,
  /** Floor: deepest at the deflector toe, rising to the natural grade at the mouth. */
  floorToe: -9,
  sToe: 7,
  floorMouth: GRADE + 0.1,
};

/** Floor height of the trench at distance s along it. */
export function trenchFloor(s: number): number {
  if (s <= TRENCH.sToe) return TRENCH.floorToe;
  const t = Math.min(1, (s - TRENCH.sToe) / (TRENCH.sMouth - 4 - TRENCH.sToe));
  return TRENCH.floorToe + (TRENCH.floorMouth - TRENCH.floorToe) * t;
}

/** Flame deflector profile (along s, height y): a steel-faced curve turning the plume down the trench. */
export const DEFLECTOR: [number, number][] = [
  [-8.0, -0.05],
  [-6.6, -1.2],
  [-5.2, -2.5],
  [-3.8, -3.8],
  [-2.3, -5.0],
  [-0.7, -6.1],
  [1.0, -7.1],
  [2.9, -7.9],
  [4.9, -8.55],
  [7.0, -9.0],
];

// ───────────────────────────── hardstand ─────────────────────────────

/** Hardstand top outline (y = 0), counter-clockwise seen from above (x east, z south). */
export const HARDSTAND: [number, number][] = [
  [-40, -52],
  [38, -52],
  [50, -40],
  [50, 44],
  [38, 56],
  [-40, 56],
  [-52, 44],
  [-52, -40],
];
/** Embankment: 1 in 2 slopes from the top edge down to the grade. */
export const EMBANK = { run: 11, drop: 5.5 };
/** Transporter ramp up the south side (centre x, half width, length of the slope). */
export const RAMP = { x: -2, halfWidth: 8, z0: 56, length: 84 };

function pointInPoly(poly: [number, number][], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function distToPolyEdge(poly: [number, number][], x: number, z: number): number {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j];
    const [bx, bz] = poly[i];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

/** Inside the hardstand's top outline (the ground below it is hidden). */
export function underHardstand(x: number, z: number): boolean {
  if (Math.abs(x) > 60 || Math.abs(z) > 60) return false;
  return pointInPoly(HARDSTAND, x, z);
}

/**
 * Natural-ground height override around the pad (m, pad frame), or null: the ground is pushed
 * well below the hardstand top, just below the flame-trench floor inside the trench walls (only
 * half a metre at the mouth, so no groove shows along the walls where the trench reaches the
 * grade) and 15 cm below the transporter ramp near its foot (no coplanar surfaces). The
 * embankment covers the grade by itself (its 1:2 slope crosses it cleanly at the toe).
 */
export function padPitH(x: number, z: number): number | null {
  if (Math.abs(x) > 70 || Math.abs(z) > 150) return null;
  if (pointInPoly(HARDSTAND, x, z)) return -12;
  const t = toTrench(x, z);
  if (Math.abs(t.v) < TRENCH.halfWidth - 0.02 && t.s > TRENCH.sBack && t.s < TRENCH.sMouth) return trenchFloor(t.s) - 0.6;
  if (Math.abs(x - RAMP.x) < RAMP.halfWidth && z > RAMP.z0 && z < RAMP.z0 + RAMP.length) {
    const rampY = (GRADE * (z - RAMP.z0)) / RAMP.length;
    return Math.min(GRADE, rampY - 0.15);
  }
  return null;
}

// ───────────────────────────── launch mount ─────────────────────────────

export const MOUNT = {
  /** Deck extents in the trench frame (half sizes) and its thickness below PAD.deckHeight. */
  halfS: 5.5,
  halfV: 7.5,
  thickness: 1.6,
  /** Central flame hole radius at the deck top (it flares below). */
  holeR: 2.6,
  /** Leg columns at (s, v) = (+-legS, +-legV). */
  legS: 3.6,
  legV: 6.7,
  legSize: 1.6,
  /** Hold-down clamp azimuths (deg, from +x toward +z): at the vehicle's fittings (+X, +Z, -X, -Z). */
  clampAz: [0, 90, 180, 270],
  gripR: 1.85,
};

// ───────────────────────────── service tower ─────────────────────────────

export const TOWER = {
  x: PAD.tower.x,
  z: PAD.tower.z,
  half: 4,
  height: PAD.tower.height,
  level: 6,
  mastTop: 114,
};

// ───────────────────────────── facilities ─────────────────────────────

export const WATER_TOWER = { x: -120, z: -150, top: 90, tankR: 6.6 };
export const LOX_SPHERE = { x: 175, z: -20, r: 7.8, legs: 8 };
export const RP1_TANKS = { x: 160, z: 92, r: 2.1, length: 19, count: 3, spacing: 7.2 };
export const GAS_TUBES = { x: 112, z: 148 };
export const LIGHTNING_MASTS: { x: number; z: number; h: number }[] = [65, 155, 245, 335].map((az, i) => {
  const a = (az * Math.PI) / 180;
  const r = 160;
  return { x: Math.round(Math.sin(a) * r), z: Math.round(-Math.cos(a) * r), h: 122 + (i % 2) * 4 };
});
export const LIGHT_POLES: [number, number][] = [
  [-78, 62],
  [72, 64],
  [76, -70],
  [-80, -68],
];
export const BUILDINGS = {
  padOps: { x: -150, z: 110, w: 30, d: 14, h: 8.5 },
  pneumatics: { x: -112, z: -78, w: 16, d: 10, h: 6.2 },
  substation: { x: -240, z: 150, w: 26, d: 18 },
  gate: { x: -420, z: 262 },
};
export const BUNKER = { x: -330, z: -150, r: 14, h: 7.5 };
export const HANGAR = { x: -10, z: 332, w: 112, d: 62, h: 31, doorW: 70, doorH: 24 };

/** Site roads (pad-local polylines, paved width). */
export const SITE_ROADS: { w: number; pts: [number, number][]; kind?: 'asphalt' | 'concrete' }[] = [
  // access road from the Cape road through the gate
  { w: 9, pts: [[-1395, 250], [-900, 252], [-600, 254], [-420, 256], [-250, 256], [-120, 262], [-75, 268]] },
  // transporter road from the hangar doors to the ramp (concrete)
  { w: 14, kind: 'concrete', pts: [[-2, 300], [-2, 220], [-2, RAMP.z0 + RAMP.length]] },
  // service loop around the pad
  { w: 7, pts: [[-120, 262], [-150, 200], [-200, 110], [-210, 0], [-190, -110], [-120, -205], [0, -240], [120, -200], [210, -110], [240, 0], [225, 110], [170, 190], [90, 230], [-2, 240]] },
  // spur to the ops building and substation
  { w: 7, pts: [[-200, 110], [-167, 110]] },
  { w: 6, pts: [[-178, 150], [-226, 150]] },
  // spur to the water tower and pneumatics building
  { w: 6, pts: [[-172, -130], [-134, -146]] },
  { w: 6, pts: [[-196, -80], [-122, -80]] },
  // spur to the tank farm
  { w: 7, pts: [[236, -20], [192, -20]] },
  { w: 7, pts: [[231, 80], [186, 86]] },
  // road to the blockhouse
  { w: 6, pts: [[-209, -40], [-280, -90], [-316, -135]] },
  // landing-zone road from the Cape road
  { w: 8, pts: [[-2300, 8600], [-1800, 8610], [-1300, 8615], [-900, 8612], [-690, 8606]] },
];

/** Perimeter fence (closed polygon) with a gate gap on the access road. */
export const FENCE: [number, number][] = [
  [-440, -300],
  [300, -330],
  [330, -250],
  [330, 420],
  [260, 440],
  [-440, 440],
];

export const LZ = { x: LANDING_ZONE.x, z: LANDING_ZONE.z, r: LANDING_ZONE.radius, apron: 95 };
