/** Cross-mode navigation helpers (inspect a part from a mission, open a mission at a phase). */
import { useApp, type CamMode } from '../state/store';
import { loadMission, playback, seekPres } from '../state/playback';
import { missionToPres } from '../timeline/sample';
import type { MissionId } from '../timeline/types';
import type { PartId } from '../vehicle/parts';
import { routeExtras } from '../state/route';
import { watch, seekFilm } from '../watch/watchState';
import { watchRef } from '../state/playback';
import { OUTLINES } from '../timeline/missions/outline';
import { inConfig } from './explore/config';

/** Open the Mission explorer at the start of a phase (paused, so the learner can look). */
export function openMissionAt(mission: MissionId, phase: string | null, play = false, startAt: number | null = null, view: { cam?: CamMode; focus?: 'main' | 'booster' } = {}) {
  const app = useApp.getState();
  // a deep link's camera and storyline are kept; otherwise a mission opens guided, on the main story
  app.go('mission', { mission, inspect: null, part: null, cam: view.cam ?? 'auto', focus: view.focus ?? 'main' });
  const tl = loadMission(mission);
  if (!tl) return;
  let start = tl.phases.find((p) => p.id === phase)?.start;
  if (start === undefined) {
    const b = tl.branches.find((br) => br.phases.some((p) => p.id === phase));
    const bp = b?.phases.find((p) => p.id === phase);
    if (b && bp) {
      start = bp.start;
      useApp.setState({ focus: 'booster' });
    }
  }
  routeExtras.chapter = phase;
  // a quick start begins shortly before the action (the countdown's last seconds), not at the
  // start of the lesson; every chapter stays one click away
  if (start === undefined && startAt !== null) start = Math.max(tl.start, startAt);
  if (start !== undefined) seekPres(missionToPres(tl.pres, start) + 0.001);
  if (play) playback.player?.play();
}

/** "Show the part": pause the mission, remember where we were, inspect in the hangar. */
/** The hangar configuration that shows a part as flown on a mission. */
export function hangarConfigFor(part: PartId, mission: MissionId): 'satellite' | 'capsule' {
  const byMission = OUTLINES[mission].payload === 'capsule' || OUTLINES[mission].payload === 'researchCapsule' ? 'capsule' : 'satellite';
  if (inConfig(part, byMission)) return byMission;
  return inConfig(part, 'satellite') ? 'satellite' : 'capsule';
}

export function inspectPart(part: PartId) {
  const app = useApp.getState();
  const fp = watch.player;
  if (app.view === 'watch' && watchRef.active && fp) {
    const wasPlaying = fp.playing;
    fp.pause();
    fp.hold('inspect', true);
    app.go('explore', { part, exploreView: 'intact', hangarConfig: hangarConfigFor(part, fp.film.mission as MissionId), inspect: { part, from: { view: 'watch', mission: fp.film.mission as MissionId, p: fp.p, cam: app.cam, wasPlaying } } });
    return;
  }
  const pl = playback.player;
  if (!pl) {
    app.go('explore', { part });
    return;
  }
  const wasPlaying = pl.playing;
  pl.pause();
  pl.hold('inspect', true);
  const from = { view: app.view === 'watch' ? ('watch' as const) : ('mission' as const), mission: pl.tl.id, p: pl.p, cam: app.cam, wasPlaying };
  app.go('explore', { part, inspect: { part, from }, exploreView: 'intact', hangarConfig: hangarConfigFor(part, pl.tl.id) });
}

/** "Return to mission": restore exactly the paused point, camera mode and play state. */
export function returnToMission() {
  const app = useApp.getState();
  const ins = app.inspect;
  if (!ins) return;
  if (ins.from.view === 'watch' && watch.player) {
    const fp = watch.player;
    app.go('watch', { mission: ins.from.mission, inspect: null, part: null });
    fp.hold('inspect', false);
    if (Math.abs(fp.p - ins.from.p) > 1e-6) seekFilm(ins.from.p);
    if (ins.from.wasPlaying) fp.play();
    return;
  }
  app.go(ins.from.view, { mission: ins.from.mission, cam: ins.from.cam, inspect: null, part: null });
  loadMission(ins.from.mission);
  const pl = playback.player;
  if (!pl) return;
  pl.hold('inspect', false);
  if (Math.abs(pl.p - ins.from.p) > 1e-6) seekPres(ins.from.p);
  if (ins.from.wasPlaying) pl.play();
}
