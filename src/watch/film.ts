/**
 * The narrated film for a mission (Watch mode), built deterministically from:
 *   - the mission timeline's presentation map (tl.pres) and events, and
 *   - the narration manifest (measured audio durations and cue times from the TTS build),
 *   - the anchors that tie each narration segment to a mission event or phase.
 *
 * Each segment starts when its anchor appears on screen. If a segment would still be speaking
 * when the next one's anchor arrives, the picture between the two anchors is slowed (or a
 * compressed coast is compressed less) so the speech finishes first: speech never runs ahead
 * of the picture. Slowed intervals are labelled ("Slow motion ×0.6"). The result is a new,
 * explicit, monotonic presentation map, so seeking is exact.
 */
import { missionToPres, presToMission } from '../timeline/sample';
import type { MissionTimeline, PresSegment } from '../timeline/types';
import type { NarrationSegment } from '../content/types';

export interface ManifestCue {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
}
export interface ManifestSegment {
  id: string;
  file: string;
  durationMs: number;
  bytes?: number;
  cues: ManifestCue[];
}
export interface NarrationManifest {
  version: string;
  voice: string;
  segments: ManifestSegment[];
}

export interface FilmCue {
  id: string;
  text: string;
  start: number;
  end: number;
}
export interface FilmSegment {
  id: string;
  file: string | null;
  /** Film (presentation) time the audio starts, and its duration. */
  start: number;
  dur: number;
  cues: FilmCue[];
}
export interface Film {
  mission: string;
  pres: PresSegment[];
  duration: number;
  segments: FilmSegment[];
  chapters: { id: string; title: string; start: number }[];
}

const GAP = 0.45; // silence kept between two segments (s)

function anchorTime(tl: MissionTimeline, a: NarrationSegment['anchor']): number | null {
  if ('event' in a) return tl.events.find((e) => e.id === a.event)?.t ?? null;
  const ph = tl.phases.find((p) => p.id === a.phase) ?? tl.branches.flatMap((b) => b.phases).find((p) => p.id === a.phase);
  return ph ? ph.start : null;
}

/**
 * Build the film. `estimate` gives a duration for segments with no audio in the manifest
 * (captions-only fallback: ~2.6 words per second plus pauses).
 */
export function buildFilm(tl: MissionTimeline, script: NarrationSegment[], manifest: NarrationManifest | null): Film {
  const byId = new Map((manifest?.segments ?? []).map((s) => [s.id, s]));
  const items = script
    .filter((s) => s.mission === tl.id)
    .map((s) => {
      const m = anchorTime(tl, s.anchor);
      return m === null ? null : { def: s, m: Math.max(tl.pres[0]?.m0 ?? m, m + s.offset) };
    })
    .filter((x): x is { def: NarrationSegment; m: number } => !!x)
    .sort((a, b) => a.m - b.m);
  const durOf = (s: NarrationSegment): { dur: number; cues: { id: string; text: string; s: number; e: number }[]; file: string | null } => {
    const ms = byId.get(`${s.mission}-${s.id}`);
    if (ms) return { dur: ms.durationMs / 1000, file: ms.file, cues: ms.cues.map((c) => ({ id: c.id, text: c.text, s: c.startMs / 1000, e: c.endMs / 1000 })) };
    let t = 0.2;
    const cues = s.cues.map((c) => {
      const words = c.text.split(/\s+/).length;
      const d = words / 2.6 + 0.3;
      const cue = { id: c.id, text: c.text, s: t, e: t + d };
      t += d + 0.35;
      return cue;
    });
    return { dur: t + 0.4, cues, file: null };
  };

  // Walk the mission's presentation map, inserting the stretched intervals where needed.
  const base = tl.pres;
  const out: PresSegment[] = [];
  let pCursor = 0; // film time
  let mCursor = base[0]?.m0 ?? tl.start;
  const push = (m1: number, minDur: number | null) => {
    if (m1 <= mCursor + 1e-6 && (minDur ?? 0) <= 0) return;
    // copy the base map between mCursor and m1, scaled so it lasts at least minDur
    const pieces: PresSegment[] = [];
    for (const s of base) {
      const a = Math.max(s.m0, mCursor);
      const b = Math.min(s.m1, m1);
      if (b <= a + 1e-9) continue;
      const rate = (s.m1 - s.m0) / Math.max(1e-9, s.p1 - s.p0);
      pieces.push({ p0: 0, p1: (b - a) / rate, m0: a, m1: b, note: s.note, omitted: s.omitted });
    }
    const natural = pieces.reduce((acc, s) => acc + (s.p1 - s.p0), 0);
    const k = minDur && natural > 1e-6 && natural < minDur ? minDur / natural : 1;
    for (const s of pieces) {
      const d = (s.p1 - s.p0) * k;
      const rate = (s.m1 - s.m0) / Math.max(1e-9, d);
      const note = k > 1.02 ? (rate < 0.98 ? `Slow motion ×${rate.toFixed(1)}` : `${s.note ? s.note.replace(/×[\d.,]+/, `×${Math.round(rate)}`) : `Time ×${rate.toFixed(0)}`}`) : s.note;
      out.push({ p0: pCursor, p1: pCursor + d, m0: s.m0, m1: s.m1, note, omitted: s.omitted });
      pCursor += d;
    }
    if (!pieces.length && minDur && minDur > 0) {
      // nothing moves (a held moment): hold the picture explicitly
      out.push({ p0: pCursor, p1: pCursor + minDur, m0: mCursor, m1: mCursor, note: 'Held for narration' });
      pCursor += minDur;
    }
    mCursor = Math.max(mCursor, m1);
  };

  const segments: FilmSegment[] = [];
  let speakingUntil = 0; // film time when the previous segment ends (+ gap)
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    // advance the picture to this anchor; make it take at least until the previous speech ends
    const needed = speakingUntil - pCursor;
    push(it.m, needed > 0 ? needed : null);
    const d = durOf(it.def);
    const start = Math.max(pCursor, speakingUntil);
    segments.push({ id: `${it.def.mission}-${it.def.id}`, file: d.file, start, dur: d.dur, cues: d.cues.map((c) => ({ id: c.id, text: c.text, start: start + c.s, end: start + c.e })) });
    speakingUntil = start + d.dur + GAP;
  }
  // the rest of the mission after the last anchor, at least until the last speech ends
  const endM = base[base.length - 1]?.m1 ?? tl.end;
  push(endM, speakingUntil - pCursor > 0 ? speakingUntil - pCursor : null);
  const duration = pCursor;
  const chapters = tl.phases.map((ph) => ({ id: ph.id, title: ph.title, start: filmPresOf(out, Math.max(ph.start, out[0]?.m0 ?? ph.start)) }));
  return { mission: tl.id, pres: out, duration, segments, chapters };
}

/** Film time at which mission time m first appears. */
export function filmPresOf(pres: PresSegment[], m: number): number {
  return missionToPres(pres, m);
}

export function filmMission(film: Film, p: number): number {
  return presToMission(film.pres, p);
}

export function segmentAt(film: Film, p: number): FilmSegment | null {
  for (const s of film.segments) if (p >= s.start && p < s.start + s.dur) return s;
  return null;
}

export function cueAt(film: Film, p: number): FilmCue | null {
  let cur: FilmCue | null = null;
  for (const s of film.segments) {
    if (p < s.start - 0.05 || p > s.start + s.dur + 1.2) continue;
    for (const c of s.cues) if (p >= c.start - 0.05) cur = c;
  }
  if (cur && p > cur.end + 1.2) return null;
  return cur;
}
