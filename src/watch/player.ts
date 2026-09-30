/**
 * The film player (Watch mode). The stage's frame step drives film time (scene/clock.ts); the
 * narration audio is kept in step with it. Speech can never run ahead of the picture or lag
 * behind it, and it is never restarted as a way of correcting drift:
 *   - if the segment that should be speaking is not ready (buffering), the clock HOLDS until
 *     it is, then both continue from the same moment;
 *   - small drift is corrected by nudging the audio's playback rate by a few percent (pitch
 *     preserved), which is inaudible;
 *   - when frames are too slow for real time, the picture falls behind the voice: the audio then
 *     waits (paused where it is) until the picture catches up, instead of being re-seeked;
 *   - only an audio that lags far behind the picture (after buffering or a device sleep) is
 *     re-seeked, once;
 *   - a scene that is still loading holds the clock too (hold('loading')), with the narration
 *     paused where it is;
 *   - seeking sets the film time directly; nothing replays and no events fire;
 *   - a hidden tab pauses the film (it resumes aligned when the viewer returns).
 * Without audio (narration off, or it failed to load) the film runs on captions alone, with
 * the same timing.
 */
import { asset } from '../config';
import { cueAt, filmMission, segmentAt, type Film, type FilmSegment } from './film';
import { stepPres } from '../timeline/sample';

export type FilmHold = 'loading' | 'buffering' | 'dialog' | 'inspect';

/** Drift (s) beyond which the audio waits for the picture, and beyond which a lagging audio is re-seeked. */
const AUDIO_WAIT = 0.25;
const AUDIO_RESEEK = 0.6;

const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';

