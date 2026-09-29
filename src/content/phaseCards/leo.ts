/** Satellite to low Earth orbit: ascent, orbit insertion, deployment, and the booster's return. */
import type { PhaseCard } from '../types';
import { F } from '../parts/derived';
import { ascentCards, card, rtlsCards } from './common';

export const LEO_CARDS: PhaseCard[] = [
  ...ascentCards({
    mission: 'leo',
    stack: 'leo',
    payload: `Earth-observation satellite (${F.leoSatMass})`,
    recovery: true,
    s2TW: F.s2IgnitionTWLeo,
    padWhy: `Launching due east from ${F.siteLat} gives an orbit inclined ${F.inclination} and adds Earth's rotation (${F.earthRotationSpeed}) to the vehicle's speed; the launch time sets how the orbit's plane is oriented relative to the Sun, and so the lighting on the satellite's passes.`,
    upperNext: 'Within a short time the air is thin enough for the fairing to come off.',
  }),
  card('leo', 'fairing', {
    what: `The fairing's latches release along its seam and around its base; pushers split the two halves, which swing open on their hinges and fall away. The satellite is exposed to space for the first time while the E-1V keeps firing.`,
    whyNow: `The ${F.fairingMass} fairing is dead weight once the air is thin, so it goes as early as possible: as soon as the heating from the remaining air on the exposed satellite is below its limit (after upper-stage ignition, above about ${F.fairingAlt} in this profile). Carrying it to orbit would cost about ${F.leoS2CarryingFairingLoss} of ideal velocity change (computed).`,
    parts: ['fairing', 'satellite-bus', 'payload-adapter', 'vacuum-engine', 'avionics'],
    forces: 'Near vacuum: the only aerodynamic effect left is a faint heating from rarefied air. The halves are pushed outward and tumble slowly as they fall; the stage keeps accelerating.',
    next: 'Freed of the fairing, the upper stage continues its long burn toward orbital speed.',
  }),
  card('leo', 'upper-burn', {
    what: `The E-1V burns for several minutes while guidance steers a slowly changing pitch angle (a linear-tangent steering law). The target is the low point of a ${F.leoInsertion} orbit: ${F.leoInsPerigeeAlt} altitude, moving exactly horizontally at about ${F.insPerigeeSpeed}. Its nozzle extension glows red-orange.`,
    whyNow: `The vehicle is high but still far short of orbital speed, and almost all of the remaining velocity has to be added horizontally. Stopping the climb at ${F.leoInsPerigeeAlt} is deliberate: with its modest thrust, the stage would waste propellant holding itself up against gravity during a longer climb straight to ${F.leoAlt}. It is cheaper to aim for an orbit that coasts up to ${F.leoAlt} by itself.`,
    parts: ['vacuum-engine', 'nozzle-extension', 's2-tanks', 'common-bulkhead', 'tvc-actuators', 's2-rcs', 'avionics'],
    forces: `Thrust ${F.e1vThrust} on a stage whose mass is falling fast, so the acceleration grows: at full thrust with only the empty stage and satellite left it would reach about ${F.s2EndAccelLeo} (computed), so guidance throttles back near the end to limit it. Gravity keeps pulling the path down; Earth's rotation helps. The single engine cannot control roll, so small thrusters do.`,
    next: 'When guidance sees the target altitude, speed and a zero climb angle all reached, it calls engine cutoff.',
    equation: 'rocket-equation',
  }),
  card('leo', 'seco', {
    what: `About ${F.leoSeco} after liftoff, the E-1V shuts down at ${F.leoInsPerigeeAlt}, moving at about ${F.insPerigeeSpeed} (computed). The stage and satellite are now in orbit: this is the low point of an orbit whose high point, half a lap later on the far side of Earth, is at ${F.leoAlt}.`,
    whyNow: 'Cutoff comes the moment the orbit is right: any later and the high point would overshoot, any earlier and the orbit would not reach its target height (or would dip back into the atmosphere).',
    parts: ['vacuum-engine', 'main-valves', 'avionics', 's2-tanks', 's2-rcs'],
    forces: `Only gravity now: the vehicle is in free fall, but moving sideways so fast that Earth's surface curves away beneath it as fast as it falls. It is moving slightly faster than a circular orbit at this height needs, so the path rises away from Earth as it goes. Gravity here is still about ${F.gravityAt200} of its surface value (computed).`,
    next: 'The stage turns to a horizontal attitude and coasts up toward the high point of its orbit.',
    equation: 'orbital-speed',
  }),
  card('leo', 'coast', {
    what: `The stage coasts, engine off, for half an orbit (about ${F.insCoast}, computed) up to the high point at ${F.leoAlt}, passing between sunlight and Earth's shadow. There its thrusters push the floating propellant back over the outlets, the E-1V restarts briefly and adds about ${F.leoCircDv} (two-body estimate), and the orbit becomes a ${F.leoAlt} circle. Small thrusters then turn the stage to the attitude planned for releasing the satellite.`,
    whyNow: `At the high point the stage is moving at about ${F.insApogeeSpeed}, a little slower than the ${F.leoSpeed} a circular orbit at ${F.leoAlt} needs; a small forward push there raises the low point of the orbit to ${F.leoAlt} as well. Separation then happens in a known, steady attitude, at a time that gives the satellite sunlight for its arrays and a ground station within reach.`,
    parts: ['s2-rcs', 'vacuum-engine', 'igniter', 's2-tanks', 'avionics', 'satellite-bus', 'mli-blankets'],
    forces: `Weightlessness: everything, including the propellant left in the tanks, floats until the settling thrusters give it a gentle push. A trace of atmosphere causes a very small drag; sunlight heats one side while the other faces cold space.`,
    next: 'In its final circular orbit, with the attitude held steady, the clamp band can be released.',
    equation: 'orbital-speed',
  }),
  card('leo', 'deploy', {
    what: `The clamp band releases and springs push the satellite gently away from the adapter, at about ${F.payloadSepSpeed}. The stage then moves itself further away with its thrusters.`,
    whyNow: 'The satellite has been carried to its orbit; from here it must fly on its own, and the stage must get clear so the two can never collide.',
    parts: ['payload-adapter', 'satellite-bus', 'attitude-thrusters', 's2-rcs', 'avionics'],
    forces: 'Momentum is conserved: the springs push the satellite and the stage apart in opposite directions, inversely to their masses. Any small unevenness sets the satellite slowly rotating, which its own attitude control then stops.',
    next: 'Free and stabilized, the satellite unfolds its solar arrays and antenna.',
  }),
  card('leo', 'arrays', {
    what: 'The solar-array wings unfold in sequence (yoke first, then panels) and turn to face the Sun; the antenna swings out on its boom. When a ground station comes into view, the satellite makes first contact.',
    whyNow: 'The batteries have carried the satellite since launch and cannot last long; power from the arrays and a radio link to the ground are the first needs of an independent spacecraft.',
    parts: ['solar-arrays', 'antenna', 'attitude-thrusters', 'satellite-bus', 'mli-blankets'],
    forces: `Deployment is slow and controlled so the hinges do not shock the structure. In this orbit up to about ${F.eclipseMin} of every ${F.leoPeriod} is spent in Earth's shadow (computed), so the arrays must also recharge the batteries in sunlight.`,
    next: 'The satellite begins its commissioning: checking out its instrument and subsystems before starting years of work. The launch vehicle\'s job is done.',
  }),
  ...rtlsCards('leo'),
];
