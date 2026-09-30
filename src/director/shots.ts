/**
 * Flight camera shots: each is a pure function of mission time and the sampled body states
 * (frame.bodies), so the Auto director is deterministic and seeking lands on the same framing.
 * Shots follow their subject; they never alter a trajectory. Ground cameras are fixed to the
 * rotating Earth at named sites.
 *
 * Rules every shot follows (see director.ts for how they are combined):
 *   - a body that is not present (not yet in the world, or gone) is never framed: evaluation
 *     returns false and the director chooses a visible fallback;
 *   - the framing size is the whole assembly the subject belongs to at that moment (the stack
 *     before separation, the stage alone after), not a fixed size per body;
 *   - the travel frame is the mission plane (prograde, radial, cross-track), which does not
 *     flip when a booster reverses its horizontal velocity, hovers or lands;
 *   - every input varies continuously with mission time, so a held shot never jumps.
 */
import * as THREE from 'three';
import type { BodyId } from '../vehicle/parts';
import type { MissionTimeline, Shot, ShotKind } from '../timeline/types';
import { frame } from '../scene/frame';
import { R_EARTH, SUN_DIRECTION, sitePosition, siteFrameQuaternion, moonPosition } from '../world/frames';
import { GROUND_CAMS, LANDING_ZONE, PAD } from '../world/site';
import { clamp, fitFov, type CamPose } from './pose';
import { bodyAt, channelAt, type BodyState } from '../timeline/sample';
import { MOUNT_Y } from '../scene/spacecraft/types';

/** Approximate half-length (m) of each body for framing, and its visual centre on the model axis. */
export const BODY_SIZE: Record<BodyId, { half: number; centreY: number }> = {
  booster: { half: 23, centreY: 22 },
  upper: { half: 8, centreY: 49 },
  fairingA: { half: 7, centreY: 60 },
  fairingB: { half: 7, centreY: 60 },
  satellite: { half: 4, centreY: 57 },
  capsule: { half: 2.5, centreY: 59.4 },
  service: { half: 2.5, centreY: 56 },
  les: { half: 4.5, centreY: 65 },
  station: { half: 40, centreY: 0 },
  ground: { half: 50, centreY: 0 },
};

/** The suborbital research capsule rides on the booster (model frame), lower than the crew capsule. */
const RESEARCH_CAPSULE = { half: 2, centreY: MOUNT_Y.boosterCapsuleAdapter + 1.1 };

/** Framing size of a body on its own in the mission on screen. */
export function bodySize(id: BodyId): { half: number; centreY: number } {
  if (id === 'capsule' && frame.tl?.id === 'suborbital') return RESEARCH_CAPSULE;
  return BODY_SIZE[id];
}

/** Bodies that share the vehicle model frame while attached (the station has its own frame). */
const STACK: BodyId[] = ['booster', 'upper', 'fairingA', 'fairingB', 'satellite', 'capsule', 'service', 'les'];

/** The body at the root of the assembly `id` rides on at mission time t (itself when free). */
export function assemblyRoot(id: BodyId, t: number, tl: MissionTimeline | null = frame.tl): BodyId {
  let cur = id;
  for (let k = 0; k < 8 && tl; k++) {
    const a = tl.bodies[cur]?.attached;
    if (!a || t >= a.until || a.to === 'station' || !STACK.includes(a.to)) break;
    cur = a.to;
  }
  return cur;
}

const extent = { half: 0, centreY: 0 };
/**
 * Framing size of the assembly a body belongs to at mission time t: every present body attached
 * (directly or through others) to the same root. Before stage separation the booster's framing is
 * the whole vehicle; after it, the booster alone.
 */
