/**
 * A synthetic EffectsSource for the effects dev harness and tests: a stand-in K-1 on the pad
 * that ignites at T-3 s, lifts off at T-0 and flies a simple, illustrative gravity turn, plus
 * single-subject scenarios (vacuum upper stage, hypergolic service module engine, solid abort
 * motor, cold-gas and hydrazine thrusters, capsule entry, booster entry burn). Everything is a
 * pure function of mission time; the ascent path is tabulated once at construction.
 */
import * as THREE from 'three';
import { E1, E1V, S1_ENGINE_LAYOUT, STATIONS, ABORT_TOWER, CAPSULE, BODY_RADIUS } from '../../vehicle/spec';
import { PAD } from '../../world/site';
import { R_EARTH, siteFrameQuaternion, sitePosition } from '../../world/frames';
import type { EffectsSource, Emitter, EmitterKind, PadState, PlasmaSource } from './input';

export type Scenario = 'ascent' | 'upper' | 'hypergolic' | 'solid' | 'rcs' | 'mono' | 'entry' | 'booster-entry';

export const SCENARIOS: Scenario[] = ['ascent', 'upper', 'hypergolic', 'solid', 'rcs', 'mono', 'entry', 'booster-entry'];

/** Map the harness `kind=` parameter (an emitter kind or a scenario name) to a scenario. */
export function scenarioFor(kind: string | null): Scenario {
  switch (kind) {
    case 'kerolox-vac':
    case 'upper':
      return 'upper';
    case 'hypergolic':
      return 'hypergolic';
    case 'solid':
      return 'solid';
    case 'cold-gas':
    case 'rcs':
      return 'rcs';
    case 'mono':
      return 'mono';
    case 'entry':
    case 'plasma':
      return 'entry';
    case 'booster-entry':
      return 'booster-entry';
    default:
      return 'ascent';
  }
}

/** US Standard Atmosphere 1976 pressure (Pa) by geometric altitude (m). */
export function stdPressure(alt: number): number {
  const h = Math.max(-0.5, alt / 1000);
  const L: [number, number, number, number][] = [
    // base km, base T, lapse K/km, base P
    [0, 288.15, -6.5, 101325],
    [11, 216.65, 0, 22632.1],
    [20, 216.65, 1.0, 5474.89],
    [32, 228.65, 2.8, 868.019],
    [47, 270.65, 0, 110.906],
    [51, 270.65, -2.8, 66.9389],
    [71, 214.65, -2.0, 3.95642],
    [86, 186.87, 0, 0.3734],
  ];
  const K = 34.1632; // g0 M / R, K/km
  let i = L.length - 1;
  while (i > 0 && h < L[i][0]) i--;
  const [hb, Tb, lr, Pb] = L[i];
  if (i === L.length - 1) return Pb * Math.exp(-(h - hb) / 6.3);
  if (lr === 0) return Pb * Math.exp((-K * (h - hb)) / Tb);
  return Pb * Math.pow(Tb / (Tb + lr * (h - hb)), K / lr);
}

export interface VehiclePose {
  /** Model-frame origin (frame I) and orientation (model → frame I). */
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  /** Stand-in shape for the harness. */
  shape: 'stack' | 'upper' | 'service' | 'les' | 'capsule' | 'booster' | 'satellite';
  altitude: number;
}

export interface SyntheticOptions {
  scenario?: Scenario;
  /** Hold the vehicle at this altitude (m) above the pad for plume tests. */
  alt?: number | null;
  /** Override every engine's throttle (0..1). */
  throttle?: number | null;
  /**
   * Mission time at which a held scenario is at its nominal altitude (`alt` or the scenario's
   * default). The stand-in flies through that point at its air-relative velocity, so smoke,
   * puffs and trails stream away from it as they would in flight.
   */
  tRef?: number;
}

const q1 = new THREE.Quaternion();
const q2 = new THREE.Quaternion();
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const Z = new THREE.Vector3(0, 0, 1);

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

interface Emit {
  id: string;
  kind: EmitterKind;
  /** Model-frame exit, flow direction, radius. */
  p: THREE.Vector3;
  d: THREE.Vector3;
  r: number;
  gg?: { p: THREE.Vector3; d: THREE.Vector3 };
}

const n3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).normalize();

