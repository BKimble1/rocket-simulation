/**
 * Turbopump and gas generator. Housings are solids of revolution about the turbopump axis
 * (sectioned in hangar detail with hatched caps); volutes are scroll sweeps whose cross-section
 * grows toward the discharge; the rotor (shaft, inducers with helical blades, impellers with
 * backswept vanes, turbine disc with crescent impulse blades, bearing races and balls,
 * labyrinth seal teeth) is whole and turns with the shaft. The gas generator sits under the
 * turbine: injector head at the bottom, sooty combustor, hot gas up into the turbine plenum;
 * the turbine exhausts into a collector that feeds the exhaust duct (see plumbing.ts).
 */
import * as THREE from 'three';
import type { Design } from './design';
import { clippedTube, hexBolt, merge, revolve, ringOf, roundPoly, sweep, type Frame, type V2 } from './geo';
import type { Kit, Tag } from './kit';
import { TP } from './layout';
import { lathe } from './tca';
import type { EngineDetail } from './types';

const TAU = Math.PI * 2;
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Indexed grid geometry with normals oriented toward `want` at its centre. */
export function gridGeo(P: THREE.Vector3[][], want: THREE.Vector3 | null): THREE.BufferGeometry {
  const rows = P.length;
  const cols = P[0].length;
  const pos: number[] = [];
  const uv: number[] = [];
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++) {
      pos.push(P[i][j].x, P[i][j].y, P[i][j].z);
      uv.push(j / Math.max(1, cols - 1), i / Math.max(1, rows - 1));
    }
  const idx: number[] = [];
  for (let i = 0; i < rows - 1; i++)
    for (let j = 0; j < cols - 1; j++) {
      const a = i * cols + j;
      idx.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (want) {
    const n = g.attributes.normal;
    const c = Math.floor(rows / 2) * cols + Math.floor(cols / 2);
    const nn = new THREE.Vector3().fromBufferAttribute(n, c);
    if (nn.dot(want) < 0) {
      for (let t = 0; t < idx.length; t += 3) [idx[t + 1], idx[t + 2]] = [idx[t + 2], idx[t + 1]];
      g.setIndex(idx);
      g.computeVertexNormals();
    }
  }
  return g;
}

/** A thin plate of thickness th around a surface grid (offset along the given unit normals). */
export function sheet(P: THREE.Vector3[][], N: THREE.Vector3[][], th: number): THREE.BufferGeometry {
  const off = (s: number) => P.map((row, i) => row.map((p, j) => p.clone().addScaledVector(N[i][j], (s * th) / 2)));
  const top = off(1);
  const bot = off(-1);
  const rows = P.length;
  const cols = P[0].length;
  const mid = P[Math.floor(rows / 2)][Math.floor(cols / 2)];
  const nMid = N[Math.floor(rows / 2)][Math.floor(cols / 2)];
  const parts: THREE.BufferGeometry[] = [gridGeo(top, nMid.clone()), gridGeo(bot, nMid.clone().negate())];
  const edge = (a: THREE.Vector3[], b: THREE.Vector3[]) => {
    const g = gridGeo([a, b], null);
    // orient away from the sheet centre
    const c = a[Math.floor(a.length / 2)].clone().add(b[Math.floor(b.length / 2)]).multiplyScalar(0.5);
    const want = c.sub(mid);
    const n = new THREE.Vector3().fromBufferAttribute(g.attributes.normal, Math.floor(a.length / 2));
    if (n.dot(want) < 0) {
      const ix = g.index!;
      for (let t = 0; t < ix.count; t += 3) {
        const tmp = ix.getX(t + 1);
        ix.setX(t + 1, ix.getX(t + 2));
        ix.setX(t + 2, tmp);
      }
      g.computeVertexNormals();
    }
    return g;
  };
  parts.push(edge(top[0], bot[0]), edge(top[rows - 1], bot[rows - 1]));
  parts.push(
    edge(
      top.map((r) => r[0]),
      bot.map((r) => r[0]),
    ),
    edge(
      top.map((r) => r[cols - 1]),
      bot.map((r) => r[cols - 1]),
    ),
  );
  return merge(parts);
}

