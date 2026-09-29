/**
 * Pure sampling of a built MissionTimeline. No state, no side effects: the same mission time
 * always gives the same answer, which is what makes seeking exact.
 */
import * as THREE from 'three';
import type { BodyId } from '../vehicle/parts';
import type { BodyTrack, Channel, ChannelId, MissionEvent, MissionTimeline, Phase, PresSegment } from './types';

/** Index i such that arr[i] <= x < arr[i+1] (clamped to [0, n-2]). */
export function bracket(arr: ArrayLike<number>, x: number): number {
  const n = arr.length;
  if (n < 2 || x <= arr[0]) return 0;
  if (x >= arr[n - 1]) return n - 2;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= x) lo = mid;
    else hi = mid;
  }
  return lo;
}

export function channelAt(ch: Channel | undefined, t: number, fallback = 0): number {
  if (!ch || ch.t.length === 0) return fallback;
  if (t <= ch.t[0]) return ch.v[0];
  const n = ch.t.length;
  if (t >= ch.t[n - 1]) return ch.v[n - 1];
  const i = bracket(ch.t, t);
  const t0 = ch.t[i];
  const t1 = ch.t[i + 1];
  const u = t1 > t0 ? (t - t0) / (t1 - t0) : 1;
  return ch.v[i] + (ch.v[i + 1] - ch.v[i]) * u;
}

export function chan(tl: MissionTimeline, id: ChannelId, t: number, fallback = 0): number {
  return channelAt(tl.channels[id], t, fallback);
}

export interface BodyState {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  quat: THREE.Quaternion;
  mass: number;
  present: boolean;
}

export function makeBodyState(): BodyState {
  return { pos: new THREE.Vector3(), vel: new THREE.Vector3(), quat: new THREE.Quaternion(), mass: 0, present: false };
}

const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();

/**
 * Body state at mission time t: cubic Hermite position (C1-continuous, uses the sampled
 * velocities), linear velocity, spherical-linear orientation.
 */
export function bodyAt(track: BodyTrack, t: number, out: BodyState): BodyState {
  const T = track.t;
  const n = T.length;
  out.present = t >= track.exists[0] && t <= track.exists[1];
  const tc = Math.min(Math.max(t, T[0]), T[n - 1]);
  const i = bracket(T, tc);
  const j = Math.min(i + 1, n - 1);
  const t0 = T[i];
  const t1 = T[j];
  const h = t1 - t0;
  const u = h > 0 ? (tc - t0) / h : 0;
  const P = track.pos;
  const V = track.vel;
  const u2 = u * u;
  const u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1;
  const h10 = u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2;
  const h11 = u3 - u2;
  const a = 3 * i;
  const b = 3 * j;
  out.pos.set(
    h00 * P[a] + h10 * h * V[a] + h01 * P[b] + h11 * h * V[b],
    h00 * P[a + 1] + h10 * h * V[a + 1] + h01 * P[b + 1] + h11 * h * V[b + 1],
    h00 * P[a + 2] + h10 * h * V[a + 2] + h01 * P[b + 2] + h11 * h * V[b + 2],
  );
  // extrapolate beyond the last sample along the final velocity (bodies drifting away)
  if (t > T[n - 1]) out.pos.set(P[b] + V[b] * (t - T[n - 1]), P[b + 1] + V[b + 1] * (t - T[n - 1]), P[b + 2] + V[b + 2] * (t - T[n - 1]));
  out.vel.set(V[a] + (V[b] - V[a]) * u, V[a + 1] + (V[b + 1] - V[a + 1]) * u, V[a + 2] + (V[b + 2] - V[a + 2]) * u);
  const Q = track.quat;
  const c = 4 * i;
  const d = 4 * j;
  qa.set(Q[c], Q[c + 1], Q[c + 2], Q[c + 3]);
  qb.set(Q[d], Q[d + 1], Q[d + 2], Q[d + 3]);
  out.quat.slerpQuaternions(qa, qb, u);
  out.mass = track.mass[i] + (track.mass[j] - track.mass[i]) * u;
  return out;
}

export function bodyStateAt(tl: MissionTimeline, id: BodyId, t: number, out: BodyState): BodyState | null {
  const tr = tl.bodies[id];
  if (!tr) return null;
  return bodyAt(tr, t, out);
}

// ───────────────────────────── presentation ↔ mission time ─────────────────────────────

export function presDuration(segs: PresSegment[]): number {
  return segs.length ? segs[segs.length - 1].p1 : 0;
}

export function segmentAtPres(segs: PresSegment[], p: number): PresSegment {
  let lo = 0;
  let hi = segs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (segs[mid].p0 <= p) lo = mid;
    else hi = mid - 1;
  }
  return segs[lo];
}

/** Mission time shown at presentation time p. Deterministic and monotonic non-decreasing. */
export function presToMission(segs: PresSegment[], p: number): number {
  if (!segs.length) return p;
  const s = segmentAtPres(segs, Math.max(segs[0].p0, Math.min(p, segs[segs.length - 1].p1)));
  const span = s.p1 - s.p0;
  const u = span > 0 ? Math.min(1, Math.max(0, (p - s.p0) / span)) : 1;
  return s.m0 + (s.m1 - s.m0) * u;
}

/** Earliest presentation time that shows mission time m. */
export function missionToPres(segs: PresSegment[], m: number): number {
  if (!segs.length) return m;
  if (m <= segs[0].m0) return segs[0].p0;
  for (const s of segs) {
    if (m <= s.m1) {
      const span = s.m1 - s.m0;
      const u = span > 0 ? (m - s.m0) / span : 0;
      return s.p0 + (s.p1 - s.p0) * u;
    }
  }
  return segs[segs.length - 1].p1;
}

/** Current rate (mission seconds per presentation second) and its on-screen note. */
export function presRate(segs: PresSegment[], p: number): { rate: number; note?: string; omitted?: boolean } {
  if (!segs.length) return { rate: 1 };
  const s = segmentAtPres(segs, p);
  const span = s.p1 - s.p0;
  return { rate: span > 0 ? (s.m1 - s.m0) / span : 1, note: s.note, omitted: s.omitted };
}

// ───────────────────────────── events and phases ─────────────────────────────

export function phaseAt(phases: Phase[], t: number): Phase | null {
  let cur: Phase | null = null;
  for (const ph of phases) if (t >= ph.start - 1e-6) cur = ph;
  return cur;
}

export function eventById(tl: MissionTimeline, id: string): MissionEvent | undefined {
  return tl.events.find((e) => e.id === id);
}

/** Events whose time lies in (t0, t1]: fired when playback moves forward across them. */
export function eventsCrossed(tl: MissionTimeline, t0: number, t1: number): MissionEvent[] {
  if (!(t1 > t0)) return [];
  return tl.events.filter((e) => e.t > t0 && e.t <= t1);
}
