/**
 * Rendering quality tiers. A tier changes only how the picture is drawn (pixel ratio, shadow
 * map size, particle budgets, cloud and atmosphere sample counts, texture resolution) never
 * what is shown or when: lessons, events and timing do not depend on it.
 *
 * Automatic mode starts from what the device says about itself and steps down (or back up)
 * from measured frame times, with hysteresis: a step down needs several slow measuring
 * windows in a row, a step up needs many fast ones and a cool-down since the last change, so
 * the resolution never oscillates visibly. ?quality=high|medium|low forces a tier.
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

export function setManualTier(t: Tier | null) {
  useQuality.setState((s) => ({ manual: t, tier: t ?? s.tier, reason: t ? 'set in settings' : 'automatic' }));
}

/** Frame-time monitor with hysteresis (fed every frame by the stage). */
export const perf = {
  samples: [] as number[],
  windowStart: 0,
  slowWindows: 0,
  fastWindows: 0,
  lastChange: -1e9,
  /** Recent frame times for the diagnostic overlay and the measurement harness (ms). */
  recent: [] as number[],
  push(ms: number, nowMs: number) {
    this.samples.push(ms);
    this.recent.push(ms);
    if (this.recent.length > 600) this.recent.shift();
    if (nowMs - this.windowStart < 2000) return;
    const s = [...this.samples].sort((a, b) => a - b);
    this.samples.length = 0;
    this.windowStart = nowMs;
    if (s.length < 20) return;
    const median = s[s.length >> 1];
    const q = useQuality.getState();
    if (FORCED || q.manual) return;
    if (median > 26) {
      this.slowWindows++;
      this.fastWindows = 0;
    } else if (median < 13) {
      this.fastWindows++;
      this.slowWindows = 0;
    } else {
      this.slowWindows = 0;
      this.fastWindows = 0;
    }
    const i = ORDER.indexOf(q.tier);
    if (this.slowWindows >= 3 && i > 0) {
      useQuality.setState({ tier: ORDER[i - 1], reason: `stepped down: median frame ${median.toFixed(1)} ms` });
      this.slowWindows = 0;
      this.lastChange = nowMs;
    } else if (this.fastWindows >= 8 && i < ORDER.length - 1 && nowMs - this.lastChange > 30000) {
      useQuality.setState({ tier: ORDER[i + 1], reason: `stepped up: median frame ${median.toFixed(1)} ms` });
      this.fastWindows = 0;
      this.lastChange = nowMs;
    }
  },
};

export function tierSpec(): TierSpec {
  return TIERS[useQuality.getState().tier];
}
