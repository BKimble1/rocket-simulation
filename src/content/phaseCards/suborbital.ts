/** Suborbital research flight: the booster alone lofts a capsule above 100 km; both come back. */
import type { PhaseCard } from '../types';
import { F } from '../parts/derived';
import { card, rtlsCards } from './common';

const boosterLanding = rtlsCards('suborbital').filter((c) => c.phase === 'aero-guidance' || c.phase === 'landing-burn');

export const SUBORBITAL_CARDS: PhaseCard[] = [
  card('suborbital', 'pad', {
    what: `The booster stands alone on the launch mount, with the uncrewed research capsule (${F.researchCapsuleMass}) on a short adapter where the interstage would normally be. It is loaded with only as much propellant as the hop needs (the timeline computes the load); LOX is topped up as it boils.`,
    whyNow: 'A straight-up hop needs much less energy than an orbit, so there is no upper stage and the tanks are only partly filled. The launch time matters less than for orbital missions: the capsule comes back down near where it went up.',
    parts: ['service-tower', 'launch-mount', 's1-lox-tank', 's1-fuel-tank', 'pressurization', 'capsule'],
    forces: 'The stack is far lighter than an orbital vehicle, so the same seven engines will give it a much higher thrust-to-weight ratio at liftoff.',
    next: 'Arms retract, the deluge starts, and the engines are commanded to start.',
  }),
  card('suborbital', 'ignition', {
    what: `The seven E-1s start with their green TEA-TEB flashes and build to ${F.s1ThrustSL} while the clamps hold the booster down and the computer checks each engine.`,
    whyNow: 'As on every flight, a bad start is safest on the ground.',
    parts: ['s1-engine-cluster', 'engine', 'igniter', 'turbopump', 'main-valves', 'launch-mount', 'sound-suppression', 'flame-deflector'],
    forces: 'The net upward load on the clamps is larger than on the orbital missions, because the vehicle is lighter. The exhaust turns into the flame trench; the deluge absorbs heat and noise.',
    next: 'With all engines healthy, the clamps release.',
    equation: 'thrust',
  }),
  card('suborbital', 'liftoff', {
    what: 'The light vehicle leaps off the pad and climbs almost vertically, tilted slightly east, so that the capsule will come down offshore over the ocean rather than on the launch site.',
    whyNow: 'The goal is height, not sideways speed, so there is no gravity turn toward orbit, only a small tilt for a safe landing area.',
    parts: ['s1-engine-cluster', 'tvc-actuators', 'launch-mount', 'service-tower', 'capsule'],
    forces: `Acceleration is high from the start and grows as ${F.s1Mdot} of propellant is consumed; the vehicle passes through maximum dynamic pressure quickly. Gravity pulls straight against the climb the whole time.`,
    next: 'The engines run until the predicted coast will carry the capsule above 100 km.',
  }),
  card('suborbital', 'meco', {
    what: 'The engines shut down while the vehicle is still climbing fast. From here the capsule coasts upward like a thrown ball, slowing as it rises.',
    whyNow: 'Cutoff comes when the predicted high point of the coast is above 100 km, the Karman line this simulator uses as the edge of space; the booster keeps a reserve for its own landing.',
    parts: ['s1-engine-cluster', 'main-valves', 's1-lox-tank', 's1-fuel-tank', 'capsule'],
    forces: 'At cutoff the thrust vanishes; from then on only gravity and a little drag act. The vertical speed at cutoff alone sets how high the coast will go.',
    next: 'The capsule separates so that booster and capsule can each come home their own way.',
    equation: 'rocket-equation',
  }),
  card('suborbital', 'capsule-sep', {
    what: 'The research capsule separates from the booster\'s adapter and coasts on upward. The booster begins to turn itself around with its cold-gas thrusters.',
    whyNow: 'The two vehicles need different ways home: the capsule heat shield first and under parachutes, the booster engines first with a landing burn. Separating early gives them room.',
    parts: ['capsule', 'heat-shield', 'stage-separation', 'cold-gas-rcs'],
    forces: 'Both are in free fall; a gentle separation push sets them slowly apart.',
    next: 'The capsule rises above 100 km into several minutes of free fall.',
  }),
  card('suborbital', 'apogee', {
    what: `The capsule floats up over the top of its arc and back down: about ${F.suborbitalFreeFall} above 80 km for a high point near 115 km (estimate for a vertical coast). Experiments inside run in near weightlessness.`,
    whyNow: 'This is the purpose of the flight: minutes of free fall and a view from above 100 km, for experiments that need them.',
    parts: ['capsule', 'heat-shield', 'backshell-tps', 'parachutes'],
    forces: `Gravity is still about ${F.gravityAt100} of its surface value at 100 km (computed). The contents float because they fall together with the capsule, not because gravity has gone. With almost no sideways speed (orbit would need about ${F.leoSpeed}), the capsule must fall back.`,
    next: 'Past the top, the capsule falls back toward the atmosphere, speeding up.',
  }),
  card('suborbital', 'descent', {
    what: 'The capsule falls back, gaining speed. As the first thin air reaches it, its blunt, bottom-heavy shape swings it heat shield down, the way a shuttlecock turns its heavy end forward.',
    whyNow: 'Height without sideways speed always falls back: that is the difference between reaching space and staying in orbit.',
    parts: ['capsule', 'heat-shield', 'backshell-tps'],
    forces: 'Free fall; by the time the air becomes dense enough to matter the capsule is falling at roughly 1 km/s (estimate for a fall from about 115 km), carrying about sixty times less energy per kilogram than a capsule entering from orbit.',
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
    what: `At several kilometres the ${F.drogues} drogues steady and slow the capsule; lower down the ${F.mains} mains open, reefed first, then fully.`,
    whyNow: 'The capsule is slow enough for the drogues to open safely, and the mains follow once the drogues have slowed it further; reefing limits the opening jolt.',
    parts: ['parachutes', 'capsule', 'backshell-tps'],
    forces: `Opening shocks limited by staging and reefing; a final descent near ${F.descentThree} on three mains (estimate at sea level).`,
    next: 'The capsule descends to the sea offshore.',
  }),
  card('suborbital', 'splashdown', {
    what: 'The capsule splashes down offshore to the east, the parachutes are released, and a recovery ship picks it up with its experiments.',
    whyNow: 'The small eastward tilt at launch put the landing point over the ocean, away from people and the launch site.',
    parts: ['capsule', 'parachutes', 'heat-shield'],
    forces: 'A water impact of several metres per second, then waves and salt water until recovery.',
    next: 'The experiments are returned to the scientists; capsule and booster can both fly again.',
  }),
  card('suborbital', 'booster-coast', {
    what: 'After releasing the capsule, the booster flips engines-down with its cold-gas thrusters, unfolds its grid fins, and coasts up over the top of its arc.',
    whyNow: 'The flight was nearly vertical, so the booster\'s arc already brings it back near the launch site: no boostback burn is needed, only the right attitude for the fall.',
    parts: ['cold-gas-rcs', 'grid-fins', 'pressurization', 's1-lox-tank', 's1-fuel-tank'],
    forces: 'Free fall with a little propellant sloshing in the tanks; the thrusters work at the top of the booster for maximum leverage.',
    next: 'Falling back into the atmosphere, the booster steers with its fins toward the landing zone.',
  }),
  ...boosterLanding,
];