/** Helical inducer blades (count, wrap in rad) between hub and tip radii, y0 (top) to y1. */
function inducer(c: THREE.Vector3, rHub: number, rTip: number, y0: number, y1: number, wrap: number, count: number, th: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const nr = 3;
  const nt = 20;
  for (let b = 0; b < count; b++) {
    const ph = (b * TAU) / count;
    const P: THREE.Vector3[][] = [];
    const N: THREE.Vector3[][] = [];
    for (let i = 0; i <= nr; i++) {
      const r = rHub - 0.001 + ((rTip - rHub + 0.001) * i) / nr;
      const row: THREE.Vector3[] = [];
      const nrow: THREE.Vector3[] = [];
      for (let j = 0; j <= nt; j++) {
        const t = j / nt;
        // swept leading edge: the tip starts later than the hub
        const lead = 0.18 * (i / nr);
        const tt = lead + (1 - lead) * t;
        const a = ph + wrap * tt;
        const y = y0 + (y1 - y0) * tt;
        row.push(V(c.x + r * Math.sin(a), y, c.z + r * Math.cos(a)));
        // blade surface normal ~ axial with a tilt from the helix angle
        const pitch = (y0 - y1) / (wrap * r);
        const tang = V(Math.cos(a), 0, -Math.sin(a));
        nrow.push(V(0, 1, 0).addScaledVector(tang, pitch).normalize());
      }
      P.push(row);
      N.push(nrow);
    }
    parts.push(sheet(P, N, th));
  }
  return merge(parts);
}

/** Backswept impeller vanes standing on the hub surface. */
function vanes(c: THREE.Vector3, rIn: number, rOut: number, yHub: (r: number) => number, yTop: (r: number) => number, count: number, sweepRad: number, th: number, phase = 0): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const nr = 9;
  for (let b = 0; b < count; b++) {
    const ph = phase + (b * TAU) / count;
    const P: THREE.Vector3[][] = [];
    const N: THREE.Vector3[][] = [];
    for (let i = 0; i <= nr; i++) {
      const s = i / nr;
      const r = rIn + (rOut - rIn) * s;
      const a = ph - sweepRad * Math.pow(s, 1.3);
      const a2 = ph - sweepRad * Math.pow(Math.min(1, s + 0.01), 1.3);
      const r2 = rIn + (rOut - rIn) * Math.min(1, s + 0.01);
      const p = V(c.x + r * Math.sin(a), 0, c.z + r * Math.cos(a));
      const q = V(c.x + r2 * Math.sin(a2), 0, c.z + r2 * Math.cos(a2));
      const tan = q.sub(p).setY(0).normalize();
      const n = V(tan.z, 0, -tan.x);
      P.push([p.clone().setY(yHub(r) - 0.002), p.clone().setY(yTop(r))]);
      N.push([n, n]);
    }
    parts.push(sheet(P, N, th));
  }
  return merge(parts);
}

/** Crescent impulse blades on the turbine rim. */
function turbineBlades(c: THREE.Vector3, r0: number, r1: number, yLo: number, yHi: number, count: number): THREE.BufferGeometry {
  // blade section in (tangential s, axial y): a crescent, camber turning the flow
  const h = yHi - yLo;
  const prof: V2[] = [];
  const n = 8;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    prof.push([-0.0045 + 0.0055 * Math.sin(t * Math.PI), yLo + h * t]);
  }
  for (let i = n; i >= 0; i--) {
    const t = i / n;
    prof.push([-0.0045 + 0.0022 + 0.0022 * Math.sin(t * Math.PI) - 0.0012 * (1 - Math.sin(t * Math.PI)), yLo + h * t]);
  }
  // CCW for the sweep
  const parts: THREE.BufferGeometry[] = [];
  for (let b = 0; b < count; b++) {
    const a = (b * TAU) / count;
    const radial = V(Math.sin(a), 0, Math.cos(a));
    const tang = V(Math.cos(a), 0, -Math.sin(a));
    const frames: Frame[] = [r0, r1].map((r) => ({ p: c.clone().addScaledVector(radial, r), n: tang, b: V(0, 1, 0), u: r }));
    const res = sweep([{ pts: prof }], frames, { caps: true, crease: 60 });
    parts.push(merge([res.surf, res.caps]));
  }
  return merge(parts);
}

/** Frames of a scroll (volute) around the pump axis: section grows with the angle. */
function voluteFrames(c: THREE.Vector3, y: number, segs: number): { frames: Frame[]; rho: (t: number) => number } {
  const vo = TP.volute;
  const rho = (t: number) => vo.rho0 + (vo.rho1 - vo.rho0) * t;
  const frames: Frame[] = [];
  const n = Math.max(24, Math.round(segs * 0.85));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = Math.PI + 0.12 + (TAU - 0.12) * t;
    const R = vo.rin + rho(t);
    const radial = V(Math.sin(a), 0, Math.cos(a));
    frames.push({ p: V(c.x, y, c.z).addScaledVector(radial, R), n: radial, b: V(0, 1, 0), u: a * R });
  }
  return { frames, rho };
}

