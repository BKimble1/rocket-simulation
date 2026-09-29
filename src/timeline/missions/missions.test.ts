/**
 * The six mission timelines: structure (outline vocabulary, ordering, ranges, presentation map),
 * numerical hygiene (no NaN, unit quaternions, increasing sample times, determinism, build
 * time), continuity of attached bodies at separations, and the physical targets of each
 * mission (orbits, landings, splashdowns in water, docking, lunar flyby).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildMission } from '../build';
import { bodyAt, channelAt, makeBodyState, presDuration } from '../sample';
import type { BodyTrack, ChannelId, MissionId, MissionTimeline } from '../types';
import { OUTLINES, MISSION_ORDER } from './outline';
import { BODY_SIZE } from '../../director/shots';
import { PART_IDS, type BodyId } from '../../vehicle/parts';
import { ABORT_TOWER, CAPSULE, E1, E1V, S1, SERVICE_MODULE } from '../../vehicle/spec';
import { FACTS, factKeys } from './facts';
import { MU_EARTH, R_EARTH, R_MOON, latLonOf, moonPosition } from '../../world/frames';
import { LANDING_ZONE } from '../../world/site';
import { kepler } from '../physics/kepler';
import { padLocal, lzMiss } from '../physics/landing';
import { PAYLOAD_COM, fairingHalf } from '../physics/vehicle';
import { telemetryAt } from '../physics/telemetry';

const TL: Partial<Record<MissionId, MissionTimeline>> = {};
const BUILD_MS: Partial<Record<MissionId, number>> = {};

/** CPU time (ms) when the runtime reports it (robust on a busy machine), wall time otherwise. */
function cpuNow(): number {
  const p = (globalThis as { process?: { cpuUsage?: () => { user: number; system: number } } }).process;
  if (p?.cpuUsage) {
    const u = p.cpuUsage();
    return (u.user + u.system) / 1000;
  }
  return performance.now();
}

beforeAll(() => {
  for (const id of MISSION_ORDER) {
    const t0 = cpuNow();
    TL[id] = buildMission(id);
    BUILD_MS[id] = cpuNow() - t0;
  }
}, 300_000);

const tl = (id: MissionId) => TL[id]!;
const S = makeBodyState();
const posAt = (tr: BodyTrack, t: number) => bodyAt(tr, t, S).pos.clone();
/**
 * A body's own centre in its model frame: the mass model's centre where the director's framing
 * centre (BODY_SIZE) is not the body's centre of mass: a fairing half's centre lies off the axis,
 * and the suborbital research capsule rides on the booster's adapter, 19 m below the orbital
 * capsule's station.
 */
const localCentre = (m: MissionTimeline, id: BodyId): THREE.Vector3 => {
  if (id === 'fairingA' || id === 'fairingB') {
    const c = fairingHalf(id === 'fairingA' ? 'A' : 'B', 1).c;
    return new THREE.Vector3(c.x, c.y, c.z);
  }
  if (id === 'capsule' && m.payload === 'researchCapsule') return new THREE.Vector3(0, PAYLOAD_COM.researchCapsule.y, 0);
  return new THREE.Vector3(0, BODY_SIZE[id].centreY, 0);
};
const centreAt = (m: MissionTimeline, id: BodyId, tr: BodyTrack, t: number) => {
  bodyAt(tr, t, S);
  return localCentre(m, id).applyQuaternion(S.quat).add(S.pos);
};
const ev = (m: MissionTimeline, id: string) => {
  const e = m.events.find((x) => x.id === id);
  if (!e) throw new Error(`${m.id}: event ${id} missing`);
  return e.t;
};

// ───────────────────────────── PNG water masks (decoded with node:zlib, test-only) ─────────────────────────────

