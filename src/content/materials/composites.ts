/**
 * Composites, cores and textiles of the K-1: carbon-fibre sandwich, COPVs, honeycomb cores and
 * parachute textiles. The sandwich stiffness example is recomputed from FAIRING in spec.ts by
 * src/content/materials/materials.test.ts.
 */
import type { MaterialDraft } from './draft';

export const CFRP_SANDWICH: MaterialDraft = {
  id: 'cfrp-sandwich',
  name: 'Carbon-fibre composite sandwich (CFRP face sheets on honeycomb core)',
  family: 'Polymer-matrix composites',
  focus:
    'Two thin skins of carbon-fibre-reinforced plastic bonded to a light core: an I-beam spread over a surface. It forms the K-1 interstage, fairing, payload adapter, landing-leg struts and many spacecraft panels. Key ideas: anisotropy, face sheets versus core, and why hidden flaws are hard to find.',
  suits:
    'Carbon fibres are extremely strong and stiff along their length (a standard fibre such as T700S: 4,900 MPa and 230 GPa at 1,800 kg/m³), but a composite is only as good as the direction of its fibres. Along them a laminate is stronger than steel per kilogram; across them the load must pass through the epoxy, which is many times weaker. Designers stack plies at 0°, ±45° and 90° to match the loads. In a sandwich the face sheets carry bending as tension and compression while the core keeps them apart and carries shear; because bending stiffness grows with the square of the skin separation, a light core buys a very large gain. The K-1 fairing panel (1.2 mm skins on a 25 mm core) is about 150 times stiffer in bending than a solid laminate of the same mass (see the honeycomb core entry). High stiffness per kilogram is what a fairing, an interstage or an array panel needs to resist acoustic, aerodynamic and handling loads without heavy ribs, and the low thermal expansion of carbon fibre keeps antenna reflectors and array substrates in shape.',
  limits:
    'Weak across the fibres and between plies. An impact can crush the core or split plies inside the panel with little or no visible mark, and face sheets can disbond from the core. The epoxy matrix limits the service temperature to well below that of metals and absorbs some moisture, so composites near engines need thermal protection. Composites do not yield like metals: they fail with little warning, so joints, cut-outs and fittings need careful design and testing.',
  elsewhere: [
    { text: 'NASA’s Composites for Exploration Upper Stage project designed and tested large composite dry structures (skirts and intertanks) for launch-vehicle upper stages.', source: 'nasa-ceus' },
  ],
  compare: [
    { axis: 'Anisotropy', text: 'Along the fibres: stronger than steel per kilogram. Across the fibres and between plies: governed by the resin and many times weaker.' },
    { axis: 'Stiffness per mass', text: 'Sandwich construction gives the highest bending stiffness per kilogram of any practical panel.' },
    { axis: 'Temperature', text: 'Limited by the epoxy matrix, far below metals.' },
    { axis: 'Inspectability', text: 'Harder than metals: damage can be internal and invisible, whereas a metal panel dents and yields visibly.' },
    { axis: 'Thermal expansion', text: 'Very low along the fibres, which keeps precision structures in shape as they heat and cool.' },
  ],
  properties: [
    { property: 'Fibre tensile strength', value: '4,900 MPa', condition: 'T700S carbon fibre (fibre alone, not a laminate), room temperature', source: 'toray-t700s' },
    { property: 'Fibre tensile modulus', value: '230 GPa', condition: 'T700S carbon fibre, room temperature', source: 'toray-t700s' },
    { property: 'Fibre density', value: '1,800 kg/m³ (1.80 g/cm³)', condition: 'T700S carbon fibre', source: 'toray-t700s' },
  ],
  manufacturing:
    'Face sheets are laid up from carbon tape or fabric pre-impregnated with epoxy (by hand or by automated fibre placement) on a mould in a designed ply sequence, vacuum-bagged, and cured under heat and pressure in an autoclave (or out of autoclave). The honeycomb core is bonded between the skins with film adhesive, in one co-cure or in a second bonding cure, and inserts are potted into the core wherever bolts will go. Edges are closed out with doublers, and the part is trimmed and drilled with diamond tooling.',
  inspection:
    'Non-destructive inspection (NDI): ultrasound (through-transmission or pulse-echo) maps disbonds, delaminations and porosity; infrared thermography reveals flaws below the surface by how they disturb the spread of heat; tap testing finds gross disbonds. Because hidden impact damage is the main risk, parts are designed to be damage tolerant and are re-inspected after any suspected impact.',
  question: {
    q: 'Why is a composite strong in one direction and weaker in another?',
    a: 'Because its strength comes from fibres, and a fibre carries load only along its length. Pull along the fibres and thousands of carbon filaments, each stronger than steel, share the load. Pull across them and the load has to pass through the epoxy between the fibres and through the fibre-resin interface, which are many times weaker. That is anisotropy. Designers turn it into an advantage by laying plies in the directions the loads actually run, but it also means a laminate can split between its plies when loaded in a way the layup did not anticipate.',
  },
  closeup: 'fairing-sandwich',
  sources: ['toray-t700s', 'hexcel-honeycomb', 'nasa-ceus'],
};

