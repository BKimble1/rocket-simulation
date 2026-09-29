/**
 * What the effects draw, as pure functions of mission time (so a seek reconstructs exactly
 * the smoke, trails and plumes that playing would show). The flight integration provides the
 * real source from the mission timeline and the vehicle anchors; the effects dev harness
 * provides a synthetic one. All positions/directions are ABSOLUTE (frame I); convert with
 * frame.origin when drawing.
 */
import type * as THREE from 'three';

export type EmitterKind =
  | 'kerolox-sl' // first-stage E-1 (sea-level nozzle)
  | 'kerolox-vac' // upper-stage E-1V
  | 'hypergolic' // service module / satellite apogee engine / capsule RCS
  | 'solid' // abort-tower motor
  | 'cold-gas' // nitrogen RCS
  | 'mono'; // hydrazine attitude thrusters

export interface Emitter {
  id: string;
  kind: EmitterKind;
  /** Nozzle exit centre. */
  pos: THREE.Vector3;
  /** Direction the exhaust flows (unit). */
  dir: THREE.Vector3;
  exitRadius: number;
  /** 0..1 of rated thrust. */
  throttle: number;
  /** Ambient static pressure (Pa) and altitude (m) at the nozzle. */
  ambientPressure: number;
  altitude: number;
  /** Vehicle velocity relative to the local air (m/s), frame I directions. */
  airVel: THREE.Vector3;
  /** Gas-generator turbine exhaust outlet (kerolox engines), if any. */
  ggExhaust?: { pos: THREE.Vector3; dir: THREE.Vector3 };
  /** Mission seconds since this burn began (start transient, TEA-TEB green flash). */
  sinceIgnition: number;
}

export interface PlasmaSource {
  id: string;
  /** Centre of the heated face (heat shield or booster base). */
  pos: THREE.Vector3;
  /** Direction of travel through the air (unit). */
  dir: THREE.Vector3;
  radius: number;
  /** 0..1 heating intensity. */
  intensity: number;
}

export interface PadState {
  venting: number;
  deluge: number;
  holddown: number;
  arms: number;
}

export interface EffectsSource {
  emittersAt(t: number, out: Emitter[]): Emitter[];
  plasmaAt(t: number, out: PlasmaSource[]): PlasmaSource[];
  padAt(t: number, out: PadState): PadState;
  /** Mission time of liftoff-relevant ground events (ground cloud source), e.g. engine start. */
  groundBlastStart: number | null;
  groundBlastEnd: number | null;
}

export const effects = {
  source: null as EffectsSource | null,
  /** Incremented on every seek: stateful systems must rebuild from mission time. */
  seekEpoch: 0,
};
