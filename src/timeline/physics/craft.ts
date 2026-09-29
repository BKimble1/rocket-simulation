/**
 * The point-mass flight model used to compute each mission's REFERENCE TRAJECTORY once, when
 * the mission is opened. It is not a real-time flight solver: guidance is authored (pitch
 * programs, linear-tangent steering solved by shooting, simple feedback laws), the vehicle is a
 * point mass with an attitude, and the numbers are illustrative but physically coherent.
 *
 * A Craft is a set of bodies moving together. It integrates its centre of mass in frame I
 * (RK4, gravity mu/r^2, thrust with the ambient-pressure loss, drag in the co-rotating
 * atmosphere, optional lift and extra accelerations), steers its attitude with a rate- and
 * acceleration-limited slew, burns propellant from its tanks and records samples. Separations
 * split a craft into two, each starting exactly at the parent's model-frame origin pose
 * (continuity), so attached bodies share one pose and never teleport.
 */
import { EARTH_AXIS, MU_EARTH, MU_MOON, OMEGA_EARTH, R_EARTH, moonPosition } from '../../world/frames';
import type { BodyId } from '../../vehicle/parts';
import { atmosphereInto, type AtmosphereSample } from './atmosphere';
import { thrustOf, type EngineModel } from './vehicle';
import { clamp, qapply, qaxisY, qclone, qdelta, qrot, qslerp, v3, vadd, vclone, vcross, vdot, vlen, vnorm, vscale, vsub, type Q, type V3 } from './vec';

export const OMEGA_VEC: V3 = { x: EARTH_AXIS.x * OMEGA_EARTH, y: EARTH_AXIS.y * OMEGA_EARTH, z: EARTH_AXIS.z * OMEGA_EARTH };

/** Air velocity of the co-rotating atmosphere at r. */
export const airVelocity = (r: V3): V3 => vcross(OMEGA_VEC, r);

export type TankId = 's1' | 's2' | 'sm' | 'sat' | 'les' | 'rcs';

export interface EngineGroup {
  id: string;
  eng: EngineModel;
  /** Engines lit in this group. */
  n: number;
  tank: TankId;
  /** Throttle at the start of the step and commanded for its end (linear in between). */
  thr: number;
  next: number;
  /** Direction of thrust in the body frame (default +Y). */
  dirBody?: V3;
}

export interface Sample {
  t: number;
  /** Centre of mass and its velocity (frame I). */
  r: V3;
  v: V3;
  q: Q;
  /** Angular velocity (frame I) during the step that ended here. */
  w: V3;
  /** Centre of mass in the model frame. */
  c: V3;
  m: number;
}

export interface Segment {
  bodies: BodyId[];
  samples: Sample[];
}

export interface AttitudeCmd {
  /** Desired attitude. */
  q: Q;
  /** Max rate (rad/s) and angular acceleration (rad/s^2). */
  wMax: number;
  aMax: number;
  /** Time constant of the proportional tracking (s). */
  tau?: number;
}

export interface AeroModel {
  /** Reference area (m^2). */
  area: number;
  /** Drag coefficient vs Mach. */
  cd: (mach: number) => number;
  /** Extra drag area Cd*A (m^2) at time t (parachutes). */
  extraCdA?: (t: number) => number;
}

const atm: AtmosphereSample = { altitude: 0, temperature: 0, pressure: 0, density: 0, speedOfSound: 0 };

export interface Env {
  /** Moon phase at T-0 when lunar gravity is on (restricted three-body). */
  moonPhase0: number | null;
  /** Every recording segment of every craft, in creation order (tracks are assembled from these). */
  segments: Segment[];
}

let craftSerial = 0;

export class Craft {
  readonly id: number;
  bodies: BodyId[];
  t: number;
  r: V3;
  v: V3;
  q: Q;
  w: V3;
  /** Mass that does not change (dry structures, payloads). */
  fixedMass: number;
  tanks: Partial<Record<TankId, number>>;
  groups: EngineGroup[] = [];
  aero: AeroModel;
  /** Model-frame centre of mass as a function of this craft's current tank contents. */
  comFn: (c: Craft) => V3;
  /** Extra acceleration applied during the next step (frame I): pushers, RCS translation. */
  extra: V3 = v3();
  /** Lift acceleration command for the next step (frame I, perpendicular to the airflow). */
  lift: V3 = v3();
  env: Env;
  seg: Segment;
  /** Last angular acceleration (rad/s^2, frame I), for gimbal and RCS channels. */
  alpha: V3 = v3();
  /** Aerodynamic quantities at the last step. */
  q_dyn = 0;
  mach = 0;
  pAmb = 0;
  alt = 0;
  /** Non-gravitational acceleration (m/s^2) at the last step. */
  sensed = 0;
  /** Whether attitude motion is currently produced by RCS (for the RCS channels). */
  rcsActuator = true;
  gravityOn = true;

