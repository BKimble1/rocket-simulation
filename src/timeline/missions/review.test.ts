/**
 * Independent review checks of the built timelines: the upper-stage burns obey the rocket
 * equation on the tracks' own masses, the sensed acceleration equals thrust over mass wherever
 * an upper stage burns (channels, masses and interpolated tracks agree, with no spikes at the
 * throttle knees), engines stay within their throttle range, g-limits hold, mass steps at
 * separations are sharp, events sit in the phases that name them, the presentation notes state
 * the rates they play at, the stack does not roll inside the tower, and the lunar flyby's exit
 * label says where the probe is going.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildMission, telemetryAt } from '../build';
import { bodyAt, channelAt, makeBodyState } from '../sample';
import type { ChannelId, MissionId, MissionTimeline } from '../types';
import { MISSION_ORDER } from './outline';
import { E1, E1V, G0, SERVICE_MODULE } from '../../vehicle/spec';
import { ENG_SAT } from '../physics/vehicle';
import { MU_EARTH, R_EARTH } from '../../world/frames';
import { kepler } from '../physics/kepler';

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
const acc = (m: MissionTimeline, t: number) => telemetryAt(m, 'upper', t)!.acceleration;
const massAt = (m: MissionTimeline, t: number) => bodyAt(m.bodies.upper!, t, S).mass;

/** Upper-stage burns of a mission: [ignition command, cutoff event] pairs. */
function s2Burns(m: MissionTimeline): [number, number][] {
  const out: [number, number][] = [[ev(m, 'ses1'), ev(m, has(m, 'seco') ? 'seco' : 'seco1')]];
  if (has(m, 'ses2')) out.push([ev(m, 'ses2'), ev(m, 'seco2')]);
  if (has(m, 'circularization-start')) out.push([ev(m, 'circularization-start'), ev(m, 'circularization-end')]);
  return out;
}
/** Mass drops from the upper stack during its burns (fairing halves, abort tower): times. */
function drops(m: MissionTimeline): number[] {
  const d: number[] = [];
  if (has(m, 'fairing-sep')) d.push(m.facts['fairingSep.t'] + 1.2);
  if (has(m, 'les-jettison')) d.push(ev(m, 'les-jettison'));
  return d;
}

