/** Cross-mode navigation helpers (inspect a part from a mission, open a mission at a phase). */
import { useApp } from '../state/store';
import { loadMission, playback, seekPres } from '../state/playback';
import { missionToPres } from '../timeline/sample';
import type { MissionId } from '../timeline/types';
import type { PartId } from '../vehicle/parts';
import { routeExtras } from '../state/route';
import { watch, seekFilm } from '../watch/watchState';
import { watchRef } from '../state/playback';

/** Open the Mission explorer at the start of a phase (paused, so the learner can look). */
export function openMissionAt(mission: MissionId, phase: string | null, play = false) {
  const app = useApp.getState();
  app.go('mission', { mission, inspect: null, part: null, cam: 'auto', focus: 'main' });
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
  if (start !== undefined) seekPres(missionToPres(tl.pres, start) + 0.001);
  if (play) playback.player?.play();
}

/** "Show the part": pause the mission, remember where we were, inspect in the hangar. */
export function inspectPart(part: PartId) {
  const app = useApp.getState();
  const fp = watch.player;
  if (app.view === 'watch' && watchRef.active && fp) {
    const wasPlaying = fp.playing;
    fp.pause();
    fp.hold('inspect', true);
    app.go('explore', { part, exploreView: 'intact', inspect: { part, from: { view: 'watch', mission: fp.film.mission as MissionId, p: fp.p, cam: app.cam, wasPlaying } } });
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
  app.go('explore', { part, inspect: { part, from }, exploreView: 'intact' });
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
