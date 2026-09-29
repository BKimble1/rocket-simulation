/**
 * Why-demos: short staged explanations of the design choices a learner asks about most.
 *
 * Each beat's `visual` key has the form `<DemoId>:<state>`: the demo scene to show (a DemoId
 * from types.ts) and a short name for the state of that scene while the beat's text is shown.
 * `whyVisual()` splits a key. Every number is recomputed from spec.ts by src/content/why.test.ts.
 */
import type { DemoId, WhyDemo } from './types';

export const WHY_DEMOS: WhyDemo[] = [
  {
    id: 'why-staging',
    title: 'Why staging reduces the mass you carry',
    question: 'Why do rockets throw parts of themselves away on the way up?',
    beats: [
      {
        text: 'The rocket equation rewards a high ratio of starting mass to final mass. Every kilogram of empty structure still on board at the end of a burn lowers that ratio, and therefore the velocity the propellant can give.',
        visual: 'staging-sequence:full-stack-mass-bars',
      },
      {
        text: 'Imagine the K-1 (expendable, without landing legs) as a single stage: the same hardware and the same 405,000 kg of propellant, with 8,000 kg of satellite and fairing carried all the way (a simplification). It starts at 443,100 kg and ends at 38,100 kg, still pushing 25,500 kg of empty booster. At 312 s that gives 7,507 m/s: not enough for orbit, which takes roughly 9.4 km/s once gravity and drag losses are included.',
        visual: 'staging-sequence:single-stage-empty-tanks',
      },
      {
        text: 'Now as two stages, same hardware, same propellant and, for a fair comparison, the same 312 s. The booster gives 4,178 m/s, then drops its 25,500 kg of empty stage. The upper stage only has to push 87,600 kg down to 12,600 kg and adds 5,933 m/s. Total 10,111 m/s: about 2,600 m/s more, with nothing changed except when the empty mass is discarded.',
        visual: 'staging-sequence:booster-drops-away',
      },
      {
        text: 'Each stage can also be built for its own job. The upper stage’s large vacuum nozzle raises its Isp to 342 s, which adds more still. The costs are separation hardware, a second engine, and one more event that must work.',
        visual: 'staging-sequence:upper-stage-vacuum-nozzle',
      },
    ],
    equation: {
      name: 'Ideal rocket equation, applied stage by stage',
      formula: 'Δv_total = Σ Isp_i·g0·ln(m0_i / mf_i)',
      variables: [
        { symbol: 'Δv_total', meaning: 'Sum of the ideal velocity changes of all stages', unit: 'm/s' },
        { symbol: 'Isp_i', meaning: 'Specific impulse of stage i', unit: 's' },
        { symbol: 'g0', meaning: 'Standard gravity, 9.80665 m/s²', unit: 'm/s²' },
        { symbol: 'm0_i', meaning: 'Mass when stage i ignites (everything above it included)', unit: 'kg' },
        { symbol: 'mf_i', meaning: 'Mass when stage i burns out, before it is dropped', unit: 'kg' },
      ],
      caveat:
        'Ideal velocity only: no gravity or drag losses, no landing legs or recovery reserve, one Isp per stage. The comparison deliberately uses 312 s for both stages and carries the fairing to the end, so the only difference between the cases is staging itself.',
      example:
        'Single stage: 312 s × 9.80665 m/s² × ln(443,100 / 38,100) = 7,507 m/s. Two stages: 312 s × 9.80665 m/s² × ln(443,100 / 113,100) = 4,178 m/s, plus 312 s × 9.80665 m/s² × ln(87,600 / 12,600) = 5,933 m/s, total 10,111 m/s.',
    },
    takeaway:
      'Staging is not about carrying more propellant. It is about not accelerating empty tanks: dropping dead mass partway lets the same propellant deliver far more velocity.',
    sources: ['nasa-grc-rocket-eq', 'sutton-rpe'],
  },
  {
    id: 'why-separate-tanks',
    title: 'Why the propellants live in separate tanks',
    question: 'Why not put the fuel and the oxidizer in one big tank?',
    beats: [
      {
        text: 'Liquid oxygen boils at 90 K (-183 °C). RP-1 is a refined kerosene: chilled to LOX temperature it would thicken and freeze solid, and no pump could move it. Each propellant has to be kept at its own temperature.',
        visual: 'tank-drain:lox-and-rp1-temperatures',
      },
      {
        text: 'Mixing them in bulk would also be dangerous: kerosene and liquid oxygen together form a mixture that can explode if shocked. Fuel and oxidizer should meet only inside the combustion chamber, in the ratio the injector sets: 2.3 kg of LOX for every kilogram of RP-1 in the E-1.',
        visual: 'feed-flow:injector-meets-propellants',
      },
      {
        text: 'Different densities make different tanks. The booster carries 230,000 kg of LOX (1,141 kg/m³) and 100,000 kg of RP-1 (810 kg/m³). With 3 % ullage that needs 207.6 m³ of LOX tank and 127.2 m³ of RP-1 tank: 2.3 times the mass fits in only 1.63 times the volume.',
        visual: 'tank-drain:tank-volumes',
      },
      {
        text: 'The booster keeps its tanks apart with an intertank: simple, but it adds length and a dry structural ring. The upper stage shares one insulated dome between them, the common bulkhead, which saves length and mass but must keep the RP-1 from getting too cold next to the LOX; that is why its core is an insulating honeycomb.',
        visual: 'tank-pressure:common-bulkhead-cutaway',
      },
      {
        text: 'In the booster the LOX, 2.3 times the mass of the RP-1, sits on top. That moves the centre of mass forward, away from the engines and toward the centre of pressure where the air pushes, so the gimbaled engines have a longer lever arm and less aerodynamic turning moment to fight. The price is the downcomer, a LOX feed line that runs down through the middle of the RP-1 tank.',
        visual: 'feed-flow:downcomer-highlight',
      },
    ],
    equation: {
      name: 'Tank volume',
      formula: 'V = (m / ρ)·(1 + u)',
      variables: [
        { symbol: 'V', meaning: 'Tank volume', unit: 'm³' },
        { symbol: 'm', meaning: 'Mass of propellant loaded', unit: 'kg' },
        { symbol: 'ρ', meaning: 'Density of the liquid at its storage temperature', unit: 'kg/m³' },
        { symbol: 'u', meaning: 'Ullage fraction: gas space left above the liquid (0.03 here)', unit: 'dimensionless' },
      ],
      caveat:
        'Leaves out the volume taken by hardware inside the tank (the downcomer, baffles, helium bottles), the change of density with temperature, and the residual propellant that can never be drained.',
      example:
        'K-1 booster, mixture ratio 2.3: 330,000 kg of propellant splits into 230,000 kg of LOX and 100,000 kg of RP-1. LOX: 230,000 kg / 1,141 kg/m³ × 1.03 = 207.6 m³. RP-1: 100,000 kg / 810 kg/m³ × 1.03 = 127.2 m³. The mass ratio of 2.3 becomes a volume ratio of 1.63.',
    },
    takeaway:
      'Separate tanks keep each propellant at its own temperature and keep them apart until the injector. How the tanks are arranged (an intertank or a common bulkhead, LOX above or below) is a trade between length, mass, insulation and stability.',
    sources: ['sutton-rpe', 'nasa-grc-liquid'],
  },
  {
    id: 'why-pumps',
    title: 'Why liquid engines may need pumps',
    question: 'Why not just push the propellants out of the tanks with gas pressure?',
    beats: [
      {
        text: 'Propellant flows into the chamber only if it arrives at a higher pressure than the chamber. The E-1 chamber runs at 8.5 MPa, about 84 times atmospheric pressure.',
        visual: 'turbopump:chamber-pressure-gauge',
      },
      {
        text: 'The pressure-fed option: pressurize the tanks above 8.5 MPa. A cylindrical wall needs a thickness t = p·r/σ; for the booster’s 1.85 m radius and an illustrative allowable stress of 300 MPa, that is at least 52 mm. The 17.6 m barrel of the LOX tank alone would weigh at least 30 t in 2219 aluminium, more than the whole 25.5 t booster. Real pressure-fed engines avoid this by running at a much lower chamber pressure, which makes them bigger and less efficient for the same thrust.',
        visual: 'tank-pressure:thick-wall-comparison',
      },
      {
        text: 'The pump-fed option: keep the tanks at a few bar (illustratively 0.3 MPa, needing only 1.85 mm of wall for pressure; flight loads and buckling set the real thickness) and raise the pressure just before the engine. Raising the E-1’s LOX and RP-1 flows by 8.5 MPa takes about 2.3 MW of hydraulic power per engine (volume flow times pressure rise), about 16 MW for the seven booster engines. The real pumps must also cover the injector and cooling-channel pressure drops and their own losses, so each turbine delivers more.',
        visual: 'turbopump:shaft-spinning',
      },
      {
        text: 'That power comes from a turbine on the same shaft, driven by a small gas generator that burns about 3 % of the engine’s propellant fuel-rich and dumps its exhaust overboard. The dumped gas is why a gas-generator engine gives up a little specific impulse.',
        visual: 'turbopump:gas-generator-exhaust',
      },
    ],
    equation: {
      name: 'Thin-wall hoop stress',
      formula: 't = p·r / σ',
      variables: [
        { symbol: 't', meaning: 'Wall thickness needed', unit: 'm' },
        { symbol: 'p', meaning: 'Pressure difference across the wall', unit: 'Pa' },
        { symbol: 'r', meaning: 'Tank radius', unit: 'm' },
        { symbol: 'σ', meaning: 'Allowable stress of the wall material', unit: 'Pa' },
      ],
      caveat:
        'Membrane (hoop) stress in a thin cylinder only: it leaves out welds (usually weaker than the parent metal), buckling, flight loads and formal safety factors. The 300 MPa allowable and the 0.3 MPa tank pressure are illustrative, not K-1 design values.',
      example:
        'Barrel of the K-1 booster LOX tank: r = 1.85 m, length 17.57 m, wall area 204 m², aluminium 2219 at 2,840 kg/m³. Pump-fed (0.3 MPa): t = 1.85 mm, about 1.07 t of wall. Pressure-fed (at least 8.5 MPa): t = 52.4 mm, about 30.4 t.',
    },
    takeaway:
      'Pumps let big tanks stay thin and light; the price is turbomachinery and, in a gas-generator cycle, a few percent of the propellant. Small spacecraft engines, with small tanks, are often pressure-fed instead.',
    sources: ['huzel-huang-sp125', 'sutton-rpe', 'asm-handbook-v2'],
  },
  {
    id: 'why-nozzle-size',
    title: 'Why nozzle size depends on the outside pressure',
    question: 'Why does the upper-stage engine have a much bigger nozzle than the booster engines?',
    beats: [
      {
        text: 'A nozzle turns hot, high-pressure gas into fast exhaust. Beyond the throat the flow is supersonic, and the more the bell widens (expansion ratio = exit area / throat area), the lower the exit pressure and the faster the gas leaves.',
        visual: 'nozzle-pressure:expansion-gradient',
      },
      {
        text: 'The E-1 (expansion ratio 16, 1.07 m exit) releases its exhaust at roughly 58 kPa (an estimate assuming a constant ratio of specific heats of 1.2). That matches the outside air at about 5 km altitude: a compromise for an engine that fires from sea level into near vacuum. At sea level the exhaust is overexpanded, but not far enough to make the flow separate from the wall.',
        visual: 'nozzle-pressure:e1-sea-level',
      },
      {
        text: 'The E-1V (expansion ratio 110, 2.80 m exit) expands its exhaust to about 5 kPa. At sea level the outside air would push on its 6.16 m² exit with 624 kN, leaving only 286 kN of its 910 kN, and the badly overexpanded flow would separate from the wall and shake the nozzle with side loads.',
        visual: 'nozzle-pressure:e1v-separated-at-sea-level',
      },
      {
        text: 'In vacuum nothing pushes back, and the extra expansion pays off: 342 s for the E-1V against 312 s for the E-1 in vacuum, about 10 % more impulse from every kilogram of propellant. The E-1V shares the E-1’s chamber, throat and propellant flow, so the gain also shows as thrust: 910 kN against 835 kN in vacuum.',
        visual: 'nozzle-pressure:e1v-vacuum-plume',
      },
    ],
    equation: {
      name: 'Rocket thrust, with the pressure term',
      formula: 'F = ṁ·v_e + (p_e − p_a)·A_e',
      variables: [
        { symbol: 'F', meaning: 'Thrust', unit: 'N' },
        { symbol: 'ṁ', meaning: 'Propellant mass flow rate', unit: 'kg/s' },
        { symbol: 'v_e', meaning: 'Exhaust velocity at the exit plane', unit: 'm/s' },
        { symbol: 'p_e', meaning: 'Exhaust pressure at the exit plane', unit: 'Pa' },
        { symbol: 'p_a', meaning: 'Outside pressure', unit: 'Pa' },
        { symbol: 'A_e', meaning: 'Nozzle exit area', unit: 'm²' },
      ],
      caveat:
        'Valid while the flow stays attached to the nozzle wall. The exit pressures quoted come from ideal one-dimensional expansion at the E-1 chamber pressure of 8.5 MPa with a ratio of specific heats of 1.2; real combustion gas properties change along the nozzle.',
      example:
        'E-1V: A_e = π·(2.80 m)²/4 = 6.158 m². At sea level p_a·A_e = 101,325 Pa × 6.158 m² = 624 kN, so even the ideal thrust would fall from 910 kN to 286 kN before counting flow separation. In vacuum the full 910 kN remains.',
    },
    takeaway:
      'Each nozzle is sized for where it works: moderate for the thick lower atmosphere, long and wide for vacuum. That is why the upper stage carries a different nozzle on the same engine core.',
    sources: ['nasa-grc-thrust', 'sutton-rpe'],
  },
  {
    id: 'why-chamber-cooling',
    title: 'Why the combustion chamber needs cooling',
    question: 'The flame inside is hotter than any metal can stand. Why doesn’t the chamber melt?',
    beats: [
      {
        text: 'LOX and RP-1 burn at about 3,500 to 3,700 K, depending on mixture ratio and pressure. Copper melts at 1,358 K (1,085 °C); even Inconel 718 starts to melt at 1,533 K (1,260 °C).',
        visual: 'regen-cooling:flame-temperature-scale',
      },
      {
        text: 'The heat flowing into the wall is greatest near the throat: tens of megawatts per square metre. No wall could simply soak that up for a burn lasting minutes.',
        visual: 'regen-cooling:heat-flux-at-throat',
      },
      {
        text: 'Regenerative cooling: most of the E-1’s 83 kg/s of RP-1 (all but the small share the gas generator takes straight from the pump) flows through channels milled into the liner just behind the hot surface before it is injected and burned. The fuel is the heat sink, and the heat it picks up returns to the chamber instead of being thrown away.',
        visual: 'regen-cooling:coolant-flow',
      },
      {
        text: 'The liner has to pass that heat with a small temperature drop, ΔT = q·t/k. At an illustrative 30 MW/m² through 1 mm, GRCop-42 needs only about 87 K; Inconel 718 would need about 2,630 K and would melt. Conductivity is what protects the wall: the channels do not insulate, they carry the heat away.',
        visual: 'regen-cooling:wall-temperature-profile',
      },
      {
        text: 'Far down the E-1V nozzle extension the expanded gas delivers much less heat, little enough for a thin niobium skin to radiate it away to space while glowing.',
        visual: 'regen-cooling:nozzle-extension-glow',
      },
    ],
    equation: {
      name: 'Conduction through the liner wall (Fourier’s law)',
      formula: 'ΔT = q·t / k',
      variables: [
        { symbol: 'ΔT', meaning: 'Temperature difference between the hot face and the coolant face', unit: 'K' },
        { symbol: 'q', meaning: 'Heat flux through the wall', unit: 'W/m²' },
        { symbol: 't', meaning: 'Wall thickness', unit: 'm' },
        { symbol: 'k', meaning: 'Thermal conductivity of the wall material', unit: 'W/(m·K)' },
      ],
      caveat:
        'Steady conduction through a flat wall. It leaves out the gas-side and coolant-side boundary layers (which set how much heat arrives and how well the coolant takes it), the change of k with temperature, and the ribs between channels. The 30 MW/m² flux is an illustrative throat-region value, not a K-1 design number.',
      example:
        'q = 30 MW/m², t = 1 mm. GRCop-42, k = 344 W/(m·K): ΔT = 30,000,000 W/m² × 0.001 m / 344 W/(m·K) = 87 K. Inconel 718, k = 11.4 W/(m·K): ΔT = 2,632 K.',
    },
    takeaway:
      'The chamber survives because the fuel carries heat away as fast as it arrives, through a thin, highly conductive wall. Conductivity plus flow, not insulation, keeps the liner cool.',
    sources: ['nasa-ntrs-cooled-chambers', 'nasa-grcop', 'nasa-grcop42-ellis', 'sm-inconel-718', 'asm-handbook-v2', 'sutton-rpe'],
  },
  {
    id: 'why-turn',
    title: 'Why the vehicle turns during ascent',
    question: 'If space is up, why does the rocket tip over toward the horizon?',
    beats: [
      {
        text: 'Reaching orbit is mostly about going sideways. Lifting each kilogram to 400 km takes about 3.7 MJ of energy; moving it at the 7,673 m/s of a circular orbit there takes about 29.4 MJ, eight times as much. A rocket that only went up would fall straight back down.',
        visual: 'gnc-loop:trajectory-arc',
      },
      {
        text: 'At liftoff (443,100 kg with the LEO satellite, not counting landing legs) the seven E-1 engines give 5,208 kN (rated sea-level thrust) against a weight of about 4,345 kN: a thrust-to-weight ratio of 1.20. Of the 11.75 m/s² that thrust provides, gravity cancels 9.81, leaving 1.9 m/s² upward. Every second spent climbing vertically loses 9.81 m/s of velocity to gravity.',
        visual: 'gnc-loop:force-arrows-liftoff',
      },
      {
        text: 'So the vehicle rises vertically only until it clears the tower, then tilts about a degree toward its launch direction, east on the LEO mission (the pitch kick). From then on guidance keeps the nose pointed along the air-relative velocity and lets gravity bend the path over: the gravity turn.',
        visual: 'tvc:pitch-kick-gimbal',
      },
      {
        text: 'Flying at zero angle of attack keeps sideways aerodynamic loads small through max-q, when the air pushes hardest. Above the atmosphere the upper stage steers freely to build horizontal speed and finishes level.',
        visual: 'gnc-loop:gravity-turn-trace',
      },
    ],
    equation: {
      name: 'Speed change along the flight path',
      formula: 'dv/dt = (T − D)/m − g·sin γ',
      variables: [
        { symbol: 'v', meaning: 'Speed along the flight path', unit: 'm/s' },
        { symbol: 't', meaning: 'Time', unit: 's' },
        { symbol: 'T', meaning: 'Thrust', unit: 'N' },
        { symbol: 'D', meaning: 'Drag', unit: 'N' },
        { symbol: 'm', meaning: 'Vehicle mass', unit: 'kg' },
        { symbol: 'g', meaning: 'Local gravity', unit: 'm/s²' },
        { symbol: 'γ', meaning: 'Flight-path angle above the local horizontal', unit: 'deg' },
      ],
      caveat:
        'A point mass flying along its path: it leaves out lift, thrust misalignment, and the curvature and rotation of the Earth. Thrust is taken at its rated sea-level value; it rises as the air thins. The 2,100 kg landing legs of the recovery missions add about 0.5 % to the mass and lower these accelerations slightly.',
      example:
        'At liftoff (γ = 90°, D = 0): T = 7 × 744 kN = 5,208 kN and m = 443,100 kg, so T/m = 11.8 m/s² (11.75) and dv/dt = 11.75 − 9.81 = 1.9 m/s². Once γ has fallen to 30°, gravity costs only 9.81 × sin 30° = 4.9 m/s per second.',
    },
    takeaway:
      'Turning early and gradually trades a little extra time in the air for much less velocity lost to gravity, while keeping aerodynamic loads low. The ascent is a curve because orbit is a speed, not a height.',
    sources: ['nasa-bsf-14', 'nasa-grc-dynpress', 'sutton-rpe'],
  },
  {
    id: 'why-sideways',
    title: 'Why orbit requires sideways velocity',
    question: 'The suborbital capsule climbs above 100 km and falls back. Why does the satellite at 400 km stay up?',
    beats: [
      {
        text: 'Gravity does not switch off in space. At 400 km it is still 8.69 m/s², about 89 % of its surface value. Astronauts float because they and their spacecraft fall together.',
        visual: 'spacecraft-ops:gravity-arrow-at-400km',
      },
      {
        text: 'Throw something sideways and it falls in a curve; throw it faster and it lands farther away. Throw it fast enough and the ground curves away as fast as it falls, so it never lands. That is an orbit.',
        visual: 'spacecraft-ops:newton-cannon-arcs',
      },
      {
        text: 'At 400 km the circular speed is 7,673 m/s. In one second the satellite moves 7.67 km sideways and falls 4.35 m, and over 7.67 km the Earth’s surface curves away by the same 4.35 m.',
        visual: 'spacecraft-ops:one-second-fall-vs-curvature',
      },
      {
        text: 'The suborbital flight climbs above 100 km with almost no sideways speed, so it falls back within minutes. Height without sideways speed is a hop, not an orbit.',
        visual: 'capsule-return:suborbital-arc',
      },
      {
        text: 'Launching east helps: the Earth’s rotation already carries the pad at about 408 m/s at 28.5° N.',
        visual: 'spacecraft-ops:earth-rotation-arrow',
      },
    ],
    equation: {
      name: 'Circular orbital speed',
      formula: 'v = √(μ / r)',
      variables: [
        { symbol: 'v', meaning: 'Circular orbital speed (non-rotating frame)', unit: 'm/s' },
        { symbol: 'μ', meaning: 'Earth’s gravitational parameter, 3.986004 × 10¹⁴', unit: 'm³/s²' },
        { symbol: 'r', meaning: 'Distance from the Earth’s centre', unit: 'm' },
      ],
      caveat: 'Spherical Earth, circular orbit, no drag. The one-second picture treats the fall and the curvature as small, which they are (a few metres over several kilometres).',
      example:
        'r = 6,771 km: v = 7,673 m/s and g = μ/r² = 8.69 m/s². Fall in one second: ½·g·(1 s)² = 4.35 m. Drop of the curved surface over 7.67 km: v²·(1 s)²/(2r) = 4.35 m. The two are equal exactly when v = √(μ/r).',
    },
    takeaway: 'Orbit is falling around the Earth. The speed has to be sideways, about 7.7 km/s at 400 km; height alone is not enough.',
    sources: ['nasa-bsf-3', 'nasa-bsf-4'],
  },
];

/** Split a beat's visual key (`<DemoId>:<state>`) into the demo scene and the named state. */
export function whyVisual(key: string): { demo: DemoId; state: string } {
  const i = key.indexOf(':');
  return { demo: key.slice(0, i) as DemoId, state: key.slice(i + 1) };
}

export function whyDemoById(id: string): WhyDemo | undefined {
  return WHY_DEMOS.find((w) => w.id === id);
}
