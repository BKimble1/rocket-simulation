/**
 * The clocks, and how they relate. Everything that moves on screen is driven from ONE frame step,
 * so the picture, the camera, the effects, the telemetry and the captions always agree:
 *
 *   frame step   s = min(real interval since the last frame, MAX_STEP)
 *                (?virt=1: exactly 1/30 s per rendered frame, for frame-by-frame capture)
 *   UI clock     frame.clock += s
 *                camera transitions, picture dissolves, panel easing, hangar camera moves,
 *                subsystem demonstrations and decorative motion (frame.decor = frame.clock)
 *   presentation p += s × playback rate, while playing and not held (Mission player, film player)
 *   mission time t = presToMission(p): the bodies, effects, telemetry, phase and captions are all
 *                pure functions of t
 *
 * Consequences, each covered by a test (scene/clock.test.ts, director/director.test.ts):
 *   - slow frames: every clock advances by the same capped step, so a camera move can never race
 *     ahead of the vehicle it follows; below 1 / MAX_STEP frames per second the whole presentation
 *     slows down together instead of jumping;
 *   - a long stall (a hidden tab, a hitch) costs at most one step: nothing leaps forward on return;
 *   - pause stops presentation and mission time only; camera moves and dissolves still finish;
 *   - playback rate scales presentation time only, never camera moves or dissolves;
 *   - seeking sets presentation time directly (the camera shows the new moment at once).
 * Narration in Watch mode follows the film clock (watch/player.ts): drift is corrected by nudging
 * the audio rate, and when frames are too slow for real time the audio waits for the picture
 * instead of being restarted.
 */
import { FLAGS } from '../config';

/** Largest step one frame may advance the clocks (s): 4 frames per second still play in real time. */
export const MAX_STEP = 0.25;

/** Fixed step of the frame-by-frame capture clock (?virt=1). */
export const VIRTUAL_STEP = 1 / 30;

/** The frame step for a measured real interval (s). */
export function frameStep(realDelta: number): number {
  if (FLAGS.virtual) return VIRTUAL_STEP;
  if (!(realDelta > 0)) return 0;
  return Math.min(MAX_STEP, realDelta);
}
