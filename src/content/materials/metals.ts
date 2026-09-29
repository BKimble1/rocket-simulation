/**
 * Metals of the K-1: aluminium alloys, stainless steels, copper alloys, nickel superalloys,
 * niobium and titanium. Numbers appear only with alloy, condition, temperature and a source;
 * worked numbers in the questions are recomputed by src/content/materials/materials.test.ts.
 */
import type { MaterialDraft } from './draft';

export const AL_LI: MaterialDraft = {
  id: 'al-li',
  name: 'Aluminium-lithium alloy (2195 class)',
  family: 'Aluminium alloys',
  focus:
    'The barrel material of the K-1 propellant tanks, also used for the intertank panels and the crew capsule pressure vessel. It shows the three things a cryogenic tank wall has to balance: low density, high strength and stiffness, and toughness at liquid-oxygen temperature, plus how a thin shell is kept from buckling.',
  suits:
    'A tank barrel is sized by several requirements at once: hoop stress from internal pressure (wall thickness t = p·r/σ), axial compression and bending from thrust and wind in flight, and buckling of the thin shell. Adding a few percent of lithium, the lightest metal, makes aluminium lighter and stiffer. In the 2195 alloy it is about 5 % less dense and about 30 % stronger than the 2219 it replaced on the Space Shuttle super lightweight tank, so the same wall can be thinner. Like other aluminium alloys it has no ductile-to-brittle transition: at 90 K it is stronger and still tough, so a small crack does not run. The K-1 barrels are machined into an orthogrid (a thin skin with a square grid of integral ribs), which raises the bending stiffness of the wall many times for little extra mass, and the booster flies with its tanks pressurized, which puts the skin in tension and stabilizes it (pressure stabilization).',
  limits:
    'Harder to fusion weld than 2219 (porosity, hot cracking and weak heat-affected zones), which is why the seams are friction stir welded; more expensive per kilogram; its properties vary more with direction through thick plate. Like every aluminium alloy it loses strength quickly above roughly 150 °C, so it must be kept away from hot engine gas. And a thin barrel of even the best alloy buckles long before the metal is overstressed (see the question).',
  elsewhere: [
    { text: 'The Space Shuttle super lightweight external tank (flown from 1998) moved most of its structure from 2219 to Al-Li 2195 and became about 3,400 kg (7,500 lb) lighter.', source: 'nasa-slwt' },
    { text: 'NASA crushed a full-scale aluminium-lithium test barrel to measure how real thin tank shells buckle and to update the design knockdown factors used for launch-vehicle tanks.', source: 'nasa-al-li-crush' },
  ],
  compare: [
    { axis: 'Density', text: 'About 5 % lower than 2219 and about one third of steel; over tens of square metres of wall the saving adds up to tonnes.' },
    { axis: 'Strength', text: 'About 30 % stronger than 2219 (NASA super lightweight tank data), and stronger again when cold.' },
    { axis: 'Stiffness', text: 'Slightly stiffer than conventional aluminium alloys. For a thin shell, stiffness, not strength, sets the buckling load.' },
    { axis: 'Temperature', text: 'Tough at 90 K (LOX) and at 20 K (liquid hydrogen); weak above about 150 °C.' },
    { axis: 'Manufacturability', text: 'Machined orthogrid panels joined by friction stir welding; conventional fusion welding is difficult.' },
  ],
  properties: [
    { property: 'Density relative to Al 2219', value: 'about 5 % lower', condition: '2195 versus 2219, room temperature', source: 'nasa-slwt' },
    { property: 'Strength relative to Al 2219', value: 'about 30 % higher', condition: '2195 versus 2219 as used in the Space Shuttle external tank', source: 'nasa-slwt' },
  ],
  manufacturing:
    'Barrel panels are machined from thick plate into orthogrid (most of the plate becomes chips), formed to the 1.85 m tank radius, and joined along their long seams by friction stir welding: a spinning pin heats the metal by friction until it is soft but not molten and stirs the two edges together, avoiding the porosity and cracking of a fusion weld. The domes and rings (2219 in the K-1) are joined with circumferential friction stir welds. Each finished tank is proof-pressure tested above its flight pressure.',
  inspection:
    'X-ray radiography and phased-array ultrasound of every weld, helium leak checks, and a proof-pressure test of each tank. The barrels are also scanned for roundness, because out-of-roundness lowers the buckling load.',
  question: {
    q: 'Why does a lightweight shell need reinforcement?',
    a: 'Because a thin cylinder fails by buckling long before its metal is overstressed. For an unstiffened aluminium barrel with the K-1 radius of 1.85 m and a 2 mm wall (elastic modulus about 73 GPa), classical theory gives a buckling stress of 0.605·E·t/R ≈ 47.7 MPa. Real shells have small imperfections and buckle at only about 23 % of that (the NASA SP-8007 knockdown factor for this radius-to-thickness ratio of 925), about 11.2 MPa: under 3 % of the roughly 393 MPa yield strength of 2219-T87. Integral orthogrid ribs raise the bending stiffness of the wall, and internal pressure puts the skin in hoop tension and pulls out the imperfections, so a stiffened, pressurized wall carries thrust and bending without becoming heavy.',
  },
  closeup: 'tank-wall',
  sources: ['nasa-slwt', 'nasa-al-li-crush', 'nasa-sp8007', 'nasa-isogrid', 'twi-fsw', 'asm-handbook-v2'],
};

