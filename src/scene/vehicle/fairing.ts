/**
 * Payload fairing (satellite configurations): two halves split along the Z = 0 plane (seams on
 * +X and -X). fairingA is the +Z half and carries the livery; fairingB the -Z half. Boat-tail
 * from 3.7 m to 4.0 m, cylinder, tangent-ogive nose. Wall: carbon face sheets on an aluminium
 * honeycomb core. Each half hinges outward about a line at its base (fairingOpen, up to 25 deg).
 */
import * as THREE from 'three';
import { BODY_RADIUS as R, FAIRING, STATIONS as S } from '../../vehicle/spec';
import type { BodyId } from '../../vehicle/parts';
import type { Ctx } from './ctx';
import type { Section } from './kit';
import { EXPLODE } from './layout';
import { lathe, offsetPolyline, rod, polar, bevelBox, radialFrame, mergeAll, type P2 } from './geom';
import { sandwich, meridianStrip } from './structures';
import { makeDecal, wordWidth } from './decals';
import { GRAPHITE } from './mats';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export const FAIRING_HINGE = { y: S.fairingBase + 0.02, z: R - 0.05 };
export const FAIRING_MAX_OPEN_DEG = 25;

/** Outer mould line of the fairing (r, y), base to tip, walked with the wall on its left. */
export function fairingProfile(n: number): P2[] {
  const Rb = FAIRING.diameter / 2;
  const L = S.fairingTip - S.fairingCylinderTop;
  const rho = (Rb * Rb + L * L) / (2 * Rb);
  const pts: P2[] = [];
  pts.push([R, S.fairingBase]);
  // boat-tail: smooth S from R to Rb
  const bt0 = S.fairingBase + 0.06;
  const bt1 = S.fairingBoatTailTop;
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const e = t * t * (3 - 2 * t);
    pts.push([R + (Rb - R) * e, bt0 + (bt1 - bt0) * t]);
  }
  pts.push([Rb, S.fairingCylinderTop]);
  // tangent ogive, x measured from the tip; stop short of the tip and round it off
  const xEnd = 0.1;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const x = L - (L - xEnd) * Math.pow(t, 0.8);
    const r = Math.sqrt(rho * rho - (L - x) * (L - x)) + Rb - rho;
    pts.push([r, S.fairingTip - x]);
  }
  const [r0, y0] = pts[pts.length - 1];
  for (let i = 1; i <= 5; i++) {
    const a = (i / 5) * (Math.PI / 2);
    pts.push([r0 * Math.cos(a), y0 + (S.fairingTip - y0) * Math.sin(a)]);
  }
  pts[pts.length - 1] = [0, S.fairingTip];
  return pts;
}

