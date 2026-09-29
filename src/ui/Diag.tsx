/** Developer overlay (?diag=1): tier, frame times, draw calls, renderer. */
import { useEffect, useState } from 'react';
import { perf, useQuality } from '../scene/quality';
import { stageRefs } from '../scene/Stage';
import { frame } from '../scene/frame';

export function Diag() {
  const q = useQuality();
  const [s, setS] = useState('');
  useEffect(() => {
    const h = window.setInterval(() => {
      const r = [...perf.recent].slice(-240).sort((a, b) => a - b);
      const med = r[r.length >> 1] ?? 0;
      const p95 = r[Math.floor(r.length * 0.95)] ?? 0;
      const info = stageRefs.gl?.info;
      setS(`${frame.location} · render ${med.toFixed(1)} ms (p95 ${p95.toFixed(1)}) · calls ${info?.render.calls ?? 0} · tris ${((info?.render.triangles ?? 0) / 1000).toFixed(0)}k · geo ${info?.memory.geometries ?? 0} · tex ${info?.memory.textures ?? 0}`);
    }, 500);
    return () => window.clearInterval(h);
  }, []);
  return (
    <div className="diag">
      <div>
        {q.tier} · {q.reason}
      </div>
      <div>{s}</div>
      <div className="small">{q.renderer}</div>
    </div>
  );
}
