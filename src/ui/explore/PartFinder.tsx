/** Searchable, keyboard-navigable list of every part (the accessible alternative to 3D hotspots). */
import { useMemo, useState } from 'react';
import { PART_IDS, PARTS, SYSTEMS, type PartId, type SystemId } from '../../vehicle/parts';
import { useApp } from '../../state/store';
import { LESSONS } from '../../content/parts';
import { useProgress, exploredKey } from '../../state/progress';
import { Icon } from '../icons';

function matches(id: PartId, q: string): boolean {
  if (!q) return true;
  const d = PARTS[id];
  const hay = [d.name, d.label, ...d.keywords, LESSONS[id]?.summary ?? ''].join(' ').toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((w) => hay.includes(w));
}

export function PartFinder({ onClose }: { onClose?: () => void }) {
  const [q, setQ] = useState('');
  const part = useApp((s) => s.part);
  const cfg = useApp((s) => s.hangarConfig);
  const select = useApp((s) => s.selectPart);
  const explored = useProgress((s) => s.explored);
  const groups = useMemo(() => {
    const g = new Map<SystemId, PartId[]>();
    for (const id of PART_IDS) {
      const d = PARTS[id];
      if (d.body === 'ground' || d.id === 'station') continue;
      if (cfg === 'satellite' && d.variants.length && !d.variants.some((v) => v === 'satellite' || v === 'recovery' || v === 'expendable')) continue;
      if (cfg === 'capsule' && d.variants.length && !d.variants.some((v) => v === 'capsule' || v === 'recovery' || v === 'expendable')) continue;
      if (!matches(id, q)) continue;
      const arr = g.get(d.system) ?? [];
      arr.push(id);
      g.set(d.system, arr);
    }
    return [...g.entries()];
  }, [q, cfg]);
  return (
    <section className="panel finder" aria-label="Find a part">
      <div className="finder__head">
        <label className="search">
          <Icon.search size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search parts: turbopump, grid fins, COPV..." aria-label="Search parts" autoComplete="off" />
        </label>
        {onClose && (
          <button className="icon-btn icon-btn--flat" onClick={onClose} aria-label="Close part list">
            <Icon.close size={16} />
          </button>
        )}
      </div>
      <div className="finder__list">
        {groups.length === 0 && <p className="muted">No part matches “{q}”.</p>}
        {groups.map(([sys, ids]) => (
          <div key={sys} className="finder__group">
            <div className="eyebrow" style={{ color: SYSTEMS[sys].color }}>
              {SYSTEMS[sys].name}
            </div>
            <ul>
              {ids.map((id) => (
                <li key={id}>
                  <button className="finder__item" aria-current={part === id ? 'true' : undefined} onClick={() => select(part === id ? null : id)}>
                    <span className="finder__name">{PARTS[id].name}</span>
                    {explored[exploredKey.part(id)] && <span className="finder__seen" title="Explored" aria-label="explored"><Icon.check size={14} /></span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
