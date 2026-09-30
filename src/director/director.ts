/**
 * The director: the ONLY code that moves the camera. It owns
 *   - the hangar orbit (Explore): damped orbit parameters around a target, framing parts;
 *   - the flight camera: Auto (the mission's shot list), Ground, Chase, Onboard, Free;
 *   - transitions between flight framings, and requests for picture dissolves (scene/dissolve.ts)
 *     when a change of location or an intentional cut needs one.
 *
 * Flight framings have a stable identity (mode, framing regime, subject, and for Auto the shot in
 * the list). The destination of a framing is re-evaluated every frame (it follows its subject),
 * but a transition starts only when the identity changes, never because time moved on.
 *
 * A transition is a live cross-blend: the framings on the stack all keep being evaluated, and each
 * newer one eases in over the composite of the older ones. So every transition starts from the
 * displayed pose (including one interrupted halfway), apparent motion stays continuous, and the
 * stack is bounded (a burst of changes is folded into a hold of the displayed pose). The blend is
 * done in the look-at point's local frame (pose.ts), so the camera travels around a subject, not
 * through it, and never along a chord through the planet.
 *
 * Changes no camera move could plausibly connect (between two ground cameras, between a ground
 * camera and one flying with the vehicle, into or out of the onboard camera, to a subject
 * kilometres away) are made as a short dissolve instead of a fly-through.
 *
 * Clocks: transitions run on the UI clock (frame.clock), which advances by the same clamped frame
 * step as mission playback, so camera moves, bodies, effects and captions always agree (see
 * scene/clock.ts).
 */
import * as THREE from 'three';
import type { BodyId, PartId } from '../vehicle/parts';
import type { MissionEvent, Shot } from '../timeline/types';
import type { CamMode } from '../state/store';
import type { Location } from '../scene/frame';
import { frame } from '../scene/frame';
import { R_EARTH, sitePosition } from '../world/frames';
import { LANDING_ZONE } from '../world/site';
import { blendPose, clamp, copyPose, damp, fitFov, keepInView, makePose, smootherstep, type CamPose } from './pose';
import {
  assemblyRoot,
  enforceClearance,
  evalFree,
  evalShot,
  freeDistance,
  freeFromPose,
  groundPoint,
  isGroundKind,
  isPresent,
  subjectCentre,
  type FreeOrbit,
  type ShotContext,
} from './shots';
import { cancelPending, requestDissolve } from '../scene/dissolve';

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

/** A flight framing: a stable identity and a live pose producer. */
export interface Framing {
  id: string;
  /** Body the framing is about (null: a fixed hold). */
  subject: BodyId | null;
  /** 'ground' framings are fixed to the Earth, 'air' ones fly with a subject, 'onboard' is mounted on it. */
  place: 'ground' | 'air' | 'onboard' | 'hold';
  /** Preferred blend duration into this framing (s). */
  dur: number;
  eval: (out: CamPose) => boolean;
  /** Free framings: stop following the live orbit (called when superseded). */
  freeze?: () => void;
}

interface Blend {
  f: Framing;
  start: number; // UI clock seconds
  dur: number;
  /** Last successful evaluation (held while the subject is momentarily unavailable). */
  last: CamPose;
  has: boolean;
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
  /** The live free orbit (shown) and where input is taking it (goal). */
  free: { az: 30, el: 10, dist: 90 } as FreeOrbit,
  freeGoal: { az: 30, el: 10, dist: 90 } as FreeOrbit,
  /** Active blends (oldest first); the last one is the current framing. */
  blends: [] as Blend[],
  flightPose: makePose(),
  hangarPose: makePose(),
  mapPose: makePose(),
  /** Identity of the framing the flight camera is on or heading to. */
  autoKey: '',
  /** Body the current framing is about (diagnostics, labels). */
  subject: null as BodyId | null,
  /** A cut waiting for the displayed picture to be captured (see scene/dissolve.ts). */
  pendingCut: null as Framing | null,
  /** Framing regime per mode, with hysteresis (e.g. pad camera vs tracking camera). */
  regime: {} as Record<string, string>,
  /** The flight pose has been evaluated at least once since the last reset (safe to show). */
  flightValid: false,
  reduced: false,
  aspect: 16 / 9,

