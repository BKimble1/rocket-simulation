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
    choices: ['Liquid oxygen from the LOX tank above to the engines', 'RP-1 up to the LOX tank', 'Helium pressurant to the LOX tank', 'Electrical cables to the engines'],
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
      'LOX is denser, so putting it forward moves the centre of mass forward, which makes the vehicle easier to hold steady',
      'LOX has to stay far from the engines so that it does not boil',
      'RP-1 has to be close to the engines to stay warm',
      'It makes the downcomer unnecessary',
    ],
    answer: 0,
    explain:
      'LOX (1,141 kg/m³) is denser than RP-1 (810 kg/m³), and the booster carries 2.3 times more of it by mass. Putting it on top moves the centre of mass forward, which reduces the aerodynamic turning moment the gimbaled engines have to fight. Far from removing the need for a downcomer, this layout is what requires one: the LOX must reach the engines through a pipe running down through the RP-1 tank. Propellant temperatures are handled by insulation and flow, not by tank order.',
    showAgain: { part: 's1-lox-tank' },
    sources: ['nasa-grc-liquid', 'sutton-rpe'],
  },
  {
    id: 'anatomy-fairing-purpose',
    kind: 'distinguish',
    topic: 'anatomy',
    prompt: 'What does the payload fairing protect the satellite from?',
    choices: ['Air pressure, heating and noise while climbing through the atmosphere', 'The vacuum of space', 'Radiation in orbit', 'The heat of re-entry'],
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
    choices: ['Raises the propellants from low tank pressure to above chamber pressure', 'Mixes the fuel and the oxidizer before combustion', 'Cools the nozzle', 'Steers the engine'],
    answer: 0,
    explain:
      'The turbopump raises LOX and RP-1 from a few bar in the tanks to more than the 8.5 MPa chamber pressure, so the tanks can stay thin. Mixing happens at the injector, cooling in the channels of the chamber and nozzle walls, and steering is done by the gimbal actuators.',
    showAgain: { part: 'turbopump' },
    sources: ['nasa-sp125', 'nasa-grc-liquid'],
  },
  {
    id: 'prop-why-pumps',
    kind: 'why',
    topic: 'propulsion',
    prompt: 'Why does the K-1 use turbopumps instead of pressurizing its tanks enough to push the propellant into the engines?',
    choices: [
      'Tanks strong enough to hold more than 8.5 MPa would weigh more than the whole booster',
      'Pumps make the propellant burn hotter',
      'Gas pressure cannot move a liquid',
      'Pumps remove the need for a combustion chamber',
    ],
    answer: 0,
    explain:
      'Propellant must enter above the 8.5 MPa chamber pressure. With the wall rule t = p·r/σ, the 1.85 m tank radius and an illustrative 300 MPa allowable stress, a pressure-fed barrel needs at least 52 mm of aluminium: at least 30 t for the LOX barrel alone, more than the 25.5 t booster. Gas pressure certainly can move a liquid (small spacecraft engines are pressure-fed), and pumps change neither the flame temperature nor the need for a chamber.',
    showAgain: { demo: 'turbopump' },
    sources: ['nasa-sp125', 'sutton-rpe'],
  },
  {
    id: 'prop-isp-vs-thrust',
    kind: 'distinguish',
    topic: 'propulsion',
    prompt: 'In vacuum the E-1V makes less thrust than the E-1 (700 kN against 835 kN) but has a higher specific impulse (342 s against 312 s). What does the higher specific impulse mean?',
    choices: [
      'Each kilogram of propellant gives more impulse, so the same propellant produces more velocity change',
      'It pushes harder',
      'It burns its propellant faster',
      'Its flame is hotter',
    ],
    answer: 0,
    explain:
      'Thrust is force; specific impulse is efficiency, the impulse per unit weight of propellant. The E-1V has the same chamber as the E-1 but expands its exhaust much further in its large nozzle, so each kilogram leaves faster. It actually pushes less and burns propellant more slowly (about 209 kg/s against 273 kg/s), and its flame is the same.',
    showAgain: { part: 'vacuum-engine' },
    sources: ['nasa-grc-thrust', 'sutton-rpe'],
  },
  {
    id: 'prop-regen',
    kind: 'distinguish',
    topic: 'propulsion',
    prompt: 'Fuel flows through channels in the chamber wall before it is burned. What does that do?',
    choices: [
      'It carries heat away through a conductive wall, and the heat returns to the chamber with the fuel',
      'It insulates the wall from the flame',
      'It radiates the heat to space',
      'It preheats the fuel so it ignites without an igniter',
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
    sources: ['nasa-sp125', 'nasa-grc-liquid'],
  },
  {
    id: 'prop-liner-material',
    kind: 'material',
    topic: 'propulsion',
    prompt: 'Why is the E-1 combustion-chamber liner made of a copper alloy (GRCop class) rather than a heat-resistant nickel superalloy?',
    choices: [
      'Copper conducts heat about 30 times better, so heat crosses the thin wall into the fuel with a small temperature drop',
      'Copper melts at a higher temperature than nickel superalloys',
      'Copper is lighter than nickel superalloys',
      'Copper insulates the wall from the flame',
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
      'Far down the nozzle the heat flux is low enough for the glowing skin to radiate it away; in the chamber it is roughly a hundred times too high',
      'Niobium does not heat up',
      'The extension only runs for a few seconds',
      'The vacuum of space cools it by conduction',
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
      'For the same mass, holding the skins apart makes the panel about 150 times stiffer in bending',
      'Honeycomb is stronger than carbon fibre',
      'The core stores heat from the engines',
      'Solid carbon fibre cannot be made in curved shapes',
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
      'A thin cylinder buckles under compression at a small fraction of its metal’s strength',
      'The ribs hold the propellant in place',
      'Pressure keeps the propellant from boiling',
      'The metal would otherwise melt',
    ],
    answer: 0,
    explain:
      'For a 2 mm aluminium barrel of 1.85 m radius, classical theory and the NASA SP-8007 knockdown factor give a buckling stress of about 11 MPa, under 3 % of the metal’s yield strength. Orthogrid ribs stiffen the wall and internal pressure pulls the skin taut, so it can carry thrust and bending. Sloshing is handled by baffles and boil-off by venting and topping up; neither is why the shell needs ribs or pressure, and the tank is far too cold to melt.',
    showAgain: { material: 'al-li' },
    sources: ['nasa-sp8007', 'nasa-al-li-crush', 'nasa-isogrid'],
  },
  {
    id: 'struct-stiffness-vs-strength',
    kind: 'distinguish',
    topic: 'structures',
    prompt: 'Which property describes how much a part deflects under a load, as opposed to the load at which it breaks or permanently bends?',
    choices: ['Stiffness (elastic modulus)', 'Strength', 'Toughness', 'Hardness'],
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
      'An intertank; its core carries the engine thrust',
      'A slosh baffle; its core damps propellant motion',
      'A heat shield; its core protects the tank from the engine',
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
    choices: ['The carbon-fibre overwrap', 'The titanium liner', 'The helium itself', 'The valve at the neck'],
    answer: 0,
    explain:
      'The fibres wound around the bottle carry the hoop tension, the largest stress in a pressurized cylinder, along their strong direction. The thin titanium liner mainly seals the gas, which fibre and resin alone could not do. That is why even invisible damage to the overwrap disqualifies a bottle.',
    showAgain: { material: 'cfrp-copv' },
    sources: ['nasa-copv-primer'],
  },
  {
    id: 'struct-anisotropy',
    kind: 'material',
    topic: 'structures',
    prompt: 'A carbon-fibre laminate with all its fibres in one direction is pulled across the fibres. What happens?',
    choices: [
      'It is many times weaker than along the fibres, because the resin carries the load',
      'It is just as strong, because carbon is strong in every direction',
      'It is stronger, because the fibres spread the load',
      'It stretches like rubber',
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
    choices: ['Swivel the engine on its gimbal to steer the vehicle', 'Hold the engine still during launch', 'Pump hydraulic fluid into the combustion chamber', 'Open the main valves'],
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
      'By gimbaling its engines, which tilts the thrust and turns the vehicle about its centre of mass',
      'With its grid fins, like the control surfaces of an aircraft',
      'By throttling the engines on one side',
      'By pumping propellant between tanks',
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
      'Fast, self-contained measurements of rotation and acceleration that need no outside signal',
      'An absolute position fixed by satellites',
      'Radio contact with the ground',
      'The time of day',
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
      'To let the stages drift apart, so the nozzle clears the interstage and the plume does not strike the booster',
      'To let the engine cool down',
      'To wait for the fairing to separate',
      'Because the engine needs air to start',
    ],
    answer: 0,
    explain:
      'The upper-stage nozzle starts inside the interstage. Igniting too early would blast the booster, which could be pushed back into the upper stage, and would risk the nozzle striking the interstage. The engine has not yet run, the fairing comes off later, and a rocket engine carries its own oxidizer and never needs air.',
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
      'So the computers can confirm that every engine is at full, healthy thrust before committing to flight',
      'To warm up the launch mount',
      'To burn off excess propellant before liftoff',
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
      'The moment of highest dynamic pressure (½ρv²), when aerodynamic loads peak',
      'The moment of highest speed',
      'The highest point of the flight',
      'The moment of highest acceleration',
    ],
    answer: 0,
    explain:
      'q = ½ρv² grows with speed but shrinks as the air thins. Early in flight the speed wins and later the thinning air wins, so q peaks in between, typically at about 10 to 15 km. Speed and acceleration keep rising long after max-q (acceleration peaks near engine cutoff, when the vehicle is lightest), and the highest point comes much later.',
    showAgain: { mission: 'leo', phase: 'maxq' },
    sources: ['nasa-grc-dynamic-pressure', 'ussa-1976'],
  },
  {
    id: 'launch-throttle-maxq',
    kind: 'why',
    topic: 'launch',
    prompt: 'Why does the booster throttle down around max-q?',
    choices: [
      'To limit the aerodynamic load on the structure while the air pushes hardest',
      'To save propellant for landing',
      'Because the engines overheat in thick air',
      'To let the upper stage catch up',
    ],
    answer: 0,
    explain:
      'Throttling down briefly slows the gain in speed while the air is still dense, lowering the peak of q = ½ρv² so the structure can be lighter. The propellant saved is small, the engines are not limited by the outside air temperature, and the stages are still joined.',
    showAgain: { mission: 'leo', phase: 'maxq' },
    sources: ['nasa-grc-dynamic-pressure', 'nasa-bsf-14'],
  },
  {
    id: 'launch-deluge',
    kind: 'identify',
    topic: 'launch',
    part: 'sound-suppression',
    prompt: 'Just before ignition, water floods the launch mount from the highlighted system. What is it for?',
    choices: [
      'Absorbing the acoustic energy of the engines so it does not damage the vehicle and payload',
      'Putting out fires',
      'Cooling the engines',
      'Filling the propellant tanks',
    ],
    answer: 0,
    explain:
      'It is the sound-suppression deluge. Engine noise reflecting off the pad is intense enough to damage the vehicle and its payload; the water absorbs much of that energy and also protects the mount. It is not a fire system, the engines are cooled by their own fuel, and water never goes near the propellant tanks.',
    showAgain: { part: 'sound-suppression' },
    sources: ['nasa-bsf-14'],
  },
  {
    id: 'launch-no-foam',
    kind: 'material',
    topic: 'launch',
    prompt: 'The K-1 LOX tank frosts over on the pad because it has no foam insulation. Why is that acceptable?',
    choices: [
      'The LOX is loaded shortly before launch and topped up as it boils off, and the frost falls away early in flight',
      'Frost is a better insulator than foam',
      'LOX does not boil at outdoor temperatures',
      'The frost protects the tank from aerodynamic heating',
    ],
    answer: 0,
    explain:
      'Foam matters for propellants held cold for a long time, above all liquid hydrogen. The K-1’s short hold and continuous topping up make extra boil-off harmless, and leaving the foam off saves mass and removes a source of debris. LOX certainly boils at outdoor temperatures (it boils at 90 K), and the thin frost is neither a designed insulator nor a heat shield.',
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
      'It is falling, but it moves sideways so fast (7.67 km/s) that the Earth curves away beneath it',
      'There is no gravity in space',
      'The thin air holds it up',
      'Its solar arrays push it away from the Sun',
    ],
    answer: 0,
    explain:
      'In one second at 7,673 m/s the satellite falls 4.35 m and travels 7.67 km, over which the Earth’s surface drops by the same 4.35 m, so it never gets closer. Gravity is very much present (8.69 m/s²): it is what bends the path into a circle. The thin air does the opposite of holding it up: it slowly drags the orbit down.',
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
      'The lowest point, where the satellite moves fastest',
      'Any point where the orbit crosses the equator',
      'The point where the satellite separates',
    ],
    answer: 0,
    explain:
      'Apoapsis is the highest point of an orbit and periapsis the lowest. On the transfer orbit the satellite climbs from about 200 km (periapsis, fastest) to 35,786 km (apoapsis, slowest), where its apogee engine burns to circularize. On this mission the apoapsis is placed over the equator on purpose, but crossing the equator is not what defines it, and separation happens near periapsis.',
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
      'Apogee-engine burn by the satellite',
    ],
    answer: [1, 3, 2, 4, 0, 5],
    explain:
      'The upper stage first reaches a low parking orbit and coasts until it is at the right place (a crossing of the equator). Settling thrusters push the floating propellant back over the tank outlets before the restart. The second burn raises the far point to 35,786 km; the satellite then separates and, hours later at apogee, fires its own engine to circularize.',
    showAgain: { mission: 'gto', phase: 'restart' },
    sources: ['nasa-bsf-4'],
  },
  {
    id: 'orbit-phasing',
    kind: 'why',
    topic: 'orbit',
    prompt: 'Why is the capsule inserted into a lower orbit behind the station instead of straight into the station’s orbit beside it?',
    choices: [
      'A lower orbit is faster (shorter period), so the capsule catches up gradually and then raises its orbit to meet the station',
      'The capsule cannot reach 400 km',
      'To keep away from the station’s solar arrays',
      'Because lower orbits have no drag',
    ],
    answer: 0,
    explain:
      'That is phasing: the lower, faster orbit lets the capsule close the gap over several orbits, and a pair of burns then raises it to just below the station for the final approach. Launch timing alone cannot put a spacecraft exactly beside a target at exactly matched speed. The capsule can reach the station’s altitude (it does, later), and lower orbits have more drag, not less.',
    showAgain: { mission: 'station', phase: 'phasing' },
    sources: ['nasa-ntrs-rendezvous', 'nasa-bsf-4'],
  },
  {
    id: 'orbit-parking-vs-transfer',
    kind: 'distinguish',
    topic: 'orbit',
    prompt: 'What is the difference between the parking orbit and the transfer orbit in the geostationary mission?',
    choices: [
      'The parking orbit is a low, temporary orbit for coasting to the right point; the transfer orbit is an ellipse reaching up to geostationary altitude',
      'They are the same orbit under two names',
      'The parking orbit is geostationary; the transfer orbit is low',
      'The transfer orbit is where the satellite spends its working life',
    ],
    answer: 0,
    explain:
      'The upper stage first reaches a low parking orbit (about 200 km) and coasts to the burn point. The second burn puts the satellite on a transfer orbit, an ellipse from about 200 km up to 35,786 km. Neither is the final working orbit: the satellite circularizes at geostationary altitude itself.',
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
      'Blocking radiated heat in vacuum, to keep the equipment within its temperature range',
      'Protecting the satellite from the air during launch',
      'Generating electrical power',
      'Stopping micrometeoroids by being very hard',
    ],
    answer: 0,
    explain:
      'They are multilayer insulation. In vacuum heat travels mainly by radiation, and each shiny layer reflects most of it back, keeping sunlight out on one side and heat in on the cold side. The fairing handled the air during launch, the solar arrays make the power, and thin films are not armour.',
    showAgain: { part: 'mli-blankets' },
    sources: ['nasa-mli-guidelines'],
  },
  {
    id: 'orbit-settling',
    kind: 'why',
    topic: 'orbit',
    prompt: 'Before restarting its engine in orbit, the upper stage fires small thrusters for a while. Why?',
    choices: [
      'In free fall the propellant floats; a gentle push settles it over the tank outlets so the pumps get liquid, not gas',
      'To warm up the engine',
      'To change the orbit before the main burn',
      'To separate the payload',
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
      'The heat shield faces the most intense heating, which an ablator absorbs by charring away; the gentler heating of the backshell can be handled by reusable insulation',
      'Tiles are too heavy for the heat shield',
      'Ablators only work on curved surfaces',
      'The backshell faces forward during entry',
    ],
    answer: 0,
    explain:
      'Entering heat shield first, the blunt shield takes the peak heat flux; a charring ablator absorbs and blocks it by pyrolysis, blowing and re-radiation, and is replaced after the flight. The backshell sits in the capsule’s wake with much lower heating, so light silica tiles that insulate and re-radiate without being consumed are enough, and they can fly again. The tiles are actually very light, and the backshell faces aft.',
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
      'An ablative heat shield that absorbs and blocks heat as it slowly chars and burns away',
      'Polished metal that reflects the heat',
      'Water-cooled copper panels',
      'Ceramic tiles that are reused unchanged',
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
      'To cancel its downrange speed and send it back toward the landing zone near the launch site',
      'To push the upper stage faster',
      'To reach orbit itself',
      'To burn off leftover propellant before landing',
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
      'The service module engine performs the deorbit burn, then the service module is discarded before entry so that the heat shield is exposed. The capsule reaches entry interface and goes through peak heating; then, far lower and slower, the drogues stabilize and slow it, and the mains (reefed, then fully open) bring it down to about 8 m/s for splashdown.',
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
      'To stop them burning in hot air',
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
      'Titanium keeps its strength at the temperatures the fins reach during entry, so they need no ablative coating and can be reused',
      'Titanium is lighter than aluminium',
      'Titanium is cheaper and easier to machine',
      'Titanium conducts the heat away into the tanks',
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
      'Even at minimum throttle one engine gives more thrust than the nearly empty booster weighs, so three would decelerate it far too hard',
      'The outer engines have run out of propellant',
      'Only the centre engine can restart',
      'To keep the landing legs cool',
    ],
    answer: 0,
    explain:
      'One E-1 at its 55 % minimum throttle makes about 418 kN at sea level, against about 250 kN of weight for a booster near its 25,500 kg dry mass: a thrust-to-weight ratio of about 1.67. It cannot hover, so the burn is timed to reach zero speed just at the ground, and more engines would only make that harder. All engines draw from the same tanks, and three of them already restarted for the boostback and entry burns.',
    showAgain: { mission: 'leo', phase: 'landing-burn' },
    sources: ['nasa-grc-thrust'],
  },
  {
    id: 'return-textiles',
    kind: 'material',
    topic: 'return',
    prompt: 'The capsule’s parachute risers are aramid (Kevlar class) rather than steel cable. Why?',
    choices: [
      'Aramid is far stronger than steel per kilogram and chars rather than melting near the hot capsule',
      'Aramid is cheaper than steel',
      'Steel cable would rust at sea',
      'Aramid stretches more, which softens the opening shock',
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
      'The satellite reaches about 7.7 km/s of sideways speed; the capsule has almost none, so it falls back',
      'The satellite goes higher, out of reach of gravity',
      'The capsule is heavier',
      'The satellite uses its engine to hover',
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
      'The satellite’s own engine finishes the job at the far point hours later, so the upper stage needs no long coast and third burn',
      'The upper stage has no engine left',
      'Rocket stages are not allowed to reach geostationary altitude',
      'The satellite is so light that circularizing needs almost no propellant',
    ],
    answer: 0,
    explain:
      'The transfer orbit takes about 5 hours to climb to its far point. Taking the whole upper stage there would mean a long coast (batteries, thermal control, propellant boil-off) and a third burn; many launch vehicles instead hand over at the transfer orbit and let the satellite circularize, and remove the 28.5° inclination, with its apogee engine. The upper stage still works, nothing forbids reaching geostationary altitude, and circularizing takes a large share of the satellite’s propellant.',
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
      'The upper stage waits in a parking orbit for the right departure point, then the trans-lunar injection burn raises the orbit out to the Moon’s distance, and the probe separates. About three days later it crosses into the Moon’s sphere of influence (about 66,000 km), passes closest behind the Moon and, having made no braking burn, leaves on its bent, outbound path.',
    showAgain: { mission: 'lunar', phase: 'soi' },
    sources: ['nasa-bsf-4'],
  },
  {
    id: 'missions-flyby',
    kind: 'distinguish',
    topic: 'missions',
    prompt: 'At the Moon the probe passes about 1,000 to 3,000 km above the far side and flies on. What makes this a flyby rather than an orbit insertion?',
    choices: [
      'It makes no braking burn, so relative to the Moon it is too fast to be captured; the Moon only bends its path',
      'It is too far from the Moon for lunar gravity to act',
      'Probes cannot orbit the Moon',
      'It passes the near side',
    ],
    answer: 0,
    explain:
      'Arriving from Earth, the probe falls toward the Moon faster than the Moon’s escape speed at that distance, so without a braking burn it swings around and leaves. The Moon’s gravity is strong there: it is what bends the path. Many probes do enter lunar orbit, by firing an engine near closest approach, and which side it passes does not decide capture.',
    showAgain: { mission: 'lunar', phase: 'flyby' },
    sources: ['nasa-bsf-4'],
  },
  {
    id: 'missions-abort-tower',
    kind: 'identify',
    topic: 'missions',
    part: 'launch-abort-system',
    prompt: 'Only the crewed configuration carries the highlighted tower on top of the capsule. What is it?',
    choices: [
      'The launch abort system, which can pull the capsule away from a failing launch vehicle',
      'A lightning rod',
      'The docking probe',
      'A communications antenna',
    ],
    answer: 0,
    explain:
      'It is the launch abort tower: solid rocket motors that can lift the capsule clear of the vehicle in an emergency. It is jettisoned after staging, once it is no longer needed. Lightning protection is on the pad’s own masts, the docking system sits under the capsule’s nose cover, and antennas are small and flush.',
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