const S1_ENGINES: Emit[] = S1_ENGINE_LAYOUT.map((e) => {
  const out = e.centre ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(e.x, 0, e.z).normalize();
  // gas-generator exhaust duct beside each nozzle, a little above the exit plane, canted outward
  const gp = new THREE.Vector3(e.x, 0, e.z).addScaledVector(out, E1.exitDiameter / 2 + 0.12);
  gp.y = 0.9;
  return {
    id: `s1.${e.id}`,
    kind: 'kerolox-sl' as EmitterKind,
    p: new THREE.Vector3(e.x, 0, e.z),
    d: new THREE.Vector3(0, -1, 0),
    r: E1.exitDiameter / 2,
    gg: { p: gp, d: out.clone().multiplyScalar(0.2).add(new THREE.Vector3(0, -1, 0)).normalize() },
  };
});

const S2_ENGINE: Emit = {
  id: 's2.e',
  kind: 'kerolox-vac',
  p: new THREE.Vector3(0, STATIONS.s2NozzleExit, 0),
  d: new THREE.Vector3(0, -1, 0),
  r: E1V.exitDiameter / 2,
  gg: { p: new THREE.Vector3(0.95, STATIONS.s2NozzleExit + 4.4, 0), d: n3(0.25, -1, 0) },
};

const SM_ENGINE: Emit = { id: 'sm.e', kind: 'hypergolic', p: new THREE.Vector3(0, 53.4, 0), d: new THREE.Vector3(0, -1, 0), r: 0.46 };

/** Abort motor: four nozzles canted 30 deg outward, part way up the tower. */
const LES_Y = STATIONS.fairingTip - ABORT_TOWER.length * 0.35;
const LES_NOZZLES: Emit[] = [0, 1, 2, 3].map((i) => {
  const a = Math.PI / 4 + (i * Math.PI) / 2;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { id: `les.${i}`, kind: 'solid', p: new THREE.Vector3(0.42 * c, LES_Y, 0.42 * s), d: n3(Math.tan(Math.PI / 6) * c, -1, Math.tan(Math.PI / 6) * s), r: 0.2 };
});

/** Booster cold-gas thrusters near the forward end, in pairs firing tangentially (roll/pitch/yaw). */
const S1_RCS: Emit[] = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
  const a = (Math.floor(i / 2) * Math.PI) / 2;
  const sgn = i % 2 ? 1 : -1;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return {
    id: `s1.rcs${i}`,
    kind: 'cold-gas',
    p: new THREE.Vector3(BODY_RADIUS * c, STATIONS.interstageTop - 1.2, BODY_RADIUS * s),
    d: new THREE.Vector3(-s * sgn, 0, c * sgn).add(new THREE.Vector3(c, 0, s).multiplyScalar(0.25)).normalize(),
    r: 0.05,
  };
});

/** Satellite hydrazine thrusters (four, on the aft corners). */
const SAT_RCS: Emit[] = [0, 1, 2, 3].map((i) => {
  const a = Math.PI / 4 + (i * Math.PI) / 2;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { id: `sat.rcs${i}`, kind: 'mono', p: new THREE.Vector3(1.1 * c, 55.2, 1.1 * s), d: n3(c, -0.4, s), r: 0.03 };
});

const pulse = (t: number, period: number, duty: number, phase: number) => {
  const x = (((t + phase) / period) % 1 + 1) % 1;
  return x < duty ? 1 : 0;
};

/** The synthetic source (implements EffectsSource) plus the stand-in pose for the harness. */
export class SyntheticSource implements EffectsSource {
  readonly scenario: Scenario;
  readonly alt: number | null;
  readonly thr: number | null;
  readonly tRef: number;
  groundBlastStart: number | null;
  groundBlastEnd: number | null;
  /** Ascent path table (pad-local east/up of the nozzle plane, velocity, pitch from vertical). */
  private path: { t0: number; dt: number; e: Float64Array; u: Float64Array; ve: Float64Array; vu: Float64Array; pitch: Float64Array };

