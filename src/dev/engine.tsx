/**
 * Dev harness for the engine module: a studio (hemisphere + key light with shadows + PMREM
 * room environment) with the E-1 and E-1V on display stands, or seven cluster-detail E-1s in
 * the booster layout.
 *
 * URL: kind=E-1|E-1V|both, detail=hangar|flight|cluster, cut=0..1 (anim=1 loops the cut),
 * flow=0|1 (flow overlay), run=0..1 (propellant flow: valves, glow), spin=<rpm shown>,
 * pitch=, yaw= (deg; tvc=1 sweeps them), gg=1, ignite=0..1. Camera: see dev/index.tsx; without
 * az / dist the harness frames the engines itself (the shared default frames a whole vehicle).
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { buildEngine } from '../scene/vehicle/engine/buildEngine';
import type { EngineDetail, EngineKind, EngineModel } from '../scene/vehicle/engine/types';
import { S1_ENGINE_LAYOUT, BODY_RADIUS } from '../vehicle/spec';
import { frame } from '../scene/frame';
import { M } from '../scene/materials';
import { director } from '../director/director';
import { engineDesign } from '../scene/vehicle/engine/design';

const q = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);
const str = (k: string, d: string) => q.get(k) ?? d;

/** Camera distance DevStage uses when the URL gives none (see DevStage.tsx). */
const SHARED_DEFAULT_DIST = 110;

/** Height of the nozzle exit above the floor on the display stands (m). */
const CLEAR = 0.32;

function stand(pivotY: number, halfSpan: number): THREE.Group {
  // a painted steel gantry: two posts, a top beam and a mounting plate the engine hangs from
  const g = new THREE.Group();
  const steel = M('steelPainted');
  const mountTop = pivotY + 0.13;
  const beamY = mountTop + 0.06;
  const postH = beamY + 0.06;
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new RoundedBoxGeometry(0.12, postH, 0.12, 2, 0.01), steel);
    post.position.set(s * halfSpan, postH / 2, 0);
    const foot = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.04, 0.5, 2, 0.008), steel);
    foot.position.set(s * halfSpan, 0.02, 0);
    g.add(post, foot);
  }
  const beam = new THREE.Mesh(new RoundedBoxGeometry(halfSpan * 2 + 0.12, 0.12, 0.14, 2, 0.01), steel);
  beam.position.set(0, beamY, 0);
  const plate = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.012, 0.34, 2, 0.004), M('aluminumDark'));
  plate.position.set(0, mountTop + 0.006, 0);
  g.add(beam, plate);
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.castShadow = m.receiveShadow = true;
  });
  return g;
}