export function subjectExtent(id: BodyId, t: number, tl: MissionTimeline | null = frame.tl): { half: number; centreY: number } {
  if (!tl || !STACK.includes(id)) {
    const s = bodySize(id);
    extent.half = s.half;
    extent.centreY = s.centreY;
    return extent;
  }
  const root = assemblyRoot(id, t, tl);
  let lo = Infinity;
  let hi = -Infinity;
  for (const b of STACK) {
    const tr = tl.bodies[b];
    if (!tr || t < tr.exists[0] || t > tr.exists[1]) continue;
    if (b !== id && assemblyRoot(b, t, tl) !== root) continue;
    const s = bodySize(b);
    lo = Math.min(lo, s.centreY - s.half);
    hi = Math.max(hi, s.centreY + s.half + (b === 'capsule' ? chuteReach(tl, t) : 0));
  }
  if (!(hi > lo)) {
    const s = bodySize(id);
    extent.half = s.half;
    extent.centreY = s.centreY;
    return extent;
  }
  extent.half = (hi - lo) / 2;
  extent.centreY = (hi + lo) / 2;
  return extent;
}

/**
 * How far deployed parachutes reach above the capsule (m): drogues ~35 m (riser, lines, canopy),
 * mains ~66 m once open; so a framing of the capsule under chutes shows the canopies too.
 */
function chuteReachAt(tl: MissionTimeline, t: number): number {
  const d = channelAt(tl.channels['cap.drogue'], t, 0);
  const m = channelAt(tl.channels['cap.main'], t, 0);
  return Math.max(35 * Math.min(1, d * 1.5), 66 * Math.min(1, m * 1.6));
}
/** Averaged over the last 4 s of mission time (still a pure function of t), so the framing opens up gently. */
function chuteReach(tl: MissionTimeline, t: number): number {
  if (!tl.channels['cap.drogue'] && !tl.channels['cap.main']) return 0;
  let sum = 0;
  for (let k = 0; k < 9; k++) sum += chuteReachAt(tl, t - k * 0.5);
  return sum / 9;
}

const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const v3 = new THREE.Vector3();
const vSun = new THREE.Vector3();
const vRef = new THREE.Vector3();
const q1 = new THREE.Quaternion();

export interface Basis {
  up: THREE.Vector3; // local vertical (radial)
  fwd: THREE.Vector3; // horizontal prograde direction of the mission plane (downrange)
  side: THREE.Vector3; // fwd × up (to the right of the direction of travel)
  axis: THREE.Vector3; // body +Y (nose direction)
}

/** Launch-plane normal at T-0 for a due-east launch (frame I axes are east, up, south at the pad). */
const DEFAULT_PLANE = new THREE.Vector3(0, 0, -1);
const planeCache = new WeakMap<MissionTimeline, THREE.Vector3>();

/**
 * The mission plane's normal (unit angular momentum of the main vehicle's flight). Every K-1
 * mission flies in one plane (a due-east launch; the Moon and the station share it), so one normal
 * per mission gives a travel frame that never flips.
 */
export function missionPlaneNormal(tl: MissionTimeline | null): THREE.Vector3 {
  if (!tl) return DEFAULT_PLANE;
  let n = planeCache.get(tl);
  if (n) return n;
  n = DEFAULT_PLANE.clone();
  const tr = tl.bodies.upper ?? tl.bodies.booster;
  if (tr && tr.t.length > 2) {
    // the sample of largest horizontal speed (orbit, or the booster at its fastest) is the most reliable
    let best = -1;
    let bi = 0;
    for (let i = 0; i < tr.t.length; i += Math.max(1, Math.floor(tr.t.length / 400))) {
      v1.set(tr.pos[3 * i], tr.pos[3 * i + 1], tr.pos[3 * i + 2]);
      v2.set(tr.vel[3 * i], tr.vel[3 * i + 1], tr.vel[3 * i + 2]);
      const h = v3.crossVectors(v1, v2).length() / Math.max(1, v1.length());
      if (h > best) {
        best = h;
        bi = i;
      }
    }
    v1.set(tr.pos[3 * bi], tr.pos[3 * bi + 1], tr.pos[3 * bi + 2]);
    v2.set(tr.vel[3 * bi], tr.vel[3 * bi + 1], tr.vel[3 * bi + 2]);
    v3.crossVectors(v1, v2);
    if (v3.lengthSq() > 1) n.copy(v3).normalize();
  }
  planeCache.set(tl, n);
  return n;
}

