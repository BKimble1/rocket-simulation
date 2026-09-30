/**
 * First screen: the vehicle in the hangar, a short title and three clear actions. The
 * recommended path (satellite mission) is one click away.
 */
import { useRef } from 'react';
import { useApp } from '../state/store';
import { useStageInset } from './hooks/useStageInset';
import { openMissionAt } from './nav';
import { KimbleLogo, KimbleMark, OneFab } from '../brand/Logo';
import { Icon } from './icons';

export function Home() {
  const go = useApp((s) => s.go);
  const set = useApp((s) => s.set);
  const ref = useRef<HTMLElement>(null);
  useStageInset('home', ref);
  return (
    <section className="home" aria-labelledby="home-title" ref={ref}>
      <div className="home__card panel">
        <div className="home__mark">
          <KimbleMark size={34} className="home__k" />
          <span className="home__word">
            <KimbleLogo height={24} />
          </span>
          <span className="eyebrow">Rocket Engineering</span>
          <span className="home__onefab">
            <OneFab height={8} />
          </span>
        </div>
        <h1 id="home-title">Understand a rocket, part by part and phase by phase.</h1>
        <p className="lead">A two-stage launch vehicle you can open up, and six missions you can watch unfold: what every part does, why it is there, what it is made of, and when it matters.</p>
        <div className="home__actions">
          <button className="action" onClick={() => go('explore')}>
            <span className="action__title">Explore the rocket</span>
            <span className="action__text">Rotate it, open cutaways, run the engine and the tanks, see materials.</span>
          </button>
          <button className="action action--primary" onClick={() => openMissionAt('leo', null, true)}>
            <span className="action__title">
              Explore a mission <Icon.arrow size={16} />
            </span>
            <span className="action__text">Recommended: put a satellite in orbit, with the booster landing.</span>
          </button>
          <button className="action" onClick={() => go('watch')}>
            <span className="action__title">Watch and learn</span>
            <span className="action__text">A narrated journey with captions and chapters.</span>
          </button>
        </div>
        <p className="home__note">
          <button className="linklike" onClick={() => set({ drawer: 'learn' })}>
            Follow the recommended learning path
          </button>{' '}
          or go anywhere directly. The vehicle is a generic educational design with illustrative values;{' '}
          <button className="linklike" onClick={() => set({ drawer: 'credits' })}>
            sources and credits
          </button>
          .
        </p>
      </div>
    </section>
  );
}
