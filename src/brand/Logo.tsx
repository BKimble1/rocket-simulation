/** KIMBLE identity components for the interface (same paths as the SVG files and the decals). */
import { MARK, WORD_KIMBLE, WORD_FABONE } from './logoPaths';

export function KimbleMark({ size = 28, accent = true, className }: { size?: number; accent?: boolean; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <path d={MARK.body} fill="currentColor" />
      <path d={MARK.arm} fill={accent ? 'var(--accent)' : 'currentColor'} />
    </svg>
  );
}

/** Symbol + KIMBLE wordmark as one lockup (height in px). */
export function KimbleLogo({ height = 26, accent = true, title = 'KIMBLE' }: { height?: number; accent?: boolean; title?: string }) {
  const cap = 50;
  const s = cap * WORD_KIMBLE.scale;
  const w = 124 + WORD_KIMBLE.width * cap + 2;
  return (
    <svg height={height} viewBox={`0 0 ${w.toFixed(1)} 100`} role="img" aria-label={title} className="kimble-logo">
      <path d={MARK.body} fill="currentColor" />
      <path d={MARK.arm} fill={accent ? 'var(--accent)' : 'currentColor'} />
      <path transform={`translate(124 75) scale(${s})`} d={WORD_KIMBLE.d} fill="currentColor" />
    </svg>
  );
}

/** The FAB / ONE wordmark: the simulation hub this rocket belongs to. */
export function FabOne({ height = 11 }: { height?: number }) {
  const cap = 40;
  const s = cap * WORD_FABONE.scale;
  const w = WORD_FABONE.width * cap;
  return (
    <svg height={height} viewBox={`0 0 ${w.toFixed(1)} 44`} role="img" aria-label="FAB / ONE" className="onefab">
      <path transform={`translate(0 42) scale(${s})`} d={WORD_FABONE.d} fill="currentColor" />
    </svg>
  );
}
