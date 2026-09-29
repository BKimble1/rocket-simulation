/**
 * Booster recovery hardware: four carbon-fibre landing legs with telescoping deploy struts and
 * pivoting foot pads, four titanium grid fins (fold hinge + steering shaft), and the nitrogen
 * cold-gas thruster pods on the forward skirt.
 */
import * as THREE from 'three';
import { BODY_RADIUS as R, LEGS, GRID_FINS } from '../../vehicle/spec';
import type { Ctx } from './ctx';
import type { Section } from './kit';
import { AZ } from './layout';
import { radialFrame, loft, bevelBox, rod, mergeAll, lathe, polar, type P2 } from './geom';
import { RigInstances, azimuthCopies } from './instancing';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// ───────────────────────────── landing legs ─────────────────────────────

const HINGE_R = R + 0.12;

/** Leg cross-section (a C-channel whose open side faces the body) at station s along the leg. */
function legSection(s: number, L: number, n: number): P2[] {
  const u = s / L;
  const w = 0.92 - 0.42 * u; // tangential width
  let d = 0.3 - 0.13 * u; // depth
  if (u > 0.93) d *= 1 - (u - 0.93) * 6; // taper into the tip
  const t = 0.022;
  const zBody = (x: number) => -HINGE_R + Math.sqrt(R * R - x * x) + 0.018;
  const pts: P2[] = [];
  // outer skin: superellipse arch from -w/2 to +w/2
  for (let i = 0; i <= n; i++) {
    const a = Math.PI * (1 - i / n);
    const x = (w / 2) * Math.cos(a);
    const z = zBody(x) + d * Math.pow(Math.max(0, Math.sin(a)), 0.35);
    pts.push([x, z]);
  }
  // inner flange (right), channel inside, inner flange (left)
  const xr = w / 2 - 0.004;
  pts.push([xr, zBody(xr)], [xr - 0.09, zBody(xr - 0.09)], [xr - 0.09, zBody(xr - 0.09) + t]);
  const xc = xr - 0.095;
  for (let i = n - 1; i >= 1; i--) {
    const a = Math.PI * (1 - i / n);
    const x = Math.max(-xc, Math.min(xc, (w / 2 - t) * Math.cos(a)));
    const z = zBody(x) + Math.max(t + 0.004, (d - t) * Math.pow(Math.max(0, Math.sin(a)), 0.35));
    pts.push([x, z]);
  }
  const xl = -xr;
  pts.push([xl + 0.09, zBody(xl + 0.09) + t], [xl + 0.09, zBody(xl + 0.09)], [xl, zBody(xl)]);
  return pts;
}

