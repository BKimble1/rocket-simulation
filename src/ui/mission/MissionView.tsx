/**
 * Mission explorer: the flight on the stage, a phase card that answers "what is happening, why
 * now, which parts, which forces, what enables the next phase", camera modes, the booster /
 * main-vehicle focus switch (time is shared), optional reference telemetry, chapters.
 */
import { useEffect, useRef, useState } from 'react';
import { useStageInset } from '../hooks/useStageInset';
import { useDockHeight } from '../hooks/useDockHeight';
import { useApp, type CamMode } from '../../state/store';
import { usePlayback, playback, seekPres } from '../../state/playback';
import { PHASE_CARDS } from '../../content/phaseCards';
import { EQUATIONS } from '../../content/equations';
import { PARTS } from '../../vehicle/parts';
import { MISSION_ORDER, OUTLINES } from '../../timeline/missions/outline';
import { missionToPres } from '../../timeline/sample';
import { director, setFocus, setMode, goLocation, jumpWithDissolve, resetFlightCamera } from '../../director/director';
import { frame } from '../../scene/frame';
import { PlaybackBar } from './PlaybackBar';
import { inspectionLight } from '../../scene/flight/FlightWorld';
import { Telemetry } from './Telemetry';
import { inspectPart, openMissionAt } from '../nav';
import { formatMissionTime } from '../format';
import { useProgress, exploredKey } from '../../state/progress';
import { syncChapter } from '../../state/route';
import { Icon } from '../icons';

const CAMS: [CamMode, string, string][] = [
  ['auto', 'Auto', 'Guided shots chosen for each moment'],
  ['ground', 'Ground', 'Cameras on the ground: the pad, the tracking site, the landing zone'],
  ['chase', 'Chase', 'A camera flying behind the vehicle'],
  ['onboard', 'Onboard', 'A camera mounted on the vehicle, looking back along it'],
  ['free', 'Free', 'Drag to orbit, scroll or pinch to zoom'],
  ['map', 'Map', 'The orbit on a schematic map'],
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
    // the new moment appears through a short dissolve from the picture on screen
    jumpWithDissolve(() => seekPres(missionToPres(tl.pres, start) + 0.001));
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
    if (cam !== 'free') setTook(false);
  }, [cam]);
  return (
    <div className="cambar panel" role="radiogroup" aria-label="Camera">
      {CAMS.map(([k, label, hint]) => (
        <button key={k} role="radio" aria-checked={cam === k} className="seg__btn" title={hint} onClick={() => set({ cam: k })}>
          {label}
        </button>
      ))}
      {cam === 'free' && (
        <button className="btn btn--sm btn--quiet" onClick={resetFlightCamera} title="Back to a comfortable view of the vehicle">
          Reset view
        </button>
      )}
      {took && cam === 'free' && (
        <button className="btn btn--sm btn--accent" onClick={() => set({ cam: 'auto' })}>
          Back to guided view
        </button>
      )}
    </div>
  );
}

/**
 * Applies the mission explorer's camera mode and focus (store state, also set by deep links) to
 * the director. Mounted by the app shell whenever the mission view is active, so it works with
 * the interface hidden too (?ui=0 captures).
 */
export function MissionDirectorSync() {
  const pb = usePlayback();
  const cam = useApp((s) => s.cam);
  const focus = useApp((s) => s.focus);
  const tl = playback.player?.tl;
  const branch = tl?.branches[0];
  const main = pb.phase?.focus ?? 'upper';
  useEffect(() => {
    if (cam === 'map') goLocation('map');
    else {
      goLocation('flight');
      setMode(cam);
    }
  }, [cam]);
  useEffect(() => {
    if (!tl) return;
    const target = focus === 'booster' && branch ? branch.focus : main;
    if (frame.bodies[target]?.present || !frame.tl) setFocus(target);
  }, [focus, main, tl, branch, pb.t]);
  return null;
}

