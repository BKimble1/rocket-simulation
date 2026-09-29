/**
 * Booster recovery guidance (return to launch site): cold-gas flip, boostback on three engines
 * steered by the predicted vacuum impact point, coast with grid fins out, entry burn on three
 * engines, aerodynamic descent with grid-fin steering (lift up to L/D 0.25 from flying at an
 * angle of attack), and a centre-engine landing burn whose throttle and tilt come from a
 * simple optimal-control law (constant-deceleration vertical profile, zero-effort-miss
 * horizontal law). A single E-1 at minimum throttle still out-lifts the near-empty booster, so
 * it cannot hover: ignition is timed so velocity reaches zero at touchdown.
 *
 * Authored guidance on a point-mass model, computed once: not flight software.
 */
import { E1, S1 } from '../../vehicle/spec';
import { MU_EARTH, R_EARTH, siteFrameQuaternion, sitePosition } from '../../world/frames';
import { LANDING_ZONE } from '../../world/site';
import { cdBoosterTailFirst, cdSlender } from './aero';
import { airDensity as densityAt, atmosphere as atmosphereAt } from './atmosphere';
import { gimbalAngles, groundDistance } from './ascent';
import { Craft, airVelocity, type AttitudeCmd } from './craft';
import type { Ctx } from './context';
import { elements, kepler } from './kepler';
import { ENG_S1, LANDED_NOZZLE_HEIGHT, areaOf } from './vehicle';
import { DEG, clamp, qaxisY, qconj, qlook, qrot, v3, vadd, vdot, vlen, vnorm, vperp, vscale, vsub, type V3 } from './vec';

export const RATE_FLIP = { wMax: 12 * DEG, aMax: 3 * DEG };
export const RATE_BOOSTER = { wMax: 5 * DEG, aMax: 2 * DEG };
const LD_MAX = 0.25;
const AOA_MAX = 12 * DEG;

/** Ground point in frame I at time t (pad-local east/north/up). */
export function groundPointI(e: number, n: number, u: number, t: number): V3 {
  const s = sitePosition(t);
  const q = siteFrameQuaternion(t);
  return vadd({ x: s.x, y: s.y, z: s.z }, qrot({ x: q.x, y: q.y, z: q.z, w: q.w }, v3(e, u, -n)));
}

/** Landing-zone centre (ground level) in frame I at time t. */
export const lzAt = (t: number): V3 => groundPointI(LANDING_ZONE.x, -LANDING_ZONE.z, 0, t);

/** Pad-local east/north of a frame-I point at time t. */
export function padLocal(p: V3, t: number): { e: number; n: number; u: number } {
  const s = sitePosition(t);
  const q = siteFrameQuaternion(t);
  const qi = { x: -q.x, y: -q.y, z: -q.z, w: q.w };
  const d = qrot(qi, vsub(p, { x: s.x, y: s.y, z: s.z }));
  return { e: d.x, n: -d.z, u: d.y };
}

/**
 * Vacuum ballistic impact at altitude h (m): time and frame-I position (Kepler), or null when
 * the trajectory does not come down to h within `maxT` seconds.
 */
export function vacuumImpact(r: V3, v: V3, t: number, h: number): { t: number; p: V3 } | null {
  const dt = timeToRadius(r, v, R_EARTH + h);
  if (!Number.isFinite(dt)) return null;
  return { t: t + dt, p: kepler(r, v, dt, MU_EARTH).r };
}

/** Time (s) until an elliptic two-body trajectory next descends through radius rt (NaN if never). */
export function timeToRadius(r: V3, v: V3, rt: number): number {
  const el = elements(r, v, MU_EARTH);
  if (el.e >= 1 || el.e < 1e-9) return NaN;
  const rn = vlen(r);
  const p = el.a * (1 - el.e * el.e);
  const cosT = (p / rt - 1) / el.e;
  if (cosT < -1 || cosT > 1) return NaN;
  const nuT = 2 * Math.PI - Math.acos(cosT); // descending branch
  let nu0 = Math.acos(clamp((p / rn - 1) / el.e, -1, 1));
  if (vdot(r, v) < 0) nu0 = 2 * Math.PI - nu0;
  const E = (nu: number) => {
    const x = 2 * Math.atan2(Math.sqrt(1 - el.e) * Math.sin(nu / 2), Math.sqrt(1 + el.e) * Math.cos(nu / 2));
    return x < 0 ? x + 2 * Math.PI : x;
  };
  const M = (nu: number) => {
    const e_ = E(nu);
    return e_ - el.e * Math.sin(e_);
  };
  const n = Math.sqrt(MU_EARTH / (el.a * el.a * el.a));
  let dM = M(nuT) - M(nu0);
  if (dM < 0) {
    if (rn <= rt && vdot(r, v) < 0) return 0;
    dM += 2 * Math.PI;
  }
  return dM / n;
}

