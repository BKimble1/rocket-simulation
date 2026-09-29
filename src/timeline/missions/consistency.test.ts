/**
 * Cross-checks of the six built timelines against their own physics and against independent
 * textbook numbers: burns agree with the propellant they use, tracks never jump between samples
 * and interpolate coasts accurately, telemetry at each event shows the state the event names,
 * g-loads stay within crew and payload limits, the headline facts match the rocket equation and
 * vis-viva computed here from scratch, the presentation map inverts cleanly, and the sampling
 * functions behave at the edges (before the start, exactly at events and samples, after the end).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildMission, telemetryAt } from '../build';
import { bodyAt, channelAt, makeBodyState, missionToPres, presDuration, presToMission } from '../sample';
import type { BodyTrack, ChannelId, MissionId, MissionTimeline } from '../types';
import { MISSION_ORDER } from './outline';
import type { BodyId } from '../../vehicle/parts';
import { E1V, G0, S1, SERVICE_MODULE } from '../../vehicle/spec';
import { MU_EARTH, R_EARTH, moonPosition } from '../../world/frames';
import { kepler } from '../physics/kepler';
import { SM_PROP_FULL } from '../physics/vehicle';
import { SM_PROP_AT_DOCKING } from './station';

const TL: Partial<Record<MissionId, MissionTimeline>> = {};
beforeAll(() => {
  for (const id of MISSION_ORDER) TL[id] = buildMission(id);
}, 300_000);
const tl = (id: MissionId) => TL[id]!;
const S = makeBodyState();
const ev = (m: MissionTimeline, id: string) => {
  const e = m.events.find((x) => x.id === id);
  if (!e) throw new Error(`${m.id}: event ${id} missing`);
  return e.t;
};
const has = (m: MissionTimeline, id: string) => m.events.some((x) => x.id === id);
const g = (a: number) => a / 9.80665;
const visViva = (r: number, a: number) => Math.sqrt(MU_EARTH * (2 / r - 1 / a));

/** All key times of a set of channels plus a regular grid, sorted and unique. */
function grid(m: MissionTimeline, ids: ChannelId[], step: number, until = m.end): number[] {
  const s = new Set<number>();
  for (const id of ids) for (const t of m.channels[id]?.t ?? []) if (t <= until) s.add(t);
  for (let t = m.start; t <= until; t += step) s.add(t);
  return [...s].sort((a, b) => a - b);
}

