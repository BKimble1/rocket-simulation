/**
 * Shared phase-card builders: the standard ascent (leo, gto, lunar use the same outline phases)
 * and the booster's return-to-launch-site branch (leo; the suborbital hop reuses its last two
 * cards). Mission-specific wording is
 * passed in, so each card still speaks about its own payload and configuration.
 */
import type { MissionId } from '../../timeline/types';
import type { PartId } from '../../vehicle/parts';
import type { PhaseCard } from '../types';
import { F } from '../parts/derived';

type CardText = Omit<PhaseCard, 'mission' | 'phase'>;

export const card = (mission: MissionId, phase: string, c: CardText): PhaseCard => ({ mission, phase, ...c });

export interface AscentContext {
  mission: MissionId;
  stack: 'leo' | 'gto' | 'lunar';
  /** e.g. "Earth-observation satellite (6,200 kg)" */
  payload: string;
  recovery: boolean;
  /** Upper-stage thrust-to-weight ratio at ignition (formatted). */
  s2TW: string;
  /** Mission-specific reason for the launch time and direction (one or two sentences). */
  padWhy: string;
  /** What the upper stage does after the fairing comes off (one sentence, for the ses1 card). */
  upperNext: string;
}

/** The eight standard ascent phases: pad, ignition, liftoff, pitchover, maxq, meco, staging, ses1. */
export function ascentCards(a: AscentContext): PhaseCard[] {
  const s = F.stack[a.stack];
  const m = a.mission;
  const recoveryParts: PartId[] = a.recovery ? ['cold-gas-rcs'] : [];
  return [
    card(m, 'pad', {
      what: `The K-1 stands on the launch mount with the ${a.payload} inside its fairing. RP-1 is loaded first, then liquid oxygen, which boils at ${F.loxBoil} and streams from the vents as white vapour; it is topped up continuously. In the final minutes the helium bottles are charged, the tanks are raised to flight pressure, LOX is bled through the engines to chill their pumps, the tower's arms swing back and the flight computer takes over the count.`,
      whyNow: `LOX cannot wait: it boils away all the time, so it is loaded last and kept topped up until the final minutes. ${a.padWhy}`,
      parts: ['service-tower', 'launch-mount', 's1-lox-tank', 's1-fuel-tank', 's2-tanks', 'pressurization', 'avionics', 'fairing', 'sound-suppression'],
      forces: `The fuelled vehicle (${s.mass}) rests its weight of ${s.weight} on the hold-downs, and wind pushes on a ${F.vehicleHeight} tall stack. The tanks shrink as they chill, and frost forms on the thin LOX-tank wall, which has no foam insulation.`,
      next: 'With the tanks at flight pressure, the arms retracted and every system reporting ready, the computer starts the deluge water and then the engine start sequence.',
    }),
    card(m, 'ignition', {
      what: `Water floods the mount a few seconds before the seven E-1s start. In each engine the valves open in sequence, the gas generator spins up the turbopump and a slug of TEA-TEB lights the propellants with a green flash. Thrust builds to ${F.s1ThrustSL} over a few seconds while four clamps hold the vehicle down and the computer checks every engine.`,
      whyNow: 'Engines are most likely to misbehave in their first seconds. Holding the vehicle down turns a bad start into a safe shutdown on the pad instead of a failure in the air.',
      parts: ['s1-engine-cluster', 'engine', 'igniter', 'turbopump', 'gas-generator', 'main-valves', 'launch-mount', 'sound-suppression', 'flame-deflector'],
      forces: `Once thrust exceeds weight, the clamps pull down against a net upward load of about ${s.holdDown} (thrust minus weight, computed). The exhaust strikes the flame deflector and turns into the trench; the deluge water absorbs heat and noise, and most of the billowing cloud is steam.`,
      next: 'When all seven engines are at full thrust and within limits, the clamps release together. That release, not the ignition, is liftoff.',
      equation: 'thrust',
    }),
    card(m, 'liftoff', {
      what: `The clamps open and the vehicle rises, slowly at first: thrust exceeds weight only by a factor of ${s.tw}, so the net acceleration starts at about ${s.accel}. It climbs straight up past the ${F.towerHeight} service tower while the engine gimbals hold it upright against the wind.`,
      whyNow: 'Rising vertically first gets the vehicle clear of the tower and the pad quickly, before any turn could bring the plume or the vehicle close to the structure.',
      parts: ['s1-engine-cluster', 'thrust-structure', 'tvc-actuators', 'launch-mount', 'service-tower', 'sound-suppression', 'avionics'],
      forces: `Weight and thrust nearly balance at first, but the engines consume ${F.s1Mdot} of propellant, so the vehicle lightens and accelerates harder every second. Sound reflected from the ground is most intense in these first seconds; the vehicle is too slow for aerodynamic forces to matter yet.`,
      next: 'Once clear of the tower, guidance can start the turn toward the east.',
    }),
    card(m, 'pitchover', {
      what: 'A small, deliberate tilt toward the east (a pitch kick of a degree or two) starts the turn. From then on guidance keeps the nose pointed along the direction the vehicle is moving through the air, and gravity slowly bends the path toward horizontal: the gravity turn.',
      whyNow: `The turn must start early, while speed is low and a small tilt costs little. Every second spent climbing vertically loses about 9.8 m/s of speed to gravity without adding any of the sideways speed an orbit needs (${F.leoSpeed} at ${F.leoAlt}).`,
      parts: ['tvc-actuators', 'avionics', 's1-engine-cluster', 'nozzle'],
      forces: `With the nose along the airflow the angle of attack stays near zero, so the long, thin vehicle feels little sideways aerodynamic load; gravity does the turning for free. Launching east also borrows Earth's rotation: ${F.earthRotationSpeed} at ${F.siteLat} (computed).`,
      next: 'Speed now rises quickly while the air is still fairly dense, so the aerodynamic pressure on the vehicle climbs toward its maximum.',
    }),
    card(m, 'maxq', {
      what: `The dynamic pressure q = ½·ρ·v², the pressure of the oncoming air, climbs to its peak: speed is rising fast while air density falls with altitude, and their product passes through a maximum shortly after the vehicle passes the speed of sound. The engines throttle down to about ${F.throttleBucket} while q climbs steeply through the transonic region, then back up.`,
      whyNow: 'Before this point the air is dense but the vehicle is slow; after it the vehicle is fast but the air is thin. Throttling down for a few seconds slows the gain in speed while the air is still dense, which lowers the peak load, instead of making the whole structure heavier to carry a higher one.',
      parts: ['s1-engine-cluster', 'gas-generator', 'fairing', 'interstage', 's1-intertank', 's1-lox-tank', 'thrust-structure', 'tvc-actuators', 'avionics'],
      forces: 'Peak aerodynamic pressure on the fairing and body, bending loads from wind gusts that the gimbals steer against, buffeting as the flow goes transonic, and heating of the fairing nose. The throttle is set through the gas generators (turbine power), not the main valves. The telemetry shows the peak computed for this flight.',
      next: 'Past the peak the engines return to full thrust. The air thins quickly, the plumes begin to widen, and the booster burns on toward cutoff.',
      equation: 'dynamic-pressure',
    }),
    card(m, 'meco', {
      what: a.recovery
        ? 'All seven engines shut down, LOX valves first, with a reserve of propellant left in the tanks for the booster\'s return. The vehicle is above almost all of the atmosphere, moving at several times the speed of sound and already faster sideways than upward.'
        : 'All seven engines shut down, LOX valves first, after burning almost all of their propellant. The vehicle is above almost all of the atmosphere, moving at several times the speed of sound and already faster sideways than upward.',
      whyNow: a.recovery
        ? 'Cutoff is set by the propellant that must remain: the booster keeps enough for its boostback, entry and landing burns, so it stops earlier (lower and slower) than an expendable booster would, and the upper stage makes up the difference.'
        : `Without recovery the booster uses nearly all of its ${F.s1Prop} of propellant: every extra second of first-stage burn is speed the upper stage does not have to supply.`,
      parts: ['s1-engine-cluster', 'main-valves', 'avionics', 's1-lox-tank', 'lox-downcomer', 's1-fuel-tank', 'base-heat-shield'],
      forces: 'The vehicle is now much lighter than at liftoff, so acceleration is at its highest of the first-stage burn (guidance throttles to limit it). With the ambient pressure near zero the plumes balloon outward and heat the base. At cutoff the thrust vanishes and the compressed structure springs back.',
      next: 'A few seconds of coasting let the engines\' thrust die away completely, so the stages can separate cleanly.',
      equation: 'rocket-equation',
    }),
    card(m, 'staging', {
      what: `The collets at the top of the interstage release and pneumatic pushers push the stages apart at about ${F.stageSepSpeed}, walking pace. The upper stage slides out of the interstage: its nozzle has ${F.nozzleInsideInterstage} to travel before it is clear.${a.recovery ? ' The booster\'s cold-gas thrusters start turning it around for the trip home.' : ' The spent booster falls away into the ocean downrange.'}`,
      whyNow: `Staging drops ${s.boosterEmpty} of empty booster structure. The rocket equation rewards it: carrying that mass on would cost the upper stage about ${s.carryBoosterLoss} of ideal velocity change on this mission (computed).`,
      parts: ['stage-separation', 'interstage', 'vacuum-engine', 'avionics', 's2-rcs', ...recoveryParts],
      forces: 'For these seconds both stages are in free fall, so the propellant in the tanks floats. The push-off and the upper stage\'s small thrusters keep the stage steady and the propellant near the outlets.',
      next: 'Once the E-1V nozzle is clear of the interstage, the upper-stage engine can start without blasting the booster.',
      equation: 'rocket-equation',
    }),
    card(m, 'ses1', {
      what: `The E-1V starts (a TEA-TEB flash, the turbopump spinning up) and within seconds its niobium nozzle extension begins to glow. The upper stage and the ${a.payload} fly on alone${a.recovery ? ', while the booster begins its own journey home' : ''}.`,
      whyNow: 'The pause after separation lets the nozzle clear the interstage; waiting any longer would waste time in which gravity slows the climbing stage.',
      parts: ['vacuum-engine', 'nozzle-extension', 'igniter', 's2-tanks', 'tvc-actuators', 'avionics'],
      forces: `At ignition the stage's thrust-to-weight ratio is only about ${a.s2TW} (computed): its thrust barely exceeds its weight. That is enough: the stage is already high and climbing fast, and what it needs now is horizontal speed. Its ${F.e1vThrust} comes in near vacuum, where the large nozzle is most efficient.`,
      next: a.upperNext,
      equation: 'thrust',
    }),
  ];
}

