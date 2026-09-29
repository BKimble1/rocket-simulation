/**
 * The mission timeline: the single deterministic source of truth for everything that moves or
 * changes during a mission lesson. It is BUILT ONCE when a mission is opened (from the mission
 * spec, by the simplified physics in timeline/physics), then only SAMPLED: every frame and
 * every seek reads the state at a mission time with pure functions, so seeking to any moment
 * reconstructs exactly the frame that playing up to it would show.
 *
 * Three clocks:
 *   mission time  t (s)   physical time, T-0 = liftoff (negative during the countdown)
 *   presentation  p (s)   what the playback bar shows; maps to t piecewise-linearly, with
 *                         accelerated coasts and optional slow motion stated on screen
 *   stage clock           wall clock minus hidden/paused time (drives decorative motion only)
 */
import type { BodyId, PartId, Variant } from '../vehicle/parts';
import type { PayloadId } from '../vehicle/spec';

export type MissionId = 'leo' | 'suborbital' | 'gto' | 'station' | 'return' | 'lunar';

/** Piecewise-linear keyframed scalar (times strictly increasing). Held constant outside. */
export interface Channel {
  t: number[];
  v: number[];
}

/**
 * Known state channels. Throttle channels are fractions of rated thrust (0 = off); deploy
 * channels run 0 (stowed) to 1 (deployed); propellant channels are the usable fraction left.
 */
export type ChannelId =
  | 's1.center.throttle'
  | 's1.outer.throttle'
  | 's1.gimbalPitch' // deg, + pitches the nose toward the downrange direction
  | 's1.gimbalYaw'
  | 's1.lox'
  | 's1.rp1'
  | 's1.legs'
  | 's1.fins'
  | 's1.finDeflect' // deg
  | 's1.rcs' // cold-gas thruster activity 0..1
  | 's1.entryGlow' // reentry-burn plume/shock heating visual 0..1
  | 's2.throttle'
  | 's2.gimbalPitch'
  | 's2.lox'
  | 's2.rp1'
  | 's2.rcs'
  | 'fairing.open' // 0 closed, 1 halves fully rotated away on their hinges
  | 'sat.arrays'
  | 'sat.antenna'
  | 'sat.rcs'
  | 'sat.apogee.throttle'
  | 'cap.drogue' // 0 stowed, 1 inflated
  | 'cap.main' // 0 stowed, 0.5 reefed, 1 fully open
  | 'cap.plasma' // entry heating glow 0..1
  | 'cap.char' // accumulated heat-shield charring 0..1 (illustrative)
  | 'cap.noseCone' // docking-port cover 0 closed .. 1 open
  | 'cap.rcs'
  | 'cap.docked' // 0 free, 1 hard-captured
  | 'sm.throttle'
  | 'sm.arrays'
  | 'sm.rcs'
  | 'les.motor' // abort/jettison motor burn 0..1
  | 'pad.venting' // LOX boil-off venting visual
  | 'pad.deluge' // sound suppression water
  | 'pad.holddown' // 0 clamped, 1 released
  | 'pad.arms' // umbilical/access arm retraction 0 attached .. 1 retracted
  | 'pad.chilldown'; // engine chill-down / ignition sequence indicator 0..1

/** Sampled rigid-body motion in frame I (see world/frames.ts). */
export interface BodyTrack {
  id: BodyId;
  /** Mission times of the samples, strictly increasing. */
  t: Float64Array;
  /** Positions, 3 per sample (m). */
  pos: Float64Array;
  /** Velocities, 3 per sample (m/s), used for Hermite interpolation and telemetry. */
  vel: Float64Array;
  /**
   * Orientation, 4 per sample (x, y, z, w): rotates the body's model frame (+Y along the
   * vehicle axis toward the nose) into frame I.
   */
  quat: Float64Array;
  /** Mission-time interval during which the body is in the world (drawn and selectable). */
  exists: [number, number];
  /** While attached, the body it rides on (for labels and focus logic). */
  attached: { to: BodyId; until: number } | null;
  /** Mass (kg) at each sample (for telemetry and centre-of-mass overlays). */
  mass: Float64Array;
}

export type EventKind = 'countdown' | 'engine' | 'separation' | 'deploy' | 'milestone' | 'burn' | 'recovery' | 'dock' | 'entry';