export function basisOf(s: BodyState, out: Basis): Basis {
  out.up.copy(s.pos).normalize();
  // prograde horizontal in the mission plane: stable through vertical ascent, boostback (where the
  // horizontal velocity passes through zero), hovering and landing
  out.fwd.crossVectors(missionPlaneNormal(frame.tl), out.up);
  if (out.fwd.lengthSq() < 1e-6) {
    out.fwd.copy(s.vel).addScaledVector(out.up, -s.vel.dot(out.up));
    if (out.fwd.lengthSq() < 1) out.fwd.set(1, 0, 0).addScaledVector(out.up, -out.up.x);
  }
  out.fwd.normalize();
  out.side.crossVectors(out.fwd, out.up).normalize();
  out.axis.set(0, 1, 0).applyQuaternion(s.quat);
  return out;
}

const AB = { up: new THREE.Vector3(), fwd: new THREE.Vector3(), side: new THREE.Vector3(), axis: new THREE.Vector3() };
/**
 * A frame along a rendezvous line. For the station the line is its docking axis (the port faces
 * nadir, so the capsule comes up along the local vertical): fixed to the station, it does not
 * swing as the capsule closes in. For other targets it is the line from the chaser to the target.
 * `up` is the direction of travel (prograde), so el tilts the camera ahead of or behind the line.
 */
function approachBasis(target: BodyId, ts: BodyState, targetCentre: THREE.Vector3, chaser: THREE.Vector3): Basis {
  if (target === 'station') AB.fwd.set(0, 1, 0).applyQuaternion(ts.quat);
  else AB.fwd.subVectors(targetCentre, chaser);
  if (AB.fwd.lengthSq() < 1e-6) AB.fwd.copy(B.up);
  AB.fwd.normalize();
  AB.up.copy(B.fwd).addScaledVector(AB.fwd, -B.fwd.dot(AB.fwd));
  if (AB.up.lengthSq() < 1e-6) AB.up.copy(B.side).addScaledVector(AB.fwd, -B.side.dot(AB.fwd));
  AB.up.normalize();
  AB.side.crossVectors(AB.fwd, AB.up).normalize();
  AB.axis.copy(B.axis);
  return AB;
}

const secondary: BodyState = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), quat: new THREE.Quaternion(), mass: 0, present: false };
/** How long (s) a secondary body that has left the world keeps some pull on the framing. */
const SECONDARY_FADE = 4;
/**
 * Weight of a shot's secondary body at mission time t, with its state in `secondary`: 1 while it
 * is present; after it leaves the world (a jettisoned part is removed once far away) its pull on
 * the framing fades to 0 over a few seconds along its extrapolated path, so a framing never jumps
 * when something it was watching disappears.
 */
function secondaryWeight(id: BodyId, t: number): number {
  const s = frame.bodies[id];
  if (s?.present) {
    secondary.pos.copy(s.pos);
    secondary.vel.copy(s.vel);
    secondary.quat.copy(s.quat);
    secondary.present = true;
    return 1;
  }
  const tr = frame.tl?.bodies[id];
  if (!tr || t < tr.exists[1] || t > tr.exists[1] + SECONDARY_FADE) return 0;
  bodyAt(tr, t, secondary);
  const u = (t - tr.exists[1]) / SECONDARY_FADE;
  return 1 - u * u * (3 - 2 * u);
}

export const makeBasis = (): Basis => ({ up: new THREE.Vector3(), fwd: new THREE.Vector3(), side: new THREE.Vector3(), axis: new THREE.Vector3() });
const B = makeBasis();
const B2 = makeBasis();

/** Body-frame point → absolute. */
export function bodyPoint(s: BodyState, local: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  return out.copy(local).applyQuaternion(s.quat).add(s.pos);
}

/** Centre of a body's visual extent (absolute). */
export function bodyCentre(id: BodyId, s: BodyState, out: THREE.Vector3): THREE.Vector3 {
  return bodyPoint(s, v3.set(0, bodySize(id).centreY, 0), out);
}

/** Centre of the assembly a body belongs to (absolute) and its framing half-size. */
export function subjectCentre(id: BodyId, s: BodyState, t: number, out: THREE.Vector3): number {
  const e = subjectExtent(id, t);
  bodyPoint(s, v3.set(0, e.centreY, 0), out);
  return e.half;
}

