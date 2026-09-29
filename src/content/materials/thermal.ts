/**
 * Thermal protection and insulation: charring ablators, reusable ceramic tiles, multilayer
 * insulation, and spray-on foam (shown for comparison: not used on the K-1 booster).
 */
import type { MaterialDraft } from './draft';

export const ABLATOR: MaterialDraft = {
  id: 'ablator',
  name: 'Charring ablators (PICA and Avcoat class)',
  family: 'Ablative thermal protection',
  focus:
    'A heat shield that works by being consumed. Its resin decomposes (pyrolysis), leaving a porous carbon char; the gases released blow into the boundary layer and block heat, and the surface slowly recedes. It protects the K-1 crew capsule during entry.',
  suits:
    'During entry the capsule’s kinetic energy becomes heat in the shock layer ahead of it, and the shield must keep the structure behind it near room temperature for several minutes. A charring ablator handles that heat in four ways: the decomposition of its resin absorbs energy (pyrolysis is endothermic); the pyrolysis gases absorb more as they heat up while percolating out through the char; those gases then blow into the boundary layer and thicken it, which cuts the heat reaching the surface (blowing); and the hot char surface re-radiates. The untouched material underneath conducts heat poorly, so the heat front advances slowly. Low-density ablators such as PICA (about 270 kg/m³) handle very high heat flux for their mass.',
  limits:
    'Single use: the shield is charred and partly eroded after one entry and is replaced. Recession slightly changes the shape, and the thickness must include margin for recession and char depth, which costs mass. Low-density ablators are soft and easily damaged on the ground, and large shields are built from tiles or blocks whose seams and gap fillers are weak points.',
  elsewhere: [
    { text: 'PICA protected NASA’s Stardust sample-return capsule during the fastest Earth entry of any spacecraft, about 12.9 km/s, in 2006.', source: 'nasa-pica-sustain' },
    { text: 'Avcoat (silica fibres in an epoxy-novolac resin, filled into a fibreglass honeycomb) protected the Apollo command modules and was reformulated for Orion.', source: 'nasa-ablators' },
  ],
  compare: [
    { axis: 'How it handles heat', text: 'Consumes itself to stop heat. Ceramic tiles re-radiate and insulate without being consumed.' },
    { axis: 'Reuse', text: 'Single use; reusable tiles can fly many times with inspection and repair.' },
    { axis: 'Conductivity', text: 'Low: an insulator, the opposite of the conductive engine liner.' },
    { axis: 'Density', text: 'Low-density ablators (PICA about 270 kg/m³) for high heat flux at low mass; denser, tougher ablators (Avcoat class) where durability matters more.' },
  ],
  properties: [{ property: 'Density', value: 'about 270 kg/m³ (0.27 g/cm³)', condition: 'PICA, virgin (uncharred) material', source: 'nasa-pica-sustain' }],
  manufacturing:
    'PICA: a carbon-fibre preform (a stiff felt) is impregnated with phenolic resin and cured, then machined into tiles that are bonded to the carrier structure with gap fillers between them. Avcoat class: an empty fibreglass-phenolic honeycomb is bonded to the structure and each cell is filled with ablator, then cured and machined to shape (Apollo, first Orion), or the ablator is cast in blocks and bonded on (later Orion).',
  inspection:
    'Density and thickness checks, X-ray and CT for voids, ultrasound of bond lines, and arc-jet tests of samples to measure recession and char depth. After flight, cores cut from the recovered shield show the real char depth for comparison with predictions.',
  question: {
    q: 'Why can a heat shield be allowed to burn away?',
    a: 'Because burning away is how it works. Each gram of ablator that decomposes absorbs energy, the gas it releases carries heat outward and blows into the boundary layer, shielding the surface, and the char layer re-radiates. As long as the virgin layer never burns through and the bond line behind it stays cool, losing a few millimetres is the design working. The cost is that the shield must be replaced after every flight.',
  },
  closeup: 'heat-shield-stack',
  sources: ['nasa-ablators', 'nasa-pica-sustain'],
};