/** Horizontal miss (m) of a frame-I point from the LZ at time t, in pad-local east/north. */
export function lzMiss(p: V3, t: number): { e: number; n: number } {
  const l = padLocal(p, t);
  return { e: l.e - LANDING_ZONE.x, n: l.n + LANDING_ZONE.z };
}

export interface RtlsOpts {
  /** Stage separation time (the booster craft starts here). */
  tSep: number;
  /** Aim-point bias for the boostback cutoff (pad-local metres, east/north). */
  bias: { e: number; n: number };
  record: boolean;
  /** Propellant (kg) to keep for the landing (the landing burn uses what it needs). */
  side: V3;
  /** Suborbital hop: no boostback and no entry burn. */
  hop?: boolean;
}

export interface RtlsResult {
  flipStart: number;
  boostbackStart: number;
  boostbackEnd: number;
  finsDeploy: number;
  entryStart: number;
  entryEnd: number;
  landingStart: number;
  touchdown: number;
  apogee: { t: number; alt: number };
  miss: number;
  touchdownSpeed: number;
  propLeft: number;
  tilt: number;
  maxDecel: number;
  boostbackDv: number;
  entryDv: number;
  landingDv: number;
  maxQ: number;
  ok: boolean;
  /** Miss the grid fins face at the start of the aerodynamic phase (pad-local east/north, m). */
  aeroZem: { e: number; n: number } | null;
}

const aeroTailFirst = { area: areaOf(3.7), cd: cdBoosterTailFirst };

/** Height of the nozzle-exit plane (model origin) above the ground (m). */
function originAlt(c: Craft): number {
  return vlen(c.origin()) - R_EARTH;
}

/**
 * Fly the booster from stage separation to touchdown. The craft carries the S1 groups (all
 * at zero throttle). Returns timings and the touchdown state.
 */