  /** Input deltas accumulated since the last frame (pixels and wheel units). */
  input: { dx: 0, dy: 0, zoom: 0, active: false },

  /** Callbacks the UI listens to (camera took over). */
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

/** Diagnostic counters (camera trace and tests). */
export const flightStats = { pushes: 0, cuts: 0, collapses: 0, fallbacks: 0 };

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

// ───────────────────────────── hangar ─────────────────────────────

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

/** The vehicle on its integration stand: the orbiting camera never passes through it (hangar metres). */
const HANGAR_COLUMN = { r: 3.2, y1: 72 };
function orbitPose(o: HangarOrbit, out: CamPose): CamPose {
  const az = (o.az * Math.PI) / 180;
  const el = (o.el * Math.PI) / 180;
  out.pos.set(o.target.x + Math.sin(az) * Math.cos(el) * o.dist, o.target.y + Math.sin(el) * o.dist, o.target.z + Math.cos(az) * Math.cos(el) * o.dist);
  // stay above the hangar floor
  if (out.pos.y < 0.4) out.pos.y = 0.4;
  // travelling between subjects away from the vehicle (the engine stands), keep outside the
  // vehicle column instead of passing through it; framing the vehicle itself up close is allowed
  const targetR = Math.hypot(o.target.x, o.target.z);
  const camR = Math.hypot(out.pos.x, out.pos.z);
  if (targetR > HANGAR_COLUMN.r + 1 && camR < HANGAR_COLUMN.r && out.pos.y < HANGAR_COLUMN.y1) {
    if (camR > 1e-4) {
      out.pos.x *= HANGAR_COLUMN.r / camR;
      out.pos.z *= HANGAR_COLUMN.r / camR;
    } else out.pos.x = HANGAR_COLUMN.r;
  }
  out.target.copy(o.target);
  out.up.set(0, 1, 0);
  out.upHint.set(0, 0, 0);
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
const probe = makePose();
const vA = new THREE.Vector3();
const vB = new THREE.Vector3();
const pivot = new THREE.Vector3();

/** UI clock (s): camera transitions and dissolves. */
function now(): number {
  return frame.clock;
}

function weightOf(b: Blend): number {
  return b.dur <= 0 ? 1 : smootherstep((now() - b.start) / b.dur);
}

/** Largest number of framings the stack holds; more changes fold into a hold of the displayed pose. */
const MAX_BLENDS = 3;

/**
 * Fold the stack into one framing that holds the displayed pose: fixed to the Earth when the
 * displayed framing is a ground camera, otherwise moving with the subject, so the hold does not
 * lag behind a vehicle doing kilometres per second.
 */
function collapse(subject: BodyId | null) {
  flightStats.collapses++;
  const hold = copyPose(makePose(), director.flightPose);
  const top = director.blends[director.blends.length - 1]?.f;
  const t0 = frame.missionTime;
  const followSubject = !!subject && top?.place !== 'ground' && isPresent(subject);
  const ref0 = new THREE.Vector3();
  if (followSubject) subjectCentre(subject!, frame.bodies[subject!], t0, ref0);
  else sitePosition(t0, 0, ref0);
  const dPos = hold.pos.clone().sub(ref0);
  const dTgt = hold.target.clone().sub(ref0);
  const ref = new THREE.Vector3();
  const f: Framing = {
    id: 'hold',
    subject: followSubject ? subject : null,
    place: 'hold',
    dur: 0,
    eval: (out) => {
      if (followSubject) {
        if (!isPresent(subject)) return false;
        subjectCentre(subject!, frame.bodies[subject!], frame.missionTime, ref);
      } else sitePosition(frame.missionTime, 0, ref);
      out.pos.copy(ref).add(dPos);
      out.target.copy(ref).add(dTgt);
      out.up.copy(hold.up);
      out.upHint.copy(hold.upHint);
      out.fov = hold.fov;
      return true;
    },
  };
  for (const x of director.blends) x.f.freeze?.();
  director.blends = [{ f, start: -1e9, dur: 0, last: copyPose(makePose(), hold), has: true }];
}

/** Start a blend into framing f from what is displayed. */
function pushBlend(f: Framing, dur: number) {
  const top = director.blends[director.blends.length - 1];
  if (top && top.f.id === f.id) return;
  flightStats.pushes++;
  top?.f.freeze?.();
  if (director.blends.length >= MAX_BLENDS) collapse(f.subject);
  director.blends.push({ f, start: now(), dur: director.reduced ? Math.min(dur, 0.25) : dur, last: makePose(), has: false });
}

/** Replace the stack with framing f at once (after a seek, or a cut whose picture was captured). */
function cutTo(f: Framing) {
  flightStats.cuts++;
  for (const x of director.blends) if (x.f !== f) x.f.freeze?.();
  director.blends = [{ f, start: now(), dur: 0, last: makePose(), has: false }];
  director.autoKey = f.id;
}

/** The shot the Auto director wants at mission time t (the shot object, stable for a timeline). */
export function autoShotAt(shots: Shot[], t: number, focus: BodyId): Shot | null {
  let pick: Shot | null = null;
  for (const s of shots) if (t >= s.from && t < s.to && (s.subject === focus || s.also === focus || !pick)) pick = s;
  if (!pick) for (const s of shots) if (t >= s.from && t < s.to) pick = s;
  return pick;
}

/**
 * A visible subject standing in for `id` when it is not present: the body it rides on or was
 * released from, the phase's subject, then the main vehicle. Null when nothing is in the world.
 */
export function fallbackSubject(id: BodyId, t: number): BodyId | null {
  if (isPresent(id)) return id;
  const tl = frame.tl;
  const parent = tl?.bodies[id]?.attached?.to;
  if (parent && isPresent(parent)) return parent;
  const ph = tl?.phases.find((p) => t >= p.start && t < p.end);
  if (ph && isPresent(ph.focus)) return ph.focus;
  for (const b of ['upper', 'booster', 'capsule', 'satellite'] as BodyId[]) if (isPresent(b)) return b;
  return null;
}

/** A separation or deployment is happening now: hold the current angle so it can be read. */
function eventGuard(t: number): boolean {
  const tl = frame.tl;
  if (!tl) return false;
  return tl.events.some((e: MissionEvent) => (e.kind === 'separation' || e.kind === 'deploy') && t > e.t - 4 && t < e.t + 6);
}

function altitudeOf(id: BodyId): number {
  return frame.bodies[id].pos.length() - R_EARTH;
}

const vPad = new THREE.Vector3();
const vLz = new THREE.Vector3();
/** Ground camera regime for a subject, with hysteresis. */
function groundRegime(subject: BodyId, t: number, prev: string | undefined): string {
  const s = frame.bodies[subject];
  const alt = altitudeOf(subject);
  sitePosition(t, 0, vPad);
  groundPoint(LANDING_ZONE.x, -LANDING_ZONE.z, 0, t, vLz);
  const dPad = s.pos.distanceTo(vPad);
  const dLz = s.pos.distanceTo(vLz);
  const descending = s.vel.dot(vA.copy(s.pos).normalize()) < 0;
  if (subject === 'booster' && t > 60 && dLz < 12_000 && alt < 7_000 && (descending || prev === 'landing')) return 'landing';
  if ((subject === 'capsule' || subject === 'service') && alt < 12_000 && dPad > 60_000) return 'splash';
  const padAlt = prev === 'pad-wide' ? 1_600 : 1_400;
  if (alt < padAlt && dPad < 4_000) return 'pad-wide';
  return 'ground-track';
}

function modeFraming(mode: CamMode, subject: BodyId, t: number): Framing {
  const key = `${mode}:${subject}`;
  const prev = director.regime[key];
  const guard = eventGuard(t);
  let regime: string;
  if (mode === 'ground') regime = guard && prev ? prev : groundRegime(subject, t, prev);
  else if (mode === 'onboard') regime = subject === 'station' ? 'chase' : 'onboard-down';
  else regime = 'chase';
  director.regime[key] = regime;
  const shot: Shot = { kind: regime as Shot['kind'], from: -Infinity, to: Infinity, subject };
  if (mode === 'chase') {
    // one held framing whose range, height and Earth-in-frame share follow the altitude
    // continuously (behind and above in the air, higher with the Earth's curve below in space):
    // nothing to switch, so nothing swings
    return {
      id: `chase:chase:${subject}`,
      subject,
      place: 'air',
      dur: 1.4,
      eval: (o) => {
        const u = smootherstep((altitudeOf(subject) - 40_000) / 80_000);
        shot.params = { d: 70 + 20 * u, az: 20, el: 10 + 12 * u, dip: 0.3 * u };
        return evalShot(shot, frame.missionTime, ctx, o);
      },
    };
  }
  const place: Framing['place'] = regime.startsWith('onboard') ? 'onboard' : isGroundKind(shot.kind) ? 'ground' : 'air';
  return { id: `${mode}:${regime}:${subject}`, subject, place, dur: 1.4, eval: (o) => evalShot(shot, frame.missionTime, ctx, o) };
}

/** A framing that shows the pad from the wide camera (nothing in the world to follow). */
function padFraming(): Framing {
  return {
    id: 'pad',
    subject: null,
    place: 'ground',
    dur: 1.2,
    eval: (o) => {
      groundPoint(-260, -330, 18, frame.missionTime, o.pos);
      sitePosition(frame.missionTime, 40, o.target);
      o.up.copy(o.target).normalize();
      o.upHint.set(0, 0, 0);
      o.fov = 30;
      return true;
    },
  };
}

const freeFramings = new Map<string, Framing>();
/** The free orbit around a subject; the current one reads the live orbit, superseded ones are frozen. */
function freeFraming(subject: BodyId): Framing {
  const id = `free:${subject}`;
  let f = freeFramings.get(id);
  if (!f) {
    let orbit: FreeOrbit = director.free;
    let frozen = false;
    const fr: Framing = {
      id,
      subject,
      place: 'air',
      dur: 1.0,
      eval: (o) => evalFree(subject, frozen ? orbit : director.free, ctx, o),
      freeze: () => {
        if (frozen) return;
        orbit = { ...director.free };
        frozen = true;
        if (freeFramings.get(id) === fr) freeFramings.delete(id);
      },
    };
    f = fr;
    freeFramings.set(id, f);
  }
  return f;
}

let auto = { list: null as Shot[] | null, shot: null as Shot | null, framing: null as Framing | null };
function autoFraming(t: number): Framing | null {
  const tl = frame.tl;
  if (!tl) return null;
  const branch = tl.branches.find((b) => b.focus === director.focus && t >= b.start && t <= b.end);
  const list = branch ? branch.shots : tl.shots;
  const shot = autoShotAt(list, t, director.focus);
  if (shot && isPresent(shot.subject)) {
    if (auto.shot === shot && auto.list === list && auto.framing) return auto.framing;
    const idx = list.indexOf(shot);
    const s = shot;
    const place: Framing['place'] = s.kind.startsWith('onboard') ? 'onboard' : isGroundKind(s.kind) ? 'ground' : 'air';
    const f: Framing = {
      id: `auto:${branch ? branch.id : 'main'}:${idx}:${s.kind}:${s.subject}`,
      subject: s.subject,
      place,
      dur: s.kind === 'staging' ? 1.2 : 1.6,
      eval: (o) => evalShot(s, frame.missionTime, ctx, o),
    };
    auto = { list, shot, framing: f };
    return f;
  }
  // the shot's subject is not in the world: follow a visible stand-in (the id says so)
  const sub = fallbackSubject(shot?.subject ?? director.focus, t);
  if (!sub) return padFraming();
  flightStats.fallbacks++;
  const fr = modeFraming('chase', sub, t);
  return { ...fr, id: `auto-fallback:${fr.id}` };
}

/** The framing the current mode and focus ask for now. */
function desiredFraming(t: number): Framing | null {
  if (!frame.tl) return null;
  if (director.mode === 'auto') return autoFraming(t);
  const sub = fallbackSubject(director.focus, t);
  if (!sub) return padFraming();
  if (sub !== director.focus) flightStats.fallbacks++;
  if (director.mode === 'free') return freeFraming(sub);
  return modeFraming(director.mode, sub, t);
}

/**
 * Whether moving from what is displayed to framing `to` should be a dissolve rather than a camera
 * move: between ground cameras at different sites, between the ground and the air, into or out
 * of the onboard camera, or when the camera would have to travel much farther than it stands
 * from its subject (a subject kilometres away).
 */
function wantsCut(to: Framing): boolean {
  const top = director.blends[director.blends.length - 1];
  if (!top || !director.flightValid) return false;
  if (!to.eval(probe)) return false;
  const from = top.f;
  const travel = director.flightPose.pos.distanceTo(probe.pos);
  const range = Math.max(1, probe.pos.distanceTo(probe.target));
  if (from.place === 'onboard' || to.place === 'onboard') return true;
  if (from.place === 'ground' && to.place === 'ground') return travel > 30;
  if ((from.place === 'ground') !== (to.place === 'ground')) return travel > 250;
  // flying framings: a camera move (around the subject, dollying in or out) unless the new
  // subject is far from the old one
  if (from.subject && to.subject && from.subject !== to.subject && isPresent(from.subject) && isPresent(to.subject)) {
    subjectCentre(from.subject, frame.bodies[from.subject], frame.missionTime, vA);
    subjectCentre(to.subject, frame.bodies[to.subject], frame.missionTime, vB);
    if (vA.distanceTo(vB) > 2_500) return true;
  }
  return travel > Math.max(20_000, 60 * range);
}

/** Duration of the dissolve for a cut into framing f (s). */
function cutDuration(to: Framing): number {
  if (director.reduced) return 0.25;
  const top = director.blends[director.blends.length - 1]?.f;
  return top?.place === 'ground' && to.place === 'ground' ? 0.4 : 0.6;
}

function transitionTo(f: Framing) {
  director.autoKey = f.id;
  director.subject = f.subject;
  if (director.pendingCut) {
    // a cut is waiting for its capture: retarget it
    director.pendingCut = f;
    return;
  }
  if (!director.blends.length || !director.flightValid) {
    cutTo(f);
    return;
  }
  if (director.reduced || wantsCut(f)) {
    director.pendingCut = f;
    requestDissolve('cut', cutDuration(f), () => {
      const p = director.pendingCut;
      director.pendingCut = null;
      if (p) cutTo(p);
    });
    return;
  }
  pushBlend(f, f.dur);
}

export function setMode(mode: CamMode) {
  if (mode === director.mode) return;
  if (mode === 'free') {
    // start the free orbit exactly where the camera is, around the displayed subject
    const sub = fallbackSubject(director.subject ?? director.focus, frame.missionTime) ?? director.focus;
    if (director.flightValid && isPresent(sub)) freeFromPose(sub, director.flightPose.pos, director.free);
    Object.assign(director.freeGoal, director.free);
    freeFramings.clear();
  }
  director.mode = mode;
}

/**
 * Change the body the camera follows. In Free, the orbit is re-expressed around the new subject
 * so the camera stays where it is and turns to the new subject; a subject far away is reached by
 * a dissolve (decided in updateFlight) to a comfortable orbit around it, at the same angle.
 */
export function setFocus(id: BodyId) {
  if (id === director.focus) return;
  director.focus = id;
  if (director.mode !== 'free' || !isPresent(id)) return;
  director.blends[director.blends.length - 1]?.f.freeze?.();
  const o: FreeOrbit = { ...director.free };
  if (director.flightValid) freeFromPose(id, director.flightPose.pos, o);
  const comfortable = freeDistance(id);
  if (!director.flightValid || o.dist > Math.max(3_000, comfortable * 25)) {
    o.az = director.free.az;
    o.el = director.free.el;
    o.dist = comfortable;
  }
  Object.assign(director.free, o);
  Object.assign(director.freeGoal, o);
}

/** Camera reset: in Free, back to a comfortable orbit behind and above the subject. */
export function resetFlightCamera() {
  const sub = director.subject ?? director.focus;
  director.freeGoal.az = 30;
  director.freeGoal.el = 12;
  director.freeGoal.dist = freeDistance(sub);
}

/** Snap: after a seek, show the new framing at once (no drift from the old picture). */
export function snapFlight() {
  for (const b of director.blends) b.f.freeze?.();
  director.blends.length = 0;
  director.autoKey = '';
  director.pendingCut = null;
  director.regime = {};
  director.flightValid = false;
  auto = { list: null, shot: null, framing: null };
  freeFramings.clear();
  cancelPending('cut');
}

/** Advance the flight camera one frame (absolute pose in frame I). */
export function updateFlight(dt: number, out: CamPose) {
  ctx.aspect = director.aspect;
  ctx.decor = frame.clock;
  const t = frame.missionTime;
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
  }
  const want = desiredFraming(t);
  if (want && want.id !== director.autoKey) transitionTo(want);
  // composite: start from the oldest, blend each newer one in by its eased weight
  const bl = director.blends;
  let have = false;
  let skipHull: BodyId | null = null;
  for (let i = 0; i < bl.length; i++) {
    const b = bl[i];
    if (b.f.eval(tmp)) {
      copyPose(b.last, tmp);
      b.has = true;
    } else if (b.has) copyPose(tmp, b.last);
    else continue;
    if (b.f.place === 'onboard' && b.f.subject) skipHull = b.f.subject;
    if (!have) {
      copyPose(acc, tmp);
      have = true;
    } else {
      // blend around the subject this framing is about, so the camera keeps its range to it
      const sub = b.f.subject;
      const w = weightOf(b);
      let half = 0;
      const pv = sub && b.f.place === 'air' && isPresent(sub) ? ((half = subjectCentre(sub, frame.bodies[sub], t, pivot)), pivot) : null;
      blendPose(acc, tmp, w, acc, tmp.up, pv);
      // while the aim is still turning, widen the lens just enough to keep the new subject in
      // view (continuous: at the end of the blend the framing's own lens already shows it)
      // (eased in over the first third of the blend and out over the last, so the lens never
      // jumps when the guard starts or when the framing's own lens takes over)
      if (pv && w < 1) keepInView(acc, pv, half, director.aspect, 75, smootherstep(w / 0.35) * (1 - smootherstep((w - 0.65) / 0.35)));
    }
  }
  // drop blends hidden by a completed newer one
  for (let i = bl.length - 1; i > 0; i--) {
    if (bl[i].has && weightOf(bl[i]) >= 1) {
      for (let k = 0; k < i; k++) bl[k].f.freeze?.();
      bl.splice(0, i);
      break;
    }
  }
  if (have) {
    enforceClearance(acc, t, skipHull);
    // the displayed pose is always kept here (transitions and hand-overs start from it)
    copyPose(director.flightPose, acc);
    if (out !== director.flightPose) copyPose(out, acc);
    director.flightValid = true;
  }
}

/**
 * A chapter jump: the new moment is shown by a short dissolve from the displayed picture (the
 * camera does not fly from the old moment to the new one).
 */
export function jumpWithDissolve(seek: () => void) {
  if (frame.location !== 'flight' || !director.flightValid) {
    seek();
    return;
  }
  requestDissolve('jump', director.reduced ? 0.25 : 0.45, seek);
}

/** The assembly a body belongs to now (for labels). */
export function followedAssembly(id: BodyId): BodyId {
  return assemblyRoot(id, frame.missionTime);
}

export { fitFov };
export type { PartId };