describe('upper-stage burns', () => {
  const orbital: MissionId[] = ['leo', 'gto', 'station', 'lunar'];

  it('deliver the rocket-equation velocity change of the propellant the track says they burn', () => {
    for (const id of orbital) {
      const m = tl(id);
      for (const [t0, tc] of s2Burns(m)) {
        const a = t0 - 0.5;
        const b = tc + 2;
        // rocket equation, split at each mass drop inside the burn
        const cuts = [a, ...drops(m).filter((t) => t > a && t < b), b];
        let dvR = 0;
        for (let i = 1; i < cuts.length; i++) dvR += E1V.ispVac * G0 * Math.log(massAt(m, cuts[i - 1] + (i > 1 ? 0.05 : 0)) / massAt(m, cuts[i] - (i < cuts.length - 1 ? 1e-3 : 0)));
        let dvI = 0;
        const h = 0.05;
        for (let t = a; t < b; t += h) dvI += acc(m, t + h / 2) * h;
        expect(Math.abs(dvI / dvR - 1), `${id} burn at ${t0.toFixed(0)} s: integrated ${dvI.toFixed(1)} vs rocket equation ${dvR.toFixed(1)} m/s`).toBeLessThan(0.005);
      }
    }
  });

  it('feel thrust over mass: the sensed acceleration matches the throttle channel and the tracked mass', () => {
    for (const id of orbital) {
      const m = tl(id);
      const thr = m.channels['s2.throttle']!;
      // skip the ramps and the instants of mass drops (the interpolation spans them by design)
      const avoid = [...drops(m), ...s2Burns(m).flat()];
      let n = 0;
      for (const [t0, tc] of s2Burns(m)) {
        for (let t = t0 + 2; t < tc - 0.5; t += 0.25) {
          if (avoid.some((x) => Math.abs(t - x) < 0.8)) continue;
          if (telemetryAt(m, 'upper', t)!.altitude < 100e3) continue; // no drag to account for
          // not while slewing: the tracks interpolate the attitude at a constant rate between
          // samples, so an angular acceleration shows up in the acceleration read off them
          const qa = bodyAt(m.bodies.upper!, t - 0.5, S).quat.clone();
          if ((qa.angleTo(bodyAt(m.bodies.upper!, t + 0.5, S).quat) * 180) / Math.PI > 0.3) continue;
          const want = (channelAt(thr, t) * E1V.thrustVac) / massAt(m, t);
          const got = acc(m, t);
          if (Math.abs(got - want) > 0.01 * want + 0.05) throw new Error(`${id} t=${t.toFixed(2)}: sensed ${got.toFixed(3)} m/s^2, thrust/mass ${want.toFixed(3)}`);
          n++;
        }
      }
      expect(n, id).toBeGreaterThan(100);
    }
  });

  it('hold their acceleration limits with no interpolation spike at the throttle knees', () => {
    const peak = (m: MissionTimeline, body: 'upper' | 'booster', a: number, b: number) => {
      let p = 0;
      for (let t = a; t <= b; t += 0.02) p = Math.max(p, telemetryAt(m, body, t)!.acceleration);
      return p / G0;
    };
    // satellites: 4.5 g on both stages (first burn); crew: the booster throttles to hold 4 g, the upper stage too
    const lim: Partial<Record<MissionId, number>> = { leo: 4.5, gto: 4.5, lunar: 4.5, station: 4.0 };
    for (const id of orbital) {
      const m = tl(id);
      const L = lim[id]!;
      expect(peak(m, 'booster', 0.5, ev(m, 'meco') + 1.5), `${id} first stage`).toBeLessThan(L * 1.003);
      expect(peak(m, 'upper', ev(m, 'ses1'), s2Burns(m)[0][1] + 1.5), `${id} upper stage`).toBeLessThan(L * 1.003);
      // the MECO knee: no overshoot above the acceleration just before the cutoff command
      const tm = ev(m, 'meco');
      expect(peak(m, 'booster', tm - 2, tm + 1.5), `${id} MECO knee`).toBeLessThan(peak(m, 'booster', tm - 4, tm - 0.3) * 1.003);
    }
  });

  it('and so do the spacecraft engines (service module, satellite apogee engine)', () => {
    const cases: [MissionId, 'capsule' | 'satellite', ChannelId, number][] = [
      ['station', 'capsule', 'sm.throttle', SERVICE_MODULE.engineThrust],
      ['return', 'capsule', 'sm.throttle', SERVICE_MODULE.engineThrust],
      ['gto', 'satellite', 'sat.apogee.throttle', ENG_SAT.thrustVac],
    ];
    for (const [id, body, chId, F] of cases) {
      const m = tl(id);
      const ch = m.channels[chId]!;
      let n = 0;
      // full-thrust windows from the channel keys
      for (let i = 1; i < ch.t.length; i++) {
        if (!(ch.v[i - 1] >= 0.999 && ch.v[i] >= 0.999)) continue;
        const a = ch.t[i - 1] + 1;
        const b = ch.t[i] - 1;
        for (let k = 0; k <= 40 && b > a; k++) {
          const t = a + ((b - a) * k) / 40;
          const want = F / bodyAt(m.bodies[body]!, t, S).mass;
          const got = telemetryAt(m, body, t)!.acceleration;
          if (Math.abs(got / want - 1) > 0.01) throw new Error(`${id} ${body} t=${t.toFixed(1)}: sensed ${got.toFixed(4)} m/s^2, thrust/mass ${want.toFixed(4)}`);
          n++;
        }
      }
      expect(n, id).toBeGreaterThan(30);
    }
  });

  it('keep the engines at or above their minimum throttle except while starting or shutting down', () => {
    const minThr: Partial<Record<ChannelId, number>> = { 's1.center.throttle': E1.minThrottle, 's1.outer.throttle': E1.minThrottle, 's2.throttle': E1V.minThrottle };
    for (const id of MISSION_ORDER) {
      const m = tl(id);
      for (const [k, mn] of Object.entries(minThr) as [ChannelId, number][]) {
        const ch = m.channels[k];
        if (!ch) continue;
        let from = NaN;
        for (let i = 0; i < ch.t.length; i++) {
          const low = ch.v[i] > 1e-6 && ch.v[i] < mn - 1e-6;
          if (low && Number.isNaN(from)) from = ch.t[i];
          if (!low && !Number.isNaN(from)) {
            // a start-up or shutdown transient lasts at most 1.5 s
            expect(ch.t[i] - from, `${id} ${k} below ${mn} from ${from.toFixed(1)} s`).toBeLessThanOrEqual(1.6);
            from = NaN;
          }
        }
      }
    }
  });
});

