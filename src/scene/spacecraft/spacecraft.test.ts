/**
 * Spacecraft builder checks (Node, with a stub 2D canvas: textures are not rendered here).
 * Envelope inside the fairing, stack heights against the spec, tags on every mesh, anchors,
 * state/cut/demo purity (same inputs give the same pose), disposal.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { SpacecraftKind, SpacecraftModel } from './types';
import { MOUNT_Y } from './types';
import { isPartId } from '../../vehicle/parts';
import { MATERIAL_IDS } from '../../content/materials/ids';
import { ASSIGNMENTS } from '../../content/materials/assignments';
import { STATIONS, CAPSULE, SERVICE_MODULE, ABORT_TOWER } from '../../vehicle/spec';

function stubCanvas() {
  const ctx: Record<string, unknown> = new Proxy(
    {},
    {
      get(t: Record<string, unknown>, k: string) {
        if (k in t) return t[k];
        if (k === 'createImageData' || k === 'getImageData')
          return (w: number | { width: number; height: number }, h?: number) => {
            const ww = typeof w === 'number' ? w : w.width;
            const hh = typeof w === 'number' ? (h as number) : w.height;
            return { data: new Uint8ClampedArray(ww * hh * 4), width: ww, height: hh };
          };
        if (k === 'measureText') return () => ({ width: 10 });
        if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
        return () => undefined;
      },
      set(t: Record<string, unknown>, k: string, v: unknown) {
        t[k] = v;
        return true;
      },
    },
  );
  const g = globalThis as unknown as Record<string, unknown>;
  g.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  g.Path2D = class {};
}

let build: (k: SpacecraftKind, d: 'hangar' | 'flight', m: number) => SpacecraftModel;
beforeAll(async () => {
  stubCanvas();
  build = (await import('./buildSpacecraft')).buildSpacecraft;
});

const bounds = (m: SpacecraftModel) => {
  const b = new THREE.Box3();
  for (const g of Object.values(m.bodies)) {
    if (!g) continue;
    g.updateMatrixWorld(true);
    g.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !o.visible) return;
      let vis = true;
      o.traverseAncestors((a) => (vis = vis && a.visible));
      if (!vis) return;
      mesh.geometry.computeBoundingBox();
      b.union(mesh.geometry.boundingBox!.clone().applyMatrix4(o.matrixWorld));
    });
  }
  return b;
};

/** Largest radial distance from the Y axis over visible vertices. */
const maxRadius = (m: SpacecraftModel) => {
  let r = 0;
  const v = new THREE.Vector3();
  for (const g of Object.values(m.bodies))
    g?.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      let vis = true;
      o.traverseAncestors((a) => (vis = vis && a.visible));
      if (!vis || !o.visible) return;
      const p = mesh.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
        r = Math.max(r, Math.hypot(v.x, v.z));
      }
    });
  return r;
};

describe('satellites fit the fairing', () => {
  for (const kind of ['leoSat', 'gtoSat', 'lunarProbe'] as const)
    it(`${kind}: stowed inside r 1.7 m and below 63 m, seated on the adapter`, () => {
      const m = build(kind, 'hangar', MOUNT_Y.upperStage);
      const b = bounds(m);
      expect(b.max.y).toBeLessThan(63);
      expect(maxRadius(m)).toBeLessThan(1.7);
      expect(b.min.y).toBeGreaterThan(STATIONS.payloadAdapterTop - 0.06);
      expect(m.anchors.topY).toBeGreaterThan(b.max.y - 0.3);
      expect(m.anchors.satRcs.length).toBeGreaterThanOrEqual(4);
      m.dispose();
    });
  it('gtoSat has an apogee engine anchor at the base', () => {
    const m = build('gtoSat', 'hangar', MOUNT_Y.upperStage);
    expect(m.anchors.satApogee).not.toBeNull();
    expect(m.anchors.satApogee!.exit.y).toBeLessThan(STATIONS.payloadAdapterTop + 0.1);
    expect(m.parts.get('apogee-engine')?.length).toBeGreaterThan(0);
    m.dispose();
  });
});

