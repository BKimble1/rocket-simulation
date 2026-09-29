import { it } from 'vitest';
import { buildMission } from '../../timeline/build';
import { chan, bodyStateAt, makeBodyState } from '../../timeline/sample';
import { R_EARTH } from '../../world/frames';
it('probe', () => {
  for (const id of ['leo'] as const) {
    const tl = buildMission(id);
    console.log(id, tl.events.map((e) => `${e.id}@${e.t.toFixed(1)}`).join(' '));
    console.log(Object.keys(tl.channels).join(' '));
    const s = makeBodyState();
    for (const t of [-5, -2, 0, 3, 10, 20, 40, 60, 90, 120, 150, 160, 200, 400, 500]) {
      const b = bodyStateAt(tl, 'booster', t, s);
      const alt = b ? (b.pos.length() - R_EARTH).toFixed(0) : '-';
      console.log(t, 'alt', alt, 'c', chan(tl, 's1.center.throttle', t).toFixed(2), 'o', chan(tl, 's1.outer.throttle', t).toFixed(2), 's2', chan(tl, 's2.throttle', t).toFixed(2), 'rcs', chan(tl, 's1.rcs', t).toFixed(2), chan(tl, 's2.rcs', t).toFixed(2), 'glow', chan(tl, 's1.entryGlow', t).toFixed(2), 'vent', chan(tl, 'pad.venting', t).toFixed(2), 'del', chan(tl, 'pad.deluge', t).toFixed(2));
    }
  }
});