  constructor(opts: { bodies: BodyId[]; t: number; r: V3; v: V3; q: Q; w?: V3; fixedMass: number; tanks?: Partial<Record<TankId, number>>; aero: AeroModel; comFn: (c: Craft) => V3; env: Env }) {
    this.id = craftSerial++;
    this.bodies = opts.bodies;
    this.t = opts.t;
    this.r = vclone(opts.r);
    this.v = vclone(opts.v);
    this.q = qclone(opts.q);
    this.w = opts.w ? vclone(opts.w) : v3();
    this.fixedMass = opts.fixedMass;
    this.tanks = { ...(opts.tanks ?? {}) };
    this.aero = opts.aero;
    this.comFn = opts.comFn;
    this.env = opts.env;
    this.seg = { bodies: [...opts.bodies], samples: [] };
    this.env.segments.push(this.seg);
  }

  get mass(): number {
    let m = this.fixedMass;
    for (const k in this.tanks) m += this.tanks[k as TankId] ?? 0;
    return m;
  }

  get com(): V3 {
    return this.comFn(this);
  }

  /** Model-frame origin position (frame I). */
  origin(): V3 {
    return vsub(this.r, qrot(this.q, this.com));
  }

  altitude(): number {
    return vlen(this.r) - R_EARTH;
  }

  airRel(): V3 {
    return vsub(this.v, airVelocity(this.r));
  }

  group(id: string): EngineGroup | undefined {
    return this.groups.find((g) => g.id === id);
  }

  /** Set a group's commanded throttle for the end of the next step. */
  command(id: string, th: number) {
    const g = this.group(id);
    if (g) g.next = th;
  }

  record() {
    const s = this.seg.samples;
    const smp: Sample = { t: this.t, r: vclone(this.r), v: vclone(this.v), q: qclone(this.q), w: vclone(this.w), c: this.com, m: this.mass };
    if (s.length && s[s.length - 1].t >= this.t - 1e-9) s[s.length - 1] = smp;
    else s.push(smp);
  }

  /** Gravity acceleration at r, time t. */
  gravity(r: V3, t: number): V3 {
    const rn2 = r.x * r.x + r.y * r.y + r.z * r.z;
    const rn = Math.sqrt(rn2);
    const k = -MU_EARTH / (rn2 * rn);
    let ax = r.x * k;
    let ay = r.y * k;
    let az = r.z * k;
    if (this.env.moonPhase0 !== null) {
      const mp = moonPosition(t, this.env.moonPhase0);
      const dx = r.x - mp.x;
      const dy = r.y - mp.y;
      const dz = r.z - mp.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      const d = Math.sqrt(d2);
      const km = -MU_MOON / (d2 * d);
      const m2 = mp.x * mp.x + mp.y * mp.y + mp.z * mp.z;
      const mn = Math.sqrt(m2);
      const ki = -MU_MOON / (m2 * mn); // indirect term: Earth's own acceleration toward the Moon
      ax += dx * km + mp.x * ki;
      ay += dy * km + mp.y * ki;
      az += dz * km + mp.z * ki;
    }
    return { x: ax, y: ay, z: az };
  }

