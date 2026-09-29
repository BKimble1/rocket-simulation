import { it } from 'vitest';
import { buildMission } from '../../timeline/build';
it('probe', () => {
  for (const id of ['leo', 'station', 'suborbital'] as const) {
    const tl = buildMission(id);
    for (const c of ['s1.rcs', 's2.rcs', 'cap.rcs', 'sm.rcs', 'sat.rcs'] as const) {
      const ch = tl.channels[c];
      if (!ch) continue;
      const on: string[] = [];
      for (let i = 0; i < ch.t.length && on.length < 8; i++) if (ch.v[i] > 0.05) on.push(`${ch.t[i].toFixed(1)}:${ch.v[i].toFixed(2)}`);
      console.log(id, c, 'first', ch.t[0].toFixed(1), ch.v[0].toFixed(2), 'n', ch.t.length, 'on', on.join(' '));
    }
    console.log(id, tl.events.map((e) => `${e.id}@${e.t.toFixed(1)}`).join(' '));
  }
});
