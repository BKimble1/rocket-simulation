/** Lunar flyby: ascent, parking orbit, trans-lunar injection, and the probe's encounter with the Moon. */
import type { PhaseCard } from '../types';
import { F } from '../parts/derived';
import { ascentCards, card } from './common';

export const LUNAR_CARDS: PhaseCard[] = [
  ...ascentCards({
    mission: 'lunar',
    stack: 'lunar',
    payload: `lunar flyby probe (${F.lunarProbeMass})`,
    recovery: false,
    s2TW: F.s2IgnitionTWLunar,
    padWhy: 'The launch time is set by the Moon: the parking orbit must be lined up so that a burn from it can reach the place where the Moon will be about three days later. In this simulator the Moon\'s orbit is placed in the plane of the launch, a simplification that makes the geometry easy to see.',
    upperNext: 'Within a short time the air is thin enough for the fairing to come off.',
  }),
  card('lunar', 'fairing', {
    what: 'The fairing halves unlatch, swing open on their hinges and fall away, exposing the probe while the upper stage keeps firing.',
    whyNow: 'Once the air is too thin to heat the probe significantly, the fairing is only dead weight.',
    parts: ['fairing', 'satellite-bus', 'payload-adapter', 'vacuum-engine', 'avionics'],
    forces: 'Near vacuum; the halves are pushed outward and tumble slowly as they fall.',
    next: 'The upper stage burns on to a low parking orbit.',
  }),
  card('lunar', 'parking', {
    what: `The E-1V burns to a low parking orbit about ${F.parkingAlt} up and shuts down, moving at about ${F.parkingSpeed} (computed).`,
    whyNow: 'From a parking orbit the stage can wait for the right moment and place for the departure burn, instead of having to leave directly from the end of the ascent.',
    parts: ['vacuum-engine', 'nozzle-extension', 's2-tanks', 'avionics', 'main-valves'],
    forces: 'Thrust on a lightening stage, then free fall in orbit.',
    next: 'The stage coasts around Earth toward the departure point.',
    equation: 'orbital-speed',
  }),
  card('lunar', 'parking-coast', {
    what: 'The stage coasts, engine off, part of the way around Earth. Its small thrusters hold its attitude, and the propellant floats.',
    whyNow: 'The departure burn must happen at a particular point of the orbit: roughly opposite where the Moon will be when the probe arrives, because on so stretched a path the probe travels nearly halfway around Earth on its way out.',
    parts: ['s2-rcs', 'avionics', 's2-tanks', 'common-bulkhead'],
    forces: 'Weightlessness; sunlight slowly warms the LOX, which limits how long the stage can coast.',
    next: 'At the departure point the stage settles its propellant and restarts for the burn toward the Moon.',
    equation: 'orbital-speed',
  }),
  card('lunar', 'tli', {
    what: `Trans-lunar injection: after a settling burn by the small thrusters, the E-1V restarts and fires for about ${F.tliBurn}, accelerating the stage and probe from about ${F.parkingSpeed} to about ${F.tliSpeedFlown} (telemetry). A path whose far point just reaches the Moon's distance would need about ${F.tliSpeed}, a change of about ${F.tliDv} (two-body estimate); both are just below the ${F.escapeSpeed} escape speed at this height (computed).`,
    whyNow: `This is the moment and place, set by the Moon's motion, at which a single burn sends the probe on a path that meets the Moon about three days later. The burn gives a little more than the minimum on purpose: that stretches the path's far point well beyond the Moon's distance, so the probe reaches the Moon in about three days instead of the roughly ${F.tliMinCoastDays} the minimum path would take (two-body estimate). So close to escape speed, a few tens of metres per second change the trip by days.`,
    parts: ['s2-rcs', 'igniter', 'vacuum-engine', 'nozzle-extension', 's2-tanks', 'avionics'],
    forces: 'Thrust along the direction of motion. Most of the stage\'s propellant went into the ascent, so the stack is light and the burn is short; near the end the engine throttles back to keep the acceleration under about 4.5 g.',
    next: 'On its way to the Moon, the probe separates from the spent stage.',
    equation: 'orbital-speed',
  }),
  card('lunar', 'probe-sep', {
    what: `The clamp band releases and springs push the ${F.lunarProbeMass} probe away; the stage then moves off onto its own path.`,
    whyNow: 'The stage has no further job; the probe must fly on with its own power, attitude control and radio.',
    parts: ['payload-adapter', 'satellite-bus', 'attitude-thrusters', 's2-rcs', 'avionics'],
    forces: `A gentle push of about ${F.payloadSepSpeed}; the probe then stabilizes its attitude.`,
    next: 'The probe begins its coast of about three days toward the Moon.',
  }),
  card('lunar', 'cruise', {
    what: 'The probe coasts outward for about three days, turning its array to the Sun and its antenna to Earth. The long coast is compressed in the playback: partly sped up, partly skipped (the playback bar says which).',
    whyNow: 'Nothing needs to be done but wait: the departure burn set the path. Small correction burns (not modelled) would trim it.',
    parts: ['satellite-bus', 'solar-arrays', 'antenna', 'attitude-thrusters', 'mli-blankets'],
    forces: `Earth's gravity slows the probe continuously as it climbs, from about ${F.tliSpeedFlown} after the burn to about ${F.soiArrivalSpeed} relative to Earth by the time it nears the Moon, while the Moon moves along its own orbit at about ${F.moonSpeed} (computed).`,
    next: 'Nearing the Moon, the Moon\'s pull starts to matter more than Earth\'s.',
    equation: 'orbital-speed',
  }),
  card('lunar', 'soi', {
    what: `The probe crosses into the Moon's sphere of influence, about ${F.soiRadius} from the Moon (computed from the Earth-Moon mass ratio): the region where it is more useful to describe the probe's motion relative to the Moon than to Earth.`,
    whyNow: 'The probe and the Moon are arriving at the same place at the same time, as the departure burn arranged.',
    parts: ['satellite-bus', 'antenna', 'attitude-thrusters'],
    forces: `Both Earth and Moon pull on the probe; the boundary is a modelling convenience, not a physical wall. The probe is climbing almost straight away from Earth at about ${F.soiArrivalSpeed}, with little sideways speed, while the Moon moves sideways along its orbit at about ${F.moonSpeed}. So relative to the Moon the probe arrives at about ${F.flybyRelAtSoi}, moving outward and backward against the Moon's motion: the Moon is catching up with it. It aims to cross the Moon's orbit just behind the Moon, and speeds up as it falls in.`,
    next: 'The probe swings past the Moon at its closest approach.',
    equation: 'orbital-speed',
  }),
  card('lunar', 'flyby', {
    what: `Closest approach: the probe passes about ${F.flybyAlt} above the Moon at about ${F.flybySpeedRelMoon} relative to it, its highest speed of the encounter. It passes behind the Moon in its orbital motion (the trailing side), about ${F.flybyAngle} from the point that faces Earth: seen from Earth, near the edge of the Moon's disc, not over the far side.`,
    whyNow: 'This is the point the whole trajectory was designed around. Which side of the Moon the probe passes, and how close, decides how the Moon bends its path; closest approach also gives the instruments their best view.',
    parts: ['satellite-bus', 'antenna', 'solar-arrays', 'attitude-thrusters'],
    forces: `Seen from the Moon this is a simple swing: the Moon's gravity speeds the probe up on the way in and slows it by the same amount on the way out, so it leaves the sphere of influence at the same speed it entered, about ${F.flybyRelAtSoi}; only its direction changes, here by about ${F.flybyTurn}. Passing behind the Moon, the probe is pulled forward, toward where the Moon is going, so the turn swings its velocity from partly against the Moon's motion to partly along it.`,
    next: 'Having swung past without braking, the probe climbs back out of the Moon\'s influence, now faster relative to Earth.',
    equation: 'orbital-speed',
  }),
  card('lunar', 'outbound', {
    what: `The probe climbs out of the Moon's sphere of influence about ${F.soiExitDist} from Earth, moving at about ${F.soiExitSpeed} relative to Earth, against about ${F.soiArrivalSpeed} when it arrived. That is more than the ${F.soiExitEscape} escape speed at that distance: the probe is on a hyperbolic path that leaves the Earth-Moon system, keeping about ${F.soiExitVinf} when far from Earth (computed).`,
    whyNow: `This is the gravity assist. Seen from Earth, the probe's velocity is the Moon's velocity (about ${F.moonSpeed}) plus its velocity relative to the Moon. The flyby left the size of the relative part unchanged but turned it to point partly along the Moon's motion, so the two now add where before they partly cancelled. The energy comes from the Moon, which slows by an immeasurably small amount. A pass around the far side, ahead of the Moon in its motion, would do the opposite: slow the probe relative to Earth and bend its path back toward Earth, the free-return path that crewed lunar missions kept as a safety option.`,
    parts: ['satellite-bus', 'antenna', 'solar-arrays', 'attitude-thrusters', 'mli-blankets'],
    forces: 'Gravity of Earth and Moon (and further out, the Sun) shapes the path; the probe is again a small body coasting on its own, now moving away from Earth faster than Earth\'s gravity can pull it back.',
    next: 'A flyby is not an orbit insertion: to stay at the Moon the probe would have had to fire an engine near closest approach. This one heads out of the Earth-Moon system into its own orbit around the Sun (beyond this model). The mission lesson ends here.',
    equation: 'orbital-speed',
  }),
];
