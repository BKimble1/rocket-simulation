/**
 * Coastal scrub around the complex and the camera sites: saw-palmetto and scrub-oak clumps,
 * slash pines and cabbage palms, placed once (seeded, deterministic) on land outside the mowed
 * and gravelled ground (read from the overlay), off the beach and the wet margins, growing in
 * thickets and hammocks and thinning with distance. Each plant is a few crossed foliage cards
 * (a procedural leaf atlas, alpha-tested, normals bent outward so a clump shades like a volume)
 * on a trunk where it has one. Three instanced meshes (shrubs, pines, palms) with per-instance
 * tint: the whole scatter costs three draw calls. The terrain shader's colour variation carries
 * the ground; this gives the ground cameras depth and a broken skyline beyond the complex.
 */
import * as THREE from 'three';
import { GROUND_CAMS, LANDING_ZONE } from '../../world/site';
import { tierSpec } from '../quality';
import { coastDist, coverAt, groundY, vnoise, type SiteMaps } from './map';
import { overlayAt, type Overlay } from './overlay';
import { rng } from './textures';
import { withHaze } from './haze';
import { mergeParts } from './geom';

export interface Vegetation {
  group: THREE.Group;
  dispose(): void;
}

// ───────────────────────────── leaf atlas ─────────────────────────────

/** Atlas columns (u ranges): shrub, pine crown, palm crown, bark (opaque). */
const U = { shrub: [0, 0.25], pine: [0.25, 0.5], palm: [0.5, 0.75], bark: [0.78, 0.97] } as const;

