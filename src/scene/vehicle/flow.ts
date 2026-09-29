/**
 * Flow overlays for the propellant demonstrations: animated chevron tubes along the real
 * routes (downcomer and feed lines, pressurant lines). Colours match the labelled legend:
 * LOX #8fc6ff, RP-1 #e0a24a, helium #b6f0c8, guidance signals #c8bcff (gnc-loop: avionics to
 * the engine actuators along the raceway). Each route is drawn twice: a solid pass that
 * respects depth, and a faint "x-ray" pass so the route stays readable through the skin.
 * The motion is schematic (slowed and not to scale), which the interface labels say.
 */
import * as THREE from 'three';
import { bentPath } from './geom';
import { chevronTexture } from './textures';
import type { FlowPath } from './ctx';
import type { Kit } from './kit';

export const FLOW_COLORS = { lox: '#8fc6ff', rp1: '#e0a24a', he: '#b6f0c8', sig: '#c8bcff' } as const;

interface FlowMesh {
  demo: FlowPath['demo'];
  meshes: THREE.Mesh[];
  mats: THREE.MeshBasicMaterial[];
  tex: THREE.Texture;
  len: number;
}

export class FlowOverlays {
  private items: FlowMesh[] = [];
  private active: string | null = null;

  constructor(kit: Kit, paths: FlowPath[]) {
    if (!kit.hangar) return;
    const base = chevronTexture();
    for (const p of paths) {
      const curve = bentPath(p.points, 0.2);
      const len = curve.getLength();
      const geo = new THREE.TubeGeometry(curve as unknown as THREE.Curve<THREE.Vector3>, Math.max(8, Math.ceil(len * 8)), p.radius, 10, false);
      const tex = base.clone();
      tex.repeat.set(len / 0.45, 1);
      tex.needsUpdate = true;
      const color = new THREE.Color(FLOW_COLORS[p.kind]);
      const solid = new THREE.MeshBasicMaterial({ color, map: tex, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false });
      const xray = new THREE.MeshBasicMaterial({ color, map: tex, transparent: true, opacity: 0.32, depthTest: false, depthWrite: false, toneMapped: false });
      const m1 = new THREE.Mesh(geo, solid);
      const m2 = new THREE.Mesh(geo, xray);
      m1.renderOrder = 20;
      m2.renderOrder = 21;
      for (const m of [m1, m2]) {
        m.visible = false;
        m.name = `flow:${p.kind}`;
        m.raycast = () => {};
        p.section.group.add(m);
        kit.register(m, { kind: 'overlay', part: null, mat: null });
      }
      this.items.push({ demo: p.demo, meshes: [m1, m2], mats: [solid, xray], tex, len });
    }
  }

  /** Show the overlays of a demo (or none) and scroll them with stage time t (s). */
  update(demo: string | null, t: number, strength = 1) {
    const want = demo === 'feed-flow' || demo === 'tank-pressure' || demo === 'gnc-loop' ? demo : null;
    if (want !== this.active) {
      for (const it of this.items) for (const m of it.meshes) m.visible = it.demo === want;
      this.active = want;
    }
    if (!want) return;
    for (const it of this.items) {
      if (it.demo !== want) continue;
      // chevrons move along the route at about 1.2 m/s (schematic)
      it.tex.offset.x = -((t * 1.2) / 0.45) % 1;
      it.mats[0].opacity = 0.95 * strength;
      it.mats[1].opacity = 0.32 * strength;
    }
  }

  dispose() {
    for (const it of this.items) {
      it.meshes[0].geometry.dispose();
      for (const m of it.mats) m.dispose();
      it.tex.dispose();
    }
  }
}
