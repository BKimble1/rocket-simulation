/**
 * Procedural canvas textures for the site (generated once, no network): the hardstand's
 * concrete with expansion joints, stains and launch soot; refractory trench walls; heat-tinted
 * deflector plates; bar grating; chain-link fence; corrugated cladding; asphalt; the landing
 * zone's target marking; the hangar door with the KIMBLE mark.
 */
import * as THREE from 'three';
import { MARK, WORD_KIMBLE } from '../../brand/logoPaths';
import { GRAPHITE } from '../materials';
import { HARDSTAND, TRENCH, trenchXZ, RAMP } from './layout';

function canvas(w: number, h = w): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

export function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tex(c: HTMLCanvasElement, srgb = true, repeat = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Soft mottling: many faint translucent blobs. */
function mottle(g: CanvasRenderingContext2D, w: number, h: number, r: () => number, n: number, rMin: number, rMax: number, colors: string[], alpha: number) {
  for (let i = 0; i < n; i++) {
    const x = r() * w;
    const y = r() * h;
    const rad = rMin + r() * (rMax - rMin);
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    const c = colors[Math.floor(r() * colors.length)];
    gr.addColorStop(0, c.replace('A', String(alpha * (0.4 + r() * 0.6))));
    gr.addColorStop(1, c.replace('A', '0'));
    g.fillStyle = gr;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
}

function grain(g: CanvasRenderingContext2D, w: number, h: number, r: () => number, amount: number) {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amount;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  g.putImageData(img, 0, 0);
}

const cache = new Map<string, THREE.Texture>();
function cached<T extends THREE.Texture>(key: string, make: () => T): T {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key) as T;
}

/** Hardstand top: the square x in [-60, 60], z in [-60, 60] (m) maps to the texture. */
export const PAD_TEX_EXT = 60;

export function hardstandTexture(): THREE.Texture {
  return cached('hardstand', () => {
    const S = 2048;
    const k = S / (2 * PAD_TEX_EXT);
    const [c, g] = canvas(S);
    const r = rng(101);
    const X = (x: number) => (x + PAD_TEX_EXT) * k;
    const Z = (z: number) => (z + PAD_TEX_EXT) * k;
    g.fillStyle = '#b3b0a8';
    g.fillRect(0, 0, S, S);
    // panels poured at different times: tone per 6 m panel
    const P = 6;
    for (let i = -10; i < 10; i++)
      for (let j = -10; j < 10; j++) {
        const t = r();
        g.fillStyle = `rgba(${t < 0.5 ? '90,86,80' : '215,212,204'},${0.05 + r() * 0.1})`;
        g.fillRect(X(i * P), Z(j * P), P * k, P * k);
      }
    mottle(g, S, S, r, 900, 10, 90, ['rgba(80,76,70,A)', 'rgba(150,140,120,A)', 'rgba(230,228,220,A)'], 0.12);
    // rust streaks and water stains
    mottle(g, S, S, r, 160, 6, 30, ['rgba(120,80,50,A)'], 0.12);
    // launch soot: dark around the flame hole, blown along the trench, lighter on the far side
    const hole = g.createRadialGradient(X(0), Z(0), 0, X(0), Z(0), 26 * k);
    hole.addColorStop(0, 'rgba(30,28,26,0.75)');
    hole.addColorStop(0.35, 'rgba(40,38,34,0.45)');
    hole.addColorStop(1, 'rgba(40,38,34,0)');
    g.fillStyle = hole;
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 90; i++) {
      const s = 4 + r() * 50;
      const v = (r() - 0.5) * (TRENCH.halfWidth * 2 + 10 + s * 0.3);
      const p = trenchXZ(s, v);
      const rad = (3 + r() * 9) * k;
      const gr = g.createRadialGradient(X(p.x), Z(p.z), 0, X(p.x), Z(p.z), rad);
      gr.addColorStop(0, `rgba(35,33,30,${0.12 + r() * 0.18})`);
      gr.addColorStop(1, 'rgba(35,33,30,0)');
      g.fillStyle = gr;
      g.fillRect(X(p.x) - rad, Z(p.z) - rad, rad * 2, rad * 2);
    }
    // transporter tyre tracks up the ramp to the mount
    g.strokeStyle = 'rgba(60,58,55,0.18)';
    for (const off of [-4.2, -2.9, 2.9, 4.2]) {
      g.lineWidth = 0.5 * k;
      g.beginPath();
      g.moveTo(X(RAMP.x + off), Z(62));
      g.lineTo(X(RAMP.x + off), Z(9));
      g.stroke();
    }
    // expansion joints (sawn, sealed: dark lines) every 6 m
    g.strokeStyle = 'rgba(55,52,48,0.8)';
    g.lineWidth = Math.max(1.5, 0.025 * k);
    for (let i = -10; i <= 10; i++) {
      g.beginPath();
      g.moveTo(X(i * P), 0);
      g.lineTo(X(i * P), S);
      g.stroke();
      g.beginPath();
      g.moveTo(0, Z(i * P));
      g.lineTo(S, Z(i * P));
      g.stroke();
    }
    // painted safety lines around the edge and the mount keep-out
    g.strokeStyle = 'rgba(214,176,52,0.85)';
    g.lineWidth = 0.18 * k;
    g.beginPath();
    HARDSTAND.forEach(([x, z], i) => {
      const s = 0.93;
      if (i) g.lineTo(X(x * s), Z(z * s));
      else g.moveTo(X(x * s), Z(z * s));
    });
    g.closePath();
    g.stroke();
    g.setLineDash([1.2 * k, 0.8 * k]);
    g.strokeRect(X(-11), Z(-11), 22 * k, 22 * k);
    g.setLineDash([]);
    grain(g, S, S, r, 18);
    const t = tex(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

/** Tileable concrete (walls, slabs): 256 px per ~4 m. */
export function concreteTexture(seed = 5, base = '#aaa79f', stains = 0.12): THREE.Texture {
  return cached(`concrete-${seed}-${base}`, () => {
    const S = 512;
    const [c, g] = canvas(S);
    const r = rng(seed);
    g.fillStyle = base;
    g.fillRect(0, 0, S, S);
    for (let pass = 0; pass < 2; pass++) {
      const ox = pass ? S : 0;
      void ox;
    }
    mottle(g, S, S, r, 260, 6, 60, ['rgba(70,66,60,A)', 'rgba(235,232,225,A)', 'rgba(140,130,110,A)'], stains);
    // vertical rain streaks
    for (let i = 0; i < 120; i++) {
      const x = r() * S;
      const y = r() * S * 0.6;
      const len = 30 + r() * 180;
      const gr = g.createLinearGradient(x, y, x, y + len);
      gr.addColorStop(0, `rgba(70,66,60,${0.05 + r() * 0.08})`);
      gr.addColorStop(1, 'rgba(70,66,60,0)');
      g.fillStyle = gr;
      g.fillRect(x, y, 1 + r() * 3, len);
    }
    grain(g, S, S, r, 22);
    return tex(c, true, true);
  });
}

/** Heat-stained, soot-streaked refractory concrete for the trench walls (u along the trench). */
export function refractoryTexture(): THREE.Texture {
  return cached('refractory', () => {
    const W = 1024;
    const H = 256;
    const [c, g] = canvas(W, H);
    const r = rng(77);
    g.fillStyle = '#8c877e';
    g.fillRect(0, 0, W, H);
    mottle(g, W, H, r, 220, 8, 50, ['rgba(40,36,32,A)', 'rgba(170,160,145,A)'], 0.3);
    // soot heavier near the deflector end (u=0) and low on the wall
    const gr = g.createLinearGradient(0, 0, W, 0);
    gr.addColorStop(0, 'rgba(28,26,24,0.85)');
    gr.addColorStop(0.35, 'rgba(38,35,32,0.5)');
    gr.addColorStop(1, 'rgba(50,46,42,0.15)');
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 260; i++) {
      const x = r() * W;
      const y = H * (0.3 + r() * 0.7);
      g.fillStyle = `rgba(25,23,21,${0.1 + r() * 0.2})`;
      g.fillRect(x, y, 6 + r() * 60, 1 + r() * 3);
    }
    // form-tie holes and panel lines
    g.fillStyle = 'rgba(30,28,26,0.5)';
    for (let x = 16; x < W; x += 64) for (let y = 24; y < H; y += 64) g.fillRect(x, y, 3, 3);
    g.fillStyle = 'rgba(40,38,34,0.45)';
    for (let x = 0; x < W; x += 128) g.fillRect(x, 0, 2, H);
    grain(g, W, H, r, 26);
    return tex(c, true, true);
  });
}

/** Deflector face: welded steel plates with heat tint and scouring (u across, v along the flow). */
export function deflectorTexture(): THREE.Texture {
  return cached('deflector', () => {
    const S = 1024;
    const [c, g] = canvas(S);
    const r = rng(33);
    g.fillStyle = '#7a756d';
    g.fillRect(0, 0, S, S);
    const tint = g.createLinearGradient(0, 0, 0, S);
    tint.addColorStop(0, 'rgba(70,80,110,0.25)');
    tint.addColorStop(0.3, 'rgba(120,90,60,0.35)');
    tint.addColorStop(0.6, 'rgba(60,55,50,0.45)');
    tint.addColorStop(1, 'rgba(90,85,78,0.2)');
    g.fillStyle = tint;
    g.fillRect(0, 0, S, S);
    mottle(g, S, S, r, 200, 10, 70, ['rgba(40,36,34,A)', 'rgba(150,120,90,A)', 'rgba(90,100,130,A)'], 0.3);
    // flow scouring streaks along v
    for (let i = 0; i < 400; i++) {
      const x = r() * S;
      const y = r() * S;
      g.fillStyle = `rgba(${r() < 0.5 ? '200,195,185' : '35,32,30'},${0.04 + r() * 0.08})`;
      g.fillRect(x, y, 1 + r() * 2, 20 + r() * 140);
    }
    // plate seams (welds)
    g.fillStyle = 'rgba(45,42,40,0.7)';
    for (let x = 0; x < S; x += 128) g.fillRect(x, 0, 3, S);
    for (let y = 0; y < S; y += 170) g.fillRect(0, y, S, 3);
    grain(g, S, S, r, 20);
    return tex(c, true, true);
  });
}

/** Bar grating: bearing bars and cross rods, alpha where open (tiles every 0.5 m). */
export function gratingTexture(): THREE.Texture {
  return cached('grating', () => {
    const S = 128;
    const [c, g] = canvas(S);
    g.clearRect(0, 0, S, S);
    g.fillStyle = '#b9bcbe';
    for (let x = 0; x < S; x += 8) g.fillRect(x, 0, 2, S);
    g.fillStyle = '#a2a5a8';
    for (let y = 0; y < S; y += 32) g.fillRect(0, y, S, 2);
    const t = tex(c, true, true);
    t.anisotropy = 4;
    return t;
  });
}

/** Chain-link mesh: diamond wires, alpha elsewhere (tile = 0.6 m). */
export function chainLinkTexture(): THREE.Texture {
  return cached('chainlink', () => {
    const S = 128;
    const [c, g] = canvas(S);
    g.clearRect(0, 0, S, S);
    g.strokeStyle = 'rgba(190,194,196,1)';
    g.lineWidth = 2.2;
    const n = 4;
    const step = S / n;
    for (let i = -n; i <= 2 * n; i++) {
      g.beginPath();
      g.moveTo(i * step, 0);
      g.lineTo(i * step + S, S);
      g.stroke();
      g.beginPath();
      g.moveTo(i * step, S);
      g.lineTo(i * step + S, 0);
      g.stroke();
    }
    return tex(c, true, true);
  });
}

/** Corrugated cladding normal map (vertical ribs, tile 1 m). */
export function corrugationNormal(): THREE.Texture {
  return cached('corrugation', () => {
    const W = 128;
    const H = 8;
    const [c, g] = canvas(W, H);
    const img = g.createImageData(W, H);
    for (let x = 0; x < W; x++) {
      const ph = (x / W) * Math.PI * 2 * 5;
      const nx = Math.sin(ph) * 0.55;
      for (let y = 0; y < H; y++) {
        const i = (y * W + x) * 4;
        img.data[i] = 128 + nx * 127;
        img.data[i + 1] = 128;
        img.data[i + 2] = 255;
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return tex(c, false, true);
  });
}

/** Asphalt with a little aggregate sparkle and tar patches (tile 8 m). */
export function asphaltTexture(): THREE.Texture {
  return cached('asphalt', () => {
    const S = 512;
    const [c, g] = canvas(S);
    const r = rng(9);
    g.fillStyle = '#4a4946';
    g.fillRect(0, 0, S, S);
    mottle(g, S, S, r, 200, 8, 70, ['rgba(30,30,30,A)', 'rgba(110,108,102,A)'], 0.2);
    grain(g, S, S, r, 40);
    return tex(c, true, true);
  });
}

/** Landing-zone slab: an original target (rings and ticks), scorch from landings (square, 1 px = 5 cm). */
export function lzTexture(radius: number): THREE.Texture {
  return cached('lz', () => {
    const S = 2048;
    const [c, g] = canvas(S);
    const r = rng(55);
    const k = S / (2 * radius);
    const C = S / 2;
    g.fillStyle = '#b6b3ab';
    g.fillRect(0, 0, S, S);
    mottle(g, S, S, r, 400, 10, 80, ['rgba(80,76,70,A)', 'rgba(220,218,210,A)'], 0.1);
    // landing burn soot, darkest near the centre
    const soot = g.createRadialGradient(C, C, 0, C, C, radius * 0.55 * k);
    soot.addColorStop(0, 'rgba(35,33,30,0.55)');
    soot.addColorStop(0.5, 'rgba(45,42,38,0.25)');
    soot.addColorStop(1, 'rgba(45,42,38,0)');
    g.fillStyle = soot;
    g.fillRect(0, 0, S, S);
    // joints on a 7.5 m grid inside the circle
    g.save();
    g.beginPath();
    g.arc(C, C, radius * k, 0, Math.PI * 2);
    g.clip();
    g.strokeStyle = 'rgba(60,57,52,0.6)';
    g.lineWidth = 2;
    for (let i = -8; i <= 8; i++) {
      const p = C + i * 7.5 * k;
      g.beginPath();
      g.moveTo(p, 0);
      g.lineTo(p, S);
      g.stroke();
      g.beginPath();
      g.moveTo(0, p);
      g.lineTo(S, p);
      g.stroke();
    }
    g.restore();
    // the marking: outer ring, inner ring, four radial ticks, a centre disc
    const paint = 'rgba(238,236,230,0.94)';
    g.strokeStyle = paint;
    g.lineWidth = 1.4 * k;
    g.beginPath();
    g.arc(C, C, (radius - 3.2) * k, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 0.7 * k;
    g.beginPath();
    g.arc(C, C, (radius - 5.6) * k, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 1.1 * k;
    g.beginPath();
    g.arc(C, C, 18 * k, 0, Math.PI * 2);
    g.stroke();
    g.lineCap = 'butt';
    g.lineWidth = 1.1 * k;
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      g.beginPath();
      g.moveTo(C + Math.cos(a) * 22 * k, C + Math.sin(a) * 22 * k);
      g.lineTo(C + Math.cos(a) * (radius - 8.5) * k, C + Math.sin(a) * (radius - 8.5) * k);
      g.stroke();
    }
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      g.lineWidth = 0.5 * k;
      g.beginPath();
      g.moveTo(C + Math.cos(a) * 30 * k, C + Math.sin(a) * 30 * k);
      g.lineTo(C + Math.cos(a) * (radius - 8.5) * k, C + Math.sin(a) * (radius - 8.5) * k);
      g.stroke();
    }
    g.fillStyle = paint;
    g.beginPath();
    g.arc(C, C, 4 * k, 0, Math.PI * 2);
    g.fill();
    // wear on the paint
    mottle(g, S, S, r, 300, 4, 26, ['rgba(120,116,108,A)'], 0.35);
    grain(g, S, S, r, 16);
    return tex(c);
  });
}

/** Hangar door leaves: white panels, vertical seams, the KIMBLE mark and wordmark in graphite. */
export function hangarDoorTexture(doorW: number, doorH: number): THREE.Texture {
  return cached('hangarDoor', () => {
    const W = 2048;
    const H = Math.round((W * doorH) / doorW);
    const [c, g] = canvas(W, H);
    const r = rng(12);
    const k = W / doorW;
    g.fillStyle = '#e9e8e3';
    g.fillRect(0, 0, W, H);
    mottle(g, W, H, r, 120, 20, 120, ['rgba(160,158,150,A)', 'rgba(255,255,255,A)'], 0.12);
    // corrugation shading bands every 0.25 m
    for (let x = 0; x < W; x += 0.25 * k) {
      g.fillStyle = 'rgba(0,0,0,0.035)';
      g.fillRect(x, 0, 0.1 * k, H);
    }
    // leaf seams (six leaves)
    const leaves = 6;
    g.fillStyle = 'rgba(60,62,66,0.55)';
    for (let i = 1; i < leaves; i++) g.fillRect((i * W) / leaves - 3, 0, 6, H);
    // grime at the bottom
    const grime = g.createLinearGradient(0, H, 0, H - 2.5 * k);
    grime.addColorStop(0, 'rgba(90,84,74,0.35)');
    grime.addColorStop(1, 'rgba(90,84,74,0)');
    g.fillStyle = grime;
    g.fillRect(0, H - 2.5 * k, W, 2.5 * k);
    // the mark: K symbol above the wordmark, centred, restrained (about a third of the door width)
    g.fillStyle = GRAPHITE;
    const markH = doorH * 0.36 * k;
    const s = markH / MARK.size;
    const wordCap = markH * 0.22;
    const wordW = WORD_KIMBLE.width * wordCap;
    const total = markH + wordCap * 0.9 + wordCap;
    const top = (H - total) / 2 - H * 0.04;
    g.save();
    g.translate(W / 2 - (MARK.size * s) / 2, top);
    g.scale(s, s);
    g.fill(new Path2D(MARK.body));
    g.fill(new Path2D(MARK.arm));
    g.restore();
    g.save();
    g.translate(W / 2 - wordW / 2, top + markH + wordCap * 0.9 + wordCap);
    const ws = wordCap * WORD_KIMBLE.scale;
    g.scale(ws, ws);
    g.fill(new Path2D(WORD_KIMBLE.d));
    g.restore();
    grain(g, W, H, r, 10);
    return tex(c);
  });
}

/** Small tileable noise for roughness variation on painted steel (linear). */
export function paintRoughness(): THREE.Texture {
  return cached('paintRough', () => {
    const S = 256;
    const [c, g] = canvas(S);
    const r = rng(4);
    g.fillStyle = '#9a9a9a';
    g.fillRect(0, 0, S, S);
    mottle(g, S, S, r, 200, 4, 30, ['rgba(60,60,60,A)', 'rgba(220,220,220,A)'], 0.3);
    grain(g, S, S, r, 30);
    return tex(c, false, true);
  });
}
