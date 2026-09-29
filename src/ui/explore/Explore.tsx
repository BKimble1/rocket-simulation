/** Explore mode: the hangar, the toolbar, the part finder, the lesson and materials panels. */
import { useEffect, useState } from 'react';
import { useApp } from '../../state/store';
import { ExploreToolbar } from './Toolbar';
import { PartFinder } from './PartFinder';
import { LessonPanel } from './LessonPanel';
import { MaterialPanel } from './MaterialPanel';
import { DemoBar } from './DemoBar';
import { Hotspots } from './Hotspots';
import { ContextIndicator } from './ContextIndicator';
import { returnToMission } from '../nav';
import { OUTLINES } from '../../timeline/missions/outline';
import { formatMissionTime } from '../format';
import { presToMission } from '../../timeline/sample';
import { playback } from '../../state/playback';
import { startDemo } from '../../scene/demos';
import { Icon } from '../icons';

export function Explore() {
  const part = useApp((s) => s.part);
  const lens = useApp((s) => s.lens);
  const cfg = useApp((s) => s.hangarConfig);
  const inspect = useApp((s) => s.inspect);
  const set = useApp((s) => s.set);
  const [finder, setFinder] = useState(false);
  useEffect(() => () => startDemo(null), []);
  const pausedAt = inspect && playback.player ? presToMission(playback.player.tl.pres, inspect.from.p) : null;
  const phase = inspect && playback.player && pausedAt !== null ? playback.player.tl.phases.filter((p) => pausedAt >= p.start).pop() : null;
  return (
    <>
      <Hotspots />
      {inspect && (
        <div className="inspect-chip panel" role="status">
          <span>
            Mission paused at <b>{formatMissionTime(pausedAt ?? 0)}</b>
            {phase ? ` · ${phase.title}` : ''} · {OUTLINES[inspect.from.mission].short}
          </span>
          <button className="btn btn--primary btn--sm" onClick={returnToMission}>
            <Icon.back size={14} /> Return to mission
          </button>
        </div>
      )}
      {finder && (
        <div className="left-dock">
          <PartFinder onClose={() => setFinder(false)} />
        </div>
      )}
      {lens === 'materials' ? <MaterialPanel onClose={() => set({ lens: 'systems', material: null })} /> : part && <LessonPanel id={part} onClose={() => set({ part: null })} />}
      {part && lens !== 'materials' && <ContextIndicator part={part} capsule={cfg === 'capsule'} />}
      <div className="bottom-dock">
        <DemoBar />
        <ExploreToolbar onParts={() => setFinder((f) => !f)} />
      </div>
    </>
  );
}
