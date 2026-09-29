/**
 * The pad proper: the elevated concrete hardstand with its embankment and transporter ramp,
 * the flame trench cut through it (refractory walls, floor rising to the natural grade at the
 * mouth), the steel-faced flame deflector under the vehicle, the launch mount (deck at
 * PAD.deckHeight with a flared flame hole, four legs, girders), the four hold-down clamps that
 * grip the aft-skirt fittings and swing clear on release, the two tail service masts, and the
 * deck's sound-suppression plumbing (spray ring under the deck, four rainbird cannons).
 */
import * as THREE from 'three';
import { PAD } from '../../world/site';
import { Batch, bevelBox, box, cyl, pipe, rod, v3, extrude, mergeParts } from './geom';
import { SM } from './mats';
import { HARDSTAND, EMBANK, RAMP, TRENCH, TU, TV, trenchXZ, trenchFloor, DEFLECTOR, MOUNT, GRADE, DELUGE } from './layout';
import { PAD_TEX_EXT } from './textures';
import { siteState } from './state';

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Build a mesh geometry from a list of quads/triangles given as vertex arrays (flat shaded per face). */
class Poly {
  pos: number[] = [];
  uv: number[] = [];
  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, ua: [number, number], ub: [number, number], uc: [number, number]) {
    this.pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    this.uv.push(...ua, ...ub, ...uc);
  }
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, uvf: (p: THREE.Vector3) => [number, number]) {
    this.tri(a, b, c, uvf(a), uvf(b), uvf(c));
    this.tri(a, c, d, uvf(a), uvf(c), uvf(d));
  }
  geo(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeVertexNormals();
    return g;
  }
}

/** Orient a quad so its face points toward `toward` (flip winding if needed). */
function facing(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, toward: THREE.Vector3): [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3] {
  const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
  return n.dot(toward) >= 0 ? [a, b, c, d] : [a, d, c, b];
}

export interface Pad {
  group: THREE.Group;
  update(): void;
}

