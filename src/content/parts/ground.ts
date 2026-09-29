/** Launch-site lessons: launch mount and hold-downs, service tower, flame deflector, deluge. */
import type { PartLesson, PartNote } from '../types';
import { at, lesson, mats, note } from './util';
import { F } from './derived';

export const GROUND: (PartLesson | PartNote)[] = [
  lesson({
    id: 'launch-mount',
    summary: 'The launch mount is the raised steel and concrete table the rocket stands on, with four hold-down clamps that keep it on the pad until its engines are confirmed healthy.',
    where: `At the centre of the pad: the vehicle's aft skirt rests on the mount deck ${F.padDeckHeight} above the ground, with the nozzle exits at ${F.padNozzleExitHeight}. Four hold-down clamps grip fittings on the aft skirt; below them an opening leads into the flame deflector and trench.`,
    connections: ['thrust-structure', 's1-engine-cluster', 'flame-deflector', 'sound-suppression', 'service-tower'],
    function: `Support the fuelled vehicle (${F.liftoffMassLeo} on the LEO mission, a weight of ${F.liftoffWeightLeo}), hold it against wind, then restrain it after ignition until the engines are verified, and release all four clamps at the same instant.`,
    how: `The clamps are mechanisms that lock over fittings on the aft skirt. At ignition the engines build to full thrust over a few seconds while the clamps hold; the flight computer checks chamber pressures and other data. Once thrust exceeds weight, the clamps are pulling down against a net upward load of about ${F.holdDownNet} (LEO configuration, computed). If all is well, the clamps swing open together at T-0 and the vehicle rises; if not, the engines are shut down with the vehicle still on the pad.`,
    why: 'Engines are most likely to show a problem in their first seconds. Holding the vehicle down turns a potential failure in the air into a safe shutdown on the ground, and simultaneous release avoids yanking the vehicle sideways.',
    phases: [
      at('leo', 'pad', 'Carries the vehicle\'s weight and wind loads during fuelling.'),
      at('leo', 'ignition', 'Holds the vehicle down while the engines are checked.'),
      at('leo', 'liftoff', 'All four clamps release at the same instant.'),
      at('station', 'ignition', 'The same hold-before-release for the crewed flight.'),
      at('suborbital', 'ignition', 'Holds the booster-only stack while its engines start.'),
    ],
    environment: 'Direct exposure to the exhaust of seven engines at full thrust, intense noise and vibration, deluge water, and the full static and dynamic loads of the vehicle.',
    figures: [
      { label: 'Deck height / nozzle exit height', value: `${F.padDeckHeight} / ${F.padNozzleExitHeight}`, note: 'Above ground' },
      { label: 'Weight carried before ignition', value: F.liftoffWeightLeo, note: `LEO configuration, ${F.liftoffMassLeo}` },
      { label: 'Net upward load held at full thrust', value: F.holdDownNet, note: 'Thrust minus weight, computed' },
    ],
    materials: mats('launch-mount'),
    materialsWhy: 'Three materials, each where its strengths count. The clamp mechanisms are stainless steel: strong, tough, and resistant to the corrosion of salt air and deluge water, and able to take the heat and blast at the base of the vehicle. The mount frame is structural carbon steel, cheap, stiff and easy to weld into heavy sections, coated against corrosion. The foundations are reinforced concrete, massive and strong in compression, so the mount does not move under the vehicle\'s weight and the upward pull of the clamps. On the ground, mass costs nothing, so none of the flight vehicle\'s light alloys are needed.',
    manufacturing: 'Heavy steel weldments and machined clamp parts on a reinforced concrete structure; the clamps are tested for simultaneous release under load.',
    inspection: 'Release tests before each campaign, inspection for heat damage and corrosion after every launch, and checks of the release timing.',
    misconception: '"A rocket lifts off the moment its engines light." It is held down for a few seconds while the engines come up to full thrust and are checked. The release, not the ignition, is liftoff.',
    ifAbsent: 'An engine problem would only be discovered with the vehicle already in the air, and wind could push an unrestrained vehicle before ignition.',
    depth: {
      quick: 'Clamps hold the rocket down for a few seconds after the engines start, to be sure they are working, then let go all at once.',
      engineering: `Before release, the clamps carry thrust minus weight: ${F.s1ThrustSL} of thrust minus a weight of ${F.liftoffWeightLeo} leaves about ${F.holdDownNet}. Release must be simultaneous to avoid a rotation impulse, and the engines' thrust buildup is watched against limits before the release command.`,
      materials: 'Stainless steel where heat, blast and corrosion meet; structural steel for the frame; reinforced concrete for foundations that must not move, protected from the plume by the deflector and the deluge.',
    },
    sources: ['nasa-bsf-14', 'nasa-sound-suppression'],
  }),

  lesson({
    id: 'service-tower',
    summary: 'The service tower is the steel lattice structure beside the rocket that carries its umbilical arms: propellant, gases, power and data, and on crewed flights the crew access arm.',
    where: `On the west side of the vehicle, its centre ${F.towerOffset} from the vehicle axis, ${F.towerHeight} tall with a lightning mast on top. Look for the swing arms reaching to the upper stage and fairing (or the capsule hatch, about ${F.crewHatchHeight} above the ground, on crewed flights).`,
    connections: ['s1-lox-tank', 's1-fuel-tank', 's2-tanks', 'pressurization', 'fairing', 'capsule', 'launch-mount'],
    function: 'Load and top up the propellants, supply helium and nitrogen, power and data before launch, feed filtered air to the payload, give crew and technicians access, and protect the vehicle from lightning.',
    how: 'Lines on the tower connect to the vehicle through umbilical plates that separate cleanly. RP-1 is loaded first; LOX is loaded later and topped up continuously because it boils away through the vents. In the final minutes the arms swing back, leaving only connections that release at liftoff.',
    why: 'The vehicle cannot sit fuelled for long: LOX boils away at a steady rate. The tower makes it possible to fuel close to launch, keep the vehicle and payload conditioned, and board a crew just before flight.',
    phases: [
      at('leo', 'pad', 'Loads propellant, then its arms swing back.'),
      at('station', 'pad', 'The crew walks across the access arm to the hatch.'),
      at('leo', 'liftoff', `The vehicle must clear the ${F.towerHeight} tower before it starts to turn.`),
      at('suborbital', 'pad', 'Fuels the booster and conditions the research capsule.'),
    ],
    environment: 'Salt air, storms and lightning, and at launch the blast, heat and noise of the plume a few metres away.',
    figures: [
      { label: 'Height', value: F.towerHeight },
      { label: 'Distance from the vehicle axis', value: F.towerOffset },
      { label: 'Crew hatch height above ground', value: F.crewHatchHeight, note: 'Capsule configuration' },
    ],
    materials: mats('service-tower'),
    materialsWhy: 'The tower, its platforms and its arms are galvanized and painted structural carbon steel: cheap, stiff and strong, easy to cut, weld and bolt into a large lattice, and designed with the same codes as buildings and bridges. Its weight, which would rule steel out on the rocket, is useful here: the tower must stay stiff and still in strong wind while its arms hold umbilicals and the crew walkway precisely. Coatings protect it against coastal corrosion.',
    manufacturing: 'Steel members are fabricated, galvanized, and erected as a bolted and welded lattice; arms and umbilical plates are machined mechanisms with their own drives.',
    inspection: 'Structural and corrosion inspection, arm retraction tests before each launch, and leak checks of every propellant and gas line.',
    misconception: '"The tower holds the rocket up." The vehicle stands on its own on the launch mount; the tower only supplies and gives access, and its arms swing away before liftoff.',
    ifAbsent: 'There would be no way to fuel the vehicle near launch, keep LOX topped up, condition the payload, or board a crew.',
    depth: {
      quick: 'The tower beside the rocket feeds it fuel, gases and power and lets the crew walk in. It pulls its arms back before launch.',
      engineering: 'Cryogenic loading is paced by chilling lines and tanks without thermal shock; boil-off is replaced continuously; umbilicals must separate cleanly with the vehicle moving. The tower sets the height the vehicle must clear before it begins its pitch-over.',
      materials: 'Galvanized structural steel; the flight vehicle\'s aerospace alloys are unnecessary on the ground, where mass hardly matters.',
    },
    sources: ['nasa-bsf-14'],
  }),

  note({
    id: 'flame-deflector',
    summary: 'The steel-faced wedge under the launch mount that turns the downward exhaust sideways into the flame trench.',
    function: 'Seven engines at full thrust pour a supersonic, hot, sooty jet straight down. The deflector turns it through the trench and away from the vehicle and the pad, where it would otherwise reflect back as heat, debris and noise. Its faces are water-cooled stainless steel plates, which stay strong and resist corrosion while water carries the heat away; the trench walls around it are lined with refractory concrete, which survives the brief blast where ordinary concrete would spall, and is patched between launches.',
    why: 'Without it, the exhaust would erode the pad, throw debris, and reflect heat and sound up onto the vehicle during the seconds it is held down and climbing slowly.',
    materials: mats('flame-deflector'),
    phases: [
      at('leo', 'ignition', 'Turns the exhaust into the trench while the vehicle is held down.'),
      at('leo', 'liftoff', 'Carries the plume away as the vehicle climbs off the mount.'),
    ],
    sources: ['nasa-bsf-14', 'nasa-sound-suppression'],
  }),

  note({
    id: 'sound-suppression',
    summary: 'The water deluge system that floods the launch mount and trench with water just before ignition and through liftoff.',
    function: 'Large volumes of water sprayed into the exhaust absorb acoustic energy (the jet mixes with the water and its turbulence and noise are reduced) and heat (much of the water turns to steam). Most of the huge white cloud at liftoff is steam from this water, not engine smoke. The water waits in an elevated structural-steel tank and falls through large steel pipes, so gravity drives the flow within seconds, without waiting for large pumps to spin up.',
    why: 'Sound reflected from the pad at liftoff is intense enough to damage the vehicle, its payload and the pad itself. The deluge reduces those acoustic loads and cools the mount and deflector.',
    materials: mats('sound-suppression'),
    phases: [
      at('leo', 'ignition', 'Water starts a few seconds before engine start.'),
      at('leo', 'liftoff', 'Continues while the vehicle climbs away from the pad.'),
    ],
    sources: ['nasa-sound-suppression'],
  }),
];
