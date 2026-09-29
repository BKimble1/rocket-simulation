/**
 * Sandwich-panel coupon for the 'sandwich-panel' demonstration (hangar only): a square sample of
 * the fairing wall shown just outside the cutaway wedge, with thicknesses enlarged (label says
 * so): outer carbon face sheet with the white paint, aluminium honeycomb core (hexagonal cells),
 * inner carbon face sheet. The layers slide apart along the panel normal and close again, so the
 * learner sees what the thin wall in the section view is made of.
 */
import * as THREE from 'three';
import { BODY_RADIUS, FAIRING } from '../../vehicle/spec';
import type { BodyId, PartId } from '../../vehicle/parts';
import type { Kit } from './kit';
import { bevelBox, mergeAll } from './geom';
import { WEDGE } from './layout';

/** Coupon size and the enlarged layer thicknesses (m). */
const W = 1.1;
const Hh = 0.86;
const FACE = 0.022;
const CORE = 0.17;
const CELL = 0.062; // hexagon circumradius
const WALL_T = 0.0045;

export class SandwichCoupon {
  readonly group = new THREE.Group();
  private layers: { obj: THREE.Object3D; dir: number }[] = [];
  private last = -1;

  /**
   * @param part the sandwich structure the sample is cut from ('fairing', or the interstage or
   *   capsule adapter when the configuration has no fairing)
   */
  constructor(kit: Kit, parent: THREE.Object3D, y: number, part: PartId, body: BodyId) {
    this.group.name = 'sandwich-coupon';
    this.group.visible = false;
    // in front of the cutaway wedge, a little to one side of its bisector, turned about 55 deg so a
    // camera looking into the wedge sees both the painted face and the layered edge
    const phi = (WEDGE.from + WEDGE.to) / 2 + 0.33;
    const r = (part === 'fairing' ? FAIRING.diameter / 2 : BODY_RADIUS) + 1.4;
    this.group.position.set(r * Math.sin(phi), y, r * Math.cos(phi));
    this.group.rotation.set(0.22, phi - 0.95, 0, 'YXZ');
    parent.add(this.group);

    const add = (geom: THREE.BufferGeometry, look: string, mat: 'cfrp-sandwich' | 'honeycomb-core', z: number, dir: number) => {
      const holder = new THREE.Group();
      holder.position.z = z;
      this.group.add(holder);
      const mesh = new THREE.Mesh(mergeAll([geom]), kit.mats.get(look));
      mesh.name = `coupon:${look}`;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      const pa = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      mesh.geometry.setAttribute('aVeh', new THREE.BufferAttribute(new Float32Array(pa.count * 4), 4));
      holder.add(mesh);
      kit.register(mesh, { kind: 'overlay', part, mat, body });
      this.layers.push({ obj: holder, dir });
    };
    // outer face sheet: carbon with the white paint on its outer face
    add(bevelBox(W, Hh, FACE, 0.004), 'interstage', 'cfrp-sandwich', CORE / 2 + FACE / 2, 1);
    add(bevelBox(W - 0.004, Hh - 0.004, 0.003, 0.001).translate(0, 0, FACE / 2 + 0.0015), 'paint', 'cfrp-sandwich', CORE / 2 + FACE / 2, 1);
    // honeycomb core
    add(honeycomb(W - 0.01, Hh - 0.01, CORE), 'honeycomb', 'honeycomb-core', 0, 0);
    // inner face sheet
    add(bevelBox(W, Hh, FACE, 0.004), 'fairingInner', 'cfrp-sandwich', -(CORE / 2 + FACE / 2), -1);
  }

  /** Show (or hide) and set the layer separation 0..1. */
  set(visible: boolean, apart: number) {
    this.group.visible = visible;
    if (!visible || apart === this.last) return;
    this.last = apart;
    for (const l of this.layers) {
      const z0 = (l.obj.userData.z0 ??= l.obj.position.z) as number;
      l.obj.position.z = z0 + l.dir * apart * 0.2;
    }
  }

  dispose() {
    this.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.group.removeFromParent();
  }
}

/** Thin-walled hexagonal cells filling a W x H rectangle, depth d along Z. */
function honeycomb(w: number, h: number, d: number): THREE.BufferGeometry {
  const a = CELL;
  const edges = new Map<string, [number, number, number, number]>();
  const qMax = Math.ceil(w / (1.5 * a)) + 2;
  const rMax = Math.ceil(h / (Math.sqrt(3) * a)) + 2;
  for (let q = -qMax; q <= qMax; q++)
    for (let r = -rMax; r <= rMax; r++) {
      const cx = 1.5 * a * q;
      const cy = Math.sqrt(3) * a * (r + (q & 1 ? 0.5 : 0));
      for (let k = 0; k < 6; k++) {
        const t0 = (k * Math.PI) / 3;
        const t1 = ((k + 1) * Math.PI) / 3;
        let x0 = cx + a * Math.cos(t0);
        let y0 = cy + a * Math.sin(t0);
        let x1 = cx + a * Math.cos(t1);
        let y1 = cy + a * Math.sin(t1);
        // clip the edge to the rectangle (drop it when it lies outside)
        const clip = (x: number, y: number): [number, number] => [Math.max(-w / 2, Math.min(w / 2, x)), Math.max(-h / 2, Math.min(h / 2, y))];
        const inside = (x: number, y: number) => Math.abs(x) <= w / 2 && Math.abs(y) <= h / 2;
        if (!inside(x0, y0) && !inside(x1, y1)) continue;
        [x0, y0] = clip(x0, y0);
        [x1, y1] = clip(x1, y1);
        const key = [Math.round((x0 + x1) * 500), Math.round((y0 + y1) * 500)].join(',');
        if (!edges.has(key)) edges.set(key, [x0, y0, x1, y1]);
      }
    }
  const list: THREE.BufferGeometry[] = [];
  for (const [x0, y0, x1, y1] of edges.values()) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 0.004) continue;
    const g = new THREE.BoxGeometry(len + WALL_T, WALL_T, d);
    g.rotateZ(Math.atan2(y1 - y0, x1 - x0));
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, 0);
    list.push(g);
  }
  // closing frame around the sample so the cut cells read as a panel edge
  for (const [bw, bh, x, y] of [
    [w, WALL_T * 2, 0, h / 2],
    [w, WALL_T * 2, 0, -h / 2],
    [WALL_T * 2, h, w / 2, 0],
    [WALL_T * 2, h, -w / 2, 0],
  ]) {
    const g = new THREE.BoxGeometry(bw, bh, d);
    g.translate(x, y, 0);
    list.push(g);
  }
  return mergeAll(list);
}
