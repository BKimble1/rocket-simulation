/**
 * Structural building blocks shared by both stages: barrel walls (skin with orthogrid ribs,
 * weld lands, ring frames, stringers), ellipsoidal domes with gore welds, sandwich shells,
 * joint bands with bolt rings, and the cut faces that go with each of them.
 */
import * as THREE from 'three';
import type { PartId } from '../../vehicle/parts';
import type { MaterialId } from '../../content/materials/ids';
import { BODY_RADIUS as R } from '../../vehicle/spec';
import type { Kit, Section } from './kit';
import type { Look } from './mats';
import { lathe, ellipseArc, shellPoly, rectPoly, ringGeom, boltRing, radialFrame, offsetPolyline, capStrip, type P2 } from './geom';

export interface WallSpec {
  part: PartId;
  mat: MaterialId;
  y0: number;
  y1: number;
  r?: number;
  skin: number;
  outerLook: Look | string;
  innerLook: Look | string;
  /** Inner surface: shown only in the cutaway ('cut'), or always (open-ended shells). */
  inner: 'cut' | 'always' | 'none';
  ribs?: { pitch: number; depth: number; width: number; axial: number; phi0?: number };
  lands?: { y: number; h: number; t: number }[];
  /** Thick end lands (weld lands / Y-ring interfaces) at y0 / y1: height and thickness. */
  endLands?: { bottom?: [number, number]; top?: [number, number] };
  frames?: { y: number; depth: number; web?: number; flange?: number }[];
  stringers?: { count: number; depth: number; width?: number; phi0?: number; y0?: number; y1?: number };
  /** Outer edge bevels (rounded rims where a shell ends in the open). */
  bevelBottom?: number;
  bevelTop?: number;
  cut?: boolean;
  soot?: number;
  outerCast?: boolean;
}

type Chain = P2[];

/** Closed wall polygon (CCW) and the index where the inner chain starts. */
function wallPolygon(s: WallSpec, withDetail: boolean): { poly: P2[]; innerStart: number } {
  const Ro = s.r ?? R;
  const Rs = Ro - s.skin;
  // features on the inner side, each a chain walked top -> bottom
  type Feat = { top: number; bot: number; chain: Chain };
  const feats: Feat[] = [];
  if (withDetail) {
    for (const l of s.lands ?? []) {
      const tp = Math.max(0.01, (l.t - s.skin) * 2.5);
      feats.push({
        top: l.y + l.h / 2 + tp,
        bot: l.y - l.h / 2 - tp,
        chain: [
          [Rs, l.y + l.h / 2 + tp],
          [Ro - l.t, l.y + l.h / 2],
          [Ro - l.t, l.y - l.h / 2],
          [Rs, l.y - l.h / 2 - tp],
        ],
      });
    }
    for (const f of s.frames ?? []) {
      const web = f.web ?? 0.006;
      const fl = f.flange ?? 0.05;
      const tf = 0.006;
      feats.push({
        top: f.y + fl / 2,
        bot: f.y - fl / 2,
        chain: [
          [Rs, f.y + web / 2],
          [Rs - f.depth + tf, f.y + web / 2],
          [Rs - f.depth + tf, f.y + fl / 2],
          [Rs - f.depth, f.y + fl / 2],
          [Rs - f.depth, f.y - fl / 2],
          [Rs - f.depth + tf, f.y - fl / 2],
          [Rs - f.depth + tf, f.y - web / 2],
          [Rs, f.y - web / 2],
        ],
      });
    }
  }
  const topLand = withDetail ? s.endLands?.top : undefined;
  const botLand = withDetail ? s.endLands?.bottom : undefined;
  const yTopFree = topLand ? s.y1 - topLand[0] - (topLand[1] - s.skin) * 2.5 : s.y1;
  const yBotFree = botLand ? s.y0 + botLand[0] + (botLand[1] - s.skin) * 2.5 : s.y0;
  if (withDetail && s.ribs) {
    const rb = s.ribs;
    const n = Math.floor((yTopFree - yBotFree) / rb.pitch);
    const off = (yTopFree - yBotFree - n * rb.pitch) / 2;
    for (let k = 0; k <= n; k++) {
      const y = yBotFree + off + k * rb.pitch;
      if (y - rb.width < yBotFree + 0.01 || y + rb.width > yTopFree - 0.01) continue;
      if (feats.some((f) => y + rb.width > f.bot - 0.02 && y - rb.width < f.top + 0.02)) continue;
      feats.push({
        top: y + rb.width / 2,
        bot: y - rb.width / 2,
        chain: [
          [Rs, y + rb.width / 2],
          [Rs - rb.depth, y + rb.width / 2],
          [Rs - rb.depth, y - rb.width / 2],
          [Rs, y - rb.width / 2],
        ],
      });
    }
  }
  feats.sort((a, b) => b.top - a.top);
  const inner: P2[] = [];
  if (topLand) {
    inner.push([Ro - topLand[1], s.y1], [Ro - topLand[1], s.y1 - topLand[0]], [Rs, yTopFree]);
  } else inner.push([Rs, s.y1]);
  for (const f of feats) inner.push(...f.chain);
  if (botLand) inner.push([Rs, yBotFree], [Ro - botLand[1], s.y0 + botLand[0]], [Ro - botLand[1], s.y0]);
  else inner.push([Rs, s.y0]);
  const outer: P2[] = [];
  const bb = s.bevelBottom ?? 0;
  const bt = s.bevelTop ?? 0;
  if (bb > 0) outer.push([Ro - bb, s.y0], [Ro, s.y0 + bb]);
  else outer.push([Ro, s.y0]);
  if (bt > 0) outer.push([Ro, s.y1 - bt], [Ro - bt, s.y1]);
  else outer.push([Ro, s.y1]);
  return { poly: [...outer, ...inner], innerStart: outer.length };
}