/** True when a body exists in the world now (sampled and inside its lifetime). */
export function isPresent(id: BodyId | undefined | null): boolean {
  if (!id) return false;
  const s = frame.bodies[id as BodyId];
  return !!s && s.present;
}

/** A ground camera at east/north/up metres from the pad, at mission time t. */
export function groundPoint(e: number, n: number, u: number, t: number, out: THREE.Vector3): THREE.Vector3 {
  sitePosition(t, 0, out);
  const q = siteFrameQuaternion(t, q1);
  // site frame: x east, y up, z south
  out.add(v2.set(e, u, -n).applyQuaternion(q));
  return out;
}

export function siteUp(t: number, out: THREE.Vector3): THREE.Vector3 {
  return sitePosition(t, 0, out).normalize();
}

/** Keep a camera position above the ground (spherical Earth) by at least `min` metres. */
export function keepAboveGround(p: THREE.Vector3, min: number): boolean {
  const r = p.length();
  if (r < R_EARTH + min) {
    p.multiplyScalar((R_EARTH + min) / r);
    return true;
  }
  return false;
}

const qInv = new THREE.Quaternion();
const local = new THREE.Vector3();
const padO = new THREE.Vector3();
/** Service tower footprint (pad-local, m): the lattice, arms and lightning mast. */
const TOWER_BOX = { x0: PAD.tower.x - 6.5, x1: PAD.tower.x + 6.5, z0: PAD.tower.z - 6.5, z1: PAD.tower.z + 6.5, y1: PAD.tower.height + 4 };

/**
 * Keep a camera out of solid things it could otherwise pass through while moving: the ground,
 * the service tower, and the hull of any present vehicle assembly (the onboard camera, which is
 * mounted on the hull, passes `skipHull`). The correction projects the camera onto the nearest
 * clear surface, so a path grazing an obstacle bends around it continuously. Returns true when
 * the pose was corrected.
 */
export function enforceClearance(p: CamPose, t: number, skipHull: BodyId | null = null): boolean {
  let moved = keepAboveGround(p.pos, 1.5);
  // the tower (only near the pad)
  sitePosition(t, 0, padO);
  if (p.pos.distanceToSquared(padO) < 250 * 250) {
    qInv.copy(siteFrameQuaternion(t, q1)).invert();
    local.subVectors(p.pos, padO).applyQuaternion(qInv);
    const b = TOWER_BOX;
    if (local.x > b.x0 && local.x < b.x1 && local.z > b.z0 && local.z < b.z1 && local.y < b.y1) {
      const dx0 = local.x - b.x0;
      const dx1 = b.x1 - local.x;
      const dz0 = local.z - b.z0;
      const dz1 = b.z1 - local.z;
      const dy = b.y1 - local.y;
      const m = Math.min(dx0, dx1, dz0, dz1, dy);
      if (m === dx0) local.x = b.x0;
      else if (m === dx1) local.x = b.x1;
      else if (m === dz0) local.z = b.z0;
      else if (m === dz1) local.z = b.z1;
      else local.y = b.y1;
      p.pos.copy(local.applyQuaternion(q1)).add(padO);
      moved = true;
    }
  }
  // vehicle hulls: a cylinder around each assembly's axis
  const tl = frame.tl;
  if (tl) {
    for (const id of STACK) {
      const s = frame.bodies[id];
      if (!s.present || assemblyRoot(id, t, tl) !== id) continue;
      if (skipHull && assemblyRoot(skipHull, t, tl) === id) continue;
      if (s.pos.distanceToSquared(p.pos) > 120 * 120) continue;
      const e = subjectExtent(id, t, tl);
      qInv.copy(s.quat).invert();
      local.subVectors(p.pos, s.pos).applyQuaternion(qInv);
      const R = id === 'capsule' || id === 'service' ? 3.2 : id === 'satellite' ? 3.5 : 2.9;
      const y0 = e.centreY - e.half - 1;
      const y1 = e.centreY + e.half + 1;
      const rr = Math.hypot(local.x, local.z);
      if (rr < R && local.y > y0 && local.y < y1) {
        const dr = R - rr;
        const dy0 = local.y - y0;
        const dy1 = y1 - local.y;
        if (dr <= dy0 && dr <= dy1) {
          if (rr < 1e-4) local.x = R;
          else {
            local.x *= R / rr;
            local.z *= R / rr;
          }
        } else if (dy0 < dy1) local.y = y0;
        else local.y = y1;
        p.pos.copy(local.applyQuaternion(s.quat)).add(s.pos);
        moved = true;
      }
    }
  }
  return moved;
}

