/**
 * Livery decals. The KIMBLE mark and wordmark and the ONE / FAB mark are painted from the brand
 * paths (src/brand/logoPaths.ts, via Path2D) onto a mask canvas, then mapped onto a thin curved
 * "decal band": a cylinder segment 2.5 mm outside the skin, so lettering follows the curvature
 * without stretching or mirroring. U runs with increasing azimuth, which is the viewer's right
 * when looking at the band from outside, so nothing is reversed.
 *
 * The mask is lightly blurred and the shader re-thresholds it with screen-space derivatives
 * (a cheap distance-field trick): edges stay crisp when magnified in close-ups and antialiased
 * when far away.
 */
import * as THREE from 'three';
import { MARK, WORD_KIMBLE, WORD_ONEFAB } from '../../brand/logoPaths';
import { withHook, type VehicleMats } from './mats';

export type DecalItem =
  /** Upright KIMBLE symbol; (s, y) = centre, size = full symbol box (m). */
  | { kind: 'mark'; s: number; y: number; size: number }
  /** Wordmark; vertical = reads bottom-to-top. (s, y) = start of the baseline (m). */
  | { kind: 'kimble' | 'onefab'; s: number; y: number; cap: number; vertical?: boolean };

export interface DecalSpec {
  key: string;
  /** Band radius (skin radius + 2.5 mm). */
  r: number;
  /** Centre azimuth (rad, from +Z toward +X). */
  phiC: number;
  /** Band half-width as arc length at r (m), and height range. */
  halfW: number;
  y0: number;
  y1: number;
  color: string;
  items: DecalItem[];
  /** Pixels per metre (clamped by maxTex). */
  ppm: number;
  maxTex: number;
  soot?: boolean;
  frost?: boolean;
}

const SHARPEN = /* glsl */ `
#ifdef USE_ALPHAMAP
{
  float dm = texture2D(alphaMap, vAlphaMapUv).g;
  float dw = clamp(fwidth(dm) * 0.8, 0.015, 0.5);
  diffuseColor.a *= smoothstep(0.5 - dw, 0.5 + dw, dm);
}
#endif
`;

export function wordWidth(kind: 'kimble' | 'onefab', cap: number) {
  return (kind === 'kimble' ? WORD_KIMBLE.width : WORD_ONEFAB.width) * cap;
}

function paint(spec: DecalSpec): HTMLCanvasElement {
  const W = spec.halfW * 2;
  const Hm = spec.y1 - spec.y0;
  let ppm = spec.ppm;
  const longest = Math.max(W, Hm) * ppm;
  if (longest > spec.maxTex) ppm *= spec.maxTex / longest;
  const cw = Math.max(8, Math.round(W * ppm));
  const ch = Math.max(8, Math.round(Hm * ppm));
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, cw, ch);
  // soft mask: the shader re-thresholds at 0.5
  const blur = Math.max(0.8, Math.min(2.2, ppm * 0.004));
  g.filter = `blur(${blur.toFixed(2)}px)`;
  g.fillStyle = '#fff';
  const X = (s: number) => (s + spec.halfW) * ppm;
  const Y = (y: number) => (spec.y1 - y) * ppm;
  for (const it of spec.items) {
    g.save();
    if (it.kind === 'mark') {
      const k = (it.size / 100) * ppm;
      g.translate(X(it.s) - 50 * k, Y(it.y) - 50 * k);
      g.scale(k, k);
      g.fill(new Path2D(MARK.body));
      g.fill(new Path2D(MARK.arm));
    } else {
      const w = it.kind === 'kimble' ? WORD_KIMBLE : WORD_ONEFAB;
      const k = it.cap * w.scale * ppm;
      g.translate(X(it.s), Y(it.y));
      if (it.vertical) g.rotate(-Math.PI / 2);
      g.scale(k, k);
      g.fill(new Path2D(w.d));
    }
    g.restore();
  }
  return c;
}

/** Curved band geometry with UVs 0..1 (u with azimuth, v with height). */
export function bandGeometry(r: number, phiC: number, halfW: number, y0: number, y1: number, rows = 2): THREE.BufferGeometry {
  const half = halfW / r;
  const seg = Math.max(8, Math.ceil(((half * 2) / Math.PI) * 180 / 1.2));
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  for (let j = 0; j <= rows; j++) {
    const v = j / rows;
    const y = y0 + (y1 - y0) * v;
    for (let i = 0; i <= seg; i++) {
      const u = i / seg;
      const phi = phiC - half + 2 * half * u;
      pos.push(r * Math.sin(phi), y, r * Math.cos(phi));
      nor.push(Math.sin(phi), 0, Math.cos(phi));
      uv.push(u, v);
    }
  }
  const idx: number[] = [];
  const cols = seg + 1;
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < seg; i++) {
      const a = j * cols + i;
      const b = a + cols;
      // dP/dphi x dP/dy points outward (see geom.ts)
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Create the decal material (registered as a look) and its band geometry. */
export function makeDecal(mats: VehicleMats, spec: DecalSpec): { look: string; geom: THREE.BufferGeometry } {
  const look = `decal:${spec.key}`;
  const canvas = paint(spec);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  const m = new THREE.MeshPhysicalMaterial({
    color: spec.color,
    roughness: 0.5,
    metalness: 0,
    clearcoat: 0.2,
    clearcoatRoughness: 0.45,
    alphaMap: tex,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  mats.makeSkin(m, { soot: spec.soot ?? true, frost: spec.frost ?? true });
  withHook(m, 'decalSharpen', (s) => {
    s.fragmentShader = s.fragmentShader.replace('#include <alphamap_fragment>', SHARPEN);
  });
  mats.register(look, m, [tex]);
  return { look, geom: bandGeometry(spec.r, spec.phiC, spec.halfW, spec.y0, spec.y1) };
}
