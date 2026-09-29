/**
 * Upper stage (body `upper`): aft skirt with the thrust cone and the E-1V, settling/attitude
 * thruster pods and nitrogen bottles, the tank barrel with the common bulkhead (a sandwich of
 * two aluminium skins and an insulating core) between RP-1 below and LOX above, the forward
 * skirt with the avionics ring, and the payload adapter with its clamp band.
 */
import * as THREE from 'three';
import { BODY_RADIUS as R, DOME_HEIGHT as H, STATIONS as S } from '../../vehicle/spec';
import type { Ctx } from './ctx';
import type { Section } from './kit';
import { AZ } from './layout';
import { WALL } from './tanks';
import { wall, dome, jointBand, solidRing, sandwich } from './structures';
import { lathe, pipe, rod, radialFrame, bevelBox, mergeAll, polar, rectPoly, ellipseArc, shellPoly, offsetPolyline, boltRing, type P2 } from './geom';
import { mountEngine, sec, engineRadiusAt } from './booster';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function aftSkirt(ctx: Ctx) {
  const { kit } = ctx;
  const s = sec(ctx, 's2aft', 'upper');
  wall(kit, s, {
    part: 's2-tanks',
    mat: 'al-2219',
    y0: S.interstageTop,
    y1: S.s2AftSkirtTop,
    skin: 0.005,
    outerLook: 'paint',
    innerLook: 'alu',
    inner: 'always',
    frames: [{ y: 45.3, depth: 0.06 }],
    stringers: { count: 36, depth: 0.028 },
    endLands: { bottom: [0.1, 0.06], top: [0.08, 0.03] },
  });
  // aft ring lip the separation collets grip
  solidRing(kit, s, 1.72, R - 0.02, S.interstageTop + 0.02, S.interstageTop + 0.07, 'aluMilled', 'stage-separation', 'al-2219');
  jointBand(kit, s, S.interstageTop + 0.03, 'paint', 's2-tanks', 'al-2219', { bolts: kit.hangar ? 144 : 0 });
  jointBand(kit, s, S.s2AftSkirtTop - 0.02, 'paint', 's2-tanks', 'al-2219', { bolts: kit.hangar ? 144 : 0, h: 0.04 });
  // thrust cone: skin + radial stiffeners + engine mount ring
  const yLo = 44.98;
  const yHi = 46.06;
  const cone: P2[] = [
    [0.46, yLo],
    [R - 0.035, yHi],
  ];
  const cpoly = shellPoly([...cone].reverse(), 0.005);
  kit.add(s.group, lathe(cpoly, { seg: kit.seg.mid, closed: true, smooth: 50 }), { part: 's2-tanks', mat: 'al-2219', look: 'aluMilled', cut: true });
  kit.cap(s, cpoly, 's2-tanks', 'al-2219');
  solidRing(kit, s, 0.3, 0.5, yLo - 0.1, yLo + 0.02, 'titanium', 's2-tanks', 'titanium');
  for (let i = 0; i < 12; i++) {
    const phi = ((i + 0.5) / 12) * Math.PI * 2;
    const a = polar(0.5, phi, yLo + 0.02);
    const b = polar(R - 0.04, phi, yHi);
    const d = b.clone().sub(a);
    const g = new THREE.BoxGeometry(0.008, 0.09, d.length());
    const m = new THREE.Matrix4().lookAt(V(0, 0, 0), d, V(0, 1, 0));
    g.applyMatrix4(m);
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2 - 0.045, (a.z + b.z) / 2);
    kit.add(s.group, g, { part: 's2-tanks', mat: 'al-2219', look: 'aluMilled', cut: true });
  }
  // settling / attitude thruster pods
  for (const phi of AZ.s2Rcs) {
    const spec = { part: 's2-rcs' as const, mat: 'titanium' as const, look: 'paint', cut: true };
    const yC = 45.62;
    const m = radialFrame(R + 0.06, phi, yC);
    kit.add(s.group, bevelBox(0.3, 0.62, 0.13, 0.04), spec, m);
    const bell = lathe(
      [
        [0.016, 0],
        [0.022, 0.02],
        [0.036, 0.08],
        [0.032, 0.08],
        [0.012, 0.0],
      ],
      { seg: 14, smooth: 50 },
    );
    const place = (local: THREE.Vector3, dir: THREE.Vector3) => {
      const g = bell.clone();
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir));
      g.translate(local.x, local.y, local.z);
      kit.add(s.group, g, { ...spec, look: 'blackAnod' }, m);
      ctx.s2Rcs.push(local.clone().addScaledVector(dir, 0.08).applyMatrix4(m));
    };
    // two settling thrusters firing aft, two attitude thrusters firing tangentially
    place(V(-0.07, -0.31, 0.02), V(0, -1, 0));
    place(V(0.07, -0.31, 0.02), V(0, -1, 0));
    place(V(0.15, 0.12, 0.02), V(1, 0, 0));
    place(V(-0.15, 0.12, 0.02), V(-1, 0, 0));
    bell.dispose();
  }
  if (kit.hangar) {
    // nitrogen bottles for the thrusters, under the thrust cone
    for (const phi of AZ.s2Copvs) {
      const c = polar(1.45, phi, 45.05);
      kit.add(s.group, new THREE.SphereGeometry(0.24, kit.seg.small, 14), { part: 's2-rcs', mat: 'cfrp-copv', look: 'copv', internal: true, cut: false }, new THREE.Matrix4().makeTranslation(c.x, c.y, c.z));
      kit.add(s.group, rod(c.clone().add(polar(0.2, phi, 0)), polar(R - 0.03, phi, 45.05), 0.02, 6), { part: 's2-rcs', mat: 'titanium', look: 'titanium', internal: true, cut: false });
      kit.add(s.group, rod(c.clone().add(V(0, 0.22, 0)), polar(1.45, phi, 45.55).add(polar(0.25, phi, 0)), 0.012, 6), { part: 's2-rcs', mat: 'titanium', look: 'titanium', internal: true, cut: false });
    }
  }
  return s;
}

