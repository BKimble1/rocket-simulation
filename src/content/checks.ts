/**
 * Optional knowledge checks. They come after the explanation, never before, and carry no score:
 * each one explains why the right answer is right and why the tempting wrong answers are wrong,
 * then offers "Show me again". For 'order' checks the choices are listed out of order and
 * `answer` gives the indices in the correct order. Numbers quoted here are recomputed from
 * spec.ts by src/content/content.test.ts.
 */
import type { KnowledgeCheck } from './types';

/**
 * Checks are authored with the correct choice first (index 0) so they are easy to review; the
 * exported CHECKS move it to a position derived from the check id, so the right answer is not
 * always in the same place. Explanations never refer to choices by position.
 */
const AUTHORED: KnowledgeCheck[] = [
  // ---------------------------------------------------------------- anatomy
  {
    id: 'anatomy-intertank',
    kind: 'identify',
    topic: 'anatomy',
    part: 's1-intertank',
    prompt: 'The highlighted ring sits between the two booster tanks. What is it?',
    choices: ['Intertank', 'Interstage', 'Common bulkhead', 'Thrust structure'],
    answer: 0,
    explain:
      'It is the intertank: the unpressurized structure that joins the LOX tank above to the RP-1 tank below and carries loads between them. The interstage looks similar but sits higher, between the booster and the upper stage, around the upper-stage nozzle. A common bulkhead is a dome shared by two tanks inside the upper stage, with no ring between them. The thrust structure is at the bottom, where the engines push.',
    showAgain: { part: 's1-intertank' },
    sources: ['nasa-grc-liquid'],
  },
  {
    id: 'anatomy-downcomer',
    kind: 'identify',
    topic: 'anatomy',
    part: 'lox-downcomer',
    prompt: 'The highlighted pipe runs down through the middle of the booster RP-1 tank. What does it carry?',
    choices: [
      'Liquid oxygen from the LOX tank to the engines',
      'RP-1 from the fuel tank up to the LOX tank',
      'Helium pressurant from the bottles to the LOX tank',
      'Electrical cables from the avionics to the engines',
    ],
    answer: 0,
    explain:
      'It is the LOX downcomer. The LOX tank sits above the RP-1 tank, so its outflow has to pass through the fuel tank to reach the engines at the bottom. RP-1 never goes to the LOX tank, and helium lines and cables run outside the tanks, in the external raceway, not through the middle of the fuel.',
    showAgain: { part: 'lox-downcomer' },
    sources: ['nasa-grc-liquid'],
  },
  {
    id: 'anatomy-interstage',
    kind: 'identify',
    topic: 'anatomy',
    part: 'interstage',
    prompt: 'What is the highlighted dark section between the booster and the upper stage?',
    choices: ['Interstage', 'Payload fairing', 'Intertank', 'Base heat shield'],
    answer: 0,
    explain:
      'The interstage carries the upper stage during ascent and shrouds its engine nozzle until stage separation; it stays with the booster. The fairing is at the very top around the payload, the intertank is between the booster’s own two tanks, and the base heat shield covers the engine bay at the bottom.',
    showAgain: { part: 'interstage' },
    sources: ['nasa-ceus'],
  },
  {
    id: 'anatomy-lox-on-top',
    kind: 'why',
    topic: 'anatomy',
    prompt: 'On the K-1 booster the LOX tank sits above the RP-1 tank. Why?',
    choices: [
      'The heavier LOX load moves the centre of mass forward, making steering easier',
      'LOX must stay far from the hot engines, or it would boil away on the pad before launch',
      'RP-1 must sit next to the engines so it stays warm enough to flow',
      'This layout lets both tanks feed the engines without a downcomer pipe',
    ],
    answer: 0,
    explain:
      'LOX (1,141 kg/m³) is denser than RP-1 (810 kg/m³), and the booster carries 2.3 times more of it by mass. Putting it on top moves the centre of mass forward, which reduces the aerodynamic turning moment the gimbaled engines have to fight. Far from removing the need for a downcomer, this layout is what requires one: the LOX must reach the engines through a pipe running down through the RP-1 tank. Tank order does not keep either propellant at its temperature: the LOX boils off and is topped up on the pad wherever it sits, and RP-1 is stored at ambient temperature.',
    showAgain: { part: 's1-lox-tank' },
    sources: ['nasa-grc-liquid', 'sutton-rpe'],
  },
  {
    id: 'anatomy-fairing-purpose',
    kind: 'distinguish',
    topic: 'anatomy',
    prompt: 'What does the payload fairing protect the satellite from?',
    choices: [
      'Air pressure, heating and noise during the climb through the atmosphere',
      'The vacuum and cold of space once it reaches orbit',
      'Radiation and micrometeoroid impacts during its many years of work in orbit',
      'The heat of re-entry if the mission has to be aborted',
    ],
    answer: 0,
    explain:
      'The fairing is an aerodynamic and acoustic shield for the ascent. It is dropped a few minutes into flight, once the air is too thin to matter, so it cannot protect against vacuum or radiation in orbit, and it never comes back through the atmosphere with the satellite. Satellites are built to work in vacuum; what they cannot take is the air load and the roar of launch.',
    showAgain: { mission: 'leo', phase: 'fairing' },
    sources: ['nasa-bsf-14'],
  },
  // ---------------------------------------------------------------- propulsion
  {
    id: 'prop-turbopump',
    kind: 'identify',
    topic: 'propulsion',
    part: 'turbopump',
    prompt: 'The highlighted assembly on the E-1 has a turbine and two pumps on one shaft. What does it do?',
    choices: [
      'Raises the propellants from low tank pressure to above chamber pressure',
      'Mixes the fuel and the oxidizer before they reach the combustion chamber',
      'Cools the nozzle by blowing tank gas along its inner wall',
      'Steers the engine by pushing on its gimbal mount',
    ],
    answer: 0,
    explain:
      'The turbopump raises LOX and RP-1 from a few bar in the tanks to more than the 8.5 MPa chamber pressure, so the tanks can stay thin. Mixing happens at the injector, cooling in the channels of the chamber and nozzle walls, and steering is done by the gimbal actuators.',
    showAgain: { part: 'turbopump' },
    sources: ['huzel-huang-sp125', 'nasa-grc-liquid'],
  },
  {
    id: 'prop-why-pumps',
    kind: 'why',
    topic: 'propulsion',
    prompt: 'Why does the K-1 use turbopumps instead of pressurizing its tanks enough to push the propellant into the engines?',
    choices: [
      'Tanks strong enough to hold over 8.5 MPa would outweigh the whole booster',
      'Pumps raise the flame temperature, which gives more thrust',
      'Gas pressure alone cannot push a liquid through the many small injector holes',
      'Pressurizing the tanks would make the LOX boil away',
    ],
    answer: 0,
    explain:
      'Propellant must enter above the 8.5 MPa chamber pressure. With the wall rule t = p·r/σ, the 1.85 m tank radius and an illustrative 300 MPa allowable stress, a pressure-fed barrel needs at least 52 mm of aluminium: at least 30 t for the LOX barrel alone, more than the 25.5 t booster. Gas pressure certainly can push a liquid through an injector (small spacecraft engines are pressure-fed), pumps do not change the flame temperature, and pressurizing a tank raises the boiling point of the LOX rather than lowering it.',
    showAgain: { demo: 'turbopump' },
    sources: ['huzel-huang-sp125', 'sutton-rpe'],
  },
  {
    id: 'prop-isp-vs-thrust',
    kind: 'distinguish',
    topic: 'propulsion',
    prompt: 'The E-1V is the E-1’s core with a much larger nozzle. In vacuum it makes 910 kN against 835 kN and has a higher specific impulse, 342 s against 312 s. What does the higher specific impulse mean?',
    choices: [
      'Each kilogram of propellant gives more impulse, so more velocity change',
      'It burns more propellant every second, and that is where the extra thrust comes from',
      'Specific impulse is just another name for thrust, so the two numbers say the same thing',
      'Its flame is hotter, because its chamber runs at a higher pressure than the E-1',
    ],
    answer: 0,
    explain:
      'Thrust is force; specific impulse is efficiency, the impulse per unit weight of propellant (thrust = propellant flow × Isp × g0). The E-1V burns the same propellants at the same mixture ratio and chamber pressure, through the same throat, as the E-1, so its flow is essentially the same: about 271 kg/s against 273 kg/s. Its large nozzle expands the exhaust much further, so each kilogram leaves faster; with the same flow, that is why its vacuum thrust rises in nearly the same proportion as its Isp (about 9 to 10 %). The tempting answer mixes cause and effect: it does push harder, but not because it burns more, and its combustion temperature is essentially the same.',
    showAgain: { part: 'vacuum-engine' },
    sources: ['nasa-grc-thrust', 'sutton-rpe'],
  },
  {
    id: 'prop-regen',
    kind: 'distinguish',
    topic: 'propulsion',
    prompt: 'Fuel flows through channels in the chamber wall before it is burned. What does that do?',
    choices: [
      'It carries heat away through a conductive wall and returns it to the chamber',
      'It forms an insulating layer of fuel that keeps the flame’s heat out of the wall',
      'It moves the heat to the outer skin, which radiates it away to space',
      'It preheats the fuel so that it ignites without an igniter',
    ],
    answer: 0,
    explain:
      'That is regenerative cooling. The copper-alloy liner conducts heat quickly into the flowing RP-1, which then burns, so the energy is not lost. The channels are not insulation: a wall that blocked heat would get hotter, not cooler. Radiation cooling is used only on the nozzle extension, where the heat flux is low, and the E-1 still needs its TEA-TEB igniter.',
    showAgain: { demo: 'regen-cooling' },
    sources: ['nasa-ntrs-cooled-chambers', 'nasa-grcop'],
  },
  {
    id: 'prop-fuel-path',
    kind: 'order',
    topic: 'propulsion',
    prompt: 'Put the path of RP-1 through an E-1 engine in order.',
    choices: [
      'The fuel pump raises its pressure above chamber pressure',
      'It sprays through the injector into the chamber',
      'It leaves the RP-1 tank through the feed line',
      'It burns with LOX, and the hot gas accelerates through the throat and nozzle',
      'It flows through the cooling channels in the nozzle and chamber walls',
    ],
    answer: [2, 0, 4, 1, 3],
    explain:
      'RP-1 leaves the tank at low pressure, the turbopump raises it above 8.5 MPa, and it passes the main fuel valve into the cooling channels, where it picks up heat from the walls. Only then does it reach the injector and burn. Cooling comes before injection because the fuel is the coolant: the heat it absorbs goes back into the chamber.',
    showAgain: { demo: 'feed-flow' },
    sources: ['huzel-huang-sp125', 'nasa-grc-liquid'],
  },
  {
    id: 'prop-liner-material',
    kind: 'material',
    topic: 'propulsion',
    prompt: 'Why is the E-1 combustion-chamber liner made of a copper alloy (GRCop class) rather than a heat-resistant nickel superalloy?',
    choices: [
      'Copper conducts heat about 30 times better, so the hot face stays cool',
      'Copper melts at a higher temperature than nickel superalloys do',
      'Copper is less dense, which saves mass on a heavy engine',
      'Copper insulates the wall, keeping most of the flame’s heat away from the fuel',
    ],
    answer: 0,
    explain:
      'Copper actually melts lower (1,085 °C, against about 1,260 °C for Inconel 718) and is not lighter. What it has is conductivity: 344 W/(m·K) for GRCop-42 against about 11.4 W/(m·K) for 718. At an illustrative 30 MW/m² through 1 mm, the copper wall needs about 87 K between its faces, the superalloy about 2,630 K. The liner survives because it passes heat to the coolant, not because it blocks it.',
    showAgain: { material: 'grcop' },
    sources: ['nasa-grcop42-ellis', 'sm-inconel-718', 'asm-handbook-v2'],
  },
  {
    id: 'prop-niobium-extension',
    kind: 'material',
    topic: 'propulsion',
    prompt: 'The E-1V nozzle extension is a thin niobium-alloy skin with no cooling channels. Why does that work there but not in the chamber?',
    choices: [
      'There the heat flux is low enough to radiate away; in the chamber it is far too high',
      'Niobium barely heats up, so it needs no cooling anywhere in the engine',
      'The extension only fires for a few seconds at a time, which is too short to overheat it',
      'In vacuum, the cold of space conducts the heat away from the skin',
    ],
    answer: 0,
    explain:
      'A surface can radiate about q = ε·σ·T⁴: roughly 0.33 MW/m² at 1,370 °C with an emissivity of 0.8. The expanded gas in the extension delivers little enough heat for that, but the throat receives tens of MW/m². Niobium does heat up (it glows), the upper-stage burn lasts minutes, and vacuum cannot conduct heat at all: radiation is the only way out.',
    showAgain: { material: 'niobium-c103' },
    sources: ['sutton-rpe', 'c103-data'],
  },
  // ---------------------------------------------------------------- structures
  {
    id: 'struct-sandwich',
    kind: 'material',
    topic: 'structures',
    prompt: 'Why is the fairing built as carbon-fibre skins on an aluminium honeycomb core instead of as a solid carbon-fibre shell?',
    choices: [
      'Holding the skins apart makes it about 150 times stiffer for the same mass',
      'Aluminium honeycomb is stronger than carbon fibre, so it carries the load',
      'The core absorbs and stores the heat from the engine plumes',
      'Solid carbon fibre cannot be formed into the curved shape of a nose fairing',
    ],
    answer: 0,
    explain:
      'Bending stiffness grows with the square of the skin separation. The K-1 fairing’s 1.2 mm skins on a 25 mm core weigh the same as a solid laminate 3.18 mm thick (illustrative densities) yet are about 150 times stiffer in bending, which a large, thin shell needs against acoustic and air loads. The honeycomb itself is weak; it only holds the skins apart and carries shear. Solid laminates are routinely curved, and the fairing is nowhere near the engines.',
    showAgain: { demo: 'sandwich-panel' },
    sources: ['hexcel-honeycomb', 'toray-t700s'],
  },
  {
    id: 'struct-buckling',
    kind: 'why',
    topic: 'structures',
    prompt: 'Why does a lightweight tank shell need ribs or internal pressure?',
    choices: [
      'A thin cylinder buckles at a small fraction of its metal’s strength',
      'The ribs hold the propellant in place so it does not slosh',
      'The pressure keeps the propellant from boiling away in flight',
      'Without them the thin metal would overheat and soften in flight',
    ],
    answer: 0,
    explain:
      'For a 2 mm aluminium barrel of 1.85 m radius, classical theory and the NASA SP-8007 knockdown factor give a buckling stress of about 11 MPa, under 3 % of the metal’s yield strength. Orthogrid ribs stiffen the wall and internal pressure pulls the skin taut, so it can carry thrust and bending. Sloshing is handled by baffles and boil-off by venting and topping up; neither is why the shell needs ribs or pressure, and a tank full of cryogenic propellant is in no danger of overheating.',
    showAgain: { material: 'al-li' },
    sources: ['nasa-sp8007', 'nasa-al-li-crush', 'nasa-isogrid'],
  },
  {
    id: 'struct-stiffness-vs-strength',
    kind: 'distinguish',
    topic: 'structures',
    prompt: 'Which property describes how much a part deflects under a load, as opposed to the load at which it breaks or permanently bends?',
    choices: [
      'Stiffness (elastic modulus)',
      'Strength (yield stress)',
      'Toughness (resistance to cracking)',
      'Hardness (resistance to dents)',
    ],
    answer: 0,
    explain:
      'Stiffness, set by the elastic modulus and by the shape, says how much a part deflects under load. Strength is the stress at which it yields or breaks; toughness is its resistance to a crack running; hardness is its resistance to surface indentation. Thin shells and panels are usually limited by stiffness: they buckle long before their material is overstressed, which is why ribbed walls and sandwich panels are used.',
    showAgain: { demo: 'sandwich-panel' },
    sources: ['nasa-sp8007'],
  },
  {
    id: 'struct-common-bulkhead',
    kind: 'identify',
    topic: 'structures',
    part: 'common-bulkhead',
    prompt: 'The highlighted dome inside the upper stage separates its RP-1 from its LOX with no gap between them. What is it, and what does its core do?',
    choices: [
      'A common bulkhead; its honeycomb core insulates the RP-1 from the colder LOX',
      'An intertank; its core carries the engine thrust between the tanks',
      'A slosh baffle; its core damps the motion of the propellant sloshing in the tank',
      'A heat shield; its core protects the upper tank from the engine',
    ],
    answer: 0,
    explain:
      'A common bulkhead is one dome shared by two tanks, which saves the length and mass of an intertank. With LOX at 90 K on one side and RP-1 on the other, it needs an insulating core, or the RP-1 would get too cold and thick. An intertank is a separate structure between separate tanks (as on the booster), slosh baffles are rings on the tank walls, and the heat shields are at the engine end.',
    showAgain: { part: 'common-bulkhead' },
    sources: ['nasa-grc-liquid', 'hexcel-honeycomb'],
  },
  {
    id: 'struct-copv',
    kind: 'material',
    topic: 'structures',
    prompt: 'In the helium bottles (COPVs), which part carries most of the pressure load?',
    choices: ['The carbon-fibre overwrap', 'The titanium liner under the fibres', 'The helium itself', 'The valve at the neck'],
    answer: 0,
    explain:
      'The fibres wound around the bottle carry the hoop tension, the largest stress in a pressurized cylinder, along their strong direction. The thin titanium liner mainly seals the gas, which fibre and resin alone could not do. That is why even invisible damage to the overwrap disqualifies a bottle.',
    showAgain: { material: 'cfrp-copv' },
    sources: ['nasa-copv'],
  },
  {
    id: 'struct-anisotropy',
    kind: 'material',
    topic: 'structures',
    prompt: 'A carbon-fibre laminate with all its fibres in one direction is pulled across the fibres. What happens?',
    choices: [
      'It is many times weaker, because the resin must carry the load',
      'It is just as strong, because carbon is strong in every direction',
      'It is stronger, because the fibres spread the load sideways',
      'It stretches a long way, like rubber, before it breaks',
    ],
    answer: 0,
    explain:
      'Carbon fibres carry load only along their length. Across them the load has to pass through the epoxy and the fibre-resin interface, which are many times weaker. That is anisotropy; designers stack plies at 0°, ±45° and 90° so that fibres run along every direction the loads actually take. Epoxy is stiff, not rubbery, so the laminate cracks rather than stretches.',
    showAgain: { material: 'cfrp-sandwich' },
    sources: ['toray-t700s'],
  },
  // ---------------------------------------------------------------- guidance
  {
    id: 'gnc-tvc',
    kind: 'identify',
    topic: 'guidance',
    part: 'tvc-actuators',
    prompt: 'The highlighted pair of rods pushes on each E-1 engine. What do they do?',
    choices: [
      'Swivel the engine on its gimbal to steer the vehicle',
      'Hold the engine rigidly in place against launch vibration',
      'Pump hydraulic fluid into the combustion chamber',
      'Open and close the main propellant valves',
    ],
    answer: 0,
    explain:
      'They are the thrust-vector-control actuators. By tilting the engine up to 5° on its gimbal they move the thrust line to one side of the centre of mass, creating a turning moment that steers the vehicle. They do not lock the engine, never touch the propellant path, and the valves have their own actuators.',
    showAgain: { demo: 'tvc' },
    sources: ['sutton-rpe'],
  },
  {
    id: 'gnc-steering',
    kind: 'why',
    topic: 'guidance',
    prompt: 'How does the K-1 steer during the ascent?',
    choices: [
      'By gimbaling its engines, tilting the thrust about the centre of mass',
      'With its grid fins, like the control surfaces of an aircraft',
      'By throttling the engines on one side up and those on the other side down',
      'By pumping propellant between tanks to shift its balance',
    ],
    answer: 0,
    explain:
      'Thrust vector control: the engines swivel on gimbals, so the thrust passes slightly off the centre of mass and rotates the vehicle. The grid fins stay folded during the ascent and are used only for the booster’s descent. Differential throttling is possible on some clustered vehicles, but the K-1 steers by gimbaling, and moving propellant around would be far too slow.',
    showAgain: { mission: 'leo', phase: 'pitchover' },
    sources: ['sutton-rpe', 'nasa-bsf-14'],
  },
  {
    id: 'gnc-staging-order',
    kind: 'order',
    topic: 'guidance',
    prompt: 'Put the K-1 staging sequence in order.',
    choices: [
      'Pneumatic pushers separate the stages',
      'The booster engines shut down (MECO)',
      'The upper-stage engine ignites, clear of the interstage',
      'A coast of a few seconds',
      'The fairing halves separate',
    ],
    answer: [1, 3, 0, 2, 4],
    explain:
      'The booster shuts down first and coasts for a few seconds while its thrust dies away. The pushers then separate the stages, and a few seconds later, once the upper-stage nozzle is clear of the interstage, the upper-stage engine ignites. The fairing comes off after that, above about 110 km, where the thin air no longer heats or loads the payload.',
    showAgain: { mission: 'leo', phase: 'staging' },
    sources: ['nasa-bsf-14'],
  },
  {
    id: 'gnc-imu',
    kind: 'distinguish',
    topic: 'guidance',
    prompt: 'The avionics carry both an inertial measurement unit (IMU) and a satellite-navigation (GNSS) receiver. What does the IMU provide that GNSS cannot?',
    choices: [
      'Fast measurements of rotation and acceleration, with no outside signal',
      'An absolute position, fixed by signals from navigation satellites',
      'A radio link to the ground for commands and telemetry',
      'The precise time of day, used to schedule the burns',
    ],
    answer: 0,
    explain:
      'The gyroscopes and accelerometers of the IMU measure motion hundreds of times a second from inside the vehicle, which the control loop needs in order to steer. Integrated over time, though, their small errors grow, so the flight computer corrects them with GNSS, which gives absolute position and time from outside signals but updates more slowly and can be lost. The two complement each other; neither is the radio link.',
    showAgain: { part: 'avionics' },
    sources: ['nasa-bsf-14'],
  },
  {
    id: 'gnc-ignition-delay',
    kind: 'why',
    topic: 'guidance',
    prompt: 'Why does the upper-stage engine wait a few seconds after separation before igniting?',
    choices: [
      'To let the nozzle clear the interstage so the plume misses the booster',
      'To let the engine cool after sitting next to the hot booster engines for minutes',
      'To wait until the fairing has separated and is out of the way',
      'Because the engine needs outside air to light, which takes time',
    ],
    answer: 0,
    explain:
      'The upper-stage nozzle starts inside the interstage. Igniting too early would blast the booster, which could be pushed back into the upper stage, and would risk the nozzle striking the interstage. The upper-stage engine is cold, not hot: it has not yet run and was shielded inside the interstage. The fairing comes off later, and a rocket engine carries its own oxidizer and never needs air.',
    showAgain: { mission: 'leo', phase: 'ses1' },
    sources: ['nasa-bsf-14'],
  },
  // ---------------------------------------------------------------- launch
  {
    id: 'launch-sequence',
    kind: 'order',
    topic: 'launch',
    prompt: 'Put these launch events in order.',
    choices: [
      'Liftoff: the hold-down clamps release',
      'The umbilical and access arms retract',
      'The vehicle clears the tower',
      'The engines ignite and are checked at full thrust on the pad',
      'Maximum dynamic pressure (max-q)',
      'The pitch-over begins',
    ],
    answer: [1, 3, 0, 2, 5, 4],
    explain:
      'The arms retract before ignition. The engines start and their thrust is verified while the clamps still hold the vehicle, and only then do the clamps release it. The vehicle climbs vertically until it clears the tower, then pitches over into its gravity turn; max-q comes later, when the vehicle is supersonic in the thinning air.',
    showAgain: { mission: 'leo', phase: 'ignition' },
    sources: ['nasa-bsf-14'],
  },
  {
    id: 'launch-holddown',
    kind: 'why',
    topic: 'launch',
    prompt: 'Why are the engines started a few seconds before the hold-down clamps release the vehicle?',
    choices: [
      'So the computers can confirm full, healthy thrust before letting go',
      'To warm up the launch mount so that it does not crack',
      'To burn off excess propellant so the vehicle is light enough',
      'So the vehicle can creep off the pad gradually as thrust builds',
    ],
    answer: 0,
    explain:
      'Engines take a moment to reach full thrust, and a bad start must be caught while the vehicle is still safe on the pad, where the engines can simply be shut down. The clamps hold it until the checks pass. Nothing is gained by heating the mount or wasting propellant, and a vehicle creeping off the pad on partial thrust would be dangerous.',
    showAgain: { part: 'launch-mount' },
    sources: ['nasa-bsf-14'],
  },
  {
    id: 'launch-maxq',
    kind: 'distinguish',
    topic: 'launch',
    prompt: 'What is max-q?',
    choices: [
      'The moment of highest dynamic pressure (½ρv²), when air loads peak',
      'The moment of highest speed, just before the booster shuts down',
      'The highest point of the flight, where the air is thinnest',
      'The moment of highest acceleration, when the crew would feel the most g-force',
    ],
    answer: 0,
    explain:
      'q = ½ρv² grows with speed but shrinks as the air thins. Early in flight the speed wins and later the thinning air wins, so q peaks in between, typically at about 10 to 15 km. Speed and acceleration keep rising long after max-q (acceleration peaks near engine cutoff, when the vehicle is lightest), and the highest point comes much later.',
    showAgain: { mission: 'leo', phase: 'maxq' },
    sources: ['nasa-grc-dynpress', 'ussa-1976'],
  },
  {
    id: 'launch-throttle-maxq',
    kind: 'why',
    topic: 'launch',
    prompt: 'Why does the booster throttle down around max-q?',
    choices: [
      'To limit the air load on the structure while the air pushes hardest',
      'To save propellant for the booster’s landing burns',
      'Because the engines overheat in the dense lower air and must be protected',
      'To let the upper stage catch up before separation',
    ],
    answer: 0,
    explain:
      'Throttling down briefly slows the gain in speed while the air is still dense, lowering the peak of q = ½ρv² so the structure can be lighter. The propellant saved is small, the engines are not limited by the outside air temperature, and the stages are still joined.',
    showAgain: { mission: 'leo', phase: 'maxq' },
    sources: ['nasa-grc-dynpress', 'nasa-bsf-14'],
  },
  {
    id: 'launch-deluge',
    kind: 'identify',
    topic: 'launch',
    part: 'sound-suppression',
    prompt: 'Just before ignition, water floods the launch mount from the highlighted system. What is it for?',
    choices: [
      'Absorbing engine noise that would otherwise shake the vehicle and payload',
      'Putting out any fire started by the engine exhaust',
      'Cooling the engines while they build up to full thrust on the launch mount',
      'Washing dust and debris off the pad before liftoff',
    ],
    answer: 0,
    explain:
      'It is the sound-suppression deluge. Engine noise reflecting off the pad is intense enough to damage the vehicle and its payload; the water absorbs much of that energy and also protects the mount. It is not a fire system, the engines are cooled by their own fuel, and the water is released at ignition to absorb sound, not to clean the pad.',
    showAgain: { part: 'sound-suppression' },
    sources: ['nasa-bsf-14'],
  },
  {
    id: 'launch-no-foam',
    kind: 'material',
    topic: 'launch',
    prompt: 'The K-1 LOX tank frosts over on the pad because it has no foam insulation. Why is that acceptable?',
    choices: [
      'LOX is topped up until launch, so extra boil-off costs nothing',
      'Frost is a better insulator than foam, so foam is not needed',
      'LOX does not boil at outdoor temperatures, so nothing is lost',
      'The frost layer shields the tank from aerodynamic heating during the climb',
    ],
    answer: 0,
    explain:
      'Foam matters for propellants held cold for a long time, above all liquid hydrogen. The K-1’s short hold and continuous topping up make extra boil-off harmless, the thin frost falls away early in flight, and leaving the foam off saves mass and removes a source of debris. LOX certainly boils at outdoor temperatures (it boils at 90 K), and the thin frost is neither a designed insulator nor a heat shield.',
    showAgain: { material: 'cryo-foam' },
    sources: ['caib-report'],
  },
  // ---------------------------------------------------------------- orbit
  {
    id: 'orbit-falling',
    kind: 'why',
    topic: 'orbit',
    prompt: 'Gravity at 400 km is still about 89 % of its surface value. Why doesn’t the satellite fall to Earth?',
    choices: [
      'It is falling, but moving sideways so fast that Earth curves away',
      'There is no gravity in space, so nothing pulls it down',
      'The thin air at 400 km still holds it up, like a glider',
      'Pressure from sunlight on its solar arrays holds it up',
    ],
    answer: 0,
    explain:
      'In one second at 7,673 m/s the satellite falls 4.35 m and travels 7.67 km, over which the Earth’s surface drops by the same 4.35 m, so it never gets closer. Gravity is very much present (8.69 m/s²): it is what bends the path into a circle. The thin air does the opposite of holding it up: it slowly drags the orbit down. Sunlight does push on the arrays, but far too weakly to hold anything up.',
    showAgain: { mission: 'leo', phase: 'coast' },
    sources: ['nasa-bsf-3'],
  },
  {
    id: 'orbit-apo-peri',
    kind: 'distinguish',
    topic: 'orbit',
    prompt: 'On the geostationary transfer orbit, which point is the apoapsis?',
    choices: [
      'The highest point, about 35,786 km up, where the satellite moves slowest',
      'The lowest point, about 200 km up, where the satellite moves fastest',
      'Any point where the transfer orbit crosses the equator',
      'The point where the satellite separates from the upper stage',
    ],
    answer: 0,
    explain:
      'Apoapsis is the highest point of an orbit and periapsis the lowest. On the transfer orbit the satellite climbs from about 200 km (periapsis, fastest) to 35,786 km (apoapsis, slowest), where its apogee engine later fires, at three successive apogees, to raise the periapsis and circularize the orbit. On this mission the apoapsis is placed over the equator on purpose, but crossing the equator is not what defines it, and separation happens near periapsis.',
    showAgain: { mission: 'gto', phase: 'transfer-coast' },
    sources: ['nasa-bsf-4'],
  },
  {
    id: 'orbit-gto-order',
    kind: 'order',
    topic: 'orbit',
    prompt: 'Put the geostationary-transfer mission events in order.',
    choices: [
      'Satellite separation',
      'First upper-stage cutoff: in the parking orbit',
      'Settling thrusters fire and the engine restarts',
      'Coast in the parking orbit to the right point',
      'Transfer-orbit injection cutoff',
      'Apogee-engine burns by the satellite',
    ],
    answer: [1, 3, 2, 4, 0, 5],
    explain:
      'The upper stage first reaches a low parking orbit and coasts until it is at the right place (a crossing of the equator). Settling thrusters push the floating propellant back over the tank outlets before the restart. The second burn raises the far point to 35,786 km; the satellite then separates, coasts through its first apogee while it is checked out, and fires its own engine at the next three apogees to reach geostationary orbit.',
    showAgain: { mission: 'gto', phase: 'restart' },
    sources: ['nasa-bsf-4'],
  },
  {
    id: 'orbit-phasing',
    kind: 'why',
    topic: 'orbit',
    prompt: 'Why is the capsule inserted into a lower orbit behind the station instead of straight into the station’s orbit beside it?',
    choices: [
      'A lower orbit is faster, so the capsule catches up and then climbs',
      'The capsule cannot climb as high as the station’s 400 km',
      'To stay clear of the station’s solar arrays until the final approach begins',
      'Lower orbits have no drag, which saves the capsule propellant',
    ],
    answer: 0,
    explain:
      'That is phasing: the lower, faster orbit lets the capsule close the gap over several orbits, and a pair of burns then raises it to just below the station for the final approach. Launch timing alone cannot put a spacecraft exactly beside a target at exactly matched speed. The capsule can reach the station’s altitude (it does, later), keeping clear of the station is a matter for the final approach, and lower orbits have more drag, not less.',
    showAgain: { mission: 'station', phase: 'phasing' },
    sources: ['nasa-ntrs-rendezvous', 'nasa-bsf-4'],
  },
  {
    id: 'orbit-parking-vs-transfer',
    kind: 'distinguish',
    topic: 'orbit',
    prompt: 'What is the difference between the parking orbit and the transfer orbit in the geostationary mission?',
    choices: [
      'Parking: a low orbit to coast in; transfer: an ellipse up to 35,786 km',
      'None: they are the same orbit under two different names',
      'Parking: the geostationary orbit; transfer: the low orbit before it',
      'Transfer: the orbit where the satellite spends its working life',
    ],
    answer: 0,
    explain:
      'The upper stage first reaches a low parking orbit (about 200 km) and coasts to the burn point. The second burn puts the satellite on a transfer orbit, an ellipse from about 200 km up to 35,786 km. Neither is the final working orbit: the satellite circularizes at geostationary altitude itself, with three burns of its apogee engine.',
    showAgain: { mission: 'gto', phase: 'parking-coast' },
    sources: ['nasa-bsf-4'],
  },
  {
    id: 'orbit-mli',
    kind: 'identify',
    topic: 'orbit',
    part: 'mli-blankets',
    prompt: 'The satellite is wrapped in the highlighted gold- and silver-coloured blankets. What are they for?',
    choices: [
      'Blocking radiated heat so the equipment stays within its temperature range',
      'Protecting the satellite from air friction during launch',
      'Generating electrical power from sunlight, like very thin flexible solar cells',
      'Stopping micrometeoroids by being very hard and tough',
    ],
    answer: 0,
    explain:
      'They are multilayer insulation. In vacuum heat travels mainly by radiation, and each shiny layer reflects most of it back, keeping sunlight out on one side and heat in on the cold side. The fairing handled the air during launch, the solar arrays make the power, and thin films are not armour.',
    showAgain: { part: 'mli-blankets' },
    sources: ['nasa-mli'],
  },
  {
    id: 'orbit-settling',
    kind: 'why',
    topic: 'orbit',
    prompt: 'Before restarting its engine in orbit, the upper stage fires small thrusters for a while. Why?',
    choices: [
      'To settle the floating propellant over the tank outlets before the start',
      'To warm the engine up before it is asked to restart',
      'To change the orbit slightly before the main engine burn',
      'To push the payload away from the stage before the burn',
    ],
    answer: 0,
    explain:
      'That is a settling (ullage) burn. While coasting, everything aboard falls together, so the liquid drifts around inside the tanks. The small acceleration from the thrusters collects it at the bottom, over the outlets, so the turbopumps are fed liquid when the engine starts. The thrust is far too small to change the orbit meaningfully, and it has nothing to do with the payload.',
    showAgain: { mission: 'gto', phase: 'restart' },
    sources: ['sutton-rpe'],
  },
  // ---------------------------------------------------------------- return
  {
    id: 'return-shield-vs-tiles',
    kind: 'material',
    topic: 'return',
    prompt: 'Why does the capsule have an ablator on its heat shield but reusable ceramic tiles on its backshell?',
    choices: [
      'The shield takes the most intense heating; the backshell’s is gentler',
      'Tiles would be too heavy for the large heat shield',
      'Ablators only work on curved surfaces like the shield',
      'The backshell faces forward during entry, which is where reusable tiles work best',
    ],
    answer: 0,
    explain:
      'Entering heat shield first, the blunt shield takes the peak heat flux; a charring ablator absorbs and blocks it by pyrolysis, blowing and re-radiation, and is replaced after the flight. The backshell sits in the capsule’s wake with much lower heating, so light silica tiles that insulate and re-radiate without being consumed are enough, and they can fly again. The tiles are actually very light, ablators work on any shape, and the backshell faces aft.',
    showAgain: { part: 'heat-shield' },
    sources: ['nasa-ablators', 'nasa-reusable-tps'],
  },
  {
    id: 'return-heat-shield',
    kind: 'identify',
    topic: 'return',
    part: 'heat-shield',
    prompt: 'The capsule enters the atmosphere with the highlighted surface facing forward. What is it, and how does it protect the crew?',
    choices: [
      'An ablative heat shield that chars and wears away as it blocks heat',
      'Polished metal that reflects the heat back into the air',
      'Water-cooled copper panels, like the engine chamber',
      'Ceramic tiles that are reused unchanged after each flight',
    ],
    answer: 0,
    explain:
      'It is the ablative heat shield. Its resin decomposes into gas and char; the gas blows into the boundary layer and blocks heat, the char re-radiates, and the surface slowly recedes. Polished metal would melt, water cooling would be far too heavy for minutes of entry heating, and reusable tiles are used only on the backshell, where heating is gentler.',
    showAgain: { part: 'heat-shield' },
    sources: ['nasa-ablators', 'nasa-pica-sustain'],
  },
  {
    id: 'return-boostback',
    kind: 'why',
    topic: 'return',
    prompt: 'Why does the booster fire a boostback burn after separation?',
    choices: [
      'To cancel its downrange speed and head back toward the landing zone',
      'To give the upper stage an extra push after separation',
      'To gain enough speed to reach an orbit of its own',
      'To burn off leftover propellant so the booster is light enough before it lands',
    ],
    answer: 0,
    explain:
      'At separation the booster is moving fast away from the coast, and its ballistic arc would come down far out at sea. Three engines reverse that horizontal motion so that it falls back toward the landing zone. It cannot help the upper stage (they are already apart), it is nowhere near orbital speed, and the propellant it uses is exactly the reserve kept for recovery.',
    showAgain: { mission: 'leo', phase: 'boostback' },
    sources: ['nasa-bsf-4'],
  },
  {
    id: 'return-capsule-order',
    kind: 'order',
    topic: 'return',
    prompt: 'Put the capsule return events in order.',
    choices: [
      'Main parachutes open, first reefed and then fully',
      'Deorbit burn',
      'Peak heating and plasma blackout',
      'Splashdown',
      'Service module separation',
      'Drogue parachutes',
      'Entry interface (about 120 km)',
    ],
    answer: [1, 4, 6, 2, 5, 0, 3],
    explain:
      'The service module engine performs the deorbit burn, then the service module is discarded before entry so that the heat shield is exposed. The capsule reaches entry interface and goes through peak heating; then, far lower and slower, the drogues stabilize and slow it, and the mains (reefed, then fully open) bring it down to about 7.6 m/s for splashdown.',
    showAgain: { mission: 'return', phase: 'entry' },
    sources: ['nasa-ablators', 'knacke-parachutes'],
  },
  {
    id: 'return-reefing',
    kind: 'distinguish',
    topic: 'return',
    prompt: 'Why are the main parachutes reefed when they first open?',
    choices: [
      'To limit the opening shock by letting the canopy open in stages',
      'To keep them from opening at all until splashdown',
      'To make the capsule descend faster at splashdown',
      'To stop the canopies burning in the hot air left over from entry',
    ],
    answer: 0,
    explain:
      'A reefing line holds each canopy partly closed so the capsule decelerates on a smaller canopy first; a cutter then releases it and the canopy opens fully at a lower speed. That caps the peak load on fabric, lines and capsule. Reefed canopies do open and slow the capsule (just less), the full canopy is what sets the slow splashdown speed, and by then the air around the capsule is no longer hot.',
    showAgain: { part: 'parachutes' },
    sources: ['knacke-parachutes', 'nasa-spinoff-orion-chutes'],
  },
  {
    id: 'return-grid-fin-material',
    kind: 'material',
    topic: 'return',
    prompt: 'The booster’s grid fins are one-piece titanium lattices. Why titanium rather than aluminium?',
    choices: [
      'It stays strong at entry temperatures, so the fins need no ablative coating',
      'Titanium is lighter than aluminium for the same size of fin',
      'Titanium is cheaper and easier to machine than aluminium',
      'Titanium conducts the entry heat away from the fins into the cold propellant tanks',
    ],
    answer: 0,
    explain:
      'The thin lattice members heat up quickly in the entry flow. Aluminium alloys weaken above roughly 150 °C and would need an ablative coating renewed after each flight; titanium stays strong to several hundred °C. Titanium is actually denser (4,430 kg/m³ against about 2,840 kg/m³ for 2219) and costlier to machine, and it conducts heat poorly: the trade is mass and cost for reusability.',
    showAgain: { material: 'titanium' },
    sources: ['ati-ti64', 'asm-handbook-v2'],
  },
  {
    id: 'return-landing-burn',
    kind: 'why',
    topic: 'return',
    prompt: 'Why does the booster land using only its centre engine?',
    choices: [
      'One engine at minimum throttle already outweighs the near-empty stage',
      'The six outer engines have run out of propellant by then',
      'Only the centre engine is able to restart in flight',
      'Firing one engine keeps the landing legs cool enough',
    ],
    answer: 0,
    explain:
      'One E-1 at its 55 % minimum throttle makes about 409 kN at sea level, against about 271 kN of weight for the booster near its 27,600 kg dry mass with landing legs: a thrust-to-weight ratio of about 1.51 even with the tanks nearly empty. It cannot hover, so the burn is timed to reach zero speed just at the ground, and more engines would only make that harder. All engines draw from the same tanks, three of them already restarted for the boostback and entry burns, and the legs do not decide how many engines fire.',
    showAgain: { mission: 'leo', phase: 'landing-burn' },
    sources: ['nasa-grc-thrust'],
  },
  {
    id: 'return-textiles',
    kind: 'material',
    topic: 'return',
    prompt: 'The capsule’s parachute risers are aramid (Kevlar class) rather than steel cable. Why?',
    choices: [
      'It is far stronger per kilogram and chars instead of melting',
      'Aramid is much cheaper than steel cable of the same strength',
      'Steel cable would rust after the splashdown in sea water',
      'Aramid stretches more than steel, which softens the opening shock',
    ],
    answer: 0,
    explain:
      'Para-aramid fibre (1,440 kg/m³, about 3,000 MPa) carries the concentrated loads of the risers at a fraction of the mass of steel, and it decomposes at about 427 to 482 °C instead of melting, which matters if a riser touches the capsule after entry. It barely stretches: the stretchy nylon canopy and the reefing soften the opening shock. Cost and corrosion are secondary.',
    showAgain: { material: 'textiles' },
    sources: ['dupont-kevlar', 'nasa-spinoff-orion-chutes'],
  },
  // ---------------------------------------------------------------- missions
  {
    id: 'missions-suborbital-vs-orbital',
    kind: 'distinguish',
    topic: 'missions',
    prompt: 'The suborbital capsule and the LEO satellite both go above 100 km. Why does only the satellite stay up?',
    choices: [
      'The satellite moves sideways at 7.7 km/s; the capsule barely at all',
      'The satellite goes higher, beyond the reach of Earth’s gravity',
      'The capsule is heavier, so gravity pulls it down harder',
      'The satellite keeps firing its engine to hover at 400 km',
    ],
    answer: 0,
    explain:
      'Staying up is a matter of sideways speed, not height: at 400 km the satellite needs 7,673 m/s along its path. The suborbital capsule reaches space on the booster alone, climbing almost vertically, and falls back within minutes. Gravity at 400 km is still about 89 % of its surface value, mass does not change how things fall, and no satellite hovers.',
    showAgain: { mission: 'suborbital', phase: 'apogee' },
    sources: ['nasa-bsf-3'],
  },
  {
    id: 'missions-gto-handoff',
    kind: 'why',
    topic: 'missions',
    prompt: 'In the geostationary mission, why does the launch vehicle stop at a transfer orbit and leave the final burn to the satellite?',
    choices: [
      'The satellite’s engine finishes at apogee, sparing the stage a long coast',
      'The upper stage has no engine restart left for a third burn',
      'Rocket stages are not allowed to reach geostationary altitude',
      'The satellite is so light that circularizing takes little propellant',
    ],
    answer: 0,
    explain:
      'The transfer orbit takes about 5 hours to climb to its far point. Taking the whole upper stage there would mean a long coast (batteries, thermal control, propellant boil-off) and a third burn; many launch vehicles instead hand over at the transfer orbit and let the satellite circularize, and remove the 28.5° inclination, with its apogee engine. The upper stage still works, nothing forbids reaching geostationary altitude, and circularizing takes a large share of the satellite: about 1,600 kg of propellant, nearly half its 3,600 kg launch mass.',
    showAgain: { mission: 'gto', phase: 'circularize' },
    sources: ['nasa-bsf-4'],
  },
  {
    id: 'missions-lunar-order',
    kind: 'order',
    topic: 'missions',
    prompt: 'Put the lunar flyby events in order.',
    choices: [
      'Closest approach behind the Moon',
      'Trans-lunar injection burn',
      'Probe separation',
      'Entering the Moon’s sphere of influence',
      'Coasting in the parking orbit',
      'Leaving the Moon’s sphere of influence, outbound',
    ],
    answer: [4, 1, 2, 3, 0, 5],
    explain:
      'The upper stage waits in a parking orbit for the right departure point, then the trans-lunar injection burn raises the orbit out to the Moon’s distance, and the probe separates. It then coasts for about three days: late in the coast it crosses into the Moon’s sphere of influence (about 66,000 km), passes closest behind the Moon (on its trailing side) and, having made no braking burn, climbs back out faster relative to Earth than it arrived, on a path that leaves the Earth-Moon system.',
    showAgain: { mission: 'lunar', phase: 'soi' },
    sources: ['nasa-bsf-4'],
  },
  {
    id: 'missions-flyby',
    kind: 'distinguish',
    topic: 'missions',
    prompt: 'At the Moon the probe passes about 1,500 km above the Moon’s trailing side and flies on. What makes this a flyby rather than an orbit insertion?',
    choices: [
      'It makes no braking burn, so it is too fast to be captured',
      'It passes too far from the Moon for lunar gravity to have any real effect',
      'Probes are too small to be held in orbit by the Moon',
      'It passes behind the Moon, where capture is impossible',
    ],
    answer: 0,
    explain:
      'Arriving from Earth, the probe falls toward the Moon faster than the Moon’s escape speed at that distance, so without a braking burn it swings around and leaves. The Moon’s gravity is strong there: it is what bends the path. Many probes of every size do enter lunar orbit, by firing an engine near closest approach, and which side it passes does not decide capture.',
    showAgain: { mission: 'lunar', phase: 'flyby' },
    sources: ['nasa-bsf-4'],
  },
  {
    id: 'missions-gravity-assist',
    kind: 'why',
    topic: 'missions',
    prompt: 'Relative to the Moon, the probe leaves at the same speed it arrived with. Why is it faster relative to Earth after the flyby?',
    choices: [
      'The Moon turned its path to point partly along the Moon’s motion',
      'The Moon’s pull speeds it up going in and does not slow it going out',
      'Its engine fires at closest approach, where a burn is most efficient',
      'Near the Moon, Earth’s pull is cancelled, so the probe stops slowing',
    ],
    answer: 0,
    explain:
      'Seen from the Moon, the probe arrives at about 1.2 km/s and leaves at about 1.2 km/s: the Moon’s gravity speeds it up on the way in and slows it by the same amount on the way out, turning its path by about 64°. Seen from Earth, the probe’s velocity is the Moon’s velocity (about 1.0 km/s) plus that relative velocity. It arrived pointing partly against the Moon’s motion; passing behind the Moon, it is pulled forward and leaves pointing partly along it, so the two now add: about 1.0 km/s relative to Earth on arrival, about 1.74 km/s at the exit, above the 1.33 km/s escape speed there. That is a gravity assist; the Moon gives up a tiny, unmeasurable amount of its own orbital energy. No engine fires, and Earth’s pull never switches off.',
    showAgain: { mission: 'lunar', phase: 'outbound' },
    sources: ['nasa-bsf-4'],
  },
  {
    id: 'missions-gto-burns',
    kind: 'why',
    topic: 'missions',
    prompt: 'Why does the geostationary satellite reach its final orbit with three apogee burns instead of one long burn?',
    choices: [
      'Its engine is small; short burns centred on apogee waste less',
      'The engine must cool down for a day between any two firings',
      'Each burn can remove the orbit’s tilt or raise it, but not both',
      'Apogee is the only point where its engine is able to ignite',
    ],
    answer: 0,
    explain:
      'The 450 N engine gives the 3,600 kg satellite only 0.125 m/s², so the whole change (about 1.84 km/s, tilt removal included) needs about 3.1 hours of firing. One burn that long would sweep across a wide arc of the orbit, and a push made far from apogee raises the high point instead of the low one. Three burns of 87, 58 and 40 min, each centred on an apogee, raise the perigee in steps (to about 6,750 km, then 17,900 km, then 35,786 km) and each also turns the orbit toward the equator, where the slow apogee speed makes that cheap. The coasts between also let controllers check each new orbit. The pauses are the time it takes to coast round to the next apogee, not a cooling rule; the engine can fire anywhere on the orbit; and every burn here both raises the orbit and removes tilt.',
    showAgain: { mission: 'gto', phase: 'circularize' },
    sources: ['nasa-bsf-4', 'sutton-rpe'],
  },
  {
    id: 'missions-abort-tower',
    kind: 'identify',
    topic: 'missions',
    part: 'launch-abort-system',
    prompt: 'Only the crewed configuration carries the highlighted tower on top of the capsule. What is it?',
    choices: [
      'The launch abort system, a rocket tower that can pull the capsule clear',
      'A lightning rod that protects the capsule on the pad',
      'The docking probe used to join the space station',
      'A long antenna for communications during the ascent',
    ],
    answer: 0,
    explain:
      'It is the launch abort tower: solid rocket motors that can lift the capsule clear of the vehicle in an emergency. It is jettisoned after staging, once it is no longer needed. Lightning protection is the mast on top of the service tower, the docking system sits under the capsule’s nose cover, and antennas are small and flush.',
    showAgain: { mission: 'station', phase: 'abort-jettison' },
    sources: ['nasa-bsf-14'],
  },
];

/** Deterministic position for the correct choice of a single-answer check (FNV-1a hash of the id). */
function answerSlot(id: string, n: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % n;
}

function placeAnswer(c: KnowledgeCheck): KnowledgeCheck {
  if (c.kind === 'order' || typeof c.answer !== 'number') return c;
  const correct = c.choices[c.answer];
  const others = c.choices.filter((_, i) => i !== c.answer);
  const slot = answerSlot(c.id, c.choices.length);
  const choices = [...others.slice(0, slot), correct, ...others.slice(slot)];
  return { ...c, choices, answer: slot };
}

/** The knowledge checks, ready to show (choices in display order). */
export const CHECKS: KnowledgeCheck[] = AUTHORED.map(placeAnswer);

/** Checks for one learning topic, in path order. */
export function checksFor(topic: KnowledgeCheck['topic']): KnowledgeCheck[] {
  return CHECKS.filter((c) => c.topic === topic);
}
