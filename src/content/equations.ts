/**
 * The four reference equations (referenced by phase cards as PhaseCard.equation). Every worked
 * example uses the K-1 numbers in src/vehicle/spec.ts and the constants in src/world/frames.ts;
 * src/content/equations.test.ts recomputes each number quoted here.
 */
import type { EquationNote } from './types';

export type EquationId = 'thrust' | 'dynamic-pressure' | 'rocket-equation' | 'orbital-speed';

export const EQUATIONS: Record<EquationId, EquationNote> = {
  thrust: {
    name: 'Rocket thrust, with the pressure term',
    formula: 'F = ṁ·v_e + (p_e − p_a)·A_e',
    variables: [
      { symbol: 'F', meaning: 'Thrust: the force along the engine axis', unit: 'N' },
      { symbol: 'ṁ', meaning: 'Mass flow rate of propellant through the nozzle', unit: 'kg/s' },
      { symbol: 'v_e', meaning: 'Exhaust velocity at the nozzle exit plane', unit: 'm/s' },
      { symbol: 'p_e', meaning: 'Static pressure of the exhaust at the exit plane', unit: 'Pa' },
      { symbol: 'p_a', meaning: 'Ambient (outside) pressure: 101,325 Pa at sea level, 0 in vacuum', unit: 'Pa' },
      { symbol: 'A_e', meaning: 'Nozzle exit area', unit: 'm²' },
    ],
    caveat:
      'Assumes steady, one-dimensional flow that fills the nozzle and leaves parallel to the axis. It leaves out losses from the divergence of the exhaust, the boundary layer and incomplete combustion, and it no longer holds when a nozzle is so overexpanded that the flow separates from the wall. The thrust comes from gas pressure on the inside of the chamber and nozzle; the exhaust does not push on the outside air.',
    example:
      'E-1 engine (K-1 illustrative data): vacuum thrust 835 kN, where p_a = 0. The exit diameter is 1.068 m (1.07 m), so A_e = π·(1.068 m)²/4 = 0.8958 m². At sea level the outside air pushes back on the exit area with p_a·A_e = 101,325 Pa × 0.8958 m² = 90.8 kN, so F = 835 kN − 90.8 kN = 744.2 kN. The K-1 data table lists 744 kN at sea level, in agreement: its sea-level rating is derived from the same nozzle, and the mission model applies the same pressure term as the air thins. The mass flow follows from the vacuum rating: ṁ = F_vac/(Isp_vac·g0) = 835,000 N / (312 s × 9.80665 m/s²) = 272.9 kg/s per engine, so the seven booster engines together consume about 1,910 kg of propellant every second.',
  },
  'dynamic-pressure': {
    name: 'Dynamic pressure',
    formula: 'q = ½·ρ·v²',
    variables: [
      { symbol: 'q', meaning: 'Dynamic pressure: how hard the oncoming air pushes', unit: 'Pa' },
      { symbol: 'ρ', meaning: 'Air density at the vehicle’s altitude', unit: 'kg/m³' },
      { symbol: 'v', meaning: 'Speed relative to the air (which turns with the Earth)', unit: 'm/s' },
    ],
    caveat:
      'Dynamic pressure is not a force by itself: an aerodynamic force is q times a reference area times a coefficient that depends on Mach number and angle of attack. Air density falls roughly exponentially with height while speed rises, so q peaks partway up (max-q), typically at about 10 to 15 km, where the vehicle is already supersonic. Real air density also varies with weather and season around the standard-atmosphere values.',
    example:
      'K-1 at max-q on the LEO mission (values rounded from its computed trajectory): about 375 m/s relative to the air at 12 km altitude, where the U.S. Standard Atmosphere 1976 gives an air density of 0.312 kg/m³ and a speed of sound of 295 m/s (so about Mach 1.3). q = ½ × 0.312 kg/m³ × (375 m/s)² = 21,938 Pa ≈ 21.9 kPa. Multiplied by the 4.0 m fairing’s frontal area of 12.57 m², that is a reference force of 276 kN; with an illustrative drag coefficient of 0.5, the drag is about 138 kN, under 3 % of the engines’ thrust at that moment. The telemetry shows the exact values as the flight plays.',
  },
  'rocket-equation': {
    name: 'Ideal rocket equation',
    formula: 'Δv = Isp·g0·ln(m0 / mf)',
    variables: [
      { symbol: 'Δv', meaning: 'Ideal change of velocity from the burn', unit: 'm/s' },
      { symbol: 'Isp', meaning: 'Specific impulse of the engine', unit: 's' },
      { symbol: 'g0', meaning: 'Standard gravity, 9.80665 m/s² (turns Isp in seconds into an exhaust velocity)', unit: 'm/s²' },
      { symbol: 'm0', meaning: 'Mass at the start of the burn, propellant included', unit: 'kg' },
      { symbol: 'mf', meaning: 'Mass at the end of the burn', unit: 'kg' },
      { symbol: 'ln', meaning: 'Natural logarithm', unit: 'dimensionless' },
    ],
    caveat:
      'Ideal: no gravity, no drag, no steering losses, and one constant Isp. On a real climb to orbit, gravity and drag take roughly 1.5 to 2 km/s of the budget; a booster’s Isp rises from its sea-level to its vacuum value as the air thins; and a recoverable booster keeps a propellant reserve for its return, which it never spends on the ascent.',
    example:
      'K-1 first stage carrying the 6,200 kg LEO satellite, expendable configuration (K-1 illustrative data). Liftoff mass m0 = 25,500 kg booster dry + 330,000 kg booster propellant + 4,600 kg upper-stage dry + 75,000 kg upper-stage propellant + 1,800 kg fairing + 6,200 kg satellite = 443,100 kg. Burning all the booster propellant leaves mf = 113,100 kg, a mass ratio of 3.918. With the vacuum Isp of 312 s: Δv = 312 s × 9.80665 m/s² × ln(3.918) = 4,178 m/s. With the sea-level Isp of 278 s: 3,723 m/s. The real booster delivers something in between, less its gravity and drag losses. On the LEO mission the booster also carries 2,100 kg of landing legs and shuts down with about 50 t of propellant kept for its return, so its ideal Δv at 312 s falls to about 3,030 m/s: recovery costs more than a quarter of the booster’s contribution. The upper stage does the rest: from 85,800 kg down to 10,800 kg at 342 s it adds 6,951 m/s (counting the 1,800 kg fairing as already gone; in flight it is released about a minute into the burn).',
  },
  'orbital-speed': {
    name: 'Circular orbital speed',
    formula: 'v = √(μ / r)',
    variables: [
      { symbol: 'v', meaning: 'Speed in a circular orbit, measured in a non-rotating frame centred on the Earth', unit: 'm/s' },
      { symbol: 'μ', meaning: 'Earth’s gravitational parameter G·M = 3.986004 × 10¹⁴ m³/s²', unit: 'm³/s²' },
      { symbol: 'r', meaning: 'Orbit radius from the Earth’s centre: Earth radius plus altitude', unit: 'm' },
    ],
    caveat:
      'Assumes a spherical Earth, a perfectly circular orbit and no drag. The Earth’s equatorial bulge slowly turns real orbits, and at 400 km the thin remaining air slowly lowers them. The speed is inertial: a vehicle launched eastward from 28.5° N starts with about 408 m/s from the Earth’s rotation, so its engines need to supply less.',
    example:
      'K-1 LEO mission, 400 km circular orbit: r = 6,371 km + 400 km = 6,771 km. v = √(3.986004 × 10¹⁴ m³/s² / 6,771,000 m) = 7,673 m/s, about 27,620 km/h. One orbit takes 2π·r/v = 92.4 minutes. Gravity at that height is still μ/r² = 8.69 m/s², about 89 % of its surface value: the satellite is falling all the time, but moving sideways fast enough that the Earth curves away beneath it.',
  },
};