function engine(ctx: Ctx) {
  const s = sec(ctx, 's2engine', 'upper');
  const m = mountEngine(ctx, s.group, 's2', 'E-1V', ctx.hangar ? 'flight' : 'cluster', V(0, S.s2Gimbal, 0), 0, true);
  ctx.movers.engines.push(m);
  return { s, m };
}

function tanks(ctx: Ctx) {
  const { kit } = ctx;
  const s = sec(ctx, 's2tanks', 'upper');
  wall(kit, s, {
    part: 's2-tanks',
    mat: 'al-li',
    y0: S.s2AftSkirtTop,
    y1: S.s2LoxFwdEquator,
    skin: WALL.skin,
    outerLook: 'paintSeam',
    innerLook: 'alu',
    inner: 'cut',
    ribs: { pitch: 0.34, depth: WALL.rib, width: WALL.ribW, axial: 32 },
    lands: [
      { y: S.s2FuelAftEquator, h: 0.12, t: 0.032 },
      { y: S.s2CommonBulkheadEquator, h: 0.14, t: 0.034 },
    ],
    endLands: { bottom: [0.08, 0.02], top: [0.1, 0.03] },
  });
  dome(kit, s, { part: 's2-tanks', mat: 'al-2219', yEq: S.s2FuelAftEquator, dir: -1, a: WALL.domeA, b: H, t: WALL.dome, rHole: WALL.s2Tunnel + 0.01, look: 'alu', gores: 8 });
  dome(kit, s, { part: 's2-tanks', mat: 'al-2219', yEq: S.s2LoxFwdEquator, dir: 1, a: WALL.domeA, b: H, t: WALL.dome, rHole: 0.16, look: 'alu', gores: 8 });
  // common bulkhead: lower skin, insulating honeycomb core, upper skin (bulging down into the RP-1)
  const n = kit.hangar ? 30 : 14;
  const lowerOuter = [...ellipseArc(WALL.domeA, H, S.s2CommonBulkheadEquator, -1, n)].reverse();
  const l1 = offsetPolyline(lowerOuter, -WALL.cbSkin);
  const l2 = offsetPolyline(lowerOuter, -(WALL.cbSkin + WALL.cbCore));
  const l3 = offsetPolyline(lowerOuter, -(WALL.cbSkin * 2 + WALL.cbCore));
  const cb = { part: 'common-bulkhead' as const, cut: kit.hangar, internal: true };
  const skinLower = [...lowerOuter, ...[...l1].reverse()];
  const core = [...l1, ...[...l2].reverse()];
  const skinUpper = [...l2, ...[...l3].reverse()];
  kit.add(s.group, lathe(skinLower, { seg: kit.seg.mid, closed: true, smooth: 50 }), { ...cb, mat: 'al-2219', look: 'alu' });
  kit.add(s.group, lathe(core, { seg: kit.seg.mid, closed: true, smooth: 50 }), { ...cb, mat: 'honeycomb-core', look: 'honeycomb' });
  kit.add(s.group, lathe(skinUpper, { seg: kit.seg.mid, closed: true, smooth: 50 }), { ...cb, mat: 'al-2219', look: 'alu' });
  kit.capLayer(s, lowerOuter, l1, 'common-bulkhead', 'al-2219', 'hatch');
  kit.capLayer(s, l1, l2, 'common-bulkhead', 'honeycomb-core', 'honeyCut');
  kit.capLayer(s, l2, l3, 'common-bulkhead', 'al-2219', 'hatch');
  if (kit.hangar) {
    // edge closeout ring of the bulkhead at the barrel Y-ring
    solidRing(kit, s, WALL.domeA - 0.08, WALL.domeA + 0.002, S.s2CommonBulkheadEquator - 0.03, S.s2CommonBulkheadEquator + 0.02, 'aluMilled', 'common-bulkhead', 'al-2219', { internal: true });
    // LOX feed tunnel through the RP-1 tank: from the bulkhead sump to the aft dome and on to the engine
    const tSpec = { part: 's2-tanks' as const, mat: 'al-2219' as const, look: 'alu', internal: true, cut: false };
    const yA = S.s2CommonBulkheadApex;
    kit.add(s.group, lathe(rectPoly(WALL.s2Tunnel - 0.006, WALL.s2Tunnel, 45.15, yA + 0.02, 0.002), { seg: 32, closed: true, smooth: 50 }), tSpec);
    kit.add(s.group, lathe(rectPoly(WALL.s2Tunnel - 0.006, WALL.s2Tunnel + 0.06, yA - 0.03, yA + 0.08, 0.004), { seg: 32, closed: true, smooth: 50 }), { ...tSpec, look: 'aluMilled' });
    for (let k = 0; k < 2; k++) {
      const p = new THREE.BoxGeometry(0.34, 0.26, 0.008);
      p.rotateY(k * (Math.PI / 2) + Math.PI / 4);
      p.translate(0, yA + 0.2, 0);
      kit.add(s.group, p, { ...tSpec, look: 'aluMilled' });
    }
    baffles(ctx, s, [51.2]);
    // RP-1 outlet at the aft dome
    const xo = 0.5;
    const yd = S.s2FuelAftEquator - H * Math.sqrt(1 - (xo / WALL.domeA) ** 2);
    kit.add(s.group, lathe(rectPoly(0.06, 0.08, yd - 0.12, yd + 0.04, 0.003), { seg: 20, closed: true, smooth: 50 }), { ...tSpec, look: 'aluMilled' }, new THREE.Matrix4().makeTranslation(xo, 0, 0));
    // pressurant diffuser under the forward dome
    const yTop = S.s2LoxFwdEquator + H * Math.sqrt(1 - (0.16 / WALL.domeA) ** 2);
    kit.add(s.group, lathe([[0, yTop - 0.4], [0.08, yTop - 0.4], [0.08, yTop], [0.03, yTop + 0.03]], { seg: 16, smooth: 40 }), { part: 'pressurization', mat: 'titanium', look: 'titanium', internal: true, cut: false });
    solidRing(kit, s, 0.15, 0.24, yTop - 0.02, yTop + 0.04, 'aluMilled', 's2-tanks', 'al-2219', { internal: true, cut: false });
  }
  ctx.liquids.push({ tank: 's2Rp1', section: s }, { tank: 's2Lox', section: s });
  return s;
}

