import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { D, F } from './derived';
import { LESSONS } from './index';
import { PHASE_CARDS } from '../phaseCards';
const OUT = '/tmp/claude-0/-home-user/27a32fdd-e1b7-5170-a6d8-816a0def8caa/scratchpad/content-parts/';
it('dump', () => {
  writeFileSync(OUT + 'D.json', JSON.stringify(D, null, 1));
  writeFileSync(OUT + 'F.json', JSON.stringify(F, null, 1));
  writeFileSync(OUT + 'lessons.json', JSON.stringify(LESSONS, null, 1));
  writeFileSync(OUT + 'cards.json', JSON.stringify(PHASE_CARDS, null, 1));
});
