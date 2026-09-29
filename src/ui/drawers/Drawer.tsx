import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { Icon } from '../icons';

export function Drawer({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
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
