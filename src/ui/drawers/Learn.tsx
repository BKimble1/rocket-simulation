/** Recommended learning path with progress (explored and checked understanding kept apart). */
import { LEARNING_PATH } from '../../content/learningPath';
import { CHECKS } from '../../content/checks';
import { useProgress, exploredKey } from '../../state/progress';
import { useApp } from '../../state/store';
import { goTo, linkLabel, type LinkTarget } from './goTo';
import { NAMES } from './names';
import { Icon } from '../icons';

function keyOf(t: LinkTarget): string {
  if ('part' in t) return exploredKey.part(t.part);
  if ('demo' in t) return exploredKey.demo(t.demo);
  if ('mission' in t) return t.phase ? exploredKey.phase(t.mission, t.phase) : `mission:${t.mission}`;
  return exploredKey.material(t.material);
}

export function Learn() {
  const explored = useProgress((s) => s.explored);
  const checked = useProgress((s) => s.checked);
  const set = useApp((s) => s.set);
  return (
    <div className="learn">
      <p className="muted">A suggested order. Start anywhere. Ticks show what you have explored; the separate count shows knowledge checks answered correctly.</p>
      <ol className="path">
        {LEARNING_PATH.map((step, i) => {
          const items = step.items as LinkTarget[];
          const seen = items.filter((t) => explored[keyOf(t)]).length;
          const topicChecks = CHECKS.filter((c) => c.topic === step.topic);
          const ok = topicChecks.filter((c) => checked[c.id]?.ok).length;
          return (
            <li key={i} className="path__step">
              <div className="path__head">
                <span className="path__n">{i + 1}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p className="small muted">{step.blurb}</p>
                </div>
              </div>
              <ul className="chips">
                {items.map((t, k) => (
                  <li key={k}>
                    <button className="chip" onClick={() => goTo(t)}>
                      {explored[keyOf(t)] && <Icon.check size={13} />} {linkLabel(t, NAMES)}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="path__meta small">
                Explored {seen} of {items.length}
                {topicChecks.length > 0 && (
                  <>
                    {' · '}
                    <button className="linklike" onClick={() => set({ drawer: 'checks' })}>
                      Checks correct: {ok} of {topicChecks.length}
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {LEARNING_PATH.length === 0 && <p className="muted">The learning path is being written.</p>}
      <div className="row">
        <button className="btn btn--sm" onClick={() => set({ drawer: 'glossary' })}>
          Glossary
        </button>
        <button className="btn btn--sm" onClick={() => set({ drawer: 'why' })}>
          Why this design?
        </button>
        <button className="btn btn--sm" onClick={() => set({ drawer: 'checks' })}>
          Knowledge checks
        </button>
      </div>
    </div>
  );
}
