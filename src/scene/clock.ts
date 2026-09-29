/**
 * Stage clock: wall-clock seconds that stop while the page is hidden (so demonstrations and
 * camera moves resume where they were). With ?virt=1 every rendered frame advances exactly
 * 1/30 s (recording harness).
 */
import { FLAGS } from '../config';

let hiddenAt: number | null = null;
let hiddenTotal = 0;
let virtualT = 0;

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    const t = performance.now();
    if (document.hidden) hiddenAt = t;
    else if (hiddenAt !== null) {
      hiddenTotal += t - hiddenAt;
      hiddenAt = null;
    }
  });
}

export const stageClock = {
  seconds(): number {
    if (FLAGS.virtual) return virtualT;
    return ((hiddenAt ?? performance.now()) - hiddenTotal) / 1000;
  },
  /** Virtual time only: advance by one frame. */
  step(dt = 1 / 30) {
    virtualT += dt;
  },
};
