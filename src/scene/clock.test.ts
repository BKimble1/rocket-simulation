import { describe, expect, it, vi } from 'vitest';

vi.stubGlobal('window', { location: { search: '' } });
const { frameStep, MAX_STEP } = await import('./clock');
const { MissionPlayer } = await import('../timeline/player');
const { buildMission } = await import('../timeline/build');
const { stepPres, inOmitted, missionToPres } = await import('../timeline/sample');

describe('clocks', () => {
  it('the frame step is the real interval, capped', () => {
    expect(frameStep(1 / 60)).toBeCloseTo(1 / 60, 9);
    expect(frameStep(0.4)).toBe(MAX_STEP);
    expect(frameStep(30)).toBe(MAX_STEP);
    expect(frameStep(-1)).toBe(0);
  });

  it('the mission player advances presentation time by step x rate, and never past a cap', () => {
    const tl = buildMission('leo');
    const pl = new MissionPlayer(tl);
    pl.seek(missionToPres(tl.pres, 10));
    pl.play();
    const p0 = pl.p;
    pl.tick(1 / 60);
    expect(pl.p - p0).toBeCloseTo(1 / 60, 9);
    pl.setRate(4);
    const p1 = pl.p;
    pl.tick(10);
    expect(pl.p - p1).toBeCloseTo(MAX_STEP * 4, 9);
  });

  it('pause and holds stop presentation time; resume continues from the same moment', () => {
    const tl = buildMission('leo');
    const pl = new MissionPlayer(tl);
    pl.seek(100);
    pl.play();
    pl.pause();
    pl.tick(0.1);
    expect(pl.p).toBe(100);
    pl.play();
    pl.hold('inspect', true);
    pl.tick(0.1);
    expect(pl.p).toBe(100);
    pl.hold('inspect', false);
    pl.tick(0.1);
    expect(pl.p).toBeCloseTo(100.1, 9);
  });

  it('playback stops just inside an omitted interval, so the moment before the gap is what is captured', () => {
    const tl = buildMission('station');
    const om = tl.pres.find((s) => s.omitted)!;
    const r = stepPres(tl.pres, om.p0 - 0.01, 0.2, 1e9);
    expect(r.entered).toBe(true);
    expect(r.p - om.p0).toBeLessThan(1e-5);
    expect(inOmitted(tl.pres, r.p)).toBe(true);
    // inside, it continues normally
    const r2 = stepPres(tl.pres, r.p, 0.2, 1e9);
    expect(r2.entered).toBe(false);
    expect(r2.p).toBeCloseTo(r.p + 0.2, 9);
    const pl = new MissionPlayer(tl);
    pl.seek(om.p0 - 0.01);
    pl.play();
    pl.tick(0.1);
    expect(pl.enteredOmitted).toBe(true);
  });
});
