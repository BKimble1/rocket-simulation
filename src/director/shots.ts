/**
 * Flight camera shots: each is a pure function of mission time and the sampled body states
 * (frame.bodies), so the Auto director is deterministic and seeking lands on the same framing.
 * Shots follow their subject; they never alter a trajectory. Ground cameras are fixed to the
 * rotating Earth at named sites.
 */
import * as THREE from 'three';
import type { BodyId } from '../vehicle/parts';
import type { Shot, ShotKind } from '../timeline/types';
import { frame } from '../scene/frame';
import { R_EARTH, SUN_DIRECTION, sitePosition, siteFrameQuaternion, moonPosition } from '../world/frames';
import { GROUND_CAMS } from '../world/site';
import { clamp, fitFov, type CamPose } from './pose';
import type { BodyState } from '../timeline/sample';
import { MOUNT_Y } from '../scene/spacecraft/types';

/** Approximate half-length (m) of each body for framing. */
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

/** Framing size of a body in the mission on screen. */
export function bodySize(id: BodyId): { half: number; centreY: number } {
  if (id === 'capsule' && frame.tl?.id === 'suborbital') return RESEARCH_CAPSULE;
  return BODY_SIZE[id];
}

const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const v3 = new THREE.Vector3();
const vSun = new THREE.Vector3();
const q1 = new THREE.Quaternion();

export interface Basis {
  up: THREE.Vector3; // local vertical (radial)
  fwd: THREE.Vector3; // horizontal direction of travel (downrange)
  side: THREE.Vector3; // fwd × up (to the right of the direction of travel)
  axis: THREE.Vector3; // body +Y (nose direction)
}