export interface ShotContext {
  aspect: number;
  /** UI clock seconds (for slow, deterministic drift in long holds only). */
  decor: number;
}

const dS = new THREE.Vector3();
const dA = new THREE.Vector3();
const dW = new THREE.Vector3();
/**
 * Aim a camera at `pos` at a subject (centre cs, radius rs) and a secondary body (ca, ra):
 * the view direction turns from the subject toward the secondary by `mix` of the angle between
 * them, the lens widens just enough for both, and when both cannot fit within `maxFov` the
 * secondary is let go (partly or wholly out of frame) rather than the subject. Writes the target
 * and returns the vertical field of view (deg).
 */
export function aimTwo(pos: THREE.Vector3, cs: THREE.Vector3, rs: number, ca: THREE.Vector3, ra: number, mix: number, aspect: number, maxFov: number, target: THREE.Vector3): number {
  const ls = Math.max(1e-3, dS.subVectors(cs, pos).length());
  const la = Math.max(1e-3, dA.subVectors(ca, pos).length());
  dS.divideScalar(ls);
  dA.divideScalar(la);
  const theta = Math.acos(clamp(dS.dot(dA), -1, 1));
  const angS = Math.asin(clamp(rs / ls, 0, 1));
  const angA = Math.asin(clamp(ra / la, 0, 1));
  // the limiting half-angle is the narrower of the vertical and horizontal ones
  const maxHalfV = ((maxFov / 2) * Math.PI) / 180;
  const maxHalf = aspect < 1 ? Math.atan(Math.tan(maxHalfV) * aspect) : maxHalfV;
  let m = clamp(mix, 0, 1);
  let need = Math.max(m * theta + angS, (1 - m) * theta + angA) * 1.12;
  if (need > maxHalf && theta > 1e-6) {
    // keep the subject well inside: aim no further toward the secondary than the lens allows
    m = clamp(Math.min(m, (maxHalf / 1.12 - angS) / theta), 0, 1);
    need = maxHalf;
  }
  if (theta < 1e-6) dW.copy(dS);
  else {
    // shortest rotation from dS toward dA by m of the angle
    dW.copy(dS).multiplyScalar(Math.sin((1 - m) * theta)).addScaledVector(dA, Math.sin(m * theta)).divideScalar(Math.sin(theta));
  }
  target.copy(pos).addScaledVector(dW.normalize(), ls);
  const halfV = aspect < 1 ? Math.atan(Math.tan(need) / aspect) : need;
  return clamp((2 * halfV * 180) / Math.PI, 6, maxFov);
}

/** Distance at which a spread of `spread` metres fits a lens of maxFov (deg). */
function backOff(spread: number, maxFov: number): number {
  return spread / Math.tan(((maxFov / 2) * Math.PI) / 180);
}

/** Ground framings of the Ground camera mode and the Auto shot list. */
const GROUND_KINDS: ShotKind[] = ['pad-wide', 'pad-close', 'tower', 'ground-track', 'landing'];
export const isGroundKind = (k: ShotKind) => GROUND_KINDS.includes(k) || k === 'splash';

/**
 * Evaluate a shot at mission time t. Returns false if the subject is not present.
 * Params (all optional): d (distance m), az / el (deg around the subject in its travel frame),
 * e / n / u (ground camera offsets from the pad, m), fov (deg), look (fraction along body axis),
 * frame (framing margin factor), mix (how far the aim moves toward the secondary subject).
 */
