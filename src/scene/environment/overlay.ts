/**
 * Ground treatment around the launch complex, painted once on a canvas from the layout
 * (1 m texels over +-1024 m): R = mowed grass, G = gravel / crushed shell, B = scorched or
 * bare ground. The terrain shader blends these over the natural cover; the vegetation scatter
 * reads the same pixels so no shrub grows on a gravel apron.
 */
import * as THREE from 'three';
import { FENCE, HARDSTAND, EMBANK, WATER_TOWER, LOX_SPHERE, RP1_TANKS, GAS_TUBES, LIGHTNING_MASTS, BUILDINGS, BUNKER, HANGAR, RAMP, trenchXZ, LIGHT_POLES, SITE_ROADS } from './layout';

export const OVERLAY = { ext: 1024, size: 2048 };

export interface Overlay {
  tex: THREE.CanvasTexture;
  data: Uint8ClampedArray;
}

let cached: Overlay | null = null;

export function buildOverlay(): Overlay {
  if (cached) return cached;
  const S = OVERLAY.size;
  const k = S / (2 * OVERLAY.ext);
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  const X = (x: number) => (x + OVERLAY.ext) * k;
  const Z = (z: number) => (z + OVERLAY.ext) * k;
  g.fillStyle = '#000';
  g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'source-over';

  const poly = (pts: [number, number][], color: string, blur = 0, grow = 0) => {
    g.save();
    g.filter = blur ? `blur(${blur * k}px)` : 'none';
    g.fillStyle = color;
    g.strokeStyle = color;
    g.lineJoin = 'round';
    g.lineWidth = grow * 2 * k;
    g.beginPath();
    pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z))));
    g.closePath();
    g.fill();
    if (grow > 0) g.stroke();
    g.restore();
  };
  const circle = (x: number, z: number, r: number, color: string, blur = 0) => {
    g.save();
    g.filter = blur ? `blur(${blur * k}px)` : 'none';
    g.fillStyle = color;
    g.beginPath();
    g.arc(X(x), Z(z), r * k, 0, Math.PI * 2);
    g.fill();
    g.restore();
  };
  const rect = (x: number, z: number, w: number, d: number, color: string, blur = 0) =>
    poly(
      [
        [x - w / 2, z - d / 2],
        [x + w / 2, z - d / 2],
        [x + w / 2, z + d / 2],
        [x - w / 2, z + d / 2],
      ],
      color,
      blur,
    );
  const line = (pts: [number, number][], width: number, color: string, blur = 0) => {
    g.save();
    g.filter = blur ? `blur(${blur * k}px)` : 'none';
    g.strokeStyle = color;
    g.lineWidth = width * k;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z))));
    g.stroke();
    g.restore();
  };

  // mowed grass inside the fence, a little ragged at the edge
  poly(FENCE, 'rgb(235,0,0)', 6, 4);
  // sand firebreak along the fence (both sides)
  line([...FENCE, FENCE[0]], 14, 'rgb(0,110,0)', 3);
  // gravel apron around the hardstand and the ramp
  poly(HARDSTAND, 'rgb(0,230,0)', 5, EMBANK.run + 14);
  rect(RAMP.x, RAMP.z0 + RAMP.length / 2 + 10, RAMP.halfWidth * 2 + 26, RAMP.length + 30, 'rgb(0,200,0)', 5);
  // scorched fan beyond the trench mouth
  const fan: [number, number][] = [];
  for (let i = 0; i <= 12; i++) {
    const a = ((i / 12 - 0.5) * 50 * Math.PI) / 180;
    const r = 150;
    const s = 60 + Math.cos(a) * r;
    const v = Math.sin(a) * r;
    const p = trenchXZ(s, v);
    fan.push([p.x, p.z]);
  }
  const m0 = trenchXZ(58, -9);
  const m1 = trenchXZ(58, 9);
  g.globalCompositeOperation = 'lighter';
  poly([[m0.x, m0.z], ...fan, [m1.x, m1.z]], 'rgb(0,0,150)', 18);
  poly([[m0.x, m0.z], ...fan.slice(3, 10), [m1.x, m1.z]], 'rgb(0,0,100)', 10);
  g.globalCompositeOperation = 'source-over';
  // facility pads
  circle(WATER_TOWER.x, WATER_TOWER.z, 24, 'rgb(0,220,0)', 3);
  rect(LOX_SPHERE.x, LOX_SPHERE.z, 46, 46, 'rgb(0,220,0)', 3);
  rect(RP1_TANKS.x, RP1_TANKS.z, RP1_TANKS.length + 22, RP1_TANKS.spacing * RP1_TANKS.count + 22, 'rgb(0,220,0)', 3);
  rect(GAS_TUBES.x, GAS_TUBES.z, 26, 18, 'rgb(0,220,0)', 3);
  for (const m of LIGHTNING_MASTS) circle(m.x, m.z, 10, 'rgb(0,220,0)', 2);
  for (const [x, z] of LIGHT_POLES) circle(x, z, 5, 'rgb(0,200,0)', 2);
  const b = BUILDINGS;
  rect(b.padOps.x, b.padOps.z, b.padOps.w + 14, b.padOps.d + 14, 'rgb(0,220,0)', 2);
  rect(b.padOps.x - 4, b.padOps.z + 22, 36, 20, 'rgb(0,230,0)', 1);
  rect(b.pneumatics.x, b.pneumatics.z, b.pneumatics.w + 12, b.pneumatics.d + 12, 'rgb(0,220,0)', 2);
  rect(b.substation.x, b.substation.z, b.substation.w + 6, b.substation.d + 6, 'rgb(0,230,0)', 1);
  rect(b.gate.x, b.gate.z, 30, 24, 'rgb(0,200,0)', 2);
  circle(BUNKER.x, BUNKER.z, BUNKER.r + 12, 'rgb(0,200,0)', 3);
  rect(HANGAR.x, HANGAR.z, HANGAR.w + 20, HANGAR.d + 16, 'rgb(0,220,0)', 2);
  rect(HANGAR.x, HANGAR.z - HANGAR.d / 2 - 35, HANGAR.w - 10, 70, 'rgb(0,230,0)', 2);
  // road shoulders (the pavement itself is geometry)
  for (const r of SITE_ROADS) line(r.pts, r.w + 7, 'rgb(0,150,0)', 1.5);

  const data = g.getImageData(0, 0, S, S).data;
  const tex = new THREE.CanvasTexture(c);
  tex.flipY = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  cached = { tex, data };
  return cached;
}

/** Overlay channel at pad-local (x, z), 0..1 (0 outside the painted square). */
export function overlayAt(o: Overlay, x: number, z: number, ch: 0 | 1 | 2): number {
  const S = OVERLAY.size;
  const i = Math.floor(((x + OVERLAY.ext) / (2 * OVERLAY.ext)) * S);
  const j = Math.floor(((z + OVERLAY.ext) / (2 * OVERLAY.ext)) * S);
  if (i < 0 || j < 0 || i >= S || j >= S) return 0;
  return o.data[(j * S + i) * 4 + ch] / 255;
}
