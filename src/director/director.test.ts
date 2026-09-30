/**
 * Camera regressions (V2). Each test runs the real director against a real mission timeline
 * through the camera trace (trace.ts), frame by frame, without rendering. The defects they pin
 * down were measured on V1 with the same harness (docs/V2_AUDIT.md):
 *   - a manual camera mode restarted its transition every frame (3,901 transitions in 3,901 frames)
 *   - Free kept orbiting the previous body after the followed body changed (80° off-axis)
 *   - absent bodies could be framed; a subject that left the world was kept
 *   - bursts of mode changes evicted blends and snapped the view (136° in one frame)
 *   - the travel frame flipped when the booster's horizontal velocity reversed (137° in one frame)
 *   - blends through Earth-centred coordinates (22 km below the surface), orbit shots jumping
 *     (117° in one frame) at a threshold in the sun-side angle, two-body framings losing the subject
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { traceFlight, loadTimeline, type TraceFrame } from './trace';
import { buildMission } from '../timeline/build';
import { bodyAt, makeBodyState, missionToPres, presDuration } from '../timeline/sample';
import type { MissionId, MissionTimeline } from '../timeline/types';
import { director, fallbackSubject, flightStats } from './director';
import { evalFree, evalShot, sunSideAz, makeBasis } from './shots';
import { makePose } from './pose';
import { frame } from '../scene/frame';

const cache = new Map<MissionId, MissionTimeline>();
const tl = (id: MissionId) => {
  let t = cache.get(id);
  if (!t) {
    t = buildMission(id);
    cache.set(id, t);
  }
  return t;
};
const ev = (m: MissionTimeline, id: string) => {
  const e = m.events.find((x) => x.id === id);
  if (!e) throw new Error(`no event ${id}`);
  return e.t;
};
const turn = (a: TraceFrame, b: TraceFrame) => (a.dir.angleTo(b.dir) * 180) / Math.PI;

describe('stable framing identity', () => {
  for (const mode of ['ground', 'chase', 'onboard', 'free'] as const) {
    it(`${mode}: an unchanged manual mode starts no transitions while the mission plays`, () => {
      const leo = tl('leo');
      const r = traceFlight({ mission: leo, mode, focus: 'booster', t0: -5, p1: missionToPres(leo.pres, 60), fps: 60 });
      expect(r.metrics.frames).toBeGreaterThan(3500);
      // the first framing is entered once; a ground camera may change site once (pad camera to
      // the tracking camera as the vehicle climbs), which is a single intentional cut
      expect(r.metrics.pushes).toBe(0);
      expect(r.metrics.cuts).toBeLessThanOrEqual(mode === 'ground' ? 2 : 1);
      expect(r.metrics.maxBlends).toBeLessThanOrEqual(1);
      // identity never contains a time
      const keys = new Set(r.frames.map((f) => f.key));
      expect(keys.size).toBeLessThanOrEqual(mode === 'ground' ? 2 : 1);
      for (const k of keys) expect(k).not.toMatch(/\d+\.\d+/);
    });
  }

  it('Auto: one transition per authored shot, never more', () => {
    const leo = tl('leo');
    const p1 = missionToPres(leo.pres, 600);
    const r = traceFlight({ mission: leo, mode: 'auto', p1, fps: 60 });
    const shots = leo.shots.filter((s) => s.from < 600 && s.to > leo.start).length;
    expect(r.metrics.pushes + r.metrics.cuts).toBeLessThanOrEqual(shots + 1);
  });
});

describe('free camera follows the chosen body', () => {
  it('switching to a far body (booster after staging) ends centred on it, without stale framing', () => {
    const leo = tl('leo');
    const p = missionToPres(leo.pres, ev(leo, 'stage-sep') + 150);
    const r = traceFlight({ mission: leo, mode: 'free', focus: 'upper', p0: p, p1: p + 4, fps: 60, actions: [{ at: p + 1, focus: 'booster' }] });
    const end = r.frames[r.frames.length - 1];
    expect(end.focus).toBe('booster');
    expect(end.offAxis).toBeLessThan(2);
    expect(end.visible).toBe(true);
    // far away: reached by one dissolve, not a flight across hundreds of kilometres
    expect(r.metrics.cuts).toBe(2);
  });

  it('switching to a near body keeps the camera where it is and turns to the new subject smoothly', () => {
    const leo = tl('leo');
    const tSep = ev(leo, 'stage-sep');
    const p = missionToPres(leo.pres, tSep + 6);
    const r = traceFlight({ mission: leo, mode: 'free', focus: 'upper', p0: p, p1: p + 3, fps: 60, actions: [{ at: p + 0.5, focus: 'booster' }] });
    const i = r.frames.findIndex((f) => f.p >= p + 0.5);
    // the displayed position does not jump at the switch (it moves only with the bodies)
    const jump = r.frames[i].pos.distanceTo(r.frames[i - 1].pos);
    const before = r.frames[i - 1].pos.distanceTo(r.frames[i - 2].pos);
    expect(jump).toBeLessThan(before * 1.5 + 0.5);
    for (let k = i; k < r.frames.length; k++) expect(turn(r.frames[k - 1], r.frames[k])).toBeLessThan(4);
    const end = r.frames[r.frames.length - 1];
    expect(end.focus).toBe('booster');
    expect(end.offAxis).toBeLessThan(2);
    expect(r.metrics.cuts).toBe(1);
  });

  it('switching while paused completes (transitions run on the UI clock, not mission time)', () => {
    const leo = tl('leo');
    const p = missionToPres(leo.pres, ev(leo, 'stage-sep') + 6);
    const r = traceFlight({ mission: leo, mode: 'free', focus: 'upper', p0: p, frames: 240, fps: 60, actions: [{ at: p, pause: true }, { at: p, focus: 'booster' }] });
    expect(r.frames.every((f) => f.p === p)).toBe(true);
    const end = r.frames[r.frames.length - 1];
    expect(end.focus).toBe('booster');
    expect(end.offAxis).toBeLessThan(2);
    expect(end.blends).toBe(1);
  });
});

describe('body availability', () => {
  it('shots never frame a body that is not present', () => {
    const leo = tl('leo');
    frame.tl = leo;
    const s = frame.bodies.satellite;
    s.present = false;
    s.pos.set(7e6, 0, 0);
    const out = makePose();
    expect(evalShot({ kind: 'chase', from: 0, to: 1, subject: 'satellite' }, 100, { aspect: 16 / 9, decor: 0 }, out)).toBe(false);
    expect(evalFree('satellite', { az: 0, el: 0, dist: 50 }, { aspect: 16 / 9, decor: 0 }, out)).toBe(false);
  });

  it('a subject not yet in the world falls back to a visible body', () => {
    const leo = tl('leo');
    frame.tl = leo;
    for (const id of ['booster', 'upper', 'fairingA', 'fairingB', 'satellite', 'capsule', 'service', 'les', 'station'] as const) frame.bodies[id].present = false;
    frame.bodies.upper.present = true;
    expect(fallbackSubject('satellite', 10)).toBe('upper');
    expect(fallbackSubject('capsule', 10)).toBe('upper');
  });

  for (const id of ['leo', 'suborbital', 'gto', 'station', 'return', 'lunar'] as MissionId[]) {
    it(`${id}: every framed subject is present in every frame (Auto, whole mission)`, () => {
      const m = tl(id);
      const r = traceFlight({ mission: m, mode: 'auto', fps: 30, rate: 4 });
      let bad = 0;
      for (const f of r.frames) {
        const tr = m.bodies[f.focus];
        if (!tr) continue;
        if (f.t < tr.exists[0] || f.t > tr.exists[1]) bad++;
      }
      expect(bad).toBe(0);
      expect(r.metrics.offscreen).toBe(0);
    });
  }

  it('Chase following a body the mission does not have falls back without NaN', () => {
    const ret = tl('return');
    const r = traceFlight({ mission: ret, mode: 'chase', focus: 'booster', p1: 20, fps: 30 });
    for (const f of r.frames) expect(Number.isFinite(f.pos.x + f.pos.y + f.pos.z + f.fov)).toBe(true);
    expect(r.frames[r.frames.length - 1].focus).not.toBe('booster');
  });
});

describe('interrupted and rapid transitions', () => {
  it('Auto, Chase, Onboard, Free, Auto in quick succession settles on Auto with a bounded stack', () => {
    const leo = tl('leo');
    const p = missionToPres(leo.pres, 100);
    const r = traceFlight({
      mission: leo,
      mode: 'auto',
      p0: p,
      p1: p + 6,
      fps: 60,
      actions: [
        { at: p + 1, mode: 'chase' },
        { at: p + 1.25, mode: 'onboard' },
        { at: p + 1.5, mode: 'free' },
        { at: p + 1.75, mode: 'auto' },
        { at: p + 1.8, mode: 'ground' },
        { at: p + 1.85, mode: 'chase' },
        { at: p + 1.9, mode: 'auto' },
      ],
    });
    expect(r.metrics.maxBlends).toBeLessThanOrEqual(3);
    const end = r.frames[r.frames.length - 1];
    expect(end.mode).toBe('auto');
    expect(end.key.startsWith('auto:')).toBe(true);
    expect(end.blends).toBe(1);
    expect(r.metrics.maxTurnDeg).toBeLessThan(8);
    expect(r.metrics.maxRollDeg).toBeLessThan(8);
    expect(r.metrics.minAlt).toBeGreaterThan(1);
  });

  it('a drag takes control from the displayed pose without a jump', () => {
    const leo = tl('leo');
    const p = missionToPres(leo.pres, 120);
    const r = traceFlight({ mission: leo, mode: 'chase', focus: 'booster', p0: p, p1: p + 2, fps: 60, actions: [{ at: p + 0.5, drag: { dx: 40, dy: 0 } }] });
    const i = r.frames.findIndex((f) => f.p >= p + 0.5);
    expect(r.frames[i].mode).toBe('free');
    for (let k = i; k < r.frames.length; k++) expect(turn(r.frames[k - 1], r.frames[k])).toBeLessThan(3);
    expect(r.frames[i].pos.distanceTo(r.frames[i - 1].pos)).toBeLessThan(r.frames[i - 1].pos.distanceTo(r.frames[i - 2].pos) * 2 + 1);
  });
});

describe('reduced motion', () => {
  it('camera changes are short dissolves, never camera flights', () => {
    const leo = tl('leo');
    const p = missionToPres(leo.pres, 100);
    const r = traceFlight({ mission: leo, mode: 'auto', p0: p, p1: p + 4, fps: 60, reduced: true, actions: [{ at: p + 0.5, mode: 'chase' }, { at: p + 1.5, mode: 'ground' }, { at: p + 2.5, mode: 'auto' }] });
    expect(r.metrics.pushes).toBe(0);
    expect(r.metrics.cuts).toBeGreaterThanOrEqual(4);
    expect(r.metrics.maxBlends).toBe(1);
  });
});

describe('continuity of every mission (Auto, real-time playback, 60 fps)', () => {
  for (const id of ['leo', 'suborbital', 'gto', 'station', 'return', 'lunar'] as MissionId[]) {
    it(`${id}: no jumps, no horizon flips, never below ground, subject always in view`, () => {
      const m = tl(id);
      const r = traceFlight({ mission: m, mode: 'auto', fps: 60, p1: Math.min(presDuration(m.pres), 900) });
      expect(r.metrics.maxTurnDeg).toBeLessThan(4);
      expect(r.metrics.maxRollDeg).toBeLessThan(4);
      expect(r.metrics.maxFovStep).toBeLessThan(0.08);
      expect(r.metrics.minAlt).toBeGreaterThan(1);
      expect(r.metrics.offscreen).toBe(0);
      expect(r.metrics.maxBlends).toBeLessThanOrEqual(3);
    });
  }

  it('the booster storyline keeps the shared mission time and stays continuous', () => {
    const leo = tl('leo');
    const r = traceFlight({ mission: leo, mode: 'auto', focus: 'booster', followPhaseFocus: false, t0: ev(leo, 'stage-sep') - 2, p1: missionToPres(leo.pres, ev(leo, 'touchdown') + 10), fps: 60 });
    // (the landing-zone camera pans after a booster falling past it: up to ~4°/frame there)
    expect(r.metrics.maxTurnDeg).toBeLessThan(5);
    expect(r.metrics.offscreen).toBe(0);
    const br = leo.branches[0];
    // inside the storyline's time span the booster's own shot list is used, on the shared clock
    expect(r.frames.filter((f) => f.t >= br.start + 0.1 && f.t <= br.end).every((f) => f.key.startsWith(`auto:${br.id}:`))).toBe(true);
  });
});

describe('travel frame stability', () => {
  it('Chase on the booster through boostback: no heading flip as its horizontal velocity reverses', () => {
    const leo = tl('leo');
    const r = traceFlight({ mission: leo, mode: 'chase', focus: 'booster', followPhaseFocus: false, t0: ev(leo, 'boostback-start') - 5, p1: missionToPres(leo.pres, ev(leo, 'boostback-end') + 5), fps: 60 });
    expect(r.metrics.maxTurnDeg).toBeLessThan(2);
    expect(r.metrics.maxRollDeg).toBeLessThan(1);
  });

  it('Chase on the booster through the landing (near stationary) holds its heading', () => {
    const leo = tl('leo');
    const r = traceFlight({ mission: leo, mode: 'chase', focus: 'booster', followPhaseFocus: false, t0: ev(leo, 'landing-start') - 5, p1: missionToPres(leo.pres, ev(leo, 'touchdown') + 8), fps: 60 });
    expect(r.metrics.maxTurnDeg).toBeLessThan(2);
    expect(r.metrics.minAlt).toBeGreaterThan(1);
  });

  it('the sun-side swing of coast cameras is continuous', () => {
    const b = makeBasis();
    b.up.set(0, 1, 0);
    let prev: number | null = null;
    // rotate the travel frame through a full turn in small steps; the chosen azimuth must never jump
    for (let a = 0; a <= 720; a += 0.25) {
      const r = (a * Math.PI) / 180;
      b.fwd.set(Math.cos(r), 0, Math.sin(r));
      b.side.crossVectors(b.fwd, b.up);
      b.up.set(Math.sin(r * 0.37) * 0.8, 1, 0).normalize();
      b.fwd.addScaledVector(b.up, -b.fwd.dot(b.up)).normalize();
      b.side.crossVectors(b.fwd, b.up).normalize();
      const az = sunSideAz(25, b);
      if (prev !== null) {
        const d = Math.abs(((((az - prev + 180) % 360) + 360) % 360) - 180);
        expect(d).toBeLessThan(6);
      }
      prev = az;
    }
  });
});

describe('seeking', () => {
  it('a seek shows the new moment at once, identical to evaluating there directly', () => {
    const leo = tl('leo');
    const pA = missionToPres(leo.pres, 30);
    const pB = missionToPres(leo.pres, 180);
    const a = traceFlight({ mission: leo, mode: 'chase', focus: 'upper', p0: pA, p1: pB + 0.2, fps: 60, actions: [{ at: pA + 1, seek: pB }] });
    const b = traceFlight({ mission: leo, mode: 'chase', focus: 'upper', p0: pB, p1: pB + 0.2, fps: 60 });
    const fa = a.frames[a.frames.length - 1];
    const fb = b.frames[b.frames.length - 1];
    expect(fa.pos.distanceTo(fb.pos)).toBeLessThan(1e-3);
    expect(fa.dir.angleTo(fb.dir)).toBeLessThan(1e-6);
  });

  it('repeated seeks do not grow the transition stack or leave pending cuts', () => {
    const leo = tl('leo');
    const acts = Array.from({ length: 40 }, (_, i) => ({ at: 5 + i * 0.05, seek: 20 + ((i * 37) % 400) }));
    traceFlight({ mission: leo, mode: 'auto', p0: 5, p1: 8, fps: 60, actions: acts });
    expect(director.blends.length).toBeLessThanOrEqual(2);
    expect(director.pendingCut).toBe(null);
  });
});

describe('clocks', () => {
  it('slow frames advance mission time and camera transitions by the same capped step', () => {
    const leo = tl('leo');
    const p = missionToPres(leo.pres, 100);
    // 400 ms frames (2.5 fps): each frame advances 0.25 s of everything
    const r = traceFlight({ mission: leo, mode: 'auto', p0: p, p1: p + 5, dtAt: () => 0.4, actions: [{ at: p + 0.5, mode: 'chase' }] });
    for (let i = 1; i < r.frames.length; i++) expect(r.frames[i].p - r.frames[i - 1].p).toBeCloseTo(0.25, 6);
    expect(r.metrics.minAlt).toBeGreaterThan(1);
  });

  it('a long stall costs one capped step: nothing leaps forward', () => {
    const leo = tl('leo');
    const p = missionToPres(leo.pres, 100);
    const r = traceFlight({ mission: leo, mode: 'chase', focus: 'booster', p0: p, p1: p + 1, dtAt: (i) => (i === 10 ? 30 : 1 / 60) });
    expect(r.frames[11].p - r.frames[10].p).toBeCloseTo(0.25, 6);
    expect(turn(r.frames[10], r.frames[11])).toBeLessThan(2);
  });

  it('playback rate scales mission time only: transitions keep their real duration', () => {
    const leo = tl('leo');
    const p = missionToPres(leo.pres, 100);
    const slow = traceFlight({ mission: leo, mode: 'auto', p0: p, p1: p + 3, fps: 60, rate: 1, actions: [{ at: p + 0.1, mode: 'chase' }] });
    const fast = traceFlight({ mission: leo, mode: 'auto', p0: p, p1: p + 24, fps: 60, rate: 8, actions: [{ at: p + 0.1, mode: 'chase' }] });
    // frames from the mode change until the transition has finished
    const settle = (fr: TraceFrame[]) => {
      const i0 = fr.findIndex((f) => f.mode === 'chase');
      return fr.findIndex((f, i) => i > i0 && f.blends === 1) - i0;
    };
    const a = settle(slow.frames);
    const b = settle(fast.frames);
    expect(a).toBeGreaterThan(60);
    expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
  });
});

describe('clearance', () => {
  it('the camera never enters a vehicle hull or the ground in any mode around liftoff', () => {
    const leo = tl('leo');
    for (const mode of ['auto', 'ground', 'chase', 'free'] as const) {
      const r = traceFlight({ mission: leo, mode, focus: 'booster', t0: -8, p1: missionToPres(leo.pres, 25), fps: 30, actions: mode === 'free' ? [{ at: 5, drag: { dx: 0, dy: 0, zoom: -4000 } }] : [] });
      expect(r.metrics.minAlt).toBeGreaterThan(1);
      const b = makeBodyState();
      for (const f of r.frames) {
        bodyAt(leo.bodies.booster!, f.t, b);
        // distance from the vehicle axis at the camera's height along it
        const q = b.quat.clone().invert();
        const local = f.pos.clone().sub(b.pos).applyQuaternion(q);
        if (local.y > -1 && local.y < 68 && mode !== 'auto') expect(Math.hypot(local.x, local.z)).toBeGreaterThan(2.5);
      }
    }
  });
});

void flightStats;
void loadTimeline;
void THREE;
