/**
 * Developer overlay (?diag=1): tier and why, real frame intervals (what the viewer sees) with
 * missed 60 Hz frames and stalls, CPU time spent issuing the frame and, where the browser supports
 * timer queries, GPU time (both labelled separately), draw calls, triangles, renderer.
 */
import { useEffect, useState } from 'react';
import { perf, useQuality } from '../scene/quality';
import { stageRefs, warm } from '../scene/Stage';
import { frame } from '../scene/frame';

const stat = (a: number[]) => {
  const r = [...a].slice(-240).sort((x, y) => x - y);
  return { med: r[r.length >> 1] ?? 0, p95: r[Math.floor(r.length * 0.95)] ?? 0, n: r.length };
};

export function Diag() {
  const q = useQuality();
  const [s, setS] = useState<string[]>([]);
  useEffect(() => {
    const h = window.setInterval(() => {
      const iv = stat(perf.recent);
      const cpu = stat(perf.recentCpu);
      const gpu = stat(perf.recentGpu);
      const info = stageRefs.gl?.info;
      setS([
        `${frame.location} · frame interval ${iv.med.toFixed(1)} ms (p95 ${iv.p95.toFixed(1)}) · missed ${perf.missedTotal} · stalls ${perf.stalls}${perf.last ? ` · last window: ${perf.last.verdict}` : ''}`,
        `CPU render ${cpu.med.toFixed(1)} ms${gpu.n ? ` · GPU ${gpu.med.toFixed(1)} ms (timer query)` : ' · GPU time: not available'} · shaders warmed in ${warm.ms.toFixed(0)} ms`,
        `calls ${info?.render.calls ?? 0} · tris ${((info?.render.triangles ?? 0) / 1000).toFixed(0)}k · geo ${info?.memory.geometries ?? 0} · tex ${info?.memory.textures ?? 0} · programs ${info?.programs?.length ?? 0}`,
      ]);
    }, 500);
    return () => window.clearInterval(h);
  }, []);
  return (
    <div className="diag">
      <div>
        {q.tier} · {q.reason}
      </div>
      {s.map((l, i) => (
        <div key={i}>{l}</div>
      ))}
      <div className="small">{q.renderer}</div>
    </div>
  );
}
