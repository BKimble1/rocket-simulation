/**
 * Deployment configuration. Everything is relative to Vite's BASE_URL so the same build
 * works at `/` and under `/rocket/` (the future Idlery hub). The hub link is configurable at
 * build time (VITE_HUB_URL, VITE_HUB_LABEL) and hidden when unset.
 */
export const BASE = import.meta.env.BASE_URL;

/** URL of a static asset in /public, honouring the base path. */
export function asset(path: string): string {
  return BASE + path.replace(/^\//, '');
}

export const HUB = {
  url: (import.meta.env.VITE_HUB_URL as string | undefined) ?? '',
  label: (import.meta.env.VITE_HUB_LABEL as string | undefined) ?? 'Back to FAB / ONE',
};

const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
/** Test and capture flags. */
export const FLAGS = {
  /** Keep the drawing buffer so screenshots can read the canvas. */
  capture: params.get('capture') === '1',
  /** Virtual time: every frame advances by exactly 1/30 s (recording harness only). */
  virtual: params.get('virt') === '1',
  /** Developer overlay: tier, frame times, draw calls. */
  diag: params.get('diag') === '1',
  /** Test hooks on window (dev, virtual time, or ?hooks=1). */
  hooks: import.meta.env.DEV || params.get('virt') === '1' || params.get('hooks') === '1',
  /** Simulate a failing asset host (tests the retry UI). */
  failAssets: params.get('failassets') === '1',
  /** Force no-WebGL fallback (tests the fallback). */
  noWebGL: params.get('nowebgl') === '1',
};