export function flyBoosterReturn(ctx: Ctx | null, c: Craft, o: RtlsOpts): RtlsResult {
  const center = c.group('s1.center')!;
  const outer = c.group('s1.outer')!;
  const rec = (every: number, force = false) => {
    if (!ctx || !o.record) return;
    ctx.rec(c, every, force);
    channels(ctx, c);
  };
  const res: RtlsResult = { flipStart: NaN, boostbackStart: NaN, boostbackEnd: NaN, finsDeploy: NaN, entryStart: NaN, entryEnd: NaN, landingStart: NaN, touchdown: NaN, apogee: { t: 0, alt: 0 }, miss: Infinity, touchdownSpeed: Infinity, propLeft: 0, tilt: 0, maxDecel: 0, boostbackDv: 0, entryDv: 0, landingDv: 0, maxQ: 0, ok: false, aeroZem: null };
  let phase: 'sep' | 'flip' | 'boostback' | 'coast' | 'entry' | 'aero' | 'landing' | 'done' = 'sep';
  let phaseT = c.t;
  let prevAlt = c.alt;
  let thr = 0;
  let bbDir: V3 | null = null;
  let entryFrom = 0;
  let prevFinT = -1;
  let aimFrozen: V3 | null = null;
  let back0: V3 | null = null;
  let entryV0 = 0;
  let latCmd: V3 = v3();
  let nextPred = -Infinity;
  let nextStopCheck = -Infinity;
  let nextThrottle = -Infinity;
  let vThrottle = 0.8;
  let bbV0 = 0;
  c.rcsActuator = true;
  for (let guard = 0; guard < 60000; guard++) {
    const t = c.t;
    const up = vnorm(c.r);
    const va = vsub(c.v, airVelocity(c.r));
    const vaN = vlen(va);
    const alt = c.alt || vlen(c.r) - R_EARTH;
    let att: AttitudeCmd | null = null;
    let dt = 0.2;
    c.lift = v3();
    // ── phase logic
    if (phase === 'sep') {
      // hold attitude while the upper stage moves clear
      dt = 0.25;
      if (t >= o.tSep + (o.hop ? 4 : 6)) {
        phase = 'flip';
        phaseT = t;
        res.flipStart = t;
      }
    }
    if (phase === 'flip') {
      dt = 0.25;
      if (o.hop) {
        // suborbital: turn tail-down (nose up, engines toward the ground) for the descent
        att = { q: qlook(up, o.side), ...RATE_BOOSTER, tau: 2 };
        if (t - phaseT > 12) {
          phase = 'coast';
          phaseT = t;
          res.boostbackStart = res.boostbackEnd = t;
          res.finsDeploy = t + 2;
        }
      } else {
        bbDir = boostbackDirection(c, o.bias);
        att = { q: qlook(bbDir, o.side), ...RATE_FLIP, tau: 1.2 };
        const err = Math.acos(clamp(vdot(qaxisY(c.q), bbDir), -1, 1));
        if ((err < 2 * DEG && vlen(c.w) < 1 * DEG) || t - phaseT > 40) {
          phase = 'boostback';
          phaseT = t;
          res.boostbackStart = t;
          c.rcsActuator = false;
        }
      }
    } else if (phase === 'boostback') {
      dt = 0.2;
      outer.n = 2;
      if (!back0) back0 = vnorm(vperp(bbHoriz(c), up));
      const rem = remainingAfterTail(c, o.bias, back0);
      if (rem.d > 25_000 || !aimFrozen) {
        bbDir = boostbackDirection(c, o.bias);
        if (rem.d < 25_000) aimFrozen = bbDir;
      } else bbDir = aimFrozen;
      att = { q: qlook(bbDir!, o.side), ...RATE_BOOSTER, tau: 1.5 };
      const ramp = clamp((t + dt - phaseT) / 1.5, 0, 1);
      // throttle down to hold about 4.5 g as the booster lightens
      const lim = clamp((44 * c.mass) / (3 * ENG_S1.thrustVac), E1.minThrottle, 1);
      thr = Math.min(ramp, lim);
      center.next = thr;
      outer.next = thr;
      const snap = c.snapshot();
      c.step(dt, att);
      const rem1 = remainingAfterTail(c, o.bias, back0);
      if (rem1.along <= 0 && t - phaseT > 3) {
        // cut off exactly where the impact point (after the shutdown transient) reaches the aim
        const f = clamp(rem.along / (rem.along - rem1.along), 0, 1);
        c.restore(snap);
        center.next = snap.thr[c.groups.indexOf(center)][0] + (thr - snap.thr[c.groups.indexOf(center)][0]) * f;
        outer.next = center.next;
        if (f * dt > 1e-6) c.step(f * dt, att);
        // shutdown transient
        const from = center.thr;
        for (let k = 1; k <= 6; k++) {
          center.next = from * (1 - k / 6);
          outer.next = center.next;
          c.step(BB_TAIL / 6, att);
          res.boostbackDv += thrustAcc(c) * (BB_TAIL / 6);
          rec(0.25);
        }
        phase = 'coast';
        phaseT = c.t;
        res.boostbackEnd = c.t;
        res.finsDeploy = c.t + 4;
        thr = 0;
        c.rcsActuator = true;
        continue;
      }
      res.boostbackDv += thrustAcc(c) * dt;
      if (c.q_dyn > res.maxQ) res.maxQ = c.q_dyn;
      rec(0.25);
      continue;
    }
    if (phase === 'coast') {
      dt = alt > 90_000 ? 0.5 : 0.25;
      // reorient tail first (engines toward the airflow) and wait for the entry trigger
      att = { q: qlook(vnorm(vscale(va, -1)), o.side), ...RATE_BOOSTER, tau: 2 };
      thr = Math.max(0, thr - dt / 0.8);
      if (alt > prevAlt && alt > res.apogee.alt) res.apogee = { t, alt };
      const descending = vdot(c.v, up) < 0;
      if (!o.hop && descending && alt < 64_000) {
        phase = 'entry';
        phaseT = t;
        res.entryStart = t;
        entryV0 = vaN;
        c.rcsActuator = false;
      }
      if (o.hop && descending && alt < 45_000) {
        phase = 'aero';
        phaseT = t;
        res.entryStart = res.entryEnd = t;
        c.aero = aeroTailFirst;
      }
    } else if (phase === 'entry') {
      dt = 0.1;
      outer.n = 2;
      c.aero = aeroTailFirst;
      att = { q: qlook(vnorm(vscale(va, -1)), o.side), ...RATE_BOOSTER, tau: 1.5 };
      const up_ = clamp((t + dt - phaseT) / 1.2, 0, 1);
      if (!entryFrom) {
        thr = up_ * 0.62;
        if (vaN <= ENTRY_END_SPEED) {
          entryFrom = t;
        }
      } else thr = Math.max(0, 0.62 * (1 - (t + dt - entryFrom) / 0.8));
      if (entryFrom && thr <= 0) {
        phase = 'aero';
        phaseT = t;
        res.entryEnd = t;
        res.entryDv = entryV0 - vaN;
      }
    }
    if (phase === 'aero') {
      dt = 0.1;
      c.aero = aeroTailFirst;
      thr = 0;
      // lateral steering: every second, predict the unsteered (drag-only) touchdown point and
      // command a lift acceleration that moves it onto the LZ (limited by L/D 0.25)
      const drag = (c.q_dyn * cdBoosterTailFirst(c.mach) * aeroTailFirst.area) / c.mass;
      if (t >= nextPred) {
        // zero-effort miss / zero-effort velocity toward the state wanted at landing-burn
        // ignition: over the LZ with no horizontal velocity, predicted drag-only
        nextPred = t + 1.0;
        const pr = predictTouchdown(c, IGNITION_ALT);
        const tgo = pr.t - t;
        if (tgo > 2) {
          // the landing burn then carries the remaining horizontal velocity while killing it
          // (about linearly over a burn of ~2h/vz): aim that end point at the LZ, and damp the
          // horizontal velocity a little so the burn can absorb it
          const upP = vnorm(pr.p);
          const vhI = vperp(vsub(pr.v, airVelocity(pr.p)), upP);
          const vzI = Math.max(50, -vdot(pr.v, upP));
          const tBurn = (2 * IGNITION_ALT) / vzI;
          const end = vadd(pr.p, vscale(vhI, tBurn / 2));
          const zem = vperp(vsub(lzAt(pr.t), end), upP);
          latCmd = vperp(vadd(vscale(zem, 3 / (tgo * tgo)), vscale(vhI, -0.4 / tgo)), up);
          if (!res.aeroZem) {
            const qs = siteFrameQuaternion(t);
            const q = { x: qs.x, y: qs.y, z: qs.z, w: qs.w };
            res.aeroZem = { e: vdot(zem, qrot(q, v3(1, 0, 0))), n: -vdot(zem, qrot(q, v3(0, 0, 1))) };
          }
          if (DEBUG.on) DEBUG.log(`aero2 t ${t.toFixed(1)} zem ${vlen(zem).toFixed(0)} vhI ${vlen(vhI).toFixed(1)} tBurn ${tBurn.toFixed(1)} vh ${vlen(vperp(va, up)).toFixed(1)} dist ${vlen(vperp(vsub(lzAt(t), c.r), up)).toFixed(0)}`);
        }
        if (DEBUG.on) DEBUG.log(`aero t ${t.toFixed(1)} alt ${(alt / 1000).toFixed(1)} v ${vaN.toFixed(0)} drag ${(drag / 9.81).toFixed(2)}g tgo ${tgo.toFixed(1)} cmd ${vlen(latCmd).toFixed(2)} lim ${(LD_MAX * drag).toFixed(2)}`);
      }
      const back = vnorm(vscale(va, -1));
      const aLat = vperp(latCmd, back);
      const lim = LD_MAX * drag;
      const n = vlen(aLat);
      const lift = n > lim ? vscale(aLat, lim / n) : aLat;
      c.lift = lift;
      // angle of attack that produces it (tail first: the nose leans away from the lift direction)
      const aoa = lim > 1e-6 ? AOA_MAX * clamp(vlen(lift) / lim, 0, 1) : 0;
      const nose = vlen(lift) > 1e-9 ? vnorm(vadd(vscale(back, Math.cos(aoa)), vscale(vnorm(lift), -Math.sin(aoa)))) : back;
      att = { q: qlook(nose, o.side), ...RATE_BOOSTER, tau: 1.2 };
      if (ctx && o.record && t - prevFinT >= 0.5) {
        const sgn = vlen(lift) > 1e-9 && vdot(lift, qrot(c.q, v3(1, 0, 0))) < 0 ? -1 : 1;
        ctx.ch.key('s1.finDeflect', t, sgn * (aoa / AOA_MAX) * 15);
        prevFinT = t;
      }
      // landing-burn ignition at the last moment a burn at 78 % throttle on the centre engine
      // still stops the booster at the landing height (stop height vs ignition time is not
      // monotonic high up, where drag would do the work for free, so test "now" against "in 1 s")
      const h = originAlt(c) - LANDED_NOZZLE_HEIGHT;
      const vz = -vdot(c.v, up);
      if (h < 20_000 && vz > 0 && t >= nextStopCheck) {
        const later = coastAhead(c, 1.0);
        const shLater = stopHeight(c, IGNITION_THROTTLE, later.h - LANDED_NOZZLE_HEIGHT, later.vz, later.m);
        if (DEBUG.on) DEBUG.log(`stopcheck t ${t.toFixed(1)} h ${h.toFixed(0)} vz ${vz.toFixed(0)} later ${shLater.toFixed(0)}`);
        nextStopCheck = shLater > 2000 ? t + 0.5 : t;
        if (shLater <= 0) {
          phase = 'landing';
          phaseT = t;
          res.landingStart = t;
          outer.n = 0;
          c.lift = v3();
        }
      }
    }
    if (phase === 'landing') {
      dt = 0.05;
      const h = Math.max(0.01, originAlt(c) - LANDED_NOZZLE_HEIGHT);
      const vz = -vdot(c.v, up);
      const m = c.mass;
      const lz = lzAt(t);
      const dr = vperp(vsub(c.origin(), lz), up);
      const vh = vperp(c.v, up);
      const vhRel = vsub(vh, vperp(airVelocity(c.r), up));
      // vertical: above 150 m pick the throttle whose predicted stop (with the fading drag)
      // lands on the ground; below, constant deceleration to zero speed at the ground
      let aUp: number;
      const dragNow = (c.q_dyn * cdBoosterTailFirst(c.mach) * aeroTailFirst.area) / m;
      if (h > 150) {
        if (t >= nextThrottle) {
          nextThrottle = t + 0.5;
          const ramp0 = clamp((t - phaseT) / 1.0, 0, 1);
          let lo = E1.minThrottle;
          let hi = 1;
          if (stopHeight(c, lo, h, vz, m, ramp0) <= 0) {
            for (let k = 0; k < 7; k++) {
              const mid = (lo + hi) / 2;
              if (stopHeight(c, mid, h, vz, m, ramp0) > 0) hi = mid;
              else lo = mid;
            }
            vThrottle = hi;
          } else vThrottle = lo;
        }
        aUp = (vThrottle * ENG_S1.thrustVac - c.pAmb * ENG_S1.area) / m;
      } else {
        aUp = (vz * vz - TOUCHDOWN_SPEED * TOUCHDOWN_SPEED) / (2 * h) + 9.81 - dragNow;
      }
      // horizontal: zero-effort-miss / zero-effort-velocity law (the energy-optimal polynomial
      // guidance), a = -6 (r - r_LZ) / tgo^2 - 4 v / tgo, aimed at a gate 40 m above the LZ with
      // no horizontal velocity; the time to go comes from the vertical profile. Below the gate a
      // critically damped position/velocity hold keeps the booster over the pad centre.
      const H_GATE = 40;
      let aH: V3;
      if (h > H_GATE + 5) {
        const aV = Math.max(0.5, (vz * vz - TOUCHDOWN_SPEED * TOUCHDOWN_SPEED) / (2 * h));
        const vGate = Math.sqrt(TOUCHDOWN_SPEED * TOUCHDOWN_SPEED + 2 * aV * H_GATE);
        const tgoH = Math.max(2, (2 * (h - H_GATE)) / Math.max(1, vz + vGate));
        aH = vsub(vscale(dr, -6 / (tgoH * tgoH)), vscale(vhRel, 4 / tgoH));
      } else aH = vsub(vscale(dr, -0.5), vscale(vhRel, 1.4));
      if (vlen(aH) > 6) aH = vscale(vnorm(aH), 6);
      let aT = vadd(vscale(up, Math.max(0, aUp)), aH);
      // allowed tilt tapers near the ground so the booster stands upright at contact; the body
      // slews at up to 8 deg/s and the centre engine gimbals a further 5 deg
      const tiltMax = DEG * (h > 300 ? 16 : h > 40 ? 8 + (8 * (h - 40)) / 260 : 1.5 + (6.5 * h) / 40);
      const tilt = Math.acos(clamp(vdot(vnorm(aT), up), -1, 1));
      if (tilt > tiltMax) {
        const hor = vnorm(aH);
        aT = vadd(vscale(up, Math.max(0, aUp)), vscale(hor, Math.max(0, aUp) * Math.tan(tiltMax)));
      }
      const Tmax = ENG_S1.thrustVac - c.pAmb * ENG_S1.area;
      const ramp = clamp((t + dt - phaseT) / 1.0, 0, 1);
      let th = (vlen(aT) * m + c.pAmb * ENG_S1.area) / ENG_S1.thrustVac;
      th = clamp(th, E1.minThrottle, 1);
      thr = ramp < 1 ? Math.max(ramp * E1.minThrottle, Math.min(th, ramp)) : th;
      void Tmax;
      void bbV0;
      att = { q: qlook(vnorm(aT), o.side), wMax: 8 * DEG, aMax: 6 * DEG, tau: 0.5 };
      // thrust vector control: the centre engine gimbals (up to its range) toward the command
      // while the body follows more slowly
      {
        const db = qrot(qconj(c.q), vnorm(aT));
        const ang = Math.acos(clamp(db.y, -1, 1));
        const lim = E1.gimbalRangeDeg * DEG;
        center.dirBody = ang > lim ? vnorm(vadd(v3(0, Math.cos(lim), 0), vscale(vnorm(v3(db.x, 0, db.z)), Math.sin(lim)))) : db;
      }
      if (DEBUG.on) DEBUG.log(`land t ${t.toFixed(2)} h ${h.toFixed(1)} vz ${vz.toFixed(1)} aUp ${aUp.toFixed(1)} th ${th.toFixed(3)} thr ${thr.toFixed(3)} m ${m.toFixed(0)} drag ${(c.q_dyn * cdBoosterTailFirst(c.mach) * aeroTailFirst.area / m).toFixed(1)} dr ${vlen(dr).toFixed(1)} vh ${vlen(vhRel).toFixed(1)} tilt ${(Math.acos(clamp(vdot(vnorm(aT), up), -1, 1)) / DEG).toFixed(1)}`);
      if (h <= 0.02 || (vz < 0 && t - phaseT > 2)) {
        phase = 'done';
      }
    }
    if (phase === 'done') break;
    center.next = phase === 'landing' || phase === 'boostback' || phase === 'entry' || thr > 0 ? thr : 0;
    outer.next = phase === 'landing' ? 0 : phase === 'boostback' || phase === 'entry' || thr > 0 ? thr : 0;
    if (phase === 'landing') outer.thr = 0;
    prevAlt = alt;
    c.step(dt, att);
    if (phase === 'landing') res.landingDv += thrustAcc(c) * dt;
    if (c.q_dyn > res.maxQ) res.maxQ = c.q_dyn;
    const dec = c.sensed;
    if (phase === 'aero' || phase === 'coast') res.maxDecel = Math.max(res.maxDecel, dec);
    if ((c.tanks.s1 ?? 0) < 0) {
      res.ok = false;
      break;
    }
    rec(phase === 'coast' && alt > 80_000 ? 1.0 : phase === 'landing' ? 0.25 : 0.5, false);
    if (alt < -1000 || t > o.tSep + 1500) break;
  }
  // touchdown bookkeeping: interpolate to the ground contact
  const up = vnorm(c.r);
  res.touchdown = c.t;
  res.touchdownSpeed = vlen(vsub(c.v, airVelocity(c.r)));
  const miss = lzMiss(c.origin(), c.t);
  res.miss = Math.hypot(miss.e, miss.n);
  res.propLeft = c.tanks.s1 ?? 0;
  res.tilt = Math.acos(clamp(vdot(qaxisY(c.q), up), -1, 1));
  res.ok = res.miss < 10 && res.touchdownSpeed < 2.5 && res.propLeft >= 0;
  center.dirBody = undefined;
  if (ctx && o.record) {
    center.next = 0;
    outer.next = 0;
    center.thr = 0;
    outer.thr = 0;
    ctx.rec(c, 0, true);
    channels(ctx, c);
  }
  return res;
}

