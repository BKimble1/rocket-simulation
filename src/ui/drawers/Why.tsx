/** "Why this design?" explainers: staged beats that reveal or compare, never score. */
import { useState } from 'react';
import { WHY_DEMOS } from '../../content/why';
import { useProgress, exploredKey } from '../../state/progress';
import { sourceById } from '../../content/sources';
import { WhyVisual } from './WhyVisual';

export function Why() {
  const [sel, setSel] = useState<string | null>(null);
  const [beat, setBeat] = useState(0);
  const mark = useProgress((s) => s.markExplored);
  const d = WHY_DEMOS.find((w) => w.id === sel);
  if (!d)
    return (
      <ul className="whylist">
        {WHY_DEMOS.map((w) => (
          <li key={w.id}>
            <button
              className="linkbtn"
              onClick={() => {
                setSel(w.id);
                setBeat(0);
                mark(exploredKey.why(w.id));
              }}
            >
              <span className="linkbtn__title">{w.title}</span>
              <span className="linkbtn__note">{w.question}</span>
            </button>
          </li>
        ))}
        {WHY_DEMOS.length === 0 && <p className="muted">These explainers are being written.</p>}
      </ul>
    );
  const b = d.beats[Math.min(beat, d.beats.length - 1)];
  return (
    <div className="why">
      <button className="linklike small" onClick={() => setSel(null)}>
        All questions
      </button>
      <h3>{d.title}</h3>
      <p className="lead small">{d.question}</p>
      <WhyVisual id={d.id} beat={beat} visual={b.visual} />
      <p>{b.text}</p>
      <div className="row">
        <button className="btn btn--sm" disabled={beat === 0} onClick={() => setBeat(beat - 1)}>
          Back
        </button>
        <span className="small muted">
          {beat + 1} / {d.beats.length}
        </span>
        <button className="btn btn--sm btn--primary" disabled={beat >= d.beats.length - 1} onClick={() => setBeat(beat + 1)}>
          Next
        </button>
      </div>
      {beat >= d.beats.length - 1 && (
        <>
          <p className="takeaway">
            <b>Takeaway.</b> {d.takeaway}
          </p>
          {d.equation && (
            <details className="qa" open>
              <summary>
                {d.equation.name}: <code>{d.equation.formula}</code>
              </summary>
              <ul className="plain small">
                {d.equation.variables.map((v) => (
                  <li key={v.symbol}>
                    <code>{v.symbol}</code> {v.meaning} ({v.unit})
                  </li>
                ))}
              </ul>
              <p className="small">{d.equation.caveat}</p>
              {d.equation.example && <p className="small">{d.equation.example}</p>}
            </details>
          )}
          {d.sources.length > 0 && (
            <p className="small muted">
              Sources:{' '}
              {d.sources.map((id, i) => {
                const s = sourceById(id);
                return (
                  <span key={id}>
                    {i > 0 && '; '}
                    {s ? (
                      <a href={s.url} target="_blank" rel="noreferrer">
                        {s.title}
                      </a>
                    ) : (
                      id
                    )}
                  </span>
                );
              })}
            </p>
          )}
        </>
      )}
    </div>
  );
}