describe.each(MISSION_ORDER)('%s consistency', (id) => {
  it('burns and propellant agree: tanks fall exactly while their engines run', () => {
    const m = tl(id);
    const stages: { thr: ChannelId[]; tanks: ChannelId[] }[] = [
      { thr: ['s1.center.throttle', 's1.outer.throttle'], tanks: ['s1.lox', 's1.rp1'] },
      { thr: ['s2.throttle'], tanks: ['s2.lox', 's2.rp1'] },
    ];
    for (const st of stages) {
      if (!st.thr.some((k) => m.channels[k])) continue;
      const T = grid(m, [...st.thr, ...st.tanks], 0.25, Math.min(m.end, 4000));
      for (const tank of st.tanks) {
        const ch = m.channels[tank];
        expect(ch, `${id} ${tank}`).toBeTruthy();
        for (let i = 1; i < T.length; i++) {
          const a = T[i - 1];
          const b = T[i];
          if (b - a < 1e-6) continue;
          const thr = Math.max(...st.thr.map((k) => Math.max(channelAt(m.channels[k], a), channelAt(m.channels[k], (a + b) / 2), channelAt(m.channels[k], b))));
          const d = channelAt(ch, b) - channelAt(ch, a);
          if (d > 1e-12) throw new Error(`${id} ${tank} rises over ${a.toFixed(2)}..${b.toFixed(2)}`);
          if (d < -1e-9 && thr <= 0) throw new Error(`${id} ${tank} falls over ${a.toFixed(2)}..${b.toFixed(2)} with every engine off`);
          const thrMid = Math.max(...st.thr.map((k) => channelAt(m.channels[k], (a + b) / 2)));
          if (thrMid > 0.05 && b - a >= 0.05 && d > -1e-9) throw new Error(`${id} ${tank} constant over ${a.toFixed(2)}..${b.toFixed(2)} at throttle ${thrMid.toFixed(2)}`);
        }
      }
    }
    // spacecraft engines: the body's mass falls only while its engine runs (after it is on its own)
    const own: [BodyId, ChannelId, number][] = [];
    if (has(m, 'payload-sep')) own.push(['satellite', 'sat.apogee.throttle', ev(m, 'payload-sep') + 1]);
    if (id === 'station') own.push(['service', 'sm.throttle', ev(m, 'capsule-sep') + 1]);
    if (id === 'return') own.push(['service', 'sm.throttle', m.start]);
    for (const [body, thr, from] of own) {
      const tr = m.bodies[body]!;
      for (let i = 1; i < tr.t.length; i++) {
        const a = tr.t[i - 1];
        const b = tr.t[i];
        if (a < from || b > tr.exists[1] || (tr.attached && b > tr.attached.until && a <= tr.attached.until)) continue;
        const dm = tr.mass[i] - tr.mass[i - 1];
        const on = Math.max(channelAt(m.channels[thr], a), channelAt(m.channels[thr], (a + b) / 2), channelAt(m.channels[thr], b)) > 0;
        if (dm > 1e-6) throw new Error(`${id} ${body} gains mass at ${b.toFixed(1)}`);
        if (dm < -1e-6 && !on) throw new Error(`${id} ${body} loses ${(-dm).toFixed(2)} kg over ${a.toFixed(1)}..${b.toFixed(1)} with ${thr} at zero`);
      }
    }
  });

  it('countdown: engines off until engine start, then the start-up flow comes out of the tank and the mass', () => {
    const m = tl(id);
    if (!has(m, 'engine-start')) return;
    const tE = ev(m, 'engine-start');
    for (let t = m.start; t < tE - 0.01; t += 0.5) {
      expect(channelAt(m.channels['s1.center.throttle'], t), `${id} centre engine at ${t}`).toBe(0);
      expect(channelAt(m.channels['s1.outer.throttle'], t), `${id} outer engines at ${t}`).toBe(0);
    }
    const lox = m.channels['s1.lox']!;
    expect(channelAt(lox, m.start)).toBe(channelAt(lox, tE));
    const used = (channelAt(lox, m.start) - channelAt(lox, 0)) * S1.propellant;
    expect(used, `${id}: propellant burned on the pad`).toBeGreaterThan(500);
    const tr = m.bodies.booster!;
    const mass = (t: number) => bodyAt(tr, t, S).mass;
    // the tank channels are simplified to 2e-4 of the load (66 kg on the first stage)
    expect(Math.abs(mass(m.start) - mass(0) - used)).toBeLessThan(70);
    expect(mass(0)).toBeCloseTo(m.facts.liftoffMass, 0);
  });

  it('tracks never jump between samples', () => {
    // a sample pair must be consistent with the velocities at both ends: |p1 - p0 - h (v0 + v1) / 2|
    // is zero for constant acceleration and stays a fraction of h |v1 - v0| for any smooth motion;
    // a relocated sample (a teleport) breaks it by orders of magnitude
    const m = tl(id);
    for (const [k, tr] of Object.entries(m.bodies) as [BodyId, BodyTrack][]) {
      for (let i = 1; i < tr.t.length; i++) {
        const h = tr.t[i] - tr.t[i - 1];
        let r2 = 0;
        let d2 = 0;
        for (let j = 0; j < 3; j++) {
          const r = tr.pos[3 * i + j] - tr.pos[3 * i - 3 + j] - (h * (tr.vel[3 * i + j] + tr.vel[3 * i - 3 + j])) / 2;
          const d = tr.vel[3 * i + j] - tr.vel[3 * i - 3 + j];
          r2 += r * r;
          d2 += d * d;
        }
        const res = Math.sqrt(r2);
        const allowed = 3 * (0.2 * h * Math.sqrt(d2) + 0.05);
        if (res > allowed) throw new Error(`${id} ${k}: samples at ${tr.t[i - 1].toFixed(2)} and ${tr.t[i].toFixed(2)} are ${res.toFixed(2)} m inconsistent with their velocities`);
      }
    }
  });

  it('interpolates every coast to within 5 m of the conic', () => {
    const m = tl(id);
    let n = 0;
    for (const [k, tr] of Object.entries(m.bodies) as [BodyId, BodyTrack][]) {
      if (k === 'fairingA' || k === 'fairingB') continue;
      for (let i = 1; i < tr.t.length; i++) {
        const a = tr.t[i - 1];
        const h = tr.t[i] - a;
        if (h < 1 || tr.mass[i] !== tr.mass[i - 1] || a < tr.exists[0] || tr.t[i] > tr.exists[1]) continue;
        const r0 = { x: tr.pos[3 * i - 3], y: tr.pos[3 * i - 2], z: tr.pos[3 * i - 1] };
        const v0 = { x: tr.vel[3 * i - 3], y: tr.vel[3 * i - 2], z: tr.vel[3 * i - 1] };
        if (Math.hypot(r0.x, r0.y, r0.z) - R_EARTH < 130e3) continue;
        if (m.id === 'lunar' && moonPosition(a, m.moonPhase0).distanceTo(new THREE.Vector3(r0.x, r0.y, r0.z)) < 3e8) continue;
        // only intervals that ARE two-body coasts (the end sample lies on the conic)
        const kb = kepler(r0, v0, h, MU_EARTH);
        if (Math.hypot(kb.r.x - tr.pos[3 * i], kb.r.y - tr.pos[3 * i + 1], kb.r.z - tr.pos[3 * i + 2]) > 1) continue;
        n++;
        for (const u of [0.25, 0.5, 0.75]) {
          const k2 = kepler(r0, v0, h * u, MU_EARTH);
          bodyAt(tr, a + h * u, S);
          const e = Math.hypot(k2.r.x - S.pos.x, k2.r.y - S.pos.y, k2.r.z - S.pos.z);
          if (e > 5) throw new Error(`${id} ${k}: interpolation ${e.toFixed(1)} m off the conic at t=${(a + h * u).toFixed(0)} (step ${h.toFixed(0)} s)`);
        }
      }
    }
    if (id !== 'suborbital') expect(n).toBeGreaterThan(20);
  });

  it('samples cleanly at the edges: before the start, exactly at events and samples, after the end', () => {
    const m = tl(id);
    const times = [m.start - 100, m.start, ...m.events.map((e) => e.t), m.end, m.end + 100];
    for (const [k, tr] of Object.entries(m.bodies) as [BodyId, BodyTrack][]) {
      for (const t of times) {
        bodyAt(tr, t, S);
        if (![S.pos.x, S.pos.y, S.pos.z, S.vel.x, S.mass, S.quat.w].every(Number.isFinite)) throw new Error(`${id} ${k}: non-finite state at ${t}`);
        expect(Math.abs(S.quat.length() - 1)).toBeLessThan(1e-9);
        const s = telemetryAt(m, k, t)!;
        if (![s.altitude, s.speed, s.acceleration, s.mach, s.dynamicPressure, s.downrange].every(Number.isFinite)) throw new Error(`${id} ${k}: non-finite telemetry at ${t}`);
      }
      // continuous through every sample time (cubic Hermite joins)
      const P = new THREE.Vector3();
      for (let i = 1; i < tr.t.length - 1; i += Math.max(1, Math.floor(tr.t.length / 60))) {
        const t = tr.t[i];
        const e = Math.min(1e-4, (tr.t[i + 1] - t) / 10, (t - tr.t[i - 1]) / 10);
        P.copy(bodyAt(tr, t - e, S).pos);
        const d = bodyAt(tr, t + e, S).pos.distanceTo(P);
        expect(d, `${id} ${k} at ${t}`).toBeLessThan(2 * e * 12_000 + 1e-6);
      }
    }
    for (const [k, ch] of Object.entries(m.channels)) {
      for (const t of times) if (!Number.isFinite(channelAt(ch, t))) throw new Error(`${id} ${k}: channel non-finite at ${t}`);
      expect(channelAt(ch, m.start - 100)).toBe(ch.v[0]);
      expect(channelAt(ch, m.end + 100)).toBe(ch.v[ch.v.length - 1]);
    }
  });

  it('maps presentation time and mission time both ways', () => {
    const m = tl(id);
    const P = m.pres;
    const dur = presDuration(P);
    expect(presToMission(P, -5)).toBe(m.start);
    expect(presToMission(P, dur + 5)).toBeCloseTo(m.end, 6);
    let prev = -Infinity;
    for (let i = 0; i <= 400; i++) {
      const t = presToMission(P, (dur * i) / 400);
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
    for (const e of m.events) {
      const p = missionToPres(P, e.t);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(dur);
      expect(presToMission(P, p)).toBeCloseTo(e.t, 6);
    }
    // real time (x1) through every engine ignition and cutoff and every separation of the main storyline
    for (const e of m.events) {
      if (e.kind !== 'separation' && !/^(meco|stage-sep|ses1|seco|seco1|seco2|ses2|liftoff)$/.test(e.id)) continue;
      const p = missionToPres(P, e.t);
      const seg = P.find((s) => p >= s.p0 && p <= s.p1)!;
      const rate = (seg.m1 - seg.m0) / (seg.p1 - seg.p0);
      expect(rate, `${id} ${e.id} plays at x${rate.toFixed(1)}`).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('builds the same timeline whatever was built before it', () => {
    const a = tl(id);
    for (const other of [...MISSION_ORDER].reverse()) if (other !== id) buildMission(other);
    const b = buildMission(id);
    expect(JSON.stringify(b.facts)).toBe(JSON.stringify(a.facts));
    expect(JSON.stringify(b.events)).toBe(JSON.stringify(a.events));
    for (const k of Object.keys(a.bodies) as BodyId[]) {
      const x = a.bodies[k]!;
      const y = b.bodies[k]!;
      expect(y.pos.length).toBe(x.pos.length);
      for (let i = 0; i < x.pos.length; i += 7) if (x.pos[i] !== y.pos[i]) throw new Error(`${id} ${k} differs after other builds`);
    }
  }, 120_000);
});

// ───────────────────────────── events show what they name ─────────────────────────────

describe('events match the state they name', () => {
  const ignitions: Record<string, ChannelId> = {
    ses1: 's2.throttle',
    ses2: 's2.throttle',
    'circularization-start': 's2.throttle',
    'boostback-start': 's1.outer.throttle',
    'entry-start': 's1.outer.throttle',
    'landing-start': 's1.center.throttle',
    'deorbit-start': 'sm.throttle',
    'phasing-burn-1': 'sm.throttle',
    'phasing-burn-2': 'sm.throttle',
    'apogee-burn-start': 'sat.apogee.throttle',
  };
  const cutoffs: Record<string, ChannelId> = {
    meco: 's1.center.throttle',
    seco: 's2.throttle',
    seco1: 's2.throttle',
    seco2: 's2.throttle',
    'circularization-end': 's2.throttle',
    'boostback-end': 's1.outer.throttle',
    'entry-end': 's1.outer.throttle',
    'deorbit-end': 'sm.throttle',
    'apogee-burn-end': 'sat.apogee.throttle',
  };

  it.each(MISSION_ORDER)('%s: engines light at ignition events and stop at cutoff events', (id) => {
    const m = tl(id);
    let n = 0;
    for (const e of m.events) {
      const on = ignitions[e.id];
      if (on) {
        const ch = m.channels[on]!;
        expect(channelAt(ch, e.t - 0.05), `${id} ${e.id}: already burning`).toBeLessThanOrEqual(0.02);
        let peak = 0;
        for (let t = e.t; t <= e.t + 3; t += 0.05) peak = Math.max(peak, channelAt(ch, t));
        expect(peak, `${id} ${e.id}: engine does not light`).toBeGreaterThan(0.3);
        n++;
      }
      const off = cutoffs[e.id];
      if (off) {
        const ch = m.channels[off]!;
        // the event marks the cutoff command (MECO, SECO) or the end of the shutdown ramp (booster burns, apogee engine)
        let before = 0;
        for (let t = e.t - 2; t < e.t; t += 0.05) before = Math.max(before, channelAt(ch, t));
        expect(before, `${id} ${e.id}: not burning before cutoff`).toBeGreaterThan(0.3);
        expect(channelAt(ch, e.t + 1.5), `${id} ${e.id}: still burning after cutoff`).toBe(0);
        n++;
      }
    }
    expect(n).toBeGreaterThan(1);
  });

  it('max-q event and fact are the peak of the telemetry', () => {
    for (const id of ['leo', 'gto', 'station', 'lunar'] as MissionId[]) {
      const m = tl(id);
      let best = { q: 0, t: 0 };
      for (let t = 30; t < 140; t += 0.1) {
        const s = telemetryAt(m, 'booster', t)!;
        if (s.dynamicPressure > best.q) best = { q: s.dynamicPressure, t };
      }
      expect(Math.abs(best.t - ev(m, 'max-q')), id).toBeLessThan(1);
      expect(best.q / 1000 / m.facts['maxQ.kPa'], id).toBeCloseTo(1, 1);
      // a kerosene two-stager of this class: max-q of 20 to 35 kPa near Mach 1.2 to 1.6 at 10 to 14 km, 60 to 90 s
      expect(m.facts['maxQ.kPa']).toBeGreaterThan(18);
      expect(m.facts['maxQ.kPa']).toBeLessThan(35);
      expect(m.facts['maxQ.t']).toBeGreaterThan(60);
      expect(m.facts['maxQ.t']).toBeLessThan(90);
      expect(m.facts['maxQ.altKm']).toBeGreaterThan(9);
      expect(m.facts['maxQ.altKm']).toBeLessThan(15);
    }
  });

  it('suborbital: 100 km crossings, apogee, splashdown and touchdown where the events say', () => {
    const m = tl('suborbital');
    const cap = (t: number) => telemetryAt(m, 'capsule', t)!;
    expect(cap(ev(m, 'karman-up')).altitude / 1000).toBeCloseTo(100, 0);
    expect(cap(ev(m, 'karman-down')).altitude / 1000).toBeCloseTo(100, 0);
    expect(Math.abs(cap(ev(m, 'apogee')).verticalSpeed)).toBeLessThan(3);
    expect(cap(ev(m, 'apogee')).altitude / 1000).toBeCloseTo(m.facts['apogee.km'], 0);
    // telemetry reads the capsule's own centre: afloat at about a metre, not tens of metres under water
    for (const t of [ev(m, 'splashdown'), ev(m, 'splashdown') + 5, m.end]) {
      expect(cap(t).altitude).toBeGreaterThan(-1);
      expect(cap(t).altitude).toBeLessThan(3);
    }
    expect(cap(ev(m, 'splashdown') - 0.5).groundSpeed).toBeCloseTo(m.facts['splash.speed'], 0);
    const b = telemetryAt(m, 'booster', ev(m, 'touchdown') + 2)!;
    expect(b.altitude).toBeLessThan(5);
    expect(b.groundSpeed).toBeLessThan(0.1);
    // the interpolated capsule never dips more than half a metre below its floating height
    let lowest = Infinity;
    for (let t = ev(m, 'splashdown'); t < ev(m, 'splashdown') + 4; t += 0.01) lowest = Math.min(lowest, cap(t).altitude);
    expect(lowest).toBeGreaterThan(cap(m.end).altitude - 0.5);
  });

  it('return: entry interface, heating and peak g where the events say; afloat after splashdown', () => {
    const m = tl('return');
    const cap = (t: number) => telemetryAt(m, 'capsule', t)!;
    expect(cap(ev(m, 'entry-interface')).altitude / 1000).toBeCloseTo(120, 0);
    expect(cap(ev(m, 'peak-heating')).altitude / 1000).toBeCloseTo(m.facts['entry.peakHeating.altKm'], 0);
    expect(g(cap(ev(m, 'peak-g')).acceleration)).toBeCloseTo(m.facts['entry.peakG'], 0);
    expect(cap(ev(m, 'splashdown') + 5).altitude).toBeGreaterThan(-1);
    expect(cap(ev(m, 'splashdown') + 5).altitude).toBeLessThan(3);
    // capsule LEO entry: peak heating 55 to 75 km at 5.5 to 7.5 km/s, 3 to 5 g near 30 to 45 km
    expect(m.facts['entry.peakHeating.altKm']).toBeGreaterThan(55);
    expect(m.facts['entry.peakHeating.altKm']).toBeLessThan(75);
    expect(m.facts['entry.peakHeating.speed']).toBeGreaterThan(5500);
    expect(m.facts['entry.peakHeating.speed']).toBeLessThan(7500);
    expect(m.facts['entry.peakG.altKm']).toBeGreaterThan(28);
    expect(m.facts['entry.peakG.altKm']).toBeLessThan(48);
  });

  it('lunar: sphere-of-influence entry at its radius, closest approach at the minimum distance', () => {
    const m = tl('lunar');
    const tr = m.bodies.satellite!;
    const dist = (t: number) => moonPosition(t, m.moonPhase0).distanceTo(bodyAt(tr, t, S).pos);
    expect(Math.abs(dist(ev(m, 'soi-enter')) / 1000 - m.facts.soiKm)).toBeLessThan(50);
    expect(Math.abs(dist(ev(m, 'soi-exit')) / 1000 - m.facts.soiKm)).toBeLessThan(50);
    const tc = ev(m, 'closest-approach');
    let best = { d: Infinity, t: 0 };
    for (let t = tc - 3600; t <= tc + 3600; t += 1) {
      const d = dist(t);
      if (d < best.d) best = { d, t };
    }
    expect(Math.abs(best.t - tc)).toBeLessThan(15);
    expect(Math.abs(best.d / 1000 - 1737.4 - m.facts['closestApproach.altKm'])).toBeLessThan(1);
  });

  it('the return capsule leaves the station smoothly and holds the local vertical before the deorbit turn', () => {
    const m = tl('return');
    const tr = m.bodies.capsule!;
    const st = m.bodies.station!;
    const S2 = makeBodyState();
    // relative distance grows smoothly from the port: no jump anywhere before the deorbit burn
    let prev = bodyAt(tr, ev(m, 'undock'), S).pos.distanceTo(bodyAt(st, ev(m, 'undock'), S2).pos);
    for (let t = ev(m, 'undock'); t < ev(m, 'deorbit-start') - 400; t += 2) {
      const d = bodyAt(tr, t, S).pos.distanceTo(bodyAt(st, t, S2).pos);
      // the drift apart reaches a few m/s; the old handover teleport moved the capsule 30 km
      expect(Math.abs(d - prev), `capsule-station distance jumps at ${t}`).toBeLessThan(25);
      prev = d;
      // docking end (+Y) up, like the station
      expect(new THREE.Vector3(0, 1, 0).applyQuaternion(S.quat).dot(S.pos.clone().normalize())).toBeGreaterThan(0.999);
    }
    expect(prev).toBeGreaterThan(1000);
  });
});

// ───────────────────────────── g-loads ─────────────────────────────

describe('g-loads', () => {
  const peak = (m: MissionTimeline, body: BodyId, t0: number, t1: number) => {
    let p = 0;
    for (let t = t0; t <= t1; t += 0.1) p = Math.max(p, telemetryAt(m, body, t)!.acceleration);
    return g(p);
  };
  it('crew ascent stays at or under 4.5 g', () => {
    const m = tl('station');
    expect(peak(m, 'capsule', 0.5, ev(m, 'capsule-sep') - 1)).toBeLessThan(4.5);
  });
  it('satellites ride under 4.6 g on the first burn and under the upper stage minimum-throttle ceiling after', () => {
    for (const id of ['leo', 'gto', 'lunar'] as MissionId[]) {
      const m = tl(id);
      const first = has(m, 'seco1') ? ev(m, 'seco1') : ev(m, 'seco');
      expect(peak(m, 'satellite', 0.5, first + 2), id).toBeLessThan(4.6);
      const end = ev(m, 'payload-sep') - 1;
      // once the stage is light, 60 % throttle is the least it can do: 910 kN x 0.6 on the final mass
      const mf = bodyAt(m.bodies.satellite!, end, S).mass;
      const floor = g((0.6 * E1V.thrustVac) / mf);
      expect(peak(m, 'satellite', first + 2, end), id).toBeLessThan(Math.max(4.6, floor + 0.2));
      expect(peak(m, 'satellite', first + 2, end), id).toBeLessThan(8.5);
    }
  });
});

// ───────────────────────────── the facts, recomputed ─────────────────────────────

describe('headline facts recomputed independently', () => {
  it('LEO: circular speed, period and circularization from vis-viva', () => {
    const m = tl('leo');
    const f = m.facts;
    const rA = R_EARTH + f['insertion.apoKm'] * 1000;
    const aIns = R_EARTH + ((f['insertion.periKm'] + f['insertion.apoKm']) * 1000) / 2;
    const dv = Math.sqrt(MU_EARTH / rA) - visViva(rA, aIns);
    expect(Math.abs(f['circ.dv'] - dv)).toBeLessThan(2);
    const a = R_EARTH + ((f['orbit.periKm'] + f['orbit.apoKm']) * 1000) / 2;
    expect((2 * Math.PI * Math.sqrt(a ** 3 / MU_EARTH)) / 60).toBeCloseTo(f['orbit.periodMin'], 1);
    // circular speed at 400 km: 7.67 km/s; the satellite moves at it
    bodyAt(m.bodies.satellite!, m.end - 1, S);
    expect(S.vel.length() / 1000).toBeCloseTo(Math.sqrt(MU_EARTH / S.pos.length()) / 1000, 2);
    // SECO 6.5 to 8 min after liftoff (the stage's 276 s of full-flow propellant)
    expect(f['seco.t'] / 60).toBeGreaterThan(6.5);
    expect(f['seco.t'] / 60).toBeLessThan(8);
    // MECO of a recovery flight: 2 to 3 min, 45 to 80 km, 1.6 to 2.4 km/s inertial
    expect(f['meco.t']).toBeGreaterThan(120);
    expect(f['meco.t']).toBeLessThan(180);
    expect(f['meco.altKm']).toBeGreaterThan(45);
    expect(f['meco.altKm']).toBeLessThan(80);
    expect(f['meco.speed']).toBeGreaterThan(1600);
    expect(f['meco.speed']).toBeLessThan(2400);
  });

  it('GTO: Hohmann perigee and apogee delta-v, and the apogee burn from the rocket equation', () => {
    const f = tl('gto').facts;
    const rp = R_EARTH + f['parking.periKm'] * 1000;
    const ra = R_EARTH + 35_786e3;
    expect(Math.abs(f['injection.dvIdeal'] - (visViva(rp, (rp + ra) / 2) - Math.sqrt(MU_EARTH / rp)))).toBeLessThan(2);
    expect(Math.abs(f['apogeeBurn.dvToGainAtStart'] - (Math.sqrt(MU_EARTH / ra) - visViva(ra, (rp + ra) / 2)))).toBeLessThan(3);
    const m0 = 3600;
    expect(f['apogeeBurn.dv']).toBeCloseTo(320 * G0 * Math.log(m0 / (m0 - f['apogeeBurn.propUsedKg'])), 0);
    // a 450 N engine takes hours: burn time = propellant / flow
    expect(f['apogeeBurn.durationH']).toBeCloseTo(f['apogeeBurn.propUsedKg'] / (450 / (320 * G0)) / 3600, 1);
    expect(f['gto.periodH']).toBeCloseTo((2 * Math.PI * Math.sqrt(((R_EARTH * 2 + (f['gto.periKm'] + f['gto.apoKm']) * 1000) / 2) ** 3 / MU_EARTH)) / 3600, 2);
  });

  it('lunar: C3 from the injection speed, Apollo-like cruise', () => {
    const m = tl('lunar');
    const f = m.facts;
    bodyAt(m.bodies.satellite!, ev(m, 'seco2') + 1.5, S);
    const c3 = S.vel.lengthSq() - (2 * MU_EARTH) / S.pos.length();
    expect(c3 / 1e6).toBeCloseTo(f['tli.c3km2s2'], 1);
    expect(f['tli.c3km2s2']).toBeGreaterThan(-2.5);
    expect(f['tli.c3km2s2']).toBeLessThan(-0.5);
    expect(f['cruise.days']).toBeGreaterThan(2.5);
    expect(f['cruise.days']).toBeLessThan(3.5);
  });

  it('station: phasing burns match the Hohmann legs between the orbits they join', () => {
    const f = tl('station').facts;
    const r1 = R_EARTH + f['insertion.periKm'] * 1000;
    const r2 = R_EARTH + f['raise.apoKm'] * 1000;
    const a0 = R_EARTH + ((f['insertion.periKm'] + f['insertion.apoKm']) * 1000) / 2;
    const dv1 = visViva(r1, (r1 + r2) / 2) - visViva(r1, a0);
    expect(Math.abs(f['phasingBurn1.dv'] - dv1)).toBeLessThan(2);
    const a2 = R_EARTH + ((f['raise.periKm'] + f['raise.apoKm']) * 1000) / 2;
    const dv2 = visViva(r2, a2) - visViva(r2, (r1 + r2) / 2);
    expect(Math.abs(f['phasingBurn2.dv'] - dv2)).toBeLessThan(3);
    expect(f['docking.closingSpeed']).toBeGreaterThan(0.03);
    expect(f['docking.closingSpeed']).toBeLessThanOrEqual(0.12);
  });

  it('return: deorbit delta-v near the impulsive value, service-module propellant from the rocket equation', () => {
    const f = tl('return').facts;
    const r = R_EARTH + 400e3;
    const rp = R_EARTH + f['deorbit.perigeeKm'] * 1000;
    const dvImp = Math.sqrt(MU_EARTH / r) - visViva(r, (r + rp) / 2);
    expect(f['deorbit.dv']).toBeGreaterThan(dvImp - 2);
    expect(f['deorbit.dv']).toBeLessThan(dvImp * 1.08);
    const m0 = f.capsuleKg + f.serviceModuleKg;
    expect(f.serviceModuleKg).toBeCloseTo(SERVICE_MODULE.mass - SM_PROP_FULL + f['undock.smPropKg'], 6);
    const used = m0 * (1 - Math.exp(-f['deorbit.dv'] / (SERVICE_MODULE.ispVac * G0)));
    expect(f['smSep.smPropLeftKg']).toBeGreaterThan(0);
    expect(Math.abs(f['smSep.smPropLeftKg'] - (f['undock.smPropKg'] - used)) / used).toBeLessThan(0.05);
    // margin: the propellant left could still give well over half the deorbit burn again
    expect(f['smSep.dvLeft']).toBeGreaterThan(0.5 * f['deorbit.dv']);
  });

  it('return starts with the service-module propellant the station mission arrives with', () => {
    const arrive = tl('station').facts['sm.propLeftKg'];
    expect(Math.abs(tl('return').facts['undock.smPropKg'] - arrive)).toBeLessThan(1);
    expect(Math.abs(SM_PROP_AT_DOCKING - arrive)).toBeLessThan(1);
  });

  it('boosters: the landing reserve is spent to a thin margin, and the aerodynamic deceleration is plausible', () => {
    // the only orbital flight that recovers its booster (the station mission expends it for the crew stack)
    for (const id of ['leo'] as MissionId[]) {
      const f = tl(id).facts;
      // RTLS: about 15 % of the load kept at MECO, a few hundred kg to a tonne left on the pad
      expect(f['rtls.reservePct']).toBeGreaterThan(10);
      expect(f['rtls.reservePct']).toBeLessThan(25);
      expect(f['rtls.propLeftKg']).toBeGreaterThan(100);
      expect(f['rtls.propLeftKg']).toBeLessThan(2000);
      expect(f['rtls.maxDecelG']).toBeGreaterThan(2);
      expect(f['rtls.maxDecelG']).toBeLessThan(6);
    }
  });
});
