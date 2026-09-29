/**
 * The launch complex around the pad: the sound-suppression water tower and its main to the
 * mount, the LOX storage sphere, RP-1 tanks and high-pressure gas tubes with their lines to the
 * tower, four lightning-protection masts with catenary and guy wires, pad lighting masts, the
 * operations, pneumatics and gate buildings, the substation, the horizontal integration hangar
 * with the KIMBLE mark on its doors, the instrumentation bunker and the perimeter fence.
 */
import * as THREE from 'three';
import { Batch, Instances, bevelBox, box, cyl, pipe, rod, v3 } from './geom';
import { SM } from './mats';
import { hangarDoorTexture } from './textures';
import { withHaze } from './haze';
import { buildWires, catenary, type WireSet } from './wires';
import { groundY, type SiteMaps } from './map';
import {
  GRADE,
  WATER_TOWER,
  LOX_SPHERE,
  RP1_TANKS,
  GAS_TUBES,
  LIGHTNING_MASTS,
  LIGHT_POLES,
  BUILDINGS,
  BUNKER,
  HANGAR,
  FENCE,
  TOWER,
  MOUNT,
  trenchXZ,
} from './layout';

export interface Facilities {
  group: THREE.Group;
  wires: WireSet[];
  update(): void;
}

export function buildFacilities(maps: SiteMaps, detail: number): Facilities {
  const group = new THREE.Group();
  group.name = 'facilities';
  const B = new Batch();
  const G = GRADE;
  const wires: WireSet[] = [];

  // ───────────── sound-suppression water tower ─────────────
  {
    const { x, z, top, tankR } = WATER_TOWER;
    const cy = top - tankR;
    const tag = { part: 'sound-suppression' };
    const tank = new THREE.SphereGeometry(tankR, 64, 32);
    tank.translate(x, cy, z);
    B.add(tank, SM('white'), undefined, tag);
    // equator catwalk with rail, roof vent, finial
    const walk = new THREE.TorusGeometry(tankR + 0.55, 0.06, 6, 96);
    walk.rotateX(Math.PI / 2);
    walk.translate(x, cy + 1.1, z);
    B.add(walk, SM('galv'));
    const deck = new THREE.RingGeometry(tankR - 0.1, tankR + 0.7, 96, 1);
    deck.rotateX(-Math.PI / 2);
    deck.translate(x, cy, z);
    B.add(deck, SM('grating'), undefined, { cast: true, receive: true });
    B.at(cyl(0.5, 0.9, 16), SM('white'), x, top + 0.4, z, 0);
    B.at(cyl(0.15, 0.3, 8), SM('redLight'), x, top + 1.0, z, 0);
    // six legs from the grade to the tank equator, ring struts and X bracing
    const legs: THREE.Vector3[][] = [];
    const nLeg = 6;
    for (let i = 0; i < nLeg; i++) {
      const a = (i / nLeg) * Math.PI * 2;
      const b0 = v3(x + Math.cos(a) * 11.5, G, z + Math.sin(a) * 11.5);
      const b1 = v3(x + Math.cos(a) * (tankR - 0.2), cy, z + Math.sin(a) * (tankR - 0.2));
      legs.push([b0, b1]);
      B.add(rod(b0, b1, 0.42, 16), SM('towerSteel'), undefined, tag);
      B.at(bevelBox(2.2, 1.0, 2.2, 0.08), SM('concreteLight'), b0.x, G + 0.3, b0.z, a);
    }
    const rings = [0.18, 0.4, 0.62, 0.84];
    const at = (leg: THREE.Vector3[], t: number) => leg[0].clone().lerp(leg[1], t);
    for (const t of rings)
      for (let i = 0; i < nLeg; i++) B.add(rod(at(legs[i], t), at(legs[(i + 1) % nLeg], t), 0.16, 8), SM('towerSteel'));
    const tr = [0.02, ...rings];
    for (let k = 0; k < tr.length - 1; k++)
      for (let i = 0; i < nLeg; i++) {
        const j = (i + 1) % nLeg;
        B.add(rod(at(legs[i], tr[k]), at(legs[j], tr[k + 1]), 0.05, 6), SM('galv'));
        B.add(rod(at(legs[j], tr[k]), at(legs[i], tr[k + 1]), 0.05, 6), SM('galv'));
      }
    // central riser and a caged ladder
    B.add(rod(v3(x, G, z), v3(x, cy - tankR + 0.5, z), 0.9, 24), SM('towerSteel'), undefined, tag);
    B.add(rod(v3(x + 1.2, G, z), v3(x + 1.2, cy - tankR * 0.6, z), 0.05, 6), SM('galv'));
    B.add(rod(v3(x + 1.6, G, z), v3(x + 1.6, cy - tankR * 0.6, z), 0.05, 6), SM('galv'));
    // valve house at the foot
    B.at(bevelBox(6, 3.2, 5, 0.05), SM('concreteLight'), x + 5, G + 1.6, z + 4, 0.2, tag);
    // the main to the pad: along the grade, up the embankment, across the hardstand to the mount
    const r = 0.8;
    const y0 = G + r + 0.3;
    const main = [v3(x, y0, z), v3(x + 45, y0, z), v3(-64, y0, -64), v3(-49, 1.1, -49), v3(-30, 1.1, -30), v3(-22, 1.1, -14)];
    B.add(pipe(main, r, 3, 20), SM('towerSteel'), undefined, { ...tag, name: 'deluge-main' });
    for (let i = 0; i < main.length - 1; i++) {
      const a = main[i];
      const b = main[i + 1];
      const n = Math.floor(a.distanceTo(b) / 9);
      for (let k = 1; k < n; k++) {
        const p = a.clone().lerp(b, k / n);
        const base = p.y - r - 0.5;
        B.at(box(1.8, Math.max(0.3, base - G + 0.2), 0.8), SM('concreteLight'), p.x, (G + base) / 2, p.z, Math.atan2(b.x - a.x, b.z - a.z));
      }
    }
    // valve station on the hardstand and the two branches to the mount leg risers
    B.at(bevelBox(4.5, 2.2, 3.5, 0.06), SM('steelDark'), -22, 1.1, -14, 0.6, tag);
    const legRiser = (v: number) => {
      const p = trenchXZ(-MOUNT.legS - MOUNT.legSize / 2 - 0.35, v);
      return v3(p.x, 0.4, p.z);
    };
    const rA = legRiser(-MOUNT.legV);
    const rB = legRiser(MOUNT.legV);
    B.add(pipe([v3(-22, 0.7, -12), v3(-22, 0.7, -8), v3(rA.x - 3, 0.7, rA.z), v3(rA.x, 0.4, rA.z)], 0.3, 1.2, 12), SM('towerSteel'), undefined, tag);
    B.add(pipe([v3(-21, 0.7, -12), v3(-21, 0.7, 13), v3(rB.x - 4, 0.7, 13), v3(rB.x, 0.4, rB.z)], 0.3, 1.2, 12), SM('towerSteel'), undefined, tag);
  }

  // ───────────── LOX storage sphere, RP-1 tanks, gas tubes and their lines ─────────────
  {
    const { x, z, r } = LOX_SPHERE;
    const cy = G + 5.6 + r;
    const s = new THREE.SphereGeometry(r, 64, 32);
    s.translate(x, cy, z);
    B.add(s, SM('white'));
    // skirt and legs
    for (let i = 0; i < LOX_SPHERE.legs; i++) {
      const a = (i / LOX_SPHERE.legs) * Math.PI * 2;
      const top = v3(x + Math.cos(a) * r * 0.98, cy, z + Math.sin(a) * r * 0.98);
      const bot = v3(x + Math.cos(a) * r * 0.98, G, z + Math.sin(a) * r * 0.98);
      B.add(rod(bot, top, 0.32, 12), SM('white'));
      B.at(bevelBox(1.2, 0.6, 1.2, 0.05), SM('concreteLight'), bot.x, G + 0.2, bot.z, a);
      const a2 = ((i + 1) / LOX_SPHERE.legs) * Math.PI * 2;
      const bot2 = v3(x + Math.cos(a2) * r * 0.98, G + 0.4, z + Math.sin(a2) * r * 0.98);
      B.add(rod(v3(bot.x, cy - 1.5, bot.z), bot2, 0.06, 6), SM('galv'));
    }
    // top platform, stairway, vent stack (the boil-off vents here: SITE_ANCHORS.loxVents)
    B.at(cyl(2.4, 0.2, 24), SM('grating'), x, cy + r + 0.05, z, 0);
    B.add(rod(v3(x + 3.2, cy + r - 0.6, z - 3.2), v3(x + 3.2, cy + r + 4.8, z - 3.2), 0.22, 12), SM('stainless'));
    const stair: THREE.Vector3[] = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const a = -Math.PI / 2 + t * Math.PI * 1.1;
      const rr = r + 1.0;
      stair.push(v3(x + Math.cos(a) * rr, G + t * (cy + r - G), z + Math.sin(a) * rr));
    }
    B.add(pipe(stair, 0.35, 1, 6), SM('galv'));
    // vaporizer fins and the transfer pump skid beside it
    for (let i = 0; i < 6; i++) B.at(box(0.25, 4, 2.2), SM('aluminum'), x - 12 + i * 0.6, G + 2, z + 6, 0);
    B.at(bevelBox(5, 2, 3, 0.05), SM('steelDark'), x - 11.5, G + 1, z - 6, 0);
    // RP-1 tanks on saddles inside a containment wall
    const T = RP1_TANKS;
    for (let i = 0; i < T.count; i++) {
      const tz = T.z + (i - (T.count - 1) / 2) * T.spacing;
      const c = new THREE.CapsuleGeometry(T.r, T.length - 2 * T.r, 12, 32);
      c.rotateZ(Math.PI / 2);
      c.translate(T.x, G + T.r + 1.3, tz);
      B.add(c, SM('white'));
      for (const dx of [-T.length * 0.3, T.length * 0.3]) B.at(box(1.2, 1.6, T.r * 1.8), SM('concreteLight'), T.x + dx, G + 0.8, tz, 0);
      B.add(rod(v3(T.x - 2, G + 2 * T.r + 1.3, tz), v3(T.x - 2, G + 2 * T.r + 2.6, tz), 0.12, 8), SM('galv'));
    }
    const wallW = T.length + 8;
    const wallD = T.spacing * T.count + 6;
    for (const [dx, dz, w, d] of [
      [0, -wallD / 2, wallW, 0.4],
      [0, wallD / 2, wallW, 0.4],
      [-wallW / 2, 0, 0.4, wallD],
      [wallW / 2, 0, 0.4, wallD],
    ])
      B.at(box(w, 1.3, d), SM('concrete'), T.x + dx, G + 0.65, T.z + dz, 0);
    // high-pressure gas storage: a rack of horizontal tubes
    for (let i = 0; i < 8; i++) {
      const row = i % 4;
      const lay = Math.floor(i / 4);
      const c = new THREE.CapsuleGeometry(0.32, 11, 8, 20);
      c.rotateZ(Math.PI / 2);
      c.translate(GAS_TUBES.x, G + 1.0 + lay * 0.9, GAS_TUBES.z - 1.5 + row * 0.9);
      B.add(c, SM('graphite'));
    }
    for (const dx of [-4.5, 0, 4.5]) B.at(box(0.25, 2.3, 4.0), SM('towerSteel'), GAS_TUBES.x + dx, G + 1.15, GAS_TUBES.z, 0);
    // propellant lines to the tower: around the back of the mount (clear of the trench)
    const loxLine = [v3(x - r - 1, G + 1.3, z), v3(120, G + 1.3, z), v3(120, G + 1.3, 25), v3(63, G + 1.3, 25), v3(51, 1.3, 25), v3(-9.9, 1.3, 25), v3(-9.9, 1.3, -3.2), v3(-9.9, 0.3, -4.6)];
    B.add(pipe(loxLine, 0.3, 2.0, 14), SM('aluminum'), undefined, { part: 'service-tower', name: 'lox-line' });
    const rpLine = [v3(T.x - wallW / 2 - 1, G + 1.0, T.z), v3(105, G + 1.0, T.z), v3(105, G + 1.0, 30), v3(63, G + 1.0, 30), v3(51, 1.0, 30), v3(-9.2 + 0.0, 1.0, 30), v3(-9.2, 1.0, -3.0), v3(-9.2, 0.3, -4.4)];
    B.add(pipe(rpLine, 0.2, 1.6, 12), SM('steelDark'), undefined, { part: 'service-tower' });
    for (const line of [loxLine, rpLine])
      for (let i = 0; i < line.length - 1; i++) {
        const a = line[i];
        const b = line[i + 1];
        const n = Math.floor(a.distanceTo(b) / 7);
        for (let k = 1; k < n; k++) {
          const p = a.clone().lerp(b, k / n);
          const gy = p.y > -0.5 ? 0 : G;
          const hgt = p.y - 0.35 - gy;
          if (hgt > 0.15) B.at(box(0.5, hgt, 0.5), SM('concreteLight'), p.x, gy + hgt / 2, p.z, 0);
        }
      }
  }

  // ───────────── lightning protection: masts, catenaries, guy wires ─────────────
  {
    const tops: THREE.Vector3[] = [];
    for (const m of LIGHTNING_MASTS) {
      const steelH = m.h - 18;
      const pole = new THREE.CylinderGeometry(0.34, 1.05, steelH, 24);
      pole.translate(m.x, G + steelH / 2, m.z);
      B.add(pole, SM('galv'));
      const frp = new THREE.CylinderGeometry(0.12, 0.3, 18, 16);
      frp.translate(m.x, G + steelH + 9, m.z);
      B.add(frp, SM('frp'));
      B.at(bevelBox(3.2, 1.0, 3.2, 0.1), SM('concreteLight'), m.x, G + 0.3, m.z, 0);
      B.add(rod(v3(m.x, G + m.h, m.z), v3(m.x, G + m.h + 2, m.z), 0.03, 6), SM('copper'));
      B.at(cyl(0.12, 0.2, 10), SM('redLight'), m.x, G + steelH + 0.3, m.z, 0);
      tops.push(v3(m.x, G + m.h - 0.5, m.z));
    }
    const lines: THREE.Vector3[][] = [];
    for (let i = 0; i < tops.length; i++) lines.push(catenary(tops[i], tops[(i + 1) % tops.length], 9, 32));
    lines.push(catenary(tops[0], tops[2], 16, 48), catenary(tops[1], tops[3], 16, 48));
    // guy wires to ground anchors outward
    for (const t of tops) {
      const out = v3(t.x, 0, t.z).normalize();
      const side = v3(-out.z, 0, out.x);
      for (const s of [-0.45, 0.45]) {
        const anchor = v3(t.x, G + 0.3, t.z).addScaledVector(out, 70).addScaledVector(side, s * 70);
        lines.push(catenary(v3(t.x, G + (t.y - G) * 0.72, t.z), anchor, 1.5, 12));
        B.at(bevelBox(1.4, 0.6, 1.4, 0.1), SM('concreteLight'), anchor.x, G + 0.1, anchor.z, 0);
      }
    }
    // the tower's own mast tied into the network
    const tMast = v3(TOWER.x, TOWER.mastTop - 1.5, TOWER.z);
    lines.push(catenary(tMast, tops[2], 12, 32), catenary(tMast, tops[3], 12, 32));
    const w = buildWires(lines, 0.03, '#8e9398');
    group.add(w.mesh);
    wires.push(w);
  }

  // ───────────── pad lighting masts ─────────────
  for (const [x, z] of LIGHT_POLES) {
    const hgt = 34;
    const p = new THREE.CylinderGeometry(0.16, 0.38, hgt, 16);
    p.translate(x, G + hgt / 2, z);
    B.add(p, SM('galv'));
    B.at(bevelBox(1.8, 0.8, 1.8, 0.08), SM('concreteLight'), x, G + 0.2, z, 0);
    const face = Math.atan2(-x, -z);
    const head = new THREE.Group();
    const HB = new Batch();
    HB.at(box(4.2, 0.12, 1.2), SM('galv'), 0, 0, 0, 0);
    for (let i = 0; i < 6; i++) {
      const lx = -1.75 + (i % 3) * 1.75;
      const ly = i < 3 ? 0.45 : 1.25;
      HB.at(bevelBox(0.9, 0.7, 0.35, 0.05), SM('steelDark'), lx, ly, 0.2, 0);
      HB.at(box(0.72, 0.52, 0.02), SM('lamp'), lx, ly, 0.38, 0);
    }
    HB.build(head, 'light-head');
    head.position.set(x, G + hgt, z);
    head.rotation.y = face;
    head.rotateX(-0.25);
    group.add(head);
  }

  // ───────────── buildings ─────────────
  const building = (x: number, z: number, w: number, d: number, hgt: number, rot: number, wall: 'concreteLight' | 'claddingGrey' | 'cladding', windows: boolean) => {
    const gy = groundY(maps, x, z);
    B.at(bevelBox(w, hgt, d, 0.08), SM(wall), x, gy + hgt / 2, z, rot);
    B.at(bevelBox(w + 0.3, 0.5, d + 0.3, 0.05), SM('concreteLight'), x, gy + hgt + 0.1, z, rot);
    B.at(box(w + 1.2, 0.3, d + 1.2), SM('concrete'), x, gy + 0.05, z, rot);
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const local = (lx: number, ly: number, lz: number) => v3(x + lx * c + lz * s, gy + ly, z - lx * s + lz * c);
    if (windows)
      for (const side of [-1, 1]) {
        const p = local(0, hgt * 0.62, side * (d / 2 + 0.03));
        B.at(box(w * 0.86, hgt * 0.22, 0.06), SM('glass'), p.x, p.y, p.z, rot);
      }
    // rooftop units
    const r1 = local(w * 0.2, hgt + 0.9, 0);
    B.at(bevelBox(3, 1.4, 2.2, 0.05), SM('claddingGrey'), r1.x, r1.y, r1.z, rot);
    const r2 = local(-w * 0.25, hgt + 0.6, d * 0.15);
    B.at(bevelBox(2, 0.9, 2, 0.05), SM('galv'), r2.x, r2.y, r2.z, rot);
    // doors
    const dp = local(-w * 0.3, 1.2, d / 2 + 0.04);
    B.at(box(1.2, 2.4, 0.06), SM('steelDark'), dp.x, dp.y, dp.z, rot);
    return gy;
  };
  const bo = BUILDINGS;
  building(bo.padOps.x, bo.padOps.z, bo.padOps.w, bo.padOps.d, bo.padOps.h, 0, 'concreteLight', true);
  building(bo.pneumatics.x, bo.pneumatics.z, bo.pneumatics.w, bo.pneumatics.d, bo.pneumatics.h, 0, 'claddingGrey', false);
  {
    const gy = groundY(maps, bo.pneumatics.x, bo.pneumatics.z);
    B.at(box(4, 3.6, 0.1), SM('steelDark'), bo.pneumatics.x + 3, gy + 1.8, bo.pneumatics.z + bo.pneumatics.d / 2 + 0.06, 0);
    for (let i = 0; i < 6; i++) B.at(cyl(0.22, 1.6, 12), SM('graphite'), bo.pneumatics.x - 6 + i * 0.5, gy + 0.8, bo.pneumatics.z - bo.pneumatics.d / 2 - 0.6, 0);
  }
  // substation yard: transformers with radiators, a fenced pad, a line to the pad
  {
    const { x, z, w, d } = bo.substation;
    const gy = groundY(maps, x, z);
    B.at(box(w, 0.25, d), SM('concrete'), x, gy + 0.12, z, 0);
    for (let i = 0; i < 3; i++) {
      const tx = x - w / 2 + 5 + i * 8;
      B.at(bevelBox(3.2, 3.4, 2.4, 0.05), SM('claddingGrey'), tx, gy + 1.95, z, 0);
      for (let k = 0; k < 7; k++) B.at(box(0.08, 2.4, 1.0), SM('galv'), tx - 1.5 + k * 0.5, gy + 1.7, z + 1.8, 0);
      B.add(rod(v3(tx, gy + 3.6, z - 0.6), v3(tx, gy + 5, z - 0.6), 0.1, 8), SM('whiteMatte'));
    }
    const poles: THREE.Vector3[] = [];
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      const px = x + 14 + (-60 - x - 14) * t;
      const pz = z - 10 + (40 - z + 10) * t;
      const py = groundY(maps, px, pz);
      B.add(rod(v3(px, py, pz), v3(px, py + 12, pz), 0.14, 10), SM('soil'));
      B.at(box(2.2, 0.15, 0.15), SM('steelDark'), px, py + 11.5, pz, Math.atan2(40 - z, -60 - x));
      poles.push(v3(px, py + 11.6, pz));
    }
    const lines: THREE.Vector3[][] = [];
    for (let i = 0; i < poles.length - 1; i++) for (const o of [-0.9, 0, 0.9]) lines.push(catenary(poles[i].clone().add(v3(o * 0.7, 0, o * 0.7)), poles[i + 1].clone().add(v3(o * 0.7, 0, o * 0.7)), 0.8, 10));
    const w2 = buildWires(lines, 0.025, '#3a3c40');
    group.add(w2.mesh);
    wires.push(w2);
  }
  // gate house with a canopy over the road
  {
    const { x, z } = bo.gate;
    const gy = groundY(maps, x, z);
    B.at(bevelBox(3, 3, 3, 0.05), SM('concreteLight'), x, gy + 1.5, z - 9, 0);
    B.at(box(3.1, 1.0, 0.05), SM('glass'), x, gy + 2, z - 7.5, 0);
    B.at(box(12, 0.5, 18), SM('white'), x, gy + 6, z, 0);
    for (const [dx, dz] of [
      [-5, -8],
      [5, -8],
      [-5, 8],
      [5, 8],
    ])
      B.add(rod(v3(x + dx, gy, z + dz), v3(x + dx, gy + 6, z + dz), 0.18, 10), SM('galv'));
    B.add(rod(v3(x + 1.5, gy + 1.0, z - 4.2), v3(x + 1.5, gy + 1.0, z + 4.2), 0.06, 8), SM('yellow'));
  }

  // ───────────── horizontal integration hangar ─────────────
  {
    const { x, z, w, d, h, doorW, doorH } = HANGAR;
    const gy = groundY(maps, x, z);
    const zN = z - d / 2;
    // shell: walls (cladding) and a low-pitch roof with a graphite fascia and one violet pinstripe
    B.at(box(w, h, d), SM('cladding'), x, gy + h / 2, z, 0, { part: 'launch-mount' });
    B.at(box(w + 0.6, 0.9, d + 0.6), SM('graphite'), x, gy + h + 0.45, z, 0);
    B.at(box(w + 0.64, 0.14, d + 0.64), SM('accent'), x, gy + h - 0.25, z, 0);
    const roof = new THREE.BufferGeometry();
    const rh = 2.4;
    const pts = [
      [-w / 2, 0, -d / 2],
      [w / 2, 0, -d / 2],
      [w / 2, rh, 0],
      [-w / 2, rh, 0],
      [-w / 2, 0, d / 2],
      [w / 2, 0, d / 2],
    ];
    roof.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
    roof.setIndex([0, 3, 2, 0, 2, 1, 4, 5, 2, 4, 2, 3]);
    roof.translate(x, gy + h + 0.9, z);
    B.add(roof, SM('claddingGrey'));
    for (const s of [-1, 1]) {
      const gable = new THREE.BufferGeometry();
      gable.setAttribute('position', new THREE.Float32BufferAttribute([s * w / 2, 0, -d / 2, s * w / 2, 0, d / 2, s * w / 2, rh, 0], 3));
      gable.setIndex(s > 0 ? [0, 2, 1] : [0, 1, 2]);
      gable.translate(x, gy + h + 0.9, z);
      B.add(gable, SM('claddingGrey'));
    }
    // the door leaves on the north face (toward the pad), with the mark
    const doorTex = hangarDoorTexture(doorW, doorH);
    const doorMat = withHaze(new THREE.MeshStandardMaterial({ map: doorTex, roughness: 0.5, metalness: 0 }), 'site-haze');
    doorMat.name = 'site.hangarDoor';
    const dg = new THREE.PlaneGeometry(doorW, doorH);
    dg.rotateY(Math.PI);
    const door = new THREE.Mesh(dg, doorMat);
    door.position.set(x, gy + doorH / 2 + 0.2, zN - 0.12);
    door.castShadow = false;
    door.receiveShadow = true;
    door.name = 'hangar-door';
    group.add(door);
    // door header, jambs and the track
    B.at(box(doorW + 3, 2.2, 1.2), SM('graphite'), x, gy + doorH + 1.3, zN - 0.5, 0);
    for (const s of [-1, 1]) B.at(box(1.5, doorH + 0.4, 1.2), SM('graphite'), x + s * (doorW / 2 + 0.75), gy + (doorH + 0.4) / 2, zN - 0.5, 0);
    B.at(box(doorW + 30, 0.08, 0.6), SM('galv'), x, gy + 0.04, zN - 0.5, 0);
    // office annex on the west side with window bands
    const ax = x - w / 2 - 11;
    B.at(bevelBox(22, 13, d * 0.8, 0.08), SM('claddingGrey'), ax, gy + 6.5, z + d * 0.1, 0);
    for (const yy of [2.2, 6.2, 10.2]) {
      B.at(box(22.1, 1.3, 0.1), SM('glass'), ax, gy + yy, z + d * 0.1 - d * 0.4 - 0.02, 0);
      B.at(box(0.1, 1.3, d * 0.8 - 2), SM('glass'), ax - 11.02, gy + yy, z + d * 0.1, 0);
    }
    // personnel doors, louvres, rooftop ventilators
    for (let i = 0; i < 5; i++) B.at(cyl(0.9, 1.4, 16), SM('galv'), x - w / 2 + 12 + i * 22, gy + h + 3.4, z + 8, 0);
    for (const s of [-1, 1]) B.at(box(1.2, 2.4, 0.08), SM('steelDark'), x + s * (doorW / 2 + 8), gy + 1.2, zN - 0.05, 0);
    // transporter apron in front of the doors
    B.at(box(doorW + 10, 0.25, 55), SM('concreteRoad'), x, gy + 0.08, zN - 27.5, 0, { cast: false, receive: true });
  }

  // ───────────── instrumentation bunker (blockhouse) ─────────────
  {
    const { x, z, r, h } = BUNKER;
    const gy = groundY(maps, x, z);
    const dome = new THREE.SphereGeometry(r, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    dome.scale(1, h / r, 1);
    dome.translate(x, gy - 0.2, z);
    B.add(dome, SM('concrete'));
    B.at(bevelBox(5, 3.2, 8, 0.1), SM('concrete'), x - r - 1.5, gy + 1.5, z + 2, 0);
    B.at(box(2, 2.4, 0.08), SM('steelDark'), x - r - 4.05, gy + 1.2, z + 2, Math.PI / 2);
    for (let i = 0; i < 3; i++) {
      const a = -0.6 + i * 0.4;
      B.add(rod(v3(x + Math.cos(a) * r * 0.45, gy + h * 0.85, z - Math.sin(a) * r * 0.45), v3(x + Math.cos(a) * r * 0.45, gy + h + 0.9, z - Math.sin(a) * r * 0.45), 0.25, 12), SM('steelDark'));
    }
    B.add(rod(v3(x + 4, gy + h * 0.6, z + 6), v3(x + 4, gy + h + 12, z + 6), 0.08, 8), SM('galv'));
    B.at(cyl(0.6, 0.12, 16), SM('whiteMatte'), x + 4, gy + h + 12, z + 6, 0);
  }

  // ───────────── perimeter fence ─────────────
  {
    const posts = new Instances(new THREE.CylinderGeometry(0.045, 0.045, 1, 6, 1), SM('galv'));
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    let vi = 0;
    const H = 2.4;
    const gateZ0 = BUILDINGS.gate.z - 9;
    const gateZ1 = BUILDINGS.gate.z + 9;
    for (let i = 0; i < FENCE.length; i++) {
      const [ax, az] = FENCE[i];
      const [bx, bz] = FENCE[(i + 1) % FENCE.length];
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.round(len / 3));
      let prev: THREE.Vector3 | null = null;
      let along = 0;
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const px = ax + (bx - ax) * t;
        const pz = az + (bz - az) * t;
        const inGate = Math.abs(px - BUILDINGS.gate.x) < 3 && pz > gateZ0 && pz < gateZ1;
        const py = groundY(maps, px, pz);
        const p = v3(px, py, pz);
        if (!inGate) posts.member(v3(px, py - 0.3, pz), v3(px, py + H + 0.1, pz), 1, 1);
        if (prev && !inGate) {
          const seg = prev.distanceTo(p);
          pos.push(prev.x, prev.y + 0.05, prev.z, p.x, p.y + 0.05, p.z, p.x, p.y + H, p.z, prev.x, prev.y + H, prev.z);
          uv.push(along / 0.6, 0.05 / 0.6, (along + seg) / 0.6, 0.05 / 0.6, (along + seg) / 0.6, H / 0.6, along / 0.6, H / 0.6);
          idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
          vi += 4;
          along += seg;
        }
        prev = inGate ? null : p;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const fence = new THREE.Mesh(g, SM('chainLink'));
    fence.name = 'fence-mesh';
    fence.receiveShadow = true;
    group.add(fence);
    posts.build(group, 'fence-posts', { cast: false, receive: true });
  }

  B.build(group, 'facilities');
  void detail;
  return {
    group,
    wires,
    update() {
      for (const w of wires) w.update();
    },
  };
}