export function evalShot(shot: Shot, t: number, ctx: ShotContext, out: CamPose): boolean {
  const s = frame.bodies[shot.subject];
  if (!s || !s.present) return false;
  const P = shot.params ?? {};
  const kind: ShotKind = shot.kind;
  // staging and deployment framings are about one body and the one leaving it; everything
  // else frames the whole assembly the subject is part of
  const own = kind === 'staging' || kind === 'deploy';
  const size = own ? bodySize(shot.subject) : subjectExtent(shot.subject, t);
  basisOf(s, B);
  const centre = bodyPoint(s, v1.set(0, size.centreY, 0), v1);
  const lookAlong = P.look ?? 0;
  out.upHint.set(0, 0, 0);

  const orbitAround = (d: number, azDeg: number, elDeg: number, b: Basis) => {
    const az = (azDeg * Math.PI) / 180;
    const el = (elDeg * Math.PI) / 180;
    // az 0 = behind the subject (looking along the direction of travel), 90 = to its right
    out.pos
      .copy(centre)
      .addScaledVector(b.fwd, -Math.cos(az) * Math.cos(el) * d)
      .addScaledVector(b.side, Math.sin(az) * Math.cos(el) * d)
      .addScaledVector(b.up, Math.sin(el) * d);
    out.target.copy(centre).addScaledVector(b.axis, lookAlong * size.half);
    out.up.copy(b.up);
  };
  const alsoW = shot.also && shot.also !== 'earth' && shot.also !== 'moon' ? secondaryWeight(shot.also as BodyId, t) : 0;
  const also = alsoW > 0 ? secondary : null;

  switch (kind) {
    case 'pad-wide':
    case 'pad-close':
    case 'tower':
    case 'ground-track':
    case 'landing': {
      // [east, north, up] from the pad; the named sites are pad-local (x east, y up, z south)
      const cam = (c: { x: number; y: number; z: number }): [number, number, number] => [c.x, -c.z, c.y];
      const defaults: Record<string, [number, number, number]> = {
        'pad-wide': cam(GROUND_CAMS.padWide),
        'pad-close': cam(GROUND_CAMS.padClose),
        tower: cam(GROUND_CAMS.towerTop),
        'ground-track': cam(GROUND_CAMS.tracking),
        landing: cam(GROUND_CAMS.landing),
      };
      const [de, dn, du] = defaults[kind];
      groundPoint(P.e ?? de, P.n ?? dn, P.u ?? du, t, out.pos);
      out.target.copy(centre).addScaledVector(B.axis, lookAlong * size.half);
      siteUp(t, out.up);
      // looking nearly straight up (a vehicle overhead), the top of the picture points back
      // toward the camera's side of the site it watches (the pad, or the landing zone), as when
      // a camera operator tilts back: a fixed direction, so the picture never spins overhead
      if (kind === 'landing') groundPoint(LANDING_ZONE.x, -LANDING_ZONE.z, 0, t, vRef);
      else sitePosition(t, 0, vRef);
      out.upHint.subVectors(out.pos, vRef);
      out.upHint.addScaledVector(out.up, -out.upHint.dot(out.up));
      if (out.upHint.lengthSq() > 1e-6) out.upHint.normalize();
      else out.upHint.set(0, 0, 0);
      const d = out.pos.distanceTo(out.target);
      out.fov = P.fov ?? fitFov(size.half * (P.frame ?? 1), d, ctx.aspect, 1.2, 1.2, 60);
      return true;
    }
    case 'chase':
    case 'side':
    case 'orbit':
    case 'deploy':
    case 'entry':
    case 'approach':
    case 'staging': {
      let d = P.d ?? (kind === 'orbit' ? 90 : kind === 'deploy' ? 26 : kind === 'side' ? 140 : kind === 'staging' ? 60 : 70);
      let az = P.az ?? (kind === 'side' ? 90 : kind === 'orbit' ? 25 : kind === 'entry' ? 70 : kind === 'staging' ? 100 : 20);
      const el = P.el ?? (kind === 'orbit' ? 22 : kind === 'side' ? 4 : kind === 'staging' ? 8 : 12);
      if (kind === 'orbit' || kind === 'deploy') az = sunSideAz(az, B);
      const ts = also ? (shot.also as BodyId) : null;
      const maxFov = kind === 'staging' || kind === 'deploy' ? 62 : 70;
      let aB: Basis = B;
      let keep = alsoW;
      if (also && ts) {
        bodyCentre(ts, also, v2);
        const sep = v2.distanceTo(centre);
        if (kind === 'staging' || kind === 'deploy') {
          // a departing part is kept in frame while it separates, then let go once it is clear
          // (a few body lengths away): the camera holds the subject instead of backing off
          const L = size.half + bodySize(ts).half;
          keep *= 1 - smooth(3 * L, 10 * L, sep);
        }
        if (kind === 'approach') {
          // rendezvous: angles are measured around the approach line (az 0: behind the chaser,
          // looking along the line to the target; 90: beside it), so the target stays ahead
          aB = approachBasis(ts, also, v2, centre);
        } else if (kind === 'staging' || kind === 'deploy') {
          // two bodies parting: back off once the lens is wide, so both stay in frame
          // (at most 4x the authored range: beyond that the departing part is let go, and the
          // subject stays the subject)
          d = Math.min(d * 4, Math.max(d, backOff((sep * 0.62 + bodySize(ts).half) * keep + size.half * 0.5, maxFov * 0.92)));
        }
      }
      if (!also && !P.fov) {
        // a large assembly (the whole vehicle up close, a capsule under its parachutes): back off
        // rather than open the lens past ~55 degrees (continuous as the assembly grows)
        const halfNeed = size.half * (P.frame ?? 1.1) * 1.25;
        d = Math.max(d, halfNeed / Math.tan((27.5 * Math.PI) / 180));
      }
      orbitAround(d, az, el, aB);
      if (aB === AB) {
        // looking along the local vertical toward the station, the top of the picture is the
        // direction of travel
        out.up.copy(B.up);
        out.upHint.copy(B.fwd);
      }
      if (also && ts) {
        const mix = (P.mix ?? (kind === 'approach' ? 0.5 : kind === 'staging' ? 0.45 : 0.5)) * keep;
        const ra = ts === 'station' ? 28 : bodySize(ts).half;
        out.fov = P.fov ?? aimTwo(out.pos, centre, size.half * (P.frame ?? 1.05), v2, ra, mix, ctx.aspect, maxFov, out.target);
      } else out.fov = P.fov ?? fitFov(size.half * (P.frame ?? 1.1), d, ctx.aspect, 1.25, 8, 75);
      if (kind === 'orbit' || shot.also === 'earth' || P.dip) {
        // aim a little below the subject so the Earth fills the lower part of the frame; the
        // offset is a share of the half field of view, so the subject always stays in frame
        const halfT = Math.tan(((out.fov / 2) * Math.PI) / 180) * out.pos.distanceTo(out.target);
        out.target.addScaledVector(B.up, -(P.dip ?? 0.3) * halfT);
      }
      keepAboveGround(out.pos, 30);
      return true;
    }
    case 'onboard-down':
    case 'onboard-up': {
      // body-fixed camera on the skin, looking along the body
      const own = bodySize(shot.subject);
      const r = P.r ?? 2.05;
      const y = P.y ?? (kind === 'onboard-down' ? own.centreY + own.half * 0.6 : own.centreY - own.half * 0.3);
      bodyPoint(s, v2.set(r, y, 0), out.pos);
      bodyPoint(s, v3.set(r * 0.92, kind === 'onboard-down' ? y - 30 : y + 30, 0), out.target);
      out.up.set(1, 0, 0).applyQuaternion(s.quat); // outward from the skin
      out.fov = P.fov ?? 62;
      return true;
    }
    case 'splash': {
      // camera near the sea surface a few hundred metres from the capsule
      const d = P.d ?? 160;
      out.pos.copy(centre).addScaledVector(B.side, d).addScaledVector(B.fwd, -d * 0.4);
      const r = out.pos.length();
      const surfaceR = R_EARTH + (P.u ?? 6);
      out.pos.multiplyScalar(surfaceR / r);
      out.target.copy(centre);
      out.up.copy(out.pos).normalize();
      out.fov = P.fov ?? fitFov(Math.max(size.half * 4, 30), out.pos.distanceTo(centre), ctx.aspect, 1.3);
      return true;
    }
    case 'lunar': {
      const d = P.d ?? 60;
      orbitAround(d, P.az ?? 150, P.el ?? 10, B);
      moonPosition(t, frame.tl?.moonPhase0 ?? 0, v2);
      // look past the spacecraft toward the Moon from the sunlit side, so both the probe and the
      // Moon's day side are lit (from straight behind, the probe was a silhouette on the night side)
      v3.subVectors(v2, centre).normalize();
      vSun.copy(v3).multiplyScalar(-0.6).addScaledVector(SUN_DIRECTION, 0.8).normalize();
      out.pos.copy(centre).addScaledVector(vSun, d).addScaledVector(B.up, d * 0.15);
      out.target.copy(centre).addScaledVector(v3, d * 0.4);
      out.fov = P.fov ?? 45;
      return true;
    }
    case 'map':
      return false;
  }
  return false;
}