interface Img {
  w: number;
  h: number;
  ch: number;
  data: Uint8Array;
}
async function loadPng(rel: string): Promise<Img> {
  const load = (name: string) => import(/* @vite-ignore */ name) as Promise<Record<string, unknown>>;
  const fs = (await load('node:' + 'fs')) as unknown as { readFileSync(p: string): Uint8Array & { readUInt32BE(o: number): number; toString(enc: string, a: number, b: number): string; subarray(a: number, b: number): Uint8Array } };
  const zlib = (await load('node:' + 'zlib')) as unknown as { inflateSync(b: Uint8Array): Uint8Array };
  const buf = fs.readFileSync(rel);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let p = 8;
  let w = 0;
  let h = 0;
  let ct = 0;
  const idat: Uint8Array[] = [];
  while (p < buf.length) {
    const len = dv.getUint32(p);
    const type = String.fromCharCode(buf[p + 4], buf[p + 5], buf[p + 6], buf[p + 7]);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      const d2 = new DataView(data.buffer, data.byteOffset, data.byteLength);
      w = d2.getUint32(0);
      h = d2.getUint32(4);
      ct = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  const ch = ct === 0 ? 1 : ct === 2 ? 3 : ct === 4 ? 2 : 4;
  const total = idat.reduce((s, a) => s + a.length, 0);
  const all = new Uint8Array(total);
  let o = 0;
  for (const a of idat) {
    all.set(a, o);
    o += a.length;
  }
  const raw = zlib.inflateSync(all);
  const stride = w * ch;
  const out = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const r = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? out[r + x - ch] : 0;
      const b = y > 0 ? out[r - stride + x] : 0;
      const c = x >= ch && y > 0 ? out[r - stride + x - ch] : 0;
      let v = raw[src + x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a);
        const pb = Math.abs(pp - b);
        const pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[r + x] = v & 255;
    }
  }
  return { w, h, ch, data: out };
}

// ───────────────────────────── every mission ─────────────────────────────