export const CFRP_COPV: MaterialDraft = {
  id: 'cfrp-copv',
  name: 'Composite overwrapped pressure vessels (COPVs)',
  family: 'Polymer-matrix composites',
  focus:
    'High-pressure gas bottles made of a thin metal liner wound with carbon fibre in epoxy. The K-1 stores its helium pressurant and its cold-gas nitrogen in COPVs. Key idea: the overwrap carries the hoop load; the liner seals.',
  suits:
    'The wall of a pressure vessel carries hoop stress σ = p·r/t, the largest stress in any pressurized cylinder. Carbon fibre wound around the bottle carries that tension along its strong direction, at a fraction of the mass of an all-metal bottle. The thin titanium (or aluminium) liner makes the vessel gas-tight, because fibre and resin alone would let helium seep through. During manufacture the vessel is pressurized once beyond its working pressure (autofrettage): the liner yields slightly and is left in compression when empty, which extends its fatigue life. Storing helium cold, as the K-1 does with bottles inside its LOX tank, packs more gas into each bottle.',
  limits:
    'Under sustained high stress a composite overwrap can fail suddenly after a long time (stress rupture), so COPVs are derated and their pressure history is tracked. Impact damage can be invisible yet weaken the overwrap, and a liner flaw can leak. A COPV submerged in LOX needs special qualification: the oxygen compatibility of the overwrap, and the stresses of loading helium at cryogenic temperature.',
  elsewhere: [
    { text: 'Space Shuttle orbiters used Kevlar-overwrapped, titanium-lined vessels for helium and nitrogen; NASA’s long-term stress-rupture work on those vessels shaped today’s COPV requirements.', source: 'nasa-copv-primer' },
  ],
  compare: [
    { axis: 'Mass', text: 'Much lighter than an all-metal bottle of the same pressure and volume.' },
    { axis: 'Load sharing', text: 'Overwrap: hoop and axial tension. Liner: gas-tightness and a smaller share of the load.' },
    { axis: 'Failure modes', text: 'Stress rupture and hidden impact damage in the composite; fatigue cracks and leaks in the liner.' },
  ],
  properties: [],
  manufacturing:
    'The liner is spun, deep-drawn or machined and welded, then filament-wound: a machine lays resin-wetted carbon tow in hoop and helical patterns under controlled tension. After curing, each vessel is autofrettaged, proof-tested and leak-tested.',
  inspection:
    'Proof-pressure and helium leak tests, visual inspection for impact marks, and on critical vessels, acoustic-emission monitoring while pressurizing. A vessel that has been dropped or struck is scrapped, because the damage may not be visible.',
  question: {
    q: 'In a COPV, which part holds the pressure: the metal liner or the composite?',
    a: 'Mostly the composite. The carbon fibres wound around the bottle carry the hoop tension, the largest stress in a pressurized cylinder, along their strong direction. The liner is thin; its main job is to seal the gas, which fibre and resin alone cannot do. That is why damage to the overwrap is serious even when the liner is perfect.',
  },
  sources: ['nasa-copv-primer'],
};

