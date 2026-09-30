/**
 * Rendering quality tiers. A tier changes only how the picture is drawn (pixel ratio, shadow
 * map size, particle budgets, cloud and atmosphere sample counts, texture resolution) never
 * what is shown or when: lessons, events and timing do not depend on it.
 *
 * Automatic mode starts from what the device says about itself and steps down (or back up)
 * from measured frame intervals, with hysteresis: a step down needs several slow measuring
 * windows in a row (fewer when badly slow), a step up needs many fast ones and a cool-down since
 * the last change (a longer one to return to a tier it just left), so the picture never
 * oscillates visibly. ?quality=high|medium|low forces a tier.
 */
import { create } from 'zustand';

export type Tier = 'high' | 'medium' | 'low';

export interface TierSpec {
  dprMax: number;
  shadowMap: number;
  /** Plume/smoke particle budget multiplier. */
  particles: number;
  /** Atmosphere ray-march samples (view, light). */
  atmoSamples: [number, number];
  /** Cloud layer detail (octaves of noise). */
  cloudOctaves: number;
  /** Max texture edge for large maps (Earth, Moon). */
  maxTexture: number;
  /** Optional bloom pass on bright exhaust. */
  bloom: boolean;
  /** Geometry detail factor for procedural meshes (radial segments etc.). */
  detail: number;
}

export const TIERS: Record<Tier, TierSpec> = {
  high: { dprMax: 2, shadowMap: 2048, particles: 1, atmoSamples: [16, 6], cloudOctaves: 6, maxTexture: 8192, bloom: true, detail: 1 },
  medium: { dprMax: 1.5, shadowMap: 1024, particles: 0.6, atmoSamples: [12, 4], cloudOctaves: 5, maxTexture: 4096, bloom: false, detail: 0.75 },
  low: { dprMax: 1, shadowMap: 1024, particles: 0.35, atmoSamples: [8, 3], cloudOctaves: 4, maxTexture: 2048, bloom: false, detail: 0.5 },
};

const ORDER: Tier[] = ['low', 'medium', 'high'];

const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
export const FORCED: Tier | null = (() => {
  const q = params.get('quality');
  return q === 'high' || q === 'medium' || q === 'low' ? q : null;
})();

export function initialTier(renderer: string, cores: number, memoryGB: number | undefined, touch: boolean, dpr: number): Tier {
  if (FORCED) return FORCED;
  if (/swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer)) return 'low';
  if (cores <= 2 || (memoryGB !== undefined && memoryGB <= 2)) return 'low';
  if (touch && dpr >= 2) return 'medium';
  if (cores <= 4 && memoryGB !== undefined && memoryGB <= 4) return 'medium';
  return 'high';
}

interface QualityState {
  tier: Tier;
  reason: string;
  renderer: string;
  /** User setting 'auto' or a fixed tier. */
  manual: Tier | null;
}

export const useQuality = create<QualityState>(() => ({ tier: FORCED ?? 'high', reason: FORCED ? 'forced by ?quality' : 'default', renderer: '', manual: null }));

/**
 * Resolves once the device's tier is known (detected from the renderer, forced by ?quality, or
 * set in settings), or after `timeoutMs`, so size-dependent downloads start at the right size.
 */
export function whenTierKnown(timeoutMs = 3000): Promise<void> {
  if (useQuality.getState().reason !== 'default') return Promise.resolve();
  return new Promise((resolve) => {
    const stop = useQuality.subscribe((s) => {
      if (s.reason !== 'default') done();
    });
    const timer = setTimeout(done, timeoutMs);
    function done() {
      stop();
      clearTimeout(timer);
      resolve();
    }
  });
}

export function setManualTier(t: Tier | null) {
  useQuality.setState((s) => ({ manual: t, tier: t ?? s.tier, reason: t ? 'set in settings' : 'automatic' }));
}

/** Frame-rate thresholds of the automatic tier (ms between frames, median over a window). */
export const PERF_RULES = {
  windowMs: 2000,
  /** Below ~29 frames per second: the phone target is missed. */
  slowMs: 34,
  /** Below ~14 frames per second: badly slow. */
  severeMs: 70,
  /** Comfortably at 60 frames per second: room to step up. */
  fastMs: 17.5,
  /** Slow windows in a row before stepping down (severe ones count double). */
  slowWindowsToStep: 3,
  fastWindowsToStep: 8,
  /** Minimum time since the last change before stepping up, and after a step down from that tier. */
  upCooldownMs: 30_000,
  reUpCooldownMs: 180_000,
  /** Intervals longer than this are stalls (hidden tab, a hitch): they end the window unjudged. */
  stallMs: 1000,
  /** After a location change or a tier change, windows are not judged for this long (shader warm-up). */
  warmupMs: 3000,
};

export interface PerfWindow {
  frames: number;
  medianMs: number;
  p95Ms: number;
  missed: number;
  verdict: 'fast' | 'ok' | 'slow' | 'severe' | 'skipped';
  why?: string;
}

const median = (a: number[]) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[s.length >> 1];
};
const pct = (a: number[], q: number) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(s.length * q))];
};

/**
 * Frame-rate monitor with hysteresis (fed every frame by the stage). It judges the real interval
 * between frames (what the viewer experiences), not only the CPU time spent issuing the frame, so
 * a GPU-bound or badly slow device is seen too; frames missed at 60 Hz are counted. A window with
 * very few frames (a device at a few frames per second) is judged as severely slow instead of
 * being skipped. CPU render time and, where the browser supports timer queries, GPU time are kept
 * separately for the diagnostic overlay; the tier decision uses the frame interval only.
 */
