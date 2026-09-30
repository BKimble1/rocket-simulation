import { describe, it } from 'vitest';
import { traceFlight, type TraceFrame } from './trace';
import { buildMission } from '../timeline/build';
import { missionToPres } from '../timeline/sample';
import type { MissionId } from '../timeline/types';

const fmt = (m: Record<string, number>) => Object.entries(m).map(([k, v]) => `${k}=${typeof v === 'number' ? +v.toFixed(2) : v}`).join(' ');
function worst(frames: TraceFrame[]) {
  let turn = { d: 0, f: frames[0], a: frames[0] };
  let roll = { d: 0, f: frames[0], a: frames[0] };
  let low = frames[0];
  const off: string[] = [];
  let offRun = 0;
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1], b = frames[i];
    if (b.alt < low.alt) low = b;
    const isOff = b.visible === false;
    if (isOff) { if (offRun === 0) off.push(`t=${b.t.toFixed(0)} ${b.key} off=${b.offAxis.toFixed(0)} fov=${b.fov.toFixed(0)}`); offRun++; } else { if (offRun) off[off.length-1] += ` (${offRun} frames to t=${a.t.toFixed(0)})`; offRun = 0; }
    if (b.cut) continue;
    const d = (a.dir.angleTo(b.dir) * 180) / Math.PI;
    const r = (a.up.angleTo(b.up) * 180) / Math.PI;
    if (d > turn.d) turn = { d, f: b, a };
    if (r > roll.d) roll = { d: r, f: b, a };
  }
  return `\n   worst turn ${turn.d.toFixed(1)}deg at t=${turn.f.t.toFixed(1)} ${turn.a.key} -> ${turn.f.key}\n   worst roll ${roll.d.toFixed(1)}deg at t=${roll.f.t.toFixed(1)} ${roll.a.key} -> ${roll.f.key}\n   lowest ${low.alt.toFixed(0)} m at t=${low.t.toFixed(1)} ${low.key}\n   offscreen runs start: ${off.slice(0, 8).join(' | ')}`;
}

describe('camera audit (report only)', () => {
  it('reports', () => {
    const out: string[] = [];
    const leo = buildMission('leo');
    const T = (id: string) => leo.events.find((e) => e.id === id)?.t ?? NaN;
    for (const mode of ['ground', 'chase', 'onboard'] as const) {
      const r = traceFlight({ mission: leo, mode, focus: 'booster', t0: -5, p1: missionToPres(leo.pres, 60), fps: 60 });
      out.push(`leo ${mode} T-5..T+60: ${fmt(r.metrics as never)}${worst(r.frames)}`);
    }
    for (const id of ['leo', 'suborbital', 'gto', 'station', 'return', 'lunar'] as MissionId[]) {
      const tl = buildMission(id);
      const r = traceFlight({ mission: tl, mode: 'auto', fps: 30, rate: 4 });
      out.push(`${id} auto full x4: ${fmt(r.metrics as never)}${worst(r.frames)}`);
    }
    {
      const p = missionToPres(leo.pres, 100);
      const r = traceFlight({ mission: leo, mode: 'auto', p0: p, p1: p + 8, fps: 60, actions: [
        { at: p + 1, mode: 'chase' }, { at: p + 1.3, mode: 'onboard' }, { at: p + 1.6, mode: 'free' }, { at: p + 1.9, mode: 'auto' } ] });
      out.push(`rapid modes: ${fmt(r.metrics as never)}${worst(r.frames)}`);
    }
    {
      const ts = T('stage-sep');
      const p = missionToPres(leo.pres, ts + 150);
      const r = traceFlight({ mission: leo, mode: 'free', focus: 'upper', p0: p, p1: p + 6, fps: 60, actions: [{ at: p + 1, focus: 'booster' }] });
      const last = r.frames[r.frames.length - 1];
      out.push(`free focus upper->booster at T+${(ts+150).toFixed(0)}: booster offAxis at end=${last.offAxis.toFixed(1)}deg half=${last.halfFov.toFixed(1)} ${fmt(r.metrics as never)}`);
    }
    {
      const r = traceFlight({ mission: leo, mode: 'auto', focus: 'booster', followPhaseFocus: false, t0: T('stage-sep') + 1, p1: missionToPres(leo.pres, T('stage-sep') + 340), fps: 30 });
      out.push(`booster branch auto: ${fmt(r.metrics as never)}${worst(r.frames)}`);
      const r2 = traceFlight({ mission: leo, mode: 'chase', focus: 'booster', followPhaseFocus: false, t0: T('boostback-start') - 5, p1: missionToPres(leo.pres, T('boostback-end') + 5), fps: 30 });
      out.push(`booster chase over boostback: ${fmt(r2.metrics as never)}${worst(r2.frames)}`);
    }
    console.log('\n' + out.join('\n'));
  }, 600000);
});
