/** Capsule return: undocking, deorbit, service-module separation, entry, parachutes, splashdown. */
import type { PhaseCard } from '../types';
import { F } from '../parts/derived';
import { card } from './common';

export const RETURN_CARDS: PhaseCard[] = [
  card('return', 'undock', {
    what: 'The hooks of the docking system open and springs push the capsule gently away from the station. Small departure burns then carry it clear along a planned path.',
    whyNow: 'The return begins at the station. The capsule must get far enough away before any large burn, so its thrusters\' exhaust and any error cannot affect the station.',
    parts: ['docking-system', 'capsule', 'station', 'attitude-thrusters', 'service-module'],
    forces: 'Relative motion follows orbital mechanics: a small push backward (against the direction of motion) lowers the capsule\'s orbit slightly; lower means faster, so after first dropping a little behind it slides below and ahead of the station, and the gap grows every orbit.',
    next: 'Well clear of the station, the capsule turns so the service-module engine nozzle points forward along its path; its thrust then acts against the direction of motion for the deorbit burn.',
  }),
  card('return', 'deorbit', {
    what: `The service module's engine fires against the direction of motion (retrograde), removing about ${F.deorbitDv}: about ${F.smDeorbitProp} of propellant in about ${F.smDeorbitBurn} (computed).`,
    whyNow: `The burn is timed so the new orbit dips into the atmosphere over the planned splashdown zone. From a ${F.leoAlt} circular orbit, exactly ${F.deorbitDv} lowers the far side of the orbit to about ${F.deorbitPerigee}, deep enough that the atmosphere will certainly capture the capsule, and each extra metre per second lowers it by about ${F.deorbitSensitivity} more (two-body estimates; the burn flown here is a few metres per second larger and reaches lower, as the telemetry shows). That sensitivity is why the burn is sized and timed precisely for the splashdown zone.`,
    parts: ['service-module', 'attitude-thrusters', 'capsule'],
    forces: `The burn removes only about ${F.deorbitFraction} of the capsule's ${F.leoSpeed}: deorbiting does not mean stopping. The atmosphere will do the rest of the braking.`,
    next: 'Now on a path that meets the atmosphere, the capsule no longer needs the service module.',
    equation: 'rocket-equation',
  }),
  card('return', 'sm-sep', {
    what: 'The service module separates from the base of the capsule and drifts away; it will break up and burn in the atmosphere. The capsule turns to face its heat shield forward.',
    whyNow: `The service module covers the heat shield and has no protection of its own. It must go before the capsule reaches the entry interface, the top of the sensible atmosphere, taken as ${F.entryInterface} in this mission.`,
    parts: ['service-module', 'capsule', 'heat-shield', 'attitude-thrusters'],
    forces: 'Still essentially in vacuum; a small separation push and attitude control to turn the capsule base-first.',
    next: 'The capsule descends into the thin upper atmosphere: entry interface.',
  }),
  card('return', 'entry', {
    what: `The capsule reaches the entry interface at about ${F.entryInertial} (about ${F.entryAir} relative to the air, which turns with Earth), heat shield first, carrying about ${F.capsuleKE} of kinetic energy that the air must remove (computed). A glowing layer of compressed, hot air forms ahead of the shield. A capsule flying with its centre of mass slightly off its axis makes a little lift; rolling with its thrusters points that lift up, down or sideways to steer toward the splashdown zone.`,
    whyNow: 'The deorbit burn set this moment. From here the atmosphere, not the engine, removes the capsule\'s orbital energy.',
    parts: ['heat-shield', 'backshell-tps', 'capsule', 'attitude-thrusters'],
    forces: 'Air density rises roughly exponentially as the capsule descends, so drag and heating grow rapidly. Most of the energy goes into the shock-heated air flowing around the capsule; the heat shield handles the part that reaches the surface.',
    next: 'Deeper in the atmosphere, heating and deceleration reach their peaks.',
    equation: 'dynamic-pressure',
  }),
  card('return', 'blackout', {
    what: 'Peak heating and peak deceleration: the shield\'s surface chars and glows, the shock layer is hot enough to ionize the air, and radio contact is lost for a while (blackout). The crew is pressed into their seats at several g.',
    whyNow: 'Heating peaks slightly before deceleration: heating rate grows roughly with √ρ·v³ and deceleration with ρ·v², so heating peaks higher up, where the capsule is still faster.',
    parts: ['heat-shield', 'backshell-tps', 'capsule'],
    forces: 'Deceleration of several g (the timeline shows the computed peak), ablation of the heat shield, a plasma sheath that blocks radio waves, and steep temperature differences between the glowing shield and the cool cabin.',
    next: 'As the air slows the capsule below the speed of sound, heating fades and the capsule approaches the altitude for its parachutes.',
    equation: 'dynamic-pressure',
  }),
  card('return', 'drogues', {
    what: `At about ${F.drogueAlt}, mortars fire the ${F.droguesWord} drogue parachutes (${F.drogueDiameter} across). They steady the capsule and slow it further.`,
    whyNow: `The capsule is now subsonic, falling at its steady speed of about ${F.drogueSpeed} (Mach ${F.drogueMach}, estimate); a small, strong drogue can open safely at this speed, while the huge main canopies could not.`,
    parts: ['parachutes', 'capsule', 'backshell-tps'],
    forces: 'A sharp opening load, then a steady pull that stabilizes the capsule\'s swinging and brings its speed down in the thickening air.',
    next: 'Low enough and slow enough, the drogues are released and the mains are pulled out.',
  }),
  card('return', 'mains', {
    what: `At about ${F.mainAlt} the drogues are released and pilot chutes pull out the ${F.mainsWord} main parachutes (${F.mainDiameter} across). They open first reefed, held partly closed by a line around their edge, then the reefing lines are cut and they open fully.`,
    whyNow: 'Opening in two steps keeps the jolt moderate: the canopies are small while the capsule is still fast, and open fully only once it has slowed.',
    parts: ['parachutes', 'capsule'],
    forces: `Opening loads limited by reefing; then a steady descent at about ${F.descentThree} on three canopies near sea level (estimate; about ${F.descentTwo} on two).`,
    next: 'The capsule descends steadily to the sea.',
  }),
  card('return', 'splashdown', {
    what: `The capsule splashes down in the ocean under its ${F.mainsWord} main parachutes; the parachutes are released, and a recovery ship lifts the capsule and crew aboard.`,
    whyNow: 'Water is a large, soft, flat landing area; the capsule is designed to float upright.',
    parts: ['capsule', 'parachutes', 'heat-shield'],
    forces: `Water impact at about ${F.descentThree} (estimate), cushioned by the crew seats; then waves, salt water and the lifting loads of recovery.`,
    next: 'The crew is home. The capsule is inspected, and its heat shield replaced, before it can fly again.',
  }),
];