export const ENTRY_END_SPEED = 600;
/** Throttle assumed when timing the landing-burn ignition (the rest is control margin). */
export const IGNITION_THROTTLE = 0.9;
/** Altitude (m) at which the grid-fin phase aims to be over the LZ with no horizontal speed. */
export const IGNITION_ALT = 4500;
/** Vertical speed aimed for at leg contact (m/s). */
export const TOUCHDOWN_SPEED = 1.0;
export const DEBUG = { on: false, log: (_s: string) => {} };

/**
 * Height (m above the landing height) at which the vertical speed would reach zero if the
 * centre engine were lit now at throttle `th` (1 s ignition ramp), with drag; negative if the
 * booster would reach the ground first.
 */
export function stopHeight(c: Craft, th: number, h0: number, vz0: number, m0?: number, ramp0 = 0): number {
  let h = h0;
  let vz = vz0;
  let m = m0 ?? c.mass;
  const comOff = c.alt - originAlt(c);
  const dt = 0.1;
  let a = atmosphereAt(Math.max(0, h + LANDED_NOZZLE_HEIGHT + comOff));
  for (let i = 0; i < 1200; i++) {
    if (i % 5 === 0) a = atmosphereAt(Math.max(0, h + LANDED_NOZZLE_HEIGHT + comOff));
    const ramp = Math.min(1, ramp0 + (i * dt) / 1.0);
    const thr = Math.max(E1.minThrottle * ramp, th * ramp);
    const T = Math.max(0, thr * ENG_S1.thrustVac - a.pressure * ENG_S1.area);
    const drag = (0.5 * a.density * vz * vz * cdBoosterTailFirst(vz / a.speedOfSound) * aeroTailFirst.area) / m;
    const acc = T / m + drag - 9.81; // upward
    const vzN = vz - acc * dt;
    if (vzN <= 0) return h - (vz * vz) / (2 * Math.max(1e-6, acc)) * 0 - (vz * dt) / 2;
    h -= (vz + vzN) * 0.5 * dt;
    vz = vzN;
    m -= ENG_S1.mdot * thr * dt;
    if (h <= 0) return -vz;
  }
  return h;
}

