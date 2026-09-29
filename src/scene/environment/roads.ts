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
import { withHaze } from './haze';
import { asphaltTexture } from './textures';

/**
 * The regional network's surfaces fade toward the average ground tone once a road is narrower
 * than a pixel: seen from altitude a 12 m highway is a faint trace, not a bright aliased line.
 */
function farFade<T extends THREE.MeshStandardMaterial>(m: T, widthM: number, tone: THREE.ColorRepresentation, key: string): T {
  const c = new THREE.Color(tone);
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
{
  float fpx = length( fwidth( vHazePos ) );
  float cov = clamp( ${widthM.toFixed(1)} / max( fpx, 1e-3 ), 0.0, 1.0 );
  diffuseColor.rgb = mix( vec3( ${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)} ), diffuseColor.rgb, cov * cov );
}`,
    );
  };
  m.customProgramCacheKey = () => key;
  return withHaze(m, `site-haze-${key}`);
}

let regionalMats: { asphalt: THREE.MeshStandardMaterial; bank: THREE.MeshStandardMaterial } | null = null;
function regionalMaterials() {
  if (!regionalMats) {
    const tone = new THREE.Color().setRGB(0.05, 0.058, 0.034); // scrub and pine flatwoods, linear
    regionalMats = {
      asphalt: farFade(new THREE.MeshStandardMaterial({ map: asphaltTexture(), roughness: 0.92, metalness: 0 }), 9, tone, 'road-far-asphalt'),
      bank: farFade(new THREE.MeshStandardMaterial({ color: '#7d7462', roughness: 0.97, metalness: 0 }), 20, tone, 'road-far-bank'),
    };
    regionalMats.asphalt.name = 'site.asphaltRegional';
    regionalMats.bank.name = 'site.soilRegional';
  }
  return regionalMats;
}
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

interface Sample {
  x: number;
  z: number;
  h: number;
  wet: boolean;
}

/** Samples along a polyline at most `step(x, z)` apart (the step may grow with distance). */
function resample(pts: [number, number][], step: number | ((x: number, z: number) => number)): [number, number][] {
  const stepAt = typeof step === 'number' ? () => step : step;
  const out: [number, number][] = [pts[0]];
  let [px, pz] = pts[0];
  for (let i = 1; i < pts.length; i++) {
    const [bx, bz] = pts[i];
    for (;;) {
      const d = Math.hypot(bx - px, bz - pz);
      const st = stepAt(px, pz);
      if (d <= st * 1.001) break;
      px += ((bx - px) * st) / d;
      pz += ((bz - pz) * st) / d;
      out.push([px, pz]);
    }
    // keep the polyline's own corners unless they are much closer than the step
    const last = out[out.length - 1];
    if (typeof step === 'number' || i === pts.length - 1 || Math.hypot(bx - last[0], bz - last[1]) > stepAt(bx, bz) * 0.6) {
      out.push([bx, bz]);
      px = bx;
      pz = bz;
    }
  }
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
  const regional: THREE.BufferGeometry[] = [];
  const regionalPaint: THREE.BufferGeometry[] = [];

  const sampleRoad = (pts: [number, number][], step: number | ((x: number, z: number) => number)): Sample[] =>
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
    // 25 m samples near the complex, growing to 160 m far out (the terrain cells grow too)
    const s = sampleRoad(raw, (x, z) => Math.min(160, Math.max(25, Math.hypot(x, z) * 0.02)));
    // smooth the wet flag into causeway spans with ramps at each end
    const causeway = s.map((p) => {
      const d = Math.hypot(p.x, p.z);
      const deck = seaLevel(d) + 1.6;
      return { ...p, h: p.wet ? Math.max(p.h, deck) : p.h };
    });
    for (let i = 1; i < causeway.length - 1; i++) {
      if (!causeway[i].wet && (causeway[i - 1].wet || causeway[i + 1].wet)) causeway[i].h = Math.max(causeway[i].h, (causeway[i - 1].h + causeway[i + 1].h) / 2);
    }
    // lifted a little more with distance: the coarser terrain cells there sag between vertices
    const lift = (p: Sample) => p.h + 0.2 + Math.hypot(p.x, p.z) * 3e-5;
    regional.push(ribbon(causeway, r.w / 2, lift, 8, 0.2, r.w / 2 + 0.6));
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
      if (c) regionalPaint.push(c);
    }
  }

  const add = (list: THREE.BufferGeometry[], m: THREE.Material, name: string, receive = true, lod?: { max?: number; maxH?: number }) => {
    if (!list.length) return;
    const g = mergeGeometries(list.map(normalizeGeo), false);
    list.forEach((x) => x.dispose());
    if (!g) return;
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, m);
    mesh.name = name;
    mesh.receiveShadow = receive;
    mesh.frustumCulled = false;
    // distance culling (read by the site's update): see LOD_MAX in site.ts
    if (lod?.max !== undefined) mesh.userData.lodMax = lod.max;
    if (lod?.maxH !== undefined) mesh.userData.lodMaxH = lod.maxH;
    group.add(mesh);
  };
  const rm = regionalMaterials();
  // the regional network is drawn up to 14 km above it (its traces have faded out by then)
  add(bank, rm.bank, 'road-embankments', true, { maxH: 14000 });
  add(regional, rm.asphalt, 'roads-regional', true, { maxH: 14000 });
  add(regionalPaint, SM('roadPaint'), 'road-markings-regional', true, { max: 3500 });
  add(asphalt, SM('asphalt'), 'roads-asphalt');
  add(concrete, SM('concreteRoad'), 'roads-concrete');
  add(paint, SM('roadPaint'), 'road-markings');
  return group;
}
