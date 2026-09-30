/**
 * The director: the ONLY code that moves the camera. It owns
 *   - the hangar orbit (Explore): damped orbit parameters around a target, framing parts;
 *   - the flight camera: Auto (the mission's shot list), Ground, Chase, Onboard, Free;
 *   - transitions: every change of shot or mode is a live cross-blend of the old and the new
 *     framing (both evaluated each frame, weight eased 0→1), so a transition interrupted by
 *     another starts from the displayed pose and the apparent velocity stays continuous;
 *   - location changes (hangar ↔ flight ↔ map): the outgoing picture is captured as displayed
 *     and dissolved over the incoming one; a location that is not ready is not entered.
 */
import * as THREE from 'three';
import type { BodyId, PartId } from '../vehicle/parts';
import type { Shot } from '../timeline/types';
import type { CamMode } from '../state/store';
import type { Location } from '../scene/frame';
import { frame } from '../scene/frame';
import { clamp, copyPose, damp, fitFov, lerpPose, makePose, smootherstep, type CamPose } from './pose';
import { evalFree, evalShot, freeFromPose, type FreeOrbit, type ShotContext } from './shots';

export interface HangarOrbit {
  target: THREE.Vector3;
  az: number; // deg, 0 = looking from +Z toward the vehicle
  el: number; // deg
  dist: number;
  fov: number;
}

const makeOrbit = (): HangarOrbit => ({ target: new THREE.Vector3(0, 34, 0), az: 27, el: 7, dist: 124, fov: 36 });

/** Hangar framing of the whole vehicle. */
export const HANGAR_HOME: HangarOrbit = { target: new THREE.Vector3(0, 34.5, 0), az: 35, el: 6, dist: 132, fov: 36 };

interface Blend {
  /** Pose producer evaluated live. */
  eval: (out: CamPose) => boolean;
  start: number; // stage seconds
  dur: number;
  key: string;
}

export interface Readiness {
  hangar: boolean;
  flight: boolean;
  map: boolean;
}

export const director = {
  /** What the user asked to see; `frame.location` is what is on screen. */
  wantLocation: 'hangar' as Location,
  ready: { hangar: false, flight: false, map: true } as Readiness,
  /** Waiting to enter a location that is not ready (the picture holds; the UI says so). */
  waiting: null as Location | null,

  // hangar orbit
  hangarGoal: { ...makeOrbit(), target: HANGAR_HOME.target.clone(), az: HANGAR_HOME.az, el: HANGAR_HOME.el, dist: HANGAR_HOME.dist, fov: HANGAR_HOME.fov } as HangarOrbit,
  hangarShown: makeOrbit(),
  hangarMinDist: 3,
  /** Time constant of the hangar framing moves (s); larger for long reframes. */
  hangarTau: 0.45,

  // flight
  mode: 'auto' as CamMode,
  focus: 'upper' as BodyId,
  free: { az: 30, el: 10, dist: 90 } as FreeOrbit,
  freeGoal: { az: 30, el: 10, dist: 90 } as FreeOrbit,
  /** Active blends (oldest first); the last one is the current framing. */
  blends: [] as Blend[],
  flightPose: makePose(),
  hangarPose: makePose(),
  mapPose: makePose(),
  /** Body the current framing is about (diagnostics). */
  subject: null as BodyId | null,
  /** Shot the Auto director is on (key), for change detection. */
  autoKey: '',
  reduced: false,
  aspect: 16 / 9,

  // location dissolve
  dissolve: null as null | { from: Location; start: number; dur: number },

  /** Input deltas accumulated since the last frame (pixels and wheel units). */
  input: { dx: 0, dy: 0, zoom: 0, active: false },

  /** Callbacks the UI listens to (camera took over, location waiting). */
  onUserCamera: null as null | (() => void),

  /**
   * Screen area hidden by interface panels, in CSS px, by panel key: sheets that span the width
   * (phone) hide the bottom, side panels (desktop, phone landscape) hide a side. The stage moves
   * the projection centre into the free area (and, for a bottom sheet, widens the view to fit the
   * free height), so the subject is never behind a panel. See viewInsetShown.
   */
  insets: {} as Record<string, Partial<ViewInset>>,
  /** Smoothed inset actually applied this frame. */
  viewInsetShown: { top: 0, bottom: 0, left: 0, right: 0 } as ViewInset,
};

