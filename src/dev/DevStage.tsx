/** Mounts one dev module with a URL-controlled camera (see dev/index.tsx). */
import { Suspense, useEffect } from 'react';
import * as THREE from 'three';
import { Stage, stageHooks } from '../scene/Stage';
import { director } from '../director/director';
import { copyPose, makePose, type CamPose } from '../director/pose';
import { frame } from '../scene/frame';
import { DEV } from './index';
import { groundPoint } from '../director/shots';
import { siteUp } from '../director/shots';

const q = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);

export function DevStage({ name }: { name: string }) {
  const entry = DEV[name];
  useEffect(() => {
    const loc = entry.location;
    director.ready[loc] = true;
    frame.location = loc;
    director.wantLocation = loc;
    if (loc === 'hangar') {
      const g = director.hangarGoal;
      g.az = num('az', 35);
      g.el = num('el', 6);
      g.dist = num('dist', 110);
      g.target.set(num('tx', 0), num('ty', 32), num('tz', 0));
      g.fov = num('fov', 36);
      Object.assign(director.hangarShown, { ...g, target: g.target.clone() });
    } else if (loc === 'flight') {
      frame.missionTime = num('t', -30);
      const cam = (q.get('cam') ?? '-260,-330,18,40,8,40').split(',').map(Number);
      const [e, n, u, heading, pitch, fov] = cam;
      director.mode = 'free';
      // a fixed dev camera: replace the flight update by a static pose each frame
      stageHooks.tick = () => {
        const t = frame.missionTime;
        const p = director.flightPose;
        groundPoint(e, n, u, t, p.pos);
        const up = siteUp(t, new THREE.Vector3());
        // heading from north toward east, pitch up from the horizon, in the site frame at t
        const east = new THREE.Vector3(1, 0, 0);
        const north = new THREE.Vector3(0, 0, -1);
        const qE = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
        east.applyQuaternion(qE);
        north.applyQuaternion(qE);
        const h = (heading * Math.PI) / 180;
        const pt = (pitch * Math.PI) / 180;
        const dir = north.multiplyScalar(Math.cos(h) * Math.cos(pt)).add(east.multiplyScalar(Math.sin(h) * Math.cos(pt))).add(up.clone().multiplyScalar(Math.sin(pt)));
        p.target.copy(p.pos).addScaledVector(dir, 100);
        p.up.copy(up);
        p.fov = fov || 40;
        director.blends.length = 0;
        const hold = makePose();
        copyPose(hold, p);
        director.blends.push({
          f: { id: 'dev', subject: null, place: 'ground', dur: 0, eval: (o: CamPose) => (copyPose(o, hold), true) },
          start: 0,
          dur: 0,
          last: makePose(),
          has: false,
        });
        director.autoKey = 'dev';
      };
    }
    return () => {
      stageHooks.tick = null;
    };
  }, [entry]);
  const C = entry.load;
  const content = (
    <Suspense fallback={null}>
      <C />
    </Suspense>
  );
  return <Stage>{{ hangar: entry.location === 'hangar' ? content : null, flight: entry.location === 'flight' ? content : null, map: entry.location === 'map' ? content : null }}</Stage>;
}