export interface MissionEvent {
  id: string;
  /** Mission time (s). */
  t: number;
  label: string;
  kind: EventKind;
  bodies: BodyId[];
  /** Mechanical/audio cue fired when playback crosses the event moving forward (never on seek). */
  sound?: 'ignition' | 'release' | 'sep' | 'pyro' | 'valve' | 'chute' | 'splash' | 'touchdown' | 'dock' | 'cutoff' | 'rcs';
}

export interface Phase {
  id: string;
  title: string;
  /** Mission-time interval. */
  start: number;
  end: number;
  /** Default subject for cameras and telemetry. */
  focus: BodyId;
  /** Parts doing the work in this phase (phase card "Which parts are active?"). */
  activeParts: PartId[];
}

/** Presentation map: piecewise-linear segments from presentation time to mission time. */
export interface PresSegment {
  p0: number;
  p1: number;
  m0: number;
  m1: number;
  /** Shown while inside: e.g. "Coast accelerated ×60", "Slow motion ×0.5", "Quiet interval omitted". */
  note?: string;
  /** A jump over a quiet interval (m0..m1 compressed into a short dissolve): stated on screen. */
  omitted?: boolean;
}

export type ShotKind =
  | 'pad-wide' // fixed ground camera near the pad
  | 'pad-close' // low camera at the launch mount (ignition, hold-down release)
  | 'tower' // camera on the service tower looking up
  | 'ground-track' // long-lens tracking camera several km from the pad
  | 'chase' // chase camera flying with the subject
  | 'side' // broadside, subject crossing the frame, horizon stable
  | 'staging' // held relative framing of a separation event
  | 'onboard-down' // camera mounted on the subject looking aft
  | 'onboard-up' // looking forward along the body
  | 'orbit' // above and behind the subject with Earth's limb in view
  | 'deploy' // close framing of a deploying payload
  | 'entry' // capsule/booster entry framing
  | 'splash' // ocean-level recovery framing
  | 'landing' // landing-zone framing
  | 'approach' // rendezvous: behind the chaser looking at the target
  | 'lunar' // spacecraft with the Moon
  | 'map'; // schematic orbital map

export interface Shot {
  kind: ShotKind;
  /** Mission-time interval during which this shot is the Auto director's choice. */
  from: number;
  to: number;
  subject: BodyId;
  /** Optional secondary subject kept in frame (separation, rendezvous, Moon). */
  also?: BodyId | 'moon' | 'earth';
  /** Shot parameters (distance m, azimuth/elevation deg, lens fov deg...). */
  params?: Record<string, number>;
}

/** A parallel storyline (the recovering booster while the upper stage flies on). */
export interface Branch {
  id: string;
  title: string;
  focus: BodyId;
  /** Mission-time span of the branch story. */
  start: number;
  end: number;
  phases: Phase[];
  shots: Shot[];
}

export interface TelemetrySample {
  t: number;
  altitude: number; // m above the spherical Earth (or the Moon, near it)
  speed: number; // m/s, inertial
  groundSpeed: number; // m/s relative to the rotating Earth surface
  verticalSpeed: number;
  acceleration: number; // m/s^2, non-gravitational (what the vehicle "feels")
  mach: number;
  dynamicPressure: number; // Pa
  mass: number;
  downrange: number; // m along the surface from the pad
  apoapsis: number | null; // altitude, m (null when suborbital hyperbolic undefined)
  periapsis: number | null;
}

export interface MissionTimeline {
  id: MissionId;
  variant: Variant[];
  payload: PayloadId;
  /** Mission time span the lesson covers. */
  start: number;
  end: number;
  bodies: Partial<Record<BodyId, BodyTrack>>;
  channels: Partial<Record<ChannelId, Channel>>;
  events: MissionEvent[];
  phases: Phase[];
  branches: Branch[];
  shots: Shot[];
  /** Presentation map used by Mission explorer playback. */
  pres: PresSegment[];
  /** Moon phase at T-0 (rad) for missions that show the Moon. */
  moonPhase0: number;
  /** Anything the model computed that the tests and ACCURACY.md check against (burn times, orbit...). */
  facts: Record<string, number>;
}
