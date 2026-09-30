/**
 * Optional knowledge checks: one question at a time, an explanation after answering (why right,
 * why the tempting answer is wrong) and a "show me again" link. No lives, timers or scores.
 */
import { useMemo, useState } from 'react';
import { CHECKS } from '../../content/checks';
import type { KnowledgeCheck, LearningTopic } from '../../content/types';
import { useProgress } from '../../state/progress';
import { goTo, linkLabel, type LinkTarget } from './goTo';
import { NAMES } from './names';
import { PARTS } from '../../vehicle/parts';

const TOPICS: [LearningTopic, string][] = [
  ['anatomy', 'Anatomy'],
  ['propulsion', 'Propulsion'],
  ['structures', 'Structures and materials'],
  ['guidance', 'Guidance and separation'],
  ['launch', 'Launch'],
  ['orbit', 'Orbit and payload'],
  ['return', 'Return and reuse'],
  ['missions', 'Mission comparisons'],
];

function OrderQuestion({ c, onAnswer }: { c: KnowledgeCheck; onAnswer: (ok: boolean) => void }) {
  const [picked, setPicked] = useState<number[]>([]);
  const answer = c.answer as number[];
  const done = picked.length === c.choices.length;
  return (
    <div>
      <p className="small muted">Tap the events in the order they happen.</p>
      <ol className="order">
        {picked.map((i) => (
          <li key={i}>{c.choices[i]}</li>
        ))}
      </ol>
      <div className="chips">
        {c.choices.map((ch, i) =>
          picked.includes(i) ? null : (
            <button
              key={i}
              className="chip"
              onClick={() => {
                const next = [...picked, i];
                setPicked(next);
                if (next.length === c.choices.length) onAnswer(next.every((v, k) => v === answer[k]));
              }}
            >
              {ch}
            </button>
          ),
        )}
      </div>
      {!done && picked.length > 0 && (
        <button className="linklike small" onClick={() => setPicked([])}>
          Start over
        </button>
      )}
    </div>
  );
}

function Question({ c }: { c: KnowledgeCheck }) {
  const mark = useProgress((s) => s.markChecked);
  const [result, setResult] = useState<null | { ok: boolean; pick?: number }>(null);
  const answer = (ok: boolean, pick?: number) => {
    setResult({ ok, pick });
    mark(c.id, ok);
  };
  return (
    <article className="check-q">
      {c.part && <div className="eyebrow">About: {PARTS[c.part].label}</div>}
      <p className="check-q__prompt">{c.prompt}</p>
      {c.kind === 'order' ? (
        <OrderQuestion c={c} onAnswer={(ok) => answer(ok)} />
      ) : (
        <div className="check-q__choices">
          {c.choices.map((ch, i) => (
            <button key={i} className={`choice${!result ? '' : i === c.answer ? ' choice--right' : result.pick === i ? ' choice--wrong' : ''}`} disabled={!!result} onClick={() => answer(i === c.answer, i)}>
              {ch}
            </button>
          ))}
        </div>
      )}
      {result && (
        <div className={`explain ${result.ok ? 'explain--ok' : 'explain--no'}`} role="status">
          <b>{result.ok ? 'Right.' : 'Not quite.'}</b> {c.explain}
          <div className="row">
            <button className="btn btn--sm" onClick={() => goTo(c.showAgain as LinkTarget)}>
              Show me again: {linkLabel(c.showAgain as LinkTarget, NAMES)}
            </button>
            <button className="linklike small" onClick={() => setResult(null)}>
              Try again
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

export function Checks() {
  const [topic, setTopic] = useState<LearningTopic>('anatomy');
  const checked = useProgress((s) => s.checked);
  const list = useMemo(() => CHECKS.filter((c) => c.topic === topic), [topic]);
  return (
    <div>
      <p className="muted small">Optional. Answer to test yourself; every answer comes with an explanation and a link back to the scene. Viewing alone never counts as checked.</p>
      <div className="chips">
        {TOPICS.map(([k, label]) => {
          const n = CHECKS.filter((c) => c.topic === k);
          const ok = n.filter((c) => checked[c.id]?.ok).length;
          return (
            <button key={k} className="chip" aria-pressed={topic === k} onClick={() => setTopic(k)}>
              {label} {n.length > 0 && <span className="muted">{ok}/{n.length}</span>}
            </button>
          );
        })}
      </div>
      {list.map((c) => (
        <Question key={c.id} c={c} />
      ))}
      {list.length === 0 && <p className="muted">No checks in this topic yet.</p>}
    </div>
  );
}