describe.each(MISSION_ORDER)('%s timeline', (id) => {
  it('builds quickly', () => {
    // brief: < 400 ms per mission on an idle machine; the test allows 1 s of CPU time
    expect(BUILD_MS[id]!).toBeLessThan(1000);
  });

  it('is deterministic (bit-identical rebuild)', () => {
    const a = tl(id);
    const b = buildMission(id);
    expect(Object.keys(b.bodies)).toEqual(Object.keys(a.bodies));
    for (const k of Object.keys(a.bodies) as BodyId[]) {
      const x = a.bodies[k]!;
      const y = b.bodies[k]!;
      for (const f of ['t', 'pos', 'vel', 'quat', 'mass'] as const) {
        expect(y[f].length).toBe(x[f].length);
        for (let i = 0; i < x[f].length; i++) if (x[f][i] !== y[f][i]) throw new Error(`${id} ${k}.${f}[${i}] differs`);
      }
    }
    expect(JSON.stringify(b.channels)).toBe(JSON.stringify(a.channels));
    expect(JSON.stringify(b.events)).toBe(JSON.stringify(a.events));
    expect(JSON.stringify(b.facts)).toBe(JSON.stringify(a.facts));
    expect(JSON.stringify(b.pres)).toBe(JSON.stringify(a.pres));
  });

  it('has clean tracks: increasing times, unit quaternions, no NaN', () => {
    const m = tl(id);
    for (const [k, tr] of Object.entries(m.bodies) as [BodyId, BodyTrack][]) {
      expect(tr.id).toBe(k);
      const n = tr.t.length;
      expect(n).toBeGreaterThan(1);
      expect(tr.pos.length).toBe(3 * n);
      expect(tr.vel.length).toBe(3 * n);
      expect(tr.quat.length).toBe(4 * n);
      expect(tr.mass.length).toBe(n);
      for (let i = 0; i < n; i++) {
        if (i > 0 && !(tr.t[i] > tr.t[i - 1])) throw new Error(`${id} ${k}: time not increasing at ${i}`);
        const q = Math.hypot(tr.quat[4 * i], tr.quat[4 * i + 1], tr.quat[4 * i + 2], tr.quat[4 * i + 3]);
        if (Math.abs(q - 1) > 1e-9) throw new Error(`${id} ${k}: quaternion not unit at ${i}`);
        for (let j = 0; j < 3; j++) if (!Number.isFinite(tr.pos[3 * i + j]) || !Number.isFinite(tr.vel[3 * i + j])) throw new Error(`${id} ${k}: NaN at ${i}`);
        if (!(tr.mass[i] > 0)) throw new Error(`${id} ${k}: bad mass at ${i}`);
      }
      expect(tr.exists[1]).toBeGreaterThan(tr.exists[0]);
    }
    for (const [k, v] of Object.entries(m.facts)) if (!Number.isFinite(v)) throw new Error(`${id}: fact ${k} is ${v}`);
  });

  it('has smooth attitudes (no instantaneous flips)', () => {
    const m = tl(id);
    for (const [k, tr] of Object.entries(m.bodies) as [BodyId, BodyTrack][]) {
      if (k === 'fairingA' || k === 'fairingB') continue; // tumbling halves
      for (let i = 1; i < tr.t.length; i++) {
        const d = Math.abs(tr.quat[4 * i] * tr.quat[4 * i - 4] + tr.quat[4 * i + 1] * tr.quat[4 * i - 3] + tr.quat[4 * i + 2] * tr.quat[4 * i - 2] + tr.quat[4 * i + 3] * tr.quat[4 * i - 1]);
        const ang = (2 * Math.acos(Math.min(1, d)) * 180) / Math.PI;
        const dt = tr.t[i] - tr.t[i - 1];
        // at most ~15 deg/s (booster flip 12 deg/s), or a few degrees across a coarse coast step
        if (ang > Math.max(4, 16 * dt)) throw new Error(`${id} ${k}: attitude jumps ${ang.toFixed(1)} deg in ${dt.toFixed(2)} s at t=${tr.t[i].toFixed(1)}`);
      }
    }
  });

  it('uses the outline vocabulary: all events, phases and branch phases in order', () => {
    const m = tl(id);
    const O = OUTLINES[id];
    const ids = m.events.map((e) => e.id);
    for (const e of O.events) expect(ids, `event ${e}`).toContain(e);
    expect(new Set(ids).size).toBe(ids.length);
    for (let i = 1; i < m.events.length; i++) expect(m.events[i].t).toBeGreaterThanOrEqual(m.events[i - 1].t);
    // main-line events in outline order. The outline lists the throttle bucket after max-q and
    // the grid-fin deployment first among the booster events; physically the bucket comes
    // before the peak (the lesson text says so) and the fins open after the boostback, so those
    // three are checked separately. Branch events are their own storyline.
    const branchIds = new Set(['fins-deploy', 'boostback-start', 'boostback-end', 'entry-start', 'entry-end', 'landing-start', 'legs-deploy', 'touchdown']);
    const bucket = new Set(['throttle-down', 'throttle-up']);
    const main = O.events.filter((e) => !branchIds.has(e) && !bucket.has(e));
    for (let i = 1; i < main.length; i++) expect(ev(m, main[i]), `${main[i - 1]} before ${main[i]}`).toBeGreaterThanOrEqual(ev(m, main[i - 1]));
    if (O.events.includes('throttle-down')) {
      expect(ev(m, 'throttle-down')).toBeGreaterThan(ev(m, 'pitch-start'));
      expect(ev(m, 'throttle-up')).toBeGreaterThan(ev(m, 'throttle-down'));
      expect(ev(m, 'throttle-up')).toBeLessThan(ev(m, 'meco'));
    }
    const br = O.events.filter((e) => branchIds.has(e) && e !== 'fins-deploy');
    for (let i = 1; i < br.length; i++) expect(ev(m, br[i]), `${br[i - 1]} before ${br[i]}`).toBeGreaterThanOrEqual(ev(m, br[i - 1]));
    if (O.events.includes('boostback-end')) {
      expect(ev(m, 'fins-deploy')).toBeGreaterThan(ev(m, 'boostback-end'));
      expect(ev(m, 'fins-deploy')).toBeLessThan(ev(m, 'entry-start'));
    } else if (O.events.includes('fins-deploy')) expect(ev(m, 'fins-deploy')).toBeLessThan(ev(m, 'landing-start'));
    for (const e of m.events) {
      expect(e.t).toBeGreaterThanOrEqual(m.start);
      expect(e.t).toBeLessThanOrEqual(m.end);
      expect(e.label).not.toMatch(/—/);
    }
    // phases: ids, titles and order exactly as outlined, contiguous, covering the mission
    expect(m.phases.map((p) => p.id)).toEqual(O.phases.map((p) => p.id));
    expect(m.phases.map((p) => p.title)).toEqual(O.phases.map((p) => p.title));
    expect(m.phases[0].start).toBe(m.start);
    expect(m.phases[m.phases.length - 1].end).toBe(m.end);
    for (let i = 0; i < m.phases.length; i++) {
      const p = m.phases[i];
      expect(p.end, p.id).toBeGreaterThan(p.start);
      if (i > 0) expect(p.start).toBe(m.phases[i - 1].end);
      for (const part of p.activeParts) expect(PART_IDS as readonly string[]).toContain(part);
      expect(p.activeParts.length, p.id).toBeGreaterThan(0);
    }
    if (O.branch) {
      expect(m.branches.length).toBe(1);
      const b = m.branches[0];
      expect(b.id).toBe(O.branch.id);
      expect(b.phases.map((p) => p.id)).toEqual(O.branch.phases.map((p) => p.id));
      expect(b.phases.map((p) => p.title)).toEqual(O.branch.phases.map((p) => p.title));
      for (let i = 1; i < b.phases.length; i++) expect(b.phases[i].start).toBe(b.phases[i - 1].end);
      expect(b.shots.length).toBeGreaterThan(2);
    } else expect(m.branches.length).toBe(0);
  });

  it('keeps channels in range with increasing key times', () => {
    const m = tl(id);
    const frac: ChannelId[] = ['s1.center.throttle', 's1.outer.throttle', 's1.lox', 's1.rp1', 's1.legs', 's1.fins', 's1.rcs', 's1.entryGlow', 's2.throttle', 's2.lox', 's2.rp1', 's2.rcs', 'fairing.open', 'sat.arrays', 'sat.antenna', 'sat.rcs', 'sat.apogee.throttle', 'cap.drogue', 'cap.main', 'cap.plasma', 'cap.char', 'cap.noseCone', 'cap.rcs', 'cap.docked', 'sm.throttle', 'sm.arrays', 'sm.rcs', 'les.motor', 'pad.venting', 'pad.deluge', 'pad.holddown', 'pad.arms', 'pad.chilldown'];
    const deg: Partial<Record<ChannelId, number>> = { 's1.gimbalPitch': E1.gimbalRangeDeg, 's1.gimbalYaw': E1.gimbalRangeDeg, 's2.gimbalPitch': E1V.gimbalRangeDeg, 's1.finDeflect': 20 };
    for (const [k, ch] of Object.entries(m.channels) as [ChannelId, { t: number[]; v: number[] }][]) {
      expect(ch.t.length).toBe(ch.v.length);
      for (let i = 0; i < ch.t.length; i++) {
        if (i > 0 && !(ch.t[i] > ch.t[i - 1])) throw new Error(`${id} ${k}: key times not increasing at ${i}`);
        const v = ch.v[i];
        if (!Number.isFinite(v)) throw new Error(`${id} ${k}: NaN`);
        if (frac.includes(k) && (v < -1e-9 || v > 1 + 1e-9)) throw new Error(`${id} ${k}: ${v} out of 0..1 at t=${ch.t[i]}`);
        if (deg[k] !== undefined && Math.abs(v) > deg[k]! + 1e-9) throw new Error(`${id} ${k}: ${v} out of range`);
      }
    }
    // tank levels only go down
    for (const k of ['s1.lox', 's2.lox'] as ChannelId[]) {
      const ch = m.channels[k];
      if (!ch) continue;
      for (let i = 1; i < ch.v.length; i++) expect(ch.v[i]).toBeLessThanOrEqual(ch.v[i - 1] + 1e-9);
    }
  });

  it('has a contiguous, monotonic presentation map of 8 to 15 minutes', () => {
    const m = tl(id);
    const P = m.pres;
    expect(P[0].p0).toBe(0);
    expect(P[0].m0).toBe(m.start);
    expect(P[P.length - 1].m1).toBeCloseTo(m.end, 6);
    for (let i = 0; i < P.length; i++) {
      expect(P[i].p1).toBeGreaterThan(P[i].p0);
      expect(P[i].m1).toBeGreaterThan(P[i].m0);
      if (i > 0) {
        expect(P[i].p0).toBe(P[i - 1].p1);
        expect(P[i].m0).toBe(P[i - 1].m1);
      }
      if (P[i].omitted) expect(P[i].note).toBeTruthy();
      const rate = (P[i].m1 - P[i].m0) / (P[i].p1 - P[i].p0);
      if (Math.abs(rate - 1) > 1e-6) expect(P[i].note, `segment ${i} runs at x${rate.toFixed(1)} without a note`).toBeTruthy();
      if (P[i].note) expect(P[i].note).not.toMatch(/—/);
    }
    const min = presDuration(P) / 60;
    expect(min).toBeGreaterThan(8);
    expect(min).toBeLessThan(15);
  });

  it('has a gap-free shot list covering the mission', () => {
    const m = tl(id);
    expect(m.shots[0].from).toBeLessThanOrEqual(m.start);
    expect(m.shots[m.shots.length - 1].to).toBeGreaterThanOrEqual(m.end);
    for (let i = 0; i < m.shots.length; i++) {
      const s = m.shots[i];
      expect(s.to).toBeGreaterThan(s.from);
      if (i > 0) expect(s.from).toBe(m.shots[i - 1].to);
      expect(m.bodies[s.subject], `shot subject ${s.subject}`).toBeTruthy();
      expect(s.kind).not.toBe('map');
    }
  });

  it('keeps attached bodies together and separates them without a jump', () => {
    const m = tl(id);
    for (const [k, tr] of Object.entries(m.bodies) as [BodyId, BodyTrack][]) {
      const at = tr.attached;
      if (!at) continue;
      const host = m.bodies[at.to];
      expect(host, `${k} rides on ${at.to}`).toBeTruthy();
      const t0 = Math.max(tr.exists[0], host!.exists[0], tr.t[0], host!.t[0]);
      const t1 = Math.min(at.until, tr.exists[1], host!.exists[1]);
      // the shared model frame: same origin while attached (the station carries the docked capsule at its port instead)
      if (at.to !== 'station') {
        for (let i = 0; i <= 20; i++) {
          const t = t0 + ((t1 - t0) * i) / 20 - (i === 20 ? 0.05 : 0);
          const d = posAt(tr, t).distanceTo(posAt(host!, t));
          if (d > 0.05) throw new Error(`${id}: ${k} and ${at.to} apart by ${d.toFixed(3)} m at t=${t.toFixed(1)}`);
        }
      }
      if (at.until < tr.exists[1] - 1) {
        // continuity at the separation instant
        const eps = 1e-3;
        const pa = posAt(tr, at.until - eps);
        const pb = posAt(tr, at.until + eps);
        const vel = bodyAt(tr, at.until, S).vel.clone();
        const jump = pb.sub(pa).addScaledVector(vel, -2 * eps).length();
        expect(jump, `${k} teleports at separation`).toBeLessThan(0.05);
        // relative speed of the two bodies' centres a few seconds later. When the host is under
        // thrust (the fairing leaves while the upper stage burns) its own acceleration along its
        // axis would dominate, so the check measures the sideways separation from the host's axis.
        const u = at.until;
        const thrusting = at.to === 'upper' && channelAt(m.channels['s2.throttle']!, u + 2) > 0.05;
        const apart = (t: number) => {
          const off = centreAt(m, k, tr, t).sub(centreAt(m, at.to, host!, t));
          if (!thrusting) return off.length();
          bodyAt(host!, t, S);
          const ax = new THREE.Vector3(0, 1, 0).applyQuaternion(S.quat);
          return off.addScaledVector(ax, -off.dot(ax)).length();
        };
        const vRel = (apart(u + 3) - apart(u + 1)) / 2;
        // abort tower: its own motor; fairing halves: pushed outward ~1.4 m/s and tumbling;
        // undocking springs: about 0.1 m/s (like the docking closing speed); others 0.15-3 m/s
        const band: [number, number] = k === 'les' ? [5, 200] : k === 'fairingA' || k === 'fairingB' ? [0.8, 6] : at.to === 'station' ? [0.05, 0.5] : [0.15, 3];
        expect(vRel, `${k} separates from ${at.to} at ${vRel.toFixed(2)} m/s`).toBeGreaterThan(band[0]);
        expect(vRel).toBeLessThan(band[1]);
      }
    }
  });

  it('reports exactly its documented, stable facts (missions/facts.ts)', () => {
    const m = tl(id);
    expect(Object.keys(m.facts).sort()).toEqual(factKeys(id).sort());
    for (const k of factKeys(id)) {
      expect(FACTS[k].unit.length, k).toBeGreaterThan(0);
      expect(Number.isFinite(m.facts[k]), k).toBe(true);
    }
  });

  it('gives finite telemetry along the storyline', () => {
    const m = tl(id);
    for (const ph of m.phases) {
      const t = (ph.start + ph.end) / 2;
      const s = telemetryAt(m, ph.focus, t);
      if (!s) continue;
      expect(Number.isFinite(s.altitude)).toBe(true);
      expect(Number.isFinite(s.speed)).toBe(true);
      expect(Number.isFinite(s.mach)).toBe(true);
      expect(s.mass).toBeGreaterThan(0);
    }
  });
});