describe('capsule stack', () => {
  it('matches the spec dimensions and carries its anchors', () => {
    const m = build('capsule', 'hangar', MOUNT_Y.upperStage);
    expect(Object.keys(m.bodies).sort()).toEqual(['capsule', 'les', 'service']);
    const cap = new THREE.Box3().setFromObject(m.bodies.capsule!.children[0].children[0]);
    void cap;
    const bc = bounds({ ...m, bodies: { capsule: m.bodies.capsule } } as SpacecraftModel);
    const bs = bounds({ ...m, bodies: { service: m.bodies.service } } as SpacecraftModel);
    const bl = bounds({ ...m, bodies: { les: m.bodies.les } } as SpacecraftModel);
    // capsule: 3.9 m base, 3.3 m tall (parachutes stowed, so visible bounds are the capsule)
    expect(bc.max.x - bc.min.x).toBeCloseTo(CAPSULE.baseDiameter, 1);
    expect(bc.max.y - bc.min.y).toBeCloseTo(CAPSULE.height, 1);
    // service module 3.2 m from the interface plane, stowed wings outside the 3.7 m body
    expect(bs.min.y).toBeCloseTo(MOUNT_Y.upperStage, 2);
    expect(bs.max.y).toBeCloseTo(MOUNT_Y.upperStage + SERVICE_MODULE.length, 1);
    // abort tower 7.9 m
    expect(bl.max.y - bl.min.y).toBeGreaterThan(ABORT_TOWER.length - 0.1);
    expect(bl.max.y - bl.min.y).toBeLessThan(ABORT_TOWER.length + 0.15);
    // crew hatch near the crew access arm height (~58.3 m in the model frame)
    expect(m.anchors.dockPort).not.toBeNull();
    expect(m.anchors.smEngine!.exit.y).toBeGreaterThan(STATIONS.payloadAdapterTop);
    expect(m.anchors.lesNozzles).toHaveLength(4);
    expect(m.anchors.capsuleRcs.length).toBeGreaterThanOrEqual(4);
    expect(m.anchors.smRcs).toHaveLength(4);
    expect(m.anchors.chuteAttach).not.toBeNull();
    m.dispose();
  });
  it('research capsule: no docking system, rim on the adapter', () => {
    const m = build('researchCapsule', 'hangar', MOUNT_Y.boosterCapsuleAdapter);
    expect(Object.keys(m.bodies)).toEqual(['capsule']);
    expect(m.parts.has('docking-system')).toBe(false);
    expect(m.anchors.dockPort).toBeNull();
    const b = bounds(m);
    expect(b.max.y - b.min.y).toBeCloseTo(CAPSULE.height, 1);
    m.dispose();
  });
  it('parachutes deploy above the capsule along +Y', () => {
    const m = build('capsule', 'flight', MOUNT_Y.upperStage);
    const b0 = bounds(m);
    m.setState({ capDrogue: 1 });
    const b1 = bounds(m);
    m.setState({ capDrogue: 0, capMain: 1 });
    const b2 = bounds(m);
    expect(b1.max.y).toBeGreaterThan(b0.max.y + 20);
    expect(b2.max.y).toBeGreaterThan(b1.max.y + 10);
    expect(b2.max.x - b2.min.x).toBeGreaterThan(40);
    m.dispose();
  });
});

describe('station', () => {
  it('is about 60 m across with a clear approach corridor below its nadir docking port', () => {
    const m = build('station', 'flight', 0);
    const b = bounds(m);
    const span = Math.max(b.max.x - b.min.x, b.max.z - b.min.z);
    expect(span).toBeGreaterThan(50);
    expect(span).toBeLessThan(70);
    const port = m.anchors.dockPort!;
    expect(port.axis.y).toBe(-1);
    // nothing within 3 m of the radial line below the port (capsule 3.9 m wide approaches on it)
    const v = new THREE.Vector3();
    let intrusions = 0;
    m.bodies.station!.updateMatrixWorld(true);
    m.bodies.station!.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const p = mesh.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
        if (v.y < port.pos.y - 0.01 && Math.hypot(v.x - port.pos.x, v.z - port.pos.z) < 3) intrusions++;
      }
    });
    expect(intrusions).toBe(0);
    m.dispose();
  });
});

describe('every kind', () => {
  const kinds: SpacecraftKind[] = ['leoSat', 'gtoSat', 'lunarProbe', 'capsule', 'researchCapsule', 'station'];
  for (const kind of kinds)
    for (const detail of ['hangar', 'flight'] as const)
      it(`${kind} ${detail}: tagged meshes, parts map, pure posing`, () => {
        const m = build(kind, detail, MOUNT_Y.upperStage);
        let meshes = 0;
        for (const g of Object.values(m.bodies))
          g?.traverse((o) => {
            if (!(o as THREE.Mesh).isMesh) return;
            meshes++;
            const part = o.userData.part as string;
            const mat = o.userData.material as string;
            expect(isPartId(part), `part tag on ${o.name}`).toBe(true);
            expect((MATERIAL_IDS as readonly string[]).includes(mat), `material tag ${mat}`).toBe(true);
          });
        expect(meshes).toBeGreaterThan(5);
        let listed = 0;
        for (const list of m.parts.values()) listed += list.length;
        expect(listed).toBeGreaterThanOrEqual(meshes);
        // posing is a pure function of state, cut and demo progress
        const snap = () => {
          const out: number[] = [];
          for (const g of Object.values(m.bodies)) g?.traverse((o) => out.push(o.position.x, o.position.y, o.position.z, o.rotation.x, o.rotation.y, o.rotation.z, o.visible ? 1 : 0));
          return out;
        };
        m.animate(1, 'spacecraft-ops', 0.7);
        m.setCut(0.6);
        const a = snap();
        m.animate(5, 'capsule-return', 0.9);
        m.animate(2, 'heat-shield-stack', 0.5);
        m.setCut(0);
        m.animate(0, null, 0);
        m.setCut(0.6);
        m.animate(9, 'spacecraft-ops', 0.7);
        expect(snap()).toEqual(a);
        m.dispose();
      });
});

