/**
 * Procedural textures for the spacecraft, painted once per session on canvases (no network
 * assets): crumpled multilayer-insulation foil, solar-cell strings, the backshell tile pattern,
 * the ablator surface and its char, section hatching, the KIMBLE decal, radiators, quilted
 * blankets and parachute fabric. Every texture is cached; materials share them.
 */
import * as THREE from 'three';
import { MARK, WORD_KIMBLE, WORD_ONEFAB } from '../../brand/logoPaths';
import { ACCENT, GRAPHITE } from '../materials';
import { tierSpec } from '../quality';

const cache = new Map<string, THREE.Texture>();

function mkCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

export function rng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Largest texture edge allowed by the quality tier. */
export function texEdge(n: number): number {
  return Math.min(n, tierSpec().maxTexture);
}

function tex(c: HTMLCanvasElement, color: boolean, wrap = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

function cached<T extends THREE.Texture>(key: string, make: () => T): T {
  let t = cache.get(key) as T | undefined;
  if (!t) {
    t = make();
    t.name = `sc-${key}`;
    cache.set(key, t);
  }
  return t;
}

/** Height field (0..1) to a tangent-space normal map. */
function heightToNormal(g: CanvasRenderingContext2D, h: Float32Array, w: number, hh: number, strength: number, wrapX = true, wrapY = true): ImageData {
  const out = g.createImageData(w, hh);
  const d = out.data;
  const at = (x: number, y: number) => {
    if (wrapX) x = (x + w) % w;
    else x = Math.max(0, Math.min(w - 1, x));
    if (wrapY) y = (y + hh) % hh;
    else y = Math.max(0, Math.min(hh - 1, y));
    return h[y * w + x];
  };
  for (let y = 0; y < hh; y++)
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      // canvas rows run downward; texture v runs upward (flipY), so invert dy
      const dy = -(at(x, y + 1) - at(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      d[i] = 128 + (-dx / l) * 127;
      d[i + 1] = 128 + (-dy / l) * 127;
      d[i + 2] = 128 + (1 / l) * 127;
      d[i + 3] = 255;
    }
  return out;
}

// ───────────────────────────── multilayer insulation ─────────────────────────────

interface Crumple {
  normal: THREE.Texture;
  lum: THREE.Texture;
  rough: THREE.Texture;
}

/**
 * Crumpled foil: a height field of fine wrinkles (elongated creases a few centimetres long,
 * mostly along two preferred directions, as blankets wrinkle between their stitch lines) over
 * a gentle billow, turned into normals. Between creases the film stays nearly flat, so it
 * reflects coherently and flashes at the folds, the way aluminised polyimide does.
 * One repeat covers MLI_REPEAT (0.6 m).
 */
export function crumple(): Crumple {
  const key = 'crumple';
  if (cache.has(key + 'n')) return { normal: cache.get(key + 'n')!, lum: cache.get(key + 'l')!, rough: cache.get(key + 'r')! };
  const S = texEdge(512);
  const h = new Float32Array(S * S);
  const crease = new Float32Array(S * S);
  const r = rng(41);
  // gentle billow: a few low-frequency waves (periodic over the tile)
  const waves = Array.from({ length: 6 }, () => ({ kx: 1 + Math.floor(r() * 3), ky: 1 + Math.floor(r() * 3), p: r() * 6.28, a: 0.5 + r() * 0.5 }));
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      let v = 0;
      for (const w of waves) v += w.a * Math.sin(((x * w.kx + y * w.ky) / S) * Math.PI * 2 + w.p);
      h[y * S + x] = v * 0.9;
    }
  // wrinkles: ridges/valleys with a sharp crest, length 2-9 cm, two preferred orientations
  const n = 2600;
  const px = S / 0.6; // pixels per metre
  for (let k = 0; k < n; k++) {
    const cx = r() * S;
    const cy = r() * S;
    const pref = r() < 0.5 ? 0.35 : 1.9;
    const ang = pref + (r() - 0.5) * 1.1;
    const len = (0.02 + r() * r() * 0.08) * px;
    const wid = (0.002 + r() * 0.005) * px;
    const amp = (r() < 0.5 ? -1 : 1) * (0.6 + r() * 1.4);
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const ext = len / 2 + wid * 3;
    for (let yy = -ext; yy <= ext; yy++)
      for (let xx = -ext; xx <= ext; xx++) {
        const u = xx * ca + yy * sa; // along
        const w = -xx * sa + yy * ca; // across
        if (Math.abs(u) > len / 2 || Math.abs(w) > wid * 3) continue;
        const taper = 1 - Math.pow((2 * u) / len, 2);
        const prof = Math.max(0, 1 - Math.abs(w) / (wid * 3)); // sharp crest
        const x = (((Math.round(cx + xx) % S) + S) % S) | 0;
        const y = (((Math.round(cy + yy) % S) + S) % S) | 0;
        const i = y * S + x;
        h[i] += amp * taper * prof * prof;
        crease[i] = Math.max(crease[i], taper * Math.pow(prof, 4));
      }
  }
  const [cn, gn] = mkCanvas(S, S);
  gn.putImageData(heightToNormal(gn, h, S, S, 0.55), 0, 0);
  const [cl, gl] = mkCanvas(S, S);
  const [cr, gr] = mkCanvas(S, S);
  const dl = gl.createImageData(S, S);
  const dr = gr.createImageData(S, S);
  for (let p = 0; p < S * S; p++) {
    const l = 238 - crease[p] * 26 + (h[p] > 0 ? 4 : -4);
    dl.data[p * 4] = dl.data[p * 4 + 1] = dl.data[p * 4 + 2] = l;
    dl.data[p * 4 + 3] = 255;
    const rv = 185 + crease[p] * 50;
    dr.data[p * 4] = dr.data[p * 4 + 1] = dr.data[p * 4 + 2] = rv;
    dr.data[p * 4 + 3] = 255;
  }
  gl.putImageData(dl, 0, 0);
  gr.putImageData(dr, 0, 0);
  const normal = cached(key + 'n', () => tex(cn, false));
  const lumT = cached(key + 'l', () => tex(cl, true));
  const roughT = cached(key + 'r', () => tex(cr, false));
  return { normal, lum: lumT, rough: roughT };
}

// ───────────────────────────── solar cells ─────────────────────────────

/** Metres covered by one repeat of the cell texture (4 cells across, 8 rows). */
export const CELL_TILE = { w: 0.32, h: 0.32, cellW: 0.08, cellH: 0.04 };

/**
 * Triple-junction cells under cover glass: 4 x 8 cells per repeat (80 x 40 mm each) with
 * cropped corners, a busbar along one edge, fine grid fingers, interconnect tabs and the
 * substrate showing in the 1 mm gaps. Per-cell hue and tilt variation break up reflections.
 */
export function solarCells(): { map: THREE.Texture; normal: THREE.Texture; rough: THREE.Texture } {
  const key = 'cells';
  if (cache.has(key + 'm')) return { map: cache.get(key + 'm')!, normal: cache.get(key + 'n')!, rough: cache.get(key + 'r')! };
  const S = texEdge(1024);
  const px = S / CELL_TILE.w; // px per metre
  const [cm, gm] = mkCanvas(S, S);
  const [cr, gr] = mkCanvas(S, S);
  const h = new Float32Array(S * S);
  const r = rng(5);
  gm.fillStyle = '#9d988c';
  gm.fillRect(0, 0, S, S);
  gr.fillStyle = 'rgb(150,150,150)';
  gr.fillRect(0, 0, S, S);
  const gap = Math.max(1.5, 0.0012 * px);
  const chamfer = 0.006 * px;
  const cols = 4;
  const rows = 8;
  const cw = S / cols;
  const ch = S / rows;
  const tilt: { x0: number; y0: number; x1: number; y1: number; tx: number; ty: number }[] = [];
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const x0 = i * cw + gap / 2;
      const y0 = j * ch + gap / 2;
      const x1 = (i + 1) * cw - gap / 2;
      const y1 = (j + 1) * ch - gap / 2;
      const hue = 222 + (r() - 0.5) * 8;
      const light = 15 + r() * 4;
      gm.fillStyle = `hsl(${hue}, 48%, ${light}%)`;
      gm.beginPath();
      gm.moveTo(x0 + chamfer, y0);
      gm.lineTo(x1 - chamfer, y0);
      gm.lineTo(x1, y0 + chamfer);
      gm.lineTo(x1, y1 - chamfer);
      gm.lineTo(x1 - chamfer, y1);
      gm.lineTo(x0 + chamfer, y1);
      gm.lineTo(x0, y1 - chamfer);
      gm.lineTo(x0, y0 + chamfer);
      gm.closePath();
      gm.fill();
      // anti-reflective coating sheen gradient
      const grad = gm.createLinearGradient(x0, y0, x1, y1);
      grad.addColorStop(0, 'rgba(90,110,170,0.10)');
      grad.addColorStop(1, 'rgba(10,15,40,0.10)');
      gm.fillStyle = grad;
      gm.fill();
      // grid fingers (perpendicular to the busbar), very fine
      gm.strokeStyle = 'rgba(120,135,170,0.22)';
      gm.lineWidth = Math.max(0.6, 0.00015 * px);
      const fingerStep = Math.max(3, 0.0022 * px);
      for (let fx = x0 + fingerStep; fx < x1 - 1; fx += fingerStep) {
        gm.beginPath();
        gm.moveTo(fx, y0 + 0.004 * px);
        gm.lineTo(fx, y1 - 1);
        gm.stroke();
      }
      // busbar along the top edge and interconnect tabs crossing the gap
      gm.fillStyle = '#c9c7c0';
      gm.fillRect(x0 + chamfer, y0 + 0.0012 * px, x1 - x0 - 2 * chamfer, Math.max(1.2, 0.0016 * px));
      gm.fillStyle = '#d6d2c6';
      for (const f of [0.22, 0.5, 0.78]) gm.fillRect(x0 + (x1 - x0) * f - 0.003 * px, y0 - gap, 0.006 * px, gap + 0.003 * px);
      gr.fillStyle = 'rgb(28,28,28)';
      gr.fillRect(x0, y0, x1 - x0, y1 - y0);
      tilt.push({ x0, y0, x1, y1, tx: (r() - 0.5) * 0.06, ty: (r() - 0.5) * 0.06 });
    }
  // height: cells slightly proud of the substrate, each with its own tiny tilt
  for (const c of tilt) {
    for (let y = Math.floor(c.y0); y < Math.ceil(c.y1); y++)
      for (let x = Math.floor(c.x0); x < Math.ceil(c.x1); x++) {
        if (x < 0 || y < 0 || x >= S || y >= S) continue;
        h[y * S + x] = 1 + ((x - c.x0) * c.tx + (y - c.y0) * c.ty) / S;
      }
  }
  const [cn, gn] = mkCanvas(S, S);
  gn.putImageData(heightToNormal(gn, h, S, S, 1.2), 0, 0);
  const map = cached(key + 'm', () => tex(cm, true));
  const normal = cached(key + 'n', () => tex(cn, false));
  const rough = cached(key + 'r', () => tex(cr, false));
  return { map, normal, rough };
}

