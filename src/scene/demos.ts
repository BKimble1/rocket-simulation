/**
 * Subsystem demonstrations: short, labelled mechanism animations that run on the stage clock
 * (they may play while a mission is paused, and never change the mission). One at a time.
 */
import type { DemoId } from '../content/types';
import type { PartId } from '../vehicle/parts';

export interface DemoDef {
  id: DemoId;
  title: string;
  /** Which hangar object performs it. */
  on: 'vehicle' | 'engine' | 'vacuum' | 'both-engines';
  /** Part to frame while it runs. */
  frame: PartId;
  duration: number;
  loop: boolean;
  /** On-screen honesty label (slowed, illustrative flow, section view...). */
  label: string;
  /** View the vehicle should be in while the demo runs. */
  view?: 'intact' | 'cutaway' | 'exploded';
}

export const DEMOS: Record<DemoId, DemoDef> = {
  'tank-drain': { id: 'tank-drain', title: 'Tanks drain during a burn', on: 'vehicle', frame: 's1-lox-tank', duration: 12, loop: false, label: 'Section view · levels shown for a full-thrust burn, time compressed', view: 'cutaway' },
  'feed-flow': { id: 'feed-flow', title: 'Propellant feed routes', on: 'vehicle', frame: 'lox-downcomer', duration: 10, loop: true, label: 'Section view · illustrative flow colours (LOX blue, RP-1 amber)', view: 'cutaway' },
  'tank-pressure': { id: 'tank-pressure', title: 'Helium keeps the tanks pressurized', on: 'vehicle', frame: 'pressurization', duration: 10, loop: true, label: 'Section view · illustrative pressurant flow', view: 'cutaway' },
  turbopump: { id: 'turbopump', title: 'Turbopump, slowed down', on: 'engine', frame: 'turbopump', duration: 12, loop: true, label: 'Section view · shaft shown about 1,000 times slower than its 32,000 rpm', view: 'cutaway' },
  combustion: { id: 'combustion', title: 'Injector, combustion, thrust', on: 'engine', frame: 'combustion-chamber', duration: 12, loop: false, label: 'Section view · illustrative start sequence, slowed' },
  'regen-cooling': { id: 'regen-cooling', title: 'Fuel cools the chamber', on: 'engine', frame: 'combustion-chamber', duration: 10, loop: true, label: 'Section view · illustrative coolant flow' },
  'nozzle-pressure': { id: 'nozzle-pressure', title: 'Sea-level and vacuum nozzles', on: 'both-engines', frame: 'nozzle-extension', duration: 10, loop: true, label: 'Comparison · the two engines share the same core' },
  tvc: { id: 'tvc', title: 'Gimbal steering', on: 'engine', frame: 'tvc-actuators', duration: 8, loop: true, label: 'Demonstration · gimbal angles exaggerated in speed, within the ±5° range' },
  'gnc-loop': { id: 'gnc-loop', title: 'Navigate, guide, control', on: 'vehicle', frame: 'avionics', duration: 10, loop: true, label: 'Schematic loop · sensors, computer, actuators' },
  'staging-sequence': { id: 'staging-sequence', title: 'Stage separation step by step', on: 'vehicle', frame: 'stage-separation', duration: 12, loop: false, label: 'Hangar demonstration · motion enlarged for inspection' },
  'fairing-sep': { id: 'fairing-sep', title: 'Fairing halves open on hinges', on: 'vehicle', frame: 'fairing', duration: 8, loop: false, label: 'Hangar demonstration · in flight the halves fly away' },
  'spacecraft-ops': { id: 'spacecraft-ops', title: 'Satellite unfolds', on: 'vehicle', frame: 'satellite-bus', duration: 14, loop: false, label: 'Demonstration · deployment speed exaggerated', view: 'exploded' },
  'booster-recovery': { id: 'booster-recovery', title: 'Grid fins and landing legs', on: 'vehicle', frame: 'landing-legs', duration: 10, loop: false, label: 'Hangar demonstration · deploy speeds shown in real time' },
  'capsule-return': { id: 'capsule-return', title: 'Parachute sequence', on: 'vehicle', frame: 'parachutes', duration: 12, loop: false, label: 'Demonstration · reefing stages shortened', view: 'exploded' },
  'sandwich-panel': { id: 'sandwich-panel', title: 'Inside a sandwich panel', on: 'vehicle', frame: 'fairing', duration: 8, loop: true, label: 'Section view · thicknesses enlarged', view: 'cutaway' },
  'heat-shield-stack': { id: 'heat-shield-stack', title: 'Heat-shield layers', on: 'vehicle', frame: 'heat-shield', duration: 10, loop: true, label: 'Section view · layers separated for inspection', view: 'exploded' },
};

export const demoClock = {
  id: null as DemoId | null,
  playing: false,
  /** Seconds into the demo. */
  t: 0,
  speed: 1,
};

export function startDemo(id: DemoId | null) {
  demoClock.id = id;
  demoClock.t = 0;
  demoClock.playing = !!id;
}

export function demoProgress(): number {
  const d = demoClock.id ? DEMOS[demoClock.id] : null;
  if (!d) return 0;
  return d.loop ? (demoClock.t % d.duration) / d.duration : Math.min(1, demoClock.t / d.duration);
}
