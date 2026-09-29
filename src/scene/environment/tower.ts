/**
 * The service tower (PAD.tower): a painted steel lattice (instanced I-beam columns and girders,
 * X-braced bays with gusset plates), grating platforms every 6 m with toe plates and yellow
 * handrails, switchback stairs, an elevator shaft with its car, cable trays and the propellant
 * lines running up to the umbilical level, a roof deck with a jib crane, obstruction lights and
 * a fibreglass lightning mast. Three swing arms pivot on vertical hinges at the east face:
 * the upper-stage umbilical arm, the payload fairing conditioning arm (satellite
 * configuration) and the crew access arm with its white room at the capsule hatch (capsule
 * configuration); siteState.arms 0..1 swings them ~70 deg clear.
 */
import * as THREE from 'three';
import { PAD } from '../../world/site';
import { CAPSULE, SERVICE_MODULE, STATIONS } from '../../vehicle/spec';
import { Batch, Instances, bevelBox, box, cyl, iBeamUnit, pipe, rod, v3 } from './geom';
import { SM } from './mats';
import { TOWER } from './layout';
import { siteState } from './state';

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export interface Tower {
  group: THREE.Group;
  update(): void;
}

const LEVEL = TOWER.level;

export function buildTower(detail: number): Tower {
  const group = new THREE.Group();
  group.name = 'service-tower';
  group.position.set(TOWER.x, 0, TOWER.z);
  const H = TOWER.height;
  const h = TOWER.half;
  const nLevels = Math.floor(H / LEVEL);
  const levels = Array.from({ length: nLevels }, (_, i) => (i + 1) * LEVEL);

  const ibeam = new Instances(iBeamUnit(0.13, 0.09), SM('towerSteel'));
  const tube = new Instances(new THREE.BoxGeometry(1, 1, 1), SM('towerSteel'));
  // gusset plates share the bracing's unit box and paint (one instanced mesh)
  const plate = tube;
  const railRod = new Instances(new THREE.CylinderGeometry(1, 1, 1, 8, 1), SM('yellow'));
  const galvBar = new Instances(new THREE.BoxGeometry(1, 1, 1), SM('galv'));
  const B = new Batch({ cast: true, receive: true, part: 'service-tower' });
  const tag = { part: 'service-tower' };

  // corners: (x, z) in tower-local metres; the east face (+x) faces the vehicle
  const C = [v3(-h, 0, -h), v3(h, 0, -h), v3(h, 0, h), v3(-h, 0, h)];
  const out = [v3(-1, 0, -1), v3(1, 0, -1), v3(1, 0, 1), v3(-1, 0, 1)];

  // foundation
  B.at(bevelBox(2 * h + 3, 0.8, 2 * h + 3, 0.1), SM('concreteLight'), 0, 0.4 - 0.25, 0, 0, tag);
  // columns (built-up I sections, flanges facing out)
  for (let i = 0; i < 4; i++) {
    const c = C[i];
    ibeam.member(v3(c.x, 0.15, c.z), v3(c.x, H, c.z), 0.62, 0.62, out[i]);
    B.at(box(1.1, 0.06, 1.1), SM('steelDark'), c.x, 0.18, c.z, 0);
  }
  // girders at every level and the roof
  const faceLevels = [...levels, H];
  for (const y of faceLevels) {
    for (let i = 0; i < 4; i++) {
      const a = C[i];
      const b = C[(i + 1) % 4];
      ibeam.member(v3(a.x, y - 0.3, a.z), v3(b.x, y - 0.3, b.z), 0.3, 0.55, v3(0, 1, 0));
    }
    // floor beams across (x direction) at z = 0 and z = +-h/2
    for (const z of [-h / 2, 0, h / 2]) ibeam.member(v3(-h, y - 0.25, z), v3(h, y - 0.25, z), 0.2, 0.4, v3(0, 1, 0));
  }
  // X bracing on the four faces in each bay, with gussets at the crossings and ends
  const bays = [0, ...levels];
  for (let k = 0; k < bays.length; k++) {
    const y0 = bays[k] + 0.2;
    const y1 = (bays[k + 1] ?? H) - 0.55;
    if (y1 - y0 < 1) continue;
    for (let i = 0; i < 4; i++) {
      const a = C[i];
      const b = C[(i + 1) % 4];
      const n = out[i].clone().add(out[(i + 1) % 4]).normalize();
      // the east face keeps its lower bays braced but the arm levels open
      const east = Math.abs(a.x - h) < 1e-3 && Math.abs(b.x - h) < 1e-3;
      if (east && (Math.abs(bays[k] - 54) < 1 || Math.abs(bays[k] - 60) < 1)) continue;
      const inset = 0.32;
      const pa0 = v3(a.x, y0, a.z).addScaledVector(n, -0.05).lerp(v3(b.x, y0, b.z), 0.04);
      const pb1 = v3(b.x, y1, b.z).addScaledVector(n, -0.05).lerp(v3(a.x, y1, a.z), 0.04);
      const pb0 = v3(b.x, y0, b.z).addScaledVector(n, -0.05).lerp(v3(a.x, y0, a.z), 0.04);
      const pa1 = v3(a.x, y1, a.z).addScaledVector(n, -0.05).lerp(v3(b.x, y1, b.z), 0.04);
      tube.member(pa0, pb1, 0.2, 0.2, n);
      tube.member(pb0, pa1, 0.2, 0.2, n);
      const mid = pa0.clone().add(pb1).multiplyScalar(0.5).addScaledVector(n, 0.02);
      const g = new THREE.Matrix4().lookAt(v3(0, 0, 0), n, v3(0, 1, 0)).setPosition(mid);
      plate.push(g.multiply(new THREE.Matrix4().makeScale(0.7, 0.7, 0.03)));
      for (const p of [pa0, pb0, pa1, pb1]) {
        const gm = new THREE.Matrix4().lookAt(v3(0, 0, 0), n, v3(0, 1, 0)).setPosition(p.clone().addScaledVector(n, 0.02));
        plate.push(gm.multiply(new THREE.Matrix4().makeScale(0.55, 0.55, 0.025)));
      }
      void inset;
    }
  }

  // platforms: grating over the footprint (minus the stair well), toe plates, handrails
  const stairX0 = -h + 0.2;
  const stairX1 = -0.2;
  const stairZ0 = -h + 0.3;
  const stairZ1 = -h + 2.9;
  for (const y of [...levels, H]) {
    const top = y + 0.02;
    const well = y < H;
    const grat = (x0: number, x1: number, z0: number, z1: number) => {
      const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
      g.rotateX(-Math.PI / 2);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * (x1 - x0)) / 0.5, (uv.getY(i) * (z1 - z0)) / 0.5);
      g.translate((x0 + x1) / 2, top, (z0 + z1) / 2);
      B.add(g, SM('grating'), undefined, { cast: true, receive: true, ...tag });
    };
    if (well) {
      grat(-h, h, stairZ1, h);
      grat(stairX1, h, -h, stairZ1);
    } else grat(-h, h, -h, h);
    // toe plates and rails on the north, west and south faces (the east face opens to the arms)
    for (let i = 0; i < 4; i++) {
      const a = C[i];
      const b = C[(i + 1) % 4];
      const east = Math.abs(a.x - h) < 1e-3 && Math.abs(b.x - h) < 1e-3;
      const n = out[i].clone().add(out[(i + 1) % 4]).normalize();
      const a2 = v3(a.x, 0, a.z).addScaledVector(n, 0.12);
      const b2 = v3(b.x, 0, b.z).addScaledVector(n, 0.12);
      galvBar.member(v3(a2.x, top + 0.07, a2.z), v3(b2.x, top + 0.07, b2.z), 0.01, 0.14, n);
      if (east && y !== H) continue;
      railRod.member(v3(a2.x, top + 1.1, a2.z), v3(b2.x, top + 1.1, b2.z), 0.024, 0.024);
      railRod.member(v3(a2.x, top + 0.55, a2.z), v3(b2.x, top + 0.55, b2.z), 0.02, 0.02);
      const len = a2.distanceTo(b2);
      const np = Math.round(len / 2);
      for (let k = 0; k <= np; k++) {
        const p = a2.clone().lerp(b2, k / np);
        railRod.member(v3(p.x, top, p.z), v3(p.x, top + 1.1, p.z), 0.024, 0.024);
      }
    }
  }

  // switchback stairs in the north-west well: two flights per level
  if (detail > 0.3) {
    const treadGeo = new Instances(new THREE.BoxGeometry(1, 1, 1), SM('grating'));
    for (let k = 0; k < levels.length; k++) {
      const yb = k === 0 ? 0.15 : levels[k - 1] + 0.02;
      const yt = levels[k] + 0.02;
      const ym = (yb + yt) / 2;
      const zA = stairZ0 + 0.55;
      const zB = stairZ1 - 0.55;
      // flight 1 runs east at zA from x0 to x1 rising yb->ym; flight 2 back west at zB
      const flights: [number, number, number, number, number][] = [
        [stairX0 + 0.9, stairX1 - 0.9, zA, yb, ym],
        [stairX1 - 0.9, stairX0 + 0.9, zB, ym, yt],
      ];
      for (const [x0, x1, z, y0, y1] of flights) {
        const n = Math.round((y1 - y0) / 0.19);
        for (let s = 0; s < n; s++) {
          const t = (s + 0.5) / n;
          const m = new THREE.Matrix4().makeScale(Math.abs(x1 - x0) / n + 0.02, 0.04, 1.0).setPosition(x0 + (x1 - x0) * t, y0 + (y1 - y0) * ((s + 1) / n), z);
          treadGeo.push(m);
        }
        for (const dz of [-0.52, 0.52]) {
          tube.member(v3(x0, y0 - 0.1, z + dz), v3(x1, y1 - 0.1, z + dz), 0.06, 0.25, v3(0, 0, 1));
          railRod.member(v3(x0, y0 + 0.95, z + dz), v3(x1, y1 + 0.95, z + dz), 0.022, 0.022);
        }
      }
      // mid landings at both ends
      for (const x of [stairX0 + 0.45, stairX1 - 0.45]) {
        const m = new THREE.Matrix4().makeScale(0.9, 0.05, stairZ1 - stairZ0).setPosition(x, ym, (stairZ0 + stairZ1) / 2);
        treadGeo.push(m);
      }
    }
    treadGeo.build(group, 'tower-stairs', { cast: true, receive: true, ...tag });
  }

  // elevator shaft on the south face: open frame with guide rails, a door at each level, the car
  {
    const ex0 = -1.6;
    const ex1 = 1.6;
    const ez0 = h + 0.1;
    const ez1 = h + 3.0;
    for (const [x, z] of [
      [ex0, ez1],
      [ex1, ez1],
    ])
      tube.member(v3(x, 0.15, z), v3(x, H + 3.2, z), 0.26, 0.26);
    for (const y of [...levels, H]) {
      tube.member(v3(ex0, y - 0.3, ez1), v3(ex1, y - 0.3, ez1), 0.2, 0.35);
      tube.member(v3(ex0, y - 0.3, ez0), v3(ex0, y - 0.3, ez1), 0.2, 0.35);
      tube.member(v3(ex1, y - 0.3, ez0), v3(ex1, y - 0.3, ez1), 0.2, 0.35);
      // landing door frame on the tower side
      B.at(box(1.4, 2.3, 0.08), SM('claddingGrey'), 0, y + 1.2, ez0 + 0.05, 0);
    }
    for (let k = 0; k < bays.length - 1; k++) {
      const y0 = bays[k] + 0.3;
      const y1 = bays[k + 1] - 0.6;
      tube.member(v3(ex0, y0, ez1), v3(ex1, y1, ez1), 0.12, 0.12);
    }
    // guide rails
    for (const x of [-0.9, 0.9]) galvBar.member(v3(x, 0.2, ez1 - 0.25), v3(x, H + 1, ez1 - 0.25), 0.12, 0.08);
    // the car, parked at the crew level
    const carY = 66;
    B.at(bevelBox(2.4, 2.6, 2.2, 0.04), SM('claddingGrey'), 0, carY + 1.3, (ez0 + ez1) / 2 + 0.15, 0, tag);
    B.at(box(1.2, 1.9, 0.02), SM('steelDark'), 0, carY + 1.2, ez1 - 0.35, 0);
    // machine room on the roof
    B.at(bevelBox(3.4, 2.6, 3.2, 0.05), SM('claddingGrey'), 0, H + 1.3 + 0.0, (ez0 + ez1) / 2, 0, tag);
  }

  // roof: lightning mast (fibreglass) with its air terminal, jib crane, obstruction lights, antennas
  {
    const mastH = TOWER.mastTop - H - 1.5;
    const mast = new THREE.CylinderGeometry(0.16, 0.42, mastH, 16);
    mast.translate(0, H + mastH / 2, 0);
    B.add(mast, SM('frp'), undefined, tag);
    B.add(cyl(0.6, 0.8, 16), SM('steelDark'), new THREE.Matrix4().setPosition(0, H + 0.4, 0));
    B.add(rod(v3(0, H + mastH, 0), v3(0, TOWER.mastTop, 0), 0.04, 8), SM('galv'));
    for (const a of [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3]) {
      const base = v3(Math.cos(a) * 3.2, H + 0.1, Math.sin(a) * 3.2);
      B.add(rod(base, v3(0, H + mastH * 0.35, 0), 0.05, 6), SM('galv'));
    }
    // jib crane
    B.add(rod(v3(-2.6, H, 2.6), v3(-2.6, H + 6, 2.6), 0.22, 12), SM('yellow'));
    B.add(rod(v3(-2.6, H + 5.6, 2.6), v3(3.8, H + 5.6, 2.6), 0.16, 10), SM('yellow'));
    B.add(rod(v3(-2.6, H + 6, 2.6), v3(2.0, H + 5.7, 2.6), 0.03, 6), SM('galv'));
    B.add(rod(v3(3.4, H + 5.5, 2.6), v3(3.4, H + 3.4, 2.6), 0.015, 4), SM('galv'));
    B.at(box(0.35, 0.4, 0.3), SM('yellow'), 3.4, H + 3.3, 2.6, 0);
    // antennas and a weather mast
    B.add(rod(v3(3.2, H, -3.2), v3(3.2, H + 4.5, -3.2), 0.05, 6), SM('galv'));
    B.at(cyl(0.35, 0.08, 16), SM('claddingGrey'), 3.2, H + 4.5, -3.2, 0);
    B.add(rod(v3(-3.3, H, -3.2), v3(-3.3, H + 3, -3.2), 0.04, 6), SM('galv'));
    for (const [x, z] of [
      [-h, -h],
      [h, -h],
      [h, h],
      [-h, h],
    ]) {
      B.at(cyl(0.12, 0.22, 10), SM('redLight'), x, H + 0.35, z, 0);
      B.at(cyl(0.12, 0.2, 10), SM('redLight'), x, H * 0.5 + 0.35, z, 0);
    }
    B.at(cyl(0.1, 0.18, 10), SM('redLight'), 0, TOWER.mastTop - 1.2, 0, 0);
  }

  // cable trays up the north-east column and the propellant lines up the east face
  {
    galvBar.member(v3(h - 0.6, 0.3, -h + 0.05), v3(h - 0.6, H, -h + 0.05), 0.6, 0.12);
    const lox = pipe([v3(h + 0.6, 0.3, -h - 0.6), v3(h + 0.6, 54.6, -h - 0.6), v3(h + 0.6, 54.6, -0.5)], 0.26, 1.2, 14);
    B.add(lox, SM('aluminum'), undefined, { ...tag, name: 'tower-lox-line' });
    const rp1 = pipe([v3(h + 1.3, 0.3, -h - 0.4), v3(h + 1.3, 54.1, -h - 0.4), v3(h + 1.3, 54.1, 0.3)], 0.18, 1.0, 12);
    B.add(rp1, SM('steelDark'), undefined, tag);
    for (let y = 3; y < 54; y += 3) {
      B.at(box(1.9, 0.12, 0.3), SM('galv'), h + 0.95, y, -h - 0.5, 0);
    }
  }

  ibeam.build(group, 'tower-ibeams', { cast: true, receive: true, ...tag });
  tube.build(group, 'tower-braces', { cast: true, receive: true, ...tag });
  railRod.build(group, 'tower-rails', { cast: detail > 0.6, receive: true, ...tag });
  galvBar.build(group, 'tower-galv', { cast: true, receive: true, ...tag });
  B.build(group, 'tower');

  // ───────────── swing arms ─────────────
  const face = h; // tower-local x of the east face
  const vehicleX = -TOWER.x; // tower-local x of the vehicle axis
  type Arm = { pivot: THREE.Group; range: [number, number]; sign: number; show?: () => boolean };
  const arms: Arm[] = [];

  /** Lattice truss arm from the hinge toward the vehicle; returns the arm's group (hinge at origin). */
  const trussArm = (y: number, hingeZ: number, sign: number, len: number, width: number, depth: number, name: string) => {
    const pivot = new THREE.Group();
    pivot.name = name;
    pivot.position.set(face + 0.3, y, hingeZ);
    group.add(pivot);
    const zc = -sign * (width / 2 + 0.25); // arm centreline relative to the hinge
    const tI = new Instances(new THREE.BoxGeometry(1, 1, 1), SM('towerSteel'));
    const rails = new Instances(new THREE.CylinderGeometry(1, 1, 1, 8, 1), SM('yellow'));
    const AB = new Batch({ cast: true, receive: true, part: 'service-tower' });
    const nPanels = Math.max(3, Math.round(len / 1.7));
    const chords = [
      [0, zc - width / 2],
      [0, zc + width / 2],
      [depth, zc - width / 2],
      [depth, zc + width / 2],
    ];
    for (const [dy, dz] of chords) tI.member(v3(0, dy, dz), v3(len, dy, dz), 0.22, 0.22);
    for (let i = 0; i <= nPanels; i++) {
      const x = (i / nPanels) * len;
      tI.member(v3(x, 0, zc - width / 2), v3(x, depth, zc - width / 2), 0.14, 0.14);
      tI.member(v3(x, 0, zc + width / 2), v3(x, depth, zc + width / 2), 0.14, 0.14);
      tI.member(v3(x, depth, zc - width / 2), v3(x, depth, zc + width / 2), 0.14, 0.14);
      tI.member(v3(x, 0, zc - width / 2), v3(x, 0, zc + width / 2), 0.14, 0.14);
      if (i < nPanels) {
        const x1 = ((i + 1) / nPanels) * len;
        const flip = i % 2 ? 1 : 0;
        tI.member(v3(x, flip ? depth : 0, zc - width / 2), v3(x1, flip ? 0 : depth, zc - width / 2), 0.1, 0.1);
        tI.member(v3(x, flip ? depth : 0, zc + width / 2), v3(x1, flip ? 0 : depth, zc + width / 2), 0.1, 0.1);
        tI.member(v3(x, depth, zc - width / 2), v3(x1, depth, zc + width / 2), 0.1, 0.1);
      }
    }
    // walkway grating and rails inside the truss
    const g = new THREE.PlaneGeometry(len, width - 0.2);
    g.rotateX(-Math.PI / 2);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * len) / 0.5, (uv.getY(i) * (width - 0.2)) / 0.5);
    g.translate(len / 2, 0.14, zc);
    AB.add(g, SM('grating'), undefined, { cast: true, receive: true, part: 'service-tower' });
    for (const s of [-1, 1]) rails.member(v3(0.2, 1.1, zc + s * (width / 2 - 0.15)), v3(len - 0.2, 1.1, zc + s * (width / 2 - 0.15)), 0.022, 0.022);
    // hinge post
    AB.add(rod(v3(0, -0.6, 0), v3(0, depth + 0.6, 0), 0.22, 16), SM('steelDark'));
    // the arm swings as one piece: its members merge into its batch (a few draw calls per arm)
    tI.mergeInto(AB, SM('towerSteel'), { cast: true, receive: true, part: 'service-tower' });
    rails.mergeInto(AB, SM('towerSteel'));
    return { pivot, AB, zc };
  };

  // upper-stage umbilical arm (LOX, RP-1, helium, electrical), level 54, swings south
  {
    const y = 54;
    const hingeZ = 1.4;
    const len = vehicleX - (face + 0.3) - 2.35;
    const { pivot, AB, zc } = trussArm(y, hingeZ, 1, len, 2.0, 1.9, 'arm-upper-umbilical');
    // umbilical carrier plate at the vehicle skin and the lines along the arm
    const tip = len;
    AB.at(bevelBox(0.35, 1.5, 1.3, 0.04), SM('steelDark'), tip + 0.1, 1.55, zc, 0);
    AB.at(bevelBox(0.12, 1.2, 1.0, 0.02), SM('steelDark'), tip + 0.36, 1.55, zc, 0);
    AB.add(pipe([v3(-0.2, 0.55, zc - 0.5), v3(tip - 0.6, 0.55, zc - 0.5), v3(tip + 0.2, 1.3, zc - 0.3), v3(tip + 0.45, 1.3, zc - 0.3)], 0.2, 0.6, 12), SM('aluminum'));
    AB.add(pipe([v3(-0.2, 0.5, zc + 0.5), v3(tip - 0.6, 0.5, zc + 0.5), v3(tip + 0.2, 1.8, zc + 0.3), v3(tip + 0.45, 1.8, zc + 0.3)], 0.14, 0.6, 12), SM('rubber'));
    AB.add(pipe([v3(-0.2, 1.4, zc), v3(tip - 0.2, 1.4, zc), v3(tip + 0.45, 2.0, zc)], 0.06, 0.4, 8), SM('rubber'));
    AB.build(pivot, 'arm-upper-umbilical');
    arms.push({ pivot, range: [0.4, 1.0], sign: 1 });
  }
  // payload fairing conditioning arm (satellite configuration), level 66, swings north
  {
    const y = 66;
    const hingeZ = -1.2;
    const len = vehicleX - (face + 0.3) - 3.4;
    const { pivot, AB, zc } = trussArm(y, hingeZ, -1, len, 1.6, 1.5, 'arm-fairing');
    AB.add(pipe([v3(-0.2, 0.6, zc), v3(len - 0.5, 0.6, zc), v3(len + 0.5, 0.3, zc), v3(len + 1.15, 0.3, zc)], 0.34, 0.8, 16), SM('whiteMatte'));
    AB.at(bevelBox(0.25, 1.1, 1.1, 0.05), SM('steelDark'), len + 1.24, 0.3, zc, 0);
    AB.build(pivot, 'arm-fairing');
    arms.push({ pivot, range: [0.0, 0.45], sign: -1, show: () => siteState.config !== 'capsule' });
  }
  // crew access arm with the white room at the hatch (capsule configuration), level 66
  {
    // The capsule (spec.ts: CAPSULE, SERVICE_MODULE) seats on the service module's ring, its
    // shoulder (r = 1.95 m) ~0.2 m above the ring, the backshell narrowing at 25 deg above it; the
    // hatch is at ~58.3 m above the nozzle exit (brief). The walkway floor sits just below the hatch
    // sill and clear above the shoulder; the white room stops 1.8 m from the axis (clear of the
    // backshell at its floor) and a hood with a rubber lip reaches in, parallel to the cone, to 2 cm
    // off the capsule around the hatch.
    const ringY = PAD.nozzleExitHeight + STATIONS.s2ForwardSkirtTop + SERVICE_MODULE.length;
    const hatchY = PAD.nozzleExitHeight + 58.3;
    const cone = THREE.MathUtils.degToRad(CAPSULE.sidewallDeg);
    const backshellR = (yy: number) => CAPSULE.baseDiameter / 2 - Math.max(0, yy - (ringY + 0.18)) * Math.tan(cone);
    const y = hatchY - 0.62; // walkway floor
    const roomR = 1.8; // white room face from the vehicle axis
    const hingeZ = -1.5;
    const pivot = new THREE.Group();
    pivot.name = 'arm-crew-access';
    pivot.position.set(face + 0.3, y, hingeZ);
    group.add(pivot);
    const AB = new Batch({ cast: true, receive: true, part: 'service-tower' });
    const wr = 2.7; // white room depth
    const axisX = vehicleX - (face + 0.3); // the vehicle axis in arm coordinates
    const reach = axisX - roomR;
    const len = reach - wr;
    const zc = 1.5;
    // enclosed walkway: floor, roof, side panels with a window band
    AB.at(bevelBox(len, 0.25, 2.2, 0.03), SM('steelDark'), len / 2, 0, zc, 0, { part: 'service-tower' });
    AB.at(bevelBox(len, 0.2, 2.4, 0.03), SM('white'), len / 2, 2.75, zc, 0);
    for (const s of [-1, 1]) {
      AB.at(box(len, 1.05, 0.08), SM('white'), len / 2, 0.65, zc + s * 1.12, 0);
      AB.at(box(len, 0.7, 0.06), SM('glass'), len / 2, 1.55, zc + s * 1.12, 0);
      AB.at(box(len, 0.75, 0.08), SM('white'), len / 2, 2.28, zc + s * 1.12, 0);
      // truss under the walkway
      AB.add(rod(v3(0, -0.15, zc + s * 1.0), v3(len, -0.15, zc + s * 1.0), 0.12, 8), SM('towerSteel'));
      AB.add(rod(v3(0, -1.4, zc + s * 1.0), v3(len * 0.85, -0.2, zc + s * 1.0), 0.1, 8), SM('towerSteel'));
    }
    for (let i = 0; i <= 4; i++) AB.at(box(0.1, 2.8, 2.45), SM('towerSteel'), (i / 4) * len, 1.35, zc, 0);
    // white room: a larger cabin with the hatch seal toward the capsule
    AB.at(bevelBox(wr, 3.0, 3.0, 0.05), SM('white'), len + wr / 2, 1.45, zc, 0, { part: 'service-tower' });
    AB.at(box(0.08, 0.9, 2.0), SM('glass'), len + wr * 0.35, 1.9, zc + 1.52, Math.PI / 2);
    {
      // hood and lip around the hatch: tilted with the backshell (local x across it, y up its slant)
      const hy = hatchY - y;
      const sx = axisX - backshellR(hatchY); // the backshell surface at the hatch
      const n = new THREE.Vector2(-Math.cos(cone), Math.sin(cone)); // outward normal (toward the tower, up)
      const place = (off: number) =>
        new THREE.Matrix4().makeTranslation(sx + n.x * off, hy + n.y * off, zc).multiply(new THREE.Matrix4().makeRotationZ(-cone));
      AB.add(bevelBox(0.62, 1.5, 1.5, 0.05), SM('white'), place(0.12 + 0.31));
      AB.add(bevelBox(0.1, 1.5, 1.5, 0.03), SM('rubber'), place(0.02 + 0.05));
    }
    AB.at(box(0.06, 0.4, 3.02), SM('accent'), len + wr / 2, 2.6, zc, 0);
    // hinge post and diagonal stay
    AB.add(rod(v3(0, -1.6, 0), v3(0, 3.2, 0), 0.24, 16), SM('steelDark'));
    AB.add(rod(v3(0, 3.0, 0.2), v3(len * 0.6, 2.85, zc - 0.4), 0.07, 8), SM('galv'));
    AB.build(pivot, 'arm-crew-access');
    arms.push({ pivot, range: [0.0, 0.45], sign: -1, show: () => siteState.config === 'capsule' });
  }

  return {
    group,
    update() {
      const a = siteState.arms;
      for (const arm of arms) {
        const k = smooth(arm.range[0], arm.range[1], a);
        // sign +1 swings toward +z (south), -1 toward -z (north); ~70 deg
        arm.pivot.rotation.y = -arm.sign * k * THREE.MathUtils.degToRad(70);
        if (arm.show) arm.pivot.visible = arm.show();
      }
    },
  };
}
