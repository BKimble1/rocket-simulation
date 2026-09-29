/**
 * Compact US Standard Atmosphere 1976 (geopotential layers to 86 km, exponential above) for
 * the picture and the telemetry. The trajectory model has its own copy; they agree.
 */
const LAYERS: [number, number, number][] = [
  // base geopotential altitude (m), base temperature (K), lapse rate (K/m)
  [0, 288.15, -0.0065],
  [11000, 216.65, 0],
  [20000, 216.65, 0.001],
  [32000, 228.65, 0.0028],
  [47000, 270.65, 0],
  [51000, 270.65, -0.0028],
  [71000, 214.65, -0.002],
  [84852, 186.946, 0],
];
const G0 = 9.80665;
const R = 287.053;
const RE = 6356766;

const P_BASE: number[] = (() => {
  const p = [101325];
  for (let i = 0; i < LAYERS.length - 1; i++) {
    const [h0, T0, L] = LAYERS[i];
    const h1 = LAYERS[i + 1][0];
    p.push(L === 0 ? p[i] * Math.exp((-G0 * (h1 - h0)) / (R * T0)) : p[i] * Math.pow((T0 + L * (h1 - h0)) / T0, -G0 / (R * L)));
  }
  return p;
})();

export interface AtmoState {
  pressure: number;
  density: number;
  temperature: number;
  soundSpeed: number;
}

export function atmosphere(zGeometric: number, out: AtmoState = { pressure: 0, density: 0, temperature: 0, soundSpeed: 0 }): AtmoState {
  const z = Math.max(0, zGeometric);
  const h = (RE * z) / (RE + z);
  if (h > 86000) {
    // exponential tail above 86 km (scale height ~6 km, fitted to the 86 km value)
    const T = 186.9;
    const p86 = 0.3734;
    const pressure = p86 * Math.exp(-(z - 86000) / 5800);
    out.pressure = pressure;
    out.temperature = T;
    out.density = pressure / (R * T);
    out.soundSpeed = Math.sqrt(1.4 * R * T);
    return out;
  }
  let i = LAYERS.length - 1;
  while (i > 0 && h < LAYERS[i][0]) i--;
  const [h0, T0, L] = LAYERS[i];
  const T = T0 + L * (h - h0);
  const p = L === 0 ? P_BASE[i] * Math.exp((-G0 * (h - h0)) / (R * T0)) : P_BASE[i] * Math.pow(T / T0, -G0 / (R * L));
  out.pressure = p;
  out.temperature = T;
  out.density = p / (R * T);
  out.soundSpeed = Math.sqrt(1.4 * R * T);
  return out;
}
