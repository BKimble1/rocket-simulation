/**
 * Thermal-protection lessons: the booster's base heat shield, the E-1V radiatively cooled nozzle
 * extension, spacecraft MLI blankets, the capsule's ablative heat shield and its reusable
 * backshell tiles.
 */
import type { PartLesson, PartNote } from '../types';
import { at, lesson, mats, note } from './util';
import { F } from './derived';

export const THERMAL: (PartLesson | PartNote)[] = [
  note({
    id: 'base-heat-shield',
    summary: 'The plate across the booster\'s base, with flexible boots around each engine, that keeps plume heat out of the engine bay.',
    function: 'At altitude the seven plumes widen and merge, and some hot gas is drawn back toward the base (recirculation); the plumes also radiate strongly. The shield (heat-resistant metal panels over a flexible ceramic insulation layer) blocks this heat, while the boots seal around the engines yet let them gimbal.',
    why: 'Behind the shield are turbopumps, valves, actuators, wiring and the thrust structure, none of which tolerate plume heating. The problem grows with altitude as the plumes expand, and again during the booster\'s engines-first entry burn.',
    materials: mats('base-heat-shield'),
    phases: [
      at('leo', 'meco', 'Plumes are widest near cutoff and base heating peaks.'),
      at('leo', 'entry-burn', 'The booster flies into its own plume and the entry heating.'),
      at('leo', 'landing-burn', 'The centre engine\'s plume reflects from the landing pad.'),
    ],
    sources: ['sutton-rpe', 'nasa-reusable-tps', 'nasa-srp'],
  }),

  lesson({
    id: 'nozzle-extension',
    summary: 'The large, thin niobium-alloy bell bolted below the E-1V\'s cooled nozzle, which has no coolant at all: it gets red hot and sheds its heat by glowing.',
    where: `The lower part of the E-1V's nozzle, from the flange at the end of the tube-wall section down to the ${F.e1vExit} exit. It is the matte, dark-grey bell with stiffening rings that fills most of the interstage during the climb.`,
    connections: ['vacuum-engine', 'interstage', 'stage-separation'],
    function: `Continue the expansion of the exhaust to an area ratio of ${F.e1vEps}, giving the E-1V its high vacuum performance at low mass.`,
    how: `Radiation cooling: the thin wall heats up until it radiates away (by the Stefan-Boltzmann law, in proportion to the fourth power of its absolute temperature) as much heat as the gas delivers. Far downstream of the throat, the gas has expanded and cooled and the heat flux is modest, so the wall settles at a temperature the alloy can hold. It glows brightest near the joint, where the gas is hottest, and dims toward the exit. A silicide coating stops the hot niobium from oxidizing.`,
    why: `A regeneratively cooled tube wall over this huge area would be heavy and would force the fuel through a long, high-pressure-drop circuit. Radiation cooling is light and simple, and it works here because the stage fires in near vacuum, where the hot wall can radiate freely.`,
    phases: [
      at('leo', 'ses1', 'Starts to glow within seconds of upper-stage ignition.'),
      at('leo', 'upper-burn', 'Glows red-orange for the whole burn.'),
      at('leo', 'staging', 'Must slide out of the interstage without touching it.'),
      at('gto', 'gto-injection', 'Reheated for the second burn.'),
    ],
    environment: 'Wall temperatures high enough to glow, steep temperature differences between joint and exit, vibration and acoustic loading, thermal cycling between burns and cold soak in space, and a thin wall that can be dented by handling or debris.',
    figures: [
      { label: 'Exit diameter / area', value: `${F.e1vExit} / ${F.e1vExitArea}` },
      { label: 'Engine expansion ratio', value: F.e1vEps },
      { label: 'Ideal exit pressure', value: `about ${F.e1vExitPressure}`, note: 'Isentropic estimate, specific-heat ratio 1.2' },
      { label: 'Heat a black wall radiates at 1,500 K', value: F.radiatedAt1500K, note: 'Stefan-Boltzmann, illustrative wall temperature' },
    ],
    materials: mats('nozzle-extension'),
    materialsWhy: 'Niobium alloy C-103 keeps useful strength at temperatures where most metals are soft, is ductile enough to form into a thin bell, and can be welded. Unprotected, hot niobium reacts quickly with oxygen, so it is coated with a silicide layer that forms a protective oxide skin.',
    manufacturing: 'Sheet is rolled, spun or formed to the bell shape, welded in an inert atmosphere (hot niobium absorbs oxygen and nitrogen and becomes brittle), stiffened with rings, then coated by applying a silicide slurry and fusing it in a vacuum furnace.',
    inspection: 'Coating inspection for cracks and bare spots, dye-penetrant checks of welds, dimensional checks of the bell contour, and careful handling rules: the wall is thin.',
    misconception: '"A glowing nozzle means it is overheating." Glowing is exactly how it cools itself. A dark nozzle extension in flight would mean less heat was being rejected, not more.',
    ifAbsent: `Without the extension, the E-1V would have roughly the E-1's specific impulse, and the upper stage would lose about ${F.leoS2WithE1Loss} of ideal velocity change on the LEO mission (computed).`,
    depth: {
      quick: 'The big bottom part of the upper-stage nozzle is not cooled by fuel. It gets red hot and cools itself by glowing, like the element of a toaster.',
      engineering: `Radiated flux q = ε·σ·T⁴. Even a perfectly black wall at 1,500 K sheds only about ${F.radiatedAt1500K}, roughly a hundred times less than the tens of MW/m² at the throat. That is why radiation cooling suits the far end of a vacuum nozzle and never the chamber.`,
      materials: 'Refractory metals trade oxidation resistance for high-temperature strength; the silicide coating supplies what niobium lacks. Coating damage is the life-limiting item.',
    },
    demo: 'nozzle-pressure',
    sources: ['nasa-sp8120', 'sutton-rpe'],
  }),

  lesson({
    id: 'mli-blankets',
    summary: 'Multilayer insulation (MLI) blankets are the crinkled gold- and silver-coloured wrappings on spacecraft: many thin reflective layers that control heat flow by radiation in vacuum.',
    where: 'Wrapped around the satellite bus and propellant tanks, and on the capsule\'s service module. Look for the gold and silver foil with taped seams, grounding tabs and small vent holes.',
    connections: ['satellite-bus', 'service-module', 'antenna', 'attitude-thrusters'],
    function: 'Keep the spacecraft\'s electronics, batteries and propellants within their temperature limits despite full sunlight on one side and deep space on the other.',
    how: 'In vacuum there is no air to conduct or convect heat, so heat moves mainly by radiation. Each layer (a thin polyimide or polyester film with a vapour-deposited aluminium coating) reflects most of the infrared that reaches it and emits little. Stacking many layers, separated by fine netting so they barely touch, forces heat through many weak radiation steps in series. The gold colour is usually the amber polyimide film seen over its aluminium backing.',
    why: `In ${F.leoAlt} orbit a spacecraft passes from full sunlight to Earth's shadow every ${F.leoPeriod}, with up to about ${F.eclipseMin} of shadow per orbit (computed). Without insulation its temperature would swing far beyond what electronics tolerate.`,
    phases: [
      at('leo', 'arrays', 'The satellite\'s own thermal control takes over after separation.'),
      at('gto', 'transfer-coast', 'Keeps propellant and electronics in range during the long coast.'),
      at('lunar', 'cruise', 'Three days of full sunlight on one side, deep space on the other.'),
      at('station', 'phasing', 'Protects the service module\'s tanks and lines.'),
    ],
    environment: 'Hard vacuum, intense sunlight and ultraviolet light, atomic oxygen in low orbit (which erodes some polymers), and rapid venting during launch as the air trapped between layers escapes.',
    figures: [
      { label: 'Sunlight above the atmosphere', value: `about ${F.solarIrradiance}`, note: 'Total solar irradiance (Kopp and Lean, 2011)' },
      { label: `Shadow per orbit at ${F.leoAlt}`, value: `up to about ${F.eclipseMin}`, note: 'Orbit plane containing the Sun direction, computed' },
      { label: `Sunlight-shadow cycles per day at ${F.leoAlt}`, value: F.orbitsPerDay, note: 'Computed' },
    ],
    materials: mats('mli-blankets'),
    materialsWhy: 'Aluminised polymer films are very low-emittance (they radiate little) and very light, which is what a radiation barrier needs. The outer layer is chosen for durability and optical properties (it sets how hot the blanket runs in sunlight); fine netting spacers minimize contact conduction between layers.',
    manufacturing: 'Layers are cut from patterns, stacked with netting, stitched or tagged together, edges taped, and fitted by hand to each spacecraft, with vents so trapped air can escape during launch and grounding tabs so static charge cannot build up.',
    inspection: 'Visual inspection of every blanket for tears and gaps, electrical checks of the grounding, and a thermal-vacuum test of the whole spacecraft to confirm the temperatures predicted by analysis.',
    misconception: '"MLI works like a thick wool blanket, and it is gold foil." Its layers are thin plastic films with aluminium coatings; it works by reflecting radiation and needs vacuum to work well. In air it insulates poorly because the gas between the layers conducts heat.',
    ifAbsent: 'Sunlit surfaces would overheat, shaded ones would freeze, and propellant lines could freeze or electronics fail within a few orbits.',
    depth: {
      quick: 'The shiny wrapping is many thin mirror layers. In space, heat travels mainly as radiation, and every layer bounces most of it back.',
      engineering: 'With N layers of emittance ε, radiative heat flow falls roughly as 1/(N+1) of a single pair of surfaces, until conduction through contacts, seams and penetrations dominates. Real blanket performance is set mostly by seams and edges.',
      materials: 'Low emittance and low mass are the key properties; outer-layer durability (ultraviolet, atomic oxygen) decides lifetime.',
    },
    sources: ['nasa-mli', 'nasa-sst-soa', 'kopp-lean-tsi'],
  }),

  lesson({
    id: 'heat-shield',
    summary: `The heat shield is the thick, slightly curved base of the crew capsule that faces the airflow during entry; it chars and slowly erodes on purpose, carrying the heat away with it.`,
    where: `The broad, shallow dome under the capsule: a spherical section of radius ${F.heatShieldRadius} across the ${F.capsuleDiameter} base, about ${F.heatShieldThickness} thick. In the cutaway, look for the layers: ablator in a honeycomb grid, the composite carrier, insulation, then the pressure vessel.`,
    connections: ['capsule', 'backshell-tps', 'service-module', 'parachutes'],
    function: 'Protect the capsule while the atmosphere removes its orbital energy, keeping the structure behind it cool.',
    how: 'The capsule\'s blunt face pushes a strong shock wave ahead of it; air crossing the shock is compressed and heated to thousands of kelvin, and most of that heat stays in the air that flows around the capsule. What does reach the surface is handled by ablation: the resin in the ablator decomposes (pyrolysis), absorbing heat; the gases it releases blow outward through the porous char and thicken the boundary layer, blocking part of the incoming heat; the char surface glows and radiates heat away; and the surface recedes slowly. The unburnt material underneath is a poor conductor, so the bondline stays cool.',
    why: `The forebody meets the highest heating on the vehicle. After the deorbit burn from ${F.leoAlt}, the capsule reaches the ${F.entryInterface} entry interface at about ${F.entryInertial}, or about ${F.entryAir} relative to the air, which turns with Earth. That is a kinetic energy of about ${F.capsuleKE} (${F.capsuleKEperKg}, computed, two-body), and nearly all of it has to be removed by the air. An ablator handles high heat flux reliably, which is why it is used here while the cooler backshell uses reusable tiles.`,
    phases: [
      at('return', 'sm-sep', 'Exposed when the service module is discarded.'),
      at('return', 'entry', 'Faces the flow from entry interface.'),
      at('return', 'blackout', 'Peak heating: the surface chars and recedes.'),
      at('suborbital', 'entry', 'A gentler entry from the suborbital hop.'),
    ],
    environment: 'Surface temperatures of thousands of kelvin in a chemically reacting shock layer, peak deceleration of several g, and before that, months in the cold vacuum of space bolted to the service module; then salt water.',
    figures: [
      { label: 'Thickness', value: F.heatShieldThickness },
      { label: 'Spherical radius / base diameter', value: `${F.heatShieldRadius} / ${F.capsuleDiameter}` },
      { label: 'Kinetic energy at entry', value: `about ${F.capsuleKE}`, note: `${F.capsuleMass} at ${F.entryAir} relative to the air, computed; the energy of about ${F.capsuleTNT}` },
    ],
    materials: mats('heat-shield'),
    materialsWhy: 'A low-density charring ablator (fibres and fillers in a resin that decomposes when heated) combines low density, low conductivity and heat absorption by pyrolysis. Here it fills a honeycomb grid, which anchors the char; documented capsules have used both honeycomb-filled ablators and machined ablator blocks. Behind it a composite carrier structure carries the aerodynamic load to the capsule.',
    manufacturing: 'The honeycomb carrier is bonded to the structure and each of thousands of cells is filled with ablator, then cured and machined to the final contour; alternatively, large blocks of ablator are machined and bonded on. Thickness is set by analysis of the worst entry plus margin.',
    inspection: 'X-ray or CT for voids and unfilled cells, ultrasound of bond lines, thickness measurement; after flight, core samples show how deep the char went, which checks the analysis.',
    misconception: '"The capsule gets hot from friction with the air, and the heat shield works by staying intact and cool." The heating comes mainly from air compressed in the shock ahead of the capsule, not rubbing. The shield works by charring and eroding on purpose: that is where much of the heat goes.',
    ifAbsent: 'The capsule\'s structure would reach destructive temperatures within seconds of peak heating: no crewed return is possible without it.',
    depth: {
      quick: 'The capsule comes home base-first. Its heat shield burns slowly on the outside while the inside stays cool.',
      engineering: 'Blunt bodies (Allen and Eggers) push a strong, detached shock ahead of them that dumps most of the energy into the air, and a large nose radius lowers the heat flux at the stagnation point (roughly in proportion to 1/√R). Convective heating scales roughly with √ρ·v³ and peaks before peak deceleration (which scales with ρ·v²). The ablator\'s energy budget: heat absorbed by pyrolysis, blocked by blowing, re-radiated by the char, and conducted inward (kept small).',
      materials: 'Ablators are one-use materials sized for the worst heating; reusable tiles cannot take the forebody\'s heat flux, which is why the capsule uses both.',
    },
    demo: 'heat-shield-stack',
    closeup: 'heat-shield-stack',
    sources: ['nasa-ablators', 'allen-eggers', 'nasa-bsf-3'],
  }),

  lesson({
    id: 'backshell-tps',
    summary: 'The black and white ceramic tiles covering the capsule\'s sloping sides: a reusable thermal protection system for the areas that are heated far less than the base.',
    where: `The conical sidewall of the capsule (the backshell, ${F.capsuleSidewall} from the axis), from the rim of the heat shield up to the docking hatch. Look for the grid of tiles with small gaps between them.`,
    connections: ['capsule', 'heat-shield', 'parachutes', 'docking-system'],
    function: 'Keep the backshell structure cool during entry while surviving to fly again with little refurbishment.',
    how: 'On the leeward side of the blunt capsule the flow expands around the shoulder and the heating is much lower than on the forebody. Silica tiles have very low thermal conductivity and low density: the surface can glow while the inside face stays cool. A black high-emittance coating radiates heat away where the heating is higher; white coatings reflect sunlight in orbit where the heating is low. Each tile is bonded to a felt strain isolation pad, so the structure can flex and expand without cracking the brittle tile.',
    why: 'Where the heat flux allows it, reusable tiles avoid replacing the whole cover after every flight. The base needs an ablator; the backshell does not.',
    phases: [
      at('return', 'entry', 'Protects the sides while the capsule flies at a small angle to the flow.'),
      at('return', 'blackout', 'Glows at the shoulder near peak heating.'),
      at('suborbital', 'entry', 'A mild entry for the research capsule.'),
    ],
    environment: 'Moderate entry heating, launch vibration and noise, cold soak in orbit, and seawater at splashdown (silica tiles absorb water unless waterproofed).',
    figures: [
      { label: 'Sidewall angle', value: F.capsuleSidewall },
      { label: 'Porosity of a silica tile', value: 'more than 90 % empty space', note: 'Low-density silica tile class (NASA Ames)' },
    ],
    materials: mats('backshell-tps'),
    materialsWhy: 'Silica tiles combine very low conductivity, low density and tolerance to high surface temperature, and can fly again. Their weakness is brittleness, which the strain isolation pad and gaps address. Ablative backshells, shown for comparison, are used on documented capsules too: robust, but replaced after each flight.',
    manufacturing: 'Silica fibres are slurry-cast into blocks, sintered, machined to the exact shape of each location, coated and waterproofed, then bonded with silicone adhesive to strain isolation pads on the structure. Gaps are sized for expansion and filled where needed.',
    inspection: 'Tile-by-tile visual inspection, bond pull tests on sample tiles, gap measurements, and after flight replacement of any cracked or eroded tiles and re-waterproofing.',
    misconception: '"Ceramic tiles are heavy, like dinner plates." They are mostly empty space: a low-density silica tile is lighter than many woods and can be held by its edges while its centre glows.',
    ifAbsent: 'The backshell structure would overheat, especially near the shoulder; covering it with ablator instead would add refurbishment after every flight.',
    depth: {
      quick: 'The capsule\'s sides get much less heat than its base, so they are covered with light, reusable ceramic tiles instead of a burn-away shield.',
      engineering: 'Heat flux on the backshell is a small fraction of the stagnation value, within a reusable tile\'s capability. Tile thickness is set so the bondline stays below the adhesive\'s temperature limit for the whole heat pulse, including soak-back after the flow has cooled.',
      materials: 'Reusable ceramics trade toughness for low conductivity and reuse; ablators trade reuse for capacity. Using each where it fits is the design.',
    },
    demo: 'capsule-return',
    sources: ['nasa-reusable-tps', 'nasa-ablators', 'allen-eggers'],
  }),
];
