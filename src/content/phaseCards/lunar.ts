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
    padWhy: 'The launch time is set by the Moon: the departure burn later has to send the probe to where the Moon will be about three days afterwards, so the launch is timed for that geometry (a simplification this simulator states).',
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
    what: `The E-1V burns to a low parking orbit about 200 km up and shuts down, moving at about ${F.parkingSpeed} (computed).`,
    whyNow: 'From a parking orbit the stage can wait for the right moment and place for the departure burn, instead of having to leave directly from the end of the ascent.',
    parts: ['vacuum-engine', 'nozzle-extension', 's2-tanks', 'avionics', 'main-valves'],
    forces: 'Thrust on a lightening stage, then free fall in orbit.',
    next: 'The stage coasts around Earth toward the departure point.',
    equation: 'orbital-speed',
  }),
  card('lunar', 'parking-coast', {
    what: 'The stage coasts, engine off, part of the way around Earth. Its small thrusters hold its attitude, and the propellant floats.',
    whyNow: 'The departure burn must happen at a particular point of the orbit: roughly opposite where the Moon will be when the probe arrives, because the trajectory reaches its far point on the other side of Earth from the burn.',
    parts: ['s2-rcs', 'avionics', 's2-tanks', 'common-bulkhead'],
    forces: 'Weightlessness; sunlight slowly warms the LOX, which limits how long the stage can coast.',
    next: 'At the departure point the stage settles its propellant and restarts for the burn toward the Moon.',
    equation: 'orbital-speed',
  }),
  card('lunar', 'tli', {
    what: `Trans-lunar injection: after a settling burn by the small thrusters, the E-1V restarts and accelerates the stage and probe from about ${F.parkingSpeed} to about ${F.tliSpeed}, a change of about ${F.tliDv} (two-body estimate for a far point at the Moon's distance). That is just below the ${F.escapeSpeed} escape speed at this height (computed).`,
    whyNow: 'This is the moment and place, set by the Moon\'s motion, at which a single burn sends the probe on a path that meets the Moon about three days later.',
    parts: ['s2-rcs', 'igniter', 'vacuum-engine', 'nozzle-extension', 's2-tanks', 'avionics'],
    forces: 'A long burn along the direction of motion; the stage becomes very light near its end, so acceleration rises.',
    next: 'On its way to the Moon, the probe separates from the spent stage.',
    equation: 'orbital-speed',
  }),
  card('lunar', 'probe-sep', {
    what: `The clamp band releases and springs push the ${F.lunarProbeMass} probe away; the stage then moves off onto its own path.`,
    whyNow: 'The stage has no further job; the probe must fly on with its own power, attitude control and radio.',
    parts: ['payload-adapter', 'satellite-bus', 'attitude-thrusters', 'avionics'],
    forces: 'A gentle push of a few tenths of a metre per second; the probe then stabilizes its attitude.',
    next: 'The probe begins its three-day coast toward the Moon.',
  }),
  card('lunar', 'cruise', {
    what: 'The probe coasts outward for about three days, turning its array to the Sun and its antenna to Earth. The long coast is shown accelerated.',
    whyNow: 'Nothing needs to be done but wait: the departure burn set the path. Small correction burns (not modelled) would trim it.',
    parts: ['satellite-bus', 'solar-arrays', 'antenna', 'attitude-thrusters', 'mli-blankets'],
    forces: `Earth's gravity slows the probe continuously as it climbs, from about ${F.tliSpeed} to only a few hundred metres per second relative to Earth by the Moon's distance, while the Moon moves along its own orbit at about ${F.moonSpeed} (computed).`,
    next: 'Nearing the Moon, the Moon\'s pull starts to matter more than Earth\'s.',
    equation: 'orbital-speed',
  }),
  card('lunar', 'soi', {
    what: `The probe crosses into the Moon's sphere of influence, about ${F.soiRadius} from the Moon (computed from the Earth-Moon mass ratio): the region where it is more useful to describe the probe's motion relative to the Moon than to Earth.`,
    whyNow: 'The probe and the Moon are arriving at the same place at the same time, as the departure burn arranged.',
    parts: ['satellite-bus', 'antenna', 'attitude-thrusters'],
    forces: 'Both Earth and Moon pull on the probe; the boundary is a modelling convenience, not a physical wall. Relative to the Moon the probe is now falling in fast.',
    next: 'The probe swings past the Moon at its closest approach.',
    equation: 'orbital-speed',
  }),
  card('lunar', 'flyby', {
    what: 'Closest approach: the probe passes behind the Moon, a few thousand kilometres or less above its surface, moving at its highest speed relative to the Moon. The Moon\'s gravity bends its path sharply.',
    whyNow: 'This is the point the whole trajectory was designed around: the moment of closest approach, when instruments get their best view.',
    parts: ['satellite-bus', 'antenna', 'solar-arrays', 'attitude-thrusters'],
    forces: 'Relative to the Moon the probe leaves as fast as it arrived (the Moon cannot add energy in its own frame), but its direction changes. Relative to Earth, that turn changes the probe\'s speed: a gravity assist.',
    next: 'Having swung past without braking, the probe climbs back out of the Moon\'s influence.',
    equation: 'orbital-speed',
  }),
  card('lunar', 'outbound', {
    what: 'The probe leaves the Moon\'s sphere of influence on a new path set by the flyby and continues outward.',
    whyNow: 'A flyby is not an orbit insertion. To stay at the Moon, the probe would have had to fire an engine near closest approach to shed speed relative to the Moon; this mission does not.',
    parts: ['satellite-bus', 'antenna', 'solar-arrays', 'attitude-thrusters', 'mli-blankets'],
    forces: 'Gravity of Earth and Moon (and further out, the Sun) shapes the path; the probe is again a small body coasting on its own.',
    next: 'The probe continues its science and communications on its outbound path. The mission lesson ends here.',
    equation: 'orbital-speed',
  }),
];
