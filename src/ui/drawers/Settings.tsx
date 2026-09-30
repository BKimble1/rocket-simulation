import { useApp, type QualitySetting, type SoundMode } from '../../state/store';
import { useQuality, setManualTier } from '../../scene/quality';
import { useProgress } from '../../state/progress';
import { director } from '../../director/director';
import { HUB } from '../../config';
import { Icon } from '../icons';

export function Settings() {
  const s = useApp();
  const q = useQuality();
  const reset = useProgress((p) => p.reset);
  return (
    <div className="settings">
      <fieldset>
        <legend>Graphics quality</legend>
        <div className="seg seg--inline">
          {(['auto', 'high', 'medium', 'low'] as QualitySetting[]).map((k) => (
            <button
              key={k}
              className="seg__btn"
              aria-pressed={s.quality === k}
              onClick={() => {
                s.set({ quality: k });
                setManualTier(k === 'auto' ? null : k);
              }}
            >
              {k === 'auto' ? 'Automatic' : k[0].toUpperCase() + k.slice(1)}
            </button>
          ))}
        </div>
        <p className="small muted">
          Now drawing at <b>{q.tier}</b> ({q.reason}). Lessons and timing are identical at every level.
        </p>
      </fieldset>
      <fieldset>
        <legend>Sound</legend>
        <div className="seg seg--inline">
          {(
            [
              ['off', 'Off'],
              ['realistic', 'Realistic'],
              ['cinematic', 'Cinematic'],
            ] as [SoundMode, string][]
          ).map(([k, label]) => (
            <button key={k} className="seg__btn" aria-pressed={s.sound === k} onClick={() => s.set({ sound: k })}>
              {label}
            </button>
          ))}
        </div>
        <p className="small muted">Realistic: silence outside the vehicle in vacuum. Cinematic: soundtrack-style effects everywhere (labelled).</p>
      </fieldset>
      <label className="check">
        <input type="checkbox" checked={s.captions} onChange={() => s.set({ captions: !s.captions })} /> Captions in Watch
      </label>
      <label className="check">
        <input type="checkbox" checked={s.narration} onChange={() => s.set({ narration: !s.narration })} /> Narration in Watch
      </label>
      <label className="check">
        <input type="checkbox" checked={s.telemetry} onChange={() => s.set({ telemetry: !s.telemetry })} /> Reference telemetry in missions
      </label>
      <label className="check">
        <input type="checkbox" checked={s.inspectLight} onChange={() => s.set({ inspectLight: !s.inspectLight })} /> Inspection light in Earth's shadow (a spacecraft there is otherwise a dark silhouette; labelled on screen when on)
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={s.reducedMotion}
          onChange={() => {
            director.reduced = !s.reducedMotion;
            s.set({ reducedMotion: !s.reducedMotion });
          }}
        />{' '}
        Reduce motion (short dissolves instead of camera travel, no shake)
      </label>
      <p className="settings__learn">
        <button className="btn btn--sm" onClick={() => s.set({ drawer: 'learn' })}>
          Learning path, glossary and checks
        </button>
      </p>
      {HUB.url && (
        <p>
          <a className="btn btn--sm" href={HUB.url}>
            <Icon.back size={14} /> {HUB.label}
          </a>
        </p>
      )}
      <fieldset>
        <legend>Progress</legend>
        <button className="btn btn--sm" onClick={() => confirm('Reset explored items and knowledge-check answers?') && reset()}>
          Reset progress
        </button>
      </fieldset>
    </div>
  );
}