export const AL_2219: MaterialDraft = {
  id: 'al-2219',
  name: 'Aluminium alloy 2219 (aluminium-copper)',
  family: 'Aluminium alloys',
  focus:
    'The long-serving weldable aluminium of cryogenic rocket tanks. In the K-1 it forms the tank domes, rings and frames, the thrust frame and many fittings. It shows why weldability and cryogenic toughness can matter more than peak strength.',
  suits:
    '2219 is an aluminium-copper alloy that welds (by fusion or friction stir) with little cracking, keeps useful strength over a wide temperature range, and becomes both stronger and tougher when cold, which suits domes and rings with LOX at 90 K on one side. Domes are doubly curved: they are made from formed gores welded together, and 2219 accepts that forming and welding where higher-strength alloys crack. For machined frames, fittings and enclosures it is a well-understood, predictable structural alloy.',
  limits:
    'Lower strength and slightly higher density than Al-Li, so it costs mass on the large barrel areas; that is why the K-1 uses Al-Li there. The copper that strengthens it lowers its corrosion resistance, so parts are anodized or primed. It loses strength above roughly 150 °C and must be shielded from engine heat. In this illustrative model the 2219 tag also stands for related aluminium hardware that in practice uses other alloys: cast aluminium for the LOX pump housing and thin 5052 foil for the crushable honeycomb in the leg foot pads.',
  elsewhere: [
    { text: 'The original Space Shuttle external tank was built of 2219 before the super lightweight tank moved most of its structure to Al-Li 2195.', source: 'nasa-slwt' },
    { text: 'The core stage of NASA’s Space Launch System is built from 2219 barrel panels joined by friction stir welding in a vertical weld centre at the Michoud Assembly Facility.', source: 'nasa-sls-fsw' },
  ],
  compare: [
    { axis: 'Weldability', text: 'Among the best of the high-strength aluminium alloys: the reason it is chosen for welded domes and rings.' },
    { axis: 'Strength', text: 'Moderate, lower than Al-Li 2195. Design allowables (MMPDS) are lower than the typical values listed here.' },
    { axis: 'Density', text: 'About 2,840 kg/m³: roughly a third of steel, about 5 % heavier than Al-Li 2195.' },
    { axis: 'Temperature', text: 'Stronger and tougher at cryogenic temperature; weak above about 150 °C.' },
    { axis: 'Conduction', text: 'A thin metal wall is no barrier to heat. Without foam the outside of a LOX tank is nearly as cold as the LOX, which is why frost forms on the pad.' },
  ],
  properties: [
    { property: 'Density', value: '2,840 kg/m³ (2.84 g/cm³)', condition: '2219, room temperature', source: 'asm-handbook-v2' },
    { property: 'Yield strength (typical)', value: 'about 393 MPa', condition: '2219-T87, room temperature', source: 'asm-handbook-v2' },
    { property: 'Ultimate tensile strength (typical)', value: 'about 476 MPa', condition: '2219-T87, room temperature', source: 'asm-handbook-v2' },
    { property: 'Elastic modulus', value: 'about 73 GPa', condition: '2219-T87, room temperature', source: 'asm-handbook-v2' },
  ],
  manufacturing:
    'Plate and ring forgings are machined into rings and frames. Dome gores are stretch- or spin-formed and welded into domes (older practice: fusion welding with 2319 filler wire; current practice: friction stir welding). Parts are brought to the T8 tempers (solution heat treated, cold worked, then artificially aged) before welding.',
  inspection:
    'Radiography and ultrasound of welds, dye-penetrant inspection of machined surfaces, a proof-pressure test of the finished tank, and helium leak checks.',
  question: {
    q: 'Why use a weaker aluminium alloy for the domes than for the barrels?',
    a: 'Because each part is limited by something different. A dome is a doubly curved shape formed from gores and welded together, and 2219 forms and welds with little cracking and stays tough at 90 K. A barrel is a simple cylinder machined from flat plate, where the lower density and higher strength of Al-Li save the most mass. Each part gets the alloy whose weak point matters least there.',
  },
  closeup: 'tank-wall',
  sources: ['asm-handbook-v2', 'mmpds', 'nasa-slwt', 'nasa-sls-fsw', 'twi-fsw'],
};