// ───────────────────────────── generic small patterns ─────────────────────────────

/** Optical solar reflector radiator: a grid of 40 x 40 mm mirror tiles (4 x 4 per 160 mm repeat). */
export function osrTiles(): { map: THREE.Texture; rough: THREE.Texture } {
  const key = 'osr';
  if (cache.has(key + 'm')) return { map: cache.get(key + 'm')!, rough: cache.get(key + 'r')! };
  const S = 256;
  const [cm, gm] = mkCanvas(S, S);
  const [cr, gr] = mkCanvas(S, S);
  const r = rng(9);
  gm.fillStyle = '#6f7277';
  gm.fillRect(0, 0, S, S);
  gr.fillStyle = 'rgb(160,160,160)';
  gr.fillRect(0, 0, S, S);
  const n = 4;
  const c = S / n;
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const v = 200 + r() * 30;
      gm.fillStyle = `rgb(${v},${v + 2},${v + 5})`;
      gm.fillRect(i * c + 1.5, j * c + 1.5, c - 3, c - 3);
      const rv = 10 + r() * 20;
      gr.fillStyle = `rgb(${rv},${rv},${rv})`;
      gr.fillRect(i * c + 1.5, j * c + 1.5, c - 3, c - 3);
    }
  return { map: cached(key + 'm', () => tex(cm, true)), rough: cached(key + 'r', () => tex(cr, false)) };
}

