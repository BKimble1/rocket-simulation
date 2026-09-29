/**
 * Snapshots of the effects source at a mission time: a private copy of the emitters (the source
 * may reuse its output objects), grouped into clusters (engines of one kind firing side by side,
 * whose plumes merge), plus the pad state. Particles read the snapshot at their spawn time, so
 * the cache below is keyed by the spawn tick (1/240 s grid shared by every particle species).
 */
import * as THREE from 'three';
import type { EffectsSource, Emitter, EmitterKind, PadState, PlasmaSource } from './input';

export const TICK = 240;

export interface EmitterSnap {
  id: string;
  kind: EmitterKind;
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  exitRadius: number;
  throttle: number;
  ambientPressure: number;
  altitude: number;
  airVel: THREE.Vector3;
  gg: { pos: THREE.Vector3; dir: THREE.Vector3 } | null;
  sinceIgnition: number;
}

export interface ClusterSnap {
  kind: EmitterKind;
  /** Throttle-weighted centre of the nozzle exits (frame I). */
  centroid: THREE.Vector3;
  /** Mean exhaust direction (unit). */
  dir: THREE.Vector3;
  /** Radius enclosing the exits around the centroid, and the equivalent single-exit radius. */
  Rc: number;
  Req: number;
  /** Mean throttle of the firing members and the sum of throttle x exit area. */
  throttle: number;
  flow: number;
  count: number;
  ambientPressure: number;
  altitude: number;
  airVel: THREE.Vector3;
  sinceIgnition: number;
  members: number[];
}

export interface Snapshot {
  t: number;
  emitters: EmitterSnap[];
  clusters: ClusterSnap[];
  pad: PadState;
}

const makeEmitterSnap = (): EmitterSnap => ({
  id: '',
  kind: 'kerolox-sl',
  pos: new THREE.Vector3(),
  dir: new THREE.Vector3(0, -1, 0),
  exitRadius: 0.5,
  throttle: 0,
  ambientPressure: 0,
  altitude: 0,
  airVel: new THREE.Vector3(),
  gg: null,
  sinceIgnition: 0,
});

const makeCluster = (): ClusterSnap => ({
  kind: 'kerolox-sl',
  centroid: new THREE.Vector3(),
  dir: new THREE.Vector3(),
  Rc: 1,
  Req: 1,
  throttle: 0,
  flow: 0,
  count: 0,
  ambientPressure: 0,
  altitude: 0,
  airVel: new THREE.Vector3(),
  sinceIgnition: 0,
  members: [],
});

export function copyEmitter(e: Emitter, o: EmitterSnap): EmitterSnap {
  o.id = e.id;
  o.kind = e.kind;
  o.pos.copy(e.pos);
  o.dir.copy(e.dir);
  if (o.dir.lengthSq() < 1e-12) o.dir.set(0, -1, 0);
  o.dir.normalize();
  o.exitRadius = Math.max(0.005, e.exitRadius);
  o.throttle = Math.max(0, Math.min(1.2, e.throttle));
  o.ambientPressure = Math.max(0, e.ambientPressure);
  o.altitude = e.altitude;
  o.airVel.copy(e.airVel);
  if (e.ggExhaust) {
    if (!o.gg) o.gg = { pos: new THREE.Vector3(), dir: new THREE.Vector3() };
    o.gg.pos.copy(e.ggExhaust.pos);
    o.gg.dir.copy(e.ggExhaust.dir).normalize();
  } else o.gg = null;
  o.sinceIgnition = e.sinceIgnition;
  return o;
}

/** Kinds whose plumes merge into one column when several nozzles fire side by side. */
const CLUSTERED: Record<EmitterKind, boolean> = {
  'kerolox-sl': true,
  'kerolox-vac': true,
  solid: true,
  hypergolic: false,
  'cold-gas': false,
  mono: false,
};

const va = new THREE.Vector3();