  constructor(o: SyntheticOptions = {}) {
    this.scenario = o.scenario ?? 'ascent';
    this.alt = o.alt ?? null;
    this.thr = o.throttle ?? null;
    this.tRef = o.tRef ?? 0;
    const padScene = this.scenario === 'ascent' && this.alt === null;
    this.groundBlastStart = padScene ? -3 : this.scenario === 'solid' && this.alt === null ? 0 : null;
    this.groundBlastEnd = padScene ? 16 : this.scenario === 'solid' && this.alt === null ? 3 : null;
    this.path = SyntheticSource.integrate();
  }

  /** Illustrative ascent: ~3 m/s^2 net at liftoff rising as propellant burns, vertical to T+10, then a gravity turn. */
  private static integrate() {
    const dt = 0.05;
    const n = Math.ceil(420 / dt) + 1;
    const e = new Float64Array(n);
    const u = new Float64Array(n);
    const ve = new Float64Array(n);
    const vu = new Float64Array(n);
    const pitch = new Float64Array(n);
    let E = 0;
    let U = 0;
    let V = 0;
    for (let i = 0; i < n; i++) {
      const t = i * dt;
      // pitch from vertical: 0 until T+10, a slow kick, then following a gravity-turn-like schedule
      const th = (Math.PI / 180) * (1.6 * smooth(10, 16, t) + 60 * smooth(16, 170, t) ** 0.8);
      pitch[i] = th;
      e[i] = E;
      u[i] = U;
      ve[i] = V * Math.sin(th);
      vu[i] = V * Math.cos(th);
      const a = t < 150 ? 3 + 0.11 * t + 0.0002 * t * t : t < 158 ? -9.81 * Math.cos(th) : 9 + 0.03 * (t - 158);
      V = Math.max(0, V + a * dt);
      E += V * Math.sin(th) * dt;
      U += V * Math.cos(th) * dt;
    }
    return { t0: 0, dt, e, u, ve, vu, pitch };
  }

  private pathAt(t: number) {
    const P = this.path;
    const x = Math.max(0, t) / P.dt;
    const i = Math.min(P.e.length - 2, Math.floor(x));
    const f = Math.min(1, x - i);
    const L = (a: Float64Array) => a[i] + (a[i + 1] - a[i]) * f;
    return { e: L(P.e), u: L(P.u), ve: L(P.ve), vu: L(P.vu), pitch: L(P.pitch) };
  }

  /** Stand-in pose at time t. */
  vehicleAt(t: number, out: VehiclePose): VehiclePose {
    const s = this.scenario;
    const qs = siteFrameQuaternion(t, q1);
    const local = v1;
    let pitch = 0;
    let q = q2.identity();
    if (s === 'ascent') {
      if (this.alt !== null) local.set(0, this.alt + this.altSpeed() * (t - this.tRef), 0);
      else if (t <= 0) local.set(0, PAD.nozzleExitHeight, 0);
      else {
        const p = this.pathAt(t);
        local.set(p.e, PAD.nozzleExitHeight + p.u, 0);
        pitch = p.pitch;
      }
      q.setFromAxisAngle(Z, -pitch);
      out.shape = 'stack';
    } else if (s === 'upper') {
      local.set(0, this.alt ?? 180000, 0);
      // flying east, nose slightly up: the model +Y points east
      q.setFromAxisAngle(Z, -Math.PI / 2 + 0.05);
      out.shape = 'upper';
    } else if (s === 'hypergolic') {
      local.set(0, this.alt ?? 300000, 0);
      q.setFromAxisAngle(Z, -Math.PI / 2);
      out.shape = 'service';
    } else if (s === 'solid') {
      const base = this.alt ?? PAD.nozzleExitHeight;
      const tt = Math.max(0, t);
      const climb = tt < 4 ? 0.5 * 55 * tt * tt : 0.5 * 55 * 16 + 220 * (tt - 4) - 4.9 * (tt - 4) ** 2;
      local.set(0.8 * climb * 0.12, base + climb, 0);
      q.setFromAxisAngle(Z, -0.12 * smooth(0, 3, tt));
      out.shape = 'les';
    } else if (s === 'rcs') {
      local.set(0, this.alt ?? 100000, 0);
      q.setFromAxisAngle(Z, -1.2 - 0.12 * Math.sin(t * 0.4));
      out.shape = 'booster';
    } else if (s === 'mono') {
      local.set(0, this.alt ?? 400000, 0);
      q.setFromAxisAngle(Z, -Math.PI / 2);
      out.shape = 'satellite';
    } else if (s === 'entry') {
      local.set(0, this.alt ?? 68000, 0);
      // heat shield (model -Y) facing the travel direction: east and 6 deg down
      const g = (-6 * Math.PI) / 180;
      const dir = new THREE.Vector3(Math.cos(g), Math.sin(g), 0);
      q.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
      out.shape = 'capsule';
    } else {
      // booster entry burn: tail first, falling west and down at ~1.8 km/s
      local.set(0, this.alt ?? 55000, 0);
      const dir = new THREE.Vector3(-0.35, -0.94, 0).normalize();
      q.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
      out.shape = 'booster';
    }
    if (s !== 'ascent' && s !== 'solid') {
      // held scenarios fly through their nominal point at their air-relative velocity
      this.localVelocity(t, v2);
      local.addScaledVector(v2, t - this.tRef);
    }
    out.altitude = local.y;
    sitePosition(t, 0, out.pos).add(local.applyQuaternion(qs));
    out.quat.copy(qs).multiply(q);
    return out;
  }

