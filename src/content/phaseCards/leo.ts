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
    whyNow: `The ${F.fairingMass} fairing is dead weight once the air is thin, so it goes as early as possible: as soon as the heating from the remaining air on the exposed satellite is below its limit (after upper-stage ignition, above roughly 110 km in this profile). Carrying it to orbit would cost about ${F.leoS2CarryingFairingLoss} of ideal velocity change (computed).`,
    parts: ['fairing', 'satellite-bus', 'payload-adapter', 'vacuum-engine', 'avionics'],
    forces: 'Near vacuum: the only aerodynamic effect left is a faint heating from rarefied air. The halves are pushed outward and tumble slowly as they fall; the stage keeps accelerating.',
    next: 'Freed of the fairing, the upper stage continues its long burn toward orbital speed.',
  }),
  card('leo', 'upper-burn', {
    what: `The E-1V burns for several minutes, steering a slowly changing pitch angle chosen by guidance so that it arrives at ${F.leoAlt} altitude moving exactly horizontally at orbital speed. Its nozzle extension glows red-orange.`,
    whyNow: `The vehicle is high but still far short of orbital speed (${F.leoSpeed} at ${F.leoAlt}). Almost all of the remaining velocity has to be added horizontally.`,
    parts: ['vacuum-engine', 'nozzle-extension', 's2-tanks', 'common-bulkhead', 'tvc-actuators', 's2-rcs', 'avionics'],
    forces: `Thrust ${F.e1vThrust} on a stage whose mass is falling fast, so the acceleration grows: at full thrust with only the empty stage and satellite left it would reach about ${F.s2EndAccelLeo} (computed), so guidance throttles to limit it. Gravity keeps pulling the path down; Earth's rotation helps. The single engine cannot control roll, so small thrusters do.`,
    next: 'When guidance sees the target altitude, speed and a zero climb angle all reached, it calls engine cutoff.',
    equation: 'rocket-equation',
  }),
  card('leo', 'seco', {
    what: `The E-1V shuts down. The stage and satellite are in a ${F.leoAlt} orbit, moving at about ${F.leoSpeed}; they will circle Earth once every ${F.leoPeriod} (computed) without any further thrust.`,
    whyNow: 'Cutoff comes the moment the orbit is right: any later and the orbit would be too high (or elliptical), any earlier and it would dip back into the atmosphere.',
    parts: ['vacuum-engine', 'main-valves', 'avionics', 's2-tanks'],
    forces: `Only gravity now: the vehicle is in free fall, but moving sideways so fast that Earth's surface curves away beneath it as fast as it falls. Gravity at this height is still about ${F.gravityAt400} of its surface value (computed).`,
    next: 'The stage coasts in orbit while it turns the satellite to the attitude planned for separation.',
    equation: 'orbital-speed',
  }),
  card('leo', 'coast', {
    what: 'The upper stage coasts in orbit, its engine off, passing between sunlight and Earth\'s shadow. Small thrusters turn it to the attitude planned for releasing the satellite.',
    whyNow: 'Separation must happen in a known, steady attitude, and at a time that gives the satellite good conditions for its first hours: sunlight for its arrays and a ground station within reach.',
    parts: ['s2-rcs', 'avionics', 'satellite-bus', 'mli-blankets'],
    forces: `Weightlessness: everything, including the propellant left in the tanks, floats. A trace of atmosphere at ${F.leoAlt} causes a very small drag; sunlight heats one side while the other faces cold space.`,
    next: 'With the attitude held steady, the clamp band can be released.',
    equation: 'orbital-speed',
  }),
  card('leo', 'deploy', {
    what: 'The clamp band releases and springs push the satellite gently away from the adapter, at a few tenths of a metre per second. The stage then moves itself further away.',
    whyNow: 'The satellite has been carried to its orbit; from here it must fly on its own, and the stage must get clear so the two can never collide.',
    parts: ['payload-adapter', 'satellite-bus', 'attitude-thrusters', 'avionics'],
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