export const CERAMIC_TILES: MaterialDraft = {
  id: 'ceramic-tiles',
  name: 'Reusable ceramic tiles and flexible ceramic insulation (silica class)',
  family: 'Reusable thermal protection',
  focus:
    'Rigid tiles of very pure silica fibres, mostly empty space, that insulate so well that one face can glow while the other stays warm to the touch. On the K-1 they protect the capsule backshell, and a flexible ceramic blanket insulates the booster engine bay.',
  suits:
    'Silica conducts heat poorly and hardly expands when heated, so a tile does not crack when one face is suddenly heated. The tile is more than 90 % empty space (LI-900: about 144 kg/m³, against about 2,200 kg/m³ for solid silica glass), which slows conduction further. A dark, high-emittance glaze re-radiates much of the heat from the hot face. Unlike an ablator, the tile is not consumed, so it can fly again. The backshell sees much less heating than the heat shield, which is why reusable tiles are enough there.',
  limits:
    'Brittle: tiles crack or chip on impact (hail, debris, handling) and their glaze scratches. Silica barely expands while the structure under it expands and flexes, so a tile bonded directly would crack; each tile sits on a strain isolation pad, a felt that lets the structure move beneath it. Many individually shaped tiles need gap fillers and inspection after every flight, so reuse is not free. Silica tiles also have a temperature limit, and the hottest regions need other materials.',
  elsewhere: [
    { text: 'The Space Shuttle orbiter was covered with LI-900 silica tiles bonded through Nomex felt strain isolation pads with RTV silicone; every flight was followed by tile inspection and repair.', source: 'nasa-orbiter-tps' },
    { text: 'On the Columbia mission a foam strike damaged the wing leading edge (reinforced carbon-carbon, not tiles); the investigation showed how thermal protection damage invisible at launch can be fatal at entry.', source: 'caib-report' },
  ],
  compare: [
    { axis: 'Insulation versus conduction', text: 'Very low conductivity: it blocks heat. The engine liner does the opposite.' },
    { axis: 'Reuse', text: 'Reusable with inspection; ablators are single use.' },
    { axis: 'Toughness', text: 'Brittle ceramic with poor impact resistance.' },
    { axis: 'Thermal expansion', text: 'Very low: resists thermal shock, but mismatched with the structure, hence the strain isolation pad.' },
  ],
  properties: [{ property: 'Density', value: 'about 144 kg/m³ (9 lb/ft³)', condition: 'LI-900 silica tile, as flown on the Space Shuttle orbiter', source: 'nasa-orbiter-tps' }],
  manufacturing:
    'High-purity silica fibres are mixed into a slurry, cast into blocks, dried and sintered, and machined into individually shaped tiles. The hot face is glazed with a black borosilicate coating and the tile is waterproofed. Each tile is bonded to a Nomex felt strain isolation pad, which is bonded to the structure with RTV silicone; gaps between tiles are filled with ceramic-fibre fillers. Flexible ceramic blankets are quilted from ceramic-fibre batting between ceramic cloths.',
  inspection:
    'Visual inspection of every tile after flight for cracks, chips and glaze damage; bond pull tests on sample tiles; tap and ultrasonic checks of bonds; repair or replacement of damaged tiles; re-waterproofing.',
  question: {
    q: 'Why is each tile glued onto a felt pad instead of straight onto the capsule?',
    a: 'Because the tile and the structure move differently. Silica barely expands when heated, while the metal or composite backshell expands, contracts and flexes under load. A rigid bond would force the brittle tile to follow those strains, and it would crack. The strain isolation pad, a soft felt between tile and structure, takes up the difference so the tile floats on it.',
  },
  sources: ['nasa-reusable-tps', 'nasa-orbiter-tps', 'caib-report'],
};

