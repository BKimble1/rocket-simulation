/**
 * Dev harness for the vehicle module (?dev=vehicle). Neutral studio: hemisphere + key light
 * with shadows + a PMREM RoomEnvironment, a floor, and the vehicle driven by URL parameters:
 *   cfg=leoSat|gtoSat|lunarProbe|capsule|researchCapsule  stack=boosterOnly  recovery=0|1
 *   detail=flight|hangar  view=intact|cutaway|exploded  amt=0..1  part=<PartId>  dim=1
 *   lens=materials|thermal  mat=<MaterialId>  legs= fins= defl= open= frost= scorch= lox= rp1=
 *   gp= gy= (booster gimbal pitch/yaw deg)  demo=<DemoId>  p=0..1 (omit to loop)  info=1
 *   lift=<m> (raise the vehicle; 3 m by default with legs deployed or the exploded view)
 * Camera: az, el, dist, tx, ty, tz, fov (see dev/index.tsx).
 */
import { useEffect, useMemo, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildVehicle } from '../scene/vehicle/buildVehicle';
import type { PayloadConfig, VehicleConfig, VehicleModel, ViewMode } from '../scene/vehicle/types';
import { isPartId } from '../vehicle/parts';
import { MATERIAL_IDS, type MaterialId } from '../content/materials/ids';
import { frame } from '../scene/frame';
import { tierSpec } from '../scene/quality';

const q = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);

function config(): VehicleConfig {
  const cfg = (q.get('cfg') ?? 'leoSat') as PayloadConfig;
  const boosterOnly = q.get('stack') === 'boosterOnly';
  return {
    payload: boosterOnly && !q.has('cfg') ? 'researchCapsule' : cfg,
    recovery: q.has('recovery') ? q.get('recovery') === '1' : true,
    stack: boosterOnly ? 'boosterOnly' : 'full',
    detail: q.get('detail') === 'flight' ? 'flight' : 'hangar',
  };
}

function backdrop(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#2d3137');
  grad.addColorStop(0.62, '#555b63');
  grad.addColorStop(1, '#7d8289');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export default function Dev() {
  const { gl, scene } = useThree();
  const [model, setModel] = useState<VehicleModel | null>(null);
  // built in an effect (StrictMode mounts twice: each build gets its own dispose)
  useEffect(() => {
    const m = buildVehicle(config());
    setModel(m);
    return () => m.dispose();
  }, []);

  useEffect(() => {
    gl.localClippingEnabled = true;
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    const prevEnv = scene.environment;
    const prevBg = scene.background;
    scene.environment = env;
    scene.environmentIntensity = 0.55;
    const bg = backdrop();
    scene.background = bg;
    return () => {
      scene.environment = prevEnv;
      scene.background = prevBg;
      env.dispose();
      bg.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);

  useEffect(() => {
    if (!model) return;
    const view = (q.get('view') ?? 'intact') as ViewMode;
    const part = q.get('part');
    const mat = q.get('mat');
    model.setView({
      mode: view,
      amount: num('amt', view === 'intact' ? 0 : 1),
      highlight: isPartId(part) ? part : null,
      dimOthers: q.get('dim') === '1',
      lens: q.get('lens') === 'materials' || q.get('lens') === 'thermal' ? (q.get('lens') as 'materials' | 'thermal') : 'systems',
      material: mat && (MATERIAL_IDS as readonly string[]).includes(mat) ? (mat as MaterialId) : null,
    });
    model.setState({
      legs: num('legs', 0),
      fins: num('fins', 0),
      finDeflect: num('defl', 0),
      fairingOpen: num('open', 0),
      frost: num('frost', 0),
      entryScorch: num('scorch', 0),
      s1Lox: num('lox', 1),
      s1Rp1: num('rp1', 1),
      s2Lox: num('lox2', 1),
      s2Rp1: num('rp12', 1),
      s1GimbalPitch: num('gp', 0),
      s1GimbalYaw: num('gy', 0),
      s2GimbalPitch: num('gp2', 0),
      satArrays: num('arrays', 0),
      smArrays: num('arrays', 0),
    });
    // like the hangar stand (3 m): deployed legs and the exploded engines reach below the nozzle
    // exit plane, so lift the vehicle off the floor for them (or on request: lift=<m>)
    const lift = q.has('lift') ? num('lift', 3) : view === 'exploded' || num('legs', 0) > 0 || q.get('demo') === 'booster-recovery' ? 3 : 0;
    model.root.position.y = lift;
    if (q.get('info') === '1') {
      const w = window as unknown as Record<string, unknown>;
      w.__vehicle = model;
    }
  }, [model]);

  const demo = q.get('demo');
  useFrame(() => {
    if (!demo || !model) return;
    const t = frame.decor;
    const p = q.has('p') ? num('p', 0) : (t % 8) / 8;
    model.animate(t, demo, p);
  });

  const shadow = tierSpec().shadowMap;
  const light = useMemo(() => {
    const l = new THREE.DirectionalLight('#fff6ea', 2.6);
    l.position.set(38, 70, 52);
    l.castShadow = true;
    l.shadow.mapSize.set(shadow * 2, shadow * 2);
    const c = l.shadow.camera;
    c.left = -42;
    c.right = 42;
    c.top = 60;
    c.bottom = -40;
    c.near = 10;
    c.far = 220;
    l.shadow.bias = -0.0002;
    l.shadow.normalBias = 0.03;
    l.target.position.set(0, 30, 0);
    return l;
  }, [shadow]);

  return (
    <>
      <hemisphereLight args={['#dfe8f2', '#6d6a64', 0.9]} />
      <primitive object={light} />
      <primitive object={light.target} />
      <directionalLight position={[-50, 30, -40]} intensity={0.55} color="#c9d6ff" />
      <mesh rotation-x={-Math.PI / 2} position-y={-0.01} receiveShadow>
        <circleGeometry args={[160, 96]} />
        <meshStandardMaterial color="#8e9196" roughness={0.85} metalness={0} />
      </mesh>
      {model && <primitive object={model.root} />}
    </>
  );
}