describe('tracks and timing', () => {
  it('keep a mass step sharp where a fairing or abort tower leaves a body that keeps its path', () => {
    for (const id of ['leo', 'gto', 'station', 'lunar'] as MissionId[]) {
      const m = tl(id);
      for (const t of drops(m)) {
        const before = massAt(m, t - 1e-3);
        const after = massAt(m, t + 0.03);
        const burned = 0.04 * (E1V.thrustVac / (E1V.ispVac * G0));
        const dropped = id === 'station' ? m.facts['crew.abortTowerKg'] : 1800;
        // within the few kilograms the engine burns in 0.03 s (and the tower's jettison-motor load)
        expect(Math.abs(before - after - dropped), `${id} drop at ${t.toFixed(1)}`).toBeLessThan(burned + 20);
      }
    }
  });

  it('put each event inside the phase that names it (or on its boundary)', () => {
    const where: Record<string, string[]> = {
      'arms-retract': ['pad'], 'engine-start': ['ignition'], liftoff: ['liftoff'], 'tower-clear': ['liftoff'], 'max-q': ['maxq'], meco: ['meco', 'maxq'],
      'stage-sep': ['staging'], ses1: ['ses1', 'staging'], 'fairing-sep': ['fairing'], 'les-jettison': ['abort-jettison'], seco: ['seco', 'insertion'], seco1: ['parking'],
      ses2: ['restart', 'tli'], seco2: ['gto-injection', 'tli'], 'payload-sep': ['deploy', 'probe-sep'], 'capsule-sep': ['capsule-sep'], apogee: ['apogee', 'transfer-coast'],
      'karman-down': ['descent'], 'drogue-deploy': ['parachutes', 'drogues'], 'main-deploy': ['parachutes', 'mains'], splashdown: ['splashdown'],
      'apogee-burn-start': ['circularize'], 'apogee-burn-end': ['circularize'], 'soi-enter': ['soi'], 'closest-approach': ['flyby'], 'soi-exit': ['outbound'],
      'phasing-burn-1': ['phasing', 'raise'], 'phasing-burn-2': ['raise'], 'hold-point': ['approach'], 'soft-capture': ['docking'], 'hard-capture': ['docking'],
      undock: ['undock'], 'deorbit-start': ['deorbit'], 'deorbit-end': ['deorbit'], 'sm-sep': ['sm-sep'], 'entry-interface': ['entry'], 'peak-g': ['blackout'],
    };
    let n = 0;
    for (const id of MISSION_ORDER) {
      const m = tl(id);
      for (const e of m.events) {
        const want = where[e.id];
        if (!want) continue;
        const ok = m.phases.some((p) => want.includes(p.id) && e.t >= p.start - 1e-9 && e.t <= p.end + 1e-9);
        expect(ok, `${id} ${e.id} at ${e.t.toFixed(1)} s lies outside ${want.join('/')}`).toBe(true);
        n++;
      }
    }
    expect(n).toBeGreaterThan(60);
  });

  it('state the rate each presentation segment plays at, and how much an omitted interval skips', () => {
    const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
    for (const id of MISSION_ORDER) {
      const m = tl(id);
      for (const s of m.pres) {
        const rate = (s.m1 - s.m0) / (s.p1 - s.p0);
        if (s.omitted) {
          const q = /about (\w+) (minutes|hours|days)/.exec(s.note ?? '');
          expect(q, `${id}: omitted interval without its length: ${s.note}`).toBeTruthy();
          const k = words[q![1]] ?? Number(q![1]);
          const unit = q![2] === 'minutes' ? 60 : q![2] === 'hours' ? 3600 : 86400;
          const ratio = (s.m1 - s.m0) / (k * unit);
          expect(ratio, `${id}: "${s.note}" skips ${((s.m1 - s.m0) / unit).toFixed(2)} ${q![2]}`).toBeGreaterThan(0.75);
          expect(ratio).toBeLessThan(1.3);
          continue;
        }
        const x = /×\s?([\d.]+)/.exec(s.note ?? '');
        if (Math.abs(rate - 1) < 1e-6) {
          expect(x, `${id}: a real-time segment labelled "${s.note}"`).toBeNull();
          continue;
        }
        expect(x, `${id}: a x${rate.toFixed(1)} segment without its rate: ${s.note}`).toBeTruthy();
        expect(Number(x![1]) / rate, `${id}: "${s.note}" plays at x${rate.toFixed(2)}`).toBeCloseTo(1, 2);
        if (/(\d+) h /.test(s.note!)) expect(Math.abs((s.m1 - s.m0) / 3600 - Number(/(\d+) h /.exec(s.note!)![1]))).toBeLessThan(0.6);
      }
    }
  });

  it('keep the pad roll until the stack clears the tower', () => {
    for (const id of ['leo', 'suborbital', 'gto', 'station', 'lunar'] as MissionId[]) {
      const m = tl(id);
      const tr = m.bodies.booster!;
      const z0 = new THREE.Vector3(0, 0, 1).applyQuaternion(bodyAt(tr, 0, S).quat);
      for (let t = 0; t <= ev(m, 'tower-clear'); t += 0.1) {
        const z = new THREE.Vector3(0, 0, 1).applyQuaternion(bodyAt(tr, t, S).quat);
        expect((z.angleTo(z0) * 180) / Math.PI, `${id} rolls inside the tower at ${t.toFixed(1)} s`).toBeLessThan(0.5);
      }
    }
  });
});

