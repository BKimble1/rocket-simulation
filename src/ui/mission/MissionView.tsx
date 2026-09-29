/**
 * Mission explorer: the flight on the stage, a phase card that answers "what is happening, why
 * now, which parts, which forces, what enables the next phase", camera modes, the booster /
 * main-vehicle focus switch (time is shared), optional reference telemetry, chapters.
 */
import { useEffect, useRef, useState } from 'react';
import { useStageInset } from '../hooks/useStageInset';
import { useApp, type CamMode } from '../../state/store';
import { usePlayback, playback, seekPres } from '../../state/playback';
import { PHASE_CARDS } from '../../content/phaseCards';
import { EQUATIONS } from '../../content/equations';
import { PARTS } from '../../vehicle/parts';
import { OUTLINES } from '../../timeline/missions/outline';
import { missionToPres } from '../../timeline/sample';
import { director, setFocus, setMode, goLocation } from '../../director/director';
import { frame } from '../../scene/frame';
import { PlaybackBar } from './PlaybackBar';
import { Telemetry } from './Telemetry';
import { inspectPart } from '../nav';
import { formatMissionTime } from '../format';
import { useProgress, exploredKey } from '../../state/progress';
import { syncChapter } from '../../state/route';
import { Icon } from '../icons';

const CAMS: [CamMode, string][] = [
  ['auto', 'Auto'],
  ['ground', 'Ground'],
  ['chase', 'Chase'],
  ['onboard', 'Onboard'],
  ['free', 'Free'],
  ['map', 'Map'],
];

