/** Geostationary transfer: ascent, parking orbit, restart, transfer injection and the satellite's own climb. */
import type { PhaseCard } from '../types';
import { F } from '../parts/derived';
import { ascentCards, card } from './common';

export const GTO_CARDS: PhaseCard[] = [
  ...ascentCards({
    mission: 'gto',
    stack: 'gto',
    payload: `geostationary communications satellite (${F.gtoSatMass})`,
    recovery: false,
    s2TW: F.s2IgnitionTWGto,
    padWhy: `The pad is at ${F.siteLat}, so a due-east launch gives an orbit inclined ${F.inclination}; the satellite will remove that tilt itself later. Launching east still adds ${F.earthRotationSpeed} from Earth's rotation.`,
    upperNext: 'Within a short time the air is thin enough for the fairing to come off.',
  }),
  card('gto', 'fairing', {
    what: 'The fairing halves unlatch, swing open on their base hinges and fall away, exposing the satellite while the upper stage keeps firing.',
    whyNow: `The ${F.fairingMass} fairing is dead weight once the air is thin; it is released as soon as the heating on the exposed satellite from the remaining air is below its limit.`,
    parts: ['fairing', 'satellite-bus', 'payload-adapter', 'vacuum-engine', 'avionics'],
    forces: 'Near vacuum; only a faint heating from rarefied air remains. The halves are pushed outward and tumble slowly as they fall.',
    next: 'The upper stage burns on to a low parking orbit.',
  }),
  card('gto', 'parking', {
    what: `The E-1V burns to a low parking orbit about 200 km up and shuts down for the first time. The stage now moves at about ${F.parkingSpeed} (circular speed at 200 km, computed).`,
    whyNow: 'Reaching orbit first means the stage does not have to fire its transfer burn from wherever the ascent happens to end. It can coast to the one place where that burn works best.',
    parts: ['vacuum-engine', 'nozzle-extension', 's2-tanks', 'avionics', 'main-valves'],
    forces: 'Thrust against a falling mass, gravity bending the path, then at cutoff free fall. A 200 km orbit is low enough that thin air slowly drags on it, but not in the few tens of minutes it will be used.',
    next: 'The stage coasts in the parking orbit toward the equator crossing.',
    equation: 'orbital-speed',
  }),
  card('gto', 'parking-coast', {
    what: 'The stage coasts, engine off, until it reaches the point where its orbit crosses the equator. Its small thrusters hold its attitude, and the propellant floats in the tanks.',
    whyNow: `A geostationary orbit lies over the equator. A transfer orbit reaches its high point on the opposite side from where the burn is made, so the burn must be made at an equator crossing (a node) for the high point to land over the equator too. A due-east launch from ${F.siteLat} starts at the most northerly point of the orbit, about a quarter of an orbit from the next equator crossing.`,
    parts: ['s2-rcs', 'avionics', 's2-tanks', 'common-bulkhead'],
    forces: 'Weightlessness: liquid propellant wanders in the tanks. Sunlight slowly warms the LOX, so the coast time and the tank insulation (including the common bulkhead\'s insulating core) matter.',
    next: 'Approaching the node, the stage must collect its floating propellant before the engine can restart.',
    equation: 'orbital-speed',
  }),
  card('gto', 'restart', {
    what: 'The upper stage\'s small thrusters fire rearward for a while, giving the stage a gentle forward acceleration that settles the propellant over the tank outlets. Then the E-1V restarts with a second dose of TEA-TEB.',
    whyNow: 'A turbopump that swallows gas instead of liquid at start can overspeed and fail, so the liquid must be settled first. The restart is timed to the node, where the transfer burn has to happen.',
    parts: ['s2-rcs', 'igniter', 'vacuum-engine', 's2-tanks', 'main-valves', 'turbopump'],
    forces: 'A very small settling acceleration is enough to move the liquid, because nothing else is acting on it. The engine then restarts from a cold soak in vacuum.',
    next: 'Running again, the E-1V can make the burn that stretches the orbit out to geostationary altitude.',
  }),
  card('gto', 'gto-injection', {
    what: `The E-1V burns along the direction of motion until the far point of the orbit reaches 35,786 km. The stage leaves the node at about ${F.gtoPerigeeSpeed}, having added about ${F.gtoInjectionDv} (two-body estimate from a 200 km circular orbit).`,
    whyNow: 'A burn at the low point of an orbit raises the opposite side of the orbit most efficiently, and at this node the new high point will lie over the equator, where the satellite\'s final orbit must be.',
    parts: ['vacuum-engine', 'nozzle-extension', 's2-tanks', 'tvc-actuators', 'avionics'],
    forces: 'The burn is long and nearly horizontal. The stage\'s mass falls fast, so acceleration rises toward cutoff. Guidance cuts off when the predicted apogee is reached.',
    next: 'The satellite is on its transfer orbit; the stage releases it.',
    equation: 'orbital-speed',
  }),
  card('gto', 'deploy', {
    what: `The clamp band opens and springs push the ${F.gtoSatMass} satellite away from the stage. The stage then moves away and makes itself safe.`,
    whyNow: 'The launch vehicle has done what it can: it has placed the satellite on a transfer orbit. The satellite must finish the job with its own engine.',
    parts: ['payload-adapter', 'satellite-bus', 'attitude-thrusters', 'avionics'],
    forces: 'A gentle push of a few tenths of a metre per second; momentum is shared between satellite and stage. The satellite stabilizes its attitude.',
    next: 'The satellite coasts outward, climbing toward the high point of its orbit.',
  }),
  card('gto', 'transfer-coast', {
    what: `The satellite climbs for about ${F.gtoHalfPeriod} (half the transfer orbit's period, computed), slowing from about ${F.gtoPerigeeSpeed} near Earth to about ${F.gtoApogeeSpeed} at the top, while passing through the radiation belts. The long climb is shown accelerated.`,
    whyNow: 'This is simply the orbit doing its work: kinetic energy is traded for height as the satellite coasts outward.',
    parts: ['satellite-bus', 'attitude-thrusters', 'mli-blankets', 'antenna', 'solar-arrays'],
    forces: 'Gravity alone, weakening with the square of the distance. The satellite keeps its temperatures in range in continuous sunlight and radiation.',
    next: 'At the high point the satellite is moving too slowly to stay there: its own engine must add speed.',
    equation: 'orbital-speed',
  }),
  card('gto', 'circularize', {
    what: `At apogee the satellite's apogee engine fires, raising the low point of its orbit until the orbit is a circle at 35,786 km, where one lap takes a day and the satellite appears to hang over one spot on the equator. Shown here as one long burn (explanatory); real satellites use several burns over several apogees.`,
    whyNow: `At apogee the satellite moves slowly (about ${F.gtoApogeeSpeed}) compared with circular speed there (about ${F.geoSpeed}), so the velocity change needed is smallest here: about ${F.circularizeDv} to circularize, or about ${F.circularizePlaneDv} if the same burns also remove the ${F.inclination} tilt (computed). Combining the tilt change with the apogee burns is cheap because the satellite is slow there.`,
    parts: ['apogee-engine', 'attitude-thrusters', 'satellite-bus', 'solar-arrays', 'antenna'],
    forces: 'A small thrust (hundreds of newtons) acting for a long time on a spacecraft of a few tonnes; attitude control must hold the engine pointed precisely along the planned direction.',
    next: 'On station over the equator, the satellite unfolds its full arrays and reflectors and begins its service life.',
    equation: 'orbital-speed',
  }),
];
