/** Mission picker: purpose, chapters, estimated viewing time, knowledge outcome. No scores. */
import { useMemo, useState } from 'react';
import { MISSION_ORDER, OUTLINES } from '../../timeline/missions/outline';
import type { MissionId } from '../../timeline/types';
import { getTimeline } from '../../state/playback';
import { presDuration } from '../../timeline/sample';
import { formatDuration } from '../format';
import { openMissionAt } from '../nav';
import { Icon } from '../icons';

function viewingTime(id: MissionId): string {
  try {
    return formatDuration(presDuration(getTimeline(id).pres));
  } catch {
    return '';
  }
}

export function Missions() {
  const [sel, setSel] = useState<MissionId>('leo');
  const times = useMemo(() => Object.fromEntries(MISSION_ORDER.map((id) => [id, viewingTime(id)])), []);
  const o = OUTLINES[sel];
  return (
    <div className="missions">
      <div className="missions__list panel" role="listbox" aria-label="Missions">
        <div className="eyebrow">Choose a mission to study</div>
        {MISSION_ORDER.map((id) => {
          const m = OUTLINES[id];
          return (
            <button key={id} role="option" aria-selected={sel === id} className="mcard" onClick={() => setSel(id)} onDoubleClick={() => openMissionAt(id, null, true)}>
              <span className="mcard__title">
                {m.title}
                {m.recommended && <span className="badge">Recommended first</span>}
              </span>
              <span className="mcard__meta">
                {m.phases.length} chapters{times[id] ? ` · about ${times[id]} at 1×` : ''}
                {m.branch ? ' · with booster landing' : ''}
              </span>
            </button>
          );
        })}
      </div>
      <section className="missions__detail panel" aria-live="polite">
        <div className="eyebrow">Mission lesson</div>
        <h2>{o.title}</h2>
        <p className="lead">{o.purpose}</p>
        <p className="outcome">
          <b>You will understand:</b> {o.outcome}
        </p>
        <ol className="chapters">
          {o.phases.map((p) => (
            <li key={p.id}>
              <button className="linklike" onClick={() => openMissionAt(sel, p.id)}>
                {p.title}
              </button>
            </li>
          ))}
        </ol>
        {o.branch && (
          <p className="muted small">
            Parallel storyline: <b>{o.branch.title}</b> ({o.branch.phases.map((p) => p.title).join(', ')}). Switch focus at any time; the mission clock is shared.
          </p>
        )}
        <div className="row">
          <button className="btn btn--primary btn--lg" onClick={() => openMissionAt(sel, null, true)}>
            Start mission <Icon.arrow size={18} />
          </button>
        </div>
      </section>
    </div>
  );
}
