/**
 * Mission-building context: collects the craft segments, directly authored segments, channels,
 * events, facts and body bookkeeping while a mission's reference trajectory is computed, and
 * turns them into the MissionTimeline pieces at the end.
 */
import type { BodyId } from '../../vehicle/parts';
import type { BodyTrack, EventKind, MissionEvent } from '../types';
import { Channels } from './channels';
import type { Craft, Env } from './craft';
import { assembleTrack, type DirectSegment } from './tracks';

export class Ctx {
  env: Env;
  ch = new Channels();
  events: MissionEvent[] = [];
  facts: Record<string, number> = {};
  direct: DirectSegment[] = [];
  exists: Partial<Record<BodyId, [number, number]>> = {};
  attached: Partial<Record<BodyId, BodyTrack['attached']>> = {};
  /** Last recording time per craft id (for decimated recording). */
  private lastRec = new Map<number, number>();

  constructor(moonPhase0: number | null = null) {
    this.env = { moonPhase0, segments: [] };
  }

  ev(id: string, t: number, label: string, kind: EventKind, bodies: BodyId[], sound?: MissionEvent['sound']): number {
    if (!Number.isFinite(t)) throw new Error(`event ${id} has no time`);
    this.events.push(sound ? { id, t, label, kind, bodies, sound } : { id, t, label, kind, bodies });
    return t;
  }

  evt(id: string): number {
    const e = this.events.find((x) => x.id === id);
    if (!e) throw new Error(`event ${id} missing`);
    return e.t;
  }

  fact(k: string, v: number) {
    if (!Number.isFinite(v)) throw new Error(`fact ${k} is not finite`);
    this.facts[k] = v;
  }

  /** Record a craft sample when `every` seconds have passed since its last one (or when forced). */
  rec(c: Craft, every: number, force = false) {
    const last = this.lastRec.get(c.id) ?? -Infinity;
    if (force || c.t - last >= every - 1e-9) {
      c.record();
      this.lastRec.set(c.id, c.t);
    }
  }

  tracks(end: number, bodies: BodyId[]): Partial<Record<BodyId, BodyTrack>> {
    const out: Partial<Record<BodyId, BodyTrack>> = {};
    for (const b of bodies) {
      const ex = this.exists[b] ?? [-Infinity, end];
      const tr = assembleTrack(b, this.env.segments, this.direct, ex, this.attached[b] ?? null);
      if (tr) out[b] = tr;
    }
    return out;
  }

  sortedEvents(): MissionEvent[] {
    return [...this.events].sort((a, b) => a.t - b.t);
  }
}
