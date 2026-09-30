/**
 * Narration alignment (V2). V1 re-seeked the narration whenever it drifted more than 120 ms from
 * the film clock; with frames slower than the step cap, that restarted the audio almost every
 * frame. The film player now nudges the audio rate for small drift and lets the voice wait for the
 * picture when frames are too slow, without restarting it.
 */
import { describe, expect, it, vi } from 'vitest';

vi.stubGlobal('document', { hidden: false, addEventListener() {}, removeEventListener() {} });
vi.stubGlobal('window', { location: { search: '' } });
const { FilmPlayer } = await import('./player');
type Film = ConstructorParameters<typeof FilmPlayer>[0];

class FakeAudio {
  currentTime = 0;
  paused = true;
  readyState = 4;
  playbackRate = 1;
  src = '';
  preload = '';
  play() {
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  load() {}
  addEventListener() {}
  removeEventListener() {}
}

const film = (): Film => ({
  mission: 'leo',
  pres: [{ p0: 0, p1: 200, m0: 0, m1: 200 }],
  duration: 200,
  segments: [{ id: 's1', file: 'a.mp3', start: 0, dur: 150, cues: [] }],
  chapters: [],
});

function make() {
  const els = [new FakeAudio(), new FakeAudio()];
  const p = new FilmPlayer(film(), 'narration/', els as unknown as HTMLAudioElement[]);
  return { p, els };
}

/** One frame: the audio plays on for `real` seconds of wall time, the film advances its capped step. */
function frameOf(p: InstanceType<typeof FilmPlayer>, els: FakeAudio[], real: number, audioSpeed = 1) {
  for (const el of els) if (!el.paused) el.currentTime += real * el.playbackRate * audioSpeed;
  p.tick(real);
}

describe('narration stays aligned without restarts', () => {
  it('slow frames: the voice waits for the picture, it is never re-seeked', () => {
    const { p, els } = make();
    p.play();
    let waited = 0;
    let maxDrift = 0;
    for (let i = 0; i < 200; i++) {
      frameOf(p, els, 0.4);
      const el = els.find((e) => e.src.endsWith('a.mp3'))!;
      maxDrift = Math.max(maxDrift, el.currentTime - p.p);
      if (p.waitingForPicture) waited++;
    }
    expect(p.audioReseeks).toBe(0);
    expect(waited).toBeGreaterThan(10);
    expect(maxDrift).toBeLessThan(0.7);
    expect(p.p).toBeGreaterThan(40);
  });

  it('small drift is corrected by the playback rate, not by seeking', () => {
    const { p, els } = make();
    p.play();
    let nudged = false;
    for (let i = 0; i < 60 * 60; i++) {
      frameOf(p, els, 1 / 60, 1.01);
      const el = els.find((e) => e.src.endsWith('a.mp3'))!;
      if (el.playbackRate < 0.999) nudged = true;
    }
    const el = els.find((e) => e.src.endsWith('a.mp3'))!;
    expect(p.audioReseeks).toBe(0);
    expect(nudged).toBe(true);
    expect(Math.abs(el.currentTime - p.p)).toBeLessThan(0.1);
  });

  it('a voice lagging far behind (after a stall of the audio) is re-seeked once', () => {
    const { p, els } = make();
    p.play();
    for (let i = 0; i < 30; i++) frameOf(p, els, 1 / 60);
    const el = els.find((e) => e.src.endsWith('a.mp3'))!;
    el.currentTime -= 2;
    for (let i = 0; i < 30; i++) frameOf(p, els, 1 / 60);
    expect(p.audioReseeks).toBe(1);
    expect(Math.abs(el.currentTime - p.p)).toBeLessThan(0.1);
  });
});