/** A barrel wall: outer skin lathe, inner (detailed) lathe, axial ribs / stringers, cut face. */
export function wall(kit: Kit, sec: Section, s: WallSpec) {
  const hangar = kit.hangar;
  const Ro = s.r ?? R;
  const { poly, innerStart } = wallPolygon(s, hangar);
  const cut = (s.cut ?? true) && hangar;
  const outerChain = poly.slice(0, innerStart);
  kit.add(sec.group, lathe(outerChain, { seg: kit.seg.body, smooth: 40, uR: R, v: 'y' }), { part: s.part, mat: s.mat, look: s.outerLook, cut, soot: s.soot, noCast: s.outerCast === false });
  if (s.inner !== 'none' && (hangar || s.inner === 'always')) {
    // inner chain: from the last outer point, around the top edge, down the inner side, back out at the bottom
    const innerChain: P2[] = [outerChain[outerChain.length - 1], ...poly.slice(innerStart), outerChain[0]];
    kit.add(sec.group, lathe(innerChain, { seg: kit.seg.mid, smooth: 40, uR: R }), { part: s.part, mat: s.mat, look: s.innerLook, cut, internal: s.inner === 'cut', soot: 0 });
  }
  if (hangar && s.ribs && s.inner !== 'none') {
    const rb = s.ribs;
    const Rs = Ro - s.skin;
    const top = s.y1 - (s.endLands?.top ? s.endLands.top[0] + 0.02 : 0.01);
    const bot = s.y0 + (s.endLands?.bottom ? s.endLands.bottom[0] + 0.02 : 0.01);
    for (let i = 0; i < rb.axial; i++) {
      const phi = (rb.phi0 ?? 0) + (i / rb.axial) * Math.PI * 2;
      const g = new THREE.BoxGeometry(rb.width, top - bot, rb.depth);
      kit.add(sec.group, g, { part: s.part, mat: s.mat, look: s.innerLook, cut, internal: s.inner === 'cut', soot: 0 }, radialFrame(Rs - rb.depth / 2, phi, (top + bot) / 2));
    }
  }
  if (hangar && s.stringers && s.inner !== 'none') {
    const st = s.stringers;
    const Rs = Ro - s.skin;
    const y0 = st.y0 ?? s.y0 + 0.03;
    const y1 = st.y1 ?? s.y1 - 0.03;
    const w = st.width ?? 0.004;
    for (let i = 0; i < st.count; i++) {
      const phi = (st.phi0 ?? Math.PI / st.count) + (i / st.count) * Math.PI * 2;
      const blade = new THREE.BoxGeometry(w, y1 - y0, st.depth);
      kit.add(sec.group, blade, { part: s.part, mat: s.mat, look: s.innerLook, cut, internal: s.inner === 'cut', soot: 0 }, radialFrame(Rs - st.depth / 2, phi, (y0 + y1) / 2));
      const flange = new THREE.BoxGeometry(0.026, y1 - y0, 0.003);
      kit.add(sec.group, flange, { part: s.part, mat: s.mat, look: s.innerLook, cut, internal: s.inner === 'cut', soot: 0 }, radialFrame(Rs - st.depth + 0.0015, phi, (y0 + y1) / 2));
    }
  }
  if (cut) kit.cap(sec, poly, s.part, s.mat);
}