function legs(ctx: Ctx, s: Section) {
  const { kit } = ctx;
  const L = LEGS.stowedLength;
  const n = kit.hangar ? 14 : 8;
  // one posable template leg at the first azimuth; the other three are instances of it
  for (const phi of AZ.legs.slice(0, 1)) {
    const hinge = new THREE.Group();
    hinge.name = 'leg-hinge';
    radialFrame(HINGE_R, phi, LEGS.hingeY).decompose(hinge.position, hinge.quaternion, hinge.scale);
    s.group.add(hinge);
    kit.own(hinge, 'booster');
    const leg = new THREE.Group();
    leg.name = 'leg';
    hinge.add(leg);
    kit.own(leg, 'booster');
    // body fittings: hinge clevis on the skirt (fixed)
    const fit = { part: 'landing-legs' as const, mat: 'al-2219' as const, look: 'titanium', cut: true };
    const clevis = bevelBox(0.62, 0.36, 0.14, 0.02);
    clevis.translate(0, 0.02, -0.07);
    kit.add(hinge, clevis, fit);
    const pin = new THREE.CylinderGeometry(0.05, 0.05, 0.7, 16);
    pin.rotateZ(Math.PI / 2);
    kit.add(hinge, pin, { ...fit, look: 'stainless', mat: 'stainless' });
    // strut anchor fitting on the body
    const B = V(0, 1.2, -0.06);
    const ba = bevelBox(0.2, 0.22, 0.1, 0.015);
    ba.translate(0, 1.2, -0.08);
    kit.add(hinge, ba, fit);

    // the leg: lofted C-channel with a closed tip and a hinge lug
    const stations: number[] = [];
    const steps = kit.hangar ? 22 : 10;
    for (let i = 0; i <= steps; i++) stations.push(0.08 + ((L - 0.08) * i) / steps);
    const secs = stations.map((st) => legSection(st, L, n));
    const frames = stations.map((st) => ({ o: V(0, st, 0), ax: V(1, 0, 0), az: V(0, 0, 1) }));
    kit.add(leg, loft(secs, frames), { part: 'landing-legs', mat: 'cfrp-sandwich', look: 'legCarbon', cut: true });
    const lug = bevelBox(0.3, 0.3, 0.12, 0.02);
    lug.translate(0, 0.12, -0.02);
    kit.add(leg, lug, { ...fit, look: 'aluMilled' });
    // mid-leg attach fitting for the strut
    const P = V(0, 4.0, 0.0);
    const pf = bevelBox(0.18, 0.2, 0.1, 0.015);
    pf.translate(0, 4.0, 0.02);
    kit.add(leg, pf, { ...fit, look: 'aluMilled' });

    // foot pad: crushable-honeycomb disc on a pivot at the tip
    const pad = new THREE.Group();
    pad.name = 'leg-pad';
    pad.position.set(0, L - 0.05, 0.02);
    leg.add(pad);
    kit.own(pad, 'booster');
    const padG = lathe(
      [
        [0, 0.02],
        [0.36, 0.02],
        [0.42, 0.06],
        [0.42, 0.13],
        [0.38, 0.16],
        [0, 0.16],
      ],
      { seg: kit.seg.small * 2, smooth: 40 },
    );
    kit.add(pad, padG, { part: 'landing-legs', mat: 'al-2219', look: 'foot', cut: true });
    const knuckle = new THREE.CylinderGeometry(0.06, 0.06, 0.3, 14);
    knuckle.rotateZ(Math.PI / 2);
    kit.add(pad, knuckle, { ...fit, look: 'aluMilled' });

    // telescoping deploy strut (outer cylinder from B, inner rod from P)
    const outer = new THREE.Group();
    const inner = new THREE.Group();
    hinge.add(outer, inner);
    kit.own(outer, 'booster');
    kit.own(inner, 'booster');
    const oc = new THREE.CylinderGeometry(0.075, 0.075, 2.7, kit.seg.small);
    oc.translate(0, 1.35, 0);
    const oe = new THREE.SphereGeometry(0.085, 12, 8);
    kit.add(outer, mergeAll([oc, oe]), { part: 'landing-legs', mat: 'al-2219', look: 'aluMilled', cut: true });
    const ic = new THREE.CylinderGeometry(0.05, 0.05, 2.6, kit.seg.small);
    ic.translate(0, 1.3, 0);
    const ie = new THREE.SphereGeometry(0.065, 12, 8);
    kit.add(inner, mergeAll([ic, ie]), { part: 'landing-legs', mat: 'stainless', look: 'stainless', cut: true });
    ctx.movers.legs.push({ hinge, leg, pad, strutOuter: outer, strutInner: inner, B, P });
    ctx.movers.inst.legs = new RigInstances(kit, s.group, [hinge], azimuthCopies(AZ.legs));
  }
}

const _up = new THREE.Vector3(0, 1, 0);
const _x = new THREE.Vector3(1, 0, 0);
const _p = new THREE.Vector3();
const _d = new THREE.Vector3();

/** Pose the legs for deployment fraction u (0 stowed, 1 deployed). No allocations. */
export function poseLegs(ctx: Ctx, u: number) {
  const th = (u * LEGS.deployedAngleDeg * Math.PI) / 180;
  for (const g of ctx.movers.legs) {
    g.leg.rotation.x = th;
    // the pad counter-rotates so it lands flat
    g.pad.rotation.x = (u * (180 - LEGS.deployedAngleDeg) * Math.PI) / 180;
    // telescoping strut: outer cylinder anchored on the body at B, rod anchored on the leg at P
    _p.copy(g.P).applyAxisAngle(_x, th);
    _d.copy(_p).sub(g.B).normalize();
    g.strutOuter.position.copy(g.B);
    g.strutOuter.quaternion.setFromUnitVectors(_up, _d);
    g.strutInner.position.copy(_p);
    g.strutInner.quaternion.setFromUnitVectors(_up, _d.negate());
  }
  ctx.movers.inst.legs?.update();
}