/** White radiator panel with the fluid-loop tubes showing as fine ridges (1 m repeat). */
export function radiatorTex(): { map: THREE.Texture; normal: THREE.Texture } {
  const key = 'radiator';
  if (cache.has(key + 'm')) return { map: cache.get(key + 'm')!, normal: cache.get(key + 'n')! };
  const S = 512;
  const [cm, gm] = mkCanvas(S, S);
  const h = new Float32Array(S * S);
  const r = rng(21);
  gm.fillStyle = '#ecebe6';
  gm.fillRect(0, 0, S, S);
  // faint handling marks
  for (let k = 0; k < 40; k++) {
    gm.fillStyle = `rgba(120,115,100,${0.015 + r() * 0.02})`;
    gm.beginPath();
    gm.ellipse(r() * S, r() * S, 10 + r() * 50, 4 + r() * 20, r() * 3, 0, Math.PI * 2);
    gm.fill();
  }
  const tubes = 8;
  for (let t = 0; t < tubes; t++) {
    const x0 = ((t + 0.5) / tubes) * S;
    for (let y = 0; y < S; y++)
      for (let dx = -5; dx <= 5; dx++) {
        const x = Math.round(x0 + dx);
        const v = Math.cos((dx / 5) * (Math.PI / 2));
        h[y * S + ((x + S) % S)] = Math.max(h[y * S + ((x + S) % S)], v * 0.6);
      }
    gm.fillStyle = 'rgba(160,160,150,0.18)';
    gm.fillRect(x0 - 1, 0, 2, S);
  }
  const [cn, gn] = mkCanvas(S, S);
  gn.putImageData(heightToNormal(gn, h, S, S, 1.6), 0, 0);
  return { map: cached(key + 'm', () => tex(cm, true)), normal: cached(key + 'n', () => tex(cn, false)) };
}

