/**
 * Mission outlines: the fixed phase and event vocabulary of every mission lesson. The physics
 * builders must produce exactly these phases (in this order) and these events; the lesson
 * content, narration, knowledge checks and tests refer to them by id. Times are NOT here: they
 * come from the trajectory model (build.ts), so text and animation cannot disagree.
 */
import type { BodyId } from '../../vehicle/parts';
import type { MissionId } from '../types';
import type { PayloadConfig } from '../../scene/vehicle/types';

export interface PhaseOutline {
  id: string;
  title: string;
  focus: BodyId;
}

export interface MissionOutline {
  id: MissionId;
  title: string;
  short: string;
  purpose: string;
  payload: PayloadConfig;
  recovery: boolean;
  stack: 'full' | 'boosterOnly';
  /** Recommended first mission. */
  recommended?: boolean;
  phases: PhaseOutline[];
  /** Parallel storyline (booster recovery) phases, if any. */
  branch?: { id: string; title: string; focus: BodyId; phases: PhaseOutline[] };
  /** Event ids the builder must emit (each with a time). */
  events: string[];
  /** Knowledge outcome shown on the mission card. */
  outcome: string;
}

const ascent = (focus: BodyId = 'booster'): PhaseOutline[] => [
  { id: 'pad', title: 'Countdown and propellant loading', focus },
  { id: 'ignition', title: 'Ignition and hold-down release', focus },
  { id: 'liftoff', title: 'Liftoff and tower clearance', focus },
  { id: 'pitchover', title: 'Pitch-over and gravity turn', focus },
  { id: 'maxq', title: 'Maximum dynamic pressure', focus },
  { id: 'meco', title: 'Booster engine cutoff', focus },
  { id: 'staging', title: 'Stage separation', focus: 'upper' },
  { id: 'ses1', title: 'Upper-stage ignition', focus: 'upper' },
];

const ASCENT_EVENTS = ['arms-retract', 'engine-start', 'liftoff', 'tower-clear', 'pitch-start', 'max-q', 'throttle-down', 'throttle-up', 'meco', 'stage-sep', 'ses1'];

const RTLS = {
  id: 'booster-rtls',
  title: 'Booster return and landing',
  focus: 'booster' as BodyId,
  phases: [
    { id: 'flip', title: 'Flip with cold-gas thrusters', focus: 'booster' as BodyId },
    { id: 'boostback', title: 'Boostback burn', focus: 'booster' as BodyId },
    { id: 'booster-coast', title: 'Coast over apogee, fins deployed', focus: 'booster' as BodyId },
    { id: 'entry-burn', title: 'Entry burn', focus: 'booster' as BodyId },
    { id: 'aero-guidance', title: 'Grid-fin steering in the atmosphere', focus: 'booster' as BodyId },
    { id: 'landing-burn', title: 'Landing burn, legs and touchdown', focus: 'booster' as BodyId },
  ],
};
const RTLS_EVENTS = ['fins-deploy', 'boostback-start', 'boostback-end', 'entry-start', 'entry-end', 'landing-start', 'legs-deploy', 'touchdown'];