/** Vertical state after coasting `dt` seconds with drag (for the ignition test). */
function coastAhead(c: Craft, dt: number): { h: number; vz: number; m: number } {
  let h = originAlt(c);
  let vz = -vdot(c.v, vnorm(c.r));
  const m = c.mass;
  const n = Math.ceil(dt / 0.05);
  const hh = dt / n;
  for (let i = 0; i < n; i++) {
    const a = atmosphereAt(Math.max(0, h + (c.alt - originAlt(c))));
    const drag = (0.5 * a.density * vz * vz * cdBoosterTailFirst(vz / a.speedOfSound) * aeroTailFirst.area) / m;
    vz += (9.81 - drag) * hh;
    h -= vz * hh;
  }
  return { h, vz, m };
}

/** Drag-only ballistic prediction of where the origin reaches the landing height (coarse Euler, 0.5 s). */
export function predictTouchdown(c: Craft, stopAlt = 0): { t: number; p: V3; v: V3 } {
  let r = { ...c.r };
  let v = { ...c.v };
  let t = c.t;
  const m = c.mass;
  const off = vlen(c.r) - vlen(c.origin()) + LANDED_NOZZLE_HEIGHT + stopAlt;
  for (let i = 0; i < 1200; i++) {
    const rn = vlen(r);
    const alt = rn - R_EARTH;
    if (alt <= off) break;
    const h = alt > 20_000 ? 1.0 : 0.5;
    const va = vsub(v, airVelocity(r));
    const van = vlen(va);
    const rho = densityAt(alt);
    const a = vadd(vscale(r, -MU_EARTH / (rn * rn * rn)), vscale(va, (-0.5 * rho * van * cdBoosterTailFirst(van / 300) * aeroTailFirst.area) / m));
    v = vadd(v, vscale(a, h));
    r = vadd(r, vscale(v, h));
    t += h;
  }
  return { t, p: r, v };
}