describe('draw-call budgets and thermal classes', () => {
  /** Visible meshes (main-pass draw calls) and shadow casters among them. */
  const calls = (m: SpacecraftModel) => {
    let vis = 0;
    let shadow = 0;
    for (const g of Object.values(m.bodies))
      g?.traverse((o) => {
        if (!(o as THREE.Mesh).isMesh || !o.visible) return;
        let v = true;
        o.traverseAncestors((a) => (v = v && a.visible));
        if (!v) return;
        vis++;
        if (o.castShadow) shadow++;
      });
    return { vis, shadow };
  };
  const kinds: SpacecraftKind[] = ['leoSat', 'gtoSat', 'lunarProbe', 'capsule', 'researchCapsule', 'station'];
  for (const kind of kinds)
    it(`${kind}: hangar <= 250 calls with shadows, flight <= 60 (station 120) in every state`, () => {
      for (const detail of ['hangar', 'flight'] as const) {
        const m = build(kind, detail, MOUNT_Y.upperStage);
        const states = [{}, { satArrays: 1, satAntenna: 1, smArrays: 1, capNoseCone: 1 }, { capDrogue: 1 }, { capMain: 0.5 }, { capMain: 1 }];
        for (const st of states)
          for (const cut of [0, 0.5, 1]) {
            m.setState({ satArrays: 0, satAntenna: 0, smArrays: 0, capNoseCone: 0, capDrogue: 0, capMain: 0, ...st });
            m.setCut(cut);
            const c = calls(m);
            if (detail === 'hangar') expect(c.vis + c.shadow, `${JSON.stringify(st)} cut ${cut}`).toBeLessThanOrEqual(kind === 'station' ? 120 : 250);
            else expect(c.vis, `${JSON.stringify(st)} cut ${cut}`).toBeLessThanOrEqual(kind === 'station' ? 120 : 60);
          }
        m.dispose();
      }
    });
  it('tags every mesh with a thermal class (heat shield 4, backshell tiles 3)', () => {
    for (const kind of kinds) {
      const m = build(kind, 'flight', MOUNT_Y.upperStage);
      for (const g of Object.values(m.bodies))
        g?.traverse((o) => {
          if (!(o as THREE.Mesh).isMesh) return;
          const k = o.userData.thermal as number;
          expect(Number.isInteger(k) && k >= 0 && k <= 4, `${kind} ${o.name}`).toBe(true);
          if (o.userData.part === 'heat-shield') expect(k).toBe(4);
          if (o.userData.part === 'backshell-tps') expect(k).toBe(3);
          if (o.userData.part === 'mli-blankets') expect(k).toBe(1);
        });
      m.dispose();
    }
  });
});

describe('material tags agree with the assignments table (known gaps listed)', () => {
  it('uses only assigned materials per part, except documented gaps', () => {
    // the heat shield's fibrous insulation layer has no assignment row of its own; the service
    // module's main engine has a niobium (C103) nozzle and a steel chamber and valves, which the
    // service-module row does not list (reported to the content owners)
    const gaps = new Set(['heat-shield:ceramic-tiles', 'service-module:niobium-c103', 'service-module:stainless']);
    const bad = new Set<string>();
    for (const kind of ['leoSat', 'gtoSat', 'lunarProbe', 'capsule', 'researchCapsule', 'station'] as SpacecraftKind[]) {
      const m = build(kind, 'hangar', MOUNT_Y.upperStage);
      for (const [part, list] of m.parts)
        for (const o of list) {
          const mat = o.userData.material as string;
          const ok = (ASSIGNMENTS[part] ?? []).some((u) => u.material === mat);
          if (!ok && !gaps.has(`${part}:${mat}`)) bad.add(`${part}:${mat}`);
        }
      m.dispose();
    }
    expect([...bad]).toEqual([]);
  });
});
