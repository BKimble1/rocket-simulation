/**
 * Propellant shown in the cutaway: a solid of revolution filling each tank, clipped by the
 * cutaway wedge, with its own cut faces on the two wedge planes and a flat free surface.
 *
 * The body and the cut faces are built ONCE at the full-load level; a lower level only moves a
 * height uniform (fragments above the free surface are discarded, in the model frame) and
 * re-poses the free-surface ring (a few hundred vertex values). So a draining tank costs almost
 * nothing per frame.
 */
import * as THREE from 'three';
import type { Kit, Section, Entry } from './kit';
import { cloneMat, withHook, type VehicleMats } from './mats';
import { TANKS, levelHeightFast, liquidPoly, type TankDef, type TankId } from './tanks';
import { lathe, capFromPoly } from './geom';

/** Radial span [r0, r1] of the free surface at height h (null if the level is outside the tank). */
function surfaceSpan(t: TankDef, h: number, out: [number, number]): [number, number] | null {
  const inside = (r: number) => t.floor(r) < h && t.ceil(r) > h;
  const n = 48;
  const step = (t.rWall - t.rIn) / n;
  let first = -1;
  let last = -1;
  for (let i = 0; i <= n; i++) {
    if (inside(t.rIn + i * step)) {
      if (first < 0) first = i;
      last = i;
    }
  }
  if (first < 0) return null;
  // a is inside, b outside: bisect the boundary between them
  const edge = (a: number, b: number) => {
    let lo = a;
    let hi = b;
    for (let k = 0; k < 14; k++) {
      const m = (lo + hi) / 2;
      if (inside(m)) lo = m;
      else hi = m;
    }
    return lo;
  };
  out[0] = first === 0 ? t.rIn : edge(t.rIn + first * step, t.rIn + (first - 1) * step);
  out[1] = last === n ? t.rWall : edge(t.rIn + last * step, t.rIn + (last + 1) * step);
  return out[1] - out[0] > 1e-4 ? out : null;
}

export class Liquid {
  readonly mesh: THREE.Mesh;
  readonly caps: THREE.Mesh[];
  /** The free surface (an annulus re-posed at the level; the body's own top is the full level). */
  readonly surface: THREE.Mesh;
  private frac = -1;
  private want = -1;
  private surfaceOn = false;
  private readonly hMax: number;
  private readonly level = { value: 1e6 };
  private readonly owned: THREE.Material[] = [];
  private readonly span: [number, number] = [0, 0];
  private entries: Entry[] = [];
  empty = false;

