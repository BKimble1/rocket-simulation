/**
 * Light inside the engine for demonstrations: combustion glow in the chamber and nozzle and
 * inside the gas generator (drawn in the back half, so it is seen only through the section),
 * the dull fuel-rich glow in the mouth of the turbine exhaust duct while the gas generator
 * runs (seen without the section), and the brief green TEA-TEB ignition flash (inside the
 * chamber and at the nozzle exit).
 */
import * as THREE from 'three';
import { radiusAt } from './contour';
import type { Design } from './design';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BACK, revolve, type V2 } from './geo';
import { TP, routes } from './layout';
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
    const n = 44;
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
    return [k * down, k * down * (0.66 - 0.3 * warm), k * down * (0.34 - 0.24 * warm)];
  };
  // additive over a lit copper liner: kept moderate so the section stays legible (golden, not
  // a blown-out white that hides the liner, the throat and the flow overlay)
  const wallGeo = colored(revolve([{ pts: prof(0.965), open: true }], BACK[0], BACK[1], segs).surf!, (y) => tone(y, 0.36));
  const coreGeo = colored(revolve([{ pts: prof(0.5), open: true }], BACK[0], BACK[1], Math.round(segs / 2)).surf!, (y) => tone(y, 0.5));
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
  const ggGeo = colored(revolve([{ pts: ggPts, open: true }], BACK[0], BACK[1], 32, { centre: new THREE.Vector3(d.tpX, 0, 0) }).surf!, (y) => {
    const t = (y - TP.ggHeadY) / (TP.ggTop - TP.ggHeadY);
    return [0.95 - 0.3 * t, 0.36 - 0.12 * t, 0.1];
  });
  const ggMat = mat();
  const ggGlow = new THREE.Mesh(ggGeo, ggMat);
  group.add(ggGlow);

  // TEA-TEB ignition flash: the pyrophoric igniter fluid burns bright green. Seen through the
  // exit, the nozzle fills with green light (a glowing disc a little way up the bell); below the
  // exit a short, soft flame bulges out and closes (two nested shells, a paler core inside).
  // Normal blending with per-vertex alpha (additive light would wash out to white against the
  // pale hangar), and every shell fades toward its silhouette so no hard edge shows.
  const er = d.exitR;
  const rgba = (g: THREE.BufferGeometry, rgb: [number, number, number], alpha: (r: number, y: number) => number) => {
    const p = g.attributes.position;
    const c = new Float32Array(p.count * 4);
    for (let i = 0; i < p.count; i++) c.set([rgb[0], rgb[1], rgb[2], alpha(Math.hypot(p.getX(i), p.getZ(i)), p.getY(i))], i * 4);
    g.setAttribute('color', new THREE.BufferAttribute(c, 4));
    return g;
  };
  const lathe = (pts: V2[], n: number) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y)), n);
  // light filling the bell, a quarter of the exit radius above the exit plane
  const yDisc = d.exitY + 0.25 * er;
  const rDisc = radiusAt(d.contour, d.x(yDisc)) * 0.985;
  const disc = rgba(lathe([[0.001, yDisc], [rDisc * 0.5, yDisc], [rDisc, yDisc]], 48), [0.1, 1.0, 0.3], (r) => 0.9 - 0.45 * (r / rDisc));
  // the flame below the exit: out to about 1.05 exit radii, closed 0.6 exit radii below
  const flame = (scaleR: number, len: number, n: number): V2[] => {
    const out: V2[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      out.push([er * scaleR * (0.96 + 0.25 * Math.sin(Math.PI * Math.min(1, t * 1.35)) * (1 - t)) * Math.sqrt(1 - t * t * t), d.exitY + 0.01 - len * er * t]);
    }
    return out;
  };
  const along = (y: number, len: number) => Math.min(1, Math.max(0, (d.exitY - y) / (len * er)));
  const outer = rgba(lathe(flame(1, 0.6, 14), 48), [0.06, 0.95, 0.2], (_r, y) => 0.8 * (1 - along(y, 0.6)) ** 1.4);
  const inner = rgba(lathe(flame(0.62, 0.42, 10), 32), [0.45, 1.0, 0.55], (_r, y) => 0.75 * (1 - along(y, 0.42)) ** 1.2);
  // (mergeGeometries directly: the kit's merge() keeps only position, normal and uv)
  const flashGeo = mergeGeometries([disc, outer, inner], false)!;
  for (const g of [disc, outer, inner]) g.dispose();
  const flashMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  // soft silhouettes: alpha falls off where a shell is seen edge-on
  flashMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFlashN;\nvarying vec3 vFlashV;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvFlashN = normalMatrix * normal;\nvFlashV = -mvPosition.xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFlashN;\nvarying vec3 vFlashV;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= pow(abs(dot(normalize(vFlashN), normalize(vFlashV))), 1.6);');
  };
  flashMat.customProgramCacheKey = () => 'engine-tea-teb-flash';
  const flash = new THREE.Mesh(flashGeo, flashMat);
  flash.renderOrder = 6;
  group.add(flash);
  // turbine exhaust mouth: fuel-rich gas (about 900 K) glows dull red-orange inside the lip
  const ex = routes(d).exhaust;
  const out = ex[ex.length - 1];
  const mouthPts: V2[] = [
    [0.001, out.y + 0.05],
    [TP.exhaustR - 0.006, out.y - 0.005],
    [TP.exhaustR + 0.004, out.y - 0.04],
  ];
  const mouthGeo = colored(revolve([{ pts: mouthPts, open: true }], 0, Math.PI * 2, 24, { centre: new THREE.Vector3(out.x, 0, out.z) }).surf!, (y) => {
    const t = Math.min(1, Math.max(0, (out.y + 0.05 - y) / 0.09));
    return [0.85 * (1 - 0.6 * t), 0.26 * (1 - 0.7 * t), 0.06 * (1 - t)];
  });
  const mouthMat = mat();
  const mouth = new THREE.Mesh(mouthGeo, mouthMat);
  group.add(mouth);
  for (const m of [wall, core, ggGlow, flash, mouth]) m.visible = false;

  // TEA-TEB green, scaled up against the warm vertex tint of the gas glow (red > green > blue)
  const green = new THREE.Color(0.15, 2.2, 1.6);
  const white = new THREE.Color(1, 1, 1);
  return {
    group,
    update(o: EngineOperating, cut: number) {
      const open = smooth(0.02, 0.35, cut);
      const burn = Math.max(0, Math.min(1, o.flow));
      const ig = Math.max(0, Math.min(1, o.ignite));
      const a = Math.max(burn, ig) * open;
      const g = ig / (ig + burn + 1e-6);
      wallMat.color.copy(white).lerp(green, g);
      coreMat.color.copy(wallMat.color);
      wallMat.opacity = coreMat.opacity = a;
      wall.visible = core.visible = a > 0.005;
      ggMat.opacity = o.gg ? open : 0;
      ggGlow.visible = ggMat.opacity > 0.005;
      mouthMat.opacity = o.gg ? 0.9 : 0;
      mouth.visible = o.gg;
      flashMat.opacity = ig;
      flash.visible = ig > 0.005;
    },
    dispose() {
      for (const m of [wall, core, ggGlow, flash, mouth]) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    },
  };
}