function leafAtlas(): THREE.CanvasTexture {
  const W = 1024;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const r = rng(314);
  const pick = (cols: string[]) => cols[Math.floor(r() * cols.length)];
  g.lineCap = 'round';

  // saw palmetto and scrub oak: fans of blades rising from the ground, dense at the base
  {
    const cols = ['#3f5229', '#4a5c30', '#56653a', '#374826', '#5e6440', '#2f3f22'];
    for (let f = 0; f < 26; f++) {
      const bx = 22 + r() * 212;
      const by = 250 - r() * 70;
      const n = 10 + Math.floor(r() * 10);
      const len = 55 + r() * 95;
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (r() - 0.5) * 2.6;
        const l = len * (0.6 + r() * 0.4);
        const ex = bx + Math.cos(a) * l;
        const ey = by + Math.sin(a) * l * 0.85;
        g.strokeStyle = pick(cols);
        g.lineWidth = 3 + r() * 5;
        g.beginPath();
        g.moveTo(bx, by);
        g.quadraticCurveTo(bx + Math.cos(a) * l * 0.5, by + Math.sin(a) * l * 0.5 - 6, Math.max(2, Math.min(254, ex)), Math.max(4, ey));
        g.stroke();
      }
    }
    // a dark, dense core so the clump reads solid from afar
    g.fillStyle = '#2c3a22';
    g.beginPath();
    g.ellipse(128, 238, 110, 36, 0, 0, Math.PI * 2);
    g.fill();
  }
  // pine crown: tufts of needles in an irregular, flat-topped mass, with a few branches
  {
    const cx = 384;
    const cols = ['#2f3f24', '#3a4b2b', '#26351e', '#44552f', '#324326'];
    g.strokeStyle = '#4a3b2e';
    for (let i = 0; i < 9; i++) {
      g.lineWidth = 3 + r() * 3;
      g.beginPath();
      g.moveTo(cx, 250);
      g.lineTo(cx + (r() - 0.5) * 210, 60 + r() * 150);
      g.stroke();
    }
    for (let t = 0; t < 150; t++) {
      const a = r() * Math.PI * 2;
      const rr = Math.sqrt(r());
      const x = cx + Math.cos(a) * rr * 112;
      const y = 118 + Math.sin(a) * rr * 88 * (Math.sin(a) < 0 ? 0.8 : 1);
      g.strokeStyle = pick(cols);
      g.lineWidth = 2 + r() * 2.5;
      for (let k = 0; k < 9; k++) {
        const b = r() * Math.PI * 2;
        const l = 7 + r() * 11;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(b) * l, y + Math.sin(b) * l);
        g.stroke();
      }
    }
    // trunk continuation inside the crown (opaque, so the card joins the trunk)
    g.fillStyle = '#4a3b2e';
    g.fillRect(cx - 5, 150, 10, 106);
  }
  // cabbage palm: a ball of fan fronds drooping from the top of the trunk
  {
    const cx = 640;
    const cy = 120;
    const cols = ['#4d5f33', '#5b6b3b', '#3f4f2a', '#66703f', '#556436'];
    for (let f = 0; f < 22; f++) {
      const a = r() * Math.PI * 2;
      const len = 70 + r() * 50;
      const droop = 0.9 + r() * 0.6;
      const ex = cx + Math.cos(a) * len;
      const ey = cy + Math.sin(a) * len * 0.7 + droop * 35;
      g.strokeStyle = pick(cols);
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(cx, cy);
      g.quadraticCurveTo(cx + Math.cos(a) * len * 0.6, cy + Math.sin(a) * len * 0.45 - 20, ex, ey);
      g.stroke();
      // leaflets along the end of the frond
      for (let k = 0; k < 16; k++) {
        const t = 0.45 + (k / 16) * 0.55;
        const px = cx + (ex - cx) * t;
        const py = cy + (ey - cy) * t - 20 * 4 * t * (1 - t);
        const b = a + (r() - 0.5) * 1.6 + (Math.PI / 2) * (k % 2 ? 1 : -1) * 0.5;
        const l = 12 + r() * 16;
        g.lineWidth = 2 + r() * 2;
        g.beginPath();
        g.moveTo(px, py);
        g.lineTo(px + Math.cos(b) * l, py + Math.abs(Math.sin(b)) * l * 0.9);
        g.stroke();
      }
    }
    // old frond boots under the crown and the top of the trunk
    g.fillStyle = '#6a5a42';
    g.beginPath();
    g.ellipse(cx, cy + 22, 16, 30, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#5c4d3a';
    g.fillRect(cx - 7, cy + 40, 14, 256 - cy - 40);
  }
  // bark (opaque strip)
  {
    const grd = g.createLinearGradient(768, 0, 1024, 0);
    grd.addColorStop(0, '#5a4a3a');
    grd.addColorStop(0.5, '#75634f');
    grd.addColorStop(1, '#4d3f31');
    g.fillStyle = grd;
    g.fillRect(768, 0, 256, 256);
    for (let i = 0; i < 400; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(40,32,24,0.35)' : 'rgba(150,135,112,0.25)';
      g.fillRect(768 + r() * 256, r() * 256, 2 + r() * 14, 1 + r() * 3);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ───────────────────────────── plant geometry ─────────────────────────────

/**
 * n vertical cards crossing at the axis (unit plant), uv from the atlas column [u0, u1];
 * normals bend outward from `centre` so the clump shades like a rounded mass.
 */
function cards(n: number, w: number, h: number, y0: number, u: readonly [number, number], centre: THREE.Vector3, r: () => number, lean = 0.12): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const tmp = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI + (r() - 0.5) * 0.3;
    const cx = Math.cos(a) * (w / 2);
    const cz = Math.sin(a) * (w / 2);
    // lean the card's top slightly off vertical so crossings are not perfectly symmetric
    const lx = -Math.sin(a) * lean * h;
    const lz = Math.cos(a) * lean * h * (i % 2 ? 1 : -1);
    const corners: [number, number, number, number, number][] = [
      [-cx, y0, -cz, u[0], 0],
      [cx, y0, cz, u[1], 0],
      [cx + lx, y0 + h, cz + lz, u[1], 1],
      [-cx + lx, y0 + h, -cz + lz, u[0], 1],
    ];
    const b = pos.length / 3;
    for (const [x, y, z, uu, vv] of corners) {
      pos.push(x, y, z);
      tmp.set(x - centre.x, (y - centre.y) * 0.6 + 0.45 * h, z - centre.z).normalize();
      nor.push(tmp.x, tmp.y, tmp.z);
      uv.push(uu, vv);
    }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** An open trunk cylinder with its uv in the bark strip. */
function trunk(r0: number, r1: number, h: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r1, r0, h, 5, 1, true);
  g.translate(0, h / 2, 0);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, U.bark[0] + uv.getX(i) * (U.bark[1] - U.bark[0]), uv.getY(i));
  return g;
}

function shrubGeometry(r: () => number): THREE.BufferGeometry {
  return cards(3, 1, 0.75, -0.04, U.shrub, new THREE.Vector3(0, 0.1, 0), r, 0.08);
}

function pineGeometry(r: () => number): THREE.BufferGeometry {
  return mergeParts([{ g: trunk(0.02, 0.011, 0.78) }, { g: cards(3, 0.44, 0.36, 0.64, U.pine, new THREE.Vector3(0, 0.8, 0), r) }]);
}

function palmGeometry(r: () => number): THREE.BufferGeometry {
  return mergeParts([{ g: trunk(0.034, 0.03, 0.72) }, { g: cards(4, 0.62, 0.5, 0.52, U.palm, new THREE.Vector3(0, 0.74, 0), r, 0.05) }]);
}

// ───────────────────────────── scatter ─────────────────────────────

export function buildVegetation(maps: SiteMaps, overlay: Overlay): Vegetation {
  const detail = tierSpec().detail;
  const nShrubs = Math.round(26000 * detail);
  const nTrees = Math.round(2800 * detail);
  const r = rng(907);
  const group = new THREE.Group();
  group.name = 'vegetation';

  // sampling regions: the complex's surroundings, the tracking camera's foreground, the landing zone
  const regions = [
    { x: 0, z: 0, r0: 180, r1: 2300, w: 0.62 },
    { x: GROUND_CAMS.tracking.x, z: GROUND_CAMS.tracking.z, r0: 25, r1: 800, w: 0.14 },
    { x: LANDING_ZONE.x, z: LANDING_ZONE.z, r0: 170, r1: 1100, w: 0.24 },
  ];
  const pick = () => {
    let u = r();
    let reg = regions[0];
    for (const g of regions) {
      if (u < g.w) {
        reg = g;
        break;
      }
      u -= g.w;
    }
    const a = r() * Math.PI * 2;
    const rr = Math.sqrt(reg.r0 * reg.r0 + r() * (reg.r1 * reg.r1 - reg.r0 * reg.r0));
    return { x: reg.x + Math.cos(a) * rr, z: reg.z + Math.sin(a) * rr, reg, rr };
  };
  // keep trees out of the ground cameras' sight lines (camera to subject) and off their sites
  const C = GROUND_CAMS;
  const sightLines: [number, number, number, number][] = [
    [C.tracking.x, C.tracking.z, 0, 0],
    [C.landing.x, C.landing.z, LANDING_ZONE.x, LANDING_ZONE.z],
    [C.padWide.x, C.padWide.z, 0, 0],
    [C.padClose.x, C.padClose.z, 0, 0],
  ];
  const inSight = (x: number, z: number) =>
    sightLines.some(([ax, az, bx, bz]) => {
      const dx = bx - ax;
      const dz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
      return Math.hypot(x - ax - dx * t, z - az - dz * t) < 40 + 25 * t;
    });
  /** Suitability 0..1 for a plant at (x, z); `tree` asks for drier, higher ground. */
  const suit = (x: number, z: number, tree: boolean) => {
    if (overlayAt(overlay, x, z, 0) > 0.08 || overlayAt(overlay, x, z, 1) > 0.08) return 0;
    if (tree && inSight(x, z)) return 0;
    const sdf = coastDist(maps, x, z);
    const ocean = coverAt(maps, x, z, 0);
    const beach = 42 + 18 * vnoise(x / 260, z / 260, 5);
    if (sdf < (ocean > 0.4 ? beach + (tree ? 140 : 25) : tree ? 30 : 6)) return 0;
    if (Math.hypot(x - LANDING_ZONE.x, z - LANDING_ZONE.z) < LANDING_ZONE.radius + 150) return 0;
    const town = coverAt(maps, x, z, 2);
    const marsh = coverAt(maps, x, z, 1);
    // patchy: open prairie between thickets
    const patch = vnoise(x / 140, z / 140, 23) * 0.7 + vnoise(x / 37, z / 37, 29) * 0.3;
    let s = THREE.MathUtils.smoothstep(patch, tree ? 0.5 : 0.28, tree ? 0.78 : 0.6);
    s *= 1 - town * 0.8;
    s *= 1 - marsh * (tree ? 0.9 : 0.4);
    return s;
  };

  interface Plant {
    m: THREE.Matrix4;
    c: THREE.Color;
    palm: boolean;
  }
  const place = (n: number, tree: boolean): Plant[] => {
    const out: Plant[] = [];
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const tints = tree ? ['#ffffff', '#e6ead8', '#f2eed8', '#d6dcc6'] : ['#ffffff', '#e8ecd8', '#f4efd6', '#dfe6cf', '#c8d0b8', '#f0e4c4'];
    const put = (x: number, z: number) => {
      const y = groundY(maps, x, z);
      const palm = tree && r() < 0.4;
      const s = !tree ? 1.6 + r() * 2.0 + (r() < 0.12 ? 1.2 : 0) : palm ? 7 + r() * 4 : 12 + r() * 8;
      e.set((r() - 0.5) * (tree ? 0.05 : 0.12), r() * Math.PI * 2, (r() - 0.5) * (tree ? 0.05 : 0.12));
      q.setFromEuler(e);
      const sc = tree ? new THREE.Vector3(s * (0.85 + r() * 0.3), s, s * (0.85 + r() * 0.3)) : new THREE.Vector3(s * (0.8 + r() * 0.4), s * (0.55 + r() * 0.35), s * (0.8 + r() * 0.4));
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y - (tree ? 0.25 : 0.05), z), q, sc);
      const c = new THREE.Color(tints[Math.floor(r() * tints.length)]).multiplyScalar(0.82 + r() * 0.3);
      out.push({ m, c, palm });
    };
    for (let tries = 0; tries < n * 6 && out.length < n; tries++) {
      const p = pick();
      // thin out with distance from each region's centre
      const fall = 1 - 0.55 * THREE.MathUtils.smoothstep(p.rr, p.reg.r1 * 0.4, p.reg.r1);
      if (r() > suit(p.x, p.z, tree) * fall) continue;
      // plants grow in thickets and hammocks: a seed and its neighbours
      const k = tree ? 1 + Math.floor(r() * 5) : 6 + Math.floor(r() * 11);
      const spread = tree ? 22 : 10;
      for (let i = 0; i < k && out.length < n; i++) {
        const a = r() * Math.PI * 2;
        const d = i === 0 ? 0 : spread * Math.sqrt(r());
        const x = p.x + Math.cos(a) * d;
        const z = p.z + Math.sin(a) * d;
        if (i > 0 && suit(x, z, tree) <= 0) continue;
        put(x, z);
      }
    }
    return out;
  };

  const atlas = leafAtlas();
  const mat = new THREE.MeshStandardMaterial({ map: atlas, color: '#ffffff', roughness: 0.92, metalness: 0, alphaTest: 0.42, side: THREE.DoubleSide });
  mat.alphaToCoverage = true;
  // foliage cards are lit by their bent normals on both faces (no back-face flip)
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize( vNormal );');
  };
  withHaze(mat, 'site-haze-foliage');
  mat.name = 'site.foliage';
  const geos: THREE.BufferGeometry[] = [];

  const build = (geo: THREE.BufferGeometry, plants: Plant[], name: string, cast: boolean) => {
    geos.push(geo);
    if (!plants.length) return;
    const im = new THREE.InstancedMesh(geo, mat, plants.length);
    plants.forEach((p, i) => {
      im.setMatrixAt(i, p.m);
      im.setColorAt(i, p.c);
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
    im.name = name;
    im.castShadow = cast;
    im.receiveShadow = true;
    group.add(im);
  };
  const shrubs = place(nShrubs, false);
  const trees = place(nTrees, true);
  build(shrubGeometry(r), shrubs, 'scrub', false);
  build(pineGeometry(r), trees.filter((p) => !p.palm), 'pines', true);
  build(palmGeometry(r), trees.filter((p) => p.palm), 'palms', true);

  return {
    group,
    dispose() {
      geos.forEach((g) => g.dispose());
      mat.dispose();
      atlas.dispose();
    },
  };
}
