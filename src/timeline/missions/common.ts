/**
 * Helpers shared by the six mission builders: phases from the outline vocabulary (ids, order,
 * titles exactly as in outline.ts, times from the trajectory's events), active parts per
 * phase, the presentation map builder and shot helpers.
 */
import type { BodyId, PartId } from '../../vehicle/parts';
import type { Branch, MissionId, Phase, PresSegment, Shot, ShotKind } from '../types';
import { OUTLINES, type PhaseOutline } from './outline';

/**
 * Parts doing the work in each phase (ids from src/vehicle/parts.ts). Rules: the booster's own
 * guidance computers ('booster-avionics') fly its return, not the upper stage's 'avionics' ring;
 * at max-q the engines throttle through their gas generators while the main valves stay open;
 * the suborbital stack has no upper stage; its research capsule holds attitude with its own
 * thrusters during the free fall (the cap.rcs channel).
 */
export const ACTIVE: Record<string, PartId[]> = {
  pad: ['service-tower', 'launch-mount', 's1-lox-tank', 's1-fuel-tank', 'pressurization', 'sound-suppression'],
  ignition: ['s1-engine-cluster', 'engine', 'turbopump', 'gas-generator', 'igniter', 'main-valves', 'launch-mount', 'flame-deflector', 'sound-suppression'],
  liftoff: ['s1-engine-cluster', 'thrust-structure', 'tvc-actuators', 'avionics', 'launch-mount'],
  pitchover: ['tvc-actuators', 'avionics', 's1-engine-cluster', 'nozzle'],
  maxq: ['s1-intertank', 'interstage', 'thrust-structure', 'fairing', 'gas-generator', 'avionics'],
  meco: ['main-valves', 's1-engine-cluster', 's1-lox-tank', 'lox-downcomer', 'avionics'],
  staging: ['stage-separation', 'interstage', 'vacuum-engine'],
  ses1: ['vacuum-engine', 'nozzle-extension', 'igniter', 's2-tanks', 'avionics'],
  fairing: ['fairing', 'payload-adapter', 'avionics'],
  'upper-burn': ['vacuum-engine', 'nozzle-extension', 's2-tanks', 'common-bulkhead', 'avionics'],
  seco: ['vacuum-engine', 'avionics', 's2-rcs'],
  coast: ['s2-rcs', 'avionics', 'vacuum-engine'],
  deploy: ['payload-adapter', 'satellite-bus', 's2-rcs'],
  arrays: ['solar-arrays', 'antenna', 'attitude-thrusters', 'satellite-bus'],
  // booster recovery
  flip: ['cold-gas-rcs', 'booster-avionics'],
  boostback: ['s1-engine-cluster', 'engine', 'igniter', 'tvc-actuators'],
  'booster-coast': ['grid-fins', 'cold-gas-rcs'],
  'entry-burn': ['s1-engine-cluster', 'engine', 'base-heat-shield'],
  'aero-guidance': ['grid-fins', 'booster-avionics'],
  'landing-burn': ['engine', 'landing-legs', 'tvc-actuators', 'booster-avionics'],
  // suborbital
  'capsule-sep': ['capsule', 'stage-separation'],
  apogee: ['capsule'],
  descent: ['capsule', 'heat-shield'],
  entry: ['heat-shield', 'backshell-tps', 'capsule'],
  parachutes: ['parachutes', 'capsule'],
  splashdown: ['capsule', 'parachutes'],
  // gto / lunar
  parking: ['vacuum-engine', 'nozzle-extension', 's2-tanks', 'avionics'],
  'parking-coast': ['s2-rcs', 'avionics'],
  restart: ['s2-rcs', 'vacuum-engine', 'igniter'],
  'gto-injection': ['vacuum-engine', 'nozzle-extension', 's2-tanks'],
  'transfer-coast': ['satellite-bus', 'solar-arrays', 'mli-blankets'],
  circularize: ['apogee-engine', 'attitude-thrusters', 'satellite-bus'],
  tli: ['vacuum-engine', 'nozzle-extension', 's2-tanks', 'avionics'],
  'probe-sep': ['payload-adapter', 'satellite-bus'],
  cruise: ['satellite-bus', 'solar-arrays', 'antenna'],
  soi: ['satellite-bus', 'antenna'],
  flyby: ['satellite-bus', 'antenna', 'attitude-thrusters'],
  outbound: ['satellite-bus', 'antenna'],
  // station
  'abort-jettison': ['launch-abort-system'],
  insertion: ['vacuum-engine', 'avionics', 's2-tanks'],
  phasing: ['service-module', 'attitude-thrusters', 'solar-arrays'],
  raise: ['service-module', 'attitude-thrusters'],
  approach: ['docking-system', 'attitude-thrusters', 'capsule', 'station'],
  docking: ['docking-system', 'station', 'capsule'],
  // return
  undock: ['docking-system', 'attitude-thrusters', 'station'],
  deorbit: ['service-module', 'attitude-thrusters'],
  'sm-sep': ['service-module', 'capsule'],
  blackout: ['heat-shield', 'backshell-tps'],
  drogues: ['parachutes'],
  mains: ['parachutes'],
};