export const STAINLESS: MaterialDraft = {
  id: 'stainless',
  name: 'Austenitic stainless steels (300 series class)',
  family: 'Steels',
  focus:
    'Iron alloyed with chromium and nickel: dense, but strong, tough from cryogenic to high temperature, and easy to fabricate and weld. The K-1 uses it where those virtues outweigh mass: lines, bellows, valve bodies, actuator rods, nozzle tubes and pad hardware.',
  suits:
    'The nickel-stabilized austenitic (face-centred cubic) structure has no ductile-to-brittle transition, so these steels stay tough in LOX at 90 K and even in liquid hydrogen. They keep much more strength at several hundred °C than aluminium, so they tolerate hot gas and friction; they resist corrosion; the right grades are compatible with oxygen; and they weld, braze and form easily. That makes them right for small, highly loaded, complex parts: bellows that flex thousands of times, valve bodies, hydraulic cylinders, pusher rods, and the brazed tubes of a tube-wall nozzle. On the pad, water-cooled steel plates take the direct blast of the plume.',
  limits:
    'Density is about 8,000 kg/m³, nearly three times aluminium, so a large steel tank wall must be much thinner to break even on mass, and a thin wall buckles unless it is pressurized. Thermal conductivity is low compared with copper, so steel is not used for the hottest chamber walls. Cold-worked grades gain strength that is partly lost again in weld zones.',
  elsewhere: [
    { text: 'The Atlas and Centaur stages used paper-thin stainless-steel balloon tanks that held their shape only while pressurized (pressure stabilization), among the lightest tanks of their era.', source: 'nasa-centaur' },
    { text: 'Tube-wall nozzles brazed from hundreds of shaped tubes carrying fuel were standard on large kerosene engines of the 1960s.', source: 'nasa-sp125' },
  ],
  compare: [
    { axis: 'Cryogenic toughness', text: 'Excellent: no ductile-to-brittle transition, like aluminium and unlike ordinary carbon steels.' },
    { axis: 'Elevated temperature', text: 'Keeps useful strength to several hundred °C, far beyond aluminium alloys.' },
    { axis: 'Mass', text: 'About 2.8 times the density of aluminium: it wins only where parts are small, or where heat and cold would force aluminium to be protected or thickened.' },
    { axis: 'Cost and fabrication', text: 'Cheap per kilogram and forgiving to weld and repair; a steel structure can be simpler to build even when it is heavier.' },
  ],
  properties: [
    { property: 'Density', value: '8,030 kg/m³ (8.03 g/cm³)', condition: 'Type 304/304L, room temperature', source: 'ss-304-data' },
    { property: 'Melting range', value: 'about 1,400 to 1,450 °C', condition: 'Type 304/304L', source: 'ss-304-data' },
    { property: 'Yield strength (minimum)', value: '205 MPa (30 ksi)', condition: 'Type 304, annealed, room temperature; cold work and cryogenic temperature raise it substantially', source: 'ss-304-data' },
  ],
  manufacturing:
    'Formed from sheet and tube, TIG or laser welded, and furnace brazed (nozzle tubes are brazed together into a bell); valve bodies and actuator parts are machined from bar and forgings; bellows are hydroformed from thin tube. Cold rolling raises strength for thin skins.',
  inspection:
    'Weld radiography, dye penetrant for surface cracks, helium leak tests of lines and bellows, cycle tests of bellows and actuators, and cleaning to oxygen-service standards (no oil or particles that could ignite in LOX).',
  question: {
    q: 'Steel is almost three times as dense as aluminium. Why would anyone build a rocket tank from it?',
    a: 'Because mass is only one requirement. Stainless steel stays tough when cryogenic, keeps its strength when hot (so less insulation or heat shielding is needed), is cheap and easy to weld and repair, and a thin steel skin can be stabilized by internal pressure, as the Atlas and Centaur balloon tanks were. Whether steel or aluminium gives the lighter vehicle depends on the temperatures the structure sees and on how much protection aluminium would need. The K-1 uses aluminium tanks and keeps steel for small parts where toughness, heat tolerance or fabrication matter most.',
  },
  sources: ['ss-304-data', 'nasa-centaur', 'nasa-sp125', 'sutton-rpe'],
};