export function buildTurbomachinery(k: Kit, d: Design, detail: EngineDetail, _segs: number) {
  const c = V(d.tpX, 0, 0);
  const s = detail === 'hangar' ? 48 : detail === 'flight' ? 20 : 14;
  const tp = (mat: Tag['mat']): Tag => ({ part: 'turbopump', mat });
  const gg = (mat: Tag['mat']): Tag => ({ part: 'gas-generator', mat });
  const L = (pts: V2[], t: Tag, r = 0.0025, holes: V2[][] = []) => lathe(k, [{ pts: detail === 'hangar' ? roundPoly(pts, r, 1) : pts }, ...holes.map((h) => ({ pts: h, hole: true }))], t, s, { centre: c });

  if (detail === 'cluster') {
    // one simplified powerhead silhouette: pump casings, turbine and gas generator
    lathe(
      k,
      [
        {
          pts: [
            [0.0005, TP.loxInletTop],
            [0.105, TP.loxInletTop],
            [0.12, -0.1],
            [0.13, -0.14],
            [0.07, -0.19],
            [0.066, -0.29],
            [0.12, -0.35],
            [0.13, -0.4],
            [0.07, -0.44],
            [0.125, -0.47],
            [0.13, -0.59],
            [0.058, -0.64],
            [0.058, -0.86],
            [0.07, -0.87],
            [0.04, -0.905],
            [0.0005, -0.909],
          ],
        },
      ],
      { part: 'turbopump', mat: 'aluminum' },
      s,
      { centre: c },
    );
    return;
  }

  // ── LOX pump casing: inlet flange, shroud (A) and back wall with bearing flange (B) ──
  L(
    [
      [0.11, 0],
      [0.11, -0.02],
      [0.092, -0.022],
      [0.088, -0.06],
      [0.096, -0.092],
      [0.106, -0.112],
      [0.089, -0.116],
      [0.08, -0.108],
      [0.071, -0.094],
      [0.068, -0.064],
      [0.068, -0.052],
      [0.076, -0.036],
      [0.076, 0],
    ],
    tp('aluminum'),
  );
  L(
    [
      [0.106, -0.14],
      [0.1, -0.156],
      [0.08, -0.166],
      [0.068, -0.17],
      [0.074, -0.172],
      [0.074, -0.184],
      [0.043, -0.184],
      [0.043, -0.172],
      [0.03, -0.162],
      [0.03, -0.15],
      [0.088, -0.146],
    ],
    tp('aluminum'),
  );
  // ── bearing and seal housing between the pumps ──
  L(
    [
      [0.043, -0.184],
      [0.074, -0.184],
      [0.074, -0.196],
      [0.062, -0.198],
      [0.062, -0.278],
      [0.074, -0.28],
      [0.074, -0.292],
      [0.043, -0.292],
      [0.043, -0.26],
      [0.047, -0.258],
      [0.047, -0.197],
      [0.043, -0.195],
    ],
    tp('aluminum'),
  );
  // ── fuel inlet plenum, shroud (A) and back wall (B) ──
  L(
    [
      [0.074, -0.292],
      [0.098, -0.296],
      [0.1, -0.312],
      [0.1, -0.345],
      [0.096, -0.356],
      [0.104, -0.366],
      [0.09, -0.37],
      [0.08, -0.362],
      [0.064, -0.35],
      [0.06, -0.338],
      [0.062, -0.332],
      [0.088, -0.33],
      [0.088, -0.306],
      [0.036, -0.304],
      [0.036, -0.292],
    ],
    tp('aluminum'),
  );
  L(
    [
      [0.104, -0.394],
      [0.1, -0.41],
      [0.08, -0.418],
      [0.068, -0.42],
      [0.068, -0.432],
      [0.043, -0.432],
      [0.043, -0.418],
      [0.03, -0.41],
      [0.03, -0.4],
      [0.09, -0.397],
    ],
    tp('aluminum'),
  );
  // ── turbine end: bearing housing, exhaust collector, stator ring, inlet plenum ──
  L(
    [
      [0.043, -0.432],
      [0.068, -0.432],
      [0.068, -0.444],
      [0.058, -0.446],
      [0.058, -0.462],
      [0.043, -0.462],
    ],
    tp('inconel'),
  );
  L(
    [
      [0.043, -0.462],
      [0.112, -0.464],
      [0.126, -0.478],
      [0.128, -0.514],
      [0.122, -0.528],
      [0.114, -0.528],
      [0.116, -0.512],
      [0.114, -0.48],
      [0.104, -0.474],
      [0.058, -0.474],
      [0.058, -0.522],
      [0.05, -0.522],
      [0.046, -0.474],
      [0.043, -0.474],
    ],
    tp('inconelHot'),
    0.003,
  );
  L(
    [
      [0.112, -0.552],
      [0.122, -0.552],
      [0.122, -0.566],
      [0.112, -0.566],
    ],
    tp('inconelHot'),
    0.0015,
  );
  L(
    [
      [0.074, -0.552],
      [0.084, -0.552],
      [0.084, -0.566],
      [0.074, -0.566],
    ],
    tp('inconelHot'),
    0.0015,
  );
  L(
    [
      [0.112, -0.566],
      [0.122, -0.552],
      [0.13, -0.556],
      [0.133, -0.588],
      [0.112, -0.61],
      [0.068, -0.624],
      [0.066, -0.64],
      [0.05, -0.64],
      [0.052, -0.618],
      [0.1, -0.604],
      [0.122, -0.586],
      [0.122, -0.566],
    ],
    gg('inconelHot'),
    0.003,
  );
  // hub cone under the turbine disc (closes the plenum's inner side)
  L(
    [
      [0.0005, -0.578],
      [0.04, -0.574],
      [0.076, -0.566],
      [0.078, -0.57],
      [0.042, -0.582],
      [0.0005, -0.586],
    ],
    tp('inconelHot'),
    0.002,
  );

  // ── volutes (scrolls) and the fuel side inlet ──
  const vol = (y: number, mat: Tag['mat']) => {
    const { frames, rho } = voluteFrames(c, y, s);
    const res = clippedTube(frames, { ro: rho, ri: detail === 'hangar' ? (t) => rho(t) - 0.005 : undefined, segs: detail === 'hangar' ? 20 : 10, clipZ: k.section ? 0 : undefined, endCaps: true });
    k.tube(res, tp(mat));
  };
  vol(TP.loxVoluteY, 'aluminum');
  vol(TP.fuelVoluteY, 'aluminum');
  {
    // side inlet stub of the fuel plenum (front, faces the feed duct)
    const f = [V(c.x, TP.fuelInletY, 0.07), V(c.x, TP.fuelInletY, 0.12)].map((p, i) => ({ p, n: V(1, 0, 0), b: V(0, 1, 0), u: i * 0.05 }));
    k.tube(clippedTube(f, { ro: TP.fuelDuctR, ri: TP.fuelDuctR - 0.005, segs: 24, clipZ: k.section ? 0 : undefined }), tp('aluminum'));
  }

  // ── gas generator: combustor, injector head, sooty liner ──
  L(
    [
      [0.046, -0.64],
      [0.068, -0.64],
      [0.068, -0.652],
      [0.058, -0.658],
      [0.058, -0.856],
      [0.052, -0.856],
      [0.052, -0.652],
      [0.046, -0.65],
    ],
    gg('ggHot'),
    0.002,
  );
  L(
    [
      [0.0005, TP.ggHeadY],
      [0.052, TP.ggHeadY],
      [0.052, -0.856],
      [0.07, -0.856],
      [0.07, -0.872],
      [0.062, -0.876],
      [0.056, -0.892],
      [0.034, -0.905],
      [0.0005, TP.ggBottom],
    ],
    gg('steel'),
    0.003,
  );
  // flanges: bolts at the GG top and head joints, turbine end joints
  if (detail === 'hangar') {
    const bolt = hexBolt(0.011, 0.01);
    const back = (p: THREE.Vector3) => p.z <= 0;
    const front = (p: THREE.Vector3) => p.z > 0;
    for (const [y, r, n, flip, mat, part] of [
      [0, 0.1, 16, false, 'aluminum', 'turbopump'],
      [-0.184, 0.068, 12, false, 'aluminum', 'turbopump'],
      [-0.292, 0.068, 12, true, 'aluminum', 'turbopump'],
      [-0.432, 0.062, 12, false, 'inconel', 'turbopump'],
      [-0.64, 0.06, 10, true, 'inconel', 'gas-generator'],
      [-0.872, 0.064, 10, true, 'inconel', 'gas-generator'],
    ] as [number, number, number, boolean, Tag['mat'], Tag['part']][]) {
      const g = bolt.clone();
      if (flip) g.rotateX(Math.PI);
      k.add(ringOf(g, n, r, { centre: c, y, filter: back, phase: TAU / (2 * n) }), { part, mat });
      k.add(ringOf(g, n, r, { centre: c, y, filter: front, phase: TAU / (2 * n) }), { part, mat, front: true });
      g.dispose();
    }
    bolt.dispose();
  }
  if (detail !== 'hangar') return;

  // sooty inner liner of the gas generator and its small injector face
  lathe(k, [{ pts: [[0.0515, -0.652], [0.0515, -0.855]], open: true, flip: true }], gg('soot'), s, { centre: c });
  {
    const face = revolve([{ pts: [[0.0005, TP.ggHeadY + 0.0006], [0.052, TP.ggHeadY + 0.0006]], open: true, flip: true }], Math.PI / 2, (Math.PI * 3) / 2, s, { centre: c });
    if (face.surf) {
      const uv = face.surf.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3, 0.62 + (uv.getY(i) / 0.052) * 0.38);
    }
    k.add(face.surf, gg('faceplate'));
  }

  // ── rotor: shaft, sleeves, inducers, impellers, turbine, bearing inner races, seal teeth ──
  const R: Tag = { part: 'turbopump', mat: 'machined', node: 'rotor' };
  const full = (pts: V2[], t: Tag, r = 0.0015) => k.add(revolve([{ pts: roundPoly(pts, r, 2) }], 0, TAU, 40, { centre: c }).surf, t);
  full(
    [
      [0.0005, -0.028],
      [0.012, -0.034],
      [0.02, -0.044],
      [0.024, -0.056],
      [0.024, -0.104],
      [0.0005, -0.104],
    ],
    R,
    0.004,
  );
  full(
    [
      [0.0005, -0.1],
      [0.017, -0.1],
      [0.017, -0.555],
      [0.0005, -0.555],
    ],
    R,
    0.001,
  );
  // LOX impeller hub and back plate
  const loxHub: V2[] = [
    [0.02, -0.104],
    [0.026, -0.104],
    [0.034, -0.12],
    [0.052, -0.133],
    [0.0845, -0.138],
    [0.0845, -0.146],
    [0.02, -0.15],
  ];
  full(loxHub, R, 0.002);
  const hubY = (pts: V2[]) => (r: number) => {
    for (let i = 1; i < 5; i++) if (r <= pts[i][0]) return pts[i - 1][1] + ((pts[i][1] - pts[i - 1][1]) * (r - pts[i - 1][0])) / (pts[i][0] - pts[i - 1][0]);
    return pts[4][1];
  };
  k.add(inducer(c, 0.024, 0.066, -0.05, -0.1, 4.3, 3, 0.0022), R);
  k.add(vanes(c, 0.03, 0.084, hubY(loxHub), (r) => (r < 0.066 ? -0.104 : -0.104 - ((r - 0.066) / 0.018) * 0.01), 6, 1.1, 0.0026), R);
  k.add(vanes(c, 0.055, 0.084, hubY(loxHub), (r) => -0.104 - Math.max(0, (r - 0.066) / 0.018) * 0.01, 6, 0.75, 0.0024, TAU / 12), R);
  // fuel inducer and impeller (titanium)
  const RT: Tag = { part: 'turbopump', mat: 'titanium', node: 'rotor' };
  full(
    [
      [0.017, -0.33],
      [0.022, -0.333],
      [0.022, -0.36],
      [0.017, -0.36],
    ],
    RT,
  );
  const fuelHub: V2[] = [
    [0.02, -0.36],
    [0.025, -0.36],
    [0.032, -0.371],
    [0.05, -0.381],
    [0.0875, -0.386],
    [0.0875, -0.394],
    [0.02, -0.398],
  ];
  full(fuelHub, RT, 0.002);
  k.add(inducer(c, 0.022, 0.058, -0.334, -0.36, 3.8, 3, 0.002), RT);
  k.add(vanes(c, 0.028, 0.087, hubY(fuelHub), (r) => (r < 0.058 ? -0.36 : -0.36 - ((r - 0.058) / 0.029) * 0.011), 7, 1.2, 0.0026), RT);
  // turbine disc, blades and tip shroud (nickel alloy)
  const RN: Tag = { part: 'turbopump', mat: 'inconel', node: 'rotor' };
  full(
    [
      [0.017, -0.526],
      [0.03, -0.526],
      [0.05, -0.532],
      [0.085, -0.533],
      [0.085, -0.547],
      [0.05, -0.548],
      [0.03, -0.554],
      [0.017, -0.554],
    ],
    RN,
    0.002,
  );
  k.add(turbineBlades(c, 0.084, 0.1115, -0.5475, -0.5325, 64), RN);
  full(
    [
      [0.1112, -0.531],
      [0.1145, -0.531],
      [0.1145, -0.549],
      [0.1112, -0.549],
    ],
    RN,
    0.0006,
  );
  // stator nozzle vanes between the stator rings (fixed)
  {
    const vanesG: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 36; i++) {
      const a = (i * TAU) / 36;
      const b = new THREE.BoxGeometry(0.0018, 0.013, 0.012);
      b.rotateX(0.9);
      b.translate(0, -0.559, 0.098);
      b.rotateY(a);
      b.translate(c.x, 0, c.z);
      const zc = Math.cos(a) * 0.098;
      if (zc > 0) b.userData.front = true;
      vanesG.push(b);
    }
    const back = merge(vanesG.filter((g) => !g.userData.front).map((g) => g.clone()));
    const front = merge(vanesG.filter((g) => g.userData.front).map((g) => g.clone()));
    k.add(back, tp('inconelHot'));
    k.add(front, { ...tp('inconelHot'), front: true });
    for (const g of vanesG) g.dispose();
  }
  // bearings: fixed outer races, rotating inner races and balls
  for (const y of TP.bearingsY) {
    lathe(
      k,
      [
        {
          pts: roundPoly(
            [
              [0.035, y + 0.008],
              [0.043, y + 0.008],
              [0.043, y - 0.008],
              [0.035, y - 0.008],
            ],
            0.0012,
            2,
          ),
        },
      ],
      tp('steel'),
      s,
      { centre: c },
    );
    full(
      [
        [0.017, y + 0.008],
        [0.026, y + 0.008],
        [0.026, y - 0.008],
        [0.017, y - 0.008],
      ],
      { ...R, mat: 'steel' },
      0.0012,
    );
    const ball = new THREE.SphereGeometry(0.0047, 8, 6);
    k.add(ringOf(ball, 12, 0.0305, { centre: c, y }), { ...R, mat: 'chrome' });
    ball.dispose();
  }
  // inter-propellant seal: rotating teeth interleaved with stationary lands, helium purge groove
  for (let i = 0; i < 6; i++) {
    const y = TP.sealY[0] - 0.004 - i * 0.0085;
    if (i === 3) continue; // purge cavity in the middle
    full(
      [
        [0.017, y + 0.0012],
        [0.0335, y + 0.0006],
        [0.0335, y - 0.0006],
        [0.017, y - 0.0012],
      ],
      R,
      0.0003,
    );
    const yl = y - 0.0042;
    lathe(
      k,
      [
        {
          pts: [
            [0.0215, yl + 0.0025],
            [0.047, yl + 0.0025],
            [0.047, yl - 0.0025],
            [0.0215, yl - 0.0025],
          ],
        },
      ],
      tp('steel'),
      s,
      { centre: c },
    );
  }
  // purge port boss and speed pickup boss on the housing (back side)
  for (const [y, a, len, rr] of [
    [-0.228, Math.PI * 1.08, 0.03, 0.012],
    [-0.235, Math.PI * 0.95, 0.024, 0.01],
  ] as [number, number, number, number][]) {
    const dir = V(Math.sin(a), 0, Math.cos(a));
    const g = new THREE.CylinderGeometry(rr, rr, len, 16);
    g.translate(0, len / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir));
    g.translate(c.x + dir.x * 0.058, y, c.z + dir.z * 0.058);
    k.add(g, tp('steel'));
  }
  // GG propellant ports and igniter port on the head
  for (const a of [150, 210]) {
    const ar = (a * Math.PI) / 180;
    const dir = V(Math.sin(ar), 0, Math.cos(ar));
    const g = new THREE.CylinderGeometry(0.016, 0.016, 0.022, 16);
    g.translate(0, 0.011, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir));
    g.translate(c.x + dir.x * 0.05, -0.885, c.z + dir.z * 0.05);
    k.add(g, gg('steel'));
  }
  {
    const g = new THREE.CylinderGeometry(0.012, 0.014, 0.02, 16);
    g.translate(c.x, TP.ggBottom - 0.006, c.z);
    k.add(g, { part: 'igniter', mat: 'steel' });
  }
}
