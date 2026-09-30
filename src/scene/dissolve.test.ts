/**
 * Picture dissolves (V2). V1 copied the newly rendered scene before drawing the running dissolve,
 * so a change requested during a dissolve started from a picture the viewer never saw (in the
 * baseline reproduction: black frames). The stage now captures after the frame is complete.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { afterDraw, cancelPending, dissolve, requestDissolve, setHold, snapshotAlpha } from './dissolve';

beforeEach(() => {
  dissolve.pending = [];
  dissolve.active = null;
  dissolve.hold = false;
  dissolve.captures = 0;
});

/** A fake frame: what is on screen is the scene with the running snapshot over it. */
function drawFrame(scene: string, snapshot: { img: string | null }, now: number): string {
  const a = snapshotAlpha(now);
  return a > 0 && snapshot.img ? `${snapshot.img}@${a.toFixed(2)} over ${scene}` : scene;
}

describe('dissolves', () => {
  it('captures what is displayed, after the running dissolve is drawn', () => {
    const snap = { img: null as string | null };
    let loc = 'hangar';
    // frame 1: hangar; request flight
    let shown = drawFrame(loc, snap, 0);
    requestDissolve('location', 0.5, () => (loc = 'flight'));
    afterDraw(() => ((snap.img = shown), true), 0);
    expect(snap.img).toBe('hangar');
    // frame 2: flight with the hangar fading over it; interrupt: back to the hangar
    shown = drawFrame(loc, snap, 0.1);
    expect(shown).toContain('hangar@');
    requestDissolve('location', 0.5, () => (loc = 'hangar'));
    afterDraw(() => ((snap.img = shown), true), 0.1);
    // the new dissolve starts from the composite the viewer saw, not from the raw flight render
    expect(snap.img).toContain('over flight');
    expect(dissolve.captures).toBe(2);
    expect(dissolve.active?.start).toBe(0.1);
  });

  it('applies several requests of one frame with one capture, in order', () => {
    const log: string[] = [];
    requestDissolve('cut', 0.6, () => log.push('cut'));
    requestDissolve('jump', 0.45, () => log.push('jump'));
    afterDraw(() => true, 1);
    expect(log).toEqual(['cut', 'jump']);
    expect(dissolve.captures).toBe(1);
    expect(dissolve.active?.dur).toBe(0.6);
  });

  it('without a renderer the change is applied as a plain cut', () => {
    let applied = false;
    requestDissolve('cut', 0.6, () => (applied = true));
    afterDraw(() => false, 0);
    expect(applied).toBe(true);
    expect(dissolve.active).toBe(null);
    expect(snapshotAlpha(0.1)).toBe(0);
  });

  it('fades out smoothly and ends', () => {
    requestDissolve('cut', 1, () => {});
    afterDraw(() => true, 0);
    let prev = 1.01;
    for (let t = 0; t <= 1.05; t += 0.05) {
      const a = snapshotAlpha(t);
      expect(a).toBeLessThanOrEqual(prev);
      prev = a;
    }
    expect(dissolve.active).toBe(null);
  });

  it('holds the snapshot over an omitted interval, then fades from the moment it is released', () => {
    requestDissolve('omit', 0.8, () => setHold(true, 0));
    afterDraw(() => true, 0);
    expect(snapshotAlpha(3)).toBe(1);
    setHold(false, 4);
    expect(snapshotAlpha(4)).toBe(1);
    expect(snapshotAlpha(4.4)).toBeGreaterThan(0);
    expect(snapshotAlpha(4.4)).toBeLessThan(1);
    expect(snapshotAlpha(4.81)).toBe(0);
  });

  it('a seek cancels a pending camera cut', () => {
    let applied = false;
    requestDissolve('cut', 0.6, () => (applied = true));
    cancelPending('cut');
    afterDraw(() => true, 0);
    expect(applied).toBe(false);
  });
});