export interface DomeSpec {
  part: PartId;
  mat: MaterialId;
  yEq: number;
  dir: 1 | -1;
  a: number;
  b: number;
  t: number;
  rHole?: number;
  look: Look | string;
  gores?: number;
  cut?: boolean;
  internal?: boolean;
  n?: number;
}

/** Ellipsoidal dome shell (outer surface semi-axes a, b), optional apex hole, gore welds. */
export function dome(kit: Kit, sec: Section, d: DomeSpec) {
  const arc = ellipseArc(d.a, d.b, d.yEq, d.dir, d.n ?? (kit.hangar ? 28 : 14), d.rHole ?? 0);
  const outer = d.dir === 1 ? arc : [...arc].reverse();
  const poly = shellPoly(outer, d.t);
  const cut = (d.cut ?? true) && kit.hangar;
  const internal = d.internal ?? true;
  kit.add(sec.group, lathe(poly, { seg: kit.seg.mid, closed: true, smooth: 50, uR: R }), { part: d.part, mat: d.mat, look: d.look, cut, internal, soot: 0 });
  if (cut) kit.cap(sec, poly, d.part, d.mat);
  if (kit.hangar && d.gores) {
    // meridian weld beads on the outer surface, and the apex "dollar plate" weld ring
    const rStop = Math.max(0.42, (d.rHole ?? 0) + 0.12);
    for (let i = 0; i < d.gores; i++) {
      const phi = (i / d.gores) * Math.PI * 2 + Math.PI / d.gores;
      const pts: THREE.Vector3[] = [];
      const bead = offsetPolyline(ellipseArc(d.a, d.b, d.yEq, d.dir, 20, rStop), d.dir === 1 ? 0.0012 : -0.0012);
      for (const [r, y] of bead) pts.push(new THREE.Vector3(r * Math.sin(phi), y, r * Math.cos(phi)));
      const curve = new THREE.CatmullRomCurve3(pts);
      kit.add(sec.group, new THREE.TubeGeometry(curve, 24, 0.0045, 5, false), { part: d.part, mat: d.mat, look: d.look, cut, internal, soot: 0 });
    }
    const yr = d.yEq + d.dir * d.b * Math.sqrt(Math.max(0, 1 - (rStop / d.a) ** 2));
    const tor = new THREE.TorusGeometry(rStop, 0.0045, 5, kit.seg.small * 2);
    tor.rotateX(Math.PI / 2);
    tor.translate(0, yr + d.dir * 0.001, 0);
    kit.add(sec.group, tor, { part: d.part, mat: d.mat, look: d.look, cut, internal, soot: 0 });
  }
}

