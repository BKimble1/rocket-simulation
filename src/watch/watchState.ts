/**
 * Watch mode state: the narration script (with anchors), the measured narration manifest
 * (fetched once, lazily), and the active film player.
 */
import { create } from 'zustand';
import SCRIPT from '../content/narration.json';
import { asset } from '../config';
import type { NarrationSegment } from '../content/types';
import type { MissionId } from '../timeline/types';
import { buildFilm, type Film, type NarrationManifest } from './film';
import { FilmPlayer, filmAudio } from './player';
import { getTimeline } from '../state/playback';
import { frame } from '../scene/frame';
import { effects } from '../scene/effects/input';
import { snapFlight } from '../director/director';
import { setHold } from '../scene/dissolve';

interface RawSeg {
  id: string;
  mission: MissionId;
  anchor: { event: string } | { phase: string };
  offset?: number;
  cues: { id: string; text: string }[];
}

export const NARRATION_VERSION: string = (SCRIPT as { version: string }).version;

export const NARRATION: NarrationSegment[] = ((SCRIPT as { segments: RawSeg[] }).segments ?? []).map((s) => ({
  id: s.id.startsWith(`${s.mission}-`) ? s.id.slice(s.mission.length + 1) : s.id,
  mission: s.mission,
  anchor: s.anchor,
  offset: s.offset ?? 0,
  cues: s.cues.map((c) => ({ id: c.id, text: c.text })),
}));

let manifestPromise: Promise<NarrationManifest | null> | null = null;
export function loadManifest(): Promise<NarrationManifest | null> {
  manifestPromise ??= fetch(asset(`narration/${NARRATION_VERSION}/manifest.json`))
    .then((r) => (r.ok ? (r.json() as Promise<NarrationManifest>) : null))
    .catch(() => null);
  return manifestPromise;
}

interface WatchSnap {
  mission: MissionId | null;
  loading: boolean;
  p: number;
  duration: number;
  t: number;
  playing: boolean;
  held: string[];
  cue: string | null;
  note: string | null;
  audioError: string | null;
  audioOk: boolean;
  chapter: string | null;
  ended: boolean;
  rate: number;
  hiddenPause: boolean;
  /** Inside an omitted (skipped) interval. */
  omitted: boolean;
}

export const useWatch = create<WatchSnap>(() => ({
  mission: null,
  loading: false,
  p: 0,
  duration: 0,
  t: 0,
  playing: false,
  held: [],
  cue: null,
  note: null,
  audioError: null,
  audioOk: false,
  chapter: null,
  ended: false,
  rate: 1,
  hiddenPause: false,
  omitted: false,
}));

export const watch = {
  player: null as FilmPlayer | null,
  film: null as Film | null,
  last: 0,
};

export function publishWatch(force = false) {
  const pl = watch.player;
  const now = performance.now();
  if (!pl || (!force && now - watch.last < 80)) return;
  watch.last = now;
  const seg = pl.film.pres.find((s) => pl.p >= s.p0 && pl.p < s.p1);
  const ch = [...pl.film.chapters].reverse().find((c) => pl.p >= c.start - 0.01);
  useWatch.setState({
    p: pl.p,
    duration: pl.duration,
    t: pl.missionTime,
    playing: pl.playing,
    held: pl.holdReasons(),
    cue: pl.cue?.text ?? null,
    note: seg?.note ?? null,
    audioError: pl.audioError,
    audioOk: pl.audioOk,
    chapter: ch?.id ?? null,
    ended: pl.ended,
    rate: pl.rate,
    hiddenPause: pl.pausedWhileHidden,
    omitted: !!seg?.omitted,
  });
}

/** Start a film (call inside the click, so narration may play). */
export async function startFilm(mission: MissionId, narration: boolean, chapter: string | null = null) {
  const els = filmAudio(true);
  useWatch.setState({ mission, loading: true });
  const manifest = await loadManifest();
  const tl = getTimeline(mission);
  frame.tl = tl;
  const film = buildFilm(tl, NARRATION, manifest);
  watch.player?.dispose();
  const pl = new FilmPlayer(film, `narration/${NARRATION_VERSION}/`, manifest ? els : null);
  pl.setNarration(narration);
  pl.subscribe(() => publishWatch(true));
  watch.player = pl;
  watch.film = film;
  const ch = chapter ? film.chapters.find((c) => c.id === chapter) : null;
  if (ch) pl.seek(ch.start);
  frame.missionTime = pl.missionTime;
  effects.seekEpoch++;
  snapFlight();
  useWatch.setState({ loading: false });
  pl.play();
  publishWatch(true);
}

export function stopFilm() {
  watch.player?.dispose();
  watch.player = null;
  watch.film = null;
  useWatch.setState({ mission: null, playing: false });
}

export function seekFilm(p: number) {
  const pl = watch.player;
  if (!pl) return;
  pl.seek(p);
  // a seek shows the chosen moment itself, even inside a skipped interval
  setHold(false, frame.clock);
  frame.omitted = false;
  frame.missionTime = pl.missionTime;
  effects.seekEpoch++;
  snapFlight();
  publishWatch(true);
}
