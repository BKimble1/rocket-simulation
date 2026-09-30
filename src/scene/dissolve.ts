/**
 * Picture dissolves: the displayed picture is captured and faded out over the new one. Used for
 * location changes (hangar, flight, map), for intentional cuts between flight framings that no
 * camera move could plausibly connect (two ground cameras, a ground camera and a chase camera,
 * the onboard camera), and for chapter jumps.
 *
 * Order within a frame (the stage calls afterDraw once the frame is fully drawn):
 *   1. the scene is rendered from the current (old) view;
 *   2. a running dissolve's snapshot is drawn over it (so what is on screen is the composite);
 *   3. afterDraw: if a change was requested, the composite that is on screen is captured (so an
 *      interrupted dissolve continues from what the viewer actually sees, never from a stale or
 *      black snapshot), then the change is applied; the next frame shows the new view with the
 *      snapshot fading out.
 * Several requests in one frame share one capture; they are applied in order.
 */
import { smoothstep } from '../director/pose';

interface Pending {
  reason: string;
  dur: number;
  apply: () => void;
}

export const dissolve = {
  pending: [] as Pending[],
  /** The running fade (UI clock seconds), or null. */
  active: null as null | { start: number; dur: number; reason: string },
  /** Captures made (diagnostics and tests). */
  captures: 0,
  /** Keep the snapshot fully opaque (an omitted interval is being skipped); fades when released. */
  hold: false,
};

/** Hold the captured picture (see frame.omitted); release starts its fade. */
export function setHold(on: boolean, now: number) {
  if (dissolve.hold === on) return;
  dissolve.hold = on;
  if (!on && dissolve.active) dissolve.active.start = now;
}

/**
 * Ask for the displayed picture to be captured at the end of this frame and dissolved from after
 * `apply` has changed what is shown. `dur` 0 is a plain cut.
 */
export function requestDissolve(reason: string, dur: number, apply: () => void) {
  dissolve.pending.push({ reason, dur, apply });
}

export function hasPendingDissolve(reason?: string): boolean {
  return reason ? dissolve.pending.some((p) => p.reason === reason) : dissolve.pending.length > 0;
}

/** Forget requested changes that have not been applied (a seek supersedes a pending cut). */
export function cancelPending(reason: string) {
  dissolve.pending = dissolve.pending.filter((p) => p.reason !== reason);
}

/**
 * Called by the stage after the frame is completely drawn (scene and any running dissolve).
 * `capture` copies the displayed picture into the snapshot and returns false when it cannot
 * (no renderer, as in the camera trace), in which case the change is applied as a cut.
 */
export function afterDraw(capture: () => boolean, now: number) {
  if (!dissolve.pending.length) return;
  const list = dissolve.pending;
  dissolve.pending = [];
  const dur = Math.max(...list.map((p) => p.dur));
  const ok = dur > 0 ? capture() : false;
  if (ok) dissolve.captures++;
  for (const p of list) p.apply();
  dissolve.active = ok ? { start: now, dur, reason: list[list.length - 1].reason } : null;
}

/** Opacity of the snapshot over the live picture now (0 when no dissolve runs). */
export function snapshotAlpha(now: number): number {
  const a = dissolve.active;
  if (!a) return 0;
  if (dissolve.hold) return 1;
  const u = (now - a.start) / a.dur;
  if (u >= 1 || !(a.dur > 0)) {
    dissolve.active = null;
    return 0;
  }
  return 1 - smoothstep(u);
}
