/**
 * Turns recorded centre-of-mass segments into BodyTracks. Every track gives the pose of the
 * shared MODEL FRAME origin (first-stage nozzle exit plane on the axis, +Y toward the nose):
 * origin = com - R(q) comLocal, and its velocity is the rigid-body velocity of that point
 * (v_com - w x R comLocal - R d(comLocal)/dt), which the sampler's cubic Hermite interpolation uses.
 */
import type { BodyId } from '../../vehicle/parts';
import type { BodyTrack } from '../types';
import type { Sample, Segment } from './craft';
import { qrot, qslerp, vcross, vsub, type Q, type V3 } from './vec';

export interface OriginSample {
  t: number;
  p: V3;
  v: V3;
  q: Q;
  m: number;
}

export function segmentOrigins(samples: Sample[]): OriginSample[] {
  const n = samples.length;
  const out: OriginSample[] = [];
  for (let i = 0; i < n; i++) {
    const s = samples[i];
    const u = qrot(s.q, s.c);
    // d(comLocal)/dt by finite differences inside the segment
    let cd: V3 = { x: 0, y: 0, z: 0 };
    if (n > 1) {
      const a = samples[Math.max(0, i - 1)];
      const b = samples[Math.min(n - 1, i + 1)];
      const dt = b.t - a.t;
      if (dt > 1e-9) cd = { x: (b.c.x - a.c.x) / dt, y: (b.c.y - a.c.y) / dt, z: (b.c.z - a.c.z) / dt };
    }
    const vo = vsub(vsub(s.v, vcross(s.w, u)), qrot(s.q, cd));
    out.push({ t: s.t, p: vsub(s.r, u), v: vo, q: s.q, m: s.m });
  }
  return out;
}

/** Time after a separation at which a body's own motion takes over (s). */
const JOIN_DT = 0.02;

/** Origin state between two samples of one segment, as the sampler interpolates it (cubic Hermite, slerp). */
function originAt(a: OriginSample, b: OriginSample, t: number): OriginSample {
  const h = b.t - a.t;
  const u = (t - a.t) / h;
  const u2 = u * u;
  const u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1;
  const h10 = u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2;
  const h11 = u3 - u2;
  const P = (k: 'x' | 'y' | 'z') => h00 * a.p[k] + h10 * h * a.v[k] + h01 * b.p[k] + h11 * h * b.v[k];
  const Vl = (k: 'x' | 'y' | 'z') => a.v[k] + (b.v[k] - a.v[k]) * u;
  return { t, p: { x: P('x'), y: P('y'), z: P('z') }, v: { x: Vl('x'), y: Vl('y'), z: Vl('z') }, q: qslerp(a.q, b.q, u), m: a.m + (b.m - a.m) * u };
}

/** A body's own samples (already origin poses), for bodies whose motion is authored directly. */
export interface DirectSegment {
  bodies: BodyId[];
  origins: OriginSample[];
}

/**
 * Assemble the track of `body` from every segment that carries it (sorted by start time;
 * where two segments meet at a separation instant the earlier one's sample is kept).
 */
export function assembleTrack(body: BodyId, segments: Segment[], direct: DirectSegment[], exists: [number, number], attached: BodyTrack['attached'], opts: { minDt?: number } = {}): BodyTrack | null {
  const parts: OriginSample[][] = [];
  for (const s of segments) if (s.bodies.includes(body) && s.samples.length) parts.push(segmentOrigins(s.samples));
  for (const d of direct) if (d.bodies.includes(body) && d.origins.length) parts.push(d.origins);
  if (!parts.length) return null;
  parts.sort((a, b) => a[0].t - b[0].t || a[a.length - 1].t - b[b.length - 1].t);
  const all: OriginSample[] = [];
  const minDt = opts.minDt ?? 1e-6;
  for (const p of parts) {
    for (let i = 0; i < p.length; i++) {
      const s = p[i];
      const last = all[all.length - 1];
      if (last && s.t <= last.t + minDt) {
        // A separation: the new segment starts where the old one ends, at the same pose but with
        // an impulsive change of velocity (springs, pushers, a tumble kick that swings the model
        // origin far from the centre of mass). The earlier sample is kept; a sample JOIN_DT later,
        // on the new segment's own path, confines the jump to that sliver, so the cubic Hermite
        // interval does not spread the old velocity over the new segment's first step.
        const next = p[i + 1];
        if (i === 0 && next && next.t - s.t > 4 * JOIN_DT && Math.hypot(s.v.x - last.v.x, s.v.y - last.v.y, s.v.z - last.v.z) > 1e-3) all.push(originAt(s, next, s.t + JOIN_DT));
        continue;
      }
      all.push(s);
    }
  }
  // clip to the existence interval (keep one sample on each side so the sampler can interpolate)
  let i0 = 0;
  while (i0 < all.length - 2 && all[i0 + 1].t <= exists[0]) i0++;
  let i1 = all.length - 1;
  while (i1 > i0 + 1 && all[i1 - 1].t >= exists[1]) i1--;
  const list = all.slice(i0, i1 + 1);
  const n = list.length;
  const t = new Float64Array(n);
  const pos = new Float64Array(3 * n);
  const vel = new Float64Array(3 * n);
  const quat = new Float64Array(4 * n);
  const mass = new Float64Array(n);
  let prevQ: Q | null = null;
  for (let i = 0; i < n; i++) {
    const s = list[i];
    t[i] = s.t;
    pos[3 * i] = s.p.x;
    pos[3 * i + 1] = s.p.y;
    pos[3 * i + 2] = s.p.z;
    vel[3 * i] = s.v.x;
    vel[3 * i + 1] = s.v.y;
    vel[3 * i + 2] = s.v.z;
    // keep quaternion signs continuous (slerp takes the short way either way, but this keeps the arrays tidy)
    let q = s.q;
    if (prevQ && prevQ.x * q.x + prevQ.y * q.y + prevQ.z * q.z + prevQ.w * q.w < 0) q = { x: -q.x, y: -q.y, z: -q.z, w: -q.w };
    const l = Math.hypot(q.x, q.y, q.z, q.w);
    quat[4 * i] = q.x / l;
    quat[4 * i + 1] = q.y / l;
    quat[4 * i + 2] = q.z / l;
    quat[4 * i + 3] = q.w / l;
    prevQ = q;
    mass[i] = s.m;
  }
  return { id: body, t, pos, vel, quat, exists, attached, mass };
}

/**
 * Thin out a dense sample list: keep a sample when the time since the last kept one reaches
 * `dt`, or when the attitude has turned more than `maxAngle` rad, always keeping the ends.
 */
export function decimate(samples: Sample[], dt: number, maxAngle = 0.05): Sample[] {
  if (samples.length <= 2) return samples;
  const out: Sample[] = [samples[0]];
  for (let i = 1; i < samples.length - 1; i++) {
    const last = out[out.length - 1];
    const s = samples[i];
    const d = Math.abs(last.q.x * s.q.x + last.q.y * s.q.y + last.q.z * s.q.z + last.q.w * s.q.w);
    const ang = 2 * Math.acos(Math.min(1, d));
    if (s.t - last.t >= dt - 1e-9 || ang > maxAngle) out.push(s);
  }
  out.push(samples[samples.length - 1]);
  return out;
}
