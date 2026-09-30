/**
 * Camera trace: a diagnostic harness that runs the real director against a real mission
 * timeline without rendering (Node or the browser), frame by frame, and measures what a viewer
 * would see: how often a transition restarts, how fast the view direction turns, whether the
 * horizon flips, whether the camera goes below the ground or loses its subject.
 *
 * Used by the regression tests (director.test.ts) and, in the browser, by ?trace=1 (the live
 * trace in Stage.tsx records the same fields). It never runs in normal use.
 */
import * as THREE from 'three';
import type { BodyId } from '../vehicle/parts';
import type { MissionId, MissionTimeline } from '../timeline/types';
import type { CamMode } from '../state/store';
import { buildMission } from '../timeline/build';
import { bodyAt, missionToPres, presDuration, presToMission } from '../timeline/sample';
import { BODY_IDS, frame } from '../scene/frame';
import { R_EARTH } from '../world/frames';
import { director, setFocus, setMode, snapFlight, updateFlight, flightStats } from './director';
import { makePose } from './pose';
import { bodySize } from './shots';

export interface TraceFrame {
  /** Frame index. */
  i: number;
  /** Presentation and mission time (s). */
  p: number;
  t: number;
  mode: CamMode;
  focus: BodyId;
  /** Identity of the framing the director is heading to. */
  key: string;
  /** Live transitions in the stack. */
  blends: number;
  /** Transitions started so far. */
  pushes: number;
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  up: THREE.Vector3;
  fov: number;
  /** Camera altitude above the spherical Earth (m). */
  alt: number;
  /** Angle between the view direction and the focus body's centre (deg), and the half field of view. */
  offAxis: number;
  halfFov: number;
  /** An explicit discontinuity (seek, cut with dissolve): excluded from continuity metrics. */
  cut: boolean;
}

export interface TraceAction {
  /** Presentation time (s) at which the action runs (before that frame is evaluated). */
  at: number;
  mode?: CamMode;
  focus?: BodyId;
  seek?: number;
  drag?: { dx: number; dy: number; zoom?: number };
  pause?: boolean;
}

export interface TraceOptions {
  mission: MissionId | MissionTimeline;
  mode: CamMode;
  focus?: BodyId;
  /** Presentation time span (s). */
  p0?: number;
  p1?: number;
  /** Mission time to start at (overrides p0). */
  t0?: number;
  /** Frames per second of the simulated display, and playback rate. */
  fps?: number;
  rate?: number;
  actions?: TraceAction[];
  /** Per-frame real delta override (s), for slow-frame tests: (frameIndex) => dt. */
  dtAt?: (i: number) => number;
  aspect?: number;
  /** Follow the phase's focus body as the mission view does (default: true in Auto). */
  followPhaseFocus?: boolean;
}

export interface TraceMetrics {
  frames: number;
  pushes: number;
  maxBlends: number;
  /** Largest per-frame turn of the view direction (deg), excluding cuts. */
  maxTurnDeg: number;
  /** Largest per-frame change of the camera's up vector (deg), excluding cuts. */
  maxRollDeg: number;
  /** Largest per-frame relative change of the vertical field of view, excluding cuts. */
  maxFovStep: number;
  /** Lowest camera altitude (m). */
  minAlt: number;
  /** Frames whose focus body centre is outside the vertical field of view. */
  offscreen: number;
  /** Cuts seen (explicit discontinuities). */
  cuts: number;
}

const tmpPose = makePose();

export function loadTimeline(m: MissionId | MissionTimeline): MissionTimeline {
  return typeof m === 'string' ? buildMission(m) : m;
}

function sampleBodies(tl: MissionTimeline, t: number) {
  for (const id of BODY_IDS) {
    const tr = tl.bodies[id];
    const st = frame.bodies[id];
    if (tr) bodyAt(tr, t, st);
    else st.present = false;
  }
}

/** Reset the director's flight state (a fresh mission view). */
export function resetDirector(mode: CamMode, focus: BodyId) {
  director.mode = 'auto';
  director.focus = focus;
  director.input.dx = director.input.dy = director.input.zoom = 0;
  snapFlight();
  setMode(mode);
  director.focus = focus;
  flightStats.pushes = 0;
  flightStats.cuts = 0;
}