export function basisOf(s: BodyState, out: Basis): Basis {
  out.up.copy(s.pos).normalize();
  out.fwd.copy(s.vel).addScaledVector(out.up, -s.vel.dot(out.up));
  if (out.fwd.lengthSq() < 1) out.fwd.set(1, 0, 0).addScaledVector(out.up, -out.up.x);
  out.fwd.normalize();
  out.side.crossVectors(out.fwd, out.up).normalize();
  out.axis.set(0, 1, 0).applyQuaternion(s.quat);
  return out;
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
export function keepAboveGround(p: THREE.Vector3, min: number): void {
  const r = p.length();
  if (r < R_EARTH + min) p.multiplyScalar((R_EARTH + min) / r);
}

export interface ShotContext {
  aspect: number;
  /** Stage clock seconds (for slow, deterministic drift in long holds only). */
  decor: number;
}

/**
 * Evaluate a shot at mission time t. Returns false if the subject is not present.
 * Params (all optional): d (distance m), az / el (deg around the subject in its travel frame),
 * e / n / u (ground camera offsets from the pad, m), fov (deg), look (fraction along body axis).
 */
export function evalShot(shot: Shot, t: number, ctx: ShotContext, out: CamPose): boolean {
  const s = frame.bodies[shot.subject];
  if (!s) return false;
  const P = shot.params ?? {};
  const size = bodySize(shot.subject);
  basisOf(s, B);
  const centre = bodyCentre(shot.subject, s, v1);
  const lookAlong = P.look ?? 0;
  const kind: ShotKind = shot.kind;

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
      const d = out.pos.distanceTo(out.target);
      out.fov = P.fov ?? fitFov(size.half * (P.frame ?? 1), d, ctx.aspect, 1.2, 1.2, 60);
      return true;
    }
    case 'chase':
    case 'side':
    case 'orbit':
    case 'deploy':
    case 'entry':
    case 'approach': {
      const d = P.d ?? (kind === 'orbit' ? 90 : kind === 'deploy' ? 26 : kind === 'side' ? 140 : 70);
      let az = P.az ?? (kind === 'side' ? 90 : kind === 'orbit' ? 25 : kind === 'entry' ? 70 : 20);
      const el = P.el ?? (kind === 'orbit' ? 22 : kind === 'side' ? 4 : 12);
      if (kind === 'orbit' || kind === 'deploy') az = sunSideAz(az, B);
      orbitAround(d, az, el, B);
      if (shot.also && shot.also !== 'earth' && shot.also !== 'moon') {
        const o = frame.bodies[shot.also];
        if (o && o.present) {
          bodyCentre(shot.also, o, v2);
          out.target.lerp(v2, P.mix ?? 0.5);
        }
      }
      out.fov = P.fov ?? fitFov(size.half * (P.frame ?? 1.1), d, ctx.aspect, 1.25);
      if (kind === 'orbit' || shot.also === 'earth') {
        // aim a little below the subject so the Earth fills the lower part of the frame; the
        // offset is a share of the half field of view, so the subject always stays in frame
        const half = Math.tan(((out.fov / 2) * Math.PI) / 180) * out.pos.distanceTo(out.target);
        out.target.addScaledVector(B.up, -(P.dip ?? 0.3) * half);
      }
      keepAboveGround(out.pos, 30);
      return true;
    }
    case 'staging': {
      // held relative framing: offset from the subject in its travel frame, looking between
      // the subject and the separating body
      const d = P.d ?? 60;
      orbitAround(d, P.az ?? 100, P.el ?? 8, B);
      if (shot.also && shot.also !== 'earth' && shot.also !== 'moon') {
        const o = frame.bodies[shot.also];
        if (o) {
          bodyCentre(shot.also, o, v2);
          out.target.lerp(v2, P.mix ?? 0.45);
          const sep = v2.distanceTo(centre);
          out.fov = P.fov ?? clamp(fitFov(Math.max(size.half, sep * 0.6 + 6), d, ctx.aspect, 1.2), 12, 70);
          return true;
        }
      }
      out.fov = P.fov ?? fitFov(size.half, d, ctx.aspect);
      return true;
    }
    case 'onboard-down':
    case 'onboard-up': {
      // body-fixed camera on the skin, looking along the body
      const r = P.r ?? 2.05;
      const y = P.y ?? (kind === 'onboard-down' ? size.centreY + size.half * 0.6 : size.centreY - size.half * 0.3);
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
      // look past the spacecraft at the Moon, tilted toward its sunlit side: on the approach the
      // Moon reads half lit with the probe lit from the side; at closest approach, over the night
      // side, the lit part is the crescent nearest the Sun and the probe is partly backlit
      v3.subVectors(v2, centre).normalize();
      vSun.copy(SUN_DIRECTION).addScaledVector(v3, -SUN_DIRECTION.dot(v3));
      if (vSun.lengthSq() > 1e-6) v3.addScaledVector(vSun.normalize(), Math.tan(THREE.MathUtils.degToRad(15))).normalize();
      out.pos.copy(centre).addScaledVector(v3, -d).addScaledVector(B.up, d * 0.15);
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
 * (Sun behind and to one side of the camera). Every input varies smoothly with mission time, so
 * the framing stays continuous and deterministic.
 */
function sunSideAz(azDeg: number, b: Basis): number {
  const sx = -SUN_DIRECTION.dot(b.fwd);
  const sy = SUN_DIRECTION.dot(b.side);
  if (sx * sx + sy * sy < 0.04) return azDeg; // Sun nearly overhead or underfoot in this frame
  const sunAz = (Math.atan2(sy, sx) * 180) / Math.PI;
  const lit = Math.cos(((azDeg - sunAz) * Math.PI) / 180); // 1: Sun behind the camera, -1: backlit
  const w = smooth(0.15, -0.45, lit);
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

export function evalFree(subject: BodyId, o: FreeOrbit, ctx: ShotContext, out: CamPose): boolean {
  const s = frame.bodies[subject];
  if (!s) return false;
  basisOf(s, B2);
  const c = bodyCentre(subject, s, v1);
  const az = (o.az * Math.PI) / 180;
  const el = (o.el * Math.PI) / 180;
  out.pos
    .copy(c)
    .addScaledVector(B2.fwd, -Math.cos(az) * Math.cos(el) * o.dist)
    .addScaledVector(B2.side, Math.sin(az) * Math.cos(el) * o.dist)
    .addScaledVector(B2.up, Math.sin(el) * o.dist);
  keepAboveGround(out.pos, 2);
  out.target.copy(c);
  out.up.copy(B2.up);
  out.fov = clamp(fitFov(bodySize(subject).half, o.dist, ctx.aspect, 1.3), 10, 65);
  return true;
}

/** Free-orbit parameters that reproduce a displayed camera position around a subject. */
export function freeFromPose(subject: BodyId, pos: THREE.Vector3, out: FreeOrbit): FreeOrbit {
  const s = frame.bodies[subject];
  basisOf(s, B2);
  const c = bodyCentre(subject, s, v1);
  const d = v2.subVectors(pos, c);
  const dist = Math.max(1, d.length());
  const x = -d.dot(B2.fwd);
  const y = d.dot(B2.side);
  const z = d.dot(B2.up);
  out.dist = dist;
  out.el = (Math.asin(clamp(z / dist, -1, 1)) * 180) / Math.PI;
  out.az = (Math.atan2(y, x) * 180) / Math.PI;
  return out;
}
