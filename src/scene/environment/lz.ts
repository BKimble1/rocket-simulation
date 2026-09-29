/**
 * The return-to-launch-site landing zone (LANDING_ZONE): a 90 m reinforced-concrete circle
 * with an original target marking (concentric rings, radial ticks, a centre disc; see
 * lzTexture), a thickened edge with a drainage lip, a ring of flush edge lights, four floodlight
 * masts, a wind sock, a short concrete apron joining the service road and a small equipment
 * shelter. Authored in LZ-local metres (origin at the slab centre, y along the local vertical)
 * and placed on the spherical Earth, 8.6 km from the pad (the slab top is 5.8 m below the pad
 * frame's horizontal plane there).
 */
import * as THREE from 'three';
import { Batch, bevelBox, box, cyl, rod, v3 } from './geom';
import { SM } from './mats';
import { LZ, LZ_TOP_H } from './layout';
import { lzTexture } from './textures';
import { withHaze } from './haze';
import { sphereY } from './map';
import { R_EARTH } from '../../world/frames';

export interface LandingZone {
  group: THREE.Group;
  dispose(): void;
}

export function buildLandingZone(): LandingZone {
  const group = new THREE.Group();
  group.name = 'landing-zone';
  // place the slab centre on the sphere and tilt it to the local vertical there
  const y0 = sphereY(LZ.x, LZ.z, LZ_TOP_H);
  group.position.set(LZ.x, y0, LZ.z);
  const up = v3(LZ.x, y0 + R_EARTH, LZ.z).normalize();
  group.quaternion.setFromUnitVectors(v3(0, 1, 0), up);

  const R = LZ.r;
  const B = new Batch();
  const sockMat = withHaze(new THREE.MeshStandardMaterial({ color: '#d4622e', roughness: 0.8, metalness: 0, side: THREE.DoubleSide }));
  sockMat.name = 'site.windSock';
  const tag = { part: 'landing-zone' };

  // slab top with the marking (its own material: the texture spans the slab diameter)
  const topMat = withHaze(new THREE.MeshStandardMaterial({ map: lzTexture(R), roughness: 0.88, metalness: 0 }));
  topMat.name = 'site.lzTop';
  topMat.polygonOffset = true;
  topMat.polygonOffsetFactor = -1;
  topMat.polygonOffsetUnits = -2;
  const top = new THREE.CircleGeometry(R, 128);
  top.rotateX(-Math.PI / 2);
  const topMesh = new THREE.Mesh(top, topMat);
  topMesh.name = 'lz-slab';
  topMesh.receiveShadow = true;
  topMesh.userData.part = 'landing-zone';
  group.add(topMesh);

  // thickened edge: a chamfered lip down to the graded apron, 0.45 m below the slab top
  const lip = new THREE.LatheGeometry(
    [
      new THREE.Vector2(R + 1.6, -0.5),
      new THREE.Vector2(R + 0.35, -0.08),
      new THREE.Vector2(R, 0.0),
      new THREE.Vector2(R - 0.02, 0.0),
    ],
    128,
  );
  B.add(lip, SM('concreteLight'), undefined, { cast: false, receive: true, ...tag });
  // drainage grate ring just outside the lip
  const drain = new THREE.RingGeometry(R + 1.7, R + 2.3, 128, 1);
  drain.rotateX(-Math.PI / 2);
  drain.translate(0, -0.47, 0);
  B.add(drain, SM('steelDark'), undefined, { cast: false, receive: true });

  // flush edge lights every 15 deg, with small housings
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const x = Math.cos(a) * (R - 1.2);
    const z = Math.sin(a) * (R - 1.2);
    B.at(cyl(0.22, 0.06, 12), SM('steelDark'), x, 0.02, z, 0);
    B.at(cyl(0.12, 0.05, 12), SM('lamp'), x, 0.05, z, 0);
  }

  // four floodlight masts on the apron (NE, SE, SW, NW), heads aimed at the centre
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const r = R + 24;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const hgt = 22;
    B.add(new THREE.CylinderGeometry(0.14, 0.32, hgt, 14).translate(x, -0.45 + hgt / 2, z), SM('galv'), undefined, tag);
    B.at(bevelBox(1.4, 0.6, 1.4, 0.06), SM('concreteLight'), x, -0.35, z, 0);
    const face = Math.atan2(-x, -z);
    const head = new THREE.Matrix4().makeRotationY(face).setPosition(x, -0.45 + hgt, z);
    const tilt = new THREE.Matrix4().makeRotationX(-0.3);
    for (let k = 0; k < 3; k++) {
      const lamp = bevelBox(0.8, 0.6, 0.32, 0.04).translate(-0.9 + k * 0.9, 0.4, 0.2);
      B.add(lamp, SM('steelDark'), head.clone().multiply(tilt));
      const lens = box(0.64, 0.44, 0.02).translate(-0.9 + k * 0.9, 0.4, 0.37);
      B.add(lens, SM('lamp'), head.clone().multiply(tilt));
    }
    B.add(box(2.8, 0.1, 0.5).translate(0, 0, 0), SM('galv'), head.clone());
  }

  // wind sock on a short mast west of the slab (the sock hangs half-inflated, orange/white bands)
  {
    const x = -R - 30;
    const z = -18;
    B.add(rod(v3(x, -0.45, z), v3(x, 7.5, z), 0.07, 10), SM('galv'));
    const sock = new THREE.CylinderGeometry(0.22, 0.42, 2.6, 16, 1, true);
    sock.rotateZ(Math.PI / 2 + 0.35);
    sock.translate(x + 1.3, 7.1, z);
    B.add(sock, sockMat, undefined, { cast: true, receive: false });
  }

  // concrete apron joining the service road (it arrives from the west at z ~ +6)
  {
    const len = 52;
    const g = box(len, 0.25, 9);
    g.translate(-R - len / 2 + 2, -0.52, 6);
    B.add(g, SM('concreteRoad'), undefined, { cast: false, receive: true });
  }

  // equipment shelter and a fire-water hydrant pair by the apron
  {
    const x = -R - 38;
    const z = 22;
    B.at(bevelBox(7, 3.0, 4.5, 0.06), SM('claddingGrey'), x, -0.45 + 1.5, z, 0, tag);
    B.at(box(7.3, 0.25, 4.8), SM('concreteLight'), x, -0.45 + 3.1, z, 0);
    B.at(box(1.1, 2.1, 0.05), SM('steelDark'), x + 1.8, -0.45 + 1.05, z - 2.28, 0);
    for (const dz of [-8, 34]) B.at(cyl(0.2, 1.0, 12), SM('yellow'), -R - 10, -0.45 + 0.5, dz, 0);
  }

  B.build(group, 'lz');
  return {
    group,
    dispose() {
      top.dispose();
      topMat.dispose();
      sockMat.dispose();
    },
  };
}