export function traceFlight(o: TraceOptions): { frames: TraceFrame[]; metrics: TraceMetrics } {
  const tl = loadTimeline(o.mission);
  const fps = o.fps ?? 60;
  const rate = o.rate ?? 1;
  const dur = presDuration(tl.pres);
  let p = o.t0 !== undefined ? missionToPres(tl.pres, o.t0) : (o.p0 ?? 0);
  const p1 = Math.min(dur, o.p1 ?? dur);
  const actions = [...(o.actions ?? [])].sort((a, b) => a.at - b.at);
  frame.tl = tl;
  frame.location = 'flight';
  director.aspect = o.aspect ?? 16 / 9;
  director.reduced = false;
  frame.missionTime = presToMission(tl.pres, p);
  sampleBodies(tl, frame.missionTime);
  const focus = o.focus ?? tl.phases.find((ph) => frame.missionTime >= ph.start && frame.missionTime < ph.end)?.focus ?? 'upper';
  resetDirector(o.mode, focus);
  const frames: TraceFrame[] = [];
  let paused = false;
  let i = 0;
  let prev: TraceFrame | null = null;
  const m: TraceMetrics = { frames: 0, pushes: 0, maxBlends: 0, maxTurnDeg: 0, maxRollDeg: 0, maxFovStep: 0, minAlt: Infinity, offscreen: 0, cuts: 0 };
  const c = new THREE.Vector3();
  let guard = 0;
  while (p <= p1 + 1e-9 && guard++ < 2_000_000) {
    const dt = o.dtAt ? o.dtAt(i) : 1 / fps;
    let cut = false;
    while (actions.length && actions[0].at <= p + 1e-9) {
      const a = actions.shift()!;
      if (a.mode) setMode(a.mode);
      if (a.focus) setFocus(a.focus);
      if (a.pause !== undefined) paused = a.pause;
      if (a.drag) {
        director.input.dx += a.drag.dx;
        director.input.dy += a.drag.dy;
        director.input.zoom += a.drag.zoom ?? 0;
      }
      if (a.seek !== undefined) {
        p = a.seek;
        snapFlight();
        cut = true;
      }
    }
    const step = Math.min(dt, frame.maxStep);
    frame.dt = step;
    frame.clock += step;
    frame.decor = frame.clock;
    frame.missionTime = presToMission(tl.pres, p);
    frame.presTime = p;
    sampleBodies(tl, frame.missionTime);
    if (o.followPhaseFocus ?? o.focus === undefined) {
      const ph = tl.phases.find((x) => frame.missionTime >= x.start && frame.missionTime < x.end);
      if (ph && frame.bodies[ph.focus]?.present) setFocus(ph.focus);
    }
    const cutsBefore = flightStats.cuts;
    updateFlight(step, tmpPose);
    director.input.dx = director.input.dy = director.input.zoom = 0;
    if (flightStats.cuts !== cutsBefore) cut = true;
    const dir = new THREE.Vector3().subVectors(tmpPose.target, tmpPose.pos).normalize();
    const subject = (director.subject ?? director.autoKey.split(':')[2] ?? director.focus) as BodyId;
    const fb = frame.bodies[subject];
    let offAxis = 0;
    if (fb?.present) {
      c.set(0, bodySize(subject).centreY, 0).applyQuaternion(fb.quat).add(fb.pos);
      offAxis = (c.sub(tmpPose.pos).angleTo(dir) * 180) / Math.PI;
    }
    const f: TraceFrame = {
      i,
      p,
      t: frame.missionTime,
      mode: director.mode,
      focus: subject,
      key: director.autoKey,
      blends: director.blends.length,
      pushes: flightStats.pushes,
      pos: tmpPose.pos.clone(),
      dir,
      up: tmpPose.up.clone(),
      fov: tmpPose.fov,
      alt: tmpPose.pos.length() - R_EARTH,
      offAxis,
      halfFov: tmpPose.fov / 2,
      cut,
    };
    frames.push(f);
    m.maxBlends = Math.max(m.maxBlends, f.blends);
    m.minAlt = Math.min(m.minAlt, f.alt);
    if (fb?.present && offAxis > f.halfFov) m.offscreen++;
    if (cut) m.cuts++;
    if (prev && !cut) {
      m.maxTurnDeg = Math.max(m.maxTurnDeg, (prev.dir.angleTo(f.dir) * 180) / Math.PI);
      m.maxRollDeg = Math.max(m.maxRollDeg, (prev.up.angleTo(f.up) * 180) / Math.PI);
      m.maxFovStep = Math.max(m.maxFovStep, Math.abs(f.fov - prev.fov) / prev.fov);
    }
    prev = f;
    if (!paused) p += step * rate;
    i++;
  }
  m.frames = frames.length;
  m.pushes = flightStats.pushes;
  return { frames, metrics: m };
}