export const GRCOP: MaterialDraft = {
  id: 'grcop',
  name: 'Copper-chromium-niobium alloys (GRCop-42 and GRCop-84)',
  family: 'Copper alloys',
  focus:
    'NASA-developed copper alloys strengthened by fine chromium-niobium (Cr₂Nb) particles. They line the K-1 combustion chambers because they conduct heat almost as well as pure copper yet keep their strength when hot. Key idea: in a cooled liner, conductivity is what protects the wall; it is not insulation.',
  suits:
    'The liner faces gas at about 3,500 to 3,700 K and, near the throat, heat fluxes of tens of megawatts per square metre. No metal survives that uncooled. Regenerative cooling works only if the heat crosses the thin wall into the fuel with a small temperature drop, and the drop across a wall is ΔT = q·t/k, so a high conductivity k keeps the hot face cool. GRCop-42 conducts 344 W/(m·K) at room temperature, close to pure copper (about 396), while its Cr₂Nb particles stop the grain growth and softening that make pure copper too weak at liner temperatures. It also resists the thermal fatigue caused by every start and shutdown, and it can be 3D printed with the coolant channels already inside.',
  limits:
    'Dense, like all copper alloys, and modest in strength compared with steels, so the liner is closed out by a structural jacket (a nickel superalloy in the K-1) that carries the pressure load. Its life is set by thermal fatigue and creep at the hot wall, and a loss of coolant flow melts it within moments. Hot oxygen-rich gas attacks copper (blanching), so the mixture next to the wall is kept fuel-rich.',
  elsewhere: [
    { text: 'NASA has printed and hot-fire tested copper-alloy combustion chambers with integral cooling channels, including GRCop chambers made by additive manufacturing.', source: 'nasa-am-chamber' },
    { text: 'Large staged-combustion engines such as the Space Shuttle main engine used an earlier copper alloy (NARloy-Z, copper-silver-zirconium) for their chamber liners, for the same reason; GRCop-42 conducts heat better.', source: 'nasa-grcop42-ellis' },
  ],
  compare: [
    { axis: 'Conductivity versus insulation', text: 'A cooled liner must conduct heat to the coolant, the opposite of a heat shield, which must block it. GRCop-42 conducts about 30 times better than Inconel 718 (344 versus about 11.4 W/(m·K)).' },
    { axis: 'Strength at temperature', text: 'Much better than pure copper, far below nickel superalloys: hence the superalloy jacket around it.' },
    { axis: 'Manufacturability', text: 'Machined channels closed out by electroforming or brazing, or printed directly with the channels inside.' },
  ],
  properties: [
    { property: 'Thermal conductivity', value: '344 W/(m·K)', condition: 'GRCop-42, room temperature', source: 'nasa-grcop42-ellis' },
    { property: 'Thermal conductivity', value: '280 W/(m·K)', condition: 'GRCop-84, room temperature', source: 'nasa-grcop42-ellis' },
    { property: 'Thermal conductivity (reference)', value: 'about 396 W/(m·K)', condition: 'Pure copper, room temperature', source: 'nasa-grcop42-ellis' },
  ],
  manufacturing:
    'Two routes. (1) The liner is turned from a forging, coolant channels are milled into its outer surface, and the channels are closed out by electroformed copper or a brazed jacket. (2) The liner is printed by laser powder-bed fusion with the channels inside, hot isostatically pressed to close porosity, and then jacketed with a superalloy.',
  inspection:
    'Flow tests of every coolant channel (each must pass its share of fuel), CT scanning or radiography of printed liners for trapped powder and porosity, proof pressure of the coolant circuit, and hot-fire acceptance tests. After firing, liners are checked for wall thinning and thermal-fatigue cracks.',
  question: {
    q: 'Why a conductive metal inside a hot engine but an insulating material on a heat shield?',
    a: 'Because they solve the heat problem in opposite ways. The engine liner has a coolant behind it: fuel flows through channels a millimetre or so behind the hot surface and carries the heat away continuously, so the liner must pass heat through with the smallest possible temperature drop. At an illustrative 30 MW/m² through a 1 mm wall, GRCop-42 (344 W/(m·K)) needs only about 87 K between its faces, while Inconel 718 (about 11.4 W/(m·K)) would need about 2,630 K, far above its melting point. A heat shield has no coolant behind it and must keep the structure cool for minutes, so it must block heat instead: low conductivity, plus ablation or re-radiation.',
  },
  closeup: 'cooling-channels',
  sources: ['nasa-grcop', 'nasa-grcop42-ellis', 'nasa-am-chamber', 'nasa-ntrs-cooled-chambers', 'sm-inconel-718', 'sutton-rpe'],
};