function baffles(ctx: Ctx, s: Section, ys: number[]) {
  const r1 = R - WALL.skin - WALL.rib;
  for (const y of ys) solidRing(ctx.kit, s, r1 - 0.18, r1 + 0.004, y - 0.003, y + 0.003, 'aluMilled', 's2-tanks', 'al-2219', { internal: true });
}

function forwardSkirt(ctx: Ctx) {
  const { kit } = ctx;
  const s = sec(ctx, 's2fwd', 'upper');
  wall(kit, s, {
    part: 'avionics',
    mat: 'al-2219',
    y0: S.s2LoxFwdEquator,
    y1: S.s2ForwardSkirtTop,
    skin: 0.005,
    outerLook: 'paint',
    innerLook: 'alu',
    inner: 'cut',
    frames: [{ y: 53.05, depth: 0.06 }],
    stringers: { count: 36, depth: 0.028 },
    endLands: { top: [0.08, 0.05], bottom: [0.05, 0.02] },
  });
  jointBand(kit, s, S.s2LoxFwdEquator + 0.02, 'paint', 's2-tanks', 'al-2219', { h: 0.04 });
  jointBand(kit, s, S.s2ForwardSkirtTop - 0.02, 'paint', 'payload-adapter', 'al-2219', { bolts: kit.hangar ? 144 : 0, h: 0.04 });
  // GNSS antennas (small radomes) and a telemetry blade outside
  for (let i = 0; i < 4; i++) {
    const phi = ((i + 0.5) / 4) * Math.PI * 2;
    const dome = lathe(
      [
        [0, 0.035],
        [0.05, 0.03],
        [0.075, 0.012],
        [0.08, 0],
      ],
      { seg: 20, smooth: 40 },
    );
    dome.rotateX(Math.PI / 2);
    kit.add(s.group, dome, { part: 'avionics', mat: 'cfrp-sandwich', look: 'radome', cut: true }, radialFrame(R + 0.001, phi, 53.5));
  }
  const blade = bevelBox(0.02, 0.2, 0.16, 0.006);
  blade.translate(0, 0, 0.08);
  kit.add(s.group, blade, { part: 'avionics', mat: 'al-2219', look: 'aluDark', cut: true }, radialFrame(R, Math.PI, 53.35));
  // LOX vent port
  const vy = 53.05;
  kit.add(s.group, bevelBox(0.26, 0.18, 0.018, 0.006), { part: 's2-tanks', mat: 'al-2219', look: 'paint', cut: true }, radialFrame(R + 0.004, AZ.vent, vy));
  kit.add(s.group, bevelBox(0.2, 0.12, 0.01, 0.003), { part: 's2-tanks', mat: 'al-2219', look: 'glassDark', cut: true }, radialFrame(R + 0.009, AZ.vent, vy));
  ctx.vents.push(polar(R + 0.05, AZ.vent, vy));
  if (!kit.hangar) return s;
  // avionics shelf ring with flight computers, IMU, batteries and harnesses
  const shelfY = 53.36;
  solidRing(kit, s, 1.42, R - 0.03, shelfY - 0.012, shelfY, 'aluMilled', 'avionics', 'al-2219', { internal: true });
  const boxes: { phi: number; w: number; h: number; d: number; look: string; mat: 'al-2219' | 'cfrp-sandwich' }[] = [];
  for (let i = 0; i < 12; i++) {
    const phi = ((i + 0.25) / 12) * Math.PI * 2;
    const kind = i % 4;
    if (kind === 0) boxes.push({ phi, w: 0.34, h: 0.26, d: 0.24, look: 'aluDark', mat: 'al-2219' }); // flight computer
    else if (kind === 1) boxes.push({ phi, w: 0.28, h: 0.2, d: 0.22, look: 'blackAnod', mat: 'al-2219' }); // battery
    else if (kind === 2) boxes.push({ phi, w: 0.22, h: 0.18, d: 0.2, look: 'gold', mat: 'al-2219' }); // IMU / GNSS receiver
    else boxes.push({ phi, w: 0.3, h: 0.22, d: 0.2, look: 'adapter', mat: 'cfrp-sandwich' }); // telemetry / power
  }
  const harness: THREE.Vector3[] = [];
  for (const b of boxes) {
    const g = bevelBox(b.w, b.h, b.d, 0.012);
    kit.add(s.group, g, { part: 'avionics', mat: b.mat, look: b.look, internal: true, cut: true }, radialFrame(1.64, b.phi, shelfY + b.h / 2 + 0.002));
    // connector faces
    const c = new THREE.BoxGeometry(b.w * 0.6, 0.04, 0.02);
    kit.add(s.group, c, { part: 'avionics', mat: 'al-2219', look: 'stainless', internal: true, cut: true }, radialFrame(1.64 - b.d / 2 - 0.008, b.phi, shelfY + b.h * 0.6));
    harness.push(polar(1.64 - b.d / 2 - 0.02, b.phi, shelfY + 0.05));
  }
  harness.push(harness[0].clone());
  kit.add(s.group, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(harness, false, 'centripetal'), 96, 0.018, 6, false), { part: 'avionics', mat: 'al-2219', look: 'rubber', internal: true, cut: true });
  return s;
}

