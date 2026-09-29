/** Formatting for times and quantities (units always shown). */
export function formatMissionTime(t: number): string {
  const sign = t < 0 ? 'T-' : 'T+';
  const a = Math.abs(t);
  const d = Math.floor(a / 86400);
  const h = Math.floor((a % 86400) / 3600);
  const m = Math.floor((a % 3600) / 60);
  const s = Math.floor(a % 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  if (d > 0) return `${sign}${d} d ${pad(h)}:${pad(m)}:${pad(s)}`;
  if (h > 0) return `${sign}${h}:${pad(m)}:${pad(s)}`;
  return `${sign}${pad(m)}:${pad(s)}`;
}

export function formatDuration(s: number): string {
  const m = Math.round(s / 60);
  return m < 1 ? `${Math.round(s)} s` : `${m} min`;
}

export function km(m: number, digits = 1): string {
  return `${(m / 1000).toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits })} km`;
}

export function speed(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)} km/s` : `${Math.round(ms)} m/s`;
}