  /** Climb speed (m/s) of the ascent held at an altitude (plume tests). */
  private altSpeed(): number {
    return 300 + (this.alt ?? 0) * 0.025;
  }

  /** Air-relative velocity (frame I) of the stand-in. */
  private velocity(t: number, pose: VehiclePose, out: THREE.Vector3): THREE.Vector3 {
    void pose;
    return this.localVelocity(t, out).applyQuaternion(siteFrameQuaternion(t, q1));
  }

  /** Air-relative velocity in pad-local axes (x east, y up, z south). */
  private localVelocity(t: number, out: THREE.Vector3): THREE.Vector3 {
    const s = this.scenario;
    if (s === 'ascent') {
      if (this.alt !== null) out.set(0, this.altSpeed(), 0);
      else if (t <= 0) out.set(0, 0, 0);
      else {
        const p = this.pathAt(t);
        out.set(p.ve, p.vu, 0);
      }
    } else if (s === 'upper') out.set(7200, 60, 0);
    else if (s === 'hypergolic' || s === 'mono') out.set(7600, 0, 0);
    else if (s === 'solid') {
      const tt = Math.max(0, t);
      const v = tt < 4 ? 55 * tt : Math.max(0, 220 - 9.8 * (tt - 4));
      out.set(v * 0.12, v, 0);
    } else if (s === 'rcs') out.set(1400, 300, 0);
    else if (s === 'entry') out.set(7000 * Math.cos(-0.105), 7000 * Math.sin(-0.105), 0);
    else out.set(-0.35 * 1800, -0.94 * 1800, 0);
    return out;
  }