function thrustAcc(c: Craft): number {
  let F = 0;
  for (const g of c.groups) F += g.n * Math.max(0, g.thr * g.eng.thrustVac - c.pAmb * g.eng.area);
  return F / c.mass;
}

const BB_TAIL = 0.6;

/**
 * How far (m, along the fixed return axis) the predicted vacuum impact still has to move to
 * reach the aim point, if the engines were shut down now (the shutdown transient's impulse
 * included).
 */
function remainingAfterTail(c: Craft, bias: { e: number; n: number }, back: V3): { along: number; d: number } {
  let F = 0;
  for (const g of c.groups) F += g.n * Math.max(0, g.thr * g.eng.thrustVac - c.pAmb * g.eng.area);
  const v = vadd(c.v, vscale(qaxisY(c.q), ((F / c.mass) * BB_TAIL) / 2));
  const imp = vacuumImpact(c.r, v, c.t, 0);
  if (!imp) return { along: Infinity, d: Infinity };
  const d = vsub(aimPoint(bias, imp.t), imp.p);
  return { along: vdot(d, back), d: vlen(d) };
}

/** Horizontal part of the air-relative velocity (for the along-return direction). */
function bbHoriz(c: Craft): V3 {
  const up = vnorm(c.r);
  const h = vperp(vsub(c.v, airVelocity(c.r)), up);
  return vlen(h) > 1 ? vscale(h, -1) : v3(-1, 0, 0);
}

