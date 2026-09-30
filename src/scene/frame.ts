/**
 * Per-frame shared state for the 3D stage. Written in a fixed order inside the render loop
 * (never through React state):
 *
 *   priority -30  player tick          frame.missionTime, frame.tl
 *   priority -20  body sampling        frame.bodies (pure functions of the mission time)
 *   priority -10  director             frame.camAbs / frame.origin, camera orientation
 *   priority   0  scene components     object positions = absolute - frame.origin
 *   priority  10  director render      gl.render of the active location(s)
 *
 * Positions in frame I are float64 (JS numbers). frame.origin is the floating origin: the
 * camera's absolute position, so everything near the camera has small float32 coordinates.
 */
import * as THREE from 'three';
import type { BodyId } from '../vehicle/parts';
import type { MissionTimeline } from '../timeline/types';
import { makeBodyState, type BodyState } from '../timeline/sample';

export type Location = 'hangar' | 'flight' | 'map';

export const BODY_IDS: BodyId[] = ['booster', 'upper', 'fairingA', 'fairingB', 'satellite', 'capsule', 'service', 'les', 'station'];

export const frame = {
  /** Mission time being displayed (s, T-0 = liftoff). */
  missionTime: -30,
  /** Presentation time (s) of the active player. */
  presTime: 0,
  /** Mission timeline being displayed in the flight location (null: none loaded). */
  tl: null as MissionTimeline | null,
  /** Sampled body states at missionTime (absolute, frame I). */
  bodies: Object.fromEntries(BODY_IDS.map((id) => [id, makeBodyState()])) as Record<BodyId, BodyState>,
  /** Floating origin (absolute position subtracted from everything before rendering). */
  origin: new THREE.Vector3(),
  /** Camera absolute position and orientation (frame I). */
  camAbs: new THREE.Vector3(),
  camQuat: new THREE.Quaternion(),
  camFov: 40,
  /** Local "up" (radial) at the camera. */
  camUp: new THREE.Vector3(0, 1, 0),
  /** Altitude of the camera above the spherical Earth (m). */
  camAlt: 0,
  /** Decorative seconds (idle motion: wind, shimmer, flicker): the UI clock (see clock.ts). */
  decor: 0,
  /** This frame's step (s): the real interval, capped (see clock.ts). */
  dt: 1 / 60,
  /** Largest step one frame may advance the clocks (s). */
  maxStep: 0.25,
  /** UI clock (s): the sum of frame steps. Camera transitions, dissolves, demonstrations. */
  clock: 0,
  /** Real interval since the previous frame (ms, uncapped; for the frame-rate monitor). */
  intervalMs: 0,
  /**
   * The hangar is static apart from its animations, so its shadow map is rendered only when
   * something moved (the scene sets this); flight locations update shadows every frame.
   */
  shadowDirty: true,
  /** Which location is on screen (and which one is being dissolved to). */
  location: 'hangar' as Location,
  /** Frame counter. */
  n: 0,
  /** Mission playback is paused (demonstrations may still animate on the stage clock). */
  paused: true,
  /**
   * Presentation is inside an omitted (skipped) interval: the picture captured on entering it is
   * held, with a note, until the interval ends (see scene/dissolve.ts).
   */
  omitted: false,
  /** Playback entered an omitted interval this frame (capture the picture now). */
  enteredOmitted: false,
};

/** Convert an absolute (frame I) position into render coordinates. */
export function toRender(abs: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  return out.set(abs.x - frame.origin.x, abs.y - frame.origin.y, abs.z - frame.origin.z);
}