  private pose: VehiclePose = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), shape: 'stack', altitude: 0 };
  private vel = new THREE.Vector3();
  private pool: Emitter[] = [];

  private emitter(i: number, e: Emit, throttle: number, since: number): Emitter {
    const o =
      this.pool[i] ??
      (this.pool[i] = {
        id: '',
        kind: 'kerolox-sl',
        pos: new THREE.Vector3(),
        dir: new THREE.Vector3(),
        exitRadius: 1,
        throttle: 0,
        ambientPressure: 0,
        altitude: 0,
        airVel: new THREE.Vector3(),
        sinceIgnition: 0,
      });
    const P = this.pose;
    o.id = e.id;
    o.kind = e.kind;
    o.pos.copy(e.p).applyQuaternion(P.quat).add(P.pos);
    o.dir.copy(e.d).applyQuaternion(P.quat);
    o.exitRadius = e.r;
    o.throttle = this.thr ?? throttle;
    const alt = o.pos.length() - R_EARTH;
    o.altitude = alt;
    o.ambientPressure = stdPressure(alt);
    o.airVel.copy(this.vel);
    o.sinceIgnition = since;
    if (e.gg) {
      const g = o.ggExhaust ?? (o.ggExhaust = { pos: new THREE.Vector3(), dir: new THREE.Vector3() });
      g.pos.copy(e.gg.p).applyQuaternion(P.quat).add(P.pos);
      g.dir.copy(e.gg.d).applyQuaternion(P.quat);
    } else o.ggExhaust = undefined;
    return o;
  }

  emittersAt(t: number, out: Emitter[]): Emitter[] {
    out.length = 0;
    const s = this.scenario;
    this.vehicleAt(t, this.pose);
    this.velocity(t, this.pose, this.vel);
    let n = 0;
    if (s === 'ascent') {
      const since = t + 3;
      if (since < 0 || (this.alt === null && t > 152)) return out;
      // held at an altitude: the engines run only above the ground
      if (this.alt !== null && this.alt + this.altSpeed() * (t - this.tRef) < 60) return out;
      // start transient: flow ramps up over ~0.9 s; throttle bucket through max-q; cutoff at T+150
      const ramp = this.alt !== null ? 1 : smooth(0, 0.9, since);
      const bucket = 1 - 0.3 * smooth(52, 58, t) * (1 - smooth(72, 78, t));
      const cut = this.alt !== null ? 1 : 1 - smooth(149.2, 150, t);
      const thr = ramp * bucket * cut;
      for (const e of S1_ENGINES) out.push(this.emitter(n++, e, thr, this.alt !== null ? 30 : since));
    } else if (s === 'upper') {
      if (t < 0) return out;
      out.push(this.emitter(n++, S2_ENGINE, smooth(0, 1.2, t), t));
    } else if (s === 'hypergolic') {
      if (t < 0) return out;
      out.push(this.emitter(n++, SM_ENGINE, smooth(0, 0.15, t), t));
    } else if (s === 'solid') {
      if (t < 0 || t > 4.2) return out;
      const thr = smooth(0, 0.08, t) * (1 - smooth(3.6, 4.2, t));
      for (const e of LES_NOZZLES) out.push(this.emitter(n++, e, thr, t));
    } else if (s === 'rcs') {
      S1_RCS.forEach((e, i) => {
        const on = pulse(t, 2.4, 0.22, i * 0.61) * (i % 3 === 1 ? 0 : 1);
        if (on > 0) out.push(this.emitter(n++, e, on, 0));
      });
    } else if (s === 'mono') {
      SAT_RCS.forEach((e, i) => {
        const on = pulse(t, 1.6, 0.15, i * 0.4);
        if (on > 0) out.push(this.emitter(n++, e, on, 0));
      });
    } else if (s === 'booster-entry') {
      if (t < 0) return out;
      const thr = smooth(0, 1, t);
      // entry burn: the centre engine and two opposite outer engines
      for (const e of [S1_ENGINES[0], S1_ENGINES[1], S1_ENGINES[4]]) out.push(this.emitter(n++, e, thr, t));
    }
    return out;
  }

  plasmaAt(t: number, out: PlasmaSource[]): PlasmaSource[] {
    out.length = 0;
    const s = this.scenario;
    if (s !== 'entry' && s !== 'booster-entry') return out;
    this.vehicleAt(t, this.pose);
    this.velocity(t, this.pose, this.vel);
    const P = this.pose;
    const src: PlasmaSource = this._plasma ?? (this._plasma = { id: '', pos: new THREE.Vector3(), dir: new THREE.Vector3(), radius: 1, intensity: 0 });
    if (s === 'entry') {
      src.id = 'capsule';
      // centre of the heat shield face (model: capsule base on the service-module interface)
      src.pos.set(0, 56.6 - CAPSULE.heatShieldThickness, 0).applyQuaternion(P.quat).add(P.pos);
      src.radius = CAPSULE.baseDiameter / 2;
      src.intensity = this.thr ?? 1;
    } else {
      src.id = 'booster';
      src.pos.set(0, -0.2, 0).applyQuaternion(P.quat).add(P.pos);
      src.radius = BODY_RADIUS;
      src.intensity = (this.thr ?? 1) * 0.7;
    }
    src.dir.copy(this.vel).normalize();
    out.push(src);
    return out;
  }
  private _plasma: PlasmaSource | null = null;

  padAt(t: number, out: PadState): PadState {
    const pad = this.scenario === 'ascent' && this.alt === null;
    out.venting = pad ? 1 - smooth(-4, -1.5, t) : 0;
    out.deluge = pad ? smooth(-7, -5, t) * (1 - smooth(18, 30, t)) : 0;
    out.holddown = pad ? smooth(-0.05, 0.25, t) : 1;
    out.arms = pad ? smooth(-40, -20, t) : 1;
    return out;
  }
}
