/**
 * Watch: a guided cinematic journey. Pick a film (the recommended overview is the satellite
 * mission), then captions, optional narration, chapters, pause and seek. The picture, the
 * captions, the narration and the sounds follow one clock (src/watch/player.ts).
 */
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../state/store';
import { MISSION_ORDER, OUTLINES } from '../../timeline/missions/outline';
import type { MissionId } from '../../timeline/types';
import { startFilm, stopFilm, useWatch, watch, seekFilm, publishWatch, NARRATION } from '../../watch/watchState';
import { watchRef } from '../../state/playback';
import { formatMissionTime } from '../format';
import { goLocation, setMode, setFocus, director } from '../../director/director';
import { frame } from '../../scene/frame';
import { Icon } from '../icons';
import { inspectPart } from '../nav';

function FilmPicker({ onPick }: { onPick: (m: MissionId) => void }) {
  return (
    <div className="missions">
      <div className="missions__list panel">
        <div className="eyebrow">Watch and learn</div>
        <p className="small muted" style={{ margin: '2px 2px 6px' }}>
          Narrated journeys with captions and chapters. Narration is a synthesized voice; captions carry every word.
        </p>
        {MISSION_ORDER.map((id) => (
          <button key={id} className="mcard" onClick={() => onPick(id)}>
            <span className="mcard__title">
              {id === 'leo' ? 'Overview: ' : ''}
              {OUTLINES[id].title}
              {id === 'leo' && <span className="badge">Start here</span>}
            </span>
            <span className="mcard__meta">
              {OUTLINES[id].phases.length} chapters · {NARRATION.filter((n) => n.mission === id).length} narrated passages
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function WatchView() {
  const w = useWatch();
  const narration = useApp((s) => s.narration);
  const captions = useApp((s) => s.captions);
  const set = useApp((s) => s.set);
  const [chapters, setChapters] = useState(false);
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    watchRef.active = true;
    watchRef.publish = () => publishWatch();
    goLocation('flight');
    setMode('auto');
    return () => {
      watchRef.active = false;
      watchRef.player = null;
      // inspecting a part keeps the film (paused) for the return
      if (!useApp.getState().inspect) stopFilm();
    };
  }, []);
  useEffect(() => {
    watchRef.player = watch.player as unknown as typeof watchRef.player;
  }, [w.mission, w.loading]);
  useEffect(() => {
    watch.player?.setNarration(narration);
  }, [narration]);
  // follow the phase's subject with the Auto director
  useEffect(() => {
    const tl = frame.tl;
    if (!tl) return;
    const ph = tl.phases.filter((p) => w.t >= p.start).pop();
    if (ph) setFocus(ph.focus);
  }, [w.t]);
  useEffect(() => {
    const drawer = useApp.getState().drawer;
    watch.player?.hold('dialog', !!drawer);
  });
  if (!w.mission)
    return (
      <FilmPicker
        onPick={(m) => {
          set({ mission: m });
          void startFilm(m, narration);
        }}
      />
    );
  const film = watch.film;
  const dur = w.duration || 1;
  const pct = (p: number) => `${((p / dur) * 100).toFixed(3)}%`;
  const seekAt = (clientX: number) => {
    const r = bar.current!.getBoundingClientRect();
    seekFilm(Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * dur);
  };
  return (
    <>
      <div className="mission-top">
        <div className="mission-title panel">
          <div className="eyebrow">Watch · {OUTLINES[w.mission].title}</div>
          <div className="mission-title__phase">{film?.chapters.find((c) => c.id === w.chapter)?.title ?? ''}</div>
        </div>
        <button className="btn btn--sm" onClick={() => stopFilm()}>
          Other films
        </button>
      </div>
      {captions && w.cue && (
        <div className="caption" role="status" aria-live="polite">
          {w.cue}
        </div>
      )}
      {w.held.includes('buffering') && <div className="loading-note">Loading narration…</div>}
      {w.audioError && (
        <div className="loading-note">
          {w.audioError}{' '}
          <button className="linklike" onClick={() => watch.player?.retryAudio()}>
            Retry
          </button>
        </div>
      )}
      {w.hiddenPause && !w.playing && <div className="loading-note">Paused while the tab was in the background. Press play to continue.</div>}
      {chapters && film && (
        <div className="left-dock">
          <section className="panel finder">
            <div className="finder__head">
              <b>Chapters</b>
              <button className="icon-btn icon-btn--flat" onClick={() => setChapters(false)} aria-label="Close chapters">
                <Icon.close size={16} />
              </button>
            </div>
            <div className="finder__list chapterlist">
              <ol>
                {film.chapters.map((c) => (
                  <li key={c.id}>
                    <button className="chapter" aria-current={w.chapter === c.id ? 'true' : undefined} onClick={() => seekFilm(c.start + 0.001)}>
                      <span className="chapter__t">{formatMissionTime(frame.tl?.phases.find((p) => p.id === c.id)?.start ?? 0)}</span>
                      <span>{c.title}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        </div>
      )}
      <div className="bottom-dock">
        <div className="playbar panel" role="group" aria-label="Film playback">
          <button className="icon-btn icon-btn--play" onClick={() => watch.player?.toggle()} aria-label={w.playing ? 'Pause' : 'Play'}>
            {w.playing ? <Icon.pause size={18} /> : <Icon.play size={18} />}
          </button>
          <div className="playbar__time">
            <span className="playbar__t">{formatMissionTime(w.t)}</span>
            {w.note && <span className="note-chip">{w.note}</span>}
          </div>
          <div
            className="scrub"
            ref={bar}
            onPointerDown={(e) => {
              (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
              seekAt(e.clientX);
            }}
            onPointerMove={(e) => e.buttons === 1 && seekAt(e.clientX)}
          >
            <div className="scrub__track" />
            <div className="scrub__fill" style={{ width: pct(w.p) }} />
            {film?.chapters.map((c) => <span key={c.id} className="scrub__tick" style={{ left: pct(c.start) }} title={c.title} />)}
            <input className="scrub__input" type="range" min={0} max={dur} step={0.1} value={w.p} onChange={(e) => seekFilm(Number(e.target.value))} aria-label="Film position" aria-valuetext={formatMissionTime(w.t)} />
          </div>
          <button className="icon-btn icon-btn--flat" aria-pressed={captions} onClick={() => set({ captions: !captions })} aria-label={captions ? 'Hide captions' : 'Show captions'}>
            <Icon.cc size={18} />
          </button>
          <button className="icon-btn icon-btn--flat" aria-pressed={narration} onClick={() => set({ narration: !narration })} aria-label={narration ? 'Mute narration' : 'Play narration'}>
            {narration ? <Icon.sound size={18} /> : <Icon.mute size={18} />}
          </button>
          <button className="icon-btn icon-btn--flat" onClick={() => setChapters((c) => !c)} aria-label="Chapters">
            <Icon.chapters size={18} />
          </button>
        </div>
        <p className="watch-note small">
          Narration: synthesized voice (Kokoro text-to-speech). {director.mode === 'free' ? '' : 'Drag to look around; the film keeps playing.'}{' '}
          <button className="linklike" onClick={() => inspectPart(frame.tl?.phases.find((p) => w.t >= p.start)?.activeParts[0] ?? 'engine')}>
            Pause and inspect a part
          </button>
        </p>
      </div>
    </>
  );
}