/** Quilted beta-cloth micrometeoroid blanket (station modules): pillowed squares, 0.5 m repeat. */
export function quiltTex(): { map: THREE.Texture; normal: THREE.Texture } {
  const key = 'quilt';
  if (cache.has(key + 'm')) return { map: cache.get(key + 'm')!, normal: cache.get(key + 'n')! };
  const S = 512;
  const [cm, gm] = mkCanvas(S, S);
  const h = new Float32Array(S * S);
  const r = rng(33);
  const n = 4;
  const c = S / n;
  gm.fillStyle = '#e9e5da';
  gm.fillRect(0, 0, S, S);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const v = 226 + r() * 14;
      gm.fillStyle = `rgb(${v},${v - 3},${v - 10})`;
      gm.fillRect(i * c + 2, j * c + 2, c - 4, c - 4);
    }
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const u = ((x % c) / c) * Math.PI;
      const v = ((y % c) / c) * Math.PI;
      h[y * S + x] = Math.pow(Math.sin(u) * Math.sin(v), 0.35);
    }
  gm.strokeStyle = 'rgba(120,110,90,0.35)';
  gm.lineWidth = 1.5;
  gm.setLineDash([3, 3]);
  for (let k = 0; k <= n; k++) {
    gm.beginPath();
    gm.moveTo(k * c, 0);
    gm.lineTo(k * c, S);
    gm.stroke();
    gm.beginPath();
    gm.moveTo(0, k * c);
    gm.lineTo(S, k * c);
    gm.stroke();
  }
  const [cn, gn] = mkCanvas(S, S);
  gn.putImageData(heightToNormal(gn, h, S, S, 1.8), 0, 0);
  return { map: cached(key + 'm', () => tex(cm, true)), normal: cached(key + 'n', () => tex(cn, false)) };
}

export type HatchKind = 'metal' | 'composite' | 'honeycomb' | 'ablatorCells' | 'insulation' | 'fabric' | 'ceramic';

/**
 * Section (cut-face) patterns in the language of engineering drawings: 45 degree hatching for
 * metals, laminate lines for composites, cell walls for honeycomb and filled honeycomb ablator,
 * fibre waves for insulation. 1 texture repeat = 0.12 m of section.
 */
export const HATCH_REPEAT = 0.12;
export function hatchTex(kind: HatchKind): THREE.Texture {
  return cached(`hatch-${kind}`, () => {
    const S = 256;
    const [c, g] = mkCanvas(S, S);
    const r = rng(kind.length * 17);
    const bg: Record<HatchKind, string> = {
      metal: '#d9dcdf',
      composite: '#6c6f76',
      honeycomb: '#c9bf9e',
      ablatorCells: '#6b5240',
      insulation: '#eadfb8',
      fabric: '#e6e1d4',
      ceramic: '#efeeea',
    };
    g.fillStyle = bg[kind];
    g.fillRect(0, 0, S, S);
    if (kind === 'metal') {
      g.strokeStyle = 'rgba(70,74,80,0.85)';
      g.lineWidth = 3;
      for (let k = -S; k < 2 * S; k += 32) {
        g.beginPath();
        g.moveTo(k, S);
        g.lineTo(k + S, 0);
        g.stroke();
      }
    } else if (kind === 'composite') {
      for (let y = 0; y < S; y += 6) {
        g.fillStyle = y % 12 ? 'rgba(20,20,24,0.55)' : 'rgba(150,155,165,0.35)';
        g.fillRect(0, y, S, 2);
      }
    } else if (kind === 'honeycomb') {
      g.strokeStyle = 'rgba(90,80,55,0.9)';
      g.lineWidth = 2;
      for (let x = 0; x < S; x += 21) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, S);
        g.stroke();
      }
    } else if (kind === 'ablatorCells') {
      // phenolic honeycomb cell walls (vertical) filled with ablator, fine speckle
      for (let k = 0; k < 2200; k++) {
        g.fillStyle = r() < 0.5 ? 'rgba(40,28,20,0.35)' : 'rgba(150,120,95,0.3)';
        g.fillRect(r() * S, r() * S, 2, 2);
      }
      g.strokeStyle = 'rgba(214,190,140,0.9)';
      g.lineWidth = 2;
      for (let x = 0; x < S; x += 16) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, S);
        g.stroke();
      }
    } else if (kind === 'insulation') {
      g.strokeStyle = 'rgba(170,140,70,0.6)';
      g.lineWidth = 1.5;
      for (let y = 4; y < S; y += 9) {
        g.beginPath();
        for (let x = 0; x <= S; x += 8) g.lineTo(x, y + Math.sin(x * 0.08 + y) * 3);
        g.stroke();
      }
    } else if (kind === 'ceramic') {
      // porous silica tile: stipple, with a dense glassy coating line on one edge of each repeat
      for (let k = 0; k < 3000; k++) {
        g.fillStyle = `rgba(120,120,125,${0.15 + r() * 0.3})`;
        g.fillRect(r() * S, r() * S, 1.5, 1.5);
      }
      g.fillStyle = 'rgba(40,40,44,0.8)';
      g.fillRect(0, 0, S, 6);
    } else {
      g.strokeStyle = 'rgba(150,140,120,0.5)';
      g.lineWidth = 1;
      for (let k = 0; k < S; k += 4) {
        g.beginPath();
        g.moveTo(k, 0);
        g.lineTo(k, S);
        g.stroke();
      }
    }
    return tex(c, true);
  });
}

