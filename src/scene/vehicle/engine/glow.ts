/**
 * Light inside the engine for demonstrations: combustion glow in the chamber and nozzle and
 * inside the gas generator (drawn in the back half, so it is seen only through the section),
 * and the brief green TEA-TEB ignition flash (inside the chamber and at the nozzle exit).
 */
import * as THREE from 'three';
import { radiusAt } from './contour';
import type { Design } from './design';
import { BACK, revolve, type V2 } from './geo';
import { TP } from './layout';
import type { EngineOperating } from './types';

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function colored(g: THREE.BufferGeometry, color: (y: number) => [number, number, number]): THREE.BufferGeometry {
  const p = g.attributes.position;
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const [r, gg, b] = color(p.getY(i));
    c[i * 3] = r;
    c[i * 3 + 1] = gg;
    c[i * 3 + 2] = b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

export function buildGlow(d: Design, segs: number) {
  const group = new THREE.Group();
  group.name = 'glow';
  const mat = () =>
    new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const x0 = d.contour.xInj;
  const x1 = d.contour.xExit;
  const L = x1;
  const prof = (f: number): V2[] => {
    const out: V2[] = [];
    const n = 80;
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      out.push([radiusAt(d.contour, x) * f, d.y(x)]);
    }
    return out;
  };
  // hot gas: bright in the chamber and throat, cooling and dimming down the nozzle
  const tone = (y: number, k: number): [number, number, number] => {
    const x = d.x(y);
    const down = x <= 0 ? 1 : Math.exp(-x / (0.28 * L + 0.2));
    const warm = x <= 0 ? 0 : Math.min(1, x / (0.5 * L + 0.1));
    return [k * down, k * down * (0.8 - 0.35 * warm), k * down * (0.52 - 0.35 * warm)];
  };
  const wallGeo = colored(revolve([{ pts: prof(0.965), open: true }], BACK[0], BACK[1], segs).surf!, (y) => tone(y, 0.62));
  const coreGeo = colored(revolve([{ pts: prof(0.5), open: true }], BACK[0], BACK[1], Math.round(segs / 2)).surf!, (y) => tone(y, 0.9));
  const wallMat = mat();
  const coreMat = mat();
  const wall = new THREE.Mesh(wallGeo, wallMat);
  const core = new THREE.Mesh(coreGeo, coreMat);
  wall.renderOrder = core.renderOrder = 5;
  group.add(wall, core);

  // gas generator combustion (fuel-rich, dull orange)
  const ggPts: V2[] = [
    [0.049, -0.66],
    [0.049, -0.855],
  ];
  const ggGeo = colored(revolve([{ pts: ggPts, open: true }], BACK[0], BACK[1], 48, { centre: new THREE.Vector3(d.tpX, 0, 0) }).surf!, (y) => {
    const t = (y - TP.ggHeadY) / (TP.ggTop - TP.ggHeadY);
    return [0.95 - 0.3 * t, 0.36 - 0.12 * t, 0.1];
  });
  const ggMat = mat();
  const ggGlow = new THREE.Mesh(ggGeo, ggMat);
  group.add(ggGlow);

  // ignition flash at the exit (green TEA-TEB light spilling out of the nozzle)
  const er = d.exitR;
  const flashPts: V2[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    flashPts.push([er * (0.97 - 0.55 * t * t), d.exitY - t * er * 0.9]);
  }
  const flashGeo = colored(revolve([{ pts: flashPts, open: true }], 0, Math.PI * 2, segs).surf!, (y) => {
    const t = (d.exitY - y) / (er * 0.9);
    const k = 1 - t;
    return [0.25 * k, 0.9 * k, 0.4 * k];
  });
  const flashMat = mat();
  const flash = new THREE.Mesh(flashGeo, flashMat);
  group.add(flash);
  for (const m of [wall, core, ggGlow, flash]) m.visible = false;

  const green = new THREE.Color(0.38, 1, 0.5);
  const white = new THREE.Color(1, 1, 1);
  return {
    group,
    update(o: EngineOperating, cut: number) {
      const open = smooth(0.02, 0.35, cut);
      const burn = Math.max(0, Math.min(1, o.flow));
      const ig = Math.max(0, Math.min(1, o.ignite));
      const a = Math.max(burn, ig) * open;
      const g = ig / (ig + burn + 1e-6);
      for (const m of [wallMat, coreMat]) {
        m.color.copy(white).lerp(green, g);
        m.opacity = a;
      }
      wall.visible = core.visible = a > 0.005;
      ggMat.opacity = o.gg ? open : 0;
      ggGlow.visible = ggMat.opacity > 0.005;
      flashMat.opacity = ig * 0.9;
      flash.visible = ig > 0.005;
    },
    dispose() {
      for (const m of [wall, core, ggGlow, flash]) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    },
  };
}
