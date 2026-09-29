/**
 * Glossary: plain definitions, each linked to where the learner can see the idea (a part, a
 * demo, or a mission phase). Link integrity is checked by src/content/content.test.ts.
 */
import type { GlossaryTerm } from './types';

export const GLOSSARY: GlossaryTerm[] = [
  // Propellants and engines
  {
    id: 'propellant',
    term: 'Propellant',
    definition:
      'Everything a rocket carries to make thrust: fuel plus oxidizer. The K-1 burns RP-1, a refined kerosene, with liquid oxygen, and carries both in its own tanks.',
    see: [{ part: 's1-fuel-tank' }, { demo: 'tank-drain' }],
    aliases: ['fuel', 'RP-1', 'kerosene'],
  },
  {
    id: 'oxidizer',
    term: 'Oxidizer',
    definition:
      'The propellant that supplies the oxygen (or another oxidizing chemical) for combustion, so a rocket engine needs no air and works in vacuum. The K-1 uses liquid oxygen (LOX); the capsule service module uses nitrogen tetroxide.',
    see: [{ part: 's1-lox-tank' }, { demo: 'feed-flow' }],
    aliases: ['LOX', 'liquid oxygen', 'oxidiser'],
  },
  {
    id: 'mixture-ratio',
    term: 'Mixture ratio',
    definition: 'The mass of oxidizer per mass of fuel entering an engine. The E-1 runs at 2.3 kg of LOX per kilogram of RP-1, which is why the LOX tank is the larger one.',
    see: [{ part: 'injector' }, { demo: 'combustion' }],
    aliases: ['O/F ratio'],
  },
  {
    id: 'cryogenic',
    term: 'Cryogenic',
    definition:
      'Very cold: a propellant that is liquid only far below ambient temperature, such as liquid oxygen (boils at 90 K, -183 °C) or liquid hydrogen (20 K). Cryogenic tanks must be tough when cold and they frost over in humid air.',
    see: [{ part: 's1-lox-tank' }, { mission: 'leo', phase: 'pad' }],
    aliases: ['cryogen', 'cryo'],
  },
  {
    id: 'boil-off',
    term: 'Boil-off',
    definition: 'Evaporation of a cryogenic propellant as heat leaks in. On the pad the K-1 vents the oxygen vapour (the white plumes are moist air chilled by it) and keeps topping up its LOX until shortly before launch.',
    see: [{ mission: 'leo', phase: 'pad' }, { part: 'service-tower' }],
  },
  {
    id: 'hypergolic',
    term: 'Hypergolic',
    definition:
      'Describes propellants that ignite on contact, with no spark or igniter, such as nitrogen tetroxide with hydrazine-family fuels (used by the service module), or TEA-TEB with liquid oxygen (used to light the E-1).',
    see: [{ part: 'igniter' }, { part: 'service-module' }],
    aliases: ['hypergol'],
  },
  {
    id: 'tea-teb',
    term: 'TEA-TEB',
    definition:
      'Triethylaluminium mixed with triethylborane: a liquid that ignites on contact with oxygen with a green flash (from the boron). A small charge of it lights each E-1 start; the upper-stage engine carries enough for its restarts.',
    see: [{ part: 'igniter' }, { mission: 'leo', phase: 'ignition' }],
    aliases: ['triethylaluminium-triethylborane', 'green flash'],
  },
  {
    id: 'thrust',
    term: 'Thrust',
    definition:
      'The force an engine produces, in newtons: gas pressure on the inside of the chamber and nozzle as the exhaust is accelerated out. It does not come from the exhaust pushing on the air: rockets work in vacuum, and work best there, because no outside pressure pushes back on the nozzle exit.',
    see: [{ part: 'engine' }, { demo: 'combustion' }],
  },
  {
    id: 'specific-impulse',
    term: 'Specific impulse',
    definition:
      'Thrust divided by the weight of propellant used per second, in seconds; equivalently, the effective exhaust velocity divided by 9.80665 m/s². Higher specific impulse means more velocity change from the same propellant. E-1: 285 s at sea level, 312 s in vacuum; E-1V: 342 s in vacuum.',
    see: [{ part: 'vacuum-engine' }, { demo: 'nozzle-pressure' }],
    aliases: ['Isp'],
  },
  {
    id: 'thrust-to-weight',
    term: 'Thrust-to-weight ratio',
    definition: 'Thrust divided by the vehicle’s weight. It must exceed 1 for a rocket to leave the pad; the K-1 lifts off at about 1.2, so more than four fifths of its early thrust only holds it up.',
    see: [{ mission: 'leo', phase: 'liftoff' }],
    aliases: ['T/W'],
  },
  {
    id: 'chamber-pressure',
    term: 'Chamber pressure',
    definition:
      'The pressure of the burning gas inside the combustion chamber: 8.5 MPa in the E-1. Higher pressure gives a more compact, more efficient engine, but demands more pump power and a stronger chamber.',
    see: [{ part: 'combustion-chamber' }, { demo: 'turbopump' }],
  },
  {
    id: 'turbopump',
    term: 'Turbopump',
    definition:
      'A pump driven by a turbine on the same shaft. It raises the propellants from low tank pressure to above chamber pressure, so the tanks can stay thin and light. The E-1 pump spins at about 32,000 rpm (illustrative).',
    see: [{ part: 'turbopump' }, { demo: 'turbopump' }],
    aliases: ['pump', 'turbine'],
  },
  {
    id: 'gas-generator',
    term: 'Gas generator',
    definition:
      'A small combustor that burns a little propellant fuel-rich, so its gas is cool enough for the turbine, to drive the turbopump. In the gas-generator cycle the turbine exhaust is dumped overboard (about 3 % of the E-1 flow), which costs a little specific impulse in exchange for simplicity.',
    see: [{ part: 'gas-generator' }, { demo: 'turbopump' }],
    aliases: ['GG', 'gas-generator cycle'],
  },
  {
    id: 'injector',
    term: 'Injector',
    definition: 'The plate at the head of the combustion chamber, drilled with many small orifices that spray fuel and oxidizer so that they mix and burn evenly at the chosen mixture ratio.',
    see: [{ part: 'injector' }, { demo: 'combustion' }],
  },
  {
    id: 'regenerative-cooling',
    term: 'Regenerative cooling',
    definition:
      'Cooling the chamber and nozzle by running fuel through channels in their walls before it is burned. The wall must conduct heat well; the heat is carried off by the fuel and returned to the chamber instead of being lost.',
    see: [{ part: 'combustion-chamber' }, { demo: 'regen-cooling' }],
    aliases: ['regen', 'regen cooling'],
  },
  {
    id: 'radiative-cooling',
    term: 'Radiative cooling',
    definition:
      'Cooling a thin, uncooled wall by letting it glow and radiate heat to space. It works only where the heat flux is low, such as far down a vacuum nozzle extension, not in a chamber or throat.',
    see: [{ part: 'nozzle-extension' }, { demo: 'regen-cooling' }],
    aliases: ['radiation cooling'],
  },
  {
    id: 'throat',
    term: 'Throat',
    definition:
      'The narrowest section of the nozzle, where the flow reaches the speed of sound. With the chamber pressure, its area sets the mass flow; the heat flux there is the highest anywhere in the engine.',
    see: [{ part: 'combustion-chamber' }, { demo: 'nozzle-pressure' }],
  },
  {
    id: 'expansion-ratio',
    term: 'Expansion ratio',
    definition:
      'Nozzle exit area divided by throat area. A larger ratio expands the gas to lower pressure and higher speed: 18 for the sea-level E-1, 110 for the vacuum E-1V.',
    see: [{ part: 'nozzle' }, { part: 'nozzle-extension' }, { demo: 'nozzle-pressure' }],
    aliases: ['area ratio', 'nozzle expansion ratio'],
  },
  {
    id: 'flow-separation',
    term: 'Flow separation (nozzle)',
    definition:
      'When a nozzle expands its exhaust to far below the outside air pressure, the flow detaches from the wall inside the bell, creating unsteady side loads. It is why a vacuum nozzle is not fired at sea level.',
    see: [{ demo: 'nozzle-pressure' }, { part: 'nozzle-extension' }],
  },
  {
    id: 'throttling',
    term: 'Throttling',
    definition: 'Reducing an engine’s thrust by reducing its propellant flow. The E-1 can throttle to 55 % of rated thrust; the booster throttles down around max-q and for its landing burn.',
    see: [{ part: 'main-valves' }, { mission: 'leo', phase: 'maxq' }],
    aliases: ['throttle down'],
  },
  {
    id: 'ullage',
    term: 'Ullage',
    definition:
      'The gas-filled space above the liquid in a tank (the K-1 tanks are sized with 3 % extra volume for it). In free fall the liquid can drift away from the tank outlets, so before restarting in orbit a stage fires small thrusters (an ullage or settling burn) to push the propellant back to the bottom.',
    see: [{ part: 's2-rcs' }, { mission: 'gto', phase: 'restart' }],
    aliases: ['settling burn', 'ullage burn'],
  },
  {
    id: 'pressurant',
    term: 'Pressurant',
    definition:
      'Gas fed into the propellant tanks as they drain, so the pumps receive propellant at the right inlet pressure and the thin tank walls stay stiff. The K-1 uses helium stored cold in COPVs.',
    see: [{ part: 'pressurization' }, { demo: 'tank-pressure' }],
    aliases: ['helium pressurization', 'tank pressurization'],
  },
  {
    id: 'copv',
    term: 'COPV',
    definition:
      'Composite overwrapped pressure vessel: a thin, gas-tight metal liner wound with carbon fibre, which carries most of the load. The K-1 stores its helium and nitrogen in COPVs.',
    see: [{ part: 'pressurization' }, { part: 'cold-gas-rcs' }],
    aliases: ['composite overwrapped pressure vessel'],
  },
  // Structures and materials
  {
    id: 'common-bulkhead',
    term: 'Common bulkhead',
    definition:
      'A single dome shared by two tanks, so the upper stage needs no intertank between them. It saves length and mass but must insulate the propellants from each other; the K-1 uses an insulating honeycomb core.',
    see: [{ part: 'common-bulkhead' }, { demo: 'tank-pressure' }],
  },
  {
    id: 'intertank',
    term: 'Intertank',
    definition: 'The unpressurized structural section between two separate tanks. On the K-1 booster it joins the LOX tank above to the RP-1 tank below and carries loads between them.',
    see: [{ part: 's1-intertank' }],
  },
  {
    id: 'interstage',
    term: 'Interstage',
    definition: 'The structure between the booster and the upper stage. It carries the upper stage during ascent and surrounds its engine nozzle until separation.',
    see: [{ part: 'interstage' }, { mission: 'leo', phase: 'staging' }],
  },
  {
    id: 'pressure-stabilization',
    term: 'Pressure stabilization',
    definition:
      'Using internal tank pressure to put a thin skin in tension so it resists buckling under thrust and bending loads. Some historic stages relied on it entirely; the K-1 uses it together with orthogrid stiffening.',
    see: [{ demo: 'tank-pressure' }, { part: 's1-lox-tank' }],
    aliases: ['balloon tank'],
  },
  {
    id: 'buckling',
    term: 'Buckling',
    definition:
      'Sudden collapse of a thin structure under compression, at a load set by its stiffness and shape rather than by the strength of the material. A thin tank barrel buckles at a small fraction of its metal’s yield strength unless it is stiffened or pressurized.',
    see: [{ demo: 'tank-pressure' }, { part: 's1-fuel-tank' }],
  },
  {
    id: 'orthogrid',
    term: 'Orthogrid',
    definition: 'A tank wall machined from thick plate into a thin skin with a square grid of integral ribs, which stiffen the wall against buckling for little added mass (isogrid uses triangles).',
    see: [{ part: 's1-lox-tank' }, { demo: 'tank-pressure' }],
    aliases: ['isogrid', 'integral stiffening'],
  },
  {
    id: 'friction-stir-welding',
    term: 'Friction stir welding',
    definition:
      'Joining metal without melting it: a spinning pin plunged into the seam heats the metal by friction until it is soft and stirs the two edges together. It avoids the porosity and cracking of fusion welds in aluminium-lithium tank walls.',
    see: [{ part: 's1-lox-tank' }, { part: 's2-tanks' }],
    aliases: ['FSW'],
  },
  {
    id: 'anisotropy',
    term: 'Anisotropy',
    definition:
      'Having properties that depend on direction. A carbon-fibre laminate is very strong along its fibres and much weaker across them, where the resin carries the load; designers lay plies in the directions the loads run.',
    see: [{ demo: 'sandwich-panel' }, { part: 'fairing' }],
    aliases: ['anisotropic'],
  },
  {
    id: 'sandwich-panel',
    term: 'Sandwich panel',
    definition:
      'Two thin, stiff face sheets bonded to a light core that holds them apart. The skins carry bending, the core carries shear, and bending stiffness grows with the square of the skin separation, so the panel is very stiff for its mass.',
    see: [{ part: 'fairing' }, { part: 'interstage' }, { demo: 'sandwich-panel' }],
    aliases: ['honeycomb sandwich', 'sandwich structure'],
  },
  {
    id: 'ndi',
    term: 'Non-destructive inspection',
    definition:
      'Checking a part for hidden flaws without damaging it: X-ray, ultrasound, infrared thermography, penetrant dye, leak and proof tests. Essential for composites, where a disbond or delamination may leave no mark on the surface.',
    see: [{ demo: 'sandwich-panel' }, { part: 'fairing' }],
    aliases: ['NDI', 'NDT', 'non-destructive testing'],
  },
  // Guidance and ascent
  {
    id: 'gimbal-tvc',
    term: 'Gimbal and thrust vector control',
    definition:
      'Steering by swivelling an engine on a pivot (the gimbal) with actuators, so the thrust line passes to one side of the centre of mass and turns the vehicle. The E-1 gimbals up to 5° in any direction.',
    see: [{ part: 'tvc-actuators' }, { demo: 'tvc' }],
    aliases: ['gimbal', 'TVC', 'thrust vector control'],
  },
  {
    id: 'imu',
    term: 'Inertial measurement unit',
    definition:
      'Gyroscopes and accelerometers that measure the vehicle’s rotation and acceleration hundreds of times a second, independent of any outside signal. The flight computer integrates them to know attitude, velocity and position, and corrects slow drift with satellite navigation.',
    see: [{ part: 'avionics' }, { demo: 'gnc-loop' }],
    aliases: ['IMU', 'inertial navigation', 'gyroscope', 'accelerometer'],
  },
  {
    id: 'gravity-turn',
    term: 'Gravity turn',
    definition:
      'The ascent technique of tilting slightly just after clearing the tower (the pitch kick), then keeping the vehicle aligned with its air-relative velocity and letting gravity bend the path toward horizontal. It keeps aerodynamic side loads low and wastes little velocity climbing vertically.',
    see: [{ mission: 'leo', phase: 'pitchover' }, { demo: 'gnc-loop' }],
    aliases: ['pitch kick', 'pitch-over'],
  },
  {
    id: 'dynamic-pressure',
    term: 'Dynamic pressure',
    definition: 'q = ½ρv²: how hard the oncoming air pushes on the vehicle, in pascals, where ρ is the air density and v the speed relative to the air. Aerodynamic forces are proportional to it (force = q × area × a coefficient).',
    see: [{ mission: 'leo', phase: 'maxq' }, { mission: 'station', phase: 'maxq' }],
    aliases: ['q'],
  },
  {
    id: 'max-q',
    term: 'Max-q',
    definition:
      'The moment of maximum dynamic pressure during ascent, when the aerodynamic load on the structure peaks: the air is thinning, but the vehicle is still accelerating. Engines are often throttled down around it.',
    see: [{ mission: 'leo', phase: 'maxq' }, { mission: 'station', phase: 'maxq' }],
    aliases: ['max q', 'maximum dynamic pressure'],
  },
  {
    id: 'mach-number',
    term: 'Mach number',
    definition: 'Speed divided by the local speed of sound. The K-1 passes Mach 1 while still low in the atmosphere, shortly before max-q; shock waves then form at its nose and wherever its shape changes.',
    see: [{ mission: 'leo', phase: 'maxq' }],
    aliases: ['Mach', 'supersonic'],
  },
  {
    id: 'staging',
    term: 'Staging',
    definition:
      'Discarding an empty stage (its tanks and engines) in flight so the rest of the vehicle stops carrying dead mass. The K-1 has two stages, separated by pneumatic pushers after the booster engines shut down.',
    see: [{ demo: 'staging-sequence' }, { mission: 'leo', phase: 'staging' }, { part: 'stage-separation' }],
    aliases: ['stage separation'],
  },
  {
    id: 'meco',
    term: 'MECO',
    definition: 'Main engine cutoff: shutdown of the booster engines, a few seconds before stage separation.',
    see: [{ mission: 'leo', phase: 'meco' }],
    aliases: ['main engine cutoff', 'booster engine cutoff'],
  },
  {
    id: 'seco',
    term: 'SECO',
    definition: 'Second-stage engine cutoff: the end of an upper-stage burn. On the LEO mission it comes about 8.5 minutes after liftoff, once the stage is in orbit.',
    see: [{ mission: 'leo', phase: 'seco' }],
    aliases: ['second engine cutoff'],
  },
  {
    id: 'payload-fairing',
    term: 'Payload fairing',
    definition:
      'The two-part nose cover that protects the payload from air pressure, heating and noise while the vehicle climbs through the atmosphere. It is dropped once the air is too thin to matter: it does not protect against the vacuum of space.',
    see: [{ part: 'fairing' }, { mission: 'leo', phase: 'fairing' }, { demo: 'fairing-sep' }],
    aliases: ['fairing', 'nose cone', 'shroud'],
  },
  {
    id: 'clamp-band',
    term: 'Clamp band',
    definition: 'A tensioned ring that clamps the payload to the payload adapter. At separation it is released and springs push the satellite gently away.',
    see: [{ part: 'payload-adapter' }, { mission: 'leo', phase: 'deploy' }],
    aliases: ['Marman clamp', 'separation springs'],
  },
  // Launch site
  {
    id: 'hold-down',
    term: 'Hold-down clamps',
    definition: 'Clamps on the launch mount that hold the vehicle down after the engines ignite, until the computers confirm full, healthy thrust; only then do they release it.',
    see: [{ part: 'launch-mount' }, { mission: 'leo', phase: 'ignition' }],
    aliases: ['hold-downs', 'launch mount'],
  },
  {
    id: 'sound-suppression',
    term: 'Sound suppression',
    definition:
      'A deluge of water sprayed under and around the launch mount at ignition. The water absorbs acoustic energy that would otherwise reflect off the pad and shake the vehicle and payload.',
    see: [{ part: 'sound-suppression' }, { mission: 'leo', phase: 'ignition' }],
    aliases: ['water deluge', 'deluge'],
  },
  {
    id: 'karman-line',
    term: 'Kármán line',
    definition:
      'The altitude of 100 km conventionally used as the boundary of space; in this simulator labels switch to “in space” above it. The atmosphere has no sharp edge: it keeps thinning gradually far above it.',
    see: [{ mission: 'suborbital', phase: 'apogee' }],
    aliases: ['Karman line', '100 km', 'edge of space'],
  },
  // Orbits and maneuvers
  {
    id: 'low-earth-orbit',
    term: 'Low Earth orbit',
    definition: 'An orbit a few hundred kilometres up, below about 2,000 km. At the K-1’s 400 km target the circular speed is about 7.67 km/s and one orbit takes about 92 minutes.',
    see: [{ mission: 'leo', phase: 'seco' }, { mission: 'leo', phase: 'coast' }],
    aliases: ['LEO'],
  },
  {
    id: 'apoapsis',
    term: 'Apoapsis',
    definition: 'The highest point of an orbit, farthest from the centre of the body being orbited. For orbits around the Earth it is also called the apogee.',
    see: [{ mission: 'gto', phase: 'transfer-coast' }, { mission: 'suborbital', phase: 'apogee' }],
    aliases: ['apogee'],
  },
  {
    id: 'periapsis',
    term: 'Periapsis',
    definition: 'The lowest point of an orbit, closest to the centre of the body being orbited. For orbits around the Earth it is also called the perigee.',
    see: [{ mission: 'gto', phase: 'gto-injection' }, { mission: 'return', phase: 'deorbit' }],
    aliases: ['perigee'],
  },
  {
    id: 'delta-v',
    term: 'Delta-v',
    definition:
      'A change of velocity, in m/s: what a maneuver requires, or what a stage can deliver according to the rocket equation. Mission planners budget it the way a traveller budgets money.',
    see: [{ demo: 'staging-sequence' }, { mission: 'gto', phase: 'circularize' }],
    aliases: ['Δv', 'dv'],
  },
  {
    id: 'parking-orbit',
    term: 'Parking orbit',
    definition: 'A temporary low orbit in which the upper stage coasts until it reaches the right point for its next burn, for example over the equator for a geostationary transfer.',
    see: [{ mission: 'gto', phase: 'parking-coast' }, { mission: 'lunar', phase: 'parking-coast' }],
  },
  {
    id: 'transfer-orbit',
    term: 'Transfer orbit',
    definition:
      'An elliptical orbit connecting two others: one burn enters it, and a second burn at its far point completes the change. A geostationary transfer orbit reaches from a low parking orbit up to 35,786 km.',
    see: [{ mission: 'gto', phase: 'gto-injection' }, { mission: 'gto', phase: 'transfer-coast' }],
    aliases: ['GTO', 'geostationary transfer orbit', 'Hohmann transfer'],
  },
  {
    id: 'geostationary-orbit',
    term: 'Geostationary orbit',
    definition: 'A circular orbit 35,786 km above the equator whose period equals one rotation of the Earth (a special case of a geosynchronous orbit), so a satellite there appears fixed in the sky. Communications satellites use it.',
    see: [{ mission: 'gto', phase: 'circularize' }],
    aliases: ['GEO', 'geosynchronous'],
  },
  {
    id: 'circularization',
    term: 'Circularization',
    definition: 'A burn at apoapsis that raises periapsis until the orbit is round. On the LEO mission the upper stage makes a short one at 400 km; in the GTO mission the satellite’s own apogee engine does it (shown explanatorily as one long burn).',
    see: [{ mission: 'gto', phase: 'circularize' }, { mission: 'leo', phase: 'coast' }, { part: 'apogee-engine' }],
  },
  {
    id: 'inclination',
    term: 'Inclination',
    definition: 'The tilt of an orbit’s plane relative to the equator. A launch due east from 28.5° N gives an inclination of 28.5°; changing it later costs a lot of delta-v.',
    see: [{ mission: 'station', phase: 'liftoff' }, { mission: 'gto', phase: 'circularize' }],
  },
  {
    id: 'trans-lunar-injection',
    term: 'Trans-lunar injection',
    definition: 'The burn that raises an orbit’s far point out to the Moon’s distance, timed so that the Moon is there when the spacecraft arrives about three days later.',
    see: [{ mission: 'lunar', phase: 'tli' }],
    aliases: ['TLI'],
  },
  {
    id: 'sphere-of-influence',
    term: 'Sphere of influence',
    definition:
      'The region around a body inside which its gravity is treated as the main pull when calculating a trajectory. The Moon’s extends about 66,000 km from its centre; the probe’s path is best described relative to the Moon while inside it.',
    see: [{ mission: 'lunar', phase: 'soi' }],
    aliases: ['SOI'],
  },
  {
    id: 'flyby',
    term: 'Flyby',
    definition:
      'Passing close to a body without stopping. Its gravity bends the spacecraft’s path and changes its direction and speed relative to the Earth, but without a braking burn the spacecraft leaves again: a flyby is not an orbit insertion.',
    see: [{ mission: 'lunar', phase: 'flyby' }, { mission: 'lunar', phase: 'outbound' }],
    aliases: ['gravity assist', 'swing-by'],
  },
  {
    id: 'rendezvous',
    term: 'Rendezvous',
    definition: 'Bringing two spacecraft to the same place in the same orbit at the same time, with matching velocities, so they can approach and dock.',
    see: [{ mission: 'station', phase: 'phasing' }, { mission: 'station', phase: 'approach' }],
  },
  {
    id: 'phasing',
    term: 'Phasing',
    definition:
      'Adjusting where a spacecraft is along its orbit relative to a target by flying a slightly different orbit for a while. A lower orbit has a shorter period, so a chaser below and behind the station gradually catches up.',
    see: [{ mission: 'station', phase: 'phasing' }, { mission: 'station', phase: 'raise' }],
    aliases: ['phasing orbit'],
  },
  {
    id: 'docking',
    term: 'Docking',
    definition:
      'Joining two spacecraft. Soft capture latches them together gently while the mechanism absorbs the remaining motion; hard capture then pulls the rings together with structural latches and seals the interface so the hatch can open.',
    see: [{ part: 'docking-system' }, { mission: 'station', phase: 'docking' }],
    aliases: ['soft capture', 'hard capture'],
  },
  {
    id: 'r-bar',
    term: 'R-bar approach',
    definition:
      'Approaching a station along the radial line from below (the line through the Earth’s centre). Orbital mechanics tends to slow a chaser that is below and closing, which makes this approach naturally forgiving.',
    see: [{ mission: 'station', phase: 'approach' }],
    aliases: ['radial approach'],
  },
  // Return and recovery
  {
    id: 'boostback',
    term: 'Boostback burn',
    definition:
      'After separation, the recoverable booster flips around and fires three engines to cancel its downrange speed and send itself back toward the landing zone near the launch site.',
    see: [{ mission: 'leo', phase: 'boostback' }, { demo: 'booster-recovery' }],
    aliases: ['boostback'],
  },
  {
    id: 'entry-burn',
    term: 'Entry burn',
    definition: 'A short burn as the falling booster re-enters the denser atmosphere, slowing it so that heating and aerodynamic loads stay within what the stage can take.',
    see: [{ mission: 'leo', phase: 'entry-burn' }, { demo: 'booster-recovery' }],
  },
  {
    id: 'grid-fin',
    term: 'Grid fin',
    definition:
      'A lattice of small flat plates in a frame. Grid fins steer the falling booster, stay effective at high Mach number, and fold flat against the stage during ascent.',
    see: [{ part: 'grid-fins' }, { mission: 'leo', phase: 'aero-guidance' }],
    aliases: ['lattice fin'],
  },
  {
    id: 'landing-burn',
    term: 'Landing burn',
    definition:
      'The final burn on the centre engine that brings the booster to zero speed at touchdown. Even at minimum throttle one engine outweighs the nearly empty stage, so it cannot hover: ignition must be timed to reach zero speed exactly at the ground.',
    see: [{ mission: 'leo', phase: 'landing-burn' }, { part: 'landing-legs' }],
    aliases: ['hoverslam', 'suicide burn'],
  },
  {
    id: 'deorbit-burn',
    term: 'Deorbit burn',
    definition: 'A retrograde burn that lowers the far side of the orbit into the atmosphere so the spacecraft re-enters at a chosen place. For the capsule it takes about 100 m/s.',
    see: [{ mission: 'return', phase: 'deorbit' }, { part: 'service-module' }],
    aliases: ['retro burn'],
  },
  {
    id: 'entry-interface',
    term: 'Entry interface',
    definition: 'The conventional altitude, about 120 km (400,000 ft), at which a returning spacecraft is considered to enter the atmosphere and entry heating begins to matter.',
    see: [{ mission: 'return', phase: 'entry' }, { mission: 'suborbital', phase: 'entry' }],
    aliases: ['EI', 'reentry'],
  },
  {
    id: 'peak-heating',
    term: 'Peak heating and plasma blackout',
    definition:
      'The part of entry where the heat flux into the shield is greatest. The shock-heated air around the capsule becomes an ionized plasma that can block radio signals for a few minutes.',
    see: [{ mission: 'return', phase: 'blackout' }, { part: 'heat-shield' }],
    aliases: ['blackout', 'plasma'],
  },
  {
    id: 'ablation',
    term: 'Ablation',
    definition:
      'Protecting a surface by letting it be consumed: the heat-shield resin decomposes into gas and char, the gas blows into the boundary layer and blocks heat, and the surface slowly recedes. Single use.',
    see: [{ part: 'heat-shield' }, { demo: 'heat-shield-stack' }, { mission: 'return', phase: 'blackout' }],
    aliases: ['ablator', 'char', 'pyrolysis'],
  },
  {
    id: 'strain-isolation-pad',
    term: 'Strain isolation pad',
    definition: 'A felt layer between a brittle ceramic tile and the structure beneath it. It lets the structure expand and flex without cracking the tile.',
    see: [{ part: 'backshell-tps' }],
    aliases: ['SIP'],
  },
  {
    id: 'mli',
    term: 'Multilayer insulation',
    definition: 'Blankets of many thin metallized films separated by netting. In vacuum, where heat travels mainly by radiation, each shiny layer reflects heat back, so the stack insulates very well for its mass.',
    see: [{ part: 'mli-blankets' }, { part: 'satellite-bus' }],
    aliases: ['MLI', 'thermal blanket', 'gold foil'],
  },
  {
    id: 'drogue-parachute',
    term: 'Drogue parachute',
    definition: 'A small, strong parachute deployed first, at higher speed, to stabilize the capsule and slow it enough for the large main parachutes to open safely.',
    see: [{ part: 'parachutes' }, { mission: 'return', phase: 'drogues' }],
    aliases: ['drogue', 'drogues'],
  },
  {
    id: 'reefing',
    term: 'Reefing',
    definition:
      'Holding a parachute partly closed with a line around its skirt so it opens in stages. A cutter later releases the line (disreefing). It limits the opening shock on the canopy, the lines and the capsule.',
    see: [{ part: 'parachutes' }, { mission: 'return', phase: 'mains' }],
    aliases: ['disreef', 'reefed'],
  },
  {
    id: 'launch-abort-system',
    term: 'Launch abort system',
    definition: 'A tower of solid rocket motors on top of a crew capsule that can pull it away from a failing launch vehicle. If not needed, it is jettisoned after staging.',
    see: [{ part: 'launch-abort-system' }, { mission: 'station', phase: 'abort-jettison' }],
    aliases: ['LES', 'escape tower', 'abort tower'],
  },
];
