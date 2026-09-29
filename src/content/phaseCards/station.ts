/** Station delivery: crewed ascent, abort-tower jettison, phasing, approach and docking; booster return. */
import type { PhaseCard } from '../types';
import { F } from '../parts/derived';
import { card, rtlsCards } from './common';

const s = F.stack.station;

export const STATION_CARDS: PhaseCard[] = [
  card('station', 'pad', {
    what: `The crew walks across the access arm to the capsule hatch, about ${F.crewHatchHeight} above the ground, while the K-1 is fuelled: RP-1 first, then LOX, topped up continuously as it boils. The abort tower on the capsule is armed. The arms swing back in the final minutes and the flight computer takes over the count.`,
    whyNow: `The capsule must be launched into the station's orbital plane. Earth's rotation carries the pad through that plane, and because the station's inclination (${F.inclination}) equals the pad's latitude, that happens only once a day: the launch window is essentially an instant, so the count is timed to it.`,
    parts: ['service-tower', 'launch-mount', 'capsule', 'launch-abort-system', 's1-lox-tank', 's1-fuel-tank', 's2-tanks', 'pressurization'],
    forces: `The fuelled stack (${s.mass}, a weight of ${s.weight}) rests on the hold-downs. The crew sits in the capsule at the top of the vehicle, where wind sway on the pad is largest.`,
    next: 'At the planned instant, the deluge starts and the engines are commanded to start.',
  }),
  card('station', 'ignition', {
    what: `The deluge floods the mount and the seven E-1s start with their green TEA-TEB flashes. Thrust builds to ${F.s1ThrustSL} while the clamps hold the vehicle down and the computer checks each engine.`,
    whyNow: 'A bad engine start is safest on the ground. With a crew aboard, the abort tower is also ready to pull the capsule clear if anything goes wrong on the pad.',
    parts: ['s1-engine-cluster', 'engine', 'igniter', 'turbopump', 'main-valves', 'launch-mount', 'sound-suppression', 'flame-deflector', 'launch-abort-system'],
    forces: `Before release the clamps pull down against about ${s.holdDown} of net upward load (thrust minus weight, computed). The exhaust turns into the flame trench; the deluge absorbs heat and noise.`,
    next: 'With all engines healthy, the clamps release together.',
    equation: 'thrust',
  }),
  card('station', 'liftoff', {
    what: `The vehicle lifts off with a thrust-to-weight ratio of ${s.tw} (the heavier crewed stack accelerates at only about ${s.accel} at first), clears the tower, then pitches over toward the east and follows a gravity turn along the station's orbital plane.`,
    whyNow: 'The ascent must put the capsule into the station\'s orbital plane: aiming along that plane from the start costs far less than correcting the plane later, which would require a large sideways velocity change.',
    parts: ['s1-engine-cluster', 'tvc-actuators', 'launch-mount', 'service-tower', 'launch-abort-system'],
    forces: `The vehicle lightens by ${F.s1Mdot} of propellant, so acceleration grows every second. After the tower the gimbals tilt it into the gravity turn; Earth's rotation adds ${F.earthRotationSpeed} of eastward speed (computed).`,
    next: 'Speed rises toward the region of maximum aerodynamic pressure.',
  }),
  card('station', 'maxq', {
    what: 'The dynamic pressure q = ½·ρ·v² peaks as rising speed meets thinning air. The engines throttle down through the peak and back up.',
    whyNow: 'This is when aerodynamic loads are largest. It is also the most demanding moment for an abort: if the tower had to fire here, it would pull the capsule away into the strongest airflow of the flight.',
    parts: ['s1-engine-cluster', 'launch-abort-system', 'capsule', 'interstage', 's1-intertank', 'tvc-actuators'],
    forces: 'Peak aerodynamic pressure and bending, transonic buffeting, heating of the tower\'s nose and the capsule shoulder. The telemetry shows the computed maximum for this flight.',
    next: 'Past the peak, the booster returns to full thrust and burns on to its cutoff, keeping a reserve for its return.',
    equation: 'dynamic-pressure',
  }),
  card('station', 'staging', {
    what: 'The booster shuts down with its return reserve, coasts for a few seconds, then the collets release and pushers separate the stages. The upper stage slides out of the interstage and ignites its E-1V; the booster begins turning around.',
    whyNow: `Dropping ${F.s1Dry} of empty booster saves the upper stage about ${s.carryBoosterLoss} of ideal velocity change on this mission (computed); the booster keeps enough propellant to fly home.`,
    parts: ['stage-separation', 'interstage', 'vacuum-engine', 'nozzle-extension', 'cold-gas-rcs', 's2-rcs'],
    forces: 'A few seconds of free fall with floating propellant, a gentle push-off, then the E-1V\'s thrust on a stage whose thrust-to-weight ratio is below 1: enough, because the stage is already climbing fast.',
    next: 'With the vehicle high above the dense atmosphere and the upper stage running, the abort tower is no longer needed.',
    equation: 'rocket-equation',
  }),
  card('station', 'abort-jettison', {
    what: 'The tower\'s small jettison motor fires and pulls the abort tower away from the capsule; it arcs away and falls into the ocean. The capsule\'s nose, with the docking system under its cover, is now the top of the vehicle.',
    whyNow: `Up here an abort can be handled by the service module's engine, and the ${F.towerMass} tower is only a burden: carried to orbit it would cost about ${F.towerCarriedLoss} of the upper stage's ideal velocity change (computed).`,
    parts: ['launch-abort-system', 'capsule', 'vacuum-engine', 'docking-system'],
    forces: 'Near vacuum and steady acceleration from the E-1V; the jettison motor must pull the tower forward and sideways, clear of the accelerating stack.',
    next: 'The upper stage continues its burn to orbit.',
    equation: 'rocket-equation',
  }),
  card('station', 'insertion', {
    what: 'The E-1V cuts off with the capsule in a low orbit (roughly 200 × 250 km) below and behind the station.',
    whyNow: `Starting lower is deliberate: a lower orbit is faster and has a shorter period, so the capsule gains on the station every lap. The insertion point and the phase angle behind the station are chosen so the catch-up takes several orbits.`,
    parts: ['vacuum-engine', 'nozzle-extension', 's2-tanks', 'avionics', 'tvc-actuators'],
    forces: `Free fall at orbital speed (about ${F.parkingSpeed} at 200 km, computed); gravity alone from here, apart from a trace of drag.`,
    next: 'The capsule and service module separate from the spent upper stage.',
    equation: 'orbital-speed',
  }),
  card('station', 'capsule-sep', {
    what: 'The capsule and service module separate from the upper stage, and the service module unfolds its two solar-array wings. From here the capsule flies itself.',
    whyNow: 'The upper stage\'s job is done; the spacecraft needs power from its arrays and its own attitude control for the hours of phasing ahead.',
    parts: ['payload-adapter', 'capsule', 'service-module', 'solar-arrays', 'attitude-thrusters'],
    forces: 'A gentle separation push; the arrays unfold slowly so their hinges do not jolt the structure.',
    next: 'The capsule begins to catch up with the station from its lower orbit.',
  }),
  card('station', 'phasing', {
    what: `The capsule circles Earth in its lower orbit, gaining on the station each lap. Phasing burns by the service module adjust its orbit so it will arrive at the right place at the right time.`,
    whyNow: `The capsule cannot simply fly straight to the station: speeding up would raise its orbit and make it slower on average. Instead it stays lower: an orbit about ${F.phasingPeriod} long (at a mean altitude of 225 km) against the station's ${F.leoPeriod} gains about ${F.phasingGain} of angle per lap (computed).`,
    parts: ['service-module', 'attitude-thrusters', 'capsule', 'solar-arrays', 'mli-blankets'],
    forces: 'Gravity alone between burns; relative motion follows orbital mechanics, which is counter-intuitive: to catch up, go lower.',
    next: 'Once the gap has closed, burns raise the capsule\'s orbit toward the station\'s.',
    equation: 'orbital-speed',
  }),
  card('station', 'raise', {
    what: 'Two burns (Hohmann-like) raise the capsule\'s orbit: the first raises its far point to just below the station\'s altitude; the second, half an orbit later, rounds the orbit out close below and behind the station.',
    whyNow: 'The phasing has brought the capsule to the right angle behind the station, so now it must match the station\'s altitude, arriving just short of it rather than overshooting.',
    parts: ['service-module', 'attitude-thrusters', 'capsule', 'station'],
    forces: 'Each burn changes the opposite side of the orbit most: a burn at the low point raises the high point, and a burn at the high point raises the low point.',
    next: 'Close below the station, the capsule starts its final approach.',
    equation: 'orbital-speed',
  }),
  card('station', 'approach', {
    what: 'The capsule approaches along the radial line from below the station, stopping at hold points (for example about 400 m, 150 m and 20 m) where the crew and controllers check everything before continuing. The nose cone opens to expose the docking system.',
    whyNow: 'Close to the station, errors must be small and every step reversible. The hold points give time to confirm the relative position and speed.',
    parts: ['attitude-thrusters', 'docking-system', 'capsule', 'station', 'service-module'],
    forces: 'Relative motion near the station follows the Clohessy-Wiltshire equations: a capsule below the station naturally drifts ahead and away, never into it, so it must keep firing small thrusters to hold the line. That drift also makes the approach passively safe if thrusting stops.',
    next: 'At the last hold point, the capsule closes in slowly for contact.',
  }),
  card('station', 'docking', {
    what: 'The capsule closes at about 0.1 m/s or less. The soft-capture ring meets the station\'s port and latches; dampers absorb the remaining motion. Then the ring retracts, hooks close and seals compress: hard capture. After leak checks, the hatches open.',
    whyNow: 'The capsule has matched the station\'s orbit and position; only the last few metres remain.',
    parts: ['docking-system', 'capsule', 'station', 'attitude-thrusters'],
    forces: 'Small contact forces, set by the closing speed and the masses; after hard capture the two vehicles move as one structure.',
    next: 'The crew transfers to the station. The capsule stays docked as the crew\'s way home (see the Capsule return mission).',
  }),
  ...rtlsCards('station'),
];