/**
 * Coast cameras keep their authored angle while it shows the subject lit; when that angle would
 * look into the Sun (subject in silhouette), the azimuth swings smoothly toward the sunlit side
 * (Sun behind and to one side of the camera). Every input varies smoothly with mission time, and
 * the swing fades out continuously as the Sun approaches the local vertical (where "which side"
 * is undefined), so the framing never jumps.
 */
export function sunSideAz(azDeg: number, b: Basis): number {
  const sx = -SUN_DIRECTION.dot(b.fwd);
  const sy = SUN_DIRECTION.dot(b.side);
  const inPlane = Math.hypot(sx, sy);
  const fade = smooth(0.12, 0.3, inPlane);
  if (fade <= 0) return azDeg;
  const sunAz = (Math.atan2(sy, sx) * 180) / Math.PI;
  const lit = Math.cos(((azDeg - sunAz) * Math.PI) / 180); // 1: Sun behind the camera, -1: backlit
  const w = smooth(0.15, -0.45, lit) * fade;
  if (w <= 0) return azDeg;
  const want = sunAz + 35;
  const delta = ((((want - azDeg + 180) % 360) + 360) % 360) - 180;
  return azDeg + delta * w;
}

function smooth(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** The user's free orbit around a subject, in the subject's local travel frame. */
export interface FreeOrbit {
  az: number; // deg
  el: number; // deg
  dist: number; // m
}

/** Free orbit around a subject. Returns false when the subject is not present. */
export function evalFree(subject: BodyId, o: FreeOrbit, ctx: ShotContext, out: CamPose, t = frame.missionTime): boolean {
  const s = frame.bodies[subject];
  if (!s || !s.present) return false;
  basisOf(s, B2);
  const half = subjectCentre(subject, s, t, v1);
  const az = (o.az * Math.PI) / 180;
  const el = (o.el * Math.PI) / 180;
  out.pos
    .copy(v1)
    .addScaledVector(B2.fwd, -Math.cos(az) * Math.cos(el) * o.dist)
    .addScaledVector(B2.side, Math.sin(az) * Math.cos(el) * o.dist)
    .addScaledVector(B2.up, Math.sin(el) * o.dist);
  keepAboveGround(out.pos, 2);
  out.target.copy(v1);
  out.up.copy(B2.up);
  out.upHint.set(0, 0, 0);
  out.fov = clamp(fitFov(half, o.dist, ctx.aspect, 1.3), 10, 65);
  return true;
}

/** A comfortable free-orbit distance for a subject (its assembly fills about half the view). */
export function freeDistance(subject: BodyId, t = frame.missionTime): number {
  return clamp(subjectExtent(subject, t).half * 3.2, 12, 400);
}

/** Free-orbit parameters that reproduce a displayed camera position around a subject. */
export function freeFromPose(subject: BodyId, pos: THREE.Vector3, out: FreeOrbit, t = frame.missionTime): FreeOrbit {
  const s = frame.bodies[subject];
  if (!s || !s.present) return out;
  basisOf(s, B2);
  subjectCentre(subject, s, t, v1);
  const d = v2.subVectors(pos, v1);
  const dist = Math.max(1, d.length());
  const x = -d.dot(B2.fwd);
  const y = d.dot(B2.side);
  const z = d.dot(B2.up);
  out.dist = dist;
  out.el = (Math.asin(clamp(z / dist, -1, 1)) * 180) / Math.PI;
  out.az = (Math.atan2(y, x) * 180) / Math.PI;
  return out;
}
