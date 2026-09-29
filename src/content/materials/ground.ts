/** Ground hardware materials (launch pad and tower). */
import type { MaterialDraft } from './draft';

export const STRUCTURAL_STEEL: MaterialDraft = {
  id: 'structural-steel',
  name: 'Structural carbon steel (hot-rolled sections, painted or galvanized)',
  family: 'Steels',
  focus:
    'Ordinary carbon and low-alloy steel sections (beams, angles, tubes, plate) bolted and welded into towers, frames and tanks. On this pad: the service tower and its arms, the frame of the launch mount, and the elevated water tank and piping of the deluge system. On the ground mass hardly matters, so the cheapest stiff, strong, weldable material wins.',
  suits:
    'High stiffness (about three times aluminium), good strength, easy to cut, weld and bolt, cheap per kilogram, and backed by a century of design codes. A tower must stay stiff in hurricane-force wind, hold umbilical arms and a crew access arm precisely, and carry cables, pipes and an elevator: exactly what steel frames do in buildings and bridges.',
  limits:
    'Heavy, which is irrelevant on the ground but rules it out for the flight structure. Plain carbon steel rusts quickly in salt air, so pad steel is hot-dip galvanized (the zinc corrodes first and protects the steel beneath) or painted, and inspected. It loses much of its strength when heated to several hundred degrees Celsius, so steel near the plume is set back, shielded or wetted by the deluge. Below a transition temperature ordinary carbon steels become brittle, which is why cryogenic tanks and lines use austenitic stainless steel instead.',
  elsewhere: [{ text: 'Launch towers and service structures worldwide are steel frames designed with building and bridge codes, protected against coastal corrosion.', source: 'aisc-360' }],
  compare: [
    { axis: 'Stiffness', text: 'About 200 GPa: roughly three times aluminium, so a steel frame deflects little under wind and arm loads.' },
    { axis: 'Mass', text: 'About 7,850 kg/m³. A flight structure cannot afford it; a tower does not care.' },
    { axis: 'Cryogenic toughness', text: 'Poor for plain carbon steels (brittle when very cold): cryogenic service needs stainless steel or aluminium.' },
    { axis: 'Corrosion', text: 'Rusts in salt air unless galvanized or painted; coatings are part of the maintenance plan.' },
    { axis: 'Cost and fabrication', text: 'The cheapest structural metal, cut, drilled, welded and bolted with standard shop methods.' },
  ],
  properties: [{ property: 'Elastic modulus', value: 'about 200 GPa', condition: 'Carbon structural steel, room temperature', source: 'aisc-360' }],
  manufacturing:
    'Rolled sections are cut, drilled and welded into modules in a shop, galvanized or painted, then bolted together on site; a tower is erected module by module with cranes.',
  inspection: 'Weld inspection (visual, ultrasonic), bolt torque checks, coating surveys for corrosion after every launch season, and checks of arms and hinges for wear and blast damage.',
  question: {
    q: 'If steel is so much heavier than aluminium, why is the launch tower steel while the rocket is aluminium?',
    a: 'Because the requirements differ. Every kilogram of rocket structure must be accelerated to orbital speed, so the rocket uses light alloys and composites. The tower stays on the ground: mass costs nothing there, while stiffness, strength, low cost and easy welding and repair matter, and steel is the best at those.',
  },
  sources: ['aisc-360'],
};

export const REFRACTORY_CONCRETE: MaterialDraft = {
  id: 'refractory-concrete',
  name: 'Refractory concrete and reinforced concrete (pad and flame trench)',
  family: 'Ceramics and concrete',
  focus:
    'Reinforced concrete forms the elevated pad, the launch mount foundations and the flame trench; surfaces the exhaust touches are lined with refractory (heat-resistant) concrete, and the deflector itself is faced with water-cooled steel. The refractory lining is used only where the jet strikes: it costs more than structural concrete and is not needed elsewhere.',
  suits:
    'Concrete is massive and cheap, strong in compression, and a poor conductor of heat, so a thick slab or trench wall absorbs a short blast without deep damage. Refractory mixes (calcium aluminate cements with heat-resistant aggregates) keep their integrity at temperatures that would make ordinary concrete spall.',
  limits:
    'Weak in tension (steel reinforcement carries it), and it spalls when trapped moisture turns to steam in a sudden hot blast; the fast, hot jet also erodes the surface a little on every launch, and salt spray attacks the reinforcing steel if cracks let it in. Trench linings are inspected and repaired after launches, so the lining is a maintained, consumable surface rather than a permanent one.',
  elsewhere: [{ text: 'Launch-pad flame trenches have been lined with refractory concrete and the material has been the subject of long-running corrosion and erosion research at launch sites.', source: 'nasa-ksc-refractory' }],
  compare: [
    { axis: 'Heat', text: 'Refractory grades tolerate the brief blast; ordinary concrete spalls. Neither would survive continuous exposure like an engine wall.' },
    { axis: 'Strength', text: 'Strong in compression, weak in tension: steel reinforcing bars take the tension.' },
    { axis: 'Mass and cost', text: 'Very heavy and very cheap: ideal for foundations that must not move.' },
  ],
  properties: [{ property: 'Service temperature of refractory castables', value: 'typically rated above 1,000 °C (grade dependent)', condition: 'Calcium aluminate refractory concrete, manufacturer ratings vary by grade', source: 'nasa-ksc-refractory' }],
  manufacturing: 'Cast in place with reinforcement cages; refractory linings are cast or gunned (sprayed) onto trench walls and cured carefully to drive out water.',
  inspection: 'Post-launch walk-downs of the trench and deflector for spalling, erosion and cracks, measurement of eroded depth, core samples where damage is suspected, and patch repairs with the same refractory mix between launch campaigns.',
  question: {
    q: 'Why is the flame trench lined with a special concrete when the exhaust only hits it for a few seconds?',
    a: 'Because those few seconds bring a hot, fast, abrasive jet. Ordinary concrete holds water that flashes to steam and blows the surface apart (spalling). Refractory concrete is formulated to survive the thermal shock, and the water deluge absorbs heat and sound at the same time.',
  },
  sources: ['nasa-ksc-refractory', 'nasa-ksc-sound-suppression'],
};
