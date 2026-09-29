import { test } from 'vitest';
import { buildMission } from '../../timeline/build';
import { chan } from '../../timeline/sample';
test('dbg', () => {
  const tl = buildMission('leo');
  for (const t of [-5, 0, 3, 8, 10, 20]) {
    const ids = ['s1.rcs', 's2.rcs', 'pad.venting', 'pad.deluge', 's1.center.throttle', 's1.outer.throttle'] as const;
    console.log(t, ids.map((i) => `${i}=${chan(tl, i, t).toFixed(2)}`).join(' '));
  }
  console.log(tl.events.slice(0, 12).map((e) => `${e.id}@${e.t}`).join(' '));
});
