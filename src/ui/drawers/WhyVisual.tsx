/**
 * Small animated diagrams for the "why this design?" explainers (SVG, clearly schematic):
 * each explainer id has a drawing whose state follows the current beat.
 */
import { useEffect, useState } from 'react';

function useTicker(on = true) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!on) return;
    let raf = 0;
    const t0 = performance.now();
    const loop = () => {
      setT((performance.now() - t0) / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [on]);
  return t;
}

const INK = 'var(--ink-2)';
const ACC = 'var(--accent)';
const LOX = '#8fc6ff';
const RP1 = '#e0a24a';
const HOT = '#ff7a3d';

export function WhyVisual({ id, beat }: { id: string; beat: number; visual: string }) {
  const t = useTicker();
  const k = id.toLowerCase();
  let body: React.ReactNode = null;
  if (k.includes('stag')) {
    // one big stage vs two stages: dry mass carried to the end
    const drop = beat >= 2;
    body = (
      <>
        <text x="20" y="18" className="wv-t">One stage</text>
        <rect x="30" y="30" width="40" height="120" rx="6" fill="none" stroke={INK} />
        <rect x="32" y={32 + Math.min(1, (t % 6) / 5) * 90} width="36" height={116 - Math.min(1, (t % 6) / 5) * 90} fill={RP1} opacity="0.5" />
        <text x="12" y="170" className="wv-s">all the empty tank rides to orbit</text>
        <text x="170" y="18" className="wv-t">Two stages</text>
        <g transform={`translate(0 ${drop ? Math.min(40, ((t % 6) / 6) * 60) : 0})`} opacity={drop ? 1 - Math.min(1, (t % 6) / 6) : 1}>
          <rect x="180" y="80" width="40" height="70" rx="6" fill="none" stroke={INK} />
          <rect x="182" y="82" width="36" height="66" fill={RP1} opacity={beat >= 1 ? 0.2 : 0.5} />
        </g>
        <rect x="186" y="30" width="28" height="48" rx="5" fill="none" stroke={ACC} />
        <rect x="188" y="32" width="24" height="44" fill={LOX} opacity="0.5" />
        <text x="160" y="170" className="wv-s">{drop ? 'empty lower stage dropped' : 'lower stage burns first'}</text>
      </>
    );
  } else if (k.includes('tank')) {
    body = (
      <>
        <rect x="100" y="16" width="60" height="70" rx="22" fill={LOX} opacity="0.55" stroke={INK} />
        <text x="172" y="54" className="wv-s">LOX, 90 K</text>
        <rect x="100" y="96" width="60" height="60" rx="22" fill={RP1} opacity="0.55" stroke={INK} />
        <text x="172" y="130" className="wv-s">RP-1, ~290 K</text>
        {beat >= 1 && <path d="M130 86 V96" stroke={ACC} strokeWidth="3" />}
        {beat >= 2 && <text x="10" y="176" className="wv-s">Mixed in a tank they would react; kept apart they meet only in the chamber.</text>}
      </>
    );
  } else if (k.includes('pump')) {
    const pc = beat >= 1;
    body = (
      <>
        <rect x="30" y="20" width="60" height="120" rx="20" fill="none" stroke={INK} strokeWidth={pc ? 1.5 : 5} />
        <text x="18" y="160" className="wv-s">{pc ? 'thin, light tank at low pressure' : 'tank at chamber pressure: heavy walls'}</text>
        {pc && (
          <g transform="translate(150 80)">
            <circle r="22" fill="none" stroke={ACC} strokeWidth="2" />
            <g transform={`rotate(${(t * 90) % 360})`}>
              {[0, 60, 120, 180, 240, 300].map((a) => (
                <path key={a} d="M0 0 L18 -6" transform={`rotate(${a})`} stroke={ACC} strokeWidth="2" />
              ))}
            </g>
            <text x="-30" y="42" className="wv-s">pump raises pressure</text>
          </g>
        )}
        <path d="M90 80 H128" stroke={RP1} strokeWidth="3" />
        <path d="M172 80 H230" stroke={RP1} strokeWidth={pc ? 5 : 3} />
        <text x="190" y="70" className="wv-s">to 8.5 MPa chamber</text>
      </>
    );
  } else if (k.includes('nozzle')) {
    const vac = beat >= 1;
    const flare = vac ? 1.6 : 1;
    body = (
      <>
        <path d={`M60 30 L90 30 L96 60 L${90 + 40 * flare} 150 L${70 - 40 * flare + 20} 150 L84 60 Z`} fill="none" stroke={INK} />
        <path d={`M${70 - 40 * flare + 22} 152 Q 90 ${170 + (vac ? 10 : 0)} ${90 + 40 * flare - 2} 152`} fill={HOT} opacity="0.5" />
        <text x="150" y="60" className="wv-s">{vac ? 'large bell: exit pressure near zero in vacuum' : 'sea-level bell: exit pressure near 1 atm'}</text>
        {beat >= 2 && <text x="150" y="80" className="wv-s">a vacuum bell at sea level would separate the flow</text>}
      </>
    );
  } else if (k.includes('cool')) {
    body = (
      <>
        <path d="M40 30 H200 M40 120 H200" stroke={INK} />
        <rect x="40" y="40" width="160" height="70" fill={HOT} opacity={0.35 + 0.1 * Math.sin(t * 6)} />
        <text x="60" y="80" className="wv-s">gas above 3,000 K</text>
        {beat >= 1 && [0, 1, 2, 3, 4, 5, 6, 7].map((i) => <rect key={i} x={50 + i * 19} y="24" width="10" height="6" fill={RP1} />)}
        {beat >= 1 && <text x="40" y="18" className="wv-s">fuel flowing in channels in a copper-alloy wall</text>}
        {beat >= 2 && <text x="40" y="150" className="wv-s">conductive wall passes heat to the fuel; the wall stays below its limit</text>}
      </>
    );
  } else if (k.includes('turn') || k.includes('gravity')) {
    const pts = Array.from({ length: 40 }, (_, i) => {
      const s = i / 39;
      return `${20 + s * 220},${170 - Math.sin(Math.min(1, s * 1.2) * Math.PI / 2) * 150 * (1 - 0.3 * s * s)}`;
    }).join(' ');
    body = (
      <>
        <path d="M10 172 H250" stroke={INK} />
        <polyline points={pts} fill="none" stroke={ACC} strokeWidth="2" />
        <text x="30" y="40" className="wv-s">rise clear of the tower, then tip over gently</text>
        {beat >= 1 && <text x="120" y="100" className="wv-s">gravity bends the path; the nose follows the airflow</text>}
      </>
    );
  } else if (k.includes('orbit') || k.includes('sideways')) {
    const v = [0.4, 0.8, 1.0][Math.min(beat, 2)];
    const pts = Array.from({ length: 80 }, (_, i) => {
      const a = (i / 79) * Math.PI * 2 * (v >= 1 ? 1 : 0.35 + v * 0.3);
      const r = 60 + 25 * (v >= 1 ? 1 : Math.max(0, 1 - a / (v * 3)));
      return `${130 + Math.sin(a) * r},${95 - Math.cos(a) * r}`;
    }).join(' ');
    body = (
      <>
        <circle cx="130" cy="95" r="55" fill="#bcd3ea" stroke={INK} />
        <polyline points={pts} fill="none" stroke={ACC} strokeWidth="2" />
        <text x="10" y="176" className="wv-s">{v < 1 ? 'too little sideways speed: it falls back' : 'about 7.7 km/s sideways: it keeps missing the Earth'}</text>
      </>
    );
  } else body = <text x="20" y="90" className="wv-s">Illustration</text>;
  return (
    <figure className="whyvis">
      <svg viewBox="0 0 260 180" role="img" aria-label="Schematic illustration">
        {body}
      </svg>
      <figcaption className="small muted">Schematic, not to scale</figcaption>
    </figure>
  );
}