export interface ViewInset {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Register (or clear, with null) the screen area a panel hides. */
export function setViewInset(key: string, inset: Partial<ViewInset> | null) {
  if (inset) director.insets[key] = inset;
  else delete director.insets[key];
}

const insetGoal: ViewInset = { top: 0, bottom: 0, left: 0, right: 0 };
/** The inset to apply now: the largest of the registered ones on each side. */
export function viewInsetGoal(): ViewInset {
  insetGoal.top = insetGoal.bottom = insetGoal.left = insetGoal.right = 0;
  for (const k in director.insets) {
    const i = director.insets[k];
    insetGoal.top = Math.max(insetGoal.top, i.top ?? 0);
    insetGoal.bottom = Math.max(insetGoal.bottom, i.bottom ?? 0);
    insetGoal.left = Math.max(insetGoal.left, i.left ?? 0);
    insetGoal.right = Math.max(insetGoal.right, i.right ?? 0);
  }
  return insetGoal;
}

export function goLocation(loc: Location) {
  director.wantLocation = loc;
}

/** Frame a box in the hangar (a part, or the whole vehicle). */
export function frameHangarBox(box: THREE.Box3, opts: { az?: number; el?: number; tight?: number } = {}) {
  const c = box.getCenter(new THREE.Vector3());
  const r = Math.max(0.3, box.getSize(new THREE.Vector3()).length() / 2);
  const g = director.hangarGoal;
  g.target.copy(c);
  const fov = 34;
  const need = r * (opts.tight ?? 1.25);
  const dist = need / Math.tan(((fov / 2) * Math.PI) / 180) / Math.min(1, director.aspect);
  g.dist = clamp(dist, 2.2, 160);
  g.fov = fov;
  if (opts.az !== undefined) g.az = opts.az;
  if (opts.el !== undefined) g.el = opts.el;
  director.hangarMinDist = Math.max(1.2, r * 0.6);
  director.hangarTau = director.reduced ? 0.12 : clamp(0.35 + Math.log10(1 + Math.abs(dist - director.hangarShown.dist)) * 0.18, 0.35, 0.8);
}

export function hangarHome() {
  const g = director.hangarGoal;
  g.target.copy(HANGAR_HOME.target);
  g.az = HANGAR_HOME.az;
  g.el = HANGAR_HOME.el;
  g.dist = HANGAR_HOME.dist;
  g.fov = HANGAR_HOME.fov;
  director.hangarMinDist = 3;
  director.hangarTau = director.reduced ? 0.12 : 0.7;
}

function orbitPose(o: HangarOrbit, out: CamPose): CamPose {
  const az = (o.az * Math.PI) / 180;
  const el = (o.el * Math.PI) / 180;
  out.pos.set(o.target.x + Math.sin(az) * Math.cos(el) * o.dist, o.target.y + Math.sin(el) * o.dist, o.target.z + Math.cos(az) * Math.cos(el) * o.dist);
  // stay above the hangar floor
  if (out.pos.y < 0.4) out.pos.y = 0.4;
  out.target.copy(o.target);
  out.up.set(0, 1, 0);
  out.fov = o.fov;
  return out;
}

/** Advance the hangar camera one frame. */
export function updateHangar(dt: number, out: CamPose) {
  const g = director.hangarGoal;
  const s = director.hangarShown;
  const inp = director.input;
  if (inp.dx || inp.dy || inp.zoom) {
    g.az -= inp.dx * 0.25;
    g.el = clamp(g.el + inp.dy * 0.2, -12, 85);
    g.dist = clamp(g.dist * Math.exp(inp.zoom * 0.0015), director.hangarMinDist, 190);
    director.hangarTau = 0.12;
  }
  const k = damp(dt, director.hangarTau);
  // shortest way round in azimuth
  let daz = g.az - s.az;
  daz = ((((daz + 180) % 360) + 360) % 360) - 180;
  s.az += daz * k;
  s.el += (g.el - s.el) * k;
  // distance eased in log space (big zoom changes feel even). While the target travels, the
  // camera stays far enough back to keep the destination in view (a move from the whole vehicle
  // to a small part on the engine stand pulls back, travels, then closes in, instead of passing
  // close to empty floor on the way).
  const sep = s.target.distanceTo(g.target);
  const keep = sep > 0.05 ? (sep * 1.15) / Math.tan(((s.fov / 2) * Math.PI) / 180) : 0;
  const goalDist = Math.max(g.dist, Math.min(190, keep));
  s.dist = Math.exp(Math.log(s.dist) + (Math.log(goalDist) - Math.log(s.dist)) * k);
  s.target.lerp(g.target, k);
  s.fov += (g.fov - s.fov) * k;
  orbitPose(s, out);
}

// ───────────────────────────── flight ─────────────────────────────

const ctx: ShotContext = { aspect: 16 / 9, decor: 0 };
const tmp = makePose();
const acc = makePose();

function now(): number {
  return frame.decor;
}

/** Diagnostic counters (camera trace and tests). */
export const flightStats = { pushes: 0, cuts: 0 };

function pushBlend(key: string, evalFn: Blend['eval'], dur: number) {
  const last = director.blends[director.blends.length - 1];
  if (last && last.key === key) return;
  flightStats.pushes++;
  director.blends.push({ key, eval: evalFn, start: now(), dur: director.reduced ? Math.min(dur, 0.25) : dur });
  // bounded: drop blends that are fully covered
  while (director.blends.length > 4) director.blends.shift();
}

/** The shot the Auto director wants at mission time t. */
export function autoShotAt(shots: Shot[], t: number, focus: BodyId): Shot | null {
  let pick: Shot | null = null;
  for (const s of shots) if (t >= s.from && t < s.to && (s.subject === focus || s.also === focus || !pick)) pick = s;
  if (!pick) for (const s of shots) if (t >= s.from && t < s.to) pick = s;
  return pick;
}

export function setMode(mode: CamMode) {
  if (mode === director.mode) return;
  if (mode === 'free') {
    // start the free orbit exactly where the camera is
    freeFromPose(director.focus, director.flightPose.pos, director.free);
    Object.assign(director.freeGoal, director.free);
  }
  director.mode = mode;
  director.autoKey = '';
}

export function setFocus(id: BodyId) {
  if (id === director.focus) return;
  director.focus = id;
  director.autoKey = '';
  if (director.mode === 'free') {
    freeFromPose(id, director.flightPose.pos, director.freeGoal);
  }
}

/** Snap: after a seek, show the new framing at once (no drift from the old picture). */
export function snapFlight() {
  director.blends.length = 0;
  director.autoKey = '';
}

function modeShot(mode: CamMode, focus: BodyId, t: number): Shot {
  const alt = frame.bodies[focus]?.pos.length() - 6_371_000;
  switch (mode) {
    case 'ground':
      return { kind: alt < 1500 ? 'pad-wide' : 'ground-track', from: t, to: t + 1, subject: focus };
    case 'onboard':
      return { kind: 'onboard-down', from: t, to: t + 1, subject: focus };
    case 'chase':
    default:
      return { kind: alt > 90_000 ? 'orbit' : 'chase', from: t, to: t + 1, subject: focus };
  }
}

/** Advance the flight camera one frame (absolute pose in frame I). */
export function updateFlight(dt: number, out: CamPose) {
  ctx.aspect = director.aspect;
  ctx.decor = frame.decor;
  const t = frame.missionTime;
  const tl = frame.tl;
  const inp = director.input;
  if ((inp.dx || inp.dy || inp.zoom) && director.mode !== 'free') {
    setMode('free');
    director.onUserCamera?.();
  }
  if (director.mode === 'free') {
    const g = director.freeGoal;
    g.az += inp.dx * 0.25;
    g.el = clamp(g.el + inp.dy * 0.2, -80, 85);
    g.dist = clamp(g.dist * Math.exp(inp.zoom * 0.0015), 6, 60000);
    const k = damp(dt, 0.12);
    const f = director.free;
    let daz = g.az - f.az;
    daz = ((((daz + 180) % 360) + 360) % 360) - 180;
    f.az += daz * k;
    f.el += (g.el - f.el) * k;
    f.dist = Math.exp(Math.log(f.dist) + (Math.log(g.dist) - Math.log(f.dist)) * k);
    const focus = director.focus;
    pushBlend('free', (o) => evalFree(focus, director.free, ctx, o), 0.001);
  } else if (tl) {
    let shot: Shot | null;
    if (director.mode === 'auto') {
      // following the recovering booster uses its own storyline's shots
      const branch = tl.branches.find((b) => b.focus === director.focus && t >= b.start && t <= b.end);
      shot = autoShotAt(branch ? branch.shots : tl.shots, t, director.focus);
    }
    else shot = modeShot(director.mode, director.focus, t);
    if (director.mode === 'auto' && shot && shot.subject !== director.focus && !frame.bodies[shot.subject]?.present) shot = null;
    if (!shot) shot = modeShot('chase', director.focus, t);
    const key = `${director.mode}:${shot.kind}:${shot.subject}:${shot.from}`;
    if (key !== director.autoKey) {
      director.autoKey = key;
      const s = shot;
      // a fresh blend to the new framing; a cut (instant) when there are no blends yet
      const first = director.blends.length === 0;
      pushBlend(key, (o) => evalShot(s, frame.missionTime, ctx, o), first ? 0 : s.kind === 'staging' ? 1.2 : 1.6);
    }
  }
  // composite: start from the oldest, blend each newer one in by its eased weight
  const bl = director.blends;
  let have = false;
  for (let i = 0; i < bl.length; i++) {
    const b = bl[i];
    if (!b.eval(tmp)) continue;
    const w = b.dur <= 0 ? 1 : smootherstep((now() - b.start) / b.dur);
    if (!have) {
      copyPose(acc, tmp);
      have = true;
    } else lerpPose(acc, tmp, w, acc);
  }
  // drop blends hidden by a completed newer one
  for (let i = bl.length - 1; i > 0; i--) {
    const b = bl[i];
    if (b.dur <= 0 || now() - b.start >= b.dur) {
      bl.splice(0, i);
      break;
    }
  }
  if (have) copyPose(out, acc);
}

export { fitFov };
export type { PartId };
