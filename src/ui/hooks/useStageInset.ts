/**
 * Panels hide part of the 3D picture: a sheet spanning the width at the bottom (the phone home
 * card, phone lesson and phase sheets) or a tall panel at one side (desktop and phone-landscape
 * layouts). This hook registers the area a panel covers so the stage centres the subject in the
 * free part of the screen (see setViewInset). Small or floating panels register nothing.
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
      if (r.width === 0 || r.height === 0) return setViewInset(key, null);
      if (r.width > W * 0.7 && r.bottom > H * 0.75 && r.top > H * 0.15) {
        const header = document.querySelector('.header')?.getBoundingClientRect().bottom ?? 0;
        return setViewInset(key, { top: Math.max(0, header), bottom: Math.max(0, H - r.top) });
      }
      if (r.height > H * 0.45 && r.width < W * 0.6) {
        if (r.left < W * 0.1) return setViewInset(key, { left: r.right });
        if (r.right > W * 0.9) return setViewInset(key, { right: W - r.left });
      }
      setViewInset(key, null);
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