function half(ctx: Ctx, body: 'fairingA' | 'fairingB'): { sec: Section; pivot: THREE.Group } {
  const { kit } = ctx;
  const content = ctx.content[body]!;
  const pivot = new THREE.Group();
  pivot.name = `${body}:hinge`;
  const zs = body === 'fairingA' ? 1 : -1;
  pivot.position.set(0, FAIRING_HINGE.y, zs * FAIRING_HINGE.z);
  content.add(pivot);
  kit.own(pivot, body as BodyId);
  const inner = new THREE.Group();
  inner.position.set(0, -FAIRING_HINGE.y, -zs * FAIRING_HINGE.z);
  pivot.add(inner);
  const s = kit.section(body, body as BodyId, inner, new THREE.Vector3(...EXPLODE[body]));
  const gap = 0.0016; // seam hairline (rad)
  const phi0 = body === 'fairingA' ? -Math.PI / 2 + gap : Math.PI / 2 + gap;
  const phiLen = Math.PI - 2 * gap;
  const outer = fairingProfile(kit.hangar ? 40 : 20);
  const layers = sandwich(kit, s, outer, {
    face: FAIRING.faceSheet,
    core: FAIRING.core,
    part: 'fairing',
    mat: 'cfrp-sandwich',
    coreMat: 'honeycomb-core',
    outerLook: 'paint',
    innerLook: 'fairingInner',
    phi0,
    phiLen,
    seg: Math.round(kit.seg.body / 2),
    soot: 0,
  });
  ctx.movers.sandwichLayers.push({ obj: s.group, dir: 1 });
  // seam edges: the wall section is exposed when the halves open
  const inner3 = layers.l3;
  for (const [phi, facing] of [
    [phi0, -1],
    [phi0 + phiLen, 1],
  ] as const) {
    kit.add(s.group, meridianStrip(outer, inner3, phi, facing), { part: 'fairing', mat: 'cfrp-sandwich', look: 'adapter', cut: true, shadow: false });
    // separation rail along the seam inside
    const railPts = offsetPolyline(outer, -(FAIRING.faceSheet * 2 + FAIRING.core + 0.012)).filter((p) => p[1] < S.fairingCylinderTop + 3.5);
    const d = facing === -1 ? 0.015 : -0.015;
    const curve = new THREE.CatmullRomCurve3(railPts.map(([r, y]) => polar(r, phi + d / Math.max(r, 0.3), y)));
    kit.add(s.group, new THREE.TubeGeometry(curve, 60, 0.012, 6, false), { part: 'fairing', mat: 'al-2219' as never, look: 'aluMilled', cut: true });
  }
  // base ring and the hinge fitting
  const ringProf: P2[] = [
    [R - 0.08, S.fairingBase],
    [R - 0.002, S.fairingBase],
    [R - 0.002, S.fairingBase + 0.07],
    [R - 0.08, S.fairingBase + 0.07],
  ];
  kit.add(s.group, lathe(ringProf, { seg: Math.round(kit.seg.body / 2), closed: true, smooth: 50, phi0, phiLen }), { part: 'fairing', mat: 'cfrp-sandwich', look: 'aluMilled', cut: true });
  const hingePhi = body === 'fairingA' ? 0 : Math.PI;
  for (const dx of [-0.35, 0.35]) {
    const m = radialFrame(R - 0.02, hingePhi + dx / R, S.fairingBase + 0.08);
    kit.add(s.group, bevelBox(0.14, 0.16, 0.1, 0.015), { part: 'fairing', mat: 'cfrp-sandwich', look: 'titanium', cut: true }, m);
  }
  // pneumatic pushers along the seam (on the +Z half)
  if (body === 'fairingA' && kit.hangar) {
    for (const phi of [Math.PI / 2 - 0.05, -Math.PI / 2 + 0.05])
      for (const y of [55.4, 57.4, 59.4]) {
        const a = polar(1.93, phi, y);
        kit.add(s.group, rod(a, a.clone().setY(y + 0.34), 0.04, 12), { part: 'fairing', mat: 'cfrp-sandwich', look: 'aluMilled', cut: true });
        kit.add(s.group, rod(a.clone().setY(y + 0.34), a.clone().setY(y + 0.5), 0.016, 8), { part: 'fairing', mat: 'cfrp-sandwich', look: 'stainless', cut: true });
      }
  }
  if (body === 'fairingA') livery(ctx, s);
  return { sec: s, pivot };
}

function livery(ctx: Ctx, s: Section) {
  const Rb = FAIRING.diameter / 2;
  const cap = 0.56;
  const len = wordWidth('kimble', cap);
  const yStart = 55.15;
  const markSize = 1.25;
  const markY = yStart + len + 0.4 + markSize / 2;
  const d = makeDecal(ctx.mats, {
    key: 'fairing-kimble',
    r: Rb + 0.0025,
    phiC: 0,
    halfW: 0.72,
    y0: yStart - 0.15,
    y1: markY + markSize / 2 + 0.1,
    color: GRAPHITE,
    items: [
      { kind: 'kimble', s: cap / 2, y: yStart, cap, vertical: true },
      { kind: 'mark', s: 0, y: markY, size: markSize },
    ],
    ppm: 520,
    maxTex: ctx.maxTex,
    frost: false,
    soot: false,
  });
  ctx.kit.add(s.group, d.geom, { part: 'fairing', mat: 'cfrp-sandwich', look: d.look, cut: true, shadow: false });
  const oc = 0.085;
  const w = wordWidth('onefab', oc);
  const phiO = -0.62;
  const o = makeDecal(ctx.mats, {
    key: 'fairing-onefab',
    r: Rb + 0.0025,
    phiC: phiO,
    halfW: w / 2 + 0.04,
    y0: 54.68,
    y1: 54.9,
    color: GRAPHITE,
    items: [{ kind: 'onefab', s: -w / 2, y: 54.75, cap: oc }],
    ppm: 1100,
    maxTex: ctx.maxTex,
    frost: false,
    soot: false,
  });
  ctx.kit.add(s.group, o.geom, { part: 'fairing', mat: 'cfrp-sandwich', look: o.look, cut: true, shadow: false });
  void mergeAll;
  void V;
}

export function buildFairing(ctx: Ctx) {
  const a = half(ctx, 'fairingA');
  const b = half(ctx, 'fairingB');
  ctx.movers.fairing.A = a.pivot;
  ctx.movers.fairing.B = b.pivot;
  return { A: a.sec, B: b.sec };
}

/** Rotate the halves outward about their base hinges (0..1 -> 0..25 deg). */
export function poseFairing(ctx: Ctx, open: number) {
  const a = (Math.max(0, Math.min(1, open)) * FAIRING_MAX_OPEN_DEG * Math.PI) / 180;
  if (ctx.movers.fairing.A) ctx.movers.fairing.A.rotation.x = a;
  if (ctx.movers.fairing.B) ctx.movers.fairing.B.rotation.x = -a;
}