export const MLI: MaterialDraft = {
  id: 'mli',
  name: 'Multilayer insulation (MLI)',
  family: 'Spacecraft thermal control',
  focus:
    'Blankets of many thin metallized plastic films separated by netting. In vacuum there is no air to conduct or carry heat, so radiation is the main path, and MLI blocks it layer by layer. It wraps the K-1 satellite and the capsule service module.',
  suits:
    'In vacuum, surfaces exchange heat mainly by thermal radiation. A thin vapour-deposited aluminium coating on polyimide or polyester film has a low emittance: it emits little and reflects most of what arrives. Each film in the stack becomes a radiation shield floating at an intermediate temperature; with N identical shields between two surfaces the radiated heat falls roughly to 1/(N + 1) of the unshielded value. The netting spacers keep the films from touching, so conduction between them stays small. The blanket shields the spacecraft from direct sunlight on one side and from the cold of deep space on the other, and keeps the equipment inside within its temperature range.',
  limits:
    'Works only in vacuum: on the ground, gas conduction between the layers ruins its performance. Compression at seams, fasteners and edges creates conduction paths, so installed blankets perform several times worse than the ideal layer count predicts. The outer film must survive atomic oxygen and ultraviolet light in low orbit, and blankets must be vented so trapped air escapes during ascent.',
  elsewhere: [
    { text: 'MLI blankets flew on Spacelab and on the Long Duration Exposure Facility; NASA’s guidelines record how their outer films degraded in low Earth orbit.', source: 'nasa-mli-guidelines' },
  ],
  compare: [
    { axis: 'Radiation versus conduction', text: 'Stops radiation, the dominant path in vacuum. Foam stops conduction and convection, the dominant paths in air.' },
    { axis: 'Environment', text: 'Excellent in vacuum, poor in air: the reverse of spray-on foam.' },
    { axis: 'Mass', text: 'Very light: a stack of thin films and nets.' },
  ],
  properties: [],
  manufacturing:
    'Films are cut from rolls, stacked with netting, stitched or tagged together at the edges, fitted with hook-and-loop or button fasteners, electrically grounded (to bleed off static charge), perforated for venting, and tailored by hand to the spacecraft. The outer layer is a tougher film, often a polyimide, sometimes with a protective coating.',
  inspection:
    'Visual checks for tears and compressed areas, grounding checks, and thermal-vacuum testing of the whole spacecraft, which measures how well the installed blankets really perform.',
  question: {
    q: 'Why does a spacecraft wrap itself in shiny foil instead of thick foam?',
    a: 'Because in vacuum there is no air to conduct or carry heat: almost all heat moves by radiation. Foam insulates on the ground by trapping still air; in space its bulk would add mass without stopping radiation well. Shiny, low-emittance films each reflect most incoming radiation and emit little, and every extra layer adds another barrier, so a thin, light blanket does the job.',
  },
  sources: ['nasa-mli-guidelines'],
};

export const CRYO_FOAM: MaterialDraft = {
  id: 'cryo-foam',
  name: 'Spray-on foam insulation (SOFI)',
  family: 'Cryogenic insulation',
  focus:
    'Closed-cell polyurethane-type foam sprayed onto cryogenic tanks. It is not used on the K-1 booster; it is shown for comparison with long-duration cryogenic stages and with the Space Shuttle external tank.',
  suits:
    'On the ground, heat reaches a cryogenic tank by conduction and convection from the surrounding air, and moisture condenses and freezes on a bare cold wall. A few centimetres of closed-cell foam, whose cells trap still gas, cut conduction, stop convection at the wall, limit boil-off and keep ice from forming. That matters most for liquid hydrogen (20 K) and for stages that must hold cryogenic propellant for a long time.',
  limits:
    'Foam adds mass, can crack or shed pieces under vibration, aerodynamic load and thermal cycling, and is hard to inspect for internal voids. Shed foam was a debris hazard on the Space Shuttle. The K-1 booster flies with bare aluminium LOX walls instead: the time between loading and launch is short, LOX at 90 K is far less demanding than hydrogen, the LOX is topped up as it boils off on the pad, the frost that forms falls away early in flight, and there is no foam to shed.',
  elsewhere: [
    { text: 'The Space Shuttle external tank was covered with spray-on foam, machine-sprayed over the large acreage and hand-sprayed on closeouts, to limit boil-off and prevent ice.', source: 'caib-report' },
    { text: 'In 2003 foam from the external tank’s bipod ramp struck the leading edge of Columbia’s left wing during ascent; the damage led to the loss of the orbiter and its crew during entry.', source: 'caib-report' },
  ],
  compare: [
    { axis: 'Conduction and convection versus radiation', text: 'Foam controls conduction and convection in air; MLI controls radiation in vacuum.' },
    { axis: 'Use on this vehicle', text: 'Not used on the K-1 booster (short hold, LOX rather than hydrogen); frost forms instead.' },
    { axis: 'Durability', text: 'Can crack and shed debris; bare metal cannot.' },
  ],
  properties: [],
  manufacturing:
    'Sprayed by automated guns over large areas and by hand on complex closeouts, in controlled temperature and humidity, then trimmed to thickness. Process control (surface cleanliness, spray passes, timing) decides whether voids form.',
  inspection:
    'Thickness and density checks, adhesion tests on witness panels sprayed alongside the tank, and imaging methods adopted after the Columbia accident to look for voids in critical closeouts. Hidden voids remain the main difficulty.',
  question: {
    q: 'Why does the K-1 booster fly with frost on its LOX tank instead of foam insulation?',
    a: 'Because foam solves a problem the booster barely has. Foam limits boil-off and ice on tanks that hold very cold propellant for a long time, especially liquid hydrogen. The K-1 loads its LOX shortly before launch and tops it up as it boils off, so a little extra boil-off costs nothing, and the thin frost layer falls away early in flight. Leaving the foam off saves its mass and removes a source of debris.',
  },
  sources: ['caib-report'],
};