export const NICKEL_SUPERALLOY: MaterialDraft = {
  id: 'nickel-superalloy',
  name: 'Nickel superalloys (Inconel 718 and 625 class)',
  family: 'Nickel-base superalloys',
  focus:
    'Alloys designed to stay strong and to resist creep and oxidation while red hot. In the K-1 they make the turbine that drives the pumps, the gas generator, hot-gas manifolds, the structural jacket around the chamber liner, and the engine-bay heat shield.',
  suits:
    'The turbine is the hardest-working part of the engine: its blades spin at about 32,000 rpm (illustrative K-1 value) in hot gas-generator exhaust, under large centrifugal stress. Alloy 718 is precipitation hardened by nickel-niobium particles and keeps high strength and creep resistance from cryogenic temperature up to about 700 °C (1,300 °F), and its chromium forms a protective oxide. Alloy 625 is strengthened in solid solution instead, so it welds and brazes without cracking and resists oxidation and corrosion, which suits ducts, manifolds, bellows and heat-shield panels. The gas generator runs fuel-rich precisely so that its exhaust stays at a temperature these alloys can take.',
  limits:
    'Dense (about 8,200 to 8,400 kg/m³), expensive, slow to machine, and poor conductors of heat, so they are not used for a regeneratively cooled liner. Alloy 718 loses strength above about 700 °C; hotter turbines need single-crystal alloys or cooling. Some nickel alloys can burn in hot, high-pressure oxygen, so oxygen-rich turbine drives need special alloys or coatings.',
  elsewhere: [
    { text: 'Nickel superalloys, alloy 718 above all, are the main materials of large liquid-engine turbopumps, hot-gas ducts and manifolds, including those of the Space Shuttle main engine.', source: 'sutton-rpe' },
    { text: 'Alloy 718 is also a classic material for aircraft gas-turbine discs and shafts, which need the same strength at temperature.', source: 'sm-inconel-718' },
  ],
  compare: [
    { axis: 'Strength at temperature', text: 'Far above aluminium, titanium and stainless steel above about 500 °C.' },
    { axis: 'Oxidation resistance', text: 'Good: a chromium oxide layer protects the surface in hot gas.' },
    { axis: 'Conductivity', text: 'Low (about 11.4 W/(m·K) for 718 at room temperature): an advantage for a heat-shield panel, a fatal flaw for a cooled liner.' },
    { axis: 'Density', text: 'About three times aluminium; used only where heat demands it.' },
  ],
  properties: [
    { property: 'Density', value: '8,190 kg/m³ (8.19 g/cm³)', condition: 'Alloy 718, room temperature', source: 'sm-inconel-718' },
    { property: 'Service temperature range', value: '-252 to 704 °C (-423 to 1,300 °F)', condition: 'Alloy 718', source: 'sm-inconel-718' },
    { property: 'Thermal conductivity', value: 'about 11.4 W/(m·K)', condition: 'Alloy 718, room temperature', source: 'sm-inconel-718' },
    { property: 'Melting range', value: '1,260 to 1,336 °C', condition: 'Alloy 718', source: 'sm-inconel-718' },
    { property: 'Density', value: '8,440 kg/m³ (8.44 g/cm³)', condition: 'Alloy 625, room temperature', source: 'sm-inconel-625' },
  ],
  manufacturing:
    'Turbine discs and bladed discs are forged and machined (blade passages often by electrical-discharge machining); housings and manifolds are cast or welded from sheet, and 718 is solution treated and aged after welding to recover its strength. Complex manifolds and gas-generator parts are increasingly 3D printed in 718 or 625.',
  inspection:
    'Fluorescent penetrant and ultrasound of forgings, X-ray of castings and welds, spin tests of turbine wheels above operating speed, and borescope inspection of blades between firings.',
  question: {
    q: 'Why does the turbine need a different metal from the combustion-chamber liner, when both touch hot gas?',
    a: 'Because they are loaded differently. The liner is cooled from behind and has to pass heat through quickly, so it needs conductivity: a copper alloy. The turbine blade has no coolant; it sits in gas-generator exhaust and is flung outward at tens of thousands of rpm, so it needs strength and creep resistance at high temperature, which nickel superalloys provide. The gas generator runs fuel-rich to keep its exhaust cool enough for them.',
  },
  closeup: 'turbopump-section',
  sources: ['sm-inconel-718', 'sm-inconel-625', 'sutton-rpe', 'nasa-sp125'],
};