describe('lunar flyby outcome', () => {
  it('says where the flyby leaves the probe, with the speed and energy the track has', () => {
    const m = tl('lunar');
    const f = m.facts;
    const label = m.events.find((e) => e.id === 'soi-exit')!.label;
    bodyAt(m.bodies.satellite!, m.end, S);
    const r = { x: S.pos.x, y: S.pos.y, z: S.pos.z };
    const v = { x: S.vel.x, y: S.vel.y, z: S.vel.z };
    const energy = S.vel.lengthSq() / 2 - MU_EARTH / S.pos.length();
    expect(energy / f['outbound.energy']).toBeCloseTo(1, 3);
    if (f['outbound.perigeeAltKm'] < 120) {
      // bound, and the path meets the atmosphere: a free return, not "a new, high Earth orbit"
      expect(energy).toBeLessThan(0);
      expect(label).toMatch(/back toward the Earth/);
      expect(label).not.toMatch(/high Earth orbit/);
      const dt = ev(m, 'soi-exit') + f['outbound.earthReturnDays'] * 86400 - m.end;
      const k = kepler(r, v, dt, MU_EARTH);
      expect(Math.hypot(k.r.x, k.r.y, k.r.z) - R_EARTH).toBeCloseTo(120e3, -3);
      expect(label).toContain(`${Math.round(f['outbound.earthReturnDays'])} days`);
    } else {
      expect(f['outbound.earthReturnDays']).toBe(0);
      expect(label).not.toMatch(/back toward the Earth/);
    }
    if (energy > 0) {
      // unbound: the label says it leaves the system, with the speed at the sphere-of-influence exit
      expect(label).toMatch(/leaves the Earth-Moon system/);
      expect(Math.sqrt(2 * energy)).toBeCloseTo(f['outbound.vInf'], 0);
      bodyAt(m.bodies.satellite!, ev(m, 'soi-exit'), S);
      expect(Math.abs(S.vel.length() - f['soiExit.speed'])).toBeLessThan(2);
      expect(Math.abs(S.pos.length() / 1000 - f['soiExit.distanceKm'])).toBeLessThan(5);
      expect(label).toContain(`${(f['soiExit.speed'] / 1000).toFixed(2)} km/s`);
      expect(f['soiExit.escapeSpeed']).toBeCloseTo(Math.sqrt((2 * MU_EARTH) / (f['soiExit.distanceKm'] * 1000)), 3);
    }
  });
});
