/**
 * Shadow stand-ins for the hangar-detail engine. The detailed meshes (hundreds of thousands of
 * triangles once bolts, lines and internals are counted) do not cast shadows; a few coarse
 * shells drawn only into the shadow map do instead: the thrust chamber and bell, the turbopump
 * and gas generator, the turbine exhaust duct and the main lines (and the E-1V extension). They
 * are inset a few millimetres inside the real surfaces so nothing shadows itself by mistake.
 * Each shell exists as a back half (stays in the section view) and a front half (leaves with
 * the removable half), so the cutaway also lets the light in.
 *
 * The shells are ordinary meshes whose material writes neither colour nor depth: in the main
 * pass they cost one cheap draw call each; in the shadow pass they are the only engine casters.
 */
import * as THREE from 'three';
import type { Design } from './design';
import { BACK, FRONT, clippedTube, filletPath, merge, revolve, transportFrames, type V2 } from './geo';
import { TP, routes } from './layout';

export interface ShadowShells {
  back: THREE.BufferGeometry;
  front: THREE.BufferGeometry;
}

const INSET = 0.004;

export function buildShadowShells(d: Design): ShadowShells {
  const back: THREE.BufferGeometry[] = [];
  const front: THREE.BufferGeometry[] = [];
  const halves = (pts: V2[], segs: number, centre?: THREE.Vector3) => {
    const loops = [{ pts, open: true }];
    back.push(revolve(loops, BACK[0], BACK[1], segs, { centre }).surf!);
    front.push(revolve(loops, FRONT[0], FRONT[1], segs, { centre }).surf!);
  };

  // thrust chamber: gimbal boss, LOX dome, injector, chamber jacket, bell (to the regen end)
  const prof: V2[] = [
    [0.001, -0.09],
    [0.06, -0.09],
    [d.domeR * 0.72, d.domeBaseY + d.domeH * 0.66],
    [d.domeR - INSET, d.domeBaseY + 0.01],
    [d.domeR + 0.01, d.domeBaseY - 0.01],
    [d.domeR + 0.01, d.injY + 0.01],
  ];
  const yRegen = d.y(d.xRegenEnd);
  const n = 26;
  for (let i = 0; i <= n; i++) {
    // denser near the throat, where the contour turns fastest
    const t = i / n;
    const y = d.injY - 0.01 + (yRegen - d.injY + 0.01) * Math.pow(t, 1.35);
    prof.push([Math.max(0.01, d.rOut(y) - INSET), y]);
  }
  halves(prof, 36);

  // E-1V: the radiatively cooled extension (thin wall)
  if (d.vac) {
    const ext: V2[] = [];
    const m = 14;
    for (let i = 0; i <= m; i++) {
      const y = yRegen + (d.exitY - yRegen) * (i / m);
      ext.push([d.rIn(y) + 0.001, y]);
    }
    halves(ext, 40);
  }

  // turbopump housings and the gas generator, about the pump axis
  const tp: V2[] = [
    [0.07, TP.loxInletTop],
    [0.096, -0.03],
    [0.12, -0.12],
    [0.06, -0.19],
    [0.06, -0.29],
    [0.094, -0.33],
    [0.12, -0.39],
    [0.06, -0.44],
    [0.12, -0.49],
    [0.126, -0.58],
    [0.06, -0.64],
    [0.052, -0.86],
    [0.03, TP.ggBottom],
  ];
  halves(tp, 16, new THREE.Vector3(d.tpX, 0, 0));

  // turbine exhaust duct and the main lines (thin tubes, whole: they cross the plane little)
  const R = routes(d);
  const line = (pts: THREE.Vector3[], r: number, bend: number) => {
    const path = filletPath(pts, bend, 0.08);
    const res = clippedTube(transportFrames(path), { ro: r, segs: 7, clipZ: 0 });
    if (res.back.surf) back.push(res.back.surf);
    if (res.front.surf) front.push(res.front.surf);
  };
  line(R.exhaust, TP.exhaustR - INSET, 0.1);
  line(R.loxDischarge, TP.loxLineR - INSET, 0.1);
  line(R.fuelDischarge, TP.fuelLineR - INSET, 0.09);
  line(R.fuelDown, TP.fuelLineR - INSET, 0.2);
  line(R.loxInlet, TP.loxDuctR - INSET, 0.05);

  const out = { back: merge(back), front: merge(front) };
  for (const g of [out.back, out.front]) {
    g.deleteAttribute('uv');
    g.computeBoundingSphere();
  }
  return out;
}

/** Material of the stand-ins: invisible in the main pass, depth-only in the shadow pass. */
export function shadowShellMaterial(): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide });
  m.name = 'engine:shadow-shell';
  return m;
}