export const NIOBIUM_C103: MaterialDraft = {
  id: 'niobium-c103',
  name: 'Niobium alloy C-103 (Nb-10Hf-1Ti)',
  family: 'Refractory metals',
  focus:
    'A niobium alloy that works while glowing orange-white. It forms the nozzle extension of the K-1 upper-stage engine and the satellite apogee engine: parts cooled by radiating heat to space instead of by a coolant.',
  suits:
    'Far down a vacuum nozzle the gas has expanded and cooled, and the heat flux into the wall is a small fraction of that at the throat. A thin, uncooled skin can then reach equilibrium, radiating from its outer surface as much heat as it receives (q = ε·σ·T⁴). C-103 melts at about 2,350 °C, keeps useful strength when glowing above 1,000 °C, and, unlike most refractory metals, is ductile enough at room temperature to spin-form, weld and machine. It is only slightly denser than a nickel superalloy (8,850 kg/m³, against 8,190 kg/m³ for alloy 718), and it removes the plumbing and mass of a cooling circuit from the largest part of the engine.',
  limits:
    'Niobium oxidizes rapidly in hot oxidizing gas, so C-103 is always coated, typically with a fused silicide layer that grows a protective silica-rich scale. The coating has a limited life and can crack, and a damaged spot can burn through. Radiation can reject only a few tenths of a megawatt per square metre (about 0.33 MW/m² at 1,370 °C with an emissivity of 0.8), roughly a hundred times less than a throat receives, so C-103 cannot replace a cooled chamber. The glowing extension also heats whatever it can see, and its thin skin can be dented or cracked by vibration and handling.',
  elsewhere: [
    { text: 'Radiatively cooled niobium-alloy nozzle extensions and thrust chambers are widely used on upper-stage vacuum engines and on storable-propellant spacecraft thrusters and apogee engines.', source: 'sutton-rpe' },
  ],
  compare: [
    { axis: 'Temperature', text: 'Operates glowing at well over 1,000 °C, beyond nickel superalloys (about 700 °C for 718 under load).' },
    { axis: 'Oxidation', text: 'Poor unless coated: the silicide coating is essential, not cosmetic.' },
    { axis: 'Cooling approach', text: 'Radiation cooling (no coolant) here, versus regenerative cooling (fuel as coolant) in the GRCop liner: each suits a different heat flux.' },
    { axis: 'Formability', text: 'Unusually ductile for a refractory metal, so it can be spun into a large, thin bell.' },
  ],
  properties: [
    { property: 'Composition', value: 'niobium with about 10 % hafnium and 1 % titanium by weight', condition: 'C-103 (UNS R04295)', source: 'c103-data' },
    { property: 'Density', value: '8,850 kg/m³ (8.85 g/cm³)', condition: 'C-103, room temperature', source: 'c103-data' },
    { property: 'Melting point', value: 'about 2,350 °C', condition: 'C-103', source: 'c103-data' },
  ],
  manufacturing:
    'Sheet is spin-formed or rolled into the bell, joined by electron-beam or TIG welds in an inert atmosphere (hot niobium absorbs oxygen and nitrogen and becomes brittle), stiffened with rings, then slurry-coated with the silicide and fused in a vacuum furnace. The extension bolts to a flange at the end of the regeneratively cooled nozzle.',
  inspection:
    'Visual and magnified inspection of the coating for cracks and bare spots, thickness checks, X-ray of welds, and hot-fire testing. Coating damage from handling must be repaired before flight.',
  question: {
    q: 'Why can the upper-stage nozzle extension be cooled just by glowing, when the combustion chamber cannot?',
    a: 'Because the heat flux is very different. In the chamber and throat the gas is dense and hot, and the wall receives tens of megawatts per square metre. A surface can radiate away only q = ε·σ·T⁴: at 1,370 °C with an emissivity of 0.8 that is about 0.33 MW/m², roughly a hundred times too little, so the chamber needs fuel cooling. Far down the extension the gas has expanded to low pressure and temperature, the flux falls to what radiation can reject, and a thin coated niobium skin simply glows at equilibrium.',
  },
  sources: ['c103-data', 'sutton-rpe', 'nasa-sp125'],
};

