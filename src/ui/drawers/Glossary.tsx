import { useMemo, useState } from 'react';
import { GLOSSARY } from '../../content/glossary';
import { goTo, linkLabel, type LinkTarget } from './goTo';
import { NAMES } from './names';
import { Icon } from '../icons';

export function Glossary() {
  const [q, setQ] = useState('');
  const list = useMemo(
    () =>
      [...GLOSSARY]
        .sort((a, b) => a.term.localeCompare(b.term))
        .filter((g) => !q || `${g.term} ${(g.aliases ?? []).join(' ')} ${g.definition}`.toLowerCase().includes(q.toLowerCase())),
    [q],
  );
  return (
    <div>
      <label className="search">
        <Icon.search size={16} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search terms" aria-label="Search glossary" />
      </label>
      <dl className="glossary">
        {list.map((g) => (
          <div key={g.id} id={`g-${g.id}`}>
            <dt>{g.term}</dt>
            <dd>
              <p>{g.definition}</p>
              {g.see.length > 0 && (
                <ul className="chips">
                  {(g.see as LinkTarget[]).map((t, i) => (
                    <li key={i}>
                      <button className="chip" onClick={() => goTo(t)}>
                        See: {linkLabel(t, NAMES)}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