/** Raised external joint band with a bolt ring (paint look of the surrounding skin). */
export function jointBand(kit: Kit, sec: Section, y: number, look: Look | string, part: PartId, mat: MaterialId, o: { h?: number; proud?: number; bolts?: number; r?: number; soot?: number; cut?: boolean } = {}) {
  const r = o.r ?? R;
  const h = o.h ?? 0.05;
  const proud = o.proud ?? 0.003;
  const cut = (o.cut ?? true) && kit.hangar;
  const poly = rectPoly(r - 0.002, r + proud, y - h / 2, y + h / 2, 0.0015);
  kit.add(sec.group, lathe(poly, { seg: kit.seg.body, closed: true, smooth: 50, uR: R, v: 'y' }), { part, mat, look, cut, soot: o.soot });
  if (cut) kit.cap(sec, poly, part, mat);
  if (kit.hangar && o.bolts) kit.add(sec.group, boltRing(r + proud, y, o.bolts, 0.008, 0.005, Math.PI / o.bolts), { part, mat, look, cut, soot: o.soot, noCast: true });
}

/** Solid ring (rectangle profile) with its cut face. */
export function solidRing(kit: Kit, sec: Section, r0: number, r1: number, y0: number, y1: number, look: Look | string, part: PartId, mat: MaterialId, o: { cut?: boolean; internal?: boolean; seg?: number; soot?: number } = {}) {
  const cut = (o.cut ?? true) && kit.hangar;
  kit.add(sec.group, ringGeom(r0, r1, y0, y1, o.seg ?? kit.seg.mid, Math.min(0.003, (r1 - r0) / 4, (y1 - y0) / 4)), { part, mat, look, cut, internal: o.internal, soot: o.soot });
  if (cut) kit.cap(sec, rectPoly(r0, r1, y0, y1), part, mat);
}

/**
 * Sandwich shell along an outer profile (walked with the solid on its left): outer face sheet,
 * honeycomb core, inner face sheet. Visible surfaces are the outside of the outer sheet and the
 * inside of the inner sheet; the cut face shows the three layers (hatched sheets, core cells).
 */
export function sandwich(
  kit: Kit,
  sec: Section,
  outer: P2[],
  o: { face: number; core: number; part: PartId; mat: MaterialId; coreMat: MaterialId; outerLook: Look | string; innerLook: Look | string; phi0?: number; phiLen?: number; seg?: number; cut?: boolean; soot?: number; innerInternal?: boolean },
) {
  const cut = (o.cut ?? true) && kit.hangar;
  const seg = o.seg ?? kit.seg.body;
  const l1 = offsetPolyline(outer, -o.face);
  const l2 = offsetPolyline(outer, -(o.face + o.core));
  const l3 = offsetPolyline(outer, -(o.face * 2 + o.core));
  kit.add(sec.group, lathe(outer, { seg, smooth: 40, uR: R, v: 'y', phi0: o.phi0, phiLen: o.phiLen }), { part: o.part, mat: o.mat, look: o.outerLook, cut, soot: o.soot });
  const innerSurf = [...l3].reverse();
  kit.add(sec.group, lathe(innerSurf, { seg: kit.hangar ? kit.seg.mid : seg, smooth: 40, uR: R, phi0: o.phi0, phiLen: o.phiLen }), { part: o.part, mat: o.mat, look: o.innerLook, cut, soot: 0, internal: o.innerInternal });
  if (cut) {
    kit.capLayer(sec, outer, l1, o.part, o.mat, 'hatch');
    kit.capLayer(sec, l1, l2, o.part, o.coreMat, 'honeyCut');
    kit.capLayer(sec, l2, l3, o.part, o.mat, 'hatch');
  }
  return { l1, l2, l3 };
}

/** Straight edge strip between two polylines lying on a meridian plane at azimuth phi (a permanent section face, e.g. a fairing seam). */
export function meridianStrip(outer: P2[], inner: P2[], phi: number, facing: 1 | -1): THREE.BufferGeometry {
  const g = capStrip(outer, inner);
  // cap strips are built in local XY facing +Z; rotate into the meridian plane at phi
  g.rotateY(phi - Math.PI / 2);
  if (facing < 0) {
    const ix = g.getIndex()!;
    for (let i = 0; i < ix.count; i += 3) {
      const t = ix.getX(i + 1);
      ix.setX(i + 1, ix.getX(i + 2));
      ix.setX(i + 2, t);
    }
    const n = g.getAttribute('normal') as THREE.BufferAttribute;
    for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  }
  return g;
}
