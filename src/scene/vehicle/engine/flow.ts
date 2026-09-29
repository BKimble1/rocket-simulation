/**
 * Flow overlay: animated dashes on tubes that follow the real routes, colour-coded and
 * labelled: LOX (tank inlet, LOX pump, main LOX valve, LOX dome, injector), RP-1 (fuel pump,
 * main fuel valve, coolant inlet manifold, up the cooling channels, injector fuel manifold,
 * injector), gas-generator gas (propellant taps, gas generator, turbine, exhaust duct) and the
 * hot combustion gas in the chamber and nozzle. Around external lines the dashes wrap the
 * pipe; inside the engine they are thin tubes that show through the section. Each route is
 * drawn twice: depth-tested and bright, and faintly on top (so hidden stretches stay legible).
 */
import * as THREE from 'three';
import { frame } from '../../frame';
import { radiusAt } from './contour';
import type { Design } from './design';
import { circleFrames, clippedTube, filletPath, merge, transportFrames, type Frame } from './geo';
import { TP, routes } from './layout';
import { DASH_PER_M, type MaterialSet } from './mats';
import { wallPt } from './tca';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export const FLOW_COLORS = { lox: '#8fc6ff', rp1: '#e0a24a', gg: '#ff7a3d', hot: '#ffd08a' } as const;
type Stream = keyof typeof FLOW_COLORS;
const LABELS: Record<Stream, string> = { lox: 'LOX', rp1: 'RP-1 fuel', gg: 'Gas-generator gas', hot: 'Combustion gas' };

interface Leg {
  pts: THREE.Vector3[];
  r: number;
  bend?: number;
  frames?: Frame[];
}

function label(text: string, color: string): THREE.Sprite | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  const W = 512;
  const H = 112;
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.font = '600 52px "Inter Variable", Inter, system-ui, sans-serif';
  const tw = Math.min(W - 120, g.measureText(text).width);
  const w = tw + 112;
  const x0 = (W - w) / 2;
  g.fillStyle = 'rgba(20,22,26,0.82)';
  g.beginPath();
  g.roundRect(x0, 10, w, H - 20, (H - 20) / 2);
  g.fill();
  g.fillStyle = color;
  g.beginPath();
  g.arc(x0 + 46, H / 2, 17, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#f4f5f7';
  g.textBaseline = 'middle';
  g.fillText(text, x0 + 80, H / 2 + 2, W - 120);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const m = new THREE.SpriteMaterial({ map: t, depthTest: false, depthWrite: false, transparent: true, toneMapped: false });
  const s = new THREE.Sprite(m);
  s.scale.set(0.34, 0.34 * (H / W), 1);
  s.renderOrder = 30;
  return s;
}

