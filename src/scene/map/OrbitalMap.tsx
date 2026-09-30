/**
 * Orbital map: a schematic view of the mission at planetary scale. Distances are to scale
 * (1 unit = one Earth radius); vehicle icons are enlarged for legibility (stated on screen).
 * Trajectories are the mission's own sampled tracks, so the map and the flight always agree.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { frame } from '../frame';
import { director } from '../../director/director';
import { usePlayback } from '../../state/playback';
import { asset } from '../../config';
import { EARTH_MESH_Q0, earthMeshQuaternion, moonPosition, R_EARTH, R_MOON, SUN_DIRECTION } from '../../world/frames';
import type { BodyId } from '../../vehicle/parts';
import { bodyAt, makeBodyState } from '../../timeline/sample';

const COLORS: Partial<Record<BodyId, string>> = { booster: '#e0662f', upper: '#6a5af9', satellite: '#16875a', capsule: '#c28a12', service: '#8a7f6a', station: '#2f7fe0' };

/** az / el (deg) around the Earth; zoom multiplies the automatic distance (user control). */
const orbit = { az: 30, el: 25, zoom: 1 };
const FOV = 40;
const TAN = Math.tan(((FOV / 2) * Math.PI) / 180);

export function OrbitalMap() {
  const { scene } = useThree();
  const missionId = usePlayback((s) => s.mission);
  const tl = missionId ? frame.tl : null;
  const earth = useMemo(() => {
    const tex = new THREE.TextureLoader().load(asset('textures/earth/day_2048.jpg'));
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 48), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
    return m;
  }, []);
  const moon = useMemo(() => {
    const tex = new THREE.TextureLoader().load(asset('textures/moon/lroc_2048.jpg'));
    tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Mesh(new THREE.SphereGeometry(R_MOON / R_EARTH, 48, 24), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
  }, []);
  useEffect(() => {
    scene.background = new THREE.Color('#0b0d12');
    director.ready.map = true;
  }, [scene]);
  // trajectories
  const lines = useMemo(() => {
    const g = new THREE.Group();
    if (!tl) return g;
    for (const [id, tr] of Object.entries(tl.bodies)) {
      if (!tr || id === 'fairingA' || id === 'fairingB' || id === 'les') continue;
      const pts: THREE.Vector3[] = [];
      const n = tr.t.length;
      const step = Math.max(1, Math.floor(n / 1500));
      for (let i = 0; i < n; i += step) {
        const t = tr.t[i];
        if (t < tr.exists[0] || t > tr.exists[1]) continue;
        pts.push(new THREE.Vector3(tr.pos[3 * i], tr.pos[3 * i + 1], tr.pos[3 * i + 2]).divideScalar(R_EARTH));
      }
      if (pts.length < 2) continue;
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: COLORS[id as BodyId] ?? '#aaaaaa', transparent: true, opacity: 0.75 }));
      g.add(line);
    }
    return g;
  }, [tl]);
  const icons = useMemo(() => {
    const m: Partial<Record<BodyId, THREE.Mesh>> = {};
    for (const id of Object.keys(COLORS) as BodyId[]) {
      const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: COLORS[id] }));
      m[id] = mesh;
    }
    return m;
  }, []);
  const tmpState = useMemo(() => makeBodyState(), []);
  useFrame(() => {
    if (frame.location !== 'map') return;
    earth.quaternion.copy(earthMeshQuaternion(frame.missionTime));
    void EARTH_MESH_Q0;
    const mp = moonPosition(frame.missionTime, tl?.moonPhase0 ?? 0).divideScalar(R_EARTH);
    moon.position.copy(mp);
    moon.visible = tl?.id === 'lunar';
    // camera: orbit around the Earth (or frame the whole trajectory)
    const inp = director.input;
    orbit.az -= inp.dx * 0.25;
    orbit.el = Math.max(-80, Math.min(85, orbit.el + inp.dy * 0.2));
    orbit.zoom = Math.max(0.35, Math.min(3, orbit.zoom * Math.exp(inp.zoom * 0.0015)));
    // automatic distance: the whole Earth plus the followed craft, however high it has climbed
    // (a continuous function of mission time, so the map zooms out smoothly as the craft rises)
    const track = tl?.bodies[director.focus];
    const craft = track ? bodyAt(track, frame.missionTime, tmpState) : null;
    const reach = craft?.present ? craft.pos.length() / R_EARTH : 1;
    const dist = Math.max(1.6, Math.max(3.2, (reach * 1.25) / TAN) * orbit.zoom);
    const a = (orbit.az * Math.PI) / 180;
    const e = (orbit.el * Math.PI) / 180;
    const p = director.mapPose;
    p.pos.set(Math.sin(a) * Math.cos(e) * dist, Math.sin(e) * dist, Math.cos(a) * Math.cos(e) * dist);
    p.target.set(0, 0, 0);
    p.up.set(0, 1, 0);
    p.fov = FOV;
    if (!tl) return;
    const scale = dist * 0.012;
    for (const [id, mesh] of Object.entries(icons) as [BodyId, THREE.Mesh][]) {
      const tr = tl.bodies[id];
      if (!tr) {
        mesh.visible = false;
        continue;
      }
      bodyAt(tr, frame.missionTime, tmpState);
      mesh.visible = tmpState.present;
      mesh.position.copy(tmpState.pos).divideScalar(R_EARTH);
      mesh.scale.setScalar(scale);
      mesh.rotation.y = frame.decor;
    }
  });
  return (
    <>
      <ambientLight intensity={0.25} />
      <directionalLight position={SUN_DIRECTION.clone().multiplyScalar(10)} intensity={2.4} />
      <primitive object={earth} />
      <primitive object={moon} />
      <primitive object={lines} />
      {Object.values(icons).map((m, i) => (
        <primitive key={i} object={m!} />
      ))}
    </>
  );
}
