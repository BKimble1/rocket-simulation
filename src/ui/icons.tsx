/** Minimal line icons (stroke = currentColor). */
import type { ReactNode } from 'react';

const I = ({ children, size = 18, title }: { children: ReactNode; size?: number; title?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
    {title && <title>{title}</title>}
    {children}
  </svg>
);

export const Icon = {
  play: (p: { size?: number }) => (
    <I {...p}>
      <path d="M7 5l12 7-12 7z" fill="currentColor" stroke="none" />
    </I>
  ),
  pause: (p: { size?: number }) => (
    <I {...p}>
      <path d="M8 5v14M16 5v14" strokeWidth={2.6} />
    </I>
  ),
  replay: (p: { size?: number }) => (
    <I {...p}>
      <path d="M4 12a8 8 0 1 0 2.4-5.7" />
      <path d="M4 4v4h4" />
    </I>
  ),
  close: (p: { size?: number }) => (
    <I {...p}>
      <path d="M6 6l12 12M18 6L6 18" />
    </I>
  ),
  search: (p: { size?: number }) => (
    <I {...p}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </I>
  ),
  list: (p: { size?: number }) => (
    <I {...p}>
      <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
    </I>
  ),
  book: (p: { size?: number }) => (
    <I {...p}>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
      <path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" />
    </I>
  ),
  gear: (p: { size?: number }) => (
    <I {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </I>
  ),
  cc: (p: { size?: number }) => (
    <I {...p}>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M10.5 10.2a2.3 2.3 0 1 0 0 3.6M17 10.2a2.3 2.3 0 1 0 0 3.6" />
    </I>
  ),
  sound: (p: { size?: number }) => (
    <I {...p}>
      <path d="M4 9h4l5-4v14l-5-4H4z" />
      <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
    </I>
  ),
  mute: (p: { size?: number }) => (
    <I {...p}>
      <path d="M4 9h4l5-4v14l-5-4H4z" />
      <path d="M17 9l5 6M22 9l-5 6" />
    </I>
  ),
  chapters: (p: { size?: number }) => (
    <I {...p}>
      <path d="M4 6h16M4 12h10M4 18h13" />
    </I>
  ),
  target: (p: { size?: number }) => (
    <I {...p}>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </I>
  ),
  back: (p: { size?: number }) => (
    <I {...p}>
      <path d="M10 6l-6 6 6 6M4 12h16" />
    </I>
  ),
  arrow: (p: { size?: number }) => (
    <I {...p}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </I>
  ),
  check: (p: { size?: number }) => (
    <I {...p}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </I>
  ),
  dot: (p: { size?: number }) => (
    <I {...p}>
      <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
    </I>
  ),
  layers: (p: { size?: number }) => (
    <I {...p}>
      <path d="M12 3l9 5-9 5-9-5z" />
      <path d="M3 13l9 5 9-5" />
    </I>
  ),
  question: (p: { size?: number }) => (
    <I {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01" />
    </I>
  ),
};
