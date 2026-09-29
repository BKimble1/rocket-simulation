/**
 * Propellant shown in the cutaway: a solid of revolution filling each tank up to a flat free
 * surface, clipped by the cutaway wedge, with its own cut faces on the two wedge planes.
 * Rebuilt only when the level changes (cheap: a few thousand vertices).
 */
import * as THREE from 'three';
import type { Kit, Section, Entry } from './kit';
import type { VehicleMats } from './mats';
import { TANKS, levelHeight, liquidPoly, type TankId } from './tanks';
import { lathe, capFromPoly } from './geom';

export class Liquid {
  readonly mesh: THREE.Mesh;
  readonly caps: THREE.Mesh[];
  private frac = -1;
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
    const body = mats.clip(mats.get(look));
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), body);
    this.mesh.name = `liquid:${tank}`;
    this.mesh.renderOrder = 2;
    this.mesh.visible = false;
    section.group.add(this.mesh);
    const capMat = mats.get(look === 'lox' ? 'loxCap' : 'rp1Cap');
    this.caps = [0, 1].map((k) => {
      const m = new THREE.Mesh(new THREE.BufferGeometry(), capMat);
      m.name = `liquid-cap:${tank}`;
      m.renderOrder = 2;
      section.caps[k].add(m);
      return m;
    });
    const meshes = [this.mesh, ...this.caps];
    for (const m of meshes) {
      m.castShadow = false;
      m.receiveShadow = false;
      this.entries.push(kit.register(m, { kind: 'liquid', part: part as never, mat: null, body: tank.startsWith('s1') ? 'booster' : 'upper' }));
    }
    // liquids are fluids, not structure: keep them out of the materials lens by material id
    for (const m of meshes) m.userData.fluid = def.prop;
  }

  /** Set the usable fraction left (0..1). Returns true when the geometry changed. */
  setLevel(frac: number): boolean {
    const f = Math.max(0, Math.min(1, frac));
    if (Math.abs(f - this.frac) < 0.0015) return false;
    this.frac = f;
    const def = TANKS[this.tank];
    const h = levelHeight(def, f);
    const poly = f > 0.002 ? liquidPoly(def, h) : [];
    this.empty = poly.length < 3;
    this.mesh.geometry.dispose();
    for (const c of this.caps) c.geometry.dispose();
    if (this.empty) {
      this.mesh.geometry = new THREE.BufferGeometry();
      for (const c of this.caps) c.geometry = new THREE.BufferGeometry();
      return true;
    }
    const g = lathe(poly, { seg: this.seg, closed: true, smooth: 40 });
    g.computeBoundingSphere();
    this.mesh.geometry = g;
    const cg = capFromPoly(poly);
    cg.computeBoundingSphere();
    for (const c of this.caps) c.geometry = cg;
    return true;
  }

  get level() {
    return this.frac;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.caps[0].geometry.dispose();
  }
}
