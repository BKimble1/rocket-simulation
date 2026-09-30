/**
 * Automatic quality tier (V2). V1 fed the monitor CPU render time and skipped any 2-second window
 * with fewer than 20 samples, so a device running at a few frames per second never stepped down.
 * The monitor now judges real frame intervals, counts missed frames, treats sparse windows as
 * severely slow, and keeps its hysteresis.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.stubGlobal('window', { location: { search: '' } });
const { perf, useQuality, PERF_RULES } = await import('./quality');

/** Feed frames at a fixed interval for `seconds`, starting at t0 (ms). Returns the end time. */
function run(intervalMs: number, seconds: number, t0: number, cpuMs = 2): number {
  let t = t0;
  const n = Math.round((seconds * 1000) / intervalMs);
  for (let i = 0; i < n; i++) {
    t += intervalMs;
    perf.pushFrame(intervalMs, cpuMs, t);
  }
  return t;
}

beforeEach(() => {
  perf.reset();
  useQuality.setState({ tier: 'high', manual: null, reason: 'test' });
});

describe('automatic tier', () => {
  it('steps down when frames are sparse (4 fps), which V1 never judged', () => {
    // two sparse windows (each counts as severely slow) are enough
    let t = run(250, 4.5, 0, 3);
    expect(perf.last?.why).toBe('sparse');
    expect(useQuality.getState().tier).toBe('medium');
    t = run(250, 4, t, 3);
    // and keeps stepping down while it stays that slow (after the warm-up that follows a change)
    run(250, 12, t, 3);
    expect(useQuality.getState().tier).toBe('low');
  });

  it('judges the frame interval, not the CPU time spent issuing the frame', () => {
    // GPU-bound: 3 ms of CPU per frame, but only 22 frames per second on screen
    run(45, 8, 0, 3);
    expect(useQuality.getState().tier).toBe('medium');
  });

  it('stays put at a steady 60 fps and at the phone target of 30 fps', () => {
    run(16.7, 20, 0);
    expect(useQuality.getState().tier).toBe('high');
    run(33.3, 20, 30_000);
    expect(useQuality.getState().tier).toBe('high');
  });

  it('does not oscillate: after stepping down it does not step straight back up', () => {
    let t = run(60, 8, 0);
    expect(useQuality.getState().tier).toBe('medium');
    // fast again for two minutes: not enough to return to the tier it just left
    t = run(15, 120, t);
    expect(useQuality.getState().tier).toBe('medium');
    // after the long cool-down it may
    t = run(15, 120, t);
    expect(useQuality.getState().tier).toBe('high');
  });

  it('ignores stalls and hidden time, and the warm-up after a location change', () => {
    let t = 0;
    for (let i = 0; i < 12; i++) {
      t = run(16.7, 1.5, t);
      t += 5000;
      perf.pushFrame(5000, 1, t); // a stall (hidden tab)
    }
    expect(useQuality.getState().tier).toBe('high');
    expect(perf.stalls).toBe(12);
    perf.warmup(t);
    run(80, PERF_RULES.warmupMs / 1000 - 0.1, t);
    expect(useQuality.getState().tier).toBe('high');
  });

  it('counts missed 60 Hz frames', () => {
    run(50, 2.2, 0);
    expect(perf.missedTotal).toBeGreaterThan(80);
  });

  it('never changes a tier chosen in settings or forced', () => {
    useQuality.setState({ manual: 'high', tier: 'high' });
    run(250, 20, 0);
    expect(useQuality.getState().tier).toBe('high');
  });
});