  /**
   * Advance by dt: attitude first (the slew command for this step), then translation by RK4
   * with thrust direction interpolated between the start and end attitudes, throttles linear
   * across the step, and propellant drawn analytically from the throttle profile.
   */
  step(dt: number, att: AttitudeCmd | null, wFF: V3 | null = null) {
    const q0 = this.q;
    const w0 = this.w;
    let q1 = q0;
    let w1 = w0;
    if (att) {
      const e = qdelta(q0, att.q);
      const th = vlen(e);
      const tau = att.tau ?? 1.2;
      let cmd = v3();
      if (th > 1e-9) {
        const mag = Math.min(att.wMax, Math.sqrt(2 * att.aMax * th * 0.8), th / tau);
        cmd = vscale(e, mag / th);
      }
      if (wFF) cmd = vadd(cmd, wFF);
      let dw = vsub(cmd, w0);
      const dwn = vlen(dw);
      const lim = att.aMax * dt;
      if (dwn > lim) dw = vscale(dw, lim / dwn);
      w1 = vadd(w0, dw);
      q1 = qapply(vscale(w1, dt), q0);
    } else {
      q1 = qapply(vscale(w0, dt), q0);
    }
    this.alpha = vscale(vsub(w1, w0), 1 / dt);

    // propellant flow per tank for this step
    const m0 = this.mass;
    let mdot0 = 0;
    let mdot1 = 0;
    for (const g of this.groups) {
      mdot0 += g.eng.mdot * g.n * Math.max(0, g.thr);
      mdot1 += g.eng.mdot * g.n * Math.max(0, g.next);
    }
    const massAt = (tau: number) => m0 - (mdot0 * tau + ((mdot1 - mdot0) * tau * tau) / (2 * dt));
    const t0 = this.t;
    const groups = this.groups;
    const aero = this.aero;
    const extra = this.extra;
    const lift = this.lift;
    const self = this;
    let lastQ = 0;
    let lastMach = 0;
    let lastP = 0;
    let lastAlt = 0;
    let lastSensed = 0;
    const deriv = (tau: number, r: V3, v: V3): V3 => {
      const u = tau / dt;
      const t = t0 + tau;
      const g = self.gravityOn ? self.gravity(r, t) : v3();
      const rn = Math.sqrt(r.x * r.x + r.y * r.y + r.z * r.z);
      const alt = rn - R_EARTH;
      let ax = 0;
      let ay = 0;
      let az = 0;
      const m = massAt(tau);
      let p = 0;
      if (alt < 1_000_000) {
        atmosphereInto(alt, atm);
        p = atm.pressure;
        const va = { x: v.x - (OMEGA_VEC.y * r.z - OMEGA_VEC.z * r.y), y: v.y - (OMEGA_VEC.z * r.x - OMEGA_VEC.x * r.z), z: v.z - (OMEGA_VEC.x * r.y - OMEGA_VEC.y * r.x) };
        const vs = Math.sqrt(va.x * va.x + va.y * va.y + va.z * va.z);
        const mach = vs / atm.speedOfSound;
        const qd = 0.5 * atm.density * vs * vs;
        const cda = aero.cd(mach) * aero.area + (aero.extraCdA ? aero.extraCdA(t) : 0);
        if (vs > 1e-6 && qd > 0) {
          const k = -(qd * cda) / (m * vs);
          ax += va.x * k;
          ay += va.y * k;
          az += va.z * k;
        }
        lastQ = qd;
        lastMach = mach;
      } else {
        lastQ = 0;
        lastMach = 0;
      }
      lastP = p;
      lastAlt = alt;
      if (groups.length) {
        const qq = u <= 0 ? q0 : u >= 1 ? q1 : qslerp(q0, q1, u);
        for (const gr of groups) {
          const th = gr.thr + (gr.next - gr.thr) * u;
          if (th <= 0) continue;
          const F = thrustOf(gr.eng, gr.n, th, p);
          const d = qrot(qq, gr.dirBody ?? { x: 0, y: 1, z: 0 });
          ax += (d.x * F) / m;
          ay += (d.y * F) / m;
          az += (d.z * F) / m;
        }
      }
      ax += extra.x + lift.x;
      ay += extra.y + lift.y;
      az += extra.z + lift.z;
      lastSensed = Math.sqrt(ax * ax + ay * ay + az * az);
      return { x: g.x + ax, y: g.y + ay, z: g.z + az };
    };
    // RK4 on (r, v)
    const r0 = this.r;
    const v0 = this.v;
    const a1 = deriv(0, r0, v0);
    const r2 = { x: r0.x + v0.x * dt * 0.5, y: r0.y + v0.y * dt * 0.5, z: r0.z + v0.z * dt * 0.5 };
    const v2 = { x: v0.x + a1.x * dt * 0.5, y: v0.y + a1.y * dt * 0.5, z: v0.z + a1.z * dt * 0.5 };
    const a2 = deriv(dt * 0.5, r2, v2);
    const r3 = { x: r0.x + v2.x * dt * 0.5, y: r0.y + v2.y * dt * 0.5, z: r0.z + v2.z * dt * 0.5 };
    const v3_ = { x: v0.x + a2.x * dt * 0.5, y: v0.y + a2.y * dt * 0.5, z: v0.z + a2.z * dt * 0.5 };
    const a3 = deriv(dt * 0.5, r3, v3_);
    const r4 = { x: r0.x + v3_.x * dt, y: r0.y + v3_.y * dt, z: r0.z + v3_.z * dt };
    const v4 = { x: v0.x + a3.x * dt, y: v0.y + a3.y * dt, z: v0.z + a3.z * dt };
    const a4 = deriv(dt, r4, v4);
    this.r = {
      x: r0.x + (dt / 6) * (v0.x + 2 * v2.x + 2 * v3_.x + v4.x),
      y: r0.y + (dt / 6) * (v0.y + 2 * v2.y + 2 * v3_.y + v4.y),
      z: r0.z + (dt / 6) * (v0.z + 2 * v2.z + 2 * v3_.z + v4.z),
    };
    this.v = {
      x: v0.x + (dt / 6) * (a1.x + 2 * a2.x + 2 * a3.x + a4.x),
      y: v0.y + (dt / 6) * (a1.y + 2 * a2.y + 2 * a3.y + a4.y),
      z: v0.z + (dt / 6) * (a1.z + 2 * a2.z + 2 * a3.z + a4.z),
    };
    // propellant
    for (const g of groups) {
      const used = g.eng.mdot * g.n * ((Math.max(0, g.thr) + Math.max(0, g.next)) / 2) * dt;
      if (used > 0) this.tanks[g.tank] = (this.tanks[g.tank] ?? 0) - used;
      g.thr = g.next;
    }
    this.q = q1;
    this.w = w1;
    this.t = t0 + dt;
    this.q_dyn = lastQ;
    this.mach = lastMach;
    this.pAmb = lastP;
    this.alt = lastAlt;
    this.sensed = lastSensed;
  }