export function buildFlowOverlay(d: Design, mats: MaterialSet) {
  const group = new THREE.Group();
  group.name = 'flow-overlay';
  group.visible = false;
  const R = routes(d);
  const x = d.tpX;
  const vo = TP.volute;

  // ── route legs ──
  const scroll = (y: number): Frame[] => {
    const out: THREE.Vector3[] = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const a = Math.PI + 0.12 + (Math.PI * 2 - 0.12) * t;
      const Rr = vo.rin + vo.rho0 + (vo.rho1 - vo.rho0) * t;
      out.push(V(x + Rr * Math.sin(a), y, Rr * Math.cos(a)));
    }
    return frames(out, 0);
  };
  function frames(pts: THREE.Vector3[], bend: number): Frame[] {
    const path = bend > 0 ? filletPath(pts, bend, 0.04, 10) : { p: pts, t: pts.map((_p, i) => pts[Math.min(pts.length - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize()), len: pts.map(() => 0) };
    if (bend <= 0) for (let i = 1; i < path.p.length; i++) path.len[i] = path.len[i - 1] + path.p[i].distanceTo(path.p[i - 1]);
    return transportFrames(path);
  }
  const loxY = TP.loxVoluteY;
  const fuelY = TP.fuelVoluteY;
  const yb = d.domeBaseY;
  const legs: Record<Stream, Leg[]> = {
    lox: [
      { pts: [V(x, d.topY + 0.04, 0), V(x, -0.02, 0)], r: TP.loxDuctR + 0.006 },
      { pts: [V(x, -0.02, 0), V(x, -0.1, 0), V(x + 0.03, loxY, 0.02), V(x + 0.1, loxY, -0.02)], r: 0.012, bend: 0.03 },
      { pts: [], r: 0.012, frames: scroll(loxY) },
      { pts: R.loxDischarge, r: TP.loxLineR + 0.005, bend: 0.1 },
      { pts: [R.pts.movIn, R.pts.movOut], r: 0.076 },
      { pts: R.movToDome, r: TP.loxLineR + 0.005 },
      { pts: [R.pts.domePort, V(-0.1, R.pts.domePort.y, 0), V(0, yb + 0.04, 0), V(0, d.injY + 0.004, 0)], r: 0.014, bend: 0.06 },
      { pts: [V(-0.12, yb + 0.02, 0), V(-0.12, d.injY + 0.004, 0)], r: 0.008 },
      { pts: [V(0.12, yb + 0.02, 0), V(0.12, d.injY + 0.004, 0)], r: 0.008 },
    ],
    rp1: [
      { pts: R.fuelInlet, r: TP.fuelDuctR + 0.006, bend: 0.07 },
      { pts: [V(x, TP.fuelInletY, 0.07), V(x, TP.fuelInletY, 0.03), V(x + 0.02, -0.35, 0.02), V(x + 0.04, fuelY, 0.03), V(x + 0.1, fuelY, -0.02)], r: 0.011, bend: 0.02 },
      { pts: [], r: 0.012, frames: scroll(fuelY) },
      { pts: R.fuelDischarge, r: TP.fuelLineR + 0.005, bend: 0.09 },
      { pts: [R.pts.mfvIn, R.pts.mfvOut], r: 0.064 },
      { pts: R.fuelDown, r: TP.fuelLineR + 0.005, bend: 0.2 },
    ],
    gg: [
      { pts: R.loxTap, r: TP.tapR + 0.005, bend: 0.05 },
      { pts: R.fuelTap, r: TP.tapR + 0.005, bend: 0.05 },
      { pts: [V(x, TP.ggHeadY + 0.01, 0), V(x, TP.ggTop, 0), V(x + 0.03, -0.6, 0), V(x + 0.098, -0.57, 0), V(x + 0.098, -0.5, 0), V(x + 0.03, TP.collectorY, -0.06), R.pts.exhaustStart], r: 0.013, bend: 0.03 },
      { pts: R.exhaust, r: TP.exhaustR + 0.022, bend: 0.1 },
    ],
    hot: [],
  };
  // coolant: around the manifold (back half), then up the tube wall and the chamber channels
  const xm = d.manifoldX;
  const ym = d.y(xm);
  const mR = d.rOut(ym) + 0.03 - 0.006;
  legs.rp1.push({ pts: [], r: 0.034, frames: circleFrames(V(0, ym, 0), mR, (Math.PI * 3) / 2, Math.PI / 2, 64) });
  for (const side of [1, -1]) {
    const up: THREE.Vector3[] = [];
    const xs: number[] = [];
    for (let xx = xm; xx > d.contour.xInj + 0.01; xx -= 0.03) xs.push(xx);
    for (const xx of xs) {
      const off = xx > d.xChamberEnd ? d.tube / 2 : d.tw + d.hc / 2;
      const [r, y] = wallPt(d, xx, off);
      up.push(V(side * r, y, -0.0015));
    }
    const [rTop] = wallPt(d, d.contour.xInj + 0.01, d.tw + d.hc / 2);
    up.push(V(side * rTop, d.injY + 0.03, -0.0015), V(side * (d.rc + 0.04), -0.31, -0.0015), V(side * (d.rc - 0.02), -0.31, -0.0015), V(side * (d.rc - 0.03), d.injY + 0.004, -0.0015));
    legs.rp1.push({ pts: up, r: 0.0055, bend: 0.01 });
  }
  // hot gas streamlines in the section plane
  for (const f of [-0.6, 0, 0.6]) {
    const pts: THREE.Vector3[] = [];
    for (let xx = d.contour.xInj + 0.02; xx <= d.contour.xExit; xx += 0.025) pts.push(V(f * radiusAt(d.contour, xx), d.y(xx), 0));
    pts.push(V(f * radiusAt(d.contour, d.contour.xExit) * 1.02, d.exitY - 0.12, 0));
    legs.hot.push({ pts, r: f === 0 ? 0.016 : 0.011, bend: 0.02 });
  }

  // ── geometry and materials per stream ──
  const meshes: THREE.Mesh[] = [];
  const textures: THREE.Texture[] = [];
  const speeds: Record<Stream, number> = { lox: 0.55, rp1: 0.5, gg: 0.75, hot: 1.4 };
  for (const s of Object.keys(legs) as Stream[]) {
    const parts: THREE.BufferGeometry[] = [];
    let offset = 0;
    for (const leg of legs[s]) {
      const fr = leg.frames ?? frames(leg.pts, leg.bend ?? 0);
      if (fr.length < 2) continue;
      const base = fr[0].u;
      for (const f of fr) f.u = f.u - base + offset;
      offset = fr[fr.length - 1].u;
      const g = clippedTube(fr, { ro: leg.r, segs: leg.r > 0.03 ? 16 : 8 }).back.surf;
      if (g) parts.push(g);
    }
    if (!parts.length) continue;
    const geo = merge(parts);
    const bright = mats.flow(FLOW_COLORS[s], false);
    const ghost = mats.flow(FLOW_COLORS[s], true);
    const mB = new THREE.Mesh(geo, bright);
    const mG = new THREE.Mesh(geo, ghost);
    mB.renderOrder = 20;
    mG.renderOrder = 21;
    for (const m of [mB, mG]) {
      m.userData.flow = s;
      m.userData.speed = speeds[s];
      group.add(m);
      meshes.push(m);
    }
    // scroll the dashes on the stage clock (decorative motion only)
    const tex = [bright.map, ghost.map].filter((t): t is THREE.Texture => !!t);
    textures.push(...tex);
    mB.onBeforeRender = () => {
      const off = -((frame.decor * speeds[s] * speed * DASH_PER_M) % 1);
      for (const t of tex) t.offset.x = off;
    };
  }
  // labels
  const place: Record<Stream, THREE.Vector3> = {
    lox: V(-0.52, -0.07, 0.08),
    rp1: V(-0.66, -1.25, 0.06),
    gg: V(0.66, -1.08, -0.3),
    hot: V(0.0, d.exitY + 0.35, 0.12),
  };
  const sprites: THREE.Sprite[] = [];
  for (const s of Object.keys(place) as Stream[]) {
    const sp = label(LABELS[s], FLOW_COLORS[s]);
    if (!sp) continue;
    sp.position.copy(place[s]);
    sp.userData.flow = s;
    group.add(sp);
    sprites.push(sp);
  }
  let speed = 1;
  return {
    group,
    setSpeed(v: number) {
      speed = v;
    },
    dispose() {
      for (const m of meshes) m.geometry.dispose();
      for (const sp of sprites) {
        sp.material.map?.dispose();
        sp.material.dispose();
      }
      void textures;
    },
  };
}
