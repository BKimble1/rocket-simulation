/**
 * The hangar: an architectural high bay lit like a studio for engineering inspection: mid-grey,
 * warm surroundings a little darker than the vehicle's white paint (so its silhouette and
 * materials read against them), a polished floor that picks up soft reflections, calm light. Procedural, built once: polished concrete floor with slab joints,
 * a ribbed circular wall, a ceiling of trusses and light strips, a tall door opening with
 * daylight, an integration stand under the vehicle, engine display stands, a few figures for
 * scale. Also builds the reflection environment (PMREM) from the same hall.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { M } from '../materials';

const HALL_R = 205;
const HALL_H = 132;

function floorTexture(): THREE.CanvasTexture {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#8f8c86';
  g.fillRect(0, 0, S, S);
  // subtle mottling
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    const r = 4 + Math.random() * 40;
    const a = Math.random() * 0.035;
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '120,118,112' : '240,238,232'},${a})`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  // slab joints every 1/8 of the tile (tile = 64 m → 8 m slabs)
  g.strokeStyle = 'rgba(90,88,84,0.55)';
  g.lineWidth = 2;
  for (let k = 0; k <= 8; k++) {
    const p = (k / 8) * S;
    g.beginPath();
    g.moveTo(p, 0);
    g.lineTo(p, S);
    g.stroke();
    g.beginPath();
    g.moveTo(0, p);
    g.lineTo(S, p);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function markingsTexture(): THREE.CanvasTexture {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, S, S);
  const ring = (r: number, w: number, col: string, dash?: number[]) => {
    g.strokeStyle = col;
    g.lineWidth = w;
    g.setLineDash(dash ?? []);
    g.beginPath();
    g.arc(S / 2, S / 2, r, 0, Math.PI * 2);
    g.stroke();
  };
  // safety rings around the integration stand (painted floor markings)
  ring(S * 0.46, 10, 'rgba(214,168,40,0.9)', [34, 22]);
  ring(S * 0.3, 4, 'rgba(60,62,68,0.55)');
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface HangarArchitecture {
  group: THREE.Group;
  dispose(): void;
}

export function buildHangarArchitecture(): HangarArchitecture {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);

  // floor
  const ftex = keep(floorTexture());
  ftex.repeat.set((HALL_R * 2) / 64, (HALL_R * 2) / 64);
  const floorMat = keep(new THREE.MeshStandardMaterial({ map: ftex, roughness: 0.28, metalness: 0, envMapIntensity: 0.75 }));
  const floor = new THREE.Mesh(keep(new THREE.CircleGeometry(HALL_R, 128)), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);
  const mark = new THREE.Mesh(keep(new THREE.PlaneGeometry(26, 26)), keep(new THREE.MeshStandardMaterial({ map: keep(markingsTexture()), transparent: true, roughness: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })));
  mark.rotation.x = -Math.PI / 2;
  mark.position.y = 0.01;
  mark.receiveShadow = true;
  group.add(mark);

  // ribbed circular wall with a tall door opening toward +Z (daylight)
  const wallMat = keep(new THREE.MeshStandardMaterial({ color: '#a09e98', roughness: 0.85, side: THREE.BackSide }));
  const doorHalf = 0.34; // radians of opening
  const wallGeo = keep(new THREE.CylinderGeometry(HALL_R, HALL_R, HALL_H, 160, 1, true, Math.PI / 2 + doorHalf, Math.PI * 2 - doorHalf * 2));
  const wall = new THREE.Mesh(wallGeo, wallMat);
  wall.position.y = HALL_H / 2;
  group.add(wall);
  // vertical ribs (merged)
  const ribs: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 72; k++) {
    const a = (k / 72) * Math.PI * 2;
    const da = Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2));
    if (Math.abs(da) < doorHalf + 0.02) continue;
    const g = new THREE.BoxGeometry(1.2, HALL_H, 2.4);
    g.translate(0, HALL_H / 2, 0);
    g.rotateY(-a);
    g.translate(Math.cos(a) * (HALL_R - 1.3), 0, Math.sin(a) * (HALL_R - 1.3));
    ribs.push(g);
  }
  // horizontal girts
  for (let h = 18; h < HALL_H; h += 22) {
    const g = new THREE.TorusGeometry(HALL_R - 2.2, 0.5, 6, 160, Math.PI * 2 - doorHalf * 2);
    g.rotateX(Math.PI / 2);
    g.rotateY(-(Math.PI / 2 + doorHalf));
    g.translate(0, h, 0);
    ribs.push(g);
  }
  const ribMesh = new THREE.Mesh(keep(mergeGeometries(ribs)), keep(new THREE.MeshStandardMaterial({ color: '#8e8d88', roughness: 0.7 })));
  ribs.forEach((g) => g.dispose());
  group.add(ribMesh);

  // ceiling: trusses and light strips
  const ceil = new THREE.Mesh(keep(new THREE.CircleGeometry(HALL_R, 96)), keep(new THREE.MeshStandardMaterial({ color: '#7e7e7b', roughness: 0.9, side: THREE.DoubleSide })));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = HALL_H;
  group.add(ceil);
  const truss: THREE.BufferGeometry[] = [];
  const lights: THREE.BufferGeometry[] = [];
  for (let x = -180; x <= 180; x += 24) {
    const len = 2 * Math.sqrt(Math.max(0, HALL_R * HALL_R - x * x)) - 6;
    if (len < 10) continue;
    const b = new THREE.BoxGeometry(1.4, 3.2, len);
    b.translate(x, HALL_H - 3.5, 0);
    truss.push(b);
    const l = new THREE.BoxGeometry(2.2, 0.3, len * 0.9);
    l.translate(x + 12, HALL_H - 6.5, 0);
    lights.push(l);
  }
  const trussMesh = new THREE.Mesh(keep(mergeGeometries(truss)), keep(new THREE.MeshStandardMaterial({ color: '#8e9196', roughness: 0.6, metalness: 0.5 })));
  const lightMesh = new THREE.Mesh(keep(mergeGeometries(lights)), keep(new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fffaf0', emissiveIntensity: 2.2 })));
  truss.forEach((g) => g.dispose());
  lights.forEach((g) => g.dispose());
  group.add(trussMesh, lightMesh);

  // door opening: bright daylight plane beyond it
  const day = new THREE.Mesh(keep(new THREE.PlaneGeometry(2 * HALL_R * Math.sin(doorHalf) + 20, HALL_H)), keep(new THREE.MeshBasicMaterial({ color: '#f4f6f7' })));
  day.position.set(0, HALL_H / 2, HALL_R * Math.cos(doorHalf) + 12);
  day.rotation.y = Math.PI;
  group.add(day);

  // integration stand under the vehicle (holds the aft skirt at vehicle y 1.3..4.3, world 4.3..7.3)
  const standParts: THREE.BufferGeometry[] = [];
  const ring = new THREE.TorusGeometry(2.25, 0.18, 12, 96);
  ring.rotateX(Math.PI / 2);
  ring.translate(0, 4.2, 0);
  standParts.push(ring);
  const deck = new THREE.RingGeometry(1.95, 3.6, 96, 1);
  deck.rotateX(-Math.PI / 2);
  deck.translate(0, 4.25, 0);
  standParts.push(deck);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const leg = new THREE.BoxGeometry(0.5, 4.2, 0.5);
    leg.translate(Math.cos(a) * 3.1, 2.1, Math.sin(a) * 3.1);
    standParts.push(leg);
    const brace = new THREE.BoxGeometry(0.25, 0.25, 3.3);
    brace.rotateY(-a + Math.PI / 2);
    brace.translate(Math.cos(a) * 2.6, 3.3, Math.sin(a) * 2.6);
    standParts.push(brace);
  }
  const standGeo = mergeGeometries(standParts.map((g) => g.toNonIndexed()));
  standParts.forEach((g) => g.dispose());
  const stand = new THREE.Mesh(keep(standGeo), M('steelPainted'));
  stand.castShadow = stand.receiveShadow = true;
  group.add(stand);

  // engine display stands (low plinths)
  const plinth = (x: number, z: number, w: number) => {
    const m = new THREE.Mesh(keep(new THREE.BoxGeometry(w, 0.3, w)), M('concrete'));
    m.position.set(x, 0.15, z);
    m.receiveShadow = true;
    group.add(m);
  };
  plinth(15, 4, 3.6);
  plinth(21.5, -3, 4.2);

  // people for scale
  const person = (x: number, z: number, rot: number, h = 1.76) => {
    const p = new THREE.Group();
    const mat = keep(new THREE.MeshStandardMaterial({ color: '#4a5260', roughness: 0.8 }));
    const vest = keep(new THREE.MeshStandardMaterial({ color: '#e0e2e4', roughness: 0.7 }));
    const legs = new THREE.Mesh(keep(new THREE.CapsuleGeometry(0.14, h * 0.42, 4, 10)), mat);
    legs.position.y = h * 0.28;
    legs.scale.x = 1.5;
    const torso = new THREE.Mesh(keep(new THREE.CapsuleGeometry(0.19, h * 0.22, 4, 10)), vest);
    torso.position.y = h * 0.64;
    const head = new THREE.Mesh(keep(new THREE.SphereGeometry(0.11, 16, 12)), mat);
    head.position.y = h * 0.92;
    p.add(legs, torso, head);
    p.position.set(x, 0, z);
    p.rotation.y = rot;
    p.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    group.add(p);
  };
  person(5.2, 6.5, 0.4);
  person(6.1, 7.4, -0.8);
  person(13.2, 6.8, 2.1);
  person(-7.5, 3.5, 1.2);

  return {
    group,
    dispose() {
      disposables.forEach((d) => d.dispose());
    },
  };
}

/** A small scene resembling the hall, for the PMREM reflection environment. */
export function buildHangarEnvScene(): THREE.Scene {
  const s = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.SphereGeometry(100, 48, 24), new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true }));
  const pos = room.geometry.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 100;
    const z = pos.getZ(i) / 100;
    // floor warm grey, walls light, ceiling brighter; the door side (+Z) brightest
    let v = y < -0.05 ? 0.3 : y > 0.6 ? 0.62 : 0.46;
    if (z > 0.75 && y > -0.05 && y < 0.7) v = 1.5;
    col[i * 3] = v;
    col[i * 3 + 1] = v * 0.995;
    col[i * 3 + 2] = v * 0.98;
  }
  room.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
  s.add(room);
  // ceiling light strips
  for (let x = -80; x <= 80; x += 20) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(4, 1, 150), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 3.1, 3.0) }));
    l.position.set(x, 90, 0);
    s.add(l);
  }
  return s;
}
