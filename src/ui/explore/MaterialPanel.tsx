/**
 * Materials view: a searchable index; a material's entry lists where it is used in THIS
 * vehicle (click to select the part) separately from other documented designs, compares its
 * properties against requirements, and shows manufacturing and inspection.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStageInset } from '../hooks/useStageInset';
import { MATERIAL_IDS, type MaterialId } from '../../content/materials/ids';
import { MATERIALS } from '../../content/materials';
import { partsUsing } from '../../content/materials/assignments';
import { PARTS } from '../../vehicle/parts';
import { useApp } from '../../state/store';
import { sourceById } from '../../content/sources';
import { useProgress, exploredKey } from '../../state/progress';
import { Icon } from '../icons';

export function MaterialPanel({ onClose }: { onClose: () => void }) {
  const material = useApp((s) => s.material) as MaterialId | null;
  const set = useApp((s) => s.set);
  const [q, setQ] = useState('');
  const mark = useProgress((s) => s.markExplored);
  const ref = useRef<HTMLElement>(null);
  useStageInset('materials', ref);
  useEffect(() => {
    if (material) mark(exploredKey.material(material));
  }, [material, mark]);
  const list = useMemo(
    () =>
      MATERIAL_IDS.filter((id) => {
        const m = MATERIALS[id];
        const hay = `${id} ${m?.name ?? ''} ${m?.family ?? ''} ${m?.focus ?? ''}`.toLowerCase();
        return !q || hay.includes(q.toLowerCase());
      }),
    [q],
  );
  const m = material ? MATERIALS[material] : null;
  const uses = material ? partsUsing(material) : [];
  return (
    <aside className="panel lesson matpanel" aria-label="Materials" ref={ref}>
      <header className="lesson__head">
        <div>
          <div className="eyebrow">Materials view</div>
          <h2>{m ? m.name : 'Materials and manufacturing'}</h2>
        </div>
        <button className="icon-btn icon-btn--flat" onClick={onClose} aria-label="Close materials">
          <Icon.close size={16} />
        </button>
      </header>
      {!m && (
        <>
          <p className="lesson__summary">The model is coloured by material family. Choose a material to see where this vehicle uses it, why, and how it is made and inspected.</p>
          <label className="search">
            <Icon.search size={16} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search materials" aria-label="Search materials" />
          </label>
          <ul className="matlist">
            {list.map((id) => (
              <li key={id}>
                <button className="finder__item" onClick={() => set({ material: id })}>
                  <span className="finder__name">{MATERIALS[id]?.name ?? id}</span>
                  <span className="muted small">{MATERIALS[id]?.family}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {m && (
        <div className="lesson__body">
          <button className="linklike" onClick={() => set({ material: null })}>
            <Icon.back size={14} /> All materials
          </button>
          <p className="lesson__summary">{m.focus}</p>
          <section className="q">
            <h4>Used in this illustrative vehicle</h4>
            {uses.filter((u) => u.inThisVehicle).length === 0 && <p className="muted">Not used in the K-1; shown for comparison.</p>}
            <ul className="links">
              {uses
                .filter((u) => u.inThisVehicle)
                .map((u, i) => (
                  <li key={i}>
                    <button className="linkbtn" onClick={() => set({ part: u.part, lens: 'systems' })}>
                      <span className="linkbtn__title">{PARTS[u.part].name}</span>
                      <span className="linkbtn__note">{u.role}</span>
                    </button>
                  </li>
                ))}
            </ul>
          </section>
          {(m.elsewhere.length > 0 || uses.some((u) => !u.inThisVehicle)) && (
            <section className="q">
              <h4>Other documented designs (comparison)</h4>
              <ul className="plain">
                {uses
                  .filter((u) => !u.inThisVehicle)
                  .map((u, i) => (
                    <li key={`c${i}`}>
                      {PARTS[u.part].label}: {u.role}
                    </li>
                  ))}
                {m.elsewhere.map((e, i) => (
                  <li key={i}>{e.text}</li>
                ))}
              </ul>
            </section>
          )}
          <section className="q">
            <h4>Why it suits the job</h4>
            <p>{m.suits}</p>
            <p className="muted">{m.limits}</p>
          </section>
          {m.compare.length > 0 && (
            <section className="q">
              <h4>Compared with the requirements</h4>
              <dl className="figures">
                {m.compare.map((c, i) => (
                  <div key={i}>
                    <dt>{c.axis}</dt>
                    <dd>{c.text}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          {m.properties.length > 0 && (
            <section className="q">
              <h4>Representative properties</h4>
              <table className="props">
                <tbody>
                  {m.properties.map((p, i) => (
                    <tr key={i}>
                      <th>{p.property}</th>
                      <td>
                        {p.value}
                        <div className="muted small">
                          {p.condition}
                          {sourceById(p.source) ? ` · ${sourceById(p.source)!.publisher}` : ''}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
          <section className="q">
            <h4>Manufacturing and inspection</h4>
            <p>{m.manufacturing}</p>
            <p>{m.inspection}</p>
          </section>
          {m.question && (
            <details className="qa">
              <summary>{m.question.q}</summary>
              <p>{m.question.a}</p>
            </details>
          )}
          {m.sources.length > 0 && (
            <details className="sources">
              <summary>Sources</summary>
              <ul>
                {m.sources.map((id) => {
                  const s = sourceById(id);
                  return <li key={id}>{s ? <a href={s.url} target="_blank" rel="noreferrer">{s.title}</a> : id}</li>;
                })}
              </ul>
            </details>
          )}
        </div>
      )}
    </aside>
  );
}