function payloadAdapter(ctx: Ctx) {
  const { kit } = ctx;
  const s = sec(ctx, 'adapter', 'upper');
  const y0 = S.s2ForwardSkirtTop;
  const y1 = S.payloadAdapterTop;
  const rTop = 1.575 / 2;
  const outer: P2[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    // slightly concave cone (stiffer at the ends)
    outer.push([R - 0.02 + (rTop - (R - 0.02)) * t - 0.03 * Math.sin(t * Math.PI), y0 + 0.02 + (y1 - 0.09 - y0 - 0.02) * t]);
  }
  sandwich(kit, s, outer, { face: 0.0015, core: 0.018, part: 'payload-adapter', mat: 'cfrp-sandwich', coreMat: 'honeycomb-core', outerLook: 'adapter', innerLook: 'adapter', seg: kit.seg.mid });
  solidRing(kit, s, R - 0.12, R - 0.01, y0, y0 + 0.04, 'aluMilled', 'payload-adapter', 'al-2219');
  // interface ring and the clamp band (V-segments, two tension bolts)
  solidRing(kit, s, rTop - 0.03, rTop + 0.02, y1 - 0.1, y1 - 0.02, 'aluMilled', 'payload-adapter', 'al-2219');
  const band: P2[] = [
    [rTop + 0.02, y1 - 0.06],
    [rTop + 0.045, y1 - 0.045],
    [rTop + 0.045, y1 - 0.005],
    [rTop + 0.02, y1 + 0.01],
    [rTop + 0.01, y1 + 0.01],
    [rTop + 0.01, y1 - 0.06],
  ];
  kit.add(s.group, lathe(band, { seg: kit.seg.mid, closed: true, smooth: 40 }), { part: 'payload-adapter', mat: 'al-2219', look: 'aluBright', cut: true });
  kit.cap(s, band, 'payload-adapter', 'al-2219');
  for (const phi of [Math.PI / 2, -Math.PI / 2]) {
    const bolt = bevelBox(0.14, 0.05, 0.05, 0.01);
    kit.add(s.group, bolt, { part: 'payload-adapter', mat: 'al-2219', look: 'stainless', cut: true }, radialFrame(rTop + 0.07, phi, y1 - 0.025));
  }
  if (kit.hangar) {
    kit.add(s.group, boltRing(rTop + 0.02, y1 - 0.08, 48, 0.007, 0.005), { part: 'payload-adapter', mat: 'al-2219', look: 'stainless', cut: true, noCast: true });
    // separation springs
    for (let i = 0; i < 4; i++) {
      const phi = ((i + 0.5) / 4) * Math.PI * 2;
      const c = polar(rTop - 0.06, phi, 0);
      kit.add(s.group, lathe(rectPoly(0, 0.028, y1 - 0.14, y1 - 0.02, 0.004), { seg: 12, closed: true, smooth: 50 }), { part: 'payload-adapter', mat: 'stainless', look: 'stainless', cut: true }, new THREE.Matrix4().makeTranslation(c.x, 0, c.z));
    }
  }
  return s;
}