/** Group firing emitters of one kind that sit close together and point the same way. */
export function buildClusters(em: EmitterSnap[], out: ClusterSnap[], pool: ClusterSnap[]): ClusterSnap[] {
  out.length = 0;
  const n = em.length;
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  for (let i = 0; i < n; i++) {
    const a = em[i];
    if (!CLUSTERED[a.kind] || a.throttle <= 0.005) continue;
    for (let j = i + 1; j < n; j++) {
      const b = em[j];
      if (b.kind !== a.kind || b.throttle <= 0.005) continue;
      const reach = 3 * Math.max(a.exitRadius, b.exitRadius) + 2.5;
      if (a.pos.distanceToSquared(b.pos) > reach * reach) continue;
      if (a.dir.dot(b.dir) < 0.6) continue;
      parent[find(j)] = find(i);
    }
  }
  const roots = new Map<number, ClusterSnap>();
  for (let i = 0; i < n; i++) {
    const e = em[i];
    if (!CLUSTERED[e.kind] || e.throttle <= 0.005) continue;
    const r = find(i);
    let c = roots.get(r);
    if (!c) {
      c = pool[out.length] ?? (pool[out.length] = makeCluster());
      c.kind = e.kind;
      c.centroid.set(0, 0, 0);
      c.dir.set(0, 0, 0);
      c.airVel.copy(e.airVel);
      c.ambientPressure = e.ambientPressure;
      c.altitude = e.altitude;
      c.sinceIgnition = e.sinceIgnition;
      c.throttle = 0;
      c.flow = 0;
      c.count = 0;
      c.members.length = 0;
      roots.set(r, c);
      out.push(c);
    }
    const w = e.throttle * e.exitRadius * e.exitRadius;
    c.centroid.addScaledVector(e.pos, w);
    c.dir.addScaledVector(e.dir, w);
    c.flow += w;
    c.throttle += e.throttle;
    c.count++;
    c.sinceIgnition = Math.min(c.sinceIgnition, e.sinceIgnition);
    c.members.push(i);
  }
  for (const c of out) {
    c.centroid.multiplyScalar(1 / c.flow);
    c.dir.normalize();
    c.throttle /= c.count;
    let rc = 0;
    let area = 0;
    for (const i of c.members) {
      const e = em[i];
      // distance across the flow direction plus the exit radius
      va.subVectors(e.pos, c.centroid);
      va.addScaledVector(c.dir, -va.dot(c.dir));
      rc = Math.max(rc, va.length() + e.exitRadius);
      area += e.exitRadius * e.exitRadius;
    }
    c.Rc = rc;
    c.Req = Math.sqrt(area);
  }
  return out;
}

/** Bounded cache of snapshots by spawn tick. */
export class SnapshotCache {
  private map = new Map<number, Snapshot>();
  private free: Snapshot[] = [];
  private tmpEmitters: Emitter[] = [];
  source: EffectsSource | null = null;

  constructor(private cap = 1024) {}

  clear() {
    for (const s of this.map.values()) this.free.push(s);
    this.map.clear();
  }

  setSource(s: EffectsSource | null) {
    if (s !== this.source) {
      this.clear();
      this.source = s;
    }
  }

  /** Snapshot at an exact spawn tick (t = tick / TICK). */
  atTick(tick: number): Snapshot | null {
    const hit = this.map.get(tick);
    if (hit) return hit;
    if (!this.source) return null;
    const s = this.compute(tick / TICK, this.take())!;
    if (this.map.size >= this.cap) {
      const oldest = this.map.keys().next().value as number;
      this.free.push(this.map.get(oldest)!);
      this.map.delete(oldest);
    }
    this.map.set(tick, s);
    return s;
  }

  private take(): Snapshot {
    return this.free.pop() ?? { t: 0, emitters: [], clusters: [], pad: { venting: 0, deluge: 0, holddown: 0, arms: 0 } };
  }

  /** Fill a snapshot for time t (not cached). */
  compute(t: number, s: Snapshot): Snapshot | null {
    const src = this.source;
    if (!src) return null;
    s.t = t;
    this.tmpEmitters.length = 0;
    const list = src.emittersAt(t, this.tmpEmitters);
    const snaps = s.emitters;
    let n = 0;
    for (const e of list) {
      const o = snaps[n] ?? (snaps[n] = makeEmitterSnap());
      copyEmitter(e, o);
      n++;
    }
    snaps.length = n;
    const pool = (s as Snapshot & { _pool?: ClusterSnap[] })._pool ?? ((s as Snapshot & { _pool?: ClusterSnap[] })._pool = []);
    buildClusters(snaps, s.clusters, pool);
    src.padAt(t, s.pad);
    return s;
  }

  plasmaAt(t: number, out: PlasmaSource[]): PlasmaSource[] {
    out.length = 0;
    if (!this.source) return out;
    return this.source.plasmaAt(t, out);
  }
}