export default function Dev() {
  const { gl, scene } = useThree();
  const kind = str('kind', 'both');
  const detail = str('detail', 'hangar') as EngineDetail;

  useEffect(() => {
    const pm = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const env = pm.fromScene(room, 0.035);
    scene.environment = env.texture;
    scene.environmentIntensity = 0.85;
    scene.background = new THREE.Color('#cfd3d7');
    pm.dispose();
    room.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    });
    return () => {
      env.dispose();
      scene.environment = null;
    };
  }, [gl, scene]);

  // default framing for this harness (URL camera parameters still win). DevStage writes the
  // shared defaults (dist 110, a whole vehicle) from its own effect, which can land after this
  // component mounts (the canvas renders on its own schedule), so replace them whenever seen.
  const framing = useMemo(() => {
    if (q.has('az') || q.has('dist')) return null;
    return detail === 'cluster' ? [30, 16, 8.5, 0, 1.9] : kind === 'both' ? [24, 7, 13.5, 0.4, 3.1] : kind === 'E-1V' ? [24, 6, 10, 0, 3.4] : [26, 8, 5.4, 0, 1.55];
  }, [kind, detail]);
  const applyFraming = () => {
    if (!framing) return;
    const g = director.hangarGoal;
    const [az, el, dist, tx, ty] = framing;
    g.az = az;
    g.el = el;
    g.dist = dist;
    g.target.set(tx, ty, 0);
    g.fov = num('fov', 36);
    Object.assign(director.hangarShown, { ...g, target: g.target.clone() });
  };
  useEffect(applyFraming, [framing]);

  const setup = useMemo(() => {
    const group = new THREE.Group();
    const engines: EngineModel[] = [];
    const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 96), new THREE.MeshStandardMaterial({ color: '#b9bbbd', roughness: 0.82, metalness: 0 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    group.add(floor);
    const add = (k: EngineKind, x: number, z: number, withStand: boolean, pivotY?: number, yaw = 0) => {
      const e = buildEngine(k, detail);
      const py = pivotY ?? CLEAR - e.exitY;
      e.root.position.set(x, py, z);
      e.root.rotation.y = yaw;
      e.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.castShadow = m.receiveShadow = true;
      });
      group.add(e.root);
      if (withStand) {
        const s = stand(py, e.exitRadius + 0.35);
        s.position.set(x, 0, z);
        group.add(s);
      }
      engines.push(e);
      return e;
    };
    if (detail === 'cluster') {
      // seven engines in the booster layout under a plain thrust plate
      const py = CLEAR - engineDesign('E-1').exitY;
      // outer engines turn their powerheads (+X) outward, as on the booster
      for (const l of S1_ENGINE_LAYOUT) add('E-1', l.x, l.z, false, py, l.centre ? 0 : -Math.atan2(l.z, l.x));
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(BODY_RADIUS, BODY_RADIUS, 0.08, 128), M('paintGraphite'));
      plate.position.set(0, py + 0.29, 0);
      plate.castShadow = plate.receiveShadow = true;
      group.add(plate);
      const skirt = new THREE.Mesh(new THREE.CylinderGeometry(BODY_RADIUS, BODY_RADIUS, 1.4, 128, 1, true), M('paintWhite'));
      skirt.position.set(0, py + 0.33 + 0.7, 0);
      skirt.castShadow = skirt.receiveShadow = true;
      group.add(skirt);
    } else if (kind === 'both') {
      add('E-1', -1.25, 0, true);
      add('E-1V', 1.75, 0, true);
    } else add(kind === 'E-1V' ? 'E-1V' : 'E-1', 0, 0, true);
    (window as unknown as Record<string, unknown>).__engineDev = { group, engines };
    return { group, engines };
  }, [detail, kind]);

  useEffect(() => () => {
    for (const e of setup.engines) e.dispose();
    setup.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !m.userData.part) m.geometry.dispose();
    });
  }, [setup]);

  useFrame(() => {
    if (framing && director.hangarGoal.dist === SHARED_DEFAULT_DIST) applyFraming();
    const t = frame.decor;
    const anim = q.get('anim') === '1';
    const cut = anim ? 0.5 - 0.5 * Math.cos(Math.min(1, t / 6) * Math.PI) : num('cut', 0);
    const flowOn = q.get('flow') === '1';
    const run = num('run', flowOn ? 1 : 0);
    const rpm = num('spin', 0);
    const tvc = q.get('tvc') === '1';
    for (const e of setup.engines) {
      e.setCut(cut);
      e.setFlowOverlay(flowOn);
      e.setOperating({
        flow: run,
        shaftAngle: (t * rpm * Math.PI * 2) / 60 + num('shaft', 0),
        pitch: tvc ? Math.sin(t * 1.3) * 5 : num('pitch', 0),
        yaw: tvc ? Math.sin(t * 0.9) * 5 : num('yaw', 0),
        gg: q.get('gg') === '1',
        ignite: num('ignite', 0),
      });
    }
  });

  return (
    <>
      <hemisphereLight args={['#f4f6f8', '#8d8a84', 0.55]} />
      <directionalLight
        position={[5.5, 9, 7.5]}
        intensity={2.6}
        color="#fff8ee"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-5}
        shadow-camera-right={5}
        shadow-camera-top={8}
        shadow-camera-bottom={-2}
        shadow-camera-near={1}
        shadow-camera-far={30}
        shadow-bias={-0.0003}
        shadow-normalBias={0.02}
      />
      <directionalLight position={[-6, 4, -3]} intensity={0.7} color="#dfe8f3" />
      <directionalLight position={[0, 3, 9]} intensity={0.35} color="#ffffff" />
      <primitive object={setup.group} />
    </>
  );
}