  /**
   * Split bodies off into a new craft at the current instant. Both crafts keep the model-frame
   * origin pose exactly; each gets its own centre of mass from the origin, and the rigid-body
   * velocity of that point. The parent starts a new recording segment.
   */
  split(opts: { bodies: BodyId[]; fixedMass: number; tankIds?: TankId[]; aero: AeroModel; comFn: (c: Craft) => V3; parentFixedMass: number; parentAero?: AeroModel; parentComFn?: (c: Craft) => V3 }): Craft {
    this.record();
    const o = this.origin();
    const vo = this.originVelocity();
    const tanks: Partial<Record<TankId, number>> = {};
    for (const k of opts.tankIds ?? []) {
      tanks[k] = this.tanks[k] ?? 0;
      delete this.tanks[k];
    }
    const child = new Craft({ bodies: opts.bodies, t: this.t, r: o, v: vo, q: this.q, w: this.w, fixedMass: opts.fixedMass, tanks, aero: opts.aero, comFn: opts.comFn, env: this.env });
    child.groups = this.groups.filter((g) => g.tank in tanks);
    this.groups = this.groups.filter((g) => !(g.tank in tanks));
    child.rehome(o, vo);
    child.record();
    // the parent keeps the remaining bodies and starts a new segment with its new centre of mass
    this.bodies = this.bodies.filter((b) => !opts.bodies.includes(b));
    this.fixedMass = opts.parentFixedMass;
    if (opts.parentAero) this.aero = opts.parentAero;
    if (opts.parentComFn) this.comFn = opts.parentComFn;
    this.seg = { bodies: [...this.bodies], samples: [] };
    this.env.segments.push(this.seg);
    this.rehome(o, vo);
    this.record();
    return child;
  }

  /** Recompute the COM from a known origin pose (after a change of composition). */
  rehome(origin: V3, originVel: V3) {
    const cw = qrot(this.q, this.com);
    this.r = vadd(origin, cw);
    this.v = vadd(originVel, vcross(this.w, cw));
  }

  /** Rigid-body velocity of the model-frame origin. */
  originVelocity(): V3 {
    const cw = qrot(this.q, this.com);
    return vsub(this.v, vcross(this.w, cw));
  }

  /** Start a new recording segment (composition changes, e.g. a tank emptied). */
  newSegment() {
    this.record();
    this.seg = { bodies: [...this.bodies], samples: [] };
    this.env.segments.push(this.seg);
    this.record();
  }

  /** Exact copy of the dynamic state (for re-doing a step up to an event inside it). */
  snapshot() {
    return { t: this.t, r: { ...this.r }, v: { ...this.v }, q: qclone(this.q), w: { ...this.w }, tanks: { ...this.tanks }, thr: this.groups.map((g) => [g.thr, g.next] as [number, number]), fixed: this.fixedMass, alpha: { ...this.alpha } };
  }

  restore(s: ReturnType<Craft['snapshot']>) {
    this.t = s.t;
    this.r = { ...s.r };
    this.v = { ...s.v };
    this.q = qclone(s.q);
    this.w = { ...s.w };
    this.tanks = { ...s.tanks };
    this.groups.forEach((g, i) => {
      g.thr = s.thr[i][0];
      g.next = s.thr[i][1];
    });
    this.fixedMass = s.fixed;
    this.alpha = { ...s.alpha };
  }

  /** Change composition in place (e.g. propellant or a mass changes discontinuously): keeps the origin pose. */
  recompose(fn: () => void) {
    this.record();
    const o = this.origin();
    const vo = this.originVelocity();
    fn();
    this.seg = { bodies: [...this.bodies], samples: [] };
    this.env.segments.push(this.seg);
    this.rehome(o, vo);
    this.record();
  }
}

/** Radial unit vector (local vertical). */
export const upOf = (r: V3): V3 => vnorm(r);

/** Local horizontal unit vector in the plane with normal n (prograde for h along n). */
export function horizOf(r: V3, n: V3): V3 {
  return vnorm(vcross(n, r));
}

/** Nose along the air-relative velocity (zero angle of attack). */
export function progradeAir(c: Craft): V3 {
  return vnorm(c.airRel());
}

export const axisOf = (c: Craft): V3 => qaxisY(c.q);

export { clamp, vdot };
