/**
 * US Standard Atmosphere 1976.
 *
 * 0 to 86 km: the seven standard layers (constant lapse rates in geopotential altitude,
 * hydrostatic pressure), exact to the published tables. Above 86 km the gas is no longer mixed
 * and the standard gives tabulated values: density and pressure are interpolated exponentially
 * (log-linear) between the 1976 table points up to 1000 km, and the kinetic temperature
 * linearly. Beyond 1000 km the model returns vacuum. The speed of sound above 86 km is only a
 * nominal number (the flow there is free-molecular; Mach has no aerodynamic meaning).
 *
 * Used by the trajectory model, and exported for the interface and the effects (plume
 * expansion follows ambient pressure).
 */

export interface AtmosphereSample {
  /** Geometric altitude used (m). */
  altitude: number;
  /** Kinetic temperature (K). */
  temperature: number;
  /** Static pressure (Pa). */
  pressure: number;
  /** Density (kg/m^3). */
  density: number;
  /** Speed of sound (m/s). */
  speedOfSound: number;
}

/** Earth radius used by US76 to convert geometric to geopotential altitude (m). */
const R0 = 6_356_766;
const G0 = 9.80665;
/** Specific gas constant of sea-level air (J/(kg K)). */
export const R_AIR = 287.05287;
const GAMMA = 1.4;

/** Layer bases (geopotential m), base temperature (K), lapse rate (K/m), base pressure (Pa). */
const LAYERS: [number, number, number, number][] = [
  [0, 288.15, -0.0065, 101325],
  [11000, 216.65, 0, 22632.06],
  [20000, 216.65, 0.001, 5474.889],
  [32000, 228.65, 0.0028, 868.0187],
  [47000, 270.65, 0, 110.9063],
  [51000, 270.65, -0.0028, 66.93887],
  [71000, 214.65, -0.002, 3.956420],
];
/** Top of the layered model: 84,852 m geopotential = 86,000 m geometric. */
const H_TOP = 84852;

/**
 * US76 upper-atmosphere table (geometric km, kinetic temperature K, pressure Pa, density
 * kg/m^3), 86-1000 km.
 */
const UPPER: [number, number, number, number][] = [
  [86, 186.87, 3.7338e-1, 6.958e-6],
  [90, 186.87, 1.8359e-1, 3.416e-6],
  [95, 188.42, 7.5966e-2, 1.393e-6],
  [100, 195.08, 3.2011e-2, 5.604e-7],
  [105, 208.84, 1.4521e-2, 2.325e-7],
  [110, 240.0, 7.1042e-3, 9.708e-8],
  [115, 300.0, 4.0096e-3, 4.289e-8],
  [120, 360.0, 2.5382e-3, 2.222e-8],
  [130, 469.27, 1.2505e-3, 8.152e-9],
  [140, 559.63, 7.2028e-4, 3.831e-9],
  [150, 634.39, 4.5422e-4, 2.076e-9],
  [160, 696.29, 3.0395e-4, 1.233e-9],
  [180, 790.07, 1.5271e-4, 5.194e-10],
  [200, 854.56, 8.4736e-5, 2.541e-10],
  [250, 941.33, 2.4767e-5, 6.073e-11],
  [300, 976.01, 8.7704e-6, 1.916e-11],
  [350, 990.06, 3.4498e-6, 7.014e-12],
  [400, 995.83, 1.4518e-6, 2.803e-12],
  [450, 998.22, 6.4468e-7, 1.184e-12],
  [500, 999.24, 3.0236e-7, 5.215e-13],
  [600, 999.85, 8.2130e-8, 1.137e-13],
  [700, 999.97, 3.1908e-8, 3.070e-14],
  [800, 999.99, 1.7036e-8, 1.136e-14],
  [900, 1000.0, 1.0873e-8, 5.759e-15],
  [1000, 1000.0, 7.5138e-9, 3.561e-15],
];

/** Geopotential altitude (m) from geometric altitude (m). */
export const geopotential = (h: number): number => (R0 * h) / (R0 + h);

/** Fill `out` with the atmosphere at geometric altitude h (m). Below 0 m, the sea-level layer continues. */
export function atmosphereInto(h: number, out: AtmosphereSample): AtmosphereSample {
  out.altitude = h;
  if (h < 86000) {
    const H = geopotential(Math.max(h, -5000));
    let i = LAYERS.length - 1;
    while (i > 0 && H < LAYERS[i][0]) i--;
    const [Hb, Tb, L, Pb] = LAYERS[i];
    const dH = Math.min(H, H_TOP) - Hb;
    let T: number;
    let P: number;
    if (L === 0) {
      T = Tb;
      P = Pb * Math.exp((-G0 * dH) / (R_AIR * Tb));
    } else {
      T = Tb + L * dH;
      P = Pb * Math.pow(Tb / T, G0 / (R_AIR * L));
    }
    out.temperature = T;
    out.pressure = P;
    out.density = P / (R_AIR * T);
    out.speedOfSound = Math.sqrt(GAMMA * R_AIR * T);
    return out;
  }
  if (h >= 1_000_000) {
    out.temperature = 1000;
    out.pressure = 0;
    out.density = 0;
    out.speedOfSound = Math.sqrt(GAMMA * R_AIR * 1000);
    return out;
  }
  const km = h / 1000;
  let i = 0;
  while (i < UPPER.length - 2 && km >= UPPER[i + 1][0]) i++;
  const a = UPPER[i];
  const b = UPPER[i + 1];
  const u = (km - a[0]) / (b[0] - a[0]);
  out.temperature = a[1] + (b[1] - a[1]) * u;
  out.pressure = Math.exp(Math.log(a[2]) + (Math.log(b[2]) - Math.log(a[2])) * u);
  out.density = Math.exp(Math.log(a[3]) + (Math.log(b[3]) - Math.log(a[3])) * u);
  out.speedOfSound = Math.sqrt(GAMMA * R_AIR * out.temperature);
  return out;
}

/** The atmosphere at geometric altitude h (m) (allocates; use atmosphereInto in loops). */
export function atmosphere(h: number): AtmosphereSample {
  return atmosphereInto(h, { altitude: 0, temperature: 0, pressure: 0, density: 0, speedOfSound: 0 });
}

/** Density only (fast path for the integrators). */
const _s: AtmosphereSample = { altitude: 0, temperature: 0, pressure: 0, density: 0, speedOfSound: 0 };
export function airDensity(h: number): number {
  return atmosphereInto(h, _s).density;
}

/** Sea-level standard values. */
export const SEA_LEVEL = { pressure: 101325, density: 1.225, temperature: 288.15, speedOfSound: 340.294 };
