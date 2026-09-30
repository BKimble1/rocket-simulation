/**
 * Plumbing: propellant lines with real bends, flanges and bolt rings; the main LOX valve (ball)
 * and main fuel valve (butterfly) with their actuators; the gas-generator taps and valves; the
 * turbine exhaust duct with the helium heat exchanger; the TEA-TEB igniter; wire harnesses and
 * brackets. Lines crossing the section plane are cut exactly (clippedTube); valve bodies on the
 * plane are sectioned about their own axes; moving valve elements live in their own nodes.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Design } from './design';
import { clippedTube, filletPath, hexBolt, ringOf, roundPoly, sweep, transportFrames, type Frame, type V2 } from './geo';
import type { Kit, Tag } from './kit';
import { TP, routes, EXHAUST_PHI } from './layout';
import type { EngineDetail } from './types';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;

/** Frames of a solid of revolution about an arbitrary axis through `c` (front ref = +Z). */
export function axisFrames(c: THREE.Vector3, axis: THREE.Vector3, phi0: number, phi1: number, segs: number): Frame[] {
  const a = axis.clone().normalize();
  let f = V(0, 0, 1).addScaledVector(a, -a.z);
  if (f.lengthSq() < 1e-6) f = V(1, 0, 0).addScaledVector(a, -a.x);
  f.normalize();
  const sd = a.clone().cross(f);
  const n = Math.max(2, Math.ceil((segs * Math.abs(phi1 - phi0)) / TAU));
  const out: Frame[] = [];
  for (let i = 0; i <= n; i++) {
    const phi = phi0 + ((phi1 - phi0) * i) / n;
    out.push({ p: c, n: f.clone().multiplyScalar(Math.cos(phi)).addScaledVector(sd, Math.sin(phi)), b: a, u: phi / TAU });
  }
  return out;
}

/**
 * Solid of revolution about an arbitrary axis (profile: r, axial s). Sectioned by z = 0 when
 * the axis lies in the plane; otherwise whole, in the half that contains its centre.
 */
export function axisLathe(k: Kit, pts: V2[], t: Tag, c: THREE.Vector3, axis: THREE.Vector3, segs: number, holes: V2[][] = []) {
  const loops = [{ pts }, ...holes.map((h) => ({ pts: h, hole: true }))];
  const inPlane = Math.abs(c.z) < 1e-4 && Math.abs(axis.clone().normalize().z) < 1e-4;
  if (k.section && inPlane) {
    k.sweep(sweep(loops, axisFrames(c, axis, Math.PI / 2, (Math.PI * 3) / 2, segs), { caps: true }), t);
    k.sweep(sweep(loops, axisFrames(c, axis, -Math.PI / 2, Math.PI / 2, segs), { caps: true }), { ...t, front: true });
    return;
  }
  const res = sweep(loops, axisFrames(c, axis, 0, TAU, segs));
  k.add(res.surf, { ...t, front: t.front || (k.section && c.z > 0.001) });
}