// ───────────────────────────── capsule surfaces ─────────────────────────────

export interface ConeSpec {
  /** Slant length (m) of the tiled backshell from the shoulder junction to the top edge. */
  L: number;
  /** Radius (m) at slant position s (0 = shoulder). */
  r: (s: number) => number;
  /** Slant positions (m) of window, hatch and thruster cut-outs that leave streak wakes. */
  wakes: { phi: number; s: number; w: number }[];
  /** Slant position below which tiles are black (hotter shoulder region). */
  blackTo: number;
}

/**
 * The reusable-tile backshell, developed onto (azimuth, slant): rows of ~150 mm tiles, the
 * count per row following the circumference (so rows gain tiles toward the shoulder), staggered
 * joints, dark gaps, black tiles over the hotter lower cone and white tiles above.
 * u = azimuth / 2 pi (0 at +Z), v = slant / L (0 at the shoulder).
 */
export function backshellTiles(spec: ConeSpec, small: boolean): { map: THREE.Texture; normal: THREE.Texture; rough: THREE.Texture } {
  const key = `tiles-${small ? 's' : 'l'}`;
  if (cache.has(key + 'm')) return { map: cache.get(key + 'm')!, normal: cache.get(key + 'n')!, rough: cache.get(key + 'r')! };
  const W = texEdge(small ? 2048 : 4096);
  const H = W / 4;
  const [cm, gm] = mkCanvas(W, H);
  const [cr, gr] = mkCanvas(W, H);
  const hmap = new Float32Array(W * H);
  const r = rng(77);
  const tileH = 0.152;
  const rows = Math.round(spec.L / tileH);
  const dy = H / rows;
  gm.fillStyle = '#121213';
  gm.fillRect(0, 0, W, H);
  gr.fillStyle = 'rgb(240,240,240)';
  gr.fillRect(0, 0, W, H);
  for (let k = 0; k < rows; k++) {
    const s0 = (k / rows) * spec.L;
    const s1 = ((k + 1) / rows) * spec.L;
    const rm = spec.r((s0 + s1) / 2);
    const n = Math.max(8, Math.round((2 * Math.PI * rm) / tileH));
    const off = (k % 2) * 0.5 + (r() - 0.5) * 0.2;
    const pxPerM = W / (2 * Math.PI * rm);
    const gapX = Math.max(1.2, 0.0028 * pxPerM);
    const gapY = Math.max(1.2, (0.0028 / spec.L) * H);
    const yTop = H - ((k + 1) / rows) * H; // canvas y of the row's upper edge (v up = canvas up)
    for (let j = 0; j < n; j++) {
      const x0 = ((j + off) / n) * W;
      const x1 = ((j + 1 + off) / n) * W;
      const sMid = (s0 + s1) / 2;
      // crisp stepped boundary: every other tile of the boundary row stays black
      const edgeRow = Math.round(spec.blackTo / (spec.L / rows));
      const black = k < edgeRow || (k === edgeRow && j % 2 === 0);
      void sMid;
      const v = black ? 26 + r() * 9 : 222 + r() * 16;
      const col = black ? `rgb(${v},${v},${v + 1})` : `rgb(${v},${v - 2},${v - 7})`;
      const rv = black ? 205 + r() * 30 : 215 + r() * 30;
      for (const shift of [0, -W, W]) {
        const a = x0 + shift + gapX / 2;
        const b = x1 + shift - gapX / 2;
        if (b < 0 || a > W) continue;
        gm.fillStyle = col;
        gm.fillRect(a, yTop + gapY / 2, b - a, dy - gapY);
        gr.fillStyle = `rgb(${rv},${rv},${rv})`;
        gr.fillRect(a, yTop + gapY / 2, b - a, dy - gapY);
        // height: flat tile with a bevel to the gap
        const bev = Math.max(1.5, 0.004 * pxPerM);
        const bevY = Math.max(1.5, (0.004 / spec.L) * H);
        const ya = Math.max(0, Math.floor(yTop + gapY / 2));
        const yb = Math.min(H - 1, Math.ceil(yTop + dy - gapY / 2));
        const xa = Math.max(0, Math.floor(a));
        const xb = Math.min(W - 1, Math.ceil(b));
        for (let y = ya; y <= yb; y++) {
          const ey = Math.min(y - (yTop + gapY / 2), yTop + dy - gapY / 2 - y) / bevY;
          for (let x = xa; x <= xb; x++) {
            const ex = Math.min(x - a, b - x) / bev;
            hmap[y * W + x] = Math.max(0, Math.min(1, Math.min(ex, ey)));
          }
        }
      }
    }
  }
  const [cn, gn] = mkCanvas(W, H);
  gn.putImageData(heightToNormal(gn, hmap, W, H, 2.2, true, false), 0, 0);
  // subtle soiling toward the shoulder
  const grad = gm.createLinearGradient(0, H, 0, 0);
  grad.addColorStop(0, 'rgba(40,30,20,0.10)');
  grad.addColorStop(0.3, 'rgba(40,30,20,0.0)');
  gm.fillStyle = grad;
  gm.fillRect(0, 0, W, H);
  const map = cached(key + 'm', () => tex(cm, true));
  const normal = cached(key + 'n', () => tex(cn, false));
  const rough = cached(key + 'r', () => tex(cr, false));
  map.wrapT = normal.wrapT = rough.wrapT = THREE.ClampToEdgeWrapping;
  return { map, normal, rough };
}

