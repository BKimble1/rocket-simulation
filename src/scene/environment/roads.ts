/**
 * Roads draped on the terrain: the complex's service roads (asphalt, the concrete transporter
 * road) with centre and edge markings, and the illustrative regional network baked with the
 * map (highways and causeways across the lagoons, built on rip-rap embankments over the water).
 */
import * as THREE from 'three';
import { SM } from './mats';
import { SITE_ROADS } from './layout';
import { REGIONAL_ROADS } from './generated/regionalMap';
import { coastDist, groundH, seaLevel, sphereY, type SiteMaps } from './map';
import { normalizeGeo } from './geom';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

interface Sample {
  x: number;
  z: number;
  h: number;
  wet: boolean;
}

function resample(pts: [number, number][], step: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
    for (let k = 0; k < n; k++) out.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** A ribbon along samples at height offsets; returns geometry with uv (u across, v along) in metres/scale. */
function ribbon(samples: Sample[], halfW: number, lift: (s: Sample) => number, uvScale: number, edgeDrop = 0, halfWBottom = halfW): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let along = 0;
  const n = samples.length;
  const cols = edgeDrop > 0 ? 4 : 2;
  for (let i = 0; i < n; i++) {
    const s = samples[i];
    const a = samples[Math.max(0, i - 1)];
    const b = samples[Math.min(n - 1, i + 1)];
    let tx = b.x - a.x;
    let tz = b.z - a.z;
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl;
    tz /= tl;
    const nx = -tz;
    const nz = tx;
    if (i > 0) along += Math.hypot(s.x - samples[i - 1].x, s.z - samples[i - 1].z);
    const top = lift(s);
    const put = (off: number, dy: number, u: number) => {
      const x = s.x + nx * off;
      const z = s.z + nz * off;
      pos.push(x, sphereY(x, z, top + dy), z);
      uv.push(u, along / uvScale);
    };
    if (cols === 4) {
      put(-halfWBottom, -edgeDrop, -halfWBottom / uvScale);
      put(-halfW, 0, -halfW / uvScale);
      put(halfW, 0, halfW / uvScale);
      put(halfWBottom, -edgeDrop, halfWBottom / uvScale);
    } else {
      put(-halfW, 0, 0);
      put(halfW, 0, (2 * halfW) / uvScale);
    }
  }
  for (let i = 0; i < n - 1; i++)
    for (let c = 0; c < cols - 1; c++) {
      const a = i * cols + c;
      const b = a + cols;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Dashed or solid marking strips along samples (offset across the road). */
function markings(samples: Sample[], off: number, w: number, lift: (s: Sample) => number, dash: number, gap: number): THREE.BufferGeometry | null {
  const segs: THREE.BufferGeometry[] = [];
  let along = 0;
  let run: Sample[] = [];
  const flush = () => {
    if (run.length > 1) segs.push(ribbon(run.map((s) => ({ ...s, x: s.x, z: s.z })), w / 2, (s) => lift(s) + 0.03, 4));
    run = [];
  };
  for (let i = 0; i < samples.length; i++) {
    if (i > 0) along += Math.hypot(samples[i].x - samples[i - 1].x, samples[i].z - samples[i - 1].z);
    const on = gap <= 0 || along % (dash + gap) < dash;
    const s = samples[i];
    const a = samples[Math.max(0, i - 1)];
    const b = samples[Math.min(samples.length - 1, i + 1)];
    const tl = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const shifted = { ...s, x: s.x - ((b.z - a.z) / tl) * off, z: s.z + ((b.x - a.x) / tl) * off };
    if (on) run.push(shifted);
    else flush();
  }
  flush();
  if (!segs.length) return null;
  const m = mergeGeometries(segs.map(normalizeGeo), false);
  segs.forEach((g) => g.dispose());
  return m;
}

export function buildRoads(maps: SiteMaps): THREE.Group {
  const group = new THREE.Group();
  group.name = 'roads';
  const asphalt: THREE.BufferGeometry[] = [];
  const concrete: THREE.BufferGeometry[] = [];
  const paint: THREE.BufferGeometry[] = [];
  const bank: THREE.BufferGeometry[] = [];

  const sampleRoad = (pts: [number, number][], step: number): Sample[] =>
    resample(pts, step).map(([x, z]) => {
      const wet = coastDist(maps, x, z) < 6;
      return { x, z, h: groundH(maps, x, z), wet };
    });

  // complex roads
  for (const r of SITE_ROADS) {
    const s = sampleRoad(r.pts, 4);
    const lift = (p: Sample) => p.h + 0.12;
    const g = ribbon(s, r.w / 2, lift, 8, 0.12, r.w / 2 + 0.35);
    (r.kind === 'concrete' ? concrete : asphalt).push(g);
    if (r.kind !== 'concrete' && r.w >= 8) {
      const c = markings(s, 0, 0.12, lift, 3, 5);
      if (c) paint.push(c);
    }
    if (r.kind !== 'concrete' && r.w >= 7)
      for (const side of [-1, 1]) {
        const e = markings(s, side * (r.w / 2 - 0.3), 0.1, lift, 1, 0);
        if (e) paint.push(e);
      }
  }

  // regional network: embankments over water, markings on highways
  for (const r of REGIONAL_ROADS) {
    const raw: [number, number][] = [];
    for (let i = 0; i < r.pts.length; i += 2) raw.push([r.pts[i], r.pts[i + 1]]);
    const s = sampleRoad(raw, 25);
    // smooth the wet flag into causeway spans with ramps at each end
    const causeway = s.map((p) => {
      const d = Math.hypot(p.x, p.z);
      const deck = seaLevel(d) + 1.6;
      return { ...p, h: p.wet ? Math.max(p.h, deck) : p.h };
    });
    for (let i = 1; i < causeway.length - 1; i++) {
      if (!causeway[i].wet && (causeway[i - 1].wet || causeway[i + 1].wet)) causeway[i].h = Math.max(causeway[i].h, (causeway[i - 1].h + causeway[i + 1].h) / 2);
    }
    const lift = (p: Sample) => p.h + 0.2 + Math.hypot(p.x, p.z) * 2e-5;
    asphalt.push(ribbon(causeway, r.w / 2, lift, 8, 0.2, r.w / 2 + 0.6));
    // embankments along wet spans
    let run: Sample[] = [];
    const flush = () => {
      if (run.length > 1) bank.push(ribbon(run, r.w / 2 + 3, (p) => p.h + 0.15, 10, 3.5, r.w / 2 + 12));
      run = [];
    };
    for (let i = 0; i < causeway.length; i++) {
      const p = causeway[i];
      const near = p.wet || (i > 0 && causeway[i - 1].wet) || (i < causeway.length - 1 && causeway[i + 1].wet);
      if (near) run.push(p);
      else flush();
    }
    flush();
    if (r.kind === 'highway') {
      const c = markings(causeway, 0, 0.2, lift, 0, 0);
      if (c) paint.push(c);
    }
  }

  const add = (list: THREE.BufferGeometry[], m: THREE.Material, name: string, receive = true) => {
    if (!list.length) return;
    const g = mergeGeometries(list.map(normalizeGeo), false);
    list.forEach((x) => x.dispose());
    if (!g) return;
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, m);
    mesh.name = name;
    mesh.receiveShadow = receive;
    mesh.frustumCulled = false;
    group.add(mesh);
  };
  add(bank, SM('embankment'), 'road-embankments');
  add(asphalt, SM('asphalt'), 'roads-asphalt');
  add(concrete, SM('concreteRoad'), 'roads-concrete');
  add(paint, SM('roadPaint'), 'road-markings');
  return group;
}
