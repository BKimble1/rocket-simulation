/**
 * Mission playback: loads a mission timeline (built once, cached), owns the MissionPlayer, and
 * publishes a coarse snapshot for the interface (at most ~12 updates per second: the picture
 * itself reads frame.ts every frame). Seeking reconstructs everything from mission time.
 */
import { create } from 'zustand';
import { buildMission } from '../timeline/build';
import { MissionPlayer } from '../timeline/player';
import { phaseAt, presRate } from '../timeline/sample';
import type { MissionEvent, MissionId, MissionTimeline, Phase } from '../timeline/types';
import { frame } from '../scene/frame';
import { stageHooks } from '../scene/Stage';
import { effects } from '../scene/effects/input';
import { snapFlight } from '../director/director';

const cache = new Map<MissionId, MissionTimeline>();

/** Set by Watch mode (avoids an import cycle): the film player that drives time while active. */
export const watchRef = {
  active: false,
  player: null as null | { missionTime: number; p: number; playing: boolean; held: boolean; tick(dt: number): boolean; film: unknown },
  publish: null as null | (() => void),
};

export function getTimeline(id: MissionId): MissionTimeline {
  let tl = cache.get(id);
  if (!tl) {
    tl = buildMission(id);
    cache.set(id, tl);
    // bounded cache: keep the three most recent
    while (cache.size > 3) cache.delete(cache.keys().next().value as MissionId);
  }
  return tl;
}

export interface PlaybackSnapshot {
  mission: MissionId | null;
  p: number;
  duration: number;
  t: number;
  playing: boolean;
  rate: number;
  /** Presentation rate note: "Coast accelerated ×60" etc. */
  note: string | null;
  timeRate: number;
  phase: Phase | null;
  branchPhase: Phase | null;
  held: string[];
  ended: boolean;
  error: string | null;
}

export const usePlayback = create<PlaybackSnapshot>(() => ({
  mission: null,
  p: 0,
  duration: 0,
  t: 0,
  playing: false,
  rate: 1,
  note: null,
  timeRate: 1,
  phase: null,
  branchPhase: null,
  held: [],
  ended: false,
  error: null,
}));

export const playback = {
  player: null as MissionPlayer | null,
  /** One-shot event listeners (sounds, captions). */
  onEvent: new Set<(e: MissionEvent) => void>(),
  lastPublish: 0,
};

function publish(force = false) {
  const pl = playback.player;
  const now = performance.now();
  if (!force && now - playback.lastPublish < 80) return;
  playback.lastPublish = now;
  if (!pl) return;
  const t = pl.missionTime;
  const r = presRate(pl.tl.pres, pl.p);
  const branch = pl.tl.branches[0];
  usePlayback.setState({
    mission: pl.tl.id,
    p: pl.p,
    duration: pl.duration,
    t,
    playing: pl.playing,
    rate: pl.rate,
    note: r.note ?? null,
    timeRate: r.rate,
    phase: phaseAt(pl.tl.phases, t),
    branchPhase: branch && t >= branch.start && t <= branch.end ? phaseAt(branch.phases, t) : null,
    held: pl.holdReasons(),
    ended: pl.ended,
  });
}

export function loadMission(id: MissionId): MissionTimeline | null {
  try {
    const tl = getTimeline(id);
    if (playback.player?.tl === tl) return tl;
    playback.player = new MissionPlayer(tl);
    playback.player.subscribe(() => publish(true));
    frame.tl = tl;
    frame.missionTime = playback.player.missionTime;
    effects.seekEpoch++;
    snapFlight();
    usePlayback.setState({ error: null });
    publish(true);
    return tl;
  } catch (e) {
    usePlayback.setState({ error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

export function seekPres(p: number) {
  const pl = playback.player;
  if (!pl) return;
  pl.seek(p);
  frame.missionTime = pl.missionTime;
  frame.presTime = pl.p;
  effects.seekEpoch++;
  snapFlight();
  publish(true);
}

/** Installed once: advances the active player every frame and fires crossed events. */
export function installPlaybackTick() {
  stageHooks.tick = (dt) => {
    // Watch mode: the film player drives mission time
    const film = watchRef.player;
    if (watchRef.active && film) {
      const t0 = film.missionTime;
      film.tick(dt);
      frame.missionTime = film.missionTime;
      frame.presTime = film.p;
      frame.paused = !film.playing || film.held;
      const tl = frame.tl;
      if (tl && film.playing) for (const e of tl.events) if (e.t > t0 && e.t <= frame.missionTime) for (const f of playback.onEvent) f(e);
      watchRef.publish?.();
      return;
    }
    const pl = playback.player;
    if (!pl) return;
    pl.tick(dt);
    frame.missionTime = pl.missionTime;
    frame.presTime = pl.p;
    frame.paused = !pl.playing || pl.held;
    for (const e of pl.drainEvents()) for (const f of playback.onEvent) f(e);
    publish();
  };
}
