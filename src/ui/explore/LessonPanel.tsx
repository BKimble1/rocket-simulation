/**
 * The lesson for the selected part: the seven questions of the lesson contract at three
 * depths (Quick explanation, Engineering detail, Materials & manufacturing), linked to the
 * geometry (connections), the materials index, demonstrations and mission phases.
 */
import { useEffect, useRef } from 'react';
import { useStageInset } from '../hooks/useStageInset';
import { PARTS, SYSTEMS, type PartId } from '../../vehicle/parts';
import { useApp, type Depth } from '../../state/store';
import { LESSONS } from '../../content/parts';
import type { PartLesson, PartNote, PhaseLink } from '../../content/types';
import { MATERIALS } from '../../content/materials';
import { sourceById } from '../../content/sources';
import { OUTLINES } from '../../timeline/missions/outline';
import { DEMOS, startDemo } from '../../scene/demos';
import { useProgress, exploredKey } from '../../state/progress';
import { Icon } from '../icons';
import { openMissionAt } from '../nav';

const DEPTHS: [Depth, string][] = [
  ['quick', 'Quick explanation'],
  ['engineering', 'Engineering detail'],
  ['materials', 'Materials & manufacturing'],
];

function isFull(l: PartLesson | PartNote | undefined): l is PartLesson {
  return !!l && 'how' in l;
}

