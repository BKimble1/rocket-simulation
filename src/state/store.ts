/**
 * Application state (what the interface shows). Moving things never live here: transforms and
 * mission time are read from frame.ts inside the render loop, and the UI polls playback at a
 * bounded rate (usePlayback).
 */
import { create } from 'zustand';
import type { PartId, Variant } from '../vehicle/parts';
import type { MissionId } from '../timeline/types';

export type View = 'home' | 'explore' | 'missions' | 'mission' | 'watch';
export type ExploreView = 'intact' | 'cutaway' | 'exploded';
export type Lens = 'systems' | 'materials';
export type Depth = 'quick' | 'engineering' | 'materials';
export type CamMode = 'auto' | 'ground' | 'chase' | 'onboard' | 'free' | 'map';
export type QualitySetting = 'auto' | 'high' | 'medium' | 'low';
export type SoundMode = 'off' | 'realistic' | 'cinematic';
export type Drawer = null | 'learn' | 'glossary' | 'settings' | 'credits' | 'chapters' | 'parts' | 'materials' | 'checks' | 'why';
export type HangarConfig = 'satellite' | 'capsule';

export interface Overlays {
  flow: boolean;
  forces: boolean;
  mass: boolean;
  thermal: boolean;
}

export interface InspectState {
  part: PartId;
  /** Where "Return to mission" goes back to. */
  from: { view: 'mission' | 'watch'; mission: MissionId; p: number; cam: CamMode; wasPlaying: boolean };
}

export interface AppState {
  view: View;
  // Explore (hangar)
  hangarConfig: HangarConfig;
  exploreView: ExploreView;
  part: PartId | null;
  hoverPart: PartId | null;
  lens: Lens;
  material: string | null;
  demo: string | null;
  overlays: Overlays;
  depth: Depth;
  // Missions
  mission: MissionId;
  /** Focus in a mission with a parallel storyline: main vehicle or the recovering booster. */
  focus: 'main' | 'booster';
  cam: CamMode;
  inspect: InspectState | null;
  // Settings
  quality: QualitySetting;
  reducedMotion: boolean;
  captions: boolean;
  narration: boolean;
  sound: SoundMode;
  telemetry: boolean;
  drawer: Drawer;
  /** A message shown briefly (seek, loading, mode change). */
  toast: string | null;

  set: (p: Partial<AppState>) => void;
  go: (view: View, extra?: Partial<AppState>) => void;
  selectPart: (id: PartId | null) => void;
  toggleOverlay: (k: keyof Overlays) => void;
}

const systemReduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function loadSettings(): Partial<AppState> {
  try {
    const raw = localStorage.getItem('kimble.settings');
    if (!raw) return {};
    const s = JSON.parse(raw);
    return {
      quality: s.quality,
      reducedMotion: s.reducedMotion,
      captions: s.captions,
      narration: s.narration,
      sound: s.sound,
      telemetry: s.telemetry,
      depth: s.depth,
    };
  } catch {
    return {};
  }
}

const saved = loadSettings();

export const useApp = create<AppState>((set) => ({
  view: 'home',
  hangarConfig: 'satellite',
  exploreView: 'intact',
  part: null,
  hoverPart: null,
  lens: 'systems',
  material: null,
  demo: null,
  overlays: { flow: false, forces: false, mass: false, thermal: false },
  depth: saved.depth ?? 'quick',
  mission: 'leo',
  focus: 'main',
  cam: 'auto',
  inspect: null,
  quality: saved.quality ?? 'auto',
  reducedMotion: saved.reducedMotion ?? !!systemReduced,
  captions: saved.captions ?? true,
  narration: saved.narration ?? true,
  sound: saved.sound ?? 'realistic',
  telemetry: saved.telemetry ?? true,
  drawer: null,
  toast: null,
  set: (p) => set(p),
  go: (view, extra) => set({ view, drawer: null, ...extra }),
  selectPart: (id) => set({ part: id }),
  toggleOverlay: (k) => set((s) => ({ overlays: { ...s.overlays, [k]: !s.overlays[k] } })),
}));

// persist settings
useApp.subscribe((s, prev) => {
  if (s.quality === prev.quality && s.reducedMotion === prev.reducedMotion && s.captions === prev.captions && s.narration === prev.narration && s.sound === prev.sound && s.telemetry === prev.telemetry && s.depth === prev.depth) return;
  try {
    localStorage.setItem(
      'kimble.settings',
      JSON.stringify({ quality: s.quality, reducedMotion: s.reducedMotion, captions: s.captions, narration: s.narration, sound: s.sound, telemetry: s.telemetry, depth: s.depth }),
    );
  } catch {
    /* storage unavailable: settings last for this visit */
  }
});

export type { Variant };
