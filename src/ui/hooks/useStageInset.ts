/**
 * A panel that spans the width of the screen at the bottom (the phone home card, phone bottom
 * sheets) hides the middle of the 3D picture. This hook registers the area it covers so the
 * stage centres and fits the subject in the free part above it. Panels that sit at the side
 * (desktop layouts) register nothing.
 */
import { useEffect, type RefObject } from 'react';
import { setViewInset } from '../../director/director';

export function useStageInset(key: string, ref: RefObject<HTMLElement | null>, enabled = true) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      const W = window.innerWidth;
      const H = window.innerHeight;
      const spans = r.width > W * 0.7 && r.bottom > H * 0.75 && r.top > H * 0.15;
      if (!spans) return setViewInset(key, null);
      const header = document.querySelector('.header')?.getBoundingClientRect().bottom ?? 0;
      setViewInset(key, { top: Math.max(0, header), bottom: Math.max(0, H - r.top) });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
      setViewInset(key, null);
    };
  }, [key, ref, enabled]);
}
