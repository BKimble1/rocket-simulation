import { Component, useEffect, useState, type ReactNode } from 'react';
import { Stage } from './scene/Stage';
import { KimbleLogo, KimbleMark, OneFab } from './brand/Logo';
import { useApp, type View } from './state/store';
import { director, goLocation, hangarHome } from './director/director';
import { devName } from './dev/index';
import { DevStage } from './dev/DevStage';
import { Hangar } from './scene/hangar/Hangar';
import { FlightWorld } from './scene/flight/FlightWorld';
import { OrbitalMap } from './scene/map/OrbitalMap';
import { Home } from './ui/Home';
import { Explore } from './ui/explore/Explore';
import { Missions } from './ui/mission/Missions';
import { MissionView } from './ui/mission/MissionView';
import { WatchView } from './ui/watch/WatchView';
import { Drawer } from './ui/drawers/Drawer';
import { Learn } from './ui/drawers/Learn';
import { Glossary } from './ui/drawers/Glossary';
import { Checks } from './ui/drawers/Checks';
import { Why } from './ui/drawers/Why';
import { Settings } from './ui/drawers/Settings';
import { Credits } from './ui/drawers/Credits';
import { Icon } from './ui/icons';
import { HUB, FLAGS } from './config';
import { installPlaybackTick, loadMission, playback } from './state/playback';
import { installRouting, parseRoute, routeExtras } from './state/route';
import { openMissionAt } from './ui/nav';
import { installAudio } from './audio/engine';
import { Diag } from './ui/Diag';
import { useQuality, setManualTier } from './scene/quality';
import { PART_IDS, PARTS } from './vehicle/parts';
import { LESSONS } from './content/parts';
import { PHASE_CARDS } from './content/phaseCards';
import { MISSION_ORDER, OUTLINES } from './timeline/missions/outline';

function Header() {
  const view = useApp((s) => s.view);
  const go = useApp((s) => s.go);
  const set = useApp((s) => s.set);
  const tabs: [View, string][] = [
    ['explore', 'Explore'],
    ['missions', 'Missions'],
    ['watch', 'Watch'],
  ];
  return (
    <header className="header">
      <button className="brand" onClick={() => go('home')} aria-label="KIMBLE Rocket Engineering, home">
        <KimbleLogo height={22} />
        <KimbleMark size={26} className="brand__mark" />
        <span className="brand__sub">
          <span>Rocket Engineering</span>
          <OneFab height={8} />
        </span>
      </button>
      <nav className="nav" aria-label="Modes">
        {tabs.map(([v, label]) => (
          <button key={v} aria-current={view === v || (v === 'missions' && view === 'mission') ? 'page' : undefined} onClick={() => go(v)}>
            {label}
          </button>
        ))}
      </nav>
      <span className="header__spacer" />
      {HUB.url && (
        <a className="btn btn--sm btn--quiet hub-link" href={HUB.url}>
          {HUB.label}
        </a>
      )}
      <button className="icon-btn" onClick={() => set({ drawer: 'learn' })} aria-label="Learning path, glossary and checks">
        <Icon.book size={17} />
      </button>
      <button className="icon-btn" onClick={() => set({ drawer: 'settings' })} aria-label="Settings">
        <Icon.gear size={17} />
      </button>
    </header>
  );
}

function Drawers() {
  const drawer = useApp((s) => s.drawer);
  const set = useApp((s) => s.set);
  const close = () => set({ drawer: null });
  if (!drawer) return null;
  const map = {
    learn: ['Learning path', <Learn key="l" />],
    glossary: ['Glossary', <Glossary key="g" />],
    checks: ['Knowledge checks', <Checks key="c" />],
    why: ['Why this design?', <Why key="w" />],
    settings: ['Settings', <Settings key="s" />],
    credits: ['Sources and credits', <Credits key="cr" />],
    chapters: ['Chapters', null],
    parts: ['Parts', null],
    materials: ['Materials', null],
  } as const;
  const [title, body] = map[drawer];
  return (
    <Drawer title={title} onClose={close} wide={drawer === 'checks' || drawer === 'why'}>
      {body}
    </Drawer>
  );
}