export function buildPad(): Pad {
  const group = new THREE.Group();
  group.name = 'pad';
  const B = new Batch();
  const P = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

  // ───────────── hardstand top (with the trench notch) ─────────────
  const hw = TRENCH.halfWidth;
  const ZN = HARDSTAND[0][1]; // north edge z
  const cutAt = (v: number, z: number) => {
    // trench side line v meets the line z
    const s = (z - TV.z * v) / TU.z;
    return trenchXZ(s, v);
  };
  const nL = cutAt(-hw, ZN);
  const nR = cutAt(hw, ZN);
  const back0 = trenchXZ(TRENCH.sBack, -hw);
  const back1 = trenchXZ(TRENCH.sBack, hw);
  const outline: [number, number][] = [];
  HARDSTAND.forEach((p, i) => {
    outline.push(p);
    if (i === 0) outline.push([nL.x, nL.z], [back0.x, back0.z], [back1.x, back1.z], [nR.x, nR.z]);
  });
  {
    const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ShapeGeometry(shape, 1);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    const uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      uv.setXY(i, (pos.getX(i) + PAD_TEX_EXT) / (2 * PAD_TEX_EXT), 1 - (pos.getZ(i) + PAD_TEX_EXT) / (2 * PAD_TEX_EXT));
    }
    B.add(g, SM('hardstand'), undefined, { cast: false, receive: true, part: 'launch-mount' });
  }

  // ───────────── embankment (1:2 slopes) and the ramp ─────────────
  {
    const poly = new Poly();
    const run = EMBANK.run;
    const drop = -EMBANK.drop;
    const n = HARDSTAND.length;
    const uvs = (p: THREE.Vector3): [number, number] => [(p.x + p.z) / 6, p.y / 6];
    const outward = (i: number) => {
      const [ax, az] = HARDSTAND[i];
      const [bx, bz] = HARDSTAND[(i + 1) % n];
      const dx = bx - ax;
      const dz = bz - az;
      const l = Math.hypot(dx, dz);
      // polygon is listed clockwise in (x, z) with z south: outward is (dz, -dx) / l
      return { x: dz / l, z: -dx / l };
    };
    for (let i = 0; i < n; i++) {
      const [ax, az] = HARDSTAND[i];
      const [bx, bz] = HARDSTAND[(i + 1) % n];
      const o = outward(i);
      const seg = (x0: number, z0: number, x1: number, z1: number, xo0: number, zo0: number, xo1: number, zo1: number) => {
        const q = facing(P(x0, 0, z0), P(x1, 0, z1), P(xo1, drop, zo1), P(xo0, drop, zo0), P(o.x, 1, o.z));
        poly.quad(q[0], q[1], q[2], q[3], uvs);
      };
      if (az === ZN && bz === ZN) {
        // north edge: split around the trench
        const oL = cutAt(-hw, ZN - run);
        const oR = cutAt(hw, ZN - run);
        seg(ax, az, nL.x, nL.z, ax, az - run, oL.x, oL.z);
        seg(nR.x, nR.z, bx, bz, oR.x, oR.z, bx, bz - run);
      } else if (az === HARDSTAND[4][1] && bz === az && az > 0) {
        // south edge: split around the ramp
        const r0 = RAMP.x + RAMP.halfWidth;
        const r1 = RAMP.x - RAMP.halfWidth;
        seg(ax, az, r0, az, ax, az + run, r0 + run, az + run);
        seg(r1, az, bx, bz, r1 - run, az + run, bx, bz + run);
      } else {
        seg(ax, az, bx, bz, ax + o.x * run, az + o.z * run, bx + o.x * run, bz + o.z * run);
      }
      // corner wedge to the next edge
      const o2 = outward((i + 1) % n);
      const ta = P(bx, 0, bz);
      let tb = P(bx + o.x * run, drop, bz + o.z * run);
      let tc = P(bx + o2.x * run, drop, bz + o2.z * run);
      const tn = new THREE.Vector3().subVectors(tb, ta).cross(new THREE.Vector3().subVectors(tc, ta));
      if (tn.y < 0) [tb, tc] = [tc, tb];
      if (tb.distanceTo(tc) > 1e-3) poly.tri(ta, tb, tc, uvs(ta), uvs(tb), uvs(tc));
    }
    // ramp surface and its side slopes
    const z0 = RAMP.z0;
    const z1 = RAMP.z0 + RAMP.length;
    const xa = RAMP.x - RAMP.halfWidth;
    const xb = RAMP.x + RAMP.halfWidth;
    const rampUv = (p: THREE.Vector3): [number, number] => [(p.x + PAD_TEX_EXT) / 12, p.z / 12];
    const rq = facing(P(xa, 0, z0), P(xb, 0, z0), P(xb, GRADE, z1), P(xa, GRADE, z1), P(0, 1, 0));
    const rampPoly = new Poly();
    rampPoly.quad(rq[0], rq[1], rq[2], rq[3], rampUv);
    B.add(rampPoly.geo(), SM('concreteLight'), undefined, { cast: false, receive: true });
    for (const side of [1, -1]) {
      const xe = side > 0 ? xb : xa;
      const q = facing(P(xe, 0, z0), P(xe, GRADE, z1), P(xe + side * 1, drop, z1), P(xe + side * run, drop, z0 + run), P(side, 1, 0));
      poly.quad(q[0], q[1], q[2], q[3], uvs);
    }
    B.add(poly.geo(), SM('embankment'), undefined, { cast: false, receive: true });
    // kerbs along the top edge
    for (let i = 0; i < n; i++) {
      const [ax, az] = HARDSTAND[i];
      const [bx, bz] = HARDSTAND[(i + 1) % n];
      const len = Math.hypot(bx - ax, bz - az);
      const o = outward(i);
      const k = box(len, 0.22, 0.3);
      const m = new THREE.Matrix4().makeRotationY(-Math.atan2(bz - az, bx - ax)).setPosition((ax + bx) / 2 - o.x * 0.15, 0.11, (az + bz) / 2 - o.z * 0.15);
      if (az === ZN && bz === ZN) continue;
      B.add(k, SM('concreteLight'), m, { cast: false, receive: true });
    }
  }

  // ───────────── flame trench: walls, floor, mouth apron ─────────────
  {
    const walls = new Poly();
    const floor = new Poly();
    const topAt = (s: number, v: number) => {
      const p = trenchXZ(s, v);
      return Math.max(-EMBANK.drop, Math.min(0, (p.z - ZN) * 0.5));
    };
    const sEnd = TRENCH.sMouth;
    const step = 1;
    for (let s = TRENCH.sBack; s < sEnd; s += step) {
      const s1 = Math.min(sEnd, s + step);
      for (const side of [-1, 1]) {
        const v = side * hw;
        const a = trenchXZ(s, v);
        const b = trenchXZ(s1, v);
        const y0a = trenchFloor(s) - 0.3;
        const y0b = trenchFloor(s1) - 0.3;
        const q = facing(P(a.x, y0a, a.z), P(b.x, y0b, b.z), P(b.x, topAt(s1, v), b.z), P(a.x, topAt(s, v), a.z), P(-TV.x * side, 0, -TV.z * side));
        walls.quad(q[0], q[1], q[2], q[3], (p) => {
          const t = (p.x - trenchXZ(0, v).x) * TU.x + (p.z - trenchXZ(0, v).z) * TU.z;
          return [(t - TRENCH.sBack) / 18, (p.y + 9.5) / 9.5 * 0.9];
        });
        // coping on the wall top
        const c0 = trenchXZ(s, v + side * 0.35);
        const c1 = trenchXZ(s1, v + side * 0.35);
        const g = box(Math.hypot(c1.x - c0.x, c1.z - c0.z) + 0.02, 0.18, 0.7);
        const m = new THREE.Matrix4().makeRotationY(-Math.atan2(c1.z - c0.z, c1.x - c0.x)).setPosition((c0.x + c1.x) / 2, (topAt(s, v) + topAt(s1, v)) / 2 + 0.05, (c0.z + c1.z) / 2);
        const tilt = new THREE.Matrix4().makeRotationZ(Math.atan2(topAt(s1, v) - topAt(s, v), step));
        if (topAt(s, v) < -0.05 || topAt(s1, v) < -0.05) B.add(g, SM('concreteLight'), m.multiply(tilt), { cast: false, receive: true });
      }
      if (s1 > TRENCH.sToe - 0.01) {
        const sa = Math.max(s, TRENCH.sToe - 0.5);
        const a0 = trenchXZ(sa, -hw);
        const a1 = trenchXZ(sa, hw);
        const b0 = trenchXZ(s1, -hw);
        const b1 = trenchXZ(s1, hw);
        const q = facing(P(a0.x, trenchFloor(sa), a0.z), P(a1.x, trenchFloor(sa), a1.z), P(b1.x, trenchFloor(s1), b1.z), P(b0.x, trenchFloor(s1), b0.z), P(0, 1, 0));
        floor.quad(q[0], q[1], q[2], q[3], (p) => [p.x / 8, p.z / 8]);
      }
    }
    // mouth apron fanning out onto the grade
    const m0 = trenchXZ(sEnd, -hw);
    const m1 = trenchXZ(sEnd, hw);
    const e0 = trenchXZ(sEnd + 12, -hw - 6);
    const e1 = trenchXZ(sEnd + 12, hw + 6);
    const q = facing(P(m0.x, trenchFloor(sEnd), m0.z), P(m1.x, trenchFloor(sEnd), m1.z), P(e1.x, GRADE + 0.04, e1.z), P(e0.x, GRADE + 0.04, e0.z), P(0, 1, 0));
    floor.quad(q[0], q[1], q[2], q[3], (p) => [p.x / 8, p.z / 8]);
    B.add(walls.geo(), SM('refractory'), undefined, { cast: true, receive: true, part: 'flame-deflector' });
    B.add(floor.geo(), SM('concreteDark'), undefined, { cast: false, receive: true, part: 'flame-deflector' });
  }

  // ───────────── flame deflector ─────────────
  {
    const shape = new Poly();
    let arc = 0;
    for (let i = 0; i < DEFLECTOR.length - 1; i++) {
      const [s0, y0] = DEFLECTOR[i];
      const [s1, y1] = DEFLECTOR[i + 1];
      const seg = Math.hypot(s1 - s0, y1 - y0);
      const nv = 6;
      for (let j = 0; j < nv; j++) {
        const va = -hw + (j / nv) * 2 * hw;
        const vb = -hw + ((j + 1) / nv) * 2 * hw;
        const pa0 = trenchXZ(s0, va);
        const pb0 = trenchXZ(s0, vb);
        const pa1 = trenchXZ(s1, va);
        const pb1 = trenchXZ(s1, vb);
        const A = P(pa0.x, y0, pa0.z);
        const Bv = P(pb0.x, y0, pb0.z);
        const C = P(pb1.x, y1, pb1.z);
        const D = P(pa1.x, y1, pa1.z);
        const up = P(TU.x * -(y1 - y0), s1 - s0, TU.z * -(y1 - y0));
        const q = facing(A, Bv, C, D, up);
        const u = (p: THREE.Vector3): [number, number] => {
          const vv = (p.x * TV.x + p.z * TV.z + hw) / (2 * hw);
          const along = p === A || p === Bv ? arc : arc + seg;
          return [vv * 1.2, along / 14];
        };
        shape.tri(q[0], q[1], q[2], u(q[0]), u(q[1]), u(q[2]));
        shape.tri(q[0], q[2], q[3], u(q[0]), u(q[2]), u(q[3]));
      }
      arc += seg;
    }
    const g = shape.geo();
    B.add(g, SM('deflector'), undefined, { cast: true, receive: true, part: 'flame-deflector', material: 'stainless' });
    // leading-edge nose bar and the cooling-water manifold along the top lip
    const l0 = trenchXZ(TRENCH.sBack + 0.1, -hw);
    const l1 = trenchXZ(TRENCH.sBack + 0.1, hw);
    B.add(rod(P(l0.x, -0.15, l0.z), P(l1.x, -0.15, l1.z), 0.28, 20), SM('deflector'), undefined, { part: 'flame-deflector' });
    const m0 = trenchXZ(TRENCH.sBack - 0.25, -hw);
    const m1 = trenchXZ(TRENCH.sBack - 0.25, hw);
    B.add(rod(P(m0.x, -0.55, m0.z), P(m1.x, -0.55, m1.z), 0.2, 16), SM('galv'), undefined, { part: 'sound-suppression' });
    // stiffening ribs down the face (they carry the cooling-water channels): the curve of the
    // steel face reads from any angle
    for (let i = 0; i < 6; i++) {
      const v = -hw + 0.95 + (i * (2 * hw - 1.9)) / 5;
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k < DEFLECTOR.length; k++) {
        const [s0, y0] = DEFLECTOR[Math.max(0, k - 1)];
        const [s1, y1] = DEFLECTOR[Math.min(DEFLECTOR.length - 1, k + 1)];
        const l = Math.hypot(s1 - s0, y1 - y0);
        const ns = -(y1 - y0) / l;
        const ny = (s1 - s0) / l;
        const [sk, yk] = DEFLECTOR[k];
        const q = trenchXZ(sk + ns * 0.09, v);
        pts.push(P(q.x, yk + ny * 0.09, q.z));
      }
      B.add(pipe(pts, 0.08, 0.6, 8, 3), SM('deflector'), undefined, { part: 'flame-deflector', material: 'stainless' });
    }
  }

  // ───────────── trench wall deluge headers (SITE_ANCHORS.delugeNozzles, last 12) ─────────────
  {
    const D = DELUGE;
    const s0 = D.wallS[0] - 0.8;
    const s1 = D.wallS[D.wallS.length - 1] + 0.8;
    const dl = Math.hypot(1, D.wallDip);
    for (const side of [-1, 1]) {
      const vh = side * (hw - D.wallOff);
      const a = trenchXZ(s0, vh);
      const b = trenchXZ(s1, vh);
      // header along the wall, fed by a riser from the hardstand edge above the deflector's lip
      const top = trenchXZ(s0, vh);
      B.add(pipe([P(top.x, -0.45, top.z), P(a.x, D.wallY, a.z), P(b.x, D.wallY, b.z)], 0.14, 0.4, 12), SM('galv'), undefined, { part: 'sound-suppression' });
      for (const s of D.wallS) {
        const p0 = trenchXZ(s, vh);
        const p1 = trenchXZ(s, vh - (side * D.wallStub) / dl);
        const y1 = D.wallY - (D.wallStub * D.wallDip) / dl;
        B.add(rod(P(p0.x, D.wallY, p0.z), P(p1.x, y1, p1.z), 0.07, 10), SM('stainless'), undefined, { part: 'sound-suppression' });
        // wall bracket
        const w = trenchXZ(s, side * (hw - 0.02));
        B.add(rod(P(w.x, D.wallY - 0.22, w.z), P(p0.x, D.wallY - 0.22, p0.z), 0.04, 6), SM('galv'));
      }
    }
  }

  // ───────────── the flame opening's steel coaming on the hardstand ─────────────
  {
    const edge = (a: { x: number; z: number }, b: { x: number; z: number }, out: { x: number; z: number }) => {
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const m = new THREE.Matrix4().makeRotationY(-Math.atan2(b.z - a.z, b.x - a.x)).setPosition((a.x + b.x) / 2 + out.x * 0.2, 0.05, (a.z + b.z) / 2 + out.z * 0.2);
      B.add(bevelBox(len + 0.4, 0.1, 0.4, 0.02), SM('galv'), m, { part: 'flame-deflector' });
      // painted edge band beyond the coaming
      const m2 = new THREE.Matrix4().makeRotationY(-Math.atan2(b.z - a.z, b.x - a.x)).setPosition((a.x + b.x) / 2 + out.x * 0.75, 0.012, (a.z + b.z) / 2 + out.z * 0.75);
      B.add(box(len + 1.5, 0.02, 0.6), SM('yellow'), m2, { cast: false, receive: true });
    };
    edge(back0, nL, { x: -TV.x, z: -TV.z });
    edge(back1, nR, { x: TV.x, z: TV.z });
    edge(back0, back1, { x: -TU.x, z: -TU.z });
  }

  // ───────────── launch mount ─────────────
  const deckTop = PAD.deckHeight;
  const deckBot = deckTop - MOUNT.thickness;
  const mountRot = -Math.atan2(TU.z, TU.x); // mount local +X along the trench
  // the mount is static: its parts merge with the pad's (one draw call per material)
  const MB = B.view(new THREE.Matrix4().makeRotationY(mountRot));
  B.part = 'launch-mount';
  {
    const hs = MOUNT.halfS;
    const hv = MOUNT.halfV;
    const ch = 0.9;
    const outline: [number, number][] = [
      [-hs + ch, -hv],
      [hs - ch, -hv],
      [hs, -hv + ch],
      [hs, hv - ch],
      [hs - ch, hv],
      [-hs + ch, hv],
      [-hs, hv - ch],
      [-hs, -hv + ch],
    ];
    const holeR = MOUNT.holeR + 0.5;
    const hole: [number, number][] = Array.from({ length: 64 }, (_, i) => {
      const a = (-i / 64) * Math.PI * 2;
      return [Math.cos(a) * holeR, Math.sin(a) * holeR];
    });
    const deck = extrude(outline, MOUNT.thickness - 0.12, 0.06, [hole], 24);
    deck.rotateX(-Math.PI / 2);
    deck.translate(0, deckBot + 0.06, 0);
    MB.add(deck, SM('steelDark'), undefined, { part: 'launch-mount' });
    // flared flame-hole liner: r = holeR at the top, wider below
    const liner = new THREE.LatheGeometry(
      [
        new THREE.Vector2(MOUNT.holeR + 0.52, deckTop),
        new THREE.Vector2(MOUNT.holeR, deckTop),
        new THREE.Vector2(MOUNT.holeR, deckTop - 0.25),
        new THREE.Vector2(MOUNT.holeR + 0.5, deckBot),
        new THREE.Vector2(MOUNT.holeR + 0.52, deckBot),
      ],
      96,
    );
    // the flame hole takes the plume at ignition: thermal class 3 like the deflector below it
    MB.add(liner, SM('deflector'), undefined, { part: 'launch-mount', material: 'stainless', thermal: 3 });
    // legs, base plates, girders
    for (const ss of [-1, 1])
      for (const sv of [-1, 1]) {
        const x = ss * MOUNT.legS;
        const z = sv * MOUNT.legV;
        MB.at(bevelBox(MOUNT.legSize, deckBot, MOUNT.legSize, 0.05), SM('steelDark'), x, deckBot / 2, z, 0, { part: 'launch-mount' });
        MB.at(bevelBox(MOUNT.legSize + 0.8, 0.12, MOUNT.legSize + 0.8, 0.03), SM('steelDark'), x, 0.06, z, 0, { part: 'launch-mount' });
        // stiffener plates on the leg faces
        for (const k of [-1, 1]) MB.at(box(0.04, deckBot * 0.9, 0.6), SM('steelDark'), x + k * (MOUNT.legSize / 2 + 0.02), deckBot * 0.47, z, 0);
      }
    for (const sv of [-1, 1]) MB.at(bevelBox(hs * 2 - 0.2, 1.2, 1.0, 0.04), SM('steelDark'), 0, deckBot - 0.6, sv * MOUNT.legV, 0, { part: 'launch-mount' });
    for (const ss of [-1, 1]) MB.at(bevelBox(0.9, 1.0, hv * 2 - 0.4, 0.04), SM('steelDark'), ss * MOUNT.legS, deckBot - 0.5, 0, 0, { part: 'launch-mount' });
    // deck-edge handrail posts and a toe plate
    const rail: THREE.Vector3[] = outline.map(([x, z]) => v3(x * 0.985, deckTop + 1.1, z * 0.985));
    for (let i = 0; i < rail.length; i++) {
      const a = rail[i];
      const b = rail[(i + 1) % rail.length];
      MB.add(rod(a, b, 0.03, 8), SM('yellow'));
      MB.add(rod(v3(a.x, deckTop + 0.55, a.z), v3(b.x, deckTop + 0.55, b.z), 0.022, 8), SM('yellow'));
      const len = a.distanceTo(b);
      const nPost = Math.max(1, Math.round(len / 1.8));
      for (let k = 0; k < nPost; k++) {
        const t = k / nPost;
        const p = a.clone().lerp(b, t);
        MB.add(rod(v3(p.x, deckTop, p.z), p, 0.028, 8), SM('yellow'));
      }
    }
    // under-deck spray ring and its nozzles (sound suppression)
    B.part = 'sound-suppression';
    const ringR = DELUGE.ringR;
    const ring = new THREE.TorusGeometry(ringR, 0.2, 10, 96);
    ring.rotateX(Math.PI / 2);
    ring.translate(0, deckBot - DELUGE.ringDrop, 0);
    MB.add(ring, SM('galv'), undefined, { part: 'sound-suppression' });
    for (let i = 0; i < DELUGE.ringCount; i++) {
      const a = (i / DELUGE.ringCount) * Math.PI * 2 + Math.PI / DELUGE.ringCount;
      const c = v3(Math.cos(a) * ringR, deckBot - DELUGE.ringDrop, Math.sin(a) * ringR);
      const tip = v3(Math.cos(a) * (ringR - DELUGE.tipIn), deckBot - DELUGE.tipDrop, Math.sin(a) * (ringR - DELUGE.tipIn));
      MB.add(rod(c, tip, 0.08, 8), SM('galv'), undefined, { part: 'sound-suppression' });
    }
    // rainbird cannons on the deck corners
    for (const [ss, sv] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      const x = ss * (hs - DELUGE.rbInset);
      const z = sv * (hv - DELUGE.rbInset);
      MB.at(cyl(0.3, 1.1, 16), SM('galv'), x, deckTop + 0.55, z, 0, { part: 'sound-suppression' });
      MB.at(cyl(0.42, 0.25, 16), SM('galv'), x, deckTop + 1.12, z, 0);
      const dir = v3(-x, -DELUGE.rbDroop, -z).normalize();
      const b0 = v3(x, deckTop + DELUGE.rbY, z);
      const b1 = b0.clone().addScaledVector(dir, DELUGE.rbLen - 0.35);
      MB.add(rod(b0, b1, 0.18, 14), SM('galv'), undefined, { part: 'sound-suppression' });
      MB.add(rod(b1, b1.clone().addScaledVector(dir, 0.35), 0.13, 14), SM('stainless'));
    }
    // feed pipes down two legs to the hardstand
    for (const sv of [-1, 1]) {
      const x = -MOUNT.legS - MOUNT.legSize / 2 - 0.35;
      const z = sv * MOUNT.legV;
      MB.add(pipe([v3(x, 0.4, z), v3(x, deckBot - 0.35, z), v3(-ringR * 0.7, deckBot - 0.35, z * 0.45)], 0.18, 0.6, 12), SM('galv'), undefined, { part: 'sound-suppression' });
    }
  }

  B.part = 'launch-mount';
  // ───────────── hold-down clamps (at the vehicle fittings: +X, +Z, -X, -Z) ─────────────
  // Each clamp: a painted pedestal on the deck with a stainless saddle under the vehicle's
  // hold-down pin and a tall hook arm pivoting on the pedestal; the arm's notch sits over the
  // pin. On release the arms rotate up and outboard (~80 deg) so the rising lug is clear.
  // Static bases merge into the pad; the four arms are one instanced mesh posed each frame.
  const rPin = MOUNT.gripR + 0.1; // vehicle's pin radius
  const yPin = PAD.nozzleExitHeight + 1.46;
  const jawPivot = v3(2.95, deckTop + 0.5, 0);
  const jawBases: THREE.Matrix4[] = [];
  for (const azDeg of MOUNT.clampAz) {
    const a = (azDeg * Math.PI) / 180;
    const frame = new THREE.Matrix4().makeRotationY(-a); // local +X = radial outward (from +x toward +z)
    const L = B.view(frame);
    // base plate and a yoke of two pedestal housings (safety yellow, reads against the dark
    // deck) the arm swings between, with the hinge pin through both
    L.at(bevelBox(2.2, 0.12, 1.5, 0.03), SM('steelDark'), 3.6, deckTop + 0.06, 0, 0);
    for (const t of [-0.43, 0.43]) {
      L.at(bevelBox(1.5, 1.5, 0.26, 0.05), SM('yellow'), 3.55, deckTop + 0.12 + 0.75, t, 0);
      L.at(bevelBox(1.58, 0.1, 0.32, 0.02), SM('steelDark'), 3.55, deckTop + 1.67, t, 0);
    }
    L.at(bevelBox(0.4, 0.45, 1.12, 0.04), SM('yellow'), 4.1, deckTop + 0.12 + 0.225, 0, 0);
    L.add(rod(v3(jawPivot.x, jawPivot.y, -0.6), v3(jawPivot.x, jawPivot.y, 0.6), 0.09, 16), SM('stainless'));
    // release actuator (hydraulic cylinder) behind the yoke, clear of the arm's swing
    L.add(rod(v3(4.55, deckTop + 0.2, 0), v3(4.55, deckTop + 1.25, 0), 0.15, 16), SM('steelDark'));
    L.add(rod(v3(4.55, deckTop + 1.25, 0), v3(4.55, deckTop + 1.5, 0), 0.06, 12), SM('stainless'));
    L.at(bevelBox(0.5, 0.1, 0.5, 0.02), SM('steelDark'), 4.55, deckTop + 0.17, 0, 0);
    // saddle cheeks under the pin, clear of the arm's side plates
    for (const t of [-0.36, 0.36]) {
      const cheek = extrude(
        [
          [rPin - 0.12, yPin - 0.05],
          [rPin + 0.1, yPin - 0.05],
          [rPin + 0.2, yPin - 0.16],
          [2.75, yPin - 0.2],
          [2.75, deckTop - 0.02],
          [rPin + 0.05, deckTop + 0.02],
        ],
        0.14,
        0.012,
      );
      cheek.translate(0, 0, t - 0.07);
      L.add(cheek, SM('stainless'), undefined, { part: 'launch-mount', material: 'stainless' });
    }
    L.at(bevelBox(0.7, 0.14, 0.9, 0.02), SM('stainless'), 2.4, deckTop + 0.07, 0, 0, { part: 'launch-mount', material: 'stainless' });
    jawBases.push(frame.clone().multiply(new THREE.Matrix4().makeTranslation(jawPivot.x, jawPivot.y, jawPivot.z)));
  }
  // the arm: two side plates (a tall hook with a notch over the pin), a top bridge and the boss
  const jawParts: { g: THREE.BufferGeometry }[] = [];
  const px = rPin - jawPivot.x;
  const py = yPin - jawPivot.y;
  for (const t of [-0.2, 0.2]) {
    const plate = extrude(
      [
        [0.3, -0.25],
        [0.3, 0.45],
        [0.05, 1.1],
        [-0.45, 1.3],
        // the hook's inboard face stays 3 cm clear of the aft-skirt skin beside the lug
        [px - 0.07, py + 0.7],
        [px - 0.07, py + 0.09],
        [px + 0.0, py + 0.085],
        [px + 0.06, py + 0.06],
        [px + 0.09, py - 0.02],
        [px + 0.05, py - 0.12],
        [px + 0.35, py - 0.1],
        [-0.1, -0.3],
      ],
      0.12,
      0.012,
    );
    plate.translate(0, 0, t - 0.06);
    jawParts.push({ g: plate });
  }
  // bridge across the top of the hook and a web down its back
  const bridge = bevelBox(0.75, 0.18, 0.52, 0.03);
  bridge.rotateZ(Math.atan2(1.3 - (py + 0.7), -0.45 - (px - 0.07)));
  bridge.translate((px - 0.07 - 0.45) / 2, (py + 0.7 + 1.3) / 2 - 0.02, 0);
  jawParts.push({ g: bridge });
  jawParts.push({ g: bevelBox(0.2, 0.95, 0.52, 0.03).translate(0.14, 0.55, 0) });
  jawParts.push({ g: cyl(0.26, 0.52, 20).rotateX(Math.PI / 2) });
  const jaws = new THREE.InstancedMesh(mergeParts(jawParts), SM('stainless'), jawBases.length);
  jaws.name = 'holddown-jaws';
  jaws.castShadow = jaws.receiveShadow = true;
  jaws.userData.part = 'launch-mount';
  jaws.userData.material = 'stainless';
  group.add(jaws);

  // ───────────── tail service masts (booster umbilicals), tower side ─────────────
  // static masts merge into the pad; the umbilical carrier plates (three instanced meshes, one per
  // material) pull back and drop at release
  const tsmBases: THREE.Matrix4[] = [];
  for (const azDeg of [148, 212]) {
    const a = (azDeg * Math.PI) / 180;
    const frame = new THREE.Matrix4().makeRotationY(-a);
    const T = B.view(frame);
    T.at(bevelBox(1.5, 4.2, 1.4, 0.06), SM('white'), 4.35, deckTop + 2.1, 0, 0, { part: 'launch-mount' });
    T.at(bevelBox(1.7, 0.3, 1.6, 0.04), SM('steelDark'), 4.35, deckTop + 4.35, 0, 0);
    T.at(bevelBox(1.6, 0.2, 1.5, 0.03), SM('steelDark'), 4.35, deckTop + 0.1, 0, 0);
    // hoses from the mast into the tower-side lines
    T.add(pipe([v3(4.9, deckTop + 0.3, 0.35), v3(5.6, deckTop + 0.3, 0.35), v3(5.9, deckTop - 0.6, 0.35)], 0.12, 0.3), SM('aluminum'));
    tsmBases.push(frame);
  }
  // plate-local x runs outboard from the carrier plate (at the vehicle skin) into the mast's
  // front face (1.6 m outboard); the boom and hoses end 8 cm inside the mast, and stay 12 cm clear
  // of its back face when the plate is pulled back against the front face (1.3 m) at release
  const plateParts: [THREE.Material, THREE.BufferGeometry][] = [
    [SM('steelDark'), mergeParts([{ g: bevelBox(0.18, 1.1, 0.9, 0.03) }, { g: rod(v3(0.1, 0, 0), v3(1.68, 0.1, 0), 0.07, 10) }])],
    [SM('rubber'), mergeParts([{ g: pipe([v3(0.1, 0.25, 0.2), v3(0.8, 0.25, 0.2), v3(1.3, 0.75, 0.2), v3(1.68, 0.75, 0.2)], 0.09, 0.3) }])],
    [SM('aluminum'), mergeParts([{ g: pipe([v3(0.1, -0.2, -0.2), v3(0.8, -0.2, -0.2), v3(1.3, 0.4, -0.2), v3(1.68, 0.4, -0.2)], 0.11, 0.3) }])],
  ];
  const tsmPlates = plateParts.map(([m, g]) => {
    const im = new THREE.InstancedMesh(g, m, tsmBases.length);
    im.name = 'tsm-plates';
    im.castShadow = im.receiveShadow = true;
    im.userData.part = 'launch-mount';
    group.add(im);
    return im;
  });

  B.part = undefined;
  B.build(group, 'pad');

  const _m = new THREE.Matrix4();
  const _r = new THREE.Matrix4();
  let last = -1;
  const pose = (h: number) => {
    jawBases.forEach((base, i) => {
      // release is simultaneous in reality; the stagger of a few ms is invisible
      const k = smooth(0.0 + i * 0.01, 0.55 + i * 0.01, h);
      _m.copy(base).multiply(_r.makeRotationZ(-k * 1.4)); // swing up and outboard ~80 deg
      jaws.setMatrixAt(i, _m);
    });
    jaws.instanceMatrix.needsUpdate = true;
    jaws.computeBoundingSphere();
    // tail service mast plates pull back against the mast face (and droop a little) once the
    // vehicle is released
    const k = smooth(0.05, 0.6, h);
    tsmBases.forEach((base, i) => {
      _m.copy(base).multiply(_r.makeTranslation(2.0 + k * 1.3, deckTop + 1.5, 0)).multiply(new THREE.Matrix4().makeRotationZ(-k * 0.08));
      for (const im of tsmPlates) im.setMatrixAt(i, _m);
    });
    for (const im of tsmPlates) {
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
    }
  };
  pose(0);

  return {
    group,
    update() {
      const h = siteState.holddown;
      if (h !== last) {
        last = h;
        pose(h);
      }
    },
  };
}
