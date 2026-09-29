/**
 * Publishes the height of the bottom dock (toolbar, playback bar, demonstration bar) as the CSS
 * variable --dock-h, so bottom sheets on phones always sit just above it, whatever it contains.
 */
import { useEffect, type RefObject } from 'react';

/** `dep` re-attaches when the dock is rendered conditionally. */
export function useDockHeight(ref: RefObject<HTMLElement | null>, dep: unknown = null) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const update = () => root.style.setProperty('--dock-h', `${Math.ceil(el.getBoundingClientRect().height)}px`);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty('--dock-h');
    };
  }, [ref, dep]);
}