/** Mission-specific overrides of ACTIVE (same phase id, different hardware). */
const OVERRIDE: Partial<Record<MissionId, Record<string, PartId[]>>> = {
  station: {
    'capsule-sep': ['capsule', 'service-module', 'solar-arrays'],
    maxq: ['s1-intertank', 'interstage', 'launch-abort-system', 'gas-generator', 'avionics'],
    liftoff: ['s1-engine-cluster', 'tvc-actuators', 'avionics', 'launch-abort-system'],
    pad: ['service-tower', 'launch-mount', 's1-lox-tank', 's1-fuel-tank', 'capsule', 'launch-abort-system'],
  },
  suborbital: {
    liftoff: ['s1-engine-cluster', 'tvc-actuators', 'booster-avionics', 'launch-mount'],
    meco: ['main-valves', 's1-engine-cluster', 'booster-avionics'],
    'booster-coast': ['cold-gas-rcs', 'grid-fins'],
    apogee: ['capsule', 'attitude-thrusters'],
    descent: ['capsule', 'heat-shield', 'attitude-thrusters'],
  },
  return: {
    entry: ['heat-shield', 'backshell-tps', 'capsule', 'attitude-thrusters'],
    splashdown: ['capsule', 'parachutes'],
  },
};

/** Phase list in outline order with the given mission-time intervals. */
export function phasesFrom(mission: MissionId, outline: PhaseOutline[], times: Record<string, [number, number]>): Phase[] {
  return outline.map((o) => {
    const tt = times[o.id];
    if (!tt) throw new Error(`${mission}: phase ${o.id} has no times`);
    const [start, end] = tt;
    if (!(end >= start)) throw new Error(`${mission}: phase ${o.id} ends before it starts`);
    return { id: o.id, title: o.title, start, end, focus: o.focus, activeParts: OVERRIDE[mission]?.[o.id] ?? ACTIVE[o.id] ?? [] };
  });
}

/** Contiguous phases from boundary times: phase i spans [b[i], b[i+1]]. */
export function contiguous(ids: string[], bounds: number[]): Record<string, [number, number]> {
  if (bounds.length !== ids.length + 1) throw new Error('contiguous: bounds/ids mismatch');
  const out: Record<string, [number, number]> = {};
  ids.forEach((id, i) => (out[id] = [bounds[i], bounds[i + 1]]));
  return out;
}

export function branchFrom(mission: MissionId, bounds: number[], shots: Shot[]): Branch[] {
  const b = OUTLINES[mission].branch;
  if (!b) return [];
  const phases = phasesFrom(mission, b.phases, contiguous(b.phases.map((p) => p.id), bounds));
  return [{ id: b.id, title: b.title, focus: b.focus, start: bounds[0], end: bounds[bounds.length - 1], phases, shots }];
}

// ───────────────────────────── presentation map ─────────────────────────────

/**
 * Builds the presentation map: consecutive mission-time spans, each played at a rate (mission
 * seconds per presentation second) with an optional on-screen note, or omitted (a short
 * dissolve over a quiet interval, stated on screen). Contiguous and monotonic by construction.
 */
export class Pres {
  segs: PresSegment[] = [];
  private p = 0;
  private m: number;
  constructor(m0: number) {
    this.m = m0;
  }
  /** Play up to mission time m1 at `rate`. */
  to(m1: number, rate = 1, note?: string): this {
    if (m1 <= this.m + 1e-9) return this;
    const dur = (m1 - this.m) / rate;
    const seg: PresSegment = { p0: this.p, p1: this.p + dur, m0: this.m, m1 };
    if (note) seg.note = note;
    this.segs.push(seg);
    this.p += dur;
    this.m = m1;
    return this;
  }
  /** Skip a quiet interval up to m1 in `dur` presentation seconds. */
  omit(m1: number, note: string, dur = 4): this {
    if (m1 <= this.m + 1e-9) return this;
    this.segs.push({ p0: this.p, p1: this.p + dur, m0: this.m, m1, note, omitted: true });
    this.p += dur;
    this.m = m1;
    return this;
  }
  get mission(): number {
    return this.m;
  }
  get duration(): number {
    return this.p;
  }
}

/** A number for interface text, with thousands separators: num(35802.4) is "35,802". */
export function num(x: number, digits = 0): string {
  const [i, f] = Math.abs(x).toFixed(digits).split('.');
  return (x < 0 && Number(Math.abs(x).toFixed(digits)) !== 0 ? '-' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f ? '.' + f : '');
}

/** "x20" style rate label. */
export function rateNote(what: string, rate: number): string {
  const r = rate >= 10 ? Math.round(rate) : Math.round(rate * 10) / 10;
  return `${what} accelerated ×${r}`;
}

// ───────────────────────────── shots ─────────────────────────────

export function shot(kind: ShotKind, from: number, to: number, subject: BodyId, also?: Shot['also'], params?: Record<string, number>): Shot {
  const s: Shot = { kind, from, to, subject };
  if (also) s.also = also;
  if (params) s.params = params;
  return s;
}

/**
 * Make a shot list gap-free and non-overlapping: sort, clip each shot to the next one's start,
 * and extend a shot over a gap (so the Auto director never has nothing to show).
 */
export function tidyShots(list: Shot[], start: number, end: number): Shot[] {
  const s = list.filter((x) => x.to > x.from).sort((a, b) => a.from - b.from);
  if (!s.length) return s;
  s[0].from = Math.min(s[0].from, start);
  for (let i = 0; i < s.length - 1; i++) s[i].to = s[i + 1].from;
  s[s.length - 1].to = Math.max(s[s.length - 1].to, end);
  return s.filter((x) => x.to - x.from > 1e-6);
}