function LoadingNote() {
  const [w, setW] = useState<string | null>(null);
  useEffect(() => {
    const h = window.setInterval(() => setW(director.waiting), 200);
    return () => window.clearInterval(h);
  }, []);
  useEffect(() => {
    playback.player?.hold('loading', !!w && w === 'flight');
  }, [w]);
  if (!w) return null;
  return <div className="loading-note">{w === 'flight' ? 'Preparing the launch site, Earth and sky…' : 'Preparing the view…'}</div>;
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: Error) {
    return { error: e.message };
  }
  render() {
    if (this.state.error)
      return (
        <div className="fallback">
          <KimbleLogo height={28} />
          <h1>Something went wrong</h1>
          <p>{this.state.error}</p>
          <button className="btn btn--primary" onClick={() => location.reload()}>
            Reload
          </button>
        </div>
      );
    return this.props.children;
  }
}

function webglAvailable(): boolean {
  if (FLAGS.noWebGL) return false;
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}

function NoWebGL() {
  return (
    <div className="fallback">
      <KimbleLogo height={28} />
      <h1>3D is not available on this device or browser</h1>
      <p>KIMBLE Rocket Engineering draws the vehicle and missions with WebGL 2, which this browser did not provide (it may be disabled, or the graphics driver is blocked).</p>
      <p>Try a current version of Chrome, Edge, Firefox or Safari, or enable hardware acceleration. The lessons remain available below as text.</p>
      <TextOnlyLessons />
    </div>
  );
}

function TextOnlyLessons() {
  return (
    <div className="textonly">
      <h2>Part lessons (text only)</h2>
      {PART_IDS.filter((id) => LESSONS[id]).map((id) => {
        const l = LESSONS[id]!;
        return (
          <details key={id}>
            <summary>{PARTS[id].name}</summary>
            <p>{l.summary}</p>
            <p>{l.function}</p>
            {'how' in l && <p>{l.how}</p>}
            <p>{l.why}</p>
            {'environment' in l && <p>{l.environment}</p>}
            {'materialsWhy' in l && <p>{l.materialsWhy}</p>}
          </details>
        );
      })}
      <h2>Mission phases (text only)</h2>
      {MISSION_ORDER.map((m) => (
        <details key={m}>
          <summary>{OUTLINES[m].title}</summary>
          {OUTLINES[m].phases.map((ph) => {
            const c = PHASE_CARDS[`${m}:${ph.id}`];
            return c ? (
              <div key={ph.id}>
                <h3>{ph.title}</h3>
                <p>{c.what}</p>
                <p>{c.whyNow}</p>
                <p>{c.next}</p>
              </div>
            ) : null;
          })}
        </details>
      ))}
    </div>
  );
}

export function App() {
  if (devName) return <DevStage name={devName} />;
  if (!webglAvailable()) return <NoWebGL />;
  return (
    <ErrorBoundary>
      <Main />
    </ErrorBoundary>
  );
}

function Main() {
  const view = useApp((s) => s.view);
  const toast = useApp((s) => s.toast);
  const quality = useApp((s) => s.quality);
  const drawer = useApp((s) => s.drawer);
  useEffect(() => {
    const r = parseRoute(window.location.search);
    useApp.setState(r);
    director.reduced = useApp.getState().reducedMotion;
    installPlaybackTick();
    installRouting(() => routeExtras.chapter);
    installAudio();
    if (quality !== 'auto') setManualTier(quality);
    if (r.view === 'mission' || r.view === 'watch') {
      if (r.view === 'mission') openMissionAt(r.mission ?? 'leo', routeExtras.chapter);
      else loadMission(r.mission ?? 'leo');
    }
    hangarHome();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (view === 'mission' || view === 'watch') {
      const cam = useApp.getState().cam;
      goLocation(cam === 'map' && view === 'mission' ? 'map' : 'flight');
    } else {
      goLocation('hangar');
      // leaving a mission without inspecting: stop the clock
      if (!useApp.getState().inspect) playback.player?.pause();
    }
  }, [view]);
  useEffect(() => {
    playback.player?.hold('dialog', !!drawer);
  }, [drawer]);
  void useQuality;
  return (
    <div className="app" data-view={view}>
      <Stage>{{ hangar: <Hangar />, flight: <FlightWorld />, map: <OrbitalMap /> }}</Stage>
      <Header />
      <main className="overlay" aria-live="polite">
        {view === 'home' && <Home />}
        {view === 'explore' && <Explore />}
        {view === 'missions' && <Missions />}
        {view === 'mission' && <MissionView />}
        {view === 'watch' && <WatchView />}
      </main>
      <LoadingNote />
      {toast && <div className="toast">{toast}</div>}
      <Drawers />
      {FLAGS.diag && <Diag />}
    </div>
  );
}
