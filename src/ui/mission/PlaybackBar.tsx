/**
 * Mission playback: play/pause, the presentation scrubber with chapter ticks and event
 * markers, mission time (T-/T+), playback speed, and the time-compression note. Seeking is
 * exact (the whole scene is reconstructed from mission time).
 */
import { useMemo, useRef, useState } from 'react';
import { usePlayback, playback, seekPres } from '../../state/playback';
import { missionToPres } from '../../timeline/sample';
import { formatMissionTime } from '../format';
import { Icon } from '../icons';

const SPEEDS = [0.5, 1, 2, 4, 8];

export function PlaybackBar({ onChapters, compact = false }: { onChapters?: () => void; compact?: boolean }) {
  const pb = usePlayback();
  const tl = playback.player?.tl ?? null;
  const bar = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ x: number; label: string } | null>(null);
  const marks = useMemo(() => {
    if (!tl) return { phases: [], events: [] as { p: number; label: string }[] };
    return {
      phases: tl.phases.map((ph) => ({ p: missionToPres(tl.pres, ph.start), label: ph.title })),
      events: tl.events.filter((e) => e.kind !== 'countdown').map((e) => ({ p: missionToPres(tl.pres, e.t), label: `${e.label} · ${formatMissionTime(e.t)}` })),
    };
  }, [tl]);
  if (!tl) return null;
  const dur = pb.duration || 1;
  const pct = (p: number) => `${((p / dur) * 100).toFixed(3)}%`;
  const seekFromEvent = (clientX: number) => {
    const r = bar.current!.getBoundingClientRect();
    seekPres(Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * dur);
  };
  return (
    <div className={`playbar panel${compact ? ' playbar--compact' : ''}`} role="group" aria-label="Mission playback">
      <button className="icon-btn icon-btn--play" onClick={() => playback.player?.toggle()} aria-label={pb.playing ? 'Pause mission' : 'Play mission'}>
        {pb.playing ? <Icon.pause size={18} /> : <Icon.play size={18} />}
      </button>
      <div className="playbar__time" aria-live="off">
        <span className="playbar__t" title="Mission time: seconds from liftoff (T-0)">
          {formatMissionTime(pb.t)}
        </span>
        {pb.note && <span className="note-chip">{pb.note}</span>}
        {!pb.note && pb.timeRate < 0.99 && <span className="note-chip">Slow motion ×{pb.timeRate.toFixed(1)}</span>}
        {!pb.note && pb.timeRate >= 0.99 && pb.timeRate <= 1.01 && (
          <span className="note-chip note-chip--quiet" title="One second of mission for each second of viewing (at 1× playback)">
            Real time{pb.rate !== 1 ? ` · played at ${pb.rate}×` : ''}
          </span>
        )}
        {pb.held.includes('loading') && <span className="note-chip note-chip--warn">Loading the next view</span>}
      </div>
      <div
        className="scrub"
        ref={bar}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          seekFromEvent(e.clientX);
        }}
        onPointerMove={(e) => {
          const r = bar.current!.getBoundingClientRect();
          const x = e.clientX - r.left;
          const p = (x / r.width) * dur;
          const near = marks.events.reduce((best, m) => (Math.abs(m.p - p) < Math.abs(best.p - p) ? m : best), { p: -1e9, label: '' });
          setHover(Math.abs(near.p - p) / dur < 0.012 ? { x, label: near.label } : null);
          if (e.buttons === 1) seekFromEvent(e.clientX);
        }}
        onPointerLeave={() => setHover(null)}
      >
        <div className="scrub__track" />
        <div className="scrub__fill" style={{ width: pct(pb.p) }} />
        {marks.phases.map((m, i) => (
          <span key={`p${i}`} className="scrub__tick" style={{ left: pct(m.p) }} title={m.label} />
        ))}
        {marks.events.map((m, i) => (
          <span key={`e${i}`} className="scrub__event" style={{ left: pct(m.p) }} />
        ))}
        <input
          className="scrub__input"
          type="range"
          min={0}
          max={dur}
          step={0.1}
          value={pb.p}
          onChange={(e) => seekPres(Number(e.target.value))}
          aria-label="Mission position"
          aria-valuetext={`${formatMissionTime(pb.t)}${pb.phase ? `, ${pb.phase.title}` : ''}`}
        />
        {hover && (
          <span className="scrub__tip" style={{ left: hover.x }}>
            {hover.label}
          </span>
        )}
      </div>
      <label className="speed">
        <span className="sr-only">Playback speed (on top of any time compression shown)</span>
        <select value={pb.rate} onChange={(e) => playback.player?.setRate(Number(e.target.value))}>
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
      </label>
      {onChapters && (
        <button className="icon-btn icon-btn--flat" onClick={onChapters} aria-label="Chapters">
          <Icon.chapters size={18} />
        </button>
      )}
    </div>
  );
}