/**
 * Entry streaks on the backshell (same developed mapping as the tiles): soot and ablation
 * products carried from the shoulder up the cone, heavier in the wakes of protrusions.
 * RGBA: dark brown with alpha.
 */
export function backshellStreaks(spec: ConeSpec): THREE.Texture {
  return cached('streaks', () => {
    const W = texEdge(2048);
    const H = W / 4;
    const [c, g] = mkCanvas(W, H);
    const r = rng(101);
    g.clearRect(0, 0, W, H);
    // broad soot from the shoulder
    for (let k = 0; k < 900; k++) {
      const x = r() * W;
      const len = H * (0.25 + r() * 0.75) * (0.4 + 0.6 * r());
      const w = 2 + r() * 10;
      const a = 0.04 + r() * 0.1;
      const grad = g.createLinearGradient(0, H, 0, H - len);
      grad.addColorStop(0, `rgba(28,20,14,${a * 2})`);
      grad.addColorStop(1, 'rgba(28,20,14,0)');
      g.fillStyle = grad;
      g.fillRect(x - w / 2, H - len, w, len);
    }
    // wakes behind protrusions (window frames, hatch, thrusters)
    for (const wk of spec.wakes) {
      const x = ((((wk.phi / (2 * Math.PI)) % 1) + 1) % 1) * W;
      const y = H - (wk.s / spec.L) * H;
      const wpx = (wk.w / (2 * Math.PI * spec.r(wk.s))) * W;
      for (let k = 0; k < 14; k++) {
        const xx = x + (r() - 0.5) * wpx;
        const grad = g.createLinearGradient(0, y, 0, 0);
        grad.addColorStop(0, `rgba(20,14,10,${0.25 + r() * 0.2})`);
        grad.addColorStop(1, 'rgba(20,14,10,0)');
        g.fillStyle = grad;
        g.fillRect(xx - 2 - r() * 4, 0, 3 + r() * 6, y);
      }
    }
    const t = tex(c, true);
    t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

/**
 * Heat-shield surface in a disc mapping (u, v = x, z over the 3.9 m diameter): cast ablator in
 * a phenolic honeycomb (fine hex cells), a ring of bonded blocks with gap filler, tone variation.
 * Also returns a char pattern (R channel) used by the charring shader.
 */
export function ablatorTex(): { map: THREE.Texture; normal: THREE.Texture; char: THREE.Texture } {
  const key = 'ablator';
  if (cache.has(key + 'm')) return { map: cache.get(key + 'm')!, normal: cache.get(key + 'n')!, char: cache.get(key + 'c')! };
  const S = texEdge(2048);
  const [cm, gm] = mkCanvas(S, S);
  const [cc, gc] = mkCanvas(S, S);
  const h = new Float32Array(S * S);
  const r = rng(55);
  gm.fillStyle = '#6a5442';
  gm.fillRect(0, 0, S, S);
  // mottling
  for (let k = 0; k < 2600; k++) {
    const v = r();
    gm.fillStyle = v < 0.5 ? `rgba(40,30,22,${0.03 + r() * 0.05})` : `rgba(150,125,100,${0.03 + r() * 0.04})`;
    gm.beginPath();
    gm.arc(r() * S, r() * S, 4 + r() * 40, 0, Math.PI * 2);
    gm.fill();
  }
  // hex honeycomb cells (~20 mm) as faint walls
  const cell = (0.02 / 3.9) * S;
  const hx = cell * Math.sqrt(3);
  gm.strokeStyle = 'rgba(190,160,120,0.16)';
  gm.lineWidth = Math.max(0.7, cell * 0.08);
  for (let y = 0, row = 0; y < S + cell; y += cell * 1.5, row++) {
    for (let x = row % 2 ? hx / 2 : 0; x < S + hx; x += hx) {
      gm.beginPath();
      for (let a = 0; a < 6; a++) {
        const ang = Math.PI / 6 + (a * Math.PI) / 3;
        gm.lineTo(x + Math.cos(ang) * cell, y + Math.sin(ang) * cell);
      }
      gm.closePath();
      gm.stroke();
    }
  }
  // block seams: centre block, then rings of blocks (gap filler lighter)
  const cx = S / 2;
  const R = S / 2;
  gm.strokeStyle = 'rgba(175,150,120,0.55)';
  gm.lineWidth = Math.max(1.5, S / 900);
  const rings = [0.18, 0.42, 0.68, 0.93];
  for (const f of rings) {
    gm.beginPath();
    gm.arc(cx, cx, f * R, 0, Math.PI * 2);
    gm.stroke();
  }
  const counts = [6, 12, 18, 24];
  for (let i = 0; i < counts.length; i++) {
    const n = counts[i];
    const r0 = rings[i] * R;
    const r1 = (rings[i + 1] ?? 1.02) * R;
    const off = i * 0.37;
    for (let k = 0; k < n; k++) {
      const a = off + (k / n) * Math.PI * 2;
      gm.beginPath();
      gm.moveTo(cx + Math.cos(a) * r0, cx + Math.sin(a) * r0);
      gm.lineTo(cx + Math.cos(a) * r1, cx + Math.sin(a) * r1);
      gm.stroke();
    }
  }
  // height: seams sunk slightly
  const img = gm.getImageData(0, 0, S, S).data;
  for (let p = 0; p < S * S; p++) h[p] = 1 - Math.max(0, img[p * 4] - 140) / 200;
  const [cn, gn] = mkCanvas(S, S);
  gn.putImageData(heightToNormal(gn, h, S, S, 1.4), 0, 0);
  // char: dark with lighter scoured patches and flow streaks radiating out
  gc.fillStyle = 'rgb(40,40,40)';
  gc.fillRect(0, 0, S, S);
  for (let k = 0; k < 1500; k++) {
    gc.fillStyle = `rgba(255,255,255,${0.04 + r() * 0.08})`;
    gc.beginPath();
    gc.arc(r() * S, r() * S, 3 + r() * 30, 0, Math.PI * 2);
    gc.fill();
  }
  gc.lineCap = 'round';
  for (let k = 0; k < 500; k++) {
    const a = r() * Math.PI * 2;
    const r0 = r() * R * 0.8;
    const len = R * (0.05 + r() * 0.25);
    gc.strokeStyle = `rgba(0,0,0,${0.1 + r() * 0.2})`;
    gc.lineWidth = 1 + r() * 5;
    gc.beginPath();
    gc.moveTo(cx + Math.cos(a) * r0, cx + Math.sin(a) * r0);
    gc.lineTo(cx + Math.cos(a) * (r0 + len), cx + Math.sin(a) * (r0 + len));
    gc.stroke();
  }
  const map = cached(key + 'm', () => tex(cm, true, false));
  const normal = cached(key + 'n', () => tex(cn, false, false));
  const char = cached(key + 'c', () => tex(cc, false, false));
  return { map, normal, char };
}

// ───────────────────────────── identity decal ─────────────────────────────

/**
 * KIMBLE mark + wordmark with a small ONE / FAB beneath, on a transparent canvas, from the
 * brand paths (never mirrored: the canvas is drawn upright and mapped with u to the right).
 * Layout units follow the interface lockup (src/brand/Logo.tsx): mark 100 units tall, wordmark
 * cap height 50 at x = 124. Returns the texture and its aspect (width / height).
 */
export const DECAL_UNITS = { w: 520, h: 150 };
export function kimbleDecal(): THREE.Texture {
  return cached('decal', () => {
    const W = texEdge(2048);
    const k = W / DECAL_UNITS.w;
    const H = Math.round(DECAL_UNITS.h * k);
    const [c, g] = mkCanvas(W, H);
    g.clearRect(0, 0, W, H);
    g.save();
    g.scale(k, k);
    g.translate(2, 2);
    g.fillStyle = GRAPHITE;
    g.fill(new Path2D(MARK.body));
    g.fillStyle = ACCENT;
    g.fill(new Path2D(MARK.arm));
    g.save();
    const cap = 50;
    g.translate(124, 75);
    g.scale(cap * WORD_KIMBLE.scale, cap * WORD_KIMBLE.scale);
    g.fillStyle = GRAPHITE;
    g.fill(new Path2D(WORD_KIMBLE.d));
    g.restore();
    g.save();
    const cap2 = 17;
    g.translate(126, 128);
    g.scale(cap2 * WORD_ONEFAB.scale, cap2 * WORD_ONEFAB.scale);
    g.fillStyle = '#4a4e56';
    g.fill(new Path2D(WORD_ONEFAB.d));
    g.restore();
    g.restore();
    const t = tex(c, true, false);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

// ───────────────────────────── parachute fabric ─────────────────────────────

/**
 * Canopy alpha: horizontal slots between the sails/ribbons (v = 0 at the vent, 1 at the skirt).
 * 'ringsail' mains: a few wide sails with narrow slots; 'ribbon' drogues: many ribbons with gaps
 * and vertical tapes.
 */
export function canopyAlpha(kind: 'ringsail' | 'ribbon'): THREE.Texture {
  return cached(`canopy-${kind}`, () => {
    const W = 64;
    const H = 1024;
    const [c, g] = mkCanvas(W, H);
    g.fillStyle = '#fff';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#000';
    if (kind === 'ringsail') {
      // slots in the crown region only (canvas y 0 = top = v 1 = skirt after flip, so draw by v)
      const slots = [0.2, 0.3, 0.4, 0.5, 0.6];
      for (const v of slots) g.fillRect(0, (1 - v) * H - 4, W, 7);
    } else {
      for (let v = 0.12; v < 0.97; v += 0.045) g.fillRect(0, (1 - v) * H - 6, W, 11);
      g.fillStyle = '#fff';
      g.fillRect(W / 2 - 2, 0, 4, H); // radial tape
    }
    const t = tex(c, false);
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  });
}

/** Woven nylon fabric (fine weave normal), 0.2 m repeat. */
export function fabricNormal(): THREE.Texture {
  return cached('fabricN', () => {
    const S = 128;
    const [c, g] = mkCanvas(S, S);
    const h = new Float32Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) h[y * S + x] = 0.5 + 0.25 * Math.sin((x / S) * Math.PI * 32) * Math.sign(Math.sin((y / S) * Math.PI * 16)) + 0.25 * Math.sin((y / S) * Math.PI * 32);
    g.putImageData(heightToNormal(g, h, S, S, 0.6), 0, 0);
    return tex(c, false);
  });
}

/** Generic grid texture for panel backs (carbon face sheet with an embedded wiring grid). */
export function panelBackTex(): THREE.Texture {
  return cached('panelBack', () => {
    const S = 256;
    const [c, g] = mkCanvas(S, S);
    const r = rng(3);
    g.fillStyle = '#1f2124';
    g.fillRect(0, 0, S, S);
    for (let k = 0; k < 300; k++) {
      g.fillStyle = `rgba(255,255,255,${r() * 0.025})`;
      g.fillRect(r() * S, r() * S, 1 + r() * 20, 1 + r() * 20);
    }
    // one bonded harness run per repeat (thin amber polyimide tape)
    g.fillStyle = 'rgba(170,120,50,0.22)';
    g.fillRect(0, S * 0.62, S, 3);
    return tex(c, true);
  });
}