export const TITANIUM: MaterialDraft = {
  id: 'titanium',
  name: 'Titanium alloys (Ti-6Al-4V class)',
  family: 'Titanium alloys',
  focus:
    'As strong as many steels at a little over half their density, and tolerant of heat that would soften aluminium. In the K-1: grid fins, COPV liners and high-pressure lines, engine mount fittings, the fuel-pump impeller, and spacecraft propellant tanks.',
  suits:
    'Annealed Ti-6Al-4V has a yield strength of at least 827 MPa at a density of 4,430 kg/m³, one of the best strength-to-weight ratios among structural metals, and it keeps useful strength at several hundred °C. That suits grid fins: they sit in hot, fast flow during entry and must keep steering without an ablative coating, and a one-piece titanium lattice can be reused flight after flight. Titanium resists corrosion and is compatible with helium, nitrogen and storable propellants, so it makes thin, strong gas-tight liners and propellant tanks, and compact, highly loaded fittings where loads concentrate, such as engine mounts.',
  limits:
    'Expensive and slow to machine, and reactive when hot: it must be welded under inert gas, and it can ignite on impact in liquid or high-pressure oxygen, so it is kept out of LOX service. Its stiffness (about 114 GPa) is about 1.6 times that of aluminium for about 1.6 times the density, so for stiffness-limited panels it gains little. It oxidizes and weakens at the temperatures where nickel superalloys still work.',
  elsewhere: [
    { text: 'Space Shuttle orbiters stored helium and nitrogen in Kevlar-overwrapped pressure vessels with titanium liners.', source: 'nasa-copv-primer' },
    { text: 'Spacecraft tanks for hydrazine and nitrogen tetroxide are commonly titanium, for strength, low mass and propellant compatibility.', source: 'sutton-rpe' },
  ],
  compare: [
    { axis: 'Strength to weight', text: 'Among the best of the structural metals: yield at least 827 MPa at 4,430 kg/m³, about 35 % more yield strength per kilogram than 2219-T87, and useful at temperatures where aluminium is not.' },
    { axis: 'Heat tolerance', text: 'Useful to several hundred °C, far beyond aluminium, below nickel superalloys.' },
    { axis: 'Stiffness', text: 'About 114 GPa: stiffer than aluminium, but not per kilogram.' },
    { axis: 'Oxygen compatibility', text: 'Poor in liquid or high-pressure oxygen (can ignite on impact); excellent with helium, nitrogen and storable propellants.' },
  ],
  properties: [
    { property: 'Density', value: '4,430 kg/m³ (4.43 g/cm³)', condition: 'Ti-6Al-4V, room temperature', source: 'ati-ti64' },
    { property: 'Elastic modulus', value: 'about 114 GPa', condition: 'Ti-6Al-4V, room temperature', source: 'ati-ti64' },
    { property: 'Yield strength (minimum)', value: '827 MPa (120 ksi)', condition: 'Ti-6Al-4V sheet and plate, annealed, room temperature', source: 'ams-4911' },
  ],
  manufacturing:
    'Grid fins are cast or forged as one piece and machined; COPV liners are spun or deep-drawn and welded under inert gas, then overwrapped; spherical tanks are forged hemispheres welded at the equator; fittings are machined from forgings. Chemical milling removes the brittle oxygen-enriched surface layer (alpha case) left by hot working.',
  inspection:
    'Ultrasound of forgings and castings, X-ray of welds, penetrant inspection, and for reused grid fins, visual and dimensional checks after each flight for heat discolouration, erosion and cracks.',
  question: {
    q: 'Why make grid fins from titanium rather than aluminium?',
    a: 'During entry the fins sit in hot, fast flow, and their thin lattice members heat up quickly. Aluminium alloys lose much of their strength above roughly 150 °C, so aluminium fins would need an ablative coating that is consumed and must be reapplied after each flight. Titanium keeps its strength at several hundred °C and is strong for its weight, so a one-piece titanium fin survives entry uncoated and can be reused. The price is cost and a heavier fin than an aluminium one of the same size: mass and money traded for reusability.',
  },
  closeup: 'grid-fin-lattice',
  sources: ['ati-ti64', 'ams-4911', 'nasa-copv-primer', 'sutton-rpe'],
};