/** Aim point (frame I, ground level) at time t: the LZ plus the bias. */
function aimPoint(bias: { e: number; n: number }, t: number): V3 {
  return groundPointI(-600 + bias.e, -8600 + bias.n, 0, t);
}

/**
 * Boostback thrust direction: horizontal toward where the impact point must move (from the
 * predicted vacuum impact to the aim point), tilted 8 deg up.
 */
function boostbackDirection(c: Craft, bias: { e: number; n: number }): V3 {
  const up = vnorm(c.r);
  const imp = vacuumImpact(c.r, c.v, c.t, 0);
  let h: V3;
  if (imp) h = vperp(vsub(aimPoint(bias, imp.t), imp.p), up);
  else h = bbHoriz(c);
  if (vlen(h) < 1) h = bbHoriz(c);
  const hn = vnorm(h);
  const e = 8 * DEG;
  return vnorm(vadd(vscale(hn, Math.cos(e)), vscale(up, Math.sin(e))));
}

/** Booster channels while returning. */
function channels(ctx: Ctx, c: Craft) {
  const t = c.t;
  const center = c.group('s1.center');
  const outer = c.group('s1.outer');
  ctx.ch.key('s1.center.throttle', t, center ? center.thr : 0);
  // per-engine throttle of the lit outer engines (two opposite ones for the three-engine burns)
  ctx.ch.key('s1.outer.throttle', t, outer && outer.n > 0 ? outer.thr : 0);
  const frac = Math.max(0, c.tanks.s1 ?? 0) / S1.propellant;
  ctx.ch.key('s1.lox', t, frac);
  ctx.ch.key('s1.rp1', t, frac);
  const burning = (center?.thr ?? 0) + (outer?.thr ?? 0) > 0.02;
  if (burning) {
    const g = gimbalAngles(c, 2.3, 44.4);
    ctx.ch.key('s1.gimbalPitch', t, clamp(g.pitch, -E1.gimbalRangeDeg, E1.gimbalRangeDeg));
    ctx.ch.key('s1.gimbalYaw', t, clamp(g.yaw, -E1.gimbalRangeDeg, E1.gimbalRangeDeg));
  } else {
    ctx.ch.key('s1.gimbalPitch', t, 0);
    ctx.ch.key('s1.gimbalYaw', t, 0);
  }
  const rcs = c.rcsActuator && !burning ? clamp(vlen(c.alpha) / (2 * DEG), 0, 1) : 0;
  ctx.ch.key('s1.rcs', t, rcs);
  // entry heating glow (illustrative): convective heating scales with sqrt(rho) v^3; only while
  // falling back tail first through the upper atmosphere
  const up = vnorm(c.r);
  const va = vsub(c.v, airVelocity(c.r));
  const falling = vdot(c.v, up) < 0 && c.alt < 90_000;
  const heat = falling ? (Math.sqrt(densityAt(Math.max(0, c.alt))) * vlen(va) ** 3) / 4.5e7 : 0;
  ctx.ch.key('s1.entryGlow', t, clamp(heat, 0, 1));
}

export { cdSlender, groundDistance };
