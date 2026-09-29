/** Suborbital research flight: the booster alone lofts a capsule above 100 km; both come back. */
import type { PhaseCard } from '../types';
import { F } from '../parts/derived';
import { card, rtlsCards } from './common';

const boosterLanding = rtlsCards('suborbital').filter((c) => c.phase === 'aero-guidance' || c.phase === 'landing-burn');

export const SUBORBITAL_CARDS: PhaseCard[] = [
  card('suborbital', 'pad', {
    what: `The booster stands alone on the launch mount, with the uncrewed research capsule (${F.researchCapsuleMass}) on a short adapter where the interstage would normally be. It is loaded with only as much propellant as the hop needs (the timeline computes the load); LOX is topped up as it boils.`,
    whyNow: 'A straight-up hop needs much less energy than an orbit, so there is no upper stage and the tanks are only partly filled. The launch time matters less than for orbital missions: the capsule comes back down near where it went up.',
    parts: ['service-tower', 'launch-mount', 's1-lox-tank', 's1-fuel-tank', 'pressurization', 'capsule', 'sound-suppression'],
    forces: `The stack is far lighter than an orbital vehicle, so it needs only ${F.hopEngines} of the seven engines (the centre engine and two opposite outer ones, the same set the booster uses for its return burns); all seven would accelerate it much harder than the capsule and structure need.`,
    next: 'Arms retract, the deluge starts, and the engines are commanded to start.',
  }),
  card('suborbital', 'ignition', {
    what: `${F.hopEnginesCap} of the seven E-1s start, the centre engine first, each with its green TEA-TEB flash, and build up thrust (up to ${F.hopThrustSL} together) while the clamps hold the booster down and the computer checks each engine.`,
    whyNow: 'As on every flight, a bad start is safest on the ground.',
    parts: ['s1-engine-cluster', 'engine', 'igniter', 'turbopump', 'gas-generator', 'main-valves', 'launch-mount', 'sound-suppression', 'flame-deflector'],
    forces: 'Once thrust exceeds weight, the clamps pull down against the difference. The exhaust turns into the flame trench; the deluge absorbs heat and noise.',
    next: 'With all engines healthy, the clamps release.',
    equation: 'thrust',
  }),
  card('suborbital', 'liftoff', {
    what: 'The light vehicle leaps off the pad and climbs almost vertically, tilted slightly off the vertical so that the capsule will come down just offshore, over the ocean, rather than on the launch site.',
    whyNow: 'The goal is height, not sideways speed, so there is no gravity turn toward orbit, only a small tilt for a safe landing area. With no upper stage, the booster\'s own flight computers guide the whole hop.',
    parts: ['s1-engine-cluster', 'tvc-actuators', 'booster-avionics', 'launch-mount', 'service-tower', 'capsule'],
    forces: `Acceleration is high from the start and grows as ${F.hopMdot} of propellant is consumed (guidance throttles back to limit it); the vehicle passes through maximum dynamic pressure quickly. Gravity pulls straight against the climb the whole time, costing about 9.8 m/s of speed every second.`,
    next: 'The engines run until the predicted coast will carry the capsule above 100 km.',
  }),
  card('suborbital', 'meco', {
    what: 'The engines shut down while the vehicle is still climbing fast. From here the capsule coasts upward like a thrown ball, slowing as it rises.',
    whyNow: 'Cutoff comes when the predicted high point of the coast is above 100 km, the Karman line this simulator uses as the edge of space; the booster keeps a reserve for its own landing.',
    parts: ['s1-engine-cluster', 'main-valves', 'booster-avionics', 's1-lox-tank', 's1-fuel-tank', 'capsule'],
    forces: 'At cutoff the thrust vanishes; from then on only gravity and a little drag act. The vertical speed at cutoff alone sets how high the coast will go.',
    next: 'Booster and capsule coast upward together until the air is thin enough to let them part.',
    equation: 'rocket-equation',
  }),
  card('suborbital', 'capsule-sep', {
    what: `About half a minute after cutoff, near ${F.suborbitalReleaseAlt}, springs push the research capsule off the booster\'s adapter and it coasts on upward. The booster begins to turn itself around with its cold-gas thrusters.`,
    whyNow: 'The release waits for thin air. The light, blunt capsule slows in the air far more than the long, heavy booster, so if it were released in the denser air just after cutoff it would drop back onto the booster. Once apart, the two vehicles take different ways home: the capsule heat shield first and under parachutes, the booster engines first with a landing burn.',
    parts: ['capsule', 'heat-shield', 'stage-separation', 'cold-gas-rcs'],
    forces: 'Both are in free fall; a gentle separation push sets them slowly apart.',
    next: 'The capsule rises above 100 km into a few minutes of free fall.',
  }),
  card('suborbital', 'apogee', {
    what: `The capsule floats up over the top of its arc, about ${F.suborbitalApogee} up, and back down: about ${F.suborbitalAboveKarman} above 100 km and ${F.suborbitalFreeFall} above ${F.freeFallFloor} (estimates for a vertical coast; the telemetry shows this flight's values). Its small attitude thrusters hold it steady so that experiments inside run in near weightlessness without being shaken by a tumble.`,
    whyNow: 'This is the purpose of the flight: minutes of free fall and a view from above 100 km, for experiments that need them.',
    parts: ['capsule', 'attitude-thrusters', 'heat-shield', 'backshell-tps', 'parachutes'],
    forces: `Gravity is still about ${F.gravityAt100} of its surface value at 100 km (computed). The contents float because they fall together with the capsule, not because gravity has gone. With almost no sideways speed (orbit would need about ${F.leoSpeed}), the capsule must fall back.`,
    next: 'Past the top, the capsule falls back toward the atmosphere, speeding up.',
  }),
  card('suborbital', 'descent', {
    what: 'The capsule falls back, gaining speed. Its attitude thrusters turn it heat shield down before the air thickens; once the air takes hold, its blunt, bottom-heavy shape keeps it that way, the way a shuttlecock turns its heavy end forward.',
    whyNow: 'Height without sideways speed always falls back: that is the difference between reaching space and staying in orbit.',
    parts: ['capsule', 'attitude-thrusters', 'heat-shield', 'backshell-tps'],
    forces: `Free fall; by about ${F.suborbitalDragAlt}, where the air starts to matter, the capsule is falling at roughly ${F.suborbitalFallSpeed} (estimate for a fall from ${F.suborbitalApogee}). That is about ${F.suborbitalEnergyRatio} times less kinetic energy per kilogram than a capsule entering from orbit at ${F.entryAir} (computed).`,
    next: 'The capsule meets the denser air, heat shield first.',
  }),
  card('suborbital', 'entry', {
    what: 'The capsule plunges into the atmosphere heat shield first. A short, sharp deceleration slows it to its terminal speed; the shield warms but faces nothing like an orbital entry.',
    whyNow: 'The fall has brought it back into the atmosphere; air drag now removes its speed.',
    parts: ['heat-shield', 'backshell-tps', 'capsule'],
    forces: 'Because it falls steeply, the capsule meets dense air quickly: the deceleration peak is brief but can reach several g. Heating is modest compared with an entry from orbit.',
    next: 'Slowed and stable, the capsule reaches parachute altitude.',
    equation: 'dynamic-pressure',
  }),
  card('suborbital', 'parachutes', {
    what: `At about ${F.drogueAlt} the ${F.droguesWord} drogues open, steadying and slowing the capsule; at about ${F.mainAlt} the ${F.mainsWord} mains open, reefed first, then fully.`,
    whyNow: 'The capsule is slow enough for the drogues to open safely, and the mains follow once the drogues have slowed it further; reefing limits the opening jolt.',
    parts: ['parachutes', 'capsule', 'backshell-tps'],
    forces: 'Opening shocks limited by staging and reefing, then a steady descent of several metres per second under the three mains (the telemetry shows this flight\'s value).',
    next: 'The capsule descends to the sea offshore.',
  }),
  card('suborbital', 'splashdown', {
    what: 'The capsule splashes down just offshore, a few kilometres from the launch site; the parachutes are released, and a recovery ship picks it up with its experiments.',
    whyNow: 'The small tilt at launch put the capsule\'s landing point over the ocean, away from people and the launch site, while the booster steers itself back to the landing zone on the coast.',
    parts: ['capsule', 'parachutes', 'heat-shield'],
    forces: 'A water impact at the parachutes\' descent speed of several metres per second, cushioned by the water, then waves and salt water until recovery.',
    next: 'The experiments are returned to the scientists; capsule and booster can both fly again.',
  }),
  card('suborbital', 'booster-coast', {
    what: 'After releasing the capsule, the booster flips engines-down with its cold-gas thrusters, unfolds its grid fins, and coasts up over the top of its arc.',
    whyNow: 'The flight was nearly vertical, so the booster\'s arc already brings it back near the launch site: no boostback burn is needed, only the right attitude for the fall.',
    parts: ['cold-gas-rcs', 'grid-fins', 'booster-avionics', 'pressurization', 's1-lox-tank', 's1-fuel-tank'],
    forces: 'Free fall with a little propellant sloshing in the tanks; the thrusters work at the top of the booster for maximum leverage.',
    next: 'Falling back into the atmosphere, the booster steers with its fins toward the landing zone.',
  }),
  ...boosterLanding,
];