// ───────────────────────────── grid fins ─────────────────────────────

function finPanel(kit: Ctx['kit']): THREE.BufferGeometry {
  const W = GRID_FINS.width;
  const Hh = GRID_FINS.height;
  const y0 = 0.08;
  const y1 = y0 + Hh;
  const depth = 0.22;
  const list: THREE.BufferGeometry[] = [];
  const bar = (w: number, h: number, x: number, y: number, d = depth) => {
    const g = bevelBox(w, h, d, Math.min(0.006, w / 3, h / 3));
    g.translate(x, y, 0);
    list.push(g);
  };
  const fw = 0.04;
  bar(fw, Hh, -W / 2 + fw / 2, (y0 + y1) / 2);
  bar(fw, Hh, W / 2 - fw / 2, (y0 + y1) / 2);
  bar(W, fw, 0, y1 - fw / 2);
  bar(W, 0.06, 0, y0 + 0.03, depth + 0.02);
  // lattice: plates at +-45 deg clipped to the frame interior
  const xi0 = -W / 2 + fw;
  const xi1 = W / 2 - fw;
  const yi0 = y0 + 0.06;
  const yi1 = y1 - fw;
  const pitch = kit.hangar ? 0.1 : 0.14;
  const t = 0.007;
  for (const sgn of [1, -1]) {
    // lines: y = sgn * x + c
    const cMin = yi0 - Math.max(sgn * xi0, sgn * xi1);
    const cMax = yi1 - Math.min(sgn * xi0, sgn * xi1);
    for (let c = cMin + pitch / 2; c < cMax; c += pitch) {
      // intersect the line with the rectangle
      const pts: [number, number][] = [];
      for (const x of [xi0, xi1]) {
        const y = sgn * x + c;
        if (y >= yi0 && y <= yi1) pts.push([x, y]);
      }
      for (const y of [yi0, yi1]) {
        const x = (y - c) * sgn;
        if (x >= xi0 && x <= xi1) pts.push([x, y]);
      }
      if (pts.length < 2) continue;
      const [a, b] = pts;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 0.02) continue;
      const g = new THREE.BoxGeometry(len, t, depth * 0.86);
      g.rotateZ(Math.atan2(b[1] - a[1], b[0] - a[0]));
      g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0);
      list.push(g);
    }
  }
  return mergeAll(list);
}

function fins(ctx: Ctx, s: Section) {
  const { kit } = ctx;
  const hr = R + 0.125;
  const panel = finPanel(kit);
  if (kit.hangar)
    for (const phi of AZ.fins) {
      // hydraulic actuator unit inside the skirt
      const act = bevelBox(0.3, 0.26, 0.18, 0.02);
      kit.add(s.group, act, { part: 'grid-fins', mat: 'titanium', look: 'aluDark', internal: true, cut: true }, radialFrame(R - 0.16, phi, 37.0));
    }
  // one posable template fin at the first azimuth; the other three are instances of it
  for (const phi of AZ.fins.slice(0, 1)) {
    const hinge = new THREE.Group();
    radialFrame(hr, phi, GRID_FINS.hingeY).decompose(hinge.position, hinge.quaternion, hinge.scale);
    s.group.add(hinge);
    kit.own(hinge, 'booster');
    const fold = new THREE.Group();
    const deflect = new THREE.Group();
    hinge.add(fold);
    fold.add(deflect);
    kit.own(fold, 'booster');
    kit.own(deflect, 'booster');
    kit.add(deflect, panel.clone(), { part: 'grid-fins', mat: 'titanium', look: 'finTi', cut: true });
    // root fitting on the steering shaft
    const root = new THREE.CylinderGeometry(0.06, 0.07, 0.16, 16);
    root.translate(0, 0.02, 0);
    kit.add(deflect, root, { part: 'grid-fins', mat: 'titanium', look: 'titanium', cut: true });
    // actuator housing and hinge clevis on the forward skirt (fixed)
    const hs = { part: 'grid-fins' as const, mat: 'titanium' as const, look: 'paint', cut: true };
    const housing = bevelBox(0.44, 0.5, 0.13, 0.03);
    housing.translate(0, -0.2, -0.07);
    kit.add(hinge, housing, hs);
    const clev = bevelBox(0.3, 0.12, 0.16, 0.02);
    clev.translate(0, -0.01, -0.02);
    kit.add(hinge, clev, { ...hs, look: 'titanium' });
    const shaft = new THREE.CylinderGeometry(0.035, 0.035, 0.36, 12);
    shaft.rotateZ(Math.PI / 2);
    kit.add(hinge, shaft, { ...hs, look: 'stainless', mat: 'titanium' });
    ctx.movers.fins.push({ fold, deflect });
    ctx.movers.inst.fins = new RigInstances(kit, s.group, [hinge], azimuthCopies(AZ.fins));
  }
  panel.dispose();
}