function PhaseLinks({ links }: { links: PhaseLink[] }) {
  if (!links.length) return null;
  return (
    <ul className="links">
      {links.map((l, i) => {
        const o = OUTLINES[l.mission];
        const ph = o?.phases.find((p) => p.id === l.phase) ?? o?.branch?.phases.find((p) => p.id === l.phase);
        if (!o || !ph) return null;
        return (
          <li key={i}>
            <button className="linkbtn" onClick={() => openMissionAt(l.mission, l.phase)}>
              <span className="linkbtn__title">
                {o.short} · {ph.title}
              </span>
              <span className="linkbtn__note">{l.note}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function MaterialsList({ l }: { l: PartLesson | PartNote }) {
  const set = useApp((s) => s.set);
  return (
    <ul className="chips">
      {l.materials.map((m, i) => (
        <li key={i}>
          <button className="chip chip--mat" onClick={() => set({ lens: 'materials', material: m.material })} title={m.role}>
            <span>{MATERIALS[m.material]?.name ?? m.material}</span>
            {!m.inThisVehicle && <span className="chip__tag">comparison</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

function Sources({ ids }: { ids: string[] }) {
  if (!ids.length) return null;
  return (
    <details className="sources">
      <summary>Sources</summary>
      <ul>
        {ids.map((id) => {
          const s = sourceById(id);
          return <li key={id}>{s ? <a href={s.url} target="_blank" rel="noreferrer">{s.title}</a> : id}{s ? <span className="muted"> · {s.publisher}</span> : null}</li>;
        })}
      </ul>
    </details>
  );
}

function Q({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="q">
      <h4>
        <span className="q__n">{n}</span>
        {title}
      </h4>
      {children}
    </section>
  );
}

export function LessonPanel({ id, onClose }: { id: PartId; onClose: () => void }) {
  const depth = useApp((s) => s.depth);
  const set = useApp((s) => s.set);
  const select = useApp((s) => s.selectPart);
  const mark = useProgress((s) => s.markExplored);
  const d = PARTS[id];
  const l = LESSONS[id];
  useEffect(() => mark(exploredKey.part(id)), [id, mark]);
  const ref = useRef<HTMLElement>(null);
  useStageInset('lesson', ref);
  const demo = isFull(l) && l.demo ? DEMOS[l.demo] : null;
  return (
    <aside className="panel lesson" aria-label={`${d.name} lesson`} ref={ref}>
      <header className="lesson__head">
        <div>
          <div className="eyebrow" style={{ color: SYSTEMS[d.system].color }}>
            {SYSTEMS[d.system].name}
            {d.parent && (
              <>
                {' · part of '}
                <button className="linklike" onClick={() => select(d.parent!)}>
                  {PARTS[d.parent].label}
                </button>
              </>
            )}
          </div>
          <h2>{d.name}</h2>
        </div>
        <button className="icon-btn icon-btn--flat" onClick={onClose} aria-label="Close lesson">
          <Icon.close size={16} />
        </button>
      </header>
      {!l && <p className="muted">This lesson is being written.</p>}
      {l && <p className="lesson__summary">{l.summary}</p>}
      {l && (
        <div className="seg" role="tablist" aria-label="Depth">
          {DEPTHS.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={depth === k} className="seg__btn" onClick={() => set({ depth: k })}>
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="lesson__body">
        {demo && (
          <button className="btn btn--accent btn--sm demo-btn" onClick={() => startDemo(demo.id)}>
            <Icon.play size={14} /> {demo.title}
          </button>
        )}
        {isFull(l) && depth === 'quick' && (
          <>
            <p>{l.depth.quick}</p>
            <Q n={1} title="Where it is">
              <p>{l.where}</p>
              <Connections ids={l.connections} />
            </Q>
            <Q n={2} title="What it does">
              <p>{l.function}</p>
            </Q>
            <Q n={3} title="When it matters">
              <p>{l.why}</p>
              <PhaseLinks links={l.phases} />
            </Q>
          </>
        )}
        {isFull(l) && depth === 'engineering' && (
          <>
            <p>{l.depth.engineering}</p>
            <Q n={1} title="Where it is, what it connects to">
              <p>{l.where}</p>
              <Connections ids={l.connections} />
            </Q>
            <Q n={2} title="What it does and how it works">
              <p>{l.function}</p>
              <p>{l.how}</p>
            </Q>
            <Q n={3} title="Why it is needed at this point in the mission">
              <p>{l.why}</p>
              <PhaseLinks links={l.phases} />
            </Q>
            <Q n={4} title="Loads, temperatures and fluids">
              <p>{l.environment}</p>
              {l.figures && l.figures.length > 0 && (
                <dl className="figures">
                  {l.figures.map((f, i) => (
                    <div key={i}>
                      <dt>{f.label}</dt>
                      <dd>
                        {f.value}
                        {f.note && <span className="muted"> · {f.note}</span>}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </Q>
            <Q n={5} title="Materials, and why">
              <MaterialsList l={l} />
              <p>{l.materialsWhy}</p>
            </Q>
            <Q n={6} title="How it is made, joined, inspected and tested">
              <p>{l.manufacturing}</p>
              <p>{l.inspection}</p>
            </Q>
            <Q n={7} title="Common misunderstanding, and if it were missing">
              <p>
                <b>Misunderstanding.</b> {l.misconception}
              </p>
              <p>
                <b>Without it.</b> {l.ifAbsent}
              </p>
            </Q>
          </>
        )}
        {isFull(l) && depth === 'materials' && (
          <>
            <p>{l.depth.materials}</p>
            <Q n={5} title="Materials, and why">
              <MaterialsList l={l} />
              <p>{l.materialsWhy}</p>
            </Q>
            <Q n={6} title="Making, joining, inspecting, testing">
              <p>{l.manufacturing}</p>
              <p>{l.inspection}</p>
            </Q>
          </>
        )}
        {l && !isFull(l) && (
          <>
            <p>{l.function}</p>
            <p>{l.why}</p>
            <MaterialsList l={l} />
            <PhaseLinks links={l.phases} />
          </>
        )}
        {l && <Sources ids={l.sources} />}
      </div>
    </aside>
  );
}

function Connections({ ids }: { ids: PartId[] }) {
  const select = useApp((s) => s.selectPart);
  if (!ids.length) return null;
  return (
    <ul className="chips">
      {ids.map((c) => (
        <li key={c}>
          <button className="chip" onClick={() => select(c)}>
            {PARTS[c]?.label ?? c}
          </button>
        </li>
      ))}
    </ul>
  );
}