  constructor(
    kit: Kit,
    mats: VehicleMats,
    readonly tank: TankId,
    readonly section: Section,
    private seg: number,
  ) {
    const def = TANKS[tank];
    const look = def.prop === 'lox' ? 'lox' : 'rp1';
    const part = tank.startsWith('s1') ? (def.prop === 'lox' ? 's1-lox-tank' : 's1-fuel-tank') : 's2-tanks';
    // per-tank materials: the wedge-clipped liquid plus a discard above this tank's level (local
    // y of the section and cap groups is the model-frame height)
    const u = this.level;
    const leveled = (m: THREE.Material) => {
      const c = cloneMat(m);
      withHook(c, 'liquid-level', (s) => {
        s.uniforms.uLevel = u;
        s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying float vLiqY;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLiqY = position.y;');
        s.fragmentShader = s.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float uLevel;\nvarying float vLiqY;')
          .replace('#include <clipping_planes_fragment>', 'if (vLiqY > uLevel) discard;\n#include <clipping_planes_fragment>');
      });
      this.owned.push(c);
      return c;
    };
    const bodyMat = leveled(mats.clip(mats.get(look)));
    const capMat = leveled(mats.get(look === 'lox' ? 'loxCap' : 'rp1Cap'));

    // full-load geometry (levels only ever fall from here)
    this.hMax = levelHeightFast(def, 1);
    const poly = liquidPoly(def, this.hMax);
    const g = poly.length >= 3 ? lathe(poly, { seg, closed: true, smooth: 40 }) : new THREE.BufferGeometry();
    g.computeBoundingSphere();
    this.mesh = new THREE.Mesh(g, bodyMat);
    this.mesh.name = `liquid:${tank}`;
    this.mesh.renderOrder = 2;
    this.mesh.visible = false;
    section.group.add(this.mesh);
    const cg = poly.length >= 3 ? capFromPoly(poly) : new THREE.BufferGeometry();
    cg.computeBoundingSphere();
    this.caps = [0, 1].map((k) => {
      const m = new THREE.Mesh(cg, capMat);
      m.name = `liquid-cap:${tank}`;
      m.renderOrder = 2;
      m.visible = false;
      section.caps[k].add(m);
      return m;
    });

    // free-surface annulus: (seg + 1) inner and outer vertices, facing up
    const cols = seg + 1;
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cols * 2 * 3), 3));
    const nrm = new Float32Array(cols * 2 * 3);
    for (let i = 0; i < cols * 2; i++) nrm[i * 3 + 1] = 1;
    sg.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    const idx: number[] = [];
    for (let i = 0; i < seg; i++) idx.push(i, cols + i, i + 1, i + 1, cols + i, cols + i + 1);
    sg.setIndex(idx);
    this.surface = new THREE.Mesh(sg, bodyMat);
    this.surface.name = `liquid-surface:${tank}`;
    this.surface.renderOrder = 2;
    this.surface.visible = false;
    this.surface.frustumCulled = false;
    section.group.add(this.surface);

    const meshes = [this.mesh, ...this.caps, this.surface];
    for (const m of meshes) {
      m.castShadow = false;
      m.receiveShadow = false;
      this.entries.push(kit.register(m, { kind: 'liquid', part: part as never, mat: null, body: tank.startsWith('s1') ? 'booster' : 'upper' }));
    }
    // liquids are fluids, not structure: keep them out of the materials lens by material id
    for (const m of meshes) m.userData.fluid = def.prop;
  }

  /**
   * Set the usable fraction left (0..1). Applied when `build` is true (the liquid is on screen,
   * i.e. in the cutaway), otherwise kept for flush(). Returns true when the level changed.
   * Cheap: a uniform and one ring of vertices.
   */
  setLevel(frac: number, build = true): boolean {
    const f = Math.max(0, Math.min(1, frac));
    this.want = f;
    if (!build || f === this.frac) return false;
    this.frac = f;
    const def = TANKS[this.tank];
    this.empty = f <= 0.002;
    const h = this.empty ? -1e6 : f >= 1 ? this.hMax : levelHeightFast(def, f);
    // at full load the body's own flat top is the surface
    this.level.value = f >= 1 ? this.hMax + 1 : h;
    const span = !this.empty && f < 1 ? surfaceSpan(def, h, this.span) : null;
    if (span) {
      const pa = this.surface.geometry.getAttribute('position') as THREE.BufferAttribute;
      const P = pa.array as Float32Array;
      const cols = this.seg + 1;
      // a hair below the level so the discard never touches it
      const y = h - 0.002;
      for (let i = 0; i < cols; i++) {
        const phi = (i / this.seg) * Math.PI * 2;
        const s = Math.sin(phi);
        const c = Math.cos(phi);
        P[i * 3] = span[0] * s;
        P[i * 3 + 1] = y;
        P[i * 3 + 2] = span[0] * c;
        P[(cols + i) * 3] = span[1] * s;
        P[(cols + i) * 3 + 1] = y;
        P[(cols + i) * 3 + 2] = span[1] * c;
      }
      pa.needsUpdate = true;
    }
    this.surfaceOn = !!span;
    return true;
  }

  /** Apply a level that was set while the liquid was not shown. */
  flush(): boolean {
    return this.want >= 0 ? this.setLevel(this.want, true) : false;
  }

  /** Show or hide every mesh of this liquid (the cutaway decides). */
  show(on: boolean) {
    const v = on && !this.empty;
    this.mesh.visible = v;
    for (const c of this.caps) c.visible = v;
    this.surface.visible = v && this.surfaceOn;
  }

  get fraction() {
    return this.frac;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.caps[0].geometry.dispose();
    this.surface.geometry.dispose();
    for (const m of this.owned) m.dispose();
  }
}