/** The booster's return-to-launch-site branch (flip, boostback, coast, entry burn, aero guidance, landing). */
export function rtlsCards(mission: MissionId): PhaseCard[] {
  const m = mission;
  return [
    card(m, 'flip', {
      what: 'Freed from the upper stage, the booster uses its nitrogen thrusters to turn itself end over end, until its engines face forward along its direction of travel, so that their thrust can push it back toward the coast. The avionics ring that guided the ascent has left with the upper stage; from here the booster\'s own flight computers and navigation sensors fly every step of the return.',
      whyNow: 'The booster is still moving away from the coast at high speed. It is above most of the air, its engines are off and its fins are folded, so only the reaction thrusters can turn it, and every second it waits it travels further downrange.',
      parts: ['cold-gas-rcs', 'booster-avionics', 's1-lox-tank', 's1-fuel-tank', 'pressurization'],
      forces: 'Almost no air, so no aerodynamic help or hindrance; the thrusters work at the top of the long booster for maximum leverage. The reserve propellant sloshes as the booster rotates.',
      next: 'Pointing the right way, with the propellant pushed back over the outlets, three engines can relight.',
    }),
    card(m, 'boostback', {
      what: `Three E-1s relight (TEA-TEB again) and fire against the booster's downrange motion, reversing it so that the ballistic arc now bends back toward the landing zone on the coast, ${F.landingZoneDistance} from the pad.`,
      whyNow: 'The sooner the booster cancels its downrange speed, the less distance it has to make up. This is the most propellant-hungry part of the return and the main reason the booster cut off early.',
      parts: ['s1-engine-cluster', 'engine', 'igniter', 'tvc-actuators', 'turbopump', 'booster-avionics', 's1-lox-tank', 's1-fuel-tank'],
      forces: 'A light, nearly empty booster on three engines accelerates strongly. The engines fire in near vacuum, so their plumes are wide. The propellant must stay settled over the outlets throughout.',
      next: 'With the arc aimed back at the coast, the engines shut down and the booster coasts over the top of its trajectory.',
      equation: 'rocket-equation',
    }),
    card(m, 'booster-coast', {
      what: 'The booster coasts up and over the top of its arc, engines first. The four grid fins unfold from the forward skirt, and the cold-gas thrusters hold it in the right attitude for the fall.',
      whyNow: 'There is nothing to do but fall: the boostback has set the arc. Deploying the fins now, in near vacuum, means they are ready as soon as the air thickens.',
      parts: ['grid-fins', 'cold-gas-rcs', 'booster-avionics', 'pressurization'],
      forces: 'Free fall: gravity alone shapes the arc, and the booster and its propellant are weightless. The tanks stay pressurized for stiffness and for the next relight.',
      next: 'Falling back into denser air at high speed, the booster must slow down before the heating and loads grow too large.',
    }),
    card(m, 'entry-burn', {
      what: 'Three engines relight while the booster falls engines first through the upper atmosphere, slowing it sharply. The exhaust pushes into the oncoming flow and forms a protective cushion of gas ahead of the base.',
      whyNow: 'Heating and aerodynamic load grow steeply with speed. Braking before the air gets dense keeps them within what the base and structure can take.',
      parts: ['s1-engine-cluster', 'engine', 'base-heat-shield', 'grid-fins', 'igniter', 'booster-avionics'],
      forces: 'Engines firing into a supersonic oncoming flow (supersonic retropropulsion): complex shock and plume interaction, heating around the base, strong deceleration. The glow and soot on the booster\'s lower body come from here.',
      next: 'Once slowed, the booster falls through the lower atmosphere under aerodynamic control.',
      equation: 'dynamic-pressure',
    }),
    card(m, 'aero-guidance', {
      what: 'The booster falls through the lower atmosphere engines first, steered by its grid fins toward the landing zone, using no propellant. Its own flight computer compares where it is heading with where the pad is and turns the error into fin commands.',
      whyNow: 'The air is now dense enough for the fins to work, and steering with them is free, while the engines stay off until the last moment to save propellant.',
      parts: ['grid-fins', 'booster-avionics', 'cold-gas-rcs', 'base-heat-shield', 'thrust-structure'],
      forces: 'Drag slows the booster toward a steady falling speed; dynamic pressure is high in the dense air; the fins, at the trailing end relative to the flow, keep it stable like the feathers of an arrow.',
      next: 'Close to the ground, the booster must remove its remaining speed exactly at the landing pad.',
      equation: 'dynamic-pressure',
    }),
    card(m, 'landing-burn', {
      what: 'The centre engine alone relights for the landing. The legs swing open seconds before touchdown and the booster sets down upright on the landing zone.',
      whyNow: `Even throttled to its minimum, one E-1 gives ${F.landingThrustMin}, more than the ${F.boosterDryWeight} weight of the empty booster (thrust-to-weight about ${F.landingTWDry}), so the booster cannot hover. The burn is timed so the speed reaches zero at the moment it reaches the ground: too early and it would stop in mid-air and climb back up; too late and it would hit hard.`,
      parts: ['engine', 's1-engine-cluster', 'tvc-actuators', 'landing-legs', 'igniter', 'grid-fins', 'booster-avionics'],
      forces: 'Deceleration of a few g, the plume reflecting from the landing pad onto the base, and at touchdown the leg loads, absorbed by crushable cores in the feet.',
      next: 'After engine cutoff the booster is made safe (vented, pressures lowered) and taken back for inspection and reuse.',
      equation: 'thrust',
    }),
  ];
}