export const perf = {
  intervals: [] as number[],
  windowStart: -1,
  slowScore: 0,
  fastWindows: 0,
  lastChange: -1e9,
  /** When the tier last stepped down, and from which tier (to avoid stepping straight back up). */
  lastDown: { at: -1e9, from: null as Tier | null },
  warmUntil: 0,
  /** Stalls seen (intervals over PERF_RULES.stallMs). */
  stalls: 0,
  /** Missed 60 Hz frames since load. */
  missedTotal: 0,
  last: null as PerfWindow | null,
  /** Recent frame intervals, CPU render times and GPU times (ms) for the overlay and the harness. */
  recent: [] as number[],
  recentCpu: [] as number[],
  recentGpu: [] as number[],
  reset() {
    this.intervals.length = 0;
    this.windowStart = -1;
    this.slowScore = 0;
    this.fastWindows = 0;
    this.lastChange = -1e9;
    this.lastDown = { at: -1e9, from: null };
    this.warmUntil = 0;
    this.stalls = 0;
    this.missedTotal = 0;
    this.last = null;
    this.recent.length = this.recentCpu.length = this.recentGpu.length = 0;
  },
  /** A location or tier change is about to compile shaders: do not judge the next few seconds. */
  warmup(nowMs: number) {
    this.warmUntil = Math.max(this.warmUntil, nowMs + PERF_RULES.warmupMs);
    this.intervals.length = 0;
    this.windowStart = nowMs;
  },
  pushGpu(ms: number) {
    this.recentGpu.push(ms);
    if (this.recentGpu.length > 600) this.recentGpu.shift();
  },
  /** One rendered frame: the real interval since the previous one, and the CPU time spent rendering it. */
  pushFrame(intervalMs: number, cpuMs: number, nowMs: number, hidden = false) {
    this.recent.push(intervalMs);
    this.recentCpu.push(cpuMs);
    if (this.recent.length > 600) this.recent.shift();
    if (this.recentCpu.length > 600) this.recentCpu.shift();
    if (this.windowStart < 0) this.windowStart = nowMs;
    if (hidden || intervalMs > PERF_RULES.stallMs) {
      // a hidden tab or a stall: start a fresh window, judge nothing
      if (intervalMs > PERF_RULES.stallMs) this.stalls++;
      this.intervals.length = 0;
      this.windowStart = nowMs;
      return;
    }
    this.intervals.push(intervalMs);
    this.missedTotal += Math.max(0, Math.round(intervalMs / 16.67) - 1);
    if (nowMs - this.windowStart < PERF_RULES.windowMs) return;
    const w = this.judge(nowMs);
    this.intervals.length = 0;
    this.windowStart = nowMs;
    this.last = w;
    if (w.verdict === 'skipped') return;
    const q = useQuality.getState();
    if (FORCED || q.manual) return;
    if (w.verdict === 'severe' || w.verdict === 'slow') {
      this.slowScore += w.verdict === 'severe' ? 2 : 1;
      this.fastWindows = 0;
    } else if (w.verdict === 'fast') {
      this.fastWindows++;
      this.slowScore = 0;
    } else {
      this.slowScore = 0;
      this.fastWindows = 0;
    }
    const i = ORDER.indexOf(q.tier);
    if (this.slowScore >= PERF_RULES.slowWindowsToStep && i > 0) {
      const to = ORDER[i - 1];
      useQuality.setState({ tier: to, reason: `stepped down: median frame interval ${w.medianMs.toFixed(0)} ms (${w.frames} frames in ${(PERF_RULES.windowMs / 1000).toFixed(0)} s)` });
      this.lastDown = { at: nowMs, from: q.tier };
      this.slowScore = 0;
      this.fastWindows = 0;
      this.lastChange = nowMs;
      this.warmup(nowMs);
    } else if (this.fastWindows >= PERF_RULES.fastWindowsToStep && i < ORDER.length - 1) {
      const to = ORDER[i + 1];
      const cool = this.lastDown.from === to ? PERF_RULES.reUpCooldownMs : PERF_RULES.upCooldownMs;
      if (nowMs - this.lastChange > cool && nowMs - (this.lastDown.from === to ? this.lastDown.at : -1e9) > cool) {
        useQuality.setState({ tier: to, reason: `stepped up: median frame interval ${w.medianMs.toFixed(1)} ms` });
        this.fastWindows = 0;
        this.lastChange = nowMs;
        this.warmup(nowMs);
      }
    }
  },
  judge(nowMs: number): PerfWindow {
    const iv = this.intervals;
    const frames = iv.length;
    const med = median(iv);
    const p95 = pct(iv, 0.95);
    const missed = iv.reduce((n, x) => n + Math.max(0, Math.round(x / 16.67) - 1), 0);
    const base = { frames, medianMs: med, p95Ms: p95, missed };
    if (nowMs < this.warmUntil) return { ...base, verdict: 'skipped', why: 'warm-up' };
    const span = nowMs - this.windowStart;
    // few frames in a full window: the device is managing only a few frames per second
    if (frames < 20 && span >= PERF_RULES.windowMs) return { ...base, verdict: 'severe', why: 'sparse' };
    if (med > PERF_RULES.severeMs) return { ...base, verdict: 'severe' };
    if (med > PERF_RULES.slowMs) return { ...base, verdict: 'slow' };
    if (med < PERF_RULES.fastMs && p95 < PERF_RULES.slowMs) return { ...base, verdict: 'fast' };
    return { ...base, verdict: 'ok' };
  },
};

export function tierSpec(): TierSpec {
  return TIERS[useQuality.getState().tier];
}