export function FocusSwitch() {
  const pb = usePlayback();
  const focus = useApp((s) => s.focus);
  const set = useApp((s) => s.set);
  const tl = playback.player?.tl;
  const branch = tl?.branches[0];
  if (!branch || pb.t < branch.start - 1) return null;
  const mainName = OUTLINES[tl!.id].payload === 'researchCapsule' ? 'Capsule' : 'Upper stage';
  const pick = (f: 'main' | 'booster') => {
    if (f === focus) return;
    // say what changed: the storyline, not the moment
    set({
      focus: f,
      toast: f === 'booster' ? `Following the booster back to Earth. Same mission clock: the ${mainName.toLowerCase()} flies on.` : `Following the ${mainName.toLowerCase()} again. Same mission clock.`,
    });
  };
  return (
    <div className="focus-switch panel" role="group" aria-label="Which vehicle to follow">
      <span className="focus-switch__label">Follow</span>
      <div className="seg seg--inline" role="radiogroup" aria-label="Follow">
        <button role="radio" aria-checked={focus === 'main'} className="seg__btn" onClick={() => pick('main')} title={`The ${mainName.toLowerCase()} and its payload: the main story`}>
          {mainName}
        </button>
        <button role="radio" aria-checked={focus === 'booster'} className="seg__btn" onClick={() => pick('booster')} title="The first stage returning to land: a parallel story on the same clock">
          Booster
        </button>
      </div>
    </div>
  );
}

/** Another mission, one click away from the mission on screen. */
function MissionSwitcher() {
  const mission = useApp((s) => s.mission);
  const [open, setOpen] = useState(false);
  return (
    <div className="mswitch">
      <button className="mswitch__btn eyebrow" aria-expanded={open} onClick={() => setOpen((o) => !o)} title="Choose another mission">
        {OUTLINES[mission].title} <Icon.chevron size={12} />
      </button>
      {open && (
        <ul className="mswitch__menu panel" role="menu">
          {MISSION_ORDER.map((id) => (
            <li key={id} role="none">
              <button
                role="menuitem"
                aria-current={id === mission ? 'true' : undefined}
                onClick={() => {
                  setOpen(false);
                  if (id !== mission) openMissionAt(id, null, true);
                }}
              >
                {OUTLINES[id].short}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Says when the optional inspection light is on (a spacecraft in Earth's shadow). */
export function InspectionChip() {
  const [on, setOn] = useState(false);
  const set = useApp((s) => s.set);
  useEffect(() => {
    const h = window.setInterval(() => setOn(inspectionLight.active > 0.5), 300);
    return () => window.clearInterval(h);
  }, []);
  if (!on) return null;
  return (
    <div className="inspect-light panel" role="status">
      <span>Earth's shadow: inspection light on</span>
      <button className="linklike" onClick={() => set({ inspectLight: false })}>
        Turn off
      </button>
    </div>
  );
}

/** While an omitted (skipped) interval passes: the picture before the gap is held, and this says why. */
export function TimeSkip({ note, omitted }: { note?: string | null; omitted?: boolean } = {}) {
  const pb = usePlayback();
  const on = omitted ?? pb.omitted;
  const text = note ?? pb.note;
  if (!on || !text) return null;
  return (
    <div className="timeskip panel" role="status">
      <span className="eyebrow">Time skipped</span>
      <span>{text}</span>
    </div>
  );
}

export function MissionView() {
  const telemetry = useApp((s) => s.telemetry);
  const [chapters, setChapters] = useState(false);
  const [card, setCard] = useState(true);
  const pb = usePlayback();
  const dock = useRef<HTMLDivElement>(null);
  useDockHeight(dock);
  // the playback dock covers the bottom of the picture: frame the subject above it
  useStageInset('dock', dock, true, 8);
  return (
    <>
      <div className="mission-top">
        <div className="mission-title panel">
          <MissionSwitcher />
          <div className="mission-title__phase">{pb.phase?.title ?? 'Loading'}</div>
        </div>
        <FocusSwitch />
      </div>
      {pb.error && <div className="loading-note">This mission could not be built: {pb.error}</div>}
      <TimeSkip />
      <InspectionChip />
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
      <div className="bottom-dock" ref={dock}>
        <CameraBar />
        <PlaybackBar onChapters={() => setChapters((c) => !c)} />
      </div>
    </>
  );
}