export function buildPlumbing(k: Kit, d: Design, detail: EngineDetail, _segs: number) {
  const R = routes(d);
  const hangar = detail === 'hangar';
  const rs = hangar ? 20 : detail === 'flight' ? 10 : 8;
  const clip = k.section ? 0 : undefined;

  /** Pipe along corner points with bends. */
  const pipe = (pts: THREE.Vector3[], ro: number | ((p: THREE.Vector3, s: number) => number), t: Tag, o: { ri?: number | ((p: THREE.Vector3, s: number) => number); bend?: number; segs?: number; hint?: THREE.Vector3; step?: number } = {}) => {
    const r0 = typeof ro === 'number' ? ro : ro(pts[0], 0);
    const path = filletPath(pts, o.bend ?? r0 * 2.4, hangar ? (o.step ?? 0.05) : 0.08, hangar ? 7.5 : 15);
    const frames = transportFrames(path, o.hint);
    const total = path.len[path.len.length - 1] || 1;
    const F = frames.length;
    const fr = (f: number | ((p: THREE.Vector3, s: number) => number) | undefined) =>
      f === undefined ? undefined : typeof f === 'number' ? f : (t: number) => f(frames[Math.round(t * (F - 1))].p, frames[Math.round(t * (F - 1))].u / total);
    const res = clippedTube(frames, { ro: fr(ro)!, ri: hangar ? fr(o.ri) : undefined, segs: o.segs ?? rs, clipZ: clip });
    k.tube(res, t);
    return { frames, path };
  };
  /** Flange pair with bolts across a joint at `p` with the pipe axis `dir`. */
  const flange = (p: THREE.Vector3, dir: THREE.Vector3, rp: number, t: Tag, bolts = 8) => {
    if (detail === 'cluster') return;
    const w = 0.011;
    const rf = rp + Math.max(0.016, rp * 0.32);
    const sq: V2[] = [
      [rp - 0.003, -w],
      [rf, -w],
      [rf, w],
      [rp - 0.003, w],
    ];
    const prof = hangar ? roundPoly(sq, (i) => (i === 1 || i === 2 ? 0.002 : 0), 2) : sq;
    axisLathe(k, prof, t, p, dir, hangar ? 32 : 14);
    if (!hangar) return;
    const bolt = hexBolt(Math.max(0.009, rp * 0.2), Math.max(0.008, rp * 0.17));
    // a flange on the section plane is cut in half (axisLathe): its bolts split with it, by
    // bolt centre, or the removed half would leave its bolts floating in front of the cut
    const onPlane = k.section && Math.abs(p.z) < 1e-4 && Math.abs(dir.clone().normalize().z) < 1e-4;
    for (const side of [1, -1]) {
      const g = bolt.clone();
      if (side < 0) g.rotateX(Math.PI);
      const o = { centre: p.clone().addScaledVector(dir.clone().normalize(), side * w), axis: dir, phase: Math.PI / bolts };
      const rb = (rp + rf) / 2 + 0.002;
      if (onPlane) {
        k.add(ringOf(g, bolts, rb, { ...o, filter: (q) => q.z <= 0 }), t);
        k.add(ringOf(g, bolts, rb, { ...o, filter: (q) => q.z > 0 }), { ...t, front: true });
      } else k.add(ringOf(g, bolts, rb, o), { ...t, front: t.front || (k.section && p.z > 0.001) });
      g.dispose();
    }
    bolt.dispose();
  };

  // ── feed ducts below the gimbal bellows (engine side) ──
  // thermal classes: LOX-wetted hardware is cryogenic (0), RP-1 lines and valves ambient (1)
  const eng = (mat: Tag['mat']): Tag => ({ part: 'engine', mat });
  const lox: Tag = { part: 'engine', mat: 'stainless', thermal: 0 };
  const x = d.tpX;
  pipe([V(x, TP.bellowsY[0] + 0.001, 0), V(x, TP.loxInletTop + 0.012, 0)], TP.loxDuctR, lox, { ri: TP.loxDuctR - 0.004, segs: hangar ? 32 : 14 });
  flange(V(x, TP.loxInletTop + 0.012, 0), V(0, 1, 0), TP.loxDuctR + 0.004, lox, 12);
  const fz = TP.fuelDuctZ;
  pipe([V(x, TP.bellowsY[0] + 0.001, fz), ...R.fuelInlet.slice(1)], TP.fuelDuctR, eng('stainless'), { ri: TP.fuelDuctR - 0.004, bend: 0.07, segs: hangar ? 28 : 12 });
  flange(V(x, TP.fuelInletY, 0.125), V(0, 0, 1), TP.fuelDuctR, eng('stainless'), 10);

  // ── LOX discharge (diffuser from the volute), MOV, into the dome ──
  const mvTag: Tag = { part: 'main-valves', mat: 'steel' };
  pipe(R.loxDischarge, (_p, s) => TP.loxLineR - 0.01 * Math.max(0, 1 - s * 12), lox, { ri: (_p, s) => TP.loxLineR - 0.005 - 0.01 * Math.max(0, 1 - s * 12), bend: 0.1, segs: hangar ? 28 : 12, step: 0.025 });
  const mov = V(d.mov.x, d.mov.y, d.mov.z);
  pipe(R.movToDome, TP.loxLineR, { part: 'injector', mat: 'stainless', thermal: 0 }, { ri: TP.loxLineR - 0.005, segs: hangar ? 28 : 12 });
  flange(R.pts.movIn.clone().add(V(0.004, 0, 0)), V(1, 0, 0), TP.loxLineR, mvTag, 10);
  flange(R.pts.movOut.clone().add(V(-0.004, 0, 0)), V(1, 0, 0), TP.loxLineR, mvTag, 10);
  flange(R.pts.domePort.clone().add(V(-0.03, 0, 0)), V(1, 0, 0), TP.loxLineR, { part: 'injector', mat: 'stainless', thermal: 0 }, 10);
  // valve body: ball cavity with seats, sectioned about the flow axis (X)
  const movBody: V2[] = roundPoly(
    [
      [0.036, -0.07],
      [0.07, -0.07],
      [0.07, -0.058],
      [0.057, -0.056],
      [0.057, -0.046],
      [0.066, -0.035],
      [0.072, -0.012],
      [0.072, 0.012],
      [0.066, 0.035],
      [0.057, 0.046],
      [0.057, 0.056],
      [0.07, 0.058],
      [0.07, 0.07],
      [0.036, 0.07],
      [0.036, 0.046],
      [0.047, 0.04],
      [0.055, 0.02],
      [0.057, 0],
      [0.055, -0.02],
      [0.047, -0.04],
      [0.036, -0.046],
    ],
    (i) => (i <= 13 ? 0.002 : 0),
    2,
  );
  if (detail === 'cluster') axisLathe(k, [[0.0005, -0.06], [0.068, -0.06], [0.068, 0.06], [0.0005, 0.06]], mvTag, mov, V(1, 0, 0), 12);
  else axisLathe(k, movBody, mvTag, mov, V(1, 0, 0), hangar ? 48 : 20);
  // bonnet boss, stem and the rotary actuator on top, with a position indicator on the stem
  axisLathe(
    k,
    roundPoly(
      [
        [0.0005, 0.06],
        [0.026, 0.06],
        [0.026, 0.1],
        [0.034, 0.1],
        [0.034, 0.108],
        [0.0005, 0.108],
      ],
      0.0015,
      2,
    ),
    mvTag,
    mov,
    V(0, 1, 0),
    hangar ? 40 : 16,
  );
  if (detail !== 'cluster') {
    const act = new RoundedBoxGeometry(0.1, 0.066, 0.078, 3, 0.008);
    act.translate(mov.x, mov.y + 0.142, mov.z);
    k.add(act, { part: 'main-valves', mat: 'aluminum' });
    const cyl = new THREE.CylinderGeometry(0.024, 0.024, 0.11, 24);
    cyl.rotateZ(Math.PI / 2);
    cyl.translate(mov.x - 0.01, mov.y + 0.142, mov.z - 0.052);
    k.add(cyl, { part: 'main-valves', mat: 'aluminum' });
    const cap = new THREE.CylinderGeometry(0.02, 0.02, 0.012, 24);
    cap.translate(mov.x, mov.y + 0.181, mov.z);
    k.add(cap, { part: 'main-valves', mat: 'anodized' });
    // indicator pointer turns with the ball (node 'mov')
    const ptr = new THREE.BoxGeometry(0.052, 0.006, 0.01);
    ptr.translate(mov.x + 0.012, mov.y + 0.19, mov.z);
    k.add(ptr, { part: 'main-valves', mat: 'bronze', node: 'mov' });
  }
  if (hangar) {
    // the ball: a sphere with a through bore (open = bore along the flow), trunnion stems
    const Rb = 0.052;
    const rb = 0.034;
    const sEnd = Math.sqrt(Rb * Rb - rb * rb);
    const ball: V2[] = [];
    for (let i = 0; i <= 16; i++) {
      const s = -sEnd + (2 * sEnd * i) / 16;
      ball.push([Math.sqrt(Rb * Rb - s * s), s]);
    }
    ball.push([rb, sEnd], [rb, -sEnd]);
    const bl = sweep([{ pts: [...ball.slice(0, 17), [rb, sEnd], [rb, -sEnd]] }], axisFrames(mov, V(1, 0, 0), 0, TAU, 36));
    k.add(bl.surf, { part: 'main-valves', mat: 'chrome', node: 'mov' });
    const stem = new THREE.CylinderGeometry(0.011, 0.011, 0.19, 16);
    stem.translate(mov.x, mov.y + 0.07, mov.z);
    k.add(stem, { part: 'main-valves', mat: 'steel', node: 'mov' });
    // seats
    for (const s of [-1, 1]) {
      const seat = roundPoly(
        [
          [0.034, s * 0.043],
          [0.047, s * 0.043],
          [0.047, s * 0.035],
          [0.034, s * 0.037],
        ].map(([r, a]) => [r, a] as V2),
        0.001,
        1,
      );
      axisLathe(k, s > 0 ? seat.reverse() : seat, { part: 'main-valves', mat: 'bronze' }, mov, V(1, 0, 0), 48);
    }
  }

  // ── fuel discharge, MFV (butterfly), down the bell to the coolant inlet manifold ──
  pipe(R.fuelDischarge, (_p, s) => TP.fuelLineR - 0.008 * Math.max(0, 1 - s * 14), eng('stainless'), { ri: (_p, s) => TP.fuelLineR - 0.004 - 0.008 * Math.max(0, 1 - s * 14), bend: 0.09, segs: hangar ? 24 : 12, step: 0.025 });
  const mfv = V(d.mfv.x, d.mfv.y, d.mfv.z);
  // the line reduces to the manifold's size over its last few centimetres and enters a welded
  // inlet boss on top of the torus
  const yIn = R.pts.manifoldIn.y;
  const reduce = (p: THREE.Vector3) => 0.009 * Math.min(1, Math.max(0, (yIn + 0.11 - p.y) / 0.05));
  const fdTag: Tag = { part: 'nozzle', mat: 'stainless', thermal: 1 };
  pipe(R.fuelDown, (p) => TP.fuelLineR - reduce(p), fdTag, { ri: (p) => TP.fuelLineR - 0.004 - reduce(p), bend: 0.2, segs: hangar ? 24 : 12 });
  if (detail !== 'cluster') {
    // (profile about the vertical axis through the inlet, s from the torus centre plane)
    const rb = TP.fuelLineR - 0.009;
    const boss: V2[] = [
      [rb - 0.006, 0.004],
      [rb + 0.007, 0.004],
      [rb + 0.004, 0.016],
      [rb + 0.004, 0.05],
      [rb + 0.001, 0.054],
      [rb - 0.006, 0.054],
    ];
    axisLathe(k, hangar ? roundPoly(boss, (i) => (i === 2 || i === 4 ? 0.003 : 0), 2) : boss, fdTag, V(R.pts.manifoldIn.x, yIn - 0.022, 0), V(0, 1, 0), hangar ? 32 : 16);
  }
  flange(R.pts.mfvIn.clone().add(V(0, -0.004, 0)), V(0, 1, 0), TP.fuelLineR, mvTag, 10);
  flange(R.pts.mfvOut.clone().add(V(0, 0.004, 0)), V(0, 1, 0), TP.fuelLineR, mvTag, 10);
  const mfvBody: V2[] = roundPoly(
    [
      [0.038, -0.055],
      [0.06, -0.055],
      [0.06, -0.044],
      [0.052, -0.04],
      [0.058, -0.02],
      [0.058, 0.02],
      [0.052, 0.04],
      [0.06, 0.044],
      [0.06, 0.055],
      [0.038, 0.055],
    ],
    (i) => (i === 0 || i === 9 ? 0 : 0.002),
    2,
  );
  axisLathe(k, mfvBody, mvTag, mfv, V(0, 1, 0), hangar ? 40 : 18);
  // spindle bosses (front and back) and the actuator at the back
  if (detail !== 'cluster') {
    for (const sgn of [-1, 1]) {
      const boss = new THREE.CylinderGeometry(0.016, 0.018, 0.03, 20);
      boss.rotateX(Math.PI / 2);
      boss.translate(mfv.x, mfv.y, mfv.z + sgn * 0.066);
      k.add(boss, { ...mvTag, front: sgn > 0 && k.section });
    }
    const act = new RoundedBoxGeometry(0.075, 0.07, 0.06, 3, 0.008);
    act.translate(mfv.x, mfv.y, mfv.z - 0.112);
    k.add(act, { part: 'main-valves', mat: 'aluminum' });
    const cyl = new THREE.CylinderGeometry(0.022, 0.022, 0.1, 24);
    cyl.translate(mfv.x - 0.045, mfv.y + 0.01, mfv.z - 0.112);
    k.add(cyl, { part: 'main-valves', mat: 'aluminum' });
  }
  if (hangar) {
    // butterfly disc (lens section) and spindle; split at z = 0 (rotation about Z keeps z)
    const disc: V2[] = [];
    for (let i = 0; i <= 10; i++) {
      const r = 0.0368 * (i / 10);
      disc.push([r, 0.0045 * Math.sqrt(1 - (r / 0.0368) ** 2) + 0.0008]);
    }
    for (let i = 10; i >= 0; i--) {
      const r = 0.0368 * (i / 10);
      disc.push([r, -0.0045 * Math.sqrt(1 - (r / 0.0368) ** 2) - 0.0008]);
    }
    const dl = [{ pts: disc.filter((p, i, a) => i === 0 || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]) }];
    k.sweep(sweep(dl, axisFrames(mfv, V(0, 1, 0), Math.PI / 2, (Math.PI * 3) / 2, 40), { caps: true }), { part: 'main-valves', mat: 'steel', node: 'mfv' });
    k.sweep(sweep(dl, axisFrames(mfv, V(0, 1, 0), -Math.PI / 2, Math.PI / 2, 40), { caps: true }), { part: 'main-valves', mat: 'steel', node: 'mfv', front: true });
    const sp = new THREE.CylinderGeometry(0.0055, 0.0055, 0.16, 12);
    sp.rotateX(Math.PI / 2);
    sp.translate(mfv.x, mfv.y, mfv.z - 0.04);
    k.add(sp, { part: 'main-valves', mat: 'chrome', node: 'mfv' });
  }

  // ── gas generator taps and valves ──
  const tapT = { part: 'gas-generator', mat: 'stainless' } as Tag;
  if (detail !== 'cluster') {
    pipe(R.loxTap, TP.tapR, { ...tapT, thermal: 0 }, { ri: TP.tapR - 0.002, bend: 0.05, segs: hangar ? 12 : 8 });
    pipe(R.fuelTap, TP.tapR, { ...tapT, thermal: 1 }, { ri: TP.tapR - 0.002, bend: 0.05, segs: hangar ? 12 : 8 });
    for (const p of [V(0.5, -0.6, -0.14), V(0.3, -0.62, -0.1525)]) {
      const body = new THREE.CylinderGeometry(0.02, 0.02, 0.06, 20);
      body.translate(p.x, p.y, p.z);
      k.add(body, { part: 'gas-generator', mat: 'steel', thermal: 1 });
      const box = new RoundedBoxGeometry(0.045, 0.04, 0.035, 2, 0.005);
      box.translate(p.x, p.y + 0.01, p.z - 0.035);
      k.add(box, { part: 'gas-generator', mat: 'aluminum', thermal: 1 });
    }
  }

  // ── turbine exhaust duct with the helium heat exchanger and a sooty outlet ──
  const ex = R.exhaust;
  const hxT = R.pts.hxTop;
  const hxB = R.pts.hxBot;
  const exR = (p: THREE.Vector3) => {
    const bulge = (y: number) => {
      const a = THREE.MathUtils.smoothstep(y, hxB - 0.04, hxB + 0.02);
      const b = 1 - THREE.MathUtils.smoothstep(y, hxT - 0.02, hxT + 0.04);
      return Math.min(a, b);
    };
    return TP.exhaustR + 0.016 * bulge(p.y);
  };
  // turbine exhaust (after expansion through the turbine): hot rather than very hot
  const exT: Tag = { part: 'gas-generator', mat: 'inconelHot', thermal: 3 };
  if (detail === 'cluster') pipe(ex, TP.exhaustR, exT, { bend: 0.1 });
  else {
    // upper duct (whole: it lies behind the section plane), HX section cut on its own axis
    const run = ex[ex.length - 1];
    const upper = [...ex.slice(0, 4), V(run.x, hxT + 0.07, run.z)];
    pipe(upper, exR, exT, { ri: (p) => exR(p) - 0.004, bend: 0.1, segs: hangar ? 24 : 12 });
    const hxPath = filletPath([V(run.x, hxT + 0.07, run.z), V(run.x, hxB - 0.07, run.z)], 0.1, 0.02);
    const hxFrames = transportFrames(hxPath, V(0, 0, 1));
    const hx = clippedTube(hxFrames, { ro: (t) => exR(hxFrames[Math.round(t * (hxFrames.length - 1))].p), ri: hangar ? (t) => exR(hxFrames[Math.round(t * (hxFrames.length - 1))].p) - 0.004 : undefined, segs: hangar ? 24 : 12, clipZ: k.section ? run.z : undefined });
    k.tube(hx, exT);
    const lower = [V(run.x, hxB - 0.07, run.z), V(run.x, run.y + 0.03, run.z)];
    pipe(lower, TP.exhaustR, exT, { ri: TP.exhaustR - 0.004, segs: hangar ? 24 : 12 });
    // outlet flare (soot-blackened lip)
    const lip: V2[] = roundPoly(
      [
        [TP.exhaustR - 0.004, 0.03],
        [TP.exhaustR, 0.03],
        [TP.exhaustR + 0.012, -0.04],
        [TP.exhaustR + 0.008, -0.042],
        [TP.exhaustR - 0.004, -0.01],
      ],
      0.002,
      2,
    );
    axisLathe(k, lip.map(([r, s]) => [r, s] as V2), { part: 'gas-generator', mat: 'soot', thermal: 3 }, V(run.x, run.y, run.z), V(0, 1, 0), hangar ? 32 : 14);
    flange(V(run.x, hxT + 0.07, run.z), V(0, 1, 0), TP.exhaustR, exT, 12);
    flange(V(run.x, hxB - 0.07, run.z), V(0, 1, 0), TP.exhaustR, exT, 12);
    flange(R.pts.exhaustStart.clone().add(V(0, 0, -0.012)), V(0, 0, 1), TP.exhaustR - 0.006, exT, 10);
    if (hangar) {
      // helium coil inside the heat exchanger (visible in the section view)
      const coil: THREE.Vector3[] = [];
      const turns = 7;
      for (let i = 0; i <= turns * 16; i++) {
        const t = i / (turns * 16);
        const a = t * turns * TAU;
        coil.push(V(run.x + 0.052 * Math.sin(a), hxT - 0.005 - (hxT - hxB - 0.01) * t, run.z + 0.052 * Math.cos(a)));
      }
      const cf = transportFrames({ p: coil, t: coil.map((_p, i) => coil[Math.min(coil.length - 1, i + 1)].clone().sub(coil[Math.max(0, i - 1)]).normalize()), len: coil.map((_, i) => i * 0.01) });
      k.add(clippedTube(cf, { ro: 0.0065, segs: 8 }).back.surf, { part: 'gas-generator', mat: 'bronze', thermal: 3 });
    }
    // brackets from the duct to the bell hatbands
    for (const y of [-1.3, -1.52]) {
      if (y < run.y + 0.05) continue;
      const rB = d.rOut(y) + 0.004;
      const dir = V(Math.sin(EXHAUST_PHI), 0, Math.cos(EXHAUST_PHI));
      const a = dir.clone().multiplyScalar(rB).setY(y);
      const b = V(run.x, y, run.z).addScaledVector(dir, -TP.exhaustR + 0.004);
      const len = a.distanceTo(b);
      if (len < 0.005) continue;
      const br = new RoundedBoxGeometry(0.03, 0.012, len + 0.01, 2, 0.003);
      br.lookAt(b.clone().sub(a));
      br.translate((a.x + b.x) / 2, y, (a.z + b.z) / 2);
      k.add(br, { part: 'engine', mat: 'inconel', thermal: 3 });
    }
  }

  if (detail === 'cluster') return;

  // ── fuel line clamps and struts to the bell ──
  for (const y of [-1.05, -1.5, -1.9]) {
    const pts = R.fuelDown;
    let best = pts[0];
    for (const p of pts) if (Math.abs(p.y - y) < Math.abs(best.y - y)) best = p;
    if (best.y < R.pts.manifoldIn.y + 0.12 || best.y > R.pts.mfvOut.y - 0.1) continue;
    const ring = new THREE.TorusGeometry(TP.fuelLineR + 0.006, 0.006, 8, 28);
    ring.rotateX(Math.PI / 2);
    ring.translate(best.x, best.y, 0);
    k.add(ring, { part: 'nozzle', mat: 'inconel', front: false });
    const rIn = d.rOut(best.y) + 0.002;
    const len = -best.x - TP.fuelLineR - rIn;
    if (len > 0.004) {
      const st = new RoundedBoxGeometry(len + 0.01, 0.014, 0.026, 2, 0.003);
      st.translate(-(rIn + len / 2), best.y, -0.018);
      k.add(st, { part: 'nozzle', mat: 'inconel' });
    }
  }
  // gas generator support strut to the chamber
  {
    const a = V(d.tpX - 0.056, -0.76, -0.02);
    const b = V(d.rOut(-0.76) - 0.004, -0.76, -0.02);
    const st = new RoundedBoxGeometry(a.x - b.x, 0.018, 0.03, 2, 0.004);
    st.translate((a.x + b.x) / 2, -0.76, -0.035);
    k.add(st, { part: 'gas-generator', mat: 'inconel', thermal: 3 });
  }

  // ── igniter: TEA-TEB cartridge, valve block, lines to the injector and to the gas generator ──
  const ig = R.pts.igniter;
  const igT: Tag = { part: 'igniter', mat: 'steel' };
  axisLathe(
    k,
    roundPoly(
      [
        [0.0005, 0.1],
        [0.022, 0.1],
        [0.034, 0.085],
        [0.034, -0.07],
        [0.028, -0.085],
        [0.0005, -0.085],
      ],
      0.004,
      2,
    ),
    igT,
    ig,
    V(0, 1, 0),
    hangar ? 40 : 16,
  );
  {
    const blk = new RoundedBoxGeometry(0.06, 0.04, 0.05, 2, 0.005);
    blk.translate(ig.x, ig.y - 0.105, ig.z);
    k.add(blk, igT);
    const band = new THREE.TorusGeometry(0.036, 0.004, hangar ? 8 : 5, hangar ? 32 : 18);
    band.rotateX(Math.PI / 2);
    for (const dy of [0.05, -0.04]) k.add(band.clone().translate(ig.x, ig.y + dy, ig.z), { part: 'igniter', mat: 'inconel' });
    band.dispose();
    const strut = new RoundedBoxGeometry(0.02, 0.012, 0.09, 2, 0.003);
    strut.lookAt(V(ig.x, 0, ig.z).normalize());
    strut.translate(ig.x * 0.83, ig.y + 0.05, ig.z * 0.83);
    k.add(strut, { part: 'igniter', mat: 'inconel' });
  }
  pipe(R.igniterToInjector, 0.0055, { part: 'igniter', mat: 'stainless' }, { bend: 0.04, segs: 10 });
  pipe(R.igniterToGG, 0.0055, { part: 'igniter', mat: 'stainless' }, { bend: 0.05, segs: 10 });

  // ── helium lines from the heat exchanger up to the stage interface ──
  // (each ends in a hex union; the flexible hose above it to the stage interface is in mech.ts)
  for (const h of R.helium) {
    pipe(h, 0.0062, { part: 'gas-generator', mat: 'stainless', thermal: 1 }, { bend: 0.06, segs: 10 });
    const end = h[h.length - 1];
    const union = new THREE.CylinderGeometry(0.0105, 0.0105, 0.022, 6);
    union.translate(end.x, end.y + 0.005, end.z);
    k.add(union, { part: 'gas-generator', mat: 'steel', thermal: 1 });
  }

  // ── wire harnesses from the junction box to sensors and valve actuators ──
  const J = R.pts.junction;
  const box = new RoundedBoxGeometry(0.085, 0.06, 0.045, 3, 0.006);
  box.translate(J.x, J.y, J.z - 0.01);
  k.add(box, { part: 'engine', mat: 'anodized' });
  for (const h of R.harness) {
    pipe(h, 0.0072, { part: 'engine', mat: 'braid' }, { bend: 0.05, segs: 8 });
    // connector at the far end
    const end = h[h.length - 1];
    const prev = h[h.length - 2];
    const dir = end.clone().sub(prev).normalize();
    const con = new THREE.CylinderGeometry(0.0125, 0.0125, 0.03, 16);
    con.translate(0, -0.015, 0);
    con.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir));
    con.translate(end.x, end.y, end.z);
    k.add(con, { part: 'engine', mat: 'anodized' });
    const nut = new THREE.CylinderGeometry(0.014, 0.014, 0.01, 6);
    nut.translate(0, -0.035, 0);
    nut.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir));
    nut.translate(end.x, end.y, end.z);
    k.add(nut, { part: 'engine', mat: 'steel' });
  }
}