/** Interface ring for the crew-capsule configuration (the service module carries its own adapter). */
function capsuleInterface(ctx: Ctx) {
  const s = sec(ctx, 'adapter', 'upper');
  solidRing(ctx.kit, s, R - 0.14, R - 0.01, S.s2ForwardSkirtTop - 0.005, S.s2ForwardSkirtTop + 0.03, 'aluMilled', 'payload-adapter', 'al-2219');
  return s;
}

function feed(ctx: Ctx, aft: Section, m: ReturnType<typeof engine>['m']) {
  const { kit } = ctx;
  if (!kit.hangar) return;
  // the E-1V feed interfaces sit on top of its powerhead
  const top = S.s2Gimbal + 0.25;
  const lox = V(-0.2, top, 0);
  const fuel = V(0.33, top, 0.12);
  const yd = S.s2FuelAftEquator - H * Math.sqrt(1 - (0.5 / WALL.domeA) ** 2);
  const lSpec = { part: 's2-tanks' as const, mat: 'al-2219' as const, look: 'alu', internal: true, cut: false };
  kit.add(aft.group, pipe([V(0, 45.2, 0), V(0, 45.0, 0), V(lox.x, 44.98, lox.z), lox.clone().setY(top + 0.06)], 0.07, 0.12, 14, 8), lSpec);
  kit.add(aft.group, pipe([V(0.5, yd - 0.12, 0), V(0.5, yd - 0.4, 0), V(fuel.x, 45.05, fuel.z), fuel.clone().setY(top + 0.06)], 0.05, 0.12, 12, 8), { ...lSpec, look: 'aluDark' });
  ctx.flows.push({ kind: 'lox', demo: 'feed-flow', points: [V(0, S.s2CommonBulkheadApex + 0.1, 0), V(0, 45.0, 0), V(lox.x, 44.98, lox.z), lox.clone().setY(top + 0.06)], radius: 0.08, section: aft });
  ctx.flows.push({ kind: 'rp1', demo: 'feed-flow', points: [V(0.5, yd + 0.4, 0), V(0.5, yd - 0.4, 0), V(fuel.x, 45.05, fuel.z), fuel.clone().setY(top + 0.06)], radius: 0.06, section: aft });
  void m;
  void engineRadiusAt;
}

export function buildUpper(ctx: Ctx) {
  const aft = aftSkirt(ctx);
  const e = engine(ctx);
  const t = tanks(ctx);
  const f = forwardSkirt(ctx);
  const sat = ctx.config.payload === 'leoSat' || ctx.config.payload === 'gtoSat' || ctx.config.payload === 'lunarProbe';
  const a = sat ? payloadAdapter(ctx) : capsuleInterface(ctx);
  feed(ctx, aft, e.m);
  void mergeAll;
  return { aft, engine: e, tanks: t, fwd: f, adapter: a };
}