export const HONEYCOMB_CORE: MaterialDraft = {
  id: 'honeycomb-core',
  name: 'Honeycomb core (aluminium and aramid)',
  family: 'Sandwich cores',
  focus:
    'Hexagonal cells of thin aluminium foil (or aramid paper), mostly empty space. The core holds the face sheets of a sandwich apart and carries shear between them. In the K-1 it is the core of the fairing and the insulating core of the upper-stage common bulkhead.',
  suits:
    'A core has to keep two stiff skins a fixed distance apart and pass shear between them while adding little mass: standard aluminium honeycomb starts at about 50 kg/m³ (3.1 lb/ft³). Because the bending stiffness of a sandwich grows with the square of the skin separation, a thick, light core gives an enormous stiffness gain (see the question). In a common bulkhead the honeycomb also insulates: its cells are mostly gas (or vacuum in flight), so it slows heat flow from the RP-1 side to the LOX side and keeps the RP-1 from getting too cold. Crushed on purpose, honeycomb also absorbs energy at a steady, predictable force, which is why it is used in landing-leg foot pads.',
  limits:
    'Weak in the plane of the panel and under point loads: bolts need potted inserts. Face-to-core bonds can disbond, and aluminium cores corrode if moisture gets into the cells. Trapped air must be vented as the vehicle climbs. Damage and disbonds are hidden inside the panel.',
  elsewhere: [
    { text: 'The Apollo command modules and the first Orion heat shield used a fibreglass-phenolic honeycomb as a carrier, with each cell filled by hand with Avcoat ablator.', source: 'nasa-ablators' },
  ],
  compare: [
    { axis: 'Stiffness per mass', text: 'Turns two thin skins into a stiff panel for very little added mass.' },
    { axis: 'Insulation', text: 'Mostly gas: a useful insulator in a common bulkhead.' },
    { axis: 'Point loads', text: 'Weak; needs inserts wherever something is bolted on.' },
  ],
  properties: [{ property: 'Density (lightest standard aluminium core)', value: 'about 50 kg/m³ (3.1 lb/ft³)', condition: '5052 aluminium honeycomb, nominal', source: 'hexcel-honeycomb' }],
  manufacturing:
    'Aluminium foil is printed with lines of adhesive, stacked and cured into a block, sliced to thickness, and pulled open like a paper lantern into hexagonal cells. The expanded core is machined to the panel shape and bonded between face sheets with film adhesive under heat and pressure.',
  inspection:
    'Ultrasound and thermography for disbonds and crushed core, tap tests, and seal and humidity checks to keep moisture (and corrosion) out of the cells.',
  question: {
    q: 'Why does putting mostly empty space between two skins make a panel so much stiffer?',
    a: 'Because bending stiffness depends on how far the load-carrying material sits from the middle of the panel. Bending stretches one skin and compresses the other; the farther apart they are, the longer the lever arm, and the stiffness grows with the square of the separation. The K-1 fairing uses 1.2 mm carbon skins on a 25 mm core. With illustrative densities of 1,600 kg/m³ for the skins and 50 kg/m³ for the core, the panel weighs 5.09 kg/m², the same as a solid carbon laminate 3.18 mm thick, yet it is about 150 times stiffer in bending. The core only has to hold the skins apart and carry shear, which honeycomb does at very low density.',
  },
  closeup: 'fairing-sandwich',
  sources: ['hexcel-honeycomb', 'nasa-ablators'],
};

