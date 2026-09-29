/**
 * Station delivery: crewed ascent, abort-tower jettison, phasing, approach and docking. The crew
 * stack is heavy enough that the booster is expended on this mission (no return branch).
 */
import type { PhaseCard } from '../types';
import { F } from '../parts/derived';
import { card } from './common';

const s = F.stack.station;

export const STATION_CARDS: PhaseCard[] = [
  card('station', 'pad', {
    what: `The crew walks across the access arm to the capsule hatch, about ${F.crewHatchHeight} above the ground, while the K-1 is fuelled: RP-1 first, then LOX, topped up continuously as it boils. The abort tower on the capsule is armed. The arms swing back in the final minutes and the flight computer takes over the count. The booster carries no landing legs or grid fins on this flight: it will not come back.`,
    whyNow: `The capsule must be launched into the station's orbital plane. Earth's rotation carries the pad through that plane, and because the station's inclination (${F.inclination}) equals the pad's latitude, that happens only once a day: the launch window is essentially an instant, so the count is timed to it.`,
    parts: ['service-tower', 'launch-mount', 'capsule', 'launch-abort-system', 's1-lox-tank', 's1-fuel-tank', 's2-tanks', 'pressurization'],
    forces: `The fuelled stack (${s.mass}, a weight of ${s.weight}) rests on the hold-downs. The crew sits in the capsule at the top of the vehicle, where wind sway on the pad is largest.`,
    next: 'At the planned instant, the deluge starts and the engines are commanded to start.',
  }),
  card('station', 'ignition', {
    what: `The deluge floods the mount and the seven E-1s start with their green TEA-TEB flashes. Thrust builds to ${F.s1ThrustSL} while the clamps hold the vehicle down and the computer checks each engine.`,
    whyNow: 'A bad engine start is safest on the ground. With a crew aboard, the abort tower is also ready to pull the capsule clear if anything goes wrong on the pad.',
    parts: ['s1-engine-cluster', 'engine', 'igniter', 'turbopump', 'gas-generator', 'main-valves', 'launch-mount', 'sound-suppression', 'flame-deflector', 'launch-abort-system'],
    forces: `Before release the clamps pull down against about ${s.holdDown} of net upward load (thrust minus weight, computed). The exhaust turns into the flame trench; the deluge absorbs heat and noise.`,
    next: 'With all engines healthy, the clamps release together.',
    equation: 'thrust',
  }),
  card('station', 'liftoff', {
    what: `The vehicle lifts off with a thrust-to-weight ratio of ${s.tw} (the heavier crewed stack accelerates at only about ${s.accel} at first), clears the tower, then pitches over toward the east and follows a gravity turn along the station's orbital plane.`,
    whyNow: 'The ascent must put the capsule into the station\'s orbital plane: aiming along that plane from the start costs far less than correcting the plane later, which would require a large sideways velocity change.',
    parts: ['s1-engine-cluster', 'tvc-actuators', 'avionics', 'launch-mount', 'service-tower', 'launch-abort-system'],
    forces: `The vehicle lightens by ${F.s1Mdot} of propellant, so acceleration grows every second. After the tower the gimbals tilt it into the gravity turn; Earth's rotation adds ${F.earthRotationSpeed} of eastward speed (computed).`,
    next: 'Speed rises toward the region of maximum aerodynamic pressure.',
  }),
  card('station', 'maxq', {
    what: `The dynamic pressure q = ½·ρ·v², the pressure of the oncoming air, peaks as rising speed meets thinning air, shortly after the vehicle passes the speed of sound. The engines throttle down to about ${F.throttleBucket} while q climbs steeply through the transonic region, then back up.`,
    whyNow: 'This is when aerodynamic loads are largest. It is also the most demanding moment for an abort: if the tower had to fire here, it would pull the capsule away into the strongest airflow of the flight.',
    parts: ['s1-engine-cluster', 'gas-generator', 'launch-abort-system', 'capsule', 'interstage', 's1-intertank', 'tvc-actuators', 'avionics'],
    forces: 'Peak aerodynamic pressure and bending, transonic buffeting, heating of the tower\'s nose and the capsule shoulder. The telemetry shows the computed maximum for this flight.',
    next: `Past the peak, the booster returns to full thrust and burns on until its tanks are nearly empty. As the vehicle lightens, its acceleration climbs, so near the end all seven engines throttle back together to hold the crew's load to about ${F.crewGLimit}.`,
    equation: 'dynamic-pressure',
  }),
  card('station', 'staging', {
    what: 'The booster shuts down with its tanks nearly empty, coasts for a few seconds, then the collets release and pushers separate the stages. The upper stage slides out of the interstage and ignites its E-1V. The spent booster, with no legs, fins or propellant to come home, falls on a long arc into the ocean hundreds of kilometres downrange.',
    whyNow: `Dropping ${s.boosterEmpty} of empty booster saves the upper stage about ${s.carryBoosterLoss} of ideal velocity change on this mission (computed). Why not fly it home, as on the LEO mission? The crew stack (${F.crewStackMass} of capsule, service module and abort tower, against ${F.leoStackMass} of satellite and fairing) leaves the upper stage only about ${F.capS2} of ideal velocity change instead of ${F.leoS2}, so the booster must give the ascent everything it has. Keeping the legs and a return reserve of about ${F.rtlsReserve} would cost it about ${F.stationRecoveryCost} (computed, ideal). Payload mass is traded against reusability: here the booster is expended.`,
    parts: ['stage-separation', 'interstage', 'vacuum-engine', 'nozzle-extension', 's2-rcs'],
    forces: `A few seconds of free fall with floating propellant, a gentle push-off, then the E-1V's thrust on a stage whose thrust-to-weight ratio is only about ${F.s2IgnitionTWStation} (computed), below 1: enough, because the stage is already high and climbing fast.`,
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
    what: `The E-1V cuts off with the capsule in a low orbit (about ${F.stationInsertion}, the mission target) below and behind the station.`,
    whyNow: `Starting lower is deliberate: a lower orbit is faster and has a shorter period, so the capsule gains on the station every lap. The insertion point and the phase angle behind the station are chosen so the catch-up takes several orbits.`,
    parts: ['vacuum-engine', 'nozzle-extension', 's2-tanks', 'avionics', 'tvc-actuators'],
    forces: `Near the end of the burn the nearly empty stage would push the crew at about ${F.s2EndAccelStation} at full thrust (computed), so the E-1V throttles back to hold about ${F.crewGLimit}. After cutoff: free fall at orbital speed (about ${F.parkingSpeed} at ${F.parkingAlt}, computed), gravity alone apart from a trace of drag.`,
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
    what: `The capsule coasts in its lower orbit for ${F.phasingRevs} laps (about ${F.phasingHours}, compressed in the playback), gaining on the station every lap without firing its engine. The insertion point was chosen so that after these laps the station is only a few degrees ahead.`,
    whyNow: `The capsule cannot simply fly straight to the station: speeding up would raise its orbit and make it slower on average. Instead it stays lower: an orbit about ${F.phasingPeriod} long (at a mean altitude of ${F.phasingAlt}) against the station's ${F.leoPeriod} gains about ${F.phasingGain} of angle per lap (computed).`,
    parts: ['service-module', 'attitude-thrusters', 'capsule', 'solar-arrays', 'mli-blankets'],
    forces: 'Gravity alone: relative motion follows orbital mechanics, which is counter-intuitive. To catch up, go lower; to fall back, go higher.',
    next: 'Once the gap has nearly closed, two service-module burns raise the capsule\'s orbit toward the station\'s.',
    equation: 'orbital-speed',
  }),
  card('station', 'raise', {
    what: 'Two service-module burns (Hohmann-like) raise the capsule\'s orbit: the first, at the low point, raises the far side of the orbit to a few kilometres below the station\'s altitude; the second, half an orbit later at that high point, rounds the orbit out there, a few kilometres below and behind the station.',
    whyNow: 'The phasing has brought the capsule to the right angle behind the station, so now it must match the station\'s altitude, arriving just short of it rather than overshooting.',
    parts: ['service-module', 'attitude-thrusters', 'capsule', 'station'],
    forces: 'Each burn changes the opposite side of the orbit most: a burn at the low point raises the high point, and a burn at the high point raises the low point.',
    next: 'Close below the station, the capsule starts its final approach.',
    equation: 'orbital-speed',
  }),
  card('station', 'approach', {
    what: `From a few kilometres below and behind the station, two small thruster burns carry the capsule to a point ${F.firstHold} straight below it. From there it climbs the radial line toward the station's nadir port, stopping at hold points (${F.holdPoints} below it in this mission) where the crew and controllers check everything before continuing. The nose cone opens to expose the docking system.`,
    whyNow: 'Close to the station, errors must be small and every step reversible. The hold points give time to confirm the relative position and speed.',
    parts: ['attitude-thrusters', 'docking-system', 'capsule', 'station', 'service-module'],
    forces: 'Relative motion near the station follows the Clohessy-Wiltshire equations: a capsule below the station naturally drifts ahead and away, never into it, so it must keep firing small thrusters to hold the line. That drift also makes the approach passively safe if thrusting stops.',
    next: 'At the last hold point, the capsule closes in slowly for contact.',
  }),
  card('station', 'docking', {
    what: `The capsule closes at ${F.closingSpeed} or less. The soft-capture ring meets the station\'s port and latches; dampers absorb the remaining motion. Then the ring retracts, hooks close and seals compress: hard capture. After leak checks, the hatches open.`,
    whyNow: 'The capsule has matched the station\'s orbit and position; only the last few metres remain.',
    parts: ['docking-system', 'capsule', 'station', 'attitude-thrusters'],
    forces: 'Small contact forces, set by the closing speed and the masses; after hard capture the two vehicles move as one structure.',
    next: 'The crew transfers to the station. The capsule stays docked as the crew\'s way home (see the Capsule return mission).',
  }),
];
