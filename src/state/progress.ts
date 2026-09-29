/**
 * Learning progress, stored locally: what the learner has EXPLORED (opened a part lesson, a
 * material, a demo, a mission phase) and, separately, what they have CHECKED (answered a
 * knowledge check correctly). Viewing alone never counts as understanding. Resettable.
 */
import { create } from 'zustand';

interface ProgressState {
  explored: Record<string, number>;
  checked: Record<string, { ok: boolean; at: number }>;
  markExplored: (key: string) => void;
  markChecked: (id: string, ok: boolean) => void;
  reset: () => void;
}

const KEY = 'kimble.progress.v1';

function load(): Pick<ProgressState, 'explored' | 'checked'> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return { explored: p.explored ?? {}, checked: p.checked ?? {} };
    }
  } catch {
    /* storage unavailable */
  }
  return { explored: {}, checked: {} };
}

export const useProgress = create<ProgressState>((set) => ({
  ...load(),
  markExplored: (key) =>
    set((s) => {
      if (s.explored[key]) return s;
      return { explored: { ...s.explored, [key]: Date.now() } };
    }),
  markChecked: (id, ok) => set((s) => ({ checked: { ...s.checked, [id]: { ok, at: Date.now() } } })),
  reset: () => set({ explored: {}, checked: {} }),
}));

useProgress.subscribe((s) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ explored: s.explored, checked: s.checked }));
  } catch {
    /* storage unavailable: progress lasts for this visit */
  }
});

export const exploredKey = {
  part: (id: string) => `part:${id}`,
  material: (id: string) => `material:${id}`,
  demo: (id: string) => `demo:${id}`,
  phase: (mission: string, phase: string) => `phase:${mission}:${phase}`,
  why: (id: string) => `why:${id}`,
};