export const TEXTILES: MaterialDraft = {
  id: 'textiles',
  name: 'Parachute textiles (nylon canopies, aramid lines and risers)',
  family: 'Textiles and fibres',
  focus:
    'Woven and braided polymer fibres. Nylon makes the capsule parachute canopies; aramid (Kevlar class) makes the suspension lines, risers and reefing lines. Key ideas: strength per kilogram, energy absorption, and heat tolerance next to a capsule still hot from entry.',
  suits:
    'A parachute must pack into a small bag, open in a fraction of a second at high speed, and survive a violent opening shock. Nylon is strong and light and stretches a little; that stretch absorbs energy and softens the opening load, and the cloth can be woven with a controlled air permeability. Para-aramid fibre (1,440 kg/m³, tensile strength around 3,000 MPa) is several times stronger than steel wire for its weight and barely stretches, so it carries the concentrated loads in lines and risers. It does not melt; it decomposes only at about 427 to 482 °C, which matters for risers that may touch the hot capsule. Reefing lines hold each main canopy partly closed at first, so it opens in stages and the peak load stays within what the textiles and the capsule can take.',
  limits:
    'Nylon melts at a few hundred °C and weakens well below that, and it degrades in ultraviolet light, so canopies stay packed until use and are inspected or replaced afterwards. Aramid is damaged by ultraviolet light, abrasion and sharp bends, and absorbs moisture. Textile strength scatters from lot to lot and seam to seam, so parachutes carry large safety factors and are proven by drop tests, not by analysis alone.',
  elsewhere: [
    { text: 'NASA’s Orion capsule uses nylon canopies with Kevlar suspension lines and risers, and textile reefing that lets its main parachutes open in stages.', source: 'nasa-spinoff-orion-chutes' },
  ],
  compare: [
    { axis: 'Strength per mass', text: 'Aramid lines: far stronger than steel wire per kilogram. Nylon: strong and elastic.' },
    { axis: 'Stretch', text: 'Nylon stretches and absorbs shock; aramid barely stretches and carries load precisely.' },
    { axis: 'Heat', text: 'Aramid chars instead of melting; nylon melts, so it is kept away from hot surfaces.' },
  ],
  properties: [
    { property: 'Density', value: '1,440 kg/m³ (1.44 g/cm³)', condition: 'Para-aramid (Kevlar) fibre', source: 'dupont-kevlar' },
    { property: 'Tensile strength', value: 'about 3,000 MPa', condition: 'Para-aramid yarn, room temperature', source: 'dupont-kevlar' },
    { property: 'Decomposition temperature', value: 'about 427 to 482 °C (does not melt)', condition: 'Para-aramid fibre, in air', source: 'dupont-kevlar' },
  ],
  manufacturing:
    'Canopy cloth is woven to a specified weight and air permeability, cut into gores and sewn with reinforcing tapes; lines are braided and spliced; every seam follows a stitch pattern tested for strength. Each parachute is packed by hand under pressure into its bag following a controlled procedure, with its reefing lines and their pyrotechnic line cutters.',
  inspection:
    'Lot tests of the materials (tensile strength, permeability), seam strength tests, inspection of every packed parachute, and system drop tests from aircraft that verify opening loads and descent rates. After a water landing the textiles are washed, dried and inspected, or scrapped.',
  question: {
    q: 'Why do the main parachutes open in stages instead of all at once?',
    a: 'Because a canopy that opens fully at high speed produces a huge opening shock: the drag force jumps as the canopy fills, and it could tear the fabric or overload the capsule and its crew. A reefing line around the skirt of the canopy holds it partly closed at first (the reefed state in the capsule missions), so the capsule slows with a smaller canopy; then a cutter severs the line and the canopy opens fully at a lower speed, where full drag is safe. The textiles are sized for the peak load, so staging the opening saves mass.',
  },
  sources: ['knacke-parachutes', 'dupont-kevlar', 'nasa-spinoff-orion-chutes'],
};