export function poseFins(ctx: Ctx, deploy: number, deflectDeg: number) {
  const f = Math.max(0, Math.min(1, deploy));
  const d = (Math.max(-GRID_FINS.maxDeflectionDeg, Math.min(GRID_FINS.maxDeflectionDeg, deflectDeg)) * Math.PI) / 180;
  for (const g of ctx.movers.fins) {
    g.fold.rotation.x = (f * Math.PI) / 2;
    g.deflect.rotation.y = d * f;
  }
  ctx.movers.inst.fins?.update();
}

// ───────────────────────────── cold-gas RCS ─────────────────────────────

function rcsPods(ctx: Ctx, s: Section) {
  const { kit } = ctx;
  const yC = 37.05;
  for (const phi of AZ.rcs) {
    const spec = { part: 'cold-gas-rcs' as const, mat: 'titanium' as const, look: 'paint', cut: true };
    const pod = bevelBox(0.36, 0.95, 0.15, 0.05);
    kit.add(s.group, pod, spec, radialFrame(R + 0.07, phi, yC));
    const nz = { ...spec, look: 'blackAnod' };
    // three nozzles: +-tangential (yaw/roll, flip) and radial
    const bell = lathe(
      [
        [0.018, 0],
        [0.024, 0.02],
        [0.042, 0.09],
      ],
      { seg: 16, smooth: 50 },
    );
    const bellIn = lathe(
      [
        [0.038, 0.09],
        [0.02, 0.02],
        [0.014, 0],
      ],
      { seg: 16, smooth: 50 },
    );
    const nozzle = mergeAll([bell, bellIn]);
    const m = radialFrame(R + 0.07, phi, yC);
    const place = (local: THREE.Vector3, dir: THREE.Vector3) => {
      const g = nozzle.clone();
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir));
      g.translate(local.x, local.y, local.z);
      kit.add(s.group, g, nz, m);
      const exit = local.clone().addScaledVector(dir, 0.09).applyMatrix4(m);
      ctx.s1Rcs.push(exit);
    };
    place(V(0.18, 0.22, 0.02), V(1, 0, 0));
    place(V(-0.18, 0.22, 0.02), V(-1, 0, 0));
    place(V(0, -0.2, 0.075), V(0, 0, 1));
    nozzle.dispose();
    // nitrogen bottles inside the forward skirt
    const bottle = new THREE.SphereGeometry(0.2, kit.seg.small, 12);
    kit.add(s.group, bottle, { part: 'cold-gas-rcs', mat: 'cfrp-copv', look: 'copv', internal: true, cut: false }, new THREE.Matrix4().makeTranslation(...polar(1.52, phi, 37.5).toArray()));
    kit.add(s.group, rod(polar(1.52, phi, 37.3), polar(R - 0.02, phi, yC), 0.012, 6), { part: 'cold-gas-rcs', mat: 'titanium', look: 'titanium', internal: true, cut: false });
  }
}

export function buildRecovery(ctx: Ctx, thrust: Section, fwd: Section) {
  legs(ctx, thrust);
  fins(ctx, fwd);
  rcsPods(ctx, fwd);
  poseLegs(ctx, 0);
  poseFins(ctx, 0, 0);
}
