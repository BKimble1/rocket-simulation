/**
 * Channel recorder: piecewise-linear keyframes per ChannelId, strictly increasing times,
 * simplified at the end (points that a straight line through their neighbours reproduces
 * within a tolerance are dropped).
 */
import type { Channel, ChannelId } from '../types';

const TOL: Partial<Record<ChannelId, number>> = {
  's1.lox': 2e-4,
  's1.rp1': 2e-4,
  's2.lox': 2e-4,
  's2.rp1': 2e-4,
  's1.gimbalPitch': 0.01,
  's1.gimbalYaw': 0.01,
  's2.gimbalPitch': 0.01,
  's1.finDeflect': 0.05,
};

export class Channels {
  private data = new Map<ChannelId, { t: number[]; v: number[] }>();

  /** Add a keyframe. A key at the same time as the last one replaces its value; earlier keys are ignored. */
  key(id: ChannelId, t: number, v: number) {
    if (!Number.isFinite(v) || !Number.isFinite(t)) throw new Error(`channel ${id}: non-finite key at ${t}`);
    let c = this.data.get(id);
    if (!c) {
      c = { t: [], v: [] };
      this.data.set(id, c);
    }
    const n = c.t.length;
    if (n && t < c.t[n - 1] - 1e-9) return;
    if (n && Math.abs(t - c.t[n - 1]) <= 1e-9) {
      c.v[n - 1] = v;
      return;
    }
    c.t.push(t);
    c.v.push(v);
  }

  /** A step-free ramp from the channel's current value to `v` between t0 and t1. */
  ramp(id: ChannelId, t0: number, t1: number, v: number) {
    const cur = this.valueAt(id, t0);
    this.key(id, t0, cur);
    this.key(id, t1, v);
  }

  /** Smooth (ease-in-out) ramp drawn with several keys. */
  ease(id: ChannelId, t0: number, t1: number, v: number, keys = 8) {
    const cur = this.valueAt(id, t0);
    for (let i = 0; i <= keys; i++) {
      const u = i / keys;
      const s = u * u * (3 - 2 * u);
      this.key(id, t0 + (t1 - t0) * u, cur + (v - cur) * s);
    }
  }

  valueAt(id: ChannelId, t: number): number {
    const c = this.data.get(id);
    if (!c || !c.t.length) return 0;
    const n = c.t.length;
    if (t <= c.t[0]) return c.v[0];
    if (t >= c.t[n - 1]) return c.v[n - 1];
    let i = 0;
    while (i < n - 2 && c.t[i + 1] <= t) i++;
    const u = (t - c.t[i]) / (c.t[i + 1] - c.t[i]);
    return c.v[i] + (c.v[i + 1] - c.v[i]) * u;
  }

  has(id: ChannelId) {
    return this.data.has(id);
  }

  build(): Partial<Record<ChannelId, Channel>> {
    const out: Partial<Record<ChannelId, Channel>> = {};
    for (const [id, c] of this.data) out[id] = simplify(c.t, c.v, TOL[id] ?? 1e-4);
    return out;
  }
}

/** Equal up to floating-point noise (a level carried across a separation may differ in the last bit). */
const same = (a: number, b: number) => Math.abs(a - b) <= 1e-12;

function simplify(t: number[], v: number[], tol: number): Channel {
  const n = t.length;
  if (n <= 2) return { t: [...t], v: [...v] };
  const keepT: number[] = [t[0]];
  const keepV: number[] = [v[0]];
  let a = 0;
  for (let i = 1; i < n - 1; i++) {
    // can we drop i (line from the last kept point a to i+1 reproduces every point between)?
    // The first and last keys of an exactly constant run are always kept, so a level that
    // stops changing (a tank after cutoff, a throttle at zero) is never smeared into it.
    const corner = same(v[i], v[i - 1]) !== same(v[i], v[i + 1]);
    let ok = !corner && i - a < 400;
    const t0 = t[a];
    const t1 = t[i + 1];
    for (let j = a + 1; ok && j <= i; j++) {
      const u = (t[j] - t0) / (t1 - t0);
      const lin = v[a] + (v[i + 1] - v[a]) * u;
      if (Math.abs(lin - v[j]) > tol) {
        ok = false;
        break;
      }
    }
    if (!ok) {
      keepT.push(t[i]);
      keepV.push(v[i]);
      a = i;
    }
  }
  keepT.push(t[n - 1]);
  keepV.push(v[n - 1]);
  return { t: keepT, v: keepV };
}