// ───────────────────────────── mission targets ─────────────────────────────

describe('mission targets', () => {
  it('LEO: satellite in a 400 km orbit (perigee above 380 km), inclination 28.5 deg', () => {
    const m = tl('leo');
    expect(m.facts['orbit.periKm']).toBeGreaterThan(380);
    expect(m.facts['orbit.apoKm']).toBeLessThan(420);
    expect(m.facts['orbit.incDeg']).toBeCloseTo(28.5, 1);
    // from the satellite's own track at the end
    const tr = m.bodies.satellite!;
    bodyAt(tr, m.end - 1, S);
    const r = S.pos.length();
    expect(r - R_EARTH).toBeGreaterThan(380e3);
  });

  it('GTO: apogee at 35,786 +- 300 km', () => {
    expect(Math.abs(tl('gto').facts['gto.apoKm'] - 35_786)).toBeLessThan(300);
    expect(tl('gto').facts['gto.periKm']).toBeGreaterThan(150);
  });

  it('boosters land on the landing zone within 10 m at under 2.5 m/s with propellant left', () => {
    for (const id of MISSION_ORDER) expect(OUTLINES[id].recovery, id).toBe(id === 'leo' || id === 'suborbital');
    for (const id of ['leo', 'suborbital'] as MissionId[]) {
      const m = tl(id);
      expect(m.facts['rtls.landingErrorM'], id).toBeLessThan(10);
      expect(m.facts['rtls.touchdownSpeed'], id).toBeLessThan(2.5);
      expect(m.facts['rtls.propLeftKg'], id).toBeGreaterThanOrEqual(0);
      expect(m.facts['rtls.tiltDeg'], id).toBeLessThan(3);
      // the track agrees: the booster stands on the LZ after touchdown
      const tr = m.bodies.booster!;
      const t = ev(m, 'touchdown') + 5;
      bodyAt(tr, t, S);
      const miss = lzMiss({ x: S.pos.x, y: S.pos.y, z: S.pos.z }, t);
      expect(Math.hypot(miss.e, miss.n), id).toBeLessThan(10);
      expect(S.vel.length(), id).toBeLessThan(500); // co-rotating with the Earth (about 409 m/s)
      // propellant channels never go negative (already range-checked) and the landing reserve is real
      expect(channelAt(m.channels['s1.lox'], m.end)).toBeGreaterThanOrEqual(0);
    }
    expect(LANDING_ZONE.radius).toBeGreaterThan(10);
  });

  it('expendable boosters burn almost everything', () => {
    for (const id of ['gto', 'station', 'lunar'] as MissionId[]) expect(tl(id).facts['meco.s1PropLeft'] / S1.propellant).toBeLessThan(0.01);
  });

  it('capsules splash down in water at under 10 m/s', async () => {
    // suborbital: offshore east of the pad, checked on the local coast distance map (land > 0)
    const sdf = await loadPng('public/textures/site/coast_sdf.png');
    const sub = tl('suborbital');
    const tS = ev(sub, 'splashdown');
    const tr = sub.bodies.capsule!;
    bodyAt(tr, tS + 2, S);
    const l = padLocal({ x: S.pos.x, y: S.pos.y, z: S.pos.z }, tS + 2);
    const N = 2048;
    const ext = 51200;
    const px = Math.round(((l.e + ext) / (2 * ext)) * N - 0.5);
    const pz = Math.round(((-l.n + ext) / (2 * ext)) * N - 0.5);
    const i = (pz * N + px) * sdf.ch;
    const dist = (sdf.data[i] * 256 + sdf.data[i + 1]) * 0.5 - 16384;
    expect(dist, 'signed coast distance at the suborbital splashdown (m, land positive)').toBeLessThan(-200);
    expect(l.e).toBeGreaterThan(0);
    expect(sub.facts['splash.speed']).toBeLessThan(10);
    expect(sub.facts['apogee.km']).toBeGreaterThan(105);
    expect(sub.facts['apogee.km']).toBeLessThan(125);
    // return: in the Atlantic, a few hundred km east of the pad (global water mask, 255 = water)
    const water = await loadPng('public/textures/earth/water_2048.png');
    const ret = tl('return');
    const tR = ev(ret, 'splashdown');
    bodyAt(ret.bodies.capsule!, tR + 2, S);
    const ll = latLonOf(S.pos, tR + 2);
    const wx = Math.floor(((ll.lon + 180) / 360) * water.w) % water.w;
    const wy = Math.floor(((90 - ll.lat) / 180) * water.h);
    expect(water.data[(wy * water.w + wx) * water.ch], `water mask at ${ll.lat.toFixed(2)}, ${ll.lon.toFixed(2)}`).toBeGreaterThan(200);
    expect(ret.facts['splash.eastOfPadKm']).toBeGreaterThan(100);
    expect(ret.facts['splash.eastOfPadKm']).toBeLessThan(600);
    expect(ret.facts['splash.speed']).toBeLessThan(10);
    expect(ret.facts['entry.peakG']).toBeGreaterThan(3.5);
    expect(ret.facts['entry.peakG']).toBeLessThan(5.5);
  }, 60_000);

  it('station: docks with a closing speed of at most 0.12 m/s', () => {
    const m = tl('station');
    expect(m.facts['docking.closingSpeed']).toBeLessThanOrEqual(0.12);
    // from the tracks: capsule port closing on the station port just before contact
    const tc = ev(m, 'soft-capture');
    const cap = m.bodies.capsule!;
    const st = m.bodies.station!;
    const port = (tr: BodyTrack, y: number, t: number) => {
      bodyAt(tr, t, S);
      return new THREE.Vector3(0, y, 0).applyQuaternion(S.quat).add(S.pos);
    };
    const gap = (t: number) => port(cap, m.facts['docking.capsulePortY'], t).distanceTo(port(st, -3.24, t));
    const v = (gap(tc - 6) - gap(tc - 2)) / 4;
    expect(v).toBeGreaterThan(0.03);
    expect(v).toBeLessThanOrEqual(0.12);
    expect(gap(tc + 30)).toBeLessThan(0.05);
    // station frame: +Y zenith, +X along the velocity, the docking port below it (nadir); the
    // capsule approaches from below with its docking system (+Y) pointing up at the port
    for (const t of [m.start + 10, tc - 600, tc + 60]) {
      bodyAt(st, t, S);
      const up = S.pos.clone().normalize();
      const vh = S.vel.clone().addScaledVector(up, -S.vel.dot(up)).normalize();
      const stPos = S.pos.clone();
      expect(new THREE.Vector3(0, 1, 0).applyQuaternion(S.quat).dot(up)).toBeGreaterThan(0.9999);
      expect(new THREE.Vector3(1, 0, 0).applyQuaternion(S.quat).dot(vh)).toBeGreaterThan(0.9999);
      expect(port(st, -3.24, t).sub(stPos).dot(up)).toBeLessThan(-3);
    }
    bodyAt(cap, tc - 60, S);
    const upC = S.pos.clone().normalize();
    expect(new THREE.Vector3(0, 1, 0).applyQuaternion(S.quat).dot(upC)).toBeGreaterThan(0.999);
    expect(port(cap, m.facts['docking.capsulePortY'], tc - 60).sub(port(st, -3.24, tc - 60)).dot(upC)).toBeLessThan(0);
    expect(gap(tc - 600)).toBeGreaterThan(5);
    expect(m.facts['insertion.incDeg']).toBeCloseTo(28.5, 1);
  });

  it('station: the booster is expended to carry the dataset crew stack', () => {
    // the dataset's 17.8 t crew stack does not fit with the RTLS reserve (see station.ts)
    const m = tl('station');
    expect(m.facts['crew.dataset']).toBe(1);
    expect(m.facts['crew.capsuleKg']).toBe(CAPSULE.mass);
    expect(m.facts['crew.serviceModuleKg']).toBe(SERVICE_MODULE.mass);
    expect(m.facts['crew.abortTowerKg']).toBe(ABORT_TOWER.mass);
    expect(m.facts['seco.s2PropLeftKg']).toBeGreaterThan(300);
    expect(m.branches).toHaveLength(0);
    expect(m.variant).toContain('expendable');
    expect(Object.keys(m.facts).some((k) => k.startsWith('rtls.') || k.startsWith('search.rtls'))).toBe(false);
    for (const e of ['fins-deploy', 'boostback-start', 'landing-start', 'legs-deploy', 'touchdown']) expect(m.events.some((x) => x.id === e), e).toBe(false);
    // no landing legs or grid fins on it
    expect(channelAt(m.channels['s1.legs'], m.end)).toBe(0);
    expect(channelAt(m.channels['s1.fins'], m.end)).toBe(0);
  });

  it('expended boosters coast over apogee and fall into the ocean downrange', async () => {
    const water = await loadPng('public/textures/earth/water_2048.png');
    for (const id of ['gto', 'station', 'lunar'] as MissionId[]) {
      const m = tl(id);
      const tr = m.bodies.booster!;
      const tEnd = tr.exists[1];
      expect(tEnd, id).toBeCloseTo(m.facts['boosterImpact.t'], 6);
      const s = telemetryAt(m, 'booster', tEnd)!;
      // the centre of mass reaches the sea (telemetry reads the nozzle-exit plane, within a body length)
      bodyAt(tr, tEnd, S);
      const com = new THREE.Vector3(0, 21, 0).applyQuaternion(S.quat).add(S.pos);
      expect(Math.abs(com.length() - R_EARTH), id).toBeLessThan(30);
      expect(s.speed, id).toBeLessThan(500); // slowed by the air, moving with the rotating Earth
      expect(s.groundSpeed, id).toBeLessThan(80);
      expect(m.facts['boosterImpact.downrangeKm'], id).toBeGreaterThan(500);
      expect(m.facts['boosterImpact.downrangeKm'], id).toBeLessThan(1200);
      expect(Math.abs(s.downrange / 1000 - m.facts['boosterImpact.downrangeKm']), id).toBeLessThan(1);
      const ll = latLonOf(S.pos, tEnd);
      const wx = Math.floor(((ll.lon + 180) / 360) * water.w) % water.w;
      const wy = Math.floor(((90 - ll.lat) / 180) * water.h);
      expect(water.data[(wy * water.w + wx) * water.ch], `${id} booster falls at ${ll.lat.toFixed(2)}, ${ll.lon.toFixed(2)}`).toBeGreaterThan(200);
      // engines stay off from separation to impact; the tanks keep the depletion margin
      for (let t = m.facts['stageSep.t']; t <= tEnd; t += 1) {
        expect(channelAt(m.channels['s1.center.throttle'], t)).toBe(0);
        expect(channelAt(m.channels['s1.outer.throttle'], t)).toBe(0);
      }
      expect(channelAt(m.channels['s1.lox'], tEnd) * S1.propellant).toBeCloseTo(m.facts['meco.s1PropLeft'], -1);
    }
  }, 60_000);

  it('lunar: far-side closest approach within 1,000 to 3,000 km, not captured', () => {
    const m = tl('lunar');
    const tc = ev(m, 'closest-approach');
    bodyAt(m.bodies.satellite!, tc, S);
    const moon = moonPosition(tc, m.moonPhase0);
    const rel = S.pos.clone().sub(moon);
    const alt = rel.length() - R_MOON;
    expect(alt).toBeGreaterThan(1000e3);
    expect(alt).toBeLessThan(3000e3);
    expect(rel.dot(moon)).toBeGreaterThan(0); // beyond the Moon as seen from the Earth
    expect(m.facts['closestApproach.farSide']).toBe(1);
    // hyperbolic relative to the Moon: faster than lunar escape speed at closest approach
    expect(m.facts['closestApproach.speedRelMoon']).toBeGreaterThan(Math.sqrt((2 * 4.9048695e12) / rel.length()));
    expect(ev(m, 'soi-exit')).toBeGreaterThan(tc);
    expect(ev(m, 'soi-enter')).toBeLessThan(tc);
    // about three days from injection to the Moon (Apollo 11: 3.05 days from TLI to closest
    // approach), entering the 66,000 km sphere of influence some 0.3 to 1 day before it
    expect(Math.round((tc - ev(m, 'seco2')) / 86400)).toBe(3);
    const soiLead = (tc - ev(m, 'soi-enter')) / 86400;
    expect(soiLead).toBeGreaterThan(0.3);
    expect(soiLead).toBeLessThan(1);
  });

  it('telemetry: 1 g sensed on the pad, ground distance and acceleration during the ascent', () => {
    const m = tl('leo');
    expect(telemetryAt(m, 'booster', -30)!.acceleration / 9.80665).toBeCloseTo(1, 1);
    const tm = m.facts['meco.t'];
    const s = telemetryAt(m, 'booster', tm - 1)!;
    expect(Math.abs(s.downrange / 1000 - m.facts['meco.downrangeKm'])).toBeLessThan(3);
    // 7 engines near the end of the burn, g-limited: 3 to 5 g
    expect(s.acceleration / 9.80665).toBeGreaterThan(3);
    expect(s.acceleration / 9.80665).toBeLessThan(5);
    // coasting in orbit: weightless
    expect(telemetryAt(m, 'satellite', m.end - 10)!.acceleration).toBeLessThan(0.05);
  });

  it('interpolates LEO coasts to within 5 m', () => {
    const m = tl('leo');
    const tr = m.bodies.upper!;
    const tA = m.facts['seco.t'] + 200;
    const tB = m.facts['circ.t'] - 200;
    let worst = 0;
    for (let i = 1; i < tr.t.length; i++) {
      if (tr.t[i - 1] < tA || tr.t[i] > tB) continue;
      const h = tr.t[i] - tr.t[i - 1];
      const r0 = { x: tr.pos[3 * i - 3], y: tr.pos[3 * i - 2], z: tr.pos[3 * i - 1] };
      const v0 = { x: tr.vel[3 * i - 3], y: tr.vel[3 * i - 2], z: tr.vel[3 * i - 1] };
      const k = kepler(r0, v0, h / 2, MU_EARTH);
      const p = posAt(tr, tr.t[i - 1] + h / 2);
      worst = Math.max(worst, Math.hypot(p.x - k.r.x, p.y - k.r.y, p.z - k.r.z));
    }
    expect(worst).toBeGreaterThan(0);
    expect(worst).toBeLessThan(5);
  });
});