let pair: HTMLAudioElement[] | null = null;
/** Create (and, inside a user gesture, unlock) the two narration elements. */
export function filmAudio(unlock = false): HTMLAudioElement[] | null {
  if (typeof Audio === 'undefined') return null;
  if (!pair) {
    pair = [new Audio(), new Audio()];
    for (const el of pair) {
      el.preload = 'auto';
      (el as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
    }
  }
  if (unlock)
    for (const el of pair) {
      el.src = SILENT;
      el.play()
        .then(() => el.pause())
        .catch(() => {});
    }
  return pair;
}

export class FilmPlayer {
  p = 0;
  playing = false;
  rate = 1;
  ended = false;
  narration = true;
  audioOk: boolean;
  audioError: string | null = null;
  private holds = new Set<FilmHold>();
  private listeners = new Set<() => void>();
  private els: HTMLAudioElement[];
  private holdsSeg: (string | null)[] = [null, null];
  private active = -1;
  private onVis = () => {
    if (document.hidden && this.playing) {
      this.pause();
      this.pausedByHide = true;
    }
  };
  private pausedByHide = false;
  /** The film paused itself because the tab was hidden. */
  get pausedWhileHidden(): boolean {
    return this.pausedByHide;
  }

  constructor(
    public film: Film,
    private base: string,
    els: HTMLAudioElement[] | null,
  ) {
    this.els = els ?? [];
    this.audioOk = this.els.length === 2 && film.segments.some((s) => s.file);
    for (const el of this.els) el.addEventListener('error', this.onError);
    document.addEventListener('visibilitychange', this.onVis);
  }

  private onError = (e: Event) => {
    const el = e.target as HTMLAudioElement;
    if (!el.src || el.src.startsWith('data:')) return;
    this.audioOk = false;
    this.audioError = 'The narration audio could not be loaded; continuing with captions.';
    this.holds.delete('buffering');
    for (const x of this.els) x.pause();
    this.changed();
  };

  get missionTime(): number {
    return filmMission(this.film, this.p);
  }
  get duration(): number {
    return this.film.duration;
  }
  get held(): boolean {
    return this.holds.size > 0;
  }
  holdReasons(): FilmHold[] {
    return [...this.holds];
  }
  get cue() {
    return cueAt(this.film, this.p);
  }

  subscribe(f: () => void) {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }
  private changed() {
    for (const f of this.listeners) f();
  }

  play() {
    if (this.ended || this.p >= this.duration - 0.01) {
      this.p = 0;
      this.ended = false;
    }
    this.playing = true;
    this.pausedByHide = false;
    this.sync(true);
    this.changed();
  }
  pause() {
    this.playing = false;
    for (const el of this.els) el.pause();
    this.holds.delete('buffering');
    this.changed();
  }
  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }
  seek(p: number) {
    this.p = Math.max(0, Math.min(this.duration, p));
    this.ended = false;
    for (const el of this.els) el.pause();
    this.active = -1;
    this.holds.delete('buffering');
    this.sync(true);
    this.changed();
  }
  setRate(r: number) {
    this.rate = r;
    for (const el of this.els) el.playbackRate = r;
    this.changed();
  }
  setNarration(on: boolean) {
    this.narration = on;
    if (!on) {
      for (const el of this.els) el.pause();
      this.holds.delete('buffering');
    }
    this.sync(true);
    this.changed();
  }
  retryAudio() {
    this.audioOk = this.els.length === 2;
    this.audioError = null;
    this.holdsSeg = [null, null];
    this.active = -1;
    this.sync(true);
    this.changed();
  }
  hold(reason: FilmHold, on: boolean) {
    if (on === this.holds.has(reason)) return;
    if (on) this.holds.add(reason);
    else this.holds.delete(reason);
    if (on && reason !== 'buffering') for (const el of this.els) el.pause();
    if (!on) this.sync(true);
    this.changed();
  }
  dispose() {
    for (const el of this.els) {
      el.pause();
      el.removeEventListener('error', this.onError);
    }
    document.removeEventListener('visibilitychange', this.onVis);
  }

  /** Advance by a real-time delta; returns true if film time moved. */
  tick(dt: number): boolean {
    if (!this.playing || this.ended) return false;
    // the audio decides whether we may move: buffering holds the clock
    this.sync(false);
    const blocking = [...this.holds].filter((h) => h !== 'buffering' || this.useAudio()).length > 0;
    if (blocking) return false;
    const step = stepPres(this.film.pres, this.p, Math.min(dt, 0.25) * this.rate, this.duration);
    this.p = step.p;
    if (step.entered) this.enteredOmitted = true;
    if (this.p >= this.duration - 1e-3) {
      this.p = this.duration;
      this.ended = true;
      this.playing = false;
      for (const el of this.els) el.pause();
      this.changed();
    }
    this.preload();
    return true;
  }

  private useAudio(): boolean {
    return this.audioOk && this.narration && this.els.length === 2;
  }

  private sync(force: boolean) {
    if (!this.useAudio()) return;
    const seg = segmentAt(this.film, this.p);
    if (!seg || !seg.file) {
      for (const el of this.els) if (!el.paused) el.pause();
      this.active = -1;
      if (this.holds.delete('buffering')) this.changed();
      return;
    }
    let i = this.holdsSeg.indexOf(seg.id);
    if (i < 0) {
      i = this.active === 0 ? 1 : 0;
      this.load(i, seg);
    }
    const el = this.els[i];
    if (this.active !== i) {
      for (let k = 0; k < this.els.length; k++) if (k !== i) this.els[k].pause();
      this.active = i;
      force = true;
    }
    const want = this.p - seg.start;
    const shouldPlay = this.playing && !this.holds.has('loading') && !this.holds.has('dialog') && !this.holds.has('inspect');
    if (el.readyState < 3) {
      if (shouldPlay && !this.holds.has('buffering')) {
        this.holds.add('buffering');
        this.changed();
      }
      return;
    }
    if (this.holds.delete('buffering')) this.changed();
    // positive drift: the voice is ahead of the picture
    const drift = el.currentTime - want;
    let rate = this.rate;
    if (force || drift < -AUDIO_RESEEK) {
      try {
        el.currentTime = Math.max(0, want);
        if (!force) this.audioReseeks++;
      } catch {
        /* not seekable yet */
      }
      this.waitingForPicture = false;
    } else if (drift > AUDIO_WAIT) {
      // frames are too slow for real time: let the picture catch up with the voice
      this.waitingForPicture = true;
    } else if (this.waitingForPicture && drift <= 0.02) {
      this.waitingForPicture = false;
    } else if (Math.abs(drift) > 0.03) {
      rate = this.rate * (1 - Math.max(-0.06, Math.min(0.06, drift * 0.6)));
    }
    if (Math.abs(el.playbackRate - rate) > 1e-3) el.playbackRate = rate;
    const play = shouldPlay && !this.waitingForPicture;
    if (play && el.paused) el.play().catch(() => this.blocked());
    else if (!play && !el.paused) el.pause();
  }

  /** Playback just entered an omitted interval (read and cleared by the stage tick). */
  enteredOmitted = false;
  /** Audio re-seeks made to correct drift (not user seeks): diagnostics and tests. */
  audioReseeks = 0;
  /** The voice is waiting for the picture to catch up (slow frames). */
  waitingForPicture = false;

  private blocked() {
    // autoplay refused (no gesture): stop and let the viewer press Play
    this.playing = false;
    this.changed();
  }

  private load(i: number, seg: FilmSegment) {
    const el = this.els[i];
    this.holdsSeg[i] = seg.id;
    el.src = asset(this.base + seg.file);
    el.load();
  }

  private preload() {
    if (!this.useAudio()) return;
    const cur = segmentAt(this.film, this.p);
    const next = this.film.segments.find((s) => s.start > this.p && s.file);
    if (!next || this.holdsSeg.includes(next.id)) return;
    if (cur && next.start - this.p > 6) return;
    const idle = this.active === 0 ? 1 : 0;
    if (cur && this.holdsSeg[idle] === cur.id) return;
    this.load(idle, next);
  }
}
