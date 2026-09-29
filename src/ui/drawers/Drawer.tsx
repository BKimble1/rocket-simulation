import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { Icon } from '../icons';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/**
 * Modal side drawer: takes focus when it opens, keeps Tab inside it, closes on Escape or a click
 * outside, and gives focus back to whatever opened it.
 */
export function Drawer({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    return () => {
      if (opener && document.contains(opener)) opener.focus();
    };
  }, []);
  // one drawer can lead to another (learning path to glossary): focus follows
  useEffect(() => {
    ref.current?.focus();
  }, [title]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose();
      if (e.key !== 'Tab' || !ref.current) return;
      const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === ref.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      } else if (!ref.current.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="drawer-wrap" onClick={onClose}>
      <div className={`drawer panel${wide ? ' drawer--wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()}>
        <header className="drawer__head">
          <h2>{title}</h2>
          <button className="icon-btn icon-btn--flat" onClick={onClose} aria-label="Close">
            <Icon.close size={16} />
          </button>
        </header>
        <div className="drawer__body">{children}</div>
      </div>
    </div>
  );
}
