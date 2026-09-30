/**
 * Mission playback clock (Mission explorer). Presentation time advances with the page clock
 * times the chosen speed; mission time is derived from it through the timeline's presentation
 * map, so the two can never drift apart. Seeking sets the presentation time directly (nothing
 * is replayed and no events fire). A hold (a scene still loading, or a part inspection) stops
 * the clock where it is and resumes from the same moment.
 */
import { presDuration, presToMission, eventsCrossed, stepPres } from './sample';
import type { MissionEvent, MissionTimeline } from './types';

/** Largest presentation step one frame may take at rate 1 (s); matches scene/clock.ts MAX_STEP. */
const MAX_STEP = 0.25;

export type HoldReason = 'loading' | 'inspect' | 'hidden' | 'dialog';

export class MissionPlayer {
  p = 0;
  playing = false;
  rate = 1;
  ended = false;
  private holds = new Set<HoldReason>();
  private listeners = new Set<() => void>();
  /** Events crossed by forward playback since the last drain (for one-shot sounds). */
  private crossed: MissionEvent[] = [];
  readonly duration: number;
  /** Playback just entered an omitted interval (read and cleared by the stage tick). */
  enteredOmitted = false;

  constructor(public tl: MissionTimeline) {
    this.duration = presDuration(tl.pres);
  }

  get missionTime(): number {
    return presToMission(this.tl.pres, this.p);
  }

  get held(): boolean {
    return this.holds.size > 0;
  }

  holdReasons(): HoldReason[] {
    return [...this.holds];
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private changed() {
    for (const f of this.listeners) f();
  }

  play() {
    if (this.ended || this.p >= this.duration - 1e-3) {
      this.p = 0;
      this.ended = false;
    }
    this.playing = true;
    this.changed();
  }

  pause() {
    this.playing = false;
    this.changed();
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  setRate(r: number) {
    this.rate = r;
    this.changed();
  }

  seek(p: number) {
    this.p = Math.max(0, Math.min(this.duration, p));
    this.ended = this.p >= this.duration;
    this.crossed.length = 0;
    this.changed();
  }

  hold(reason: HoldReason, on: boolean) {
    const had = this.holds.has(reason);
    if (on === had) return;
    if (on) this.holds.add(reason);
    else this.holds.delete(reason);
    this.changed();
  }

  /** Advance by a real-time delta (s). Returns true if presentation time moved. */
  tick(dt: number): boolean {
    if (!this.playing || this.held || this.ended) return false;
    const t0 = this.missionTime;
    // dt is the stage's frame step, already capped (scene/clock.ts); capped again for callers without one
    const step = stepPres(this.tl.pres, this.p, Math.min(dt, MAX_STEP) * this.rate, this.duration);
    this.p = step.p;
    if (step.entered) this.enteredOmitted = true;
    const t1 = this.missionTime;
    for (const e of eventsCrossed(this.tl, t0, t1)) this.crossed.push(e);
    if (this.p >= this.duration) {
      this.ended = true;
      this.playing = false;
      this.changed();
    }
    return true;
  }

  drainEvents(): MissionEvent[] {
    return this.crossed.splice(0);
  }
}