export function PhaseCardPanel({ onClose }: { onClose?: () => void }) {
  const pb = usePlayback();
  const focus = useApp((s) => s.focus);
  const mark = useProgress((s) => s.markExplored);
  const phase = focus === 'booster' && pb.branchPhase ? pb.branchPhase : pb.phase;
  const key = pb.mission && phase ? `${pb.mission}:${phase.id}` : '';
  const card = PHASE_CARDS[key];
  useEffect(() => {
    if (pb.mission && phase) {
      mark(exploredKey.phase(pb.mission, phase.id));
      syncChapter(phase.id);
    }
  }, [pb.mission, phase, mark]);
  const ref = useRef<HTMLElement>(null);
  useStageInset('phasecard', ref, !!phase);
  if (!phase) return null;
  const eq = card?.equation ? EQUATIONS[card.equation] : null;
  return (
    <aside className="panel phasecard" aria-label="What is happening" ref={ref}>
      <header className="lesson__head">
        <div>
          <div className="eyebrow">{focus === 'booster' && pb.branchPhase ? 'Booster storyline' : 'Mission phase'}</div>
          <h2>{phase.title}</h2>
        </div>
        {onClose && (
          <button className="icon-btn icon-btn--flat" onClick={onClose} aria-label="Hide phase card">
            <Icon.close size={16} />
          </button>
        )}
      </header>
      {!card && <p className="muted">Phase notes are being written.</p>}
      {card && (
        <div className="lesson__body">
          <section className="q">
            <h4>What is happening</h4>
            <p>{card.what}</p>
          </section>
          <section className="q">
            <h4>Why now</h4>
            <p>{card.whyNow}</p>
          </section>
          <section className="q">
            <h4>Parts doing the work</h4>
            <ul className="chips">
              {card.parts.map((p) => (
                <li key={p}>
                  <button className="chip" onClick={() => inspectPart(p)} title="Pause and inspect this part">
                    {PARTS[p]?.label ?? p} <Icon.arrow size={12} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <section className="q">
            <h4>Forces and environment</h4>
            <p>{card.forces}</p>
          </section>
          <section className="q">
            <h4>What enables the next phase</h4>
            <p>{card.next}</p>
          </section>
          {eq && (
            <details className="qa">
              <summary>
                {eq.name}: <code>{eq.formula}</code>
              </summary>
              <ul className="plain small">
                {eq.variables.map((v) => (
                  <li key={v.symbol}>
                    <code>{v.symbol}</code> {v.meaning} ({v.unit})
                  </li>
                ))}
              </ul>
              <p className="small">{eq.caveat}</p>
              {eq.example && <p className="small">{eq.example}</p>}
            </details>
          )}
        </div>
      )}
    </aside>
  );
}

export function ChaptersList({ onPick }: { onPick?: () => void }) {
  const pb = usePlayback();
  const tl = playback.player?.tl;
  const set = useApp((s) => s.set);
  if (!tl) return null;
  const o = OUTLINES[tl.id];
  const jump = (start: number, booster = false) => {
    seekPres(missionToPres(tl.pres, start) + 0.001);
    set({ focus: booster ? 'booster' : 'main' });
    onPick?.();
  };
  return (
    <nav className="chapterlist" aria-label="Chapters">
      <ol>
        {tl.phases.map((p) => (
          <li key={p.id}>
            <button className="chapter" aria-current={pb.phase?.id === p.id ? 'true' : undefined} onClick={() => jump(p.start)}>
              <span className="chapter__t">{formatMissionTime(p.start)}</span>
              <span>{p.title}</span>
            </button>
          </li>
        ))}
      </ol>
      {tl.branches.map((b) => (
        <div key={b.id}>
          <div className="eyebrow">{o.branch?.title ?? b.title} (parallel)</div>
          <ol>
            {b.phases.map((p) => (
              <li key={p.id}>
                <button className="chapter" aria-current={pb.branchPhase?.id === p.id ? 'true' : undefined} onClick={() => jump(p.start, true)}>
                  <span className="chapter__t">{formatMissionTime(p.start)}</span>
                  <span>{p.title}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </nav>
  );
}

export function CameraBar() {
  const cam = useApp((s) => s.cam);
  const set = useApp((s) => s.set);
  const [took, setTook] = useState(false);
  useEffect(() => {
    director.onUserCamera = () => {
      setTook(true);
      useApp.setState({ cam: 'free' });
    };
    return () => {
      director.onUserCamera = null;
    };
  }, []);
  useEffect(() => {
    if (cam === 'map') goLocation('map');
    else {
      goLocation('flight');
      setMode(cam);
    }
    if (cam !== 'free') setTook(false);
  }, [cam]);
  return (
    <div className="cambar panel" role="radiogroup" aria-label="Camera">
      {CAMS.map(([k, label]) => (
        <button key={k} role="radio" aria-checked={cam === k} className="seg__btn" onClick={() => set({ cam: k })}>
          {label}
        </button>
      ))}
      {took && cam === 'free' && (
        <button className="btn btn--sm btn--accent" onClick={() => set({ cam: 'auto' })}>
          Back to guided view
        </button>
      )}
    </div>
  );
}

export function FocusSwitch() {
  const pb = usePlayback();
  const focus = useApp((s) => s.focus);
  const set = useApp((s) => s.set);
  const tl = playback.player?.tl;
  const branch = tl?.branches[0];
  const main = pb.phase?.focus ?? 'upper';
  useEffect(() => {
    if (!tl) return;
    const target = focus === 'booster' && branch ? branch.focus : main;
    if (frame.bodies[target]?.present || !frame.tl) setFocus(target);
  }, [focus, main, tl, branch, pb.t]);
  if (!branch || pb.t < branch.start - 1) return null;
  return (
    <div className="seg seg--inline focus-switch panel" role="radiogroup" aria-label="Follow">
      <button role="radio" aria-checked={focus === 'main'} className="seg__btn" onClick={() => set({ focus: 'main' })}>
        {OUTLINES[tl!.id].payload === 'researchCapsule' ? 'Capsule' : 'Upper stage'}
      </button>
      <button role="radio" aria-checked={focus === 'booster'} className="seg__btn" onClick={() => set({ focus: 'booster' })}>
        Booster
      </button>
    </div>
  );
}

export function MissionView() {
  const mission = useApp((s) => s.mission);
  const telemetry = useApp((s) => s.telemetry);
  const [chapters, setChapters] = useState(false);
  const [card, setCard] = useState(true);
  const pb = usePlayback();
  return (
    <>
      <div className="mission-top">
        <div className="mission-title panel">
          <div className="eyebrow">{OUTLINES[mission].title}</div>
          <div className="mission-title__phase">{pb.phase?.title ?? 'Loading'}</div>
        </div>
        <FocusSwitch />
      </div>
      {pb.error && <div className="loading-note">This mission could not be built: {pb.error}</div>}
      {card ? <PhaseCardPanel onClose={() => setCard(false)} /> : (
        <button className="btn btn--sm reopen-card" onClick={() => setCard(true)}>
          Phase notes
        </button>
      )}
      {telemetry && <Telemetry />}
      {chapters && (
        <div className="left-dock">
          <section className="panel finder">
            <div className="finder__head">
              <b>Chapters</b>
              <button className="icon-btn icon-btn--flat" onClick={() => setChapters(false)} aria-label="Close chapters">
                <Icon.close size={16} />
              </button>
            </div>
            <div className="finder__list">
              <ChaptersList />
            </div>
          </section>
        </div>
      )}
      <div className="bottom-dock">
        <CameraBar />
        <PlaybackBar onChapters={() => setChapters((c) => !c)} />
      </div>
    </>
  );
}
