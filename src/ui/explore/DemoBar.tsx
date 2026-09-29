/** Controls for a running subsystem demonstration, with its honesty label. */
import { useEffect, useState } from 'react';
import { DEMOS, demoClock, demoProgress, startDemo } from '../../scene/demos';
import { useProgress, exploredKey } from '../../state/progress';
import { Icon } from '../icons';

export function DemoBar() {
  const [, tick] = useState(0);
  const mark = useProgress((s) => s.markExplored);
  useEffect(() => {
    const h = window.setInterval(() => tick((n) => n + 1), 120);
    return () => window.clearInterval(h);
  }, []);
  const id = demoClock.id;
  useEffect(() => {
    if (id) mark(exploredKey.demo(id));
  }, [id, mark]);
  if (!id) return null;
  const d = DEMOS[id];
  const p = demoProgress();
  return (
    <div className="demobar panel" role="region" aria-label="Demonstration">
      <button className="icon-btn" onClick={() => (demoClock.playing ? (demoClock.playing = false) : ((demoClock.playing = true), p >= 1 && (demoClock.t = 0)))} aria-label={demoClock.playing ? 'Pause demonstration' : 'Play demonstration'}>
        {demoClock.playing ? <Icon.pause size={16} /> : <Icon.play size={16} />}
      </button>
      <div className="demobar__text">
        <div className="demobar__title">{d.title}</div>
        <div className="demobar__label">{d.label}</div>
        <div className="progress" aria-hidden>
          <span style={{ width: `${(p * 100).toFixed(1)}%` }} />
        </div>
      </div>
      <button className="icon-btn icon-btn--flat" onClick={() => startDemo(id)} aria-label="Restart demonstration">
        <Icon.replay size={16} />
      </button>
      <button className="icon-btn icon-btn--flat" onClick={() => startDemo(null)} aria-label="Stop demonstration">
        <Icon.close size={16} />
      </button>
    </div>
  );
}
