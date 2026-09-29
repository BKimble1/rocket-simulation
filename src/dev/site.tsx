/**
 * Dev harness for the launch site: the sky (SpaceWorld), the site and a stand-in vehicle
 * (radius 1.85 m, 67 m tall; with cfg=capsule a service module, capsule and abort tower on top) on the mount. URL: hold=0..1, arms=0..1, deluge=0..1,
 * cfg=capsule, novehicle=1, clouds=0 (hide the cloud layer), hole=1 (tint the globe where the
 * terrain replaces it), hide=name,name (hide named objects, e.g. terrain-fade-ring), a2c=0 (alpha to coverage off),
 * hzsteps=n / hzmarch=0..1 (site haze march steps and weight), plus the flight camera (?t=&cam=e,n,u,heading,pitch,fov).
 * While the sky module is still a stub (its Sun light casts no shadows) the harness makes that
 * light cast shadows over a box around the pad so structures can be judged; it leaves a real
 * shadow-casting sun alone.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { SpaceWorld } from '../scene/space';
import { LaunchSite, siteState } from '../scene/environment';
import { frame } from '../scene/frame';
import { director } from '../director/director';
import { sitePosition, siteFrameQuaternion } from '../world/frames';
import { PAD } from '../world/site';
import { skyState } from '../scene/space/skyState';
import { hazeUniforms } from '../scene/environment/haze';

const q = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);

siteState.holddown = num('hold', 0);
siteState.arms = num('arms', 0);
siteState.deluge = num('deluge', 0);
siteState.config = q.get('cfg') === 'capsule' ? 'capsule' : 'satellite';

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();

function StandInVehicle() {
  const group = useMemo(() => {
    const g = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: '#eceae4', roughness: 0.5 });
    const graphite = new THREE.MeshStandardMaterial({ color: '#2a2d33', roughness: 0.6 });
    const metal = new THREE.MeshStandardMaterial({ color: '#6f675d', roughness: 0.4, metalness: 1 });
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, y: number) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.y = y;
      mesh.castShadow = mesh.receiveShadow = true;
      g.add(mesh);
    };
    const R = 1.85;
    add(new THREE.CylinderGeometry(R, R, 3.0, 64), graphite, 1.3 + 1.5);
    add(new THREE.CylinderGeometry(R, R, 33.6, 64), white, 4.3 + 16.8);
    add(new THREE.CylinderGeometry(R, R, 6.5, 64), graphite, 37.9 + 3.25);
    add(new THREE.CylinderGeometry(R, R, 9.5, 64), white, 44.4 + 4.75);
    if (siteState.config === 'capsule') {
      // service module, the capsule's backshell (25 deg cone from the shoulder, r 1.95 m) and the
      // abort tower: the outline the crew access arm must clear (spacecraft module's proportions)
      add(new THREE.CylinderGeometry(1.85, 1.85, 3.2, 64), white, 53.9 + 1.6);
      const shell = new THREE.LatheGeometry(
        [
          [0, 0],
          [1.85, 0],
          [1.95, 0.1],
          [1.94, 0.18],
          [0.81, 2.6],
          [0.66, 2.65],
          [0, 2.7],
        ].map(([r, y]) => new THREE.Vector2(r, y)),
        64,
      );
      add(shell, graphite, 57.1);
      add(new THREE.CylinderGeometry(0.3, 0.45, 7.9, 24), white, 59.8 + 3.95);
    } else {
      add(new THREE.CylinderGeometry(2.0, R, 0.6, 64), white, 53.9 + 0.3);
      add(new THREE.CylinderGeometry(2.0, 2.0, 6.5, 64), white, 54.5 + 3.25);
      const nose = new THREE.LatheGeometry(
        Array.from({ length: 24 }, (_, i) => {
          const t = i / 23;
          return new THREE.Vector2(2.0 * Math.sqrt(Math.max(0, 1 - t * t)) * (1 - 0.02 * t), t * 6.0);
        }),
        64,
      );
      add(nose, white, 61.0);
    }
    for (let i = 0; i < 7; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const r = i === 6 ? 0 : 1.2;
      const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.53, 1.3, 32, 1, true), metal);
      bell.position.set(Math.cos(a) * r, 0.65, Math.sin(a) * r);
      bell.castShadow = true;
      g.add(bell);
    }
    return g;
  }, []);
  useFrame(() => {
    const t = frame.missionTime;
    siteFrameQuaternion(t, _q);
    sitePosition(t, 0, _p).add(new THREE.Vector3(0, PAD.nozzleExitHeight, 0).applyQuaternion(_q));
    group.position.set(_p.x - frame.origin.x, _p.y - frame.origin.y, _p.z - frame.origin.z);
    group.quaternion.copy(_q);
  }, 0);
  return <primitive object={group} />;
}

/** Shadows from the stub sky's Sun light (does nothing once the sky module casts its own). */
function DevShadows() {
  const { scene } = useThree();
  // expose the scene to the probe scripts (?hooks=1) for draw-call accounting
  if (q.get('hooks') === '1') (window as unknown as { __devScene?: THREE.Scene }).__devScene = scene;
  // hide named objects for diagnosis (?hide=terrain,terrain-fade-ring)
  const hide = (q.get('hide') ?? '').split(',').filter(Boolean);
  const state = useMemo(() => ({ light: null as THREE.DirectionalLight | null, managed: false, checked: 0 }), []);
  useFrame(() => {
    if (hide.length && state.checked < 120) scene.traverse((o) => void (hide.includes(o.name) && (o.visible = false)));
    if (q.get('a2c') === '0' && state.checked < 120)
      scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (m && !Array.isArray(m) && m.alphaToCoverage) {
          m.alphaToCoverage = false;
          m.needsUpdate = true;
        }
      });
    if (!state.light && state.checked < 120) {
      state.checked++;
      const found: THREE.DirectionalLight[] = [];
      scene.traverse((o) => {
        if ((o as THREE.DirectionalLight).isDirectionalLight) found.push(o as THREE.DirectionalLight);
      });
      const light = found[0] ?? null;
      state.light = light;
      if (light && !light.castShadow) {
        state.managed = true;
        light.castShadow = true;
        const s = light.shadow;
        s.mapSize.set(2048, 2048);
        s.camera.left = s.camera.bottom = -140;
        s.camera.right = s.camera.top = 140;
        s.camera.near = 1;
        s.camera.far = 2000;
        s.bias = -0.0004;
        s.normalBias = 0.04;
        s.camera.updateProjectionMatrix();
        scene.add(light.target);
      }
    }
    // haze diagnosis: ?hzsteps=<n> overrides the marched model's step count, ?hzmarch=0..1 its weight
    if (q.has('hzsteps')) hazeUniforms.uHazeSteps.value = num('hzsteps', 8);
    if (q.has('hzmarch')) hazeUniforms.uHazeMarch.value = num('hzmarch', 1);
    if (!state.managed || !state.light) return;
    const t = frame.missionTime;
    const target = director.flightPose.target;
    sitePosition(t, 0, _p);
    // centre the shadow box between the pad and the camera's target, clamped to the pad area
    const c = new THREE.Vector3().copy(target).sub(_p);
    if (c.length() > 200) c.setLength(200);
    c.add(_p).sub(frame.origin);
    state.light.target.position.copy(c);
    state.light.position.copy(c).addScaledVector(skyState.sunDir, 900);
    state.light.target.updateMatrixWorld();
  }, 1);
  return null;
}

export default function Dev() {
  return (
    <>
      <SpaceWorld clouds={q.get('clouds') !== '0'} holeDebug={q.get('hole') === '1'} />
      <LaunchSite />
      {q.get('novehicle') === '1' ? null : <StandInVehicle />}
      <DevShadows />
    </>
  );
}
