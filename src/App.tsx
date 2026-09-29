import { useEffect } from 'react';
import { Stage } from './scene/Stage';
import { HangarPlaceholder } from './scene/placeholders';
import { KimbleLogo, OneFab } from './brand/Logo';
import { useApp, type View } from './state/store';
import { director, goLocation, hangarHome } from './director/director';
import { devName } from './dev/index';
import { DevStage } from './dev/DevStage';

function Header() {
  const view = useApp((s) => s.view);
  const go = useApp((s) => s.go);
  const tabs: [View, string][] = [
    ['explore', 'Explore'],
    ['missions', 'Missions'],
    ['watch', 'Watch'],
  ];
  return (
    <header className="header">
      <button className="brand" onClick={() => go('home')} aria-label="KIMBLE Rocket Engineering, home">
        <KimbleLogo height={22} />
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
    </header>
  );
}

export function App() {
  if (devName) return <DevStage name={devName} />;
  return <Main />;
}

function Main() {
  const view = useApp((s) => s.view);
  useEffect(() => {
    director.reduced = useApp.getState().reducedMotion;
    hangarHome();
    goLocation('hangar');
  }, []);
  useEffect(() => {
    goLocation(view === 'mission' || view === 'watch' ? 'flight' : 'hangar');
  }, [view]);
  return (
    <div className="app">
      <Stage>{{ hangar: <HangarPlaceholder />, flight: null, map: null }}</Stage>
      <Header />
    </div>
  );
}