export const OUTLINES: Record<MissionId, MissionOutline> = {
  leo: {
    id: 'leo',
    title: 'Satellite to low Earth orbit',
    short: 'Satellite to LEO',
    purpose: 'Carry an Earth-observation satellite from the pad to a 400 km orbit, release it and see it unfold, while the booster returns to land.',
    payload: 'leoSat',
    recovery: true,
    stack: 'full',
    recommended: true,
    phases: [
      ...ascent(),
      { id: 'fairing', title: 'Fairing separation', focus: 'upper' },
      { id: 'upper-burn', title: 'Upper-stage burn to orbit', focus: 'upper' },
      { id: 'seco', title: 'Engine cutoff: in orbit', focus: 'upper' },
      { id: 'coast', title: 'Coasting in orbit', focus: 'upper' },
      { id: 'deploy', title: 'Payload separation', focus: 'satellite' },
      { id: 'arrays', title: 'Solar arrays and first contact', focus: 'satellite' },
    ],
    branch: RTLS,
    events: [...ASCENT_EVENTS, 'fairing-sep', 'seco', 'payload-sep', 'arrays-deploy', 'antenna-deploy', ...RTLS_EVENTS],
    outcome: 'How the stages, the payload fairing, guidance and orbital insertion work together to put a satellite in orbit.',
  },
  suborbital: {
    id: 'suborbital',
    title: 'Suborbital research flight',
    short: 'Suborbital hop',
    purpose: 'Loft a research capsule above 100 km on the booster alone, give it minutes of free fall, and bring it back under parachutes.',
    payload: 'researchCapsule',
    recovery: true,
    stack: 'boosterOnly',
    phases: [
      { id: 'pad', title: 'Countdown', focus: 'booster' },
      { id: 'ignition', title: 'Ignition and hold-down release', focus: 'booster' },
      { id: 'liftoff', title: 'Liftoff and vertical ascent', focus: 'booster' },
      { id: 'meco', title: 'Engine cutoff', focus: 'capsule' },
      { id: 'capsule-sep', title: 'Capsule separation', focus: 'capsule' },
      { id: 'apogee', title: 'Coast over apogee: free fall', focus: 'capsule' },
      { id: 'descent', title: 'Falling back', focus: 'capsule' },
      { id: 'entry', title: 'Entry, heat shield first', focus: 'capsule' },
      { id: 'parachutes', title: 'Drogue and main parachutes', focus: 'capsule' },
      { id: 'splashdown', title: 'Splashdown and recovery', focus: 'capsule' },
    ],
    branch: {
      id: 'booster-return',
      title: 'Booster landing',
      focus: 'booster',
      phases: [
        { id: 'booster-coast', title: 'Coast and flip', focus: 'booster' },
        { id: 'aero-guidance', title: 'Grid-fin steering', focus: 'booster' },
        { id: 'landing-burn', title: 'Landing burn and touchdown', focus: 'booster' },
      ],
    },
    events: ['arms-retract', 'engine-start', 'liftoff', 'tower-clear', 'meco', 'capsule-sep', 'karman-up', 'apogee', 'karman-down', 'peak-heating', 'drogue-deploy', 'main-deploy', 'main-disreef', 'splashdown', 'fins-deploy', 'landing-start', 'legs-deploy', 'touchdown'],
    outcome: 'Reaching space is different from staying in orbit: height without sideways speed falls back.',
  },
  gto: {
    id: 'gto',
    title: 'Geostationary transfer',
    short: 'Geostationary transfer',
    purpose: 'Put a communications satellite on a transfer orbit toward 35,786 km, and see which vehicle performs each maneuver.',
    payload: 'gtoSat',
    recovery: false,
    stack: 'full',
    phases: [
      ...ascent(),
      { id: 'fairing', title: 'Fairing separation', focus: 'upper' },
      { id: 'parking', title: 'Burn to a parking orbit', focus: 'upper' },
      { id: 'parking-coast', title: 'Coast in the parking orbit', focus: 'upper' },
      { id: 'restart', title: 'Settling and engine restart', focus: 'upper' },
      { id: 'gto-injection', title: 'Transfer-orbit injection', focus: 'upper' },
      { id: 'deploy', title: 'Satellite separation', focus: 'satellite' },
      { id: 'transfer-coast', title: 'Climbing to apogee', focus: 'satellite' },
      { id: 'circularize', title: 'Circularization by the satellite (explanatory)', focus: 'satellite' },
    ],
    events: [...ASCENT_EVENTS, 'fairing-sep', 'seco1', 'settling', 'ses2', 'seco2', 'payload-sep', 'apogee', 'apogee-burn-start', 'apogee-burn-end'],
    outcome: 'A transfer orbit is not the final orbit: the launch vehicle raises the far point, the satellite finishes the job.',
  },
  station: {
    id: 'station',
    title: 'Station delivery',
    short: 'Station delivery',
    purpose: 'Launch a crew capsule into the station’s orbital plane, catch up by phasing, and dock. The crew stack with its abort tower needs all of the booster’s propellant, so on this mission the booster is expended instead of flying home.',
    payload: 'capsule',
    recovery: false,
    stack: 'full',
    phases: [
      { id: 'pad', title: 'Countdown and crew access arm', focus: 'booster' },
      { id: 'ignition', title: 'Ignition and hold-down release', focus: 'booster' },
      { id: 'liftoff', title: 'Liftoff into the station’s plane', focus: 'booster' },
      { id: 'maxq', title: 'Maximum dynamic pressure', focus: 'booster' },
      { id: 'staging', title: 'Stage separation', focus: 'upper' },
      { id: 'abort-jettison', title: 'Abort tower jettison', focus: 'upper' },
      { id: 'insertion', title: 'Orbit insertion below the station', focus: 'upper' },
      { id: 'capsule-sep', title: 'Capsule separation and array deployment', focus: 'capsule' },
      { id: 'phasing', title: 'Phasing: catching up from a lower orbit', focus: 'capsule' },
      { id: 'raise', title: 'Raising the orbit to the station', focus: 'capsule' },
      { id: 'approach', title: 'Final approach along the radial line', focus: 'capsule' },
      { id: 'docking', title: 'Soft capture and hard capture', focus: 'capsule' },
    ],
    events: ['arms-retract', 'engine-start', 'liftoff', 'tower-clear', 'max-q', 'meco', 'stage-sep', 'ses1', 'les-jettison', 'seco', 'capsule-sep', 'arrays-deploy', 'phasing-burn-1', 'phasing-burn-2', 'hold-point', 'soft-capture', 'hard-capture'],
    outcome: 'Why matching relative motion matters, why a spacecraft cannot simply point at a station and fly straight to it, and why a heavier payload can cost the booster its return trip.',
  },
  return: {
    id: 'return',
    title: 'Capsule return',
    short: 'Capsule return',
    purpose: 'Leave the station, lower the orbit with a deorbit burn, discard the service module, and survive entry to splash down under parachutes.',
    payload: 'capsule',
    recovery: false,
    stack: 'full',
    phases: [
      { id: 'undock', title: 'Undocking and departure', focus: 'capsule' },
      { id: 'deorbit', title: 'Deorbit burn', focus: 'capsule' },
      { id: 'sm-sep', title: 'Service module separation', focus: 'capsule' },
      { id: 'entry', title: 'Entry: heat shield first', focus: 'capsule' },
      { id: 'blackout', title: 'Peak heating and deceleration', focus: 'capsule' },
      { id: 'drogues', title: 'Drogue parachutes', focus: 'capsule' },
      { id: 'mains', title: 'Main parachutes', focus: 'capsule' },
      { id: 'splashdown', title: 'Splashdown and recovery', focus: 'capsule' },
    ],
    events: ['undock', 'departure-burn', 'deorbit-start', 'deorbit-end', 'sm-sep', 'entry-interface', 'peak-heating', 'peak-g', 'drogue-deploy', 'main-deploy', 'main-disreef', 'splashdown'],
    outcome: 'How unneeded hardware is discarded, how the atmosphere removes orbital energy, and how the heat shield and parachutes protect the crew.',
  },
  lunar: {
    id: 'lunar',
    title: 'Lunar flyby',
    short: 'Lunar flyby',
    purpose: 'Send a probe from a parking orbit to swing past the Moon and continue outbound, following the changing pull of Earth and Moon.',
    payload: 'lunarProbe',
    recovery: false,
    stack: 'full',
    phases: [
      ...ascent(),
      { id: 'fairing', title: 'Fairing separation', focus: 'upper' },
      { id: 'parking', title: 'Burn to a parking orbit', focus: 'upper' },
      { id: 'parking-coast', title: 'Coast to the departure point', focus: 'upper' },
      { id: 'tli', title: 'Trans-lunar injection', focus: 'upper' },
      { id: 'probe-sep', title: 'Probe separation', focus: 'satellite' },
      { id: 'cruise', title: 'Three-day coast to the Moon', focus: 'satellite' },
      { id: 'soi', title: 'Entering the Moon’s sphere of influence', focus: 'satellite' },
      { id: 'flyby', title: 'Closest approach', focus: 'satellite' },
      { id: 'outbound', title: 'Outbound trajectory', focus: 'satellite' },
    ],
    events: [...ASCENT_EVENTS, 'fairing-sep', 'seco1', 'settling', 'ses2', 'seco2', 'payload-sep', 'soi-enter', 'closest-approach', 'soi-exit'],
    outcome: 'Mission phases, coasting, the changing gravitational context, and why a flyby is not an orbit insertion.',
  },
};

export const MISSION_ORDER: MissionId[] = ['leo', 'suborbital', 'gto', 'station', 'return', 'lunar'];
