/**
 * Explore location: the hangar with the K-1 on its integration stand and the E-1 / E-1V engine
 * displays. Handles part selection (click/tap, list, keyboard), framing, intact / cutaway /
 * exploded views (the same objects throughout, animated), the materials lens, overlays, and
 * subsystem demonstrations (which run on the stage clock).
 */
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { director, frameHangarBox, hangarHome } from '../../director/director';
import { useApp, type ExploreView } from '../../state/store';
import { isPartId, type PartId } from '../../vehicle/parts';
import { buildVehicle } from '../vehicle/buildVehicle';
import { buildEngine } from '../vehicle/engine/buildEngine';
import type { VehicleConfig, ViewMode } from '../vehicle/types';
import { frame } from '../frame';
import { tierSpec, useQuality } from '../quality';
import { buildHangarArchitecture, buildHangarEnvScene } from './architecture';
import { ENGINE_STANDS, hangar, hangarPartBox, ENGINE_DISPLAY_PARTS, VACUUM_DISPLAY_PARTS } from './hangarState';
import { DEMOS, demoClock, demoProgress } from '../demos';
import { E1, E1V } from '../../vehicle/spec';
import { HangarOverlays } from './HangarOverlays';
import { applyThermal } from './thermal';

function configFor(c: 'satellite' | 'capsule'): VehicleConfig {
  // the crew configuration is the station flight's: the crew stack needs the whole booster, so it flies without recovery hardware
  return c === 'capsule' ? { payload: 'capsule', recovery: false, stack: 'full', detail: 'hangar' } : { payload: 'leoSat', recovery: true, stack: 'full', detail: 'hangar' };
}

function partOf(o: THREE.Object3D | null): PartId | null {
  while (o) {
    const p = o.userData?.part;
    if (isPartId(p)) return p;
    o = o.parent;
  }
  return null;
}

export function Hangar() {
  const { gl, scene } = useThree();
  const cfg = useApp((s) => s.hangarConfig);
  const view = useApp((s) => s.exploreView);
  const part = useApp((s) => s.part);
  const lens = useApp((s) => s.lens);
  const material = useApp((s) => s.material);
  const overlays = useApp((s) => s.overlays);
  const tier = useQuality((s) => s.tier);

  const arch = useMemo(() => buildHangarArchitecture(), []);
  useEffect(() => () => arch.dispose(), [arch]);

  // reflection environment from the hall itself
  useEffect(() => {
    const pm = new THREE.PMREMGenerator(gl);
    const envScene = buildHangarEnvScene();
    const rt = pm.fromScene(envScene, 0.02);
    scene.environment = rt.texture;
    scene.background = new THREE.Color('#e6e6e2');
    envScene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose?.();
    });
    pm.dispose();
    return () => rt.dispose();
  }, [gl, scene]);

  const vehicle = useMemo(() => {
    const v = buildVehicle(configFor(cfg));
    v.root.position.y = hangar.vehicleY;
    v.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.receiveShadow = true; // casting is the module's choice
    });
    return v;
  }, [cfg]);
  useEffect(() => {
    hangar.vehicle = vehicle;
    hangar.epoch++;
    return () => {
      if (hangar.vehicle === vehicle) hangar.vehicle = null;
      vehicle.dispose();
    };
  }, [vehicle]);

  const engines = useMemo(() => {
    const e = buildEngine('E-1', 'hangar');
    const v = buildEngine('E-1V', 'hangar');
    // gimbal pivot height so each nozzle exit sits just above its plinth
    e.root.position.copy(ENGINE_STANDS['E-1']).setY(0.3 - e.exitY + 0.05);
    v.root.position.copy(ENGINE_STANDS['E-1V']).setY(0.3 - v.exitY + 0.05);
    for (const m of [e, v])
      m.root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) mesh.receiveShadow = true; // casting is the module's choice
      });
    return { e, v };
  }, []);
  useEffect(() => {
    hangar.engine = engines.e;
    hangar.vacuum = engines.v;
    return () => {
      engines.e.dispose();
      engines.v.dispose();
    };
  }, [engines]);

  // ready once built (models are procedural: nothing to download)
  useEffect(() => {
    director.ready.hangar = true;
  }, []);

  // ── view state machine: close the current view before opening another ──
  const viewAnim = useRef({ mode: 'intact' as ViewMode, amount: 0, want: 'intact' as ExploreView });
  useEffect(() => {
    viewAnim.current.want = view;
  }, [view]);

  // selection → highlight + framing
  useEffect(() => {
    vehicle.setView({ highlight: part && !ENGINE_DISPLAY_PARTS.includes(part) && !VACUUM_DISPLAY_PARTS.includes(part) ? part : null, dimOthers: !!part && view === 'intact' ? false : false });
    const box = part ? hangarPartBox(part) : null;
    if (part && box && !box.isEmpty()) frameHangarBox(box, { tight: ENGINE_DISPLAY_PARTS.includes(part) || VACUUM_DISPLAY_PARTS.includes(part) ? 1.1 : 1.35 });
    else if (!part) hangarHome();
    hangar.epoch++;
  }, [part, vehicle, view]);

  useEffect(() => {
    const l = overlays.thermal ? 'thermal' : lens;
    vehicle.setView({ lens: l, material: l === 'materials' ? (material as never) : null });
    applyThermal(engines.e.root, overlays.thermal);
    applyThermal(engines.v.root, overlays.thermal);
  }, [lens, material, vehicle, overlays.thermal, engines]);

  useEffect(() => {
    engines.e.setFlowOverlay(overlays.flow);
    engines.v.setFlowOverlay(overlays.flow);
  }, [overlays.flow, engines]);

  // shadows follow the tier
  const key = useRef<THREE.DirectionalLight>(null);
  useEffect(() => {
    const l = key.current;
    if (!l) return;
    const size = tierSpec().shadowMap;
    l.shadow.mapSize.set(size, size);
    l.shadow.map?.dispose();
    l.shadow.map = null as unknown as THREE.WebGLRenderTarget;
  }, [tier]);

  const shaft = useRef(0);
  const idle = useRef(0);
  useFrame(() => {
    if (frame.location !== 'hangar' && director.wantLocation !== 'hangar') return;
    const dt = frame.dt;
    // home screen: a slow, steady drift around the vehicle until the viewer takes the camera
    if (director.input.active) idle.current = 0;
    else idle.current += dt;
    if (useApp.getState().view === 'home' && !director.reduced && idle.current > 2 && !part) {
      director.hangarGoal.az += dt * 1.6;
      director.hangarTau = 0.6;
    }
    // view transitions (1.1 s), same parts throughout
    const va = viewAnim.current;
    const rate = dt / (director.reduced ? 0.35 : 1.1);
    const demo = demoClock.id ? DEMOS[demoClock.id] : null;
    const want: ViewMode = demo?.view && demo.on === 'vehicle' ? demo.view : va.want;
    if (va.mode !== want) {
      va.amount = Math.max(0, va.amount - rate);
      if (va.amount === 0) va.mode = want;
    } else if (want !== 'intact') va.amount = Math.min(1, va.amount + rate);
    else va.amount = 0;
    vehicle.setView({ mode: va.mode, amount: va.amount });

    // demonstrations on the stage clock
    if (demoClock.playing && demo) {
      demoClock.t += dt * demoClock.speed;
      if (!demo.loop && demoClock.t >= demo.duration) {
        demoClock.t = demo.duration;
        demoClock.playing = false;
      }
    }
    const p = demoProgress();
    const id = demoClock.id;
    vehicle.animate(frame.decor, demo && demo.on === 'vehicle' ? id : overlays.flow ? 'feed-flow' : null, demo && demo.on === 'vehicle' ? p : (frame.decor % 10) / 10);

    // engine displays
    const e = engines.e;
    const v = engines.v;
    const engineDemo = demo && (demo.on === 'engine' || demo.on === 'both-engines') ? demo.id : null;
    const partOnStand = part && ENGINE_DISPLAY_PARTS.includes(part);
    const cut = engineDemo === 'turbopump' || engineDemo === 'combustion' || engineDemo === 'regen-cooling' || (partOnStand && view === 'cutaway') ? 1 : partOnStand && part !== 'engine' && part !== 'tvc-actuators' ? 1 : 0;
    const cutNow = (e.root.userData.cut ?? 0) as number;
    const cutNext = cutNow + Math.sign(cut - cutNow) * Math.min(Math.abs(cut - cutNow), dt / 0.9);
    e.root.userData.cut = cutNext;
    e.setCut(cutNext);
    const vCut = (part && VACUUM_DISPLAY_PARTS.includes(part) && view === 'cutaway') || engineDemo === 'nozzle-pressure' ? 0 : 0;
    v.setCut(vCut);
    // turbopump slowed ~1000x: 32,000 rpm → ~0.5 rev/s
    const spinning = engineDemo === 'turbopump' || engineDemo === 'combustion' || engineDemo === 'regen-cooling' || overlays.flow;
    if (spinning) shaft.current += dt * ((E1.pumpRpm / 60) / 1000) * Math.PI * 2 * (engineDemo === 'combustion' ? Math.min(1, p * 3) : 1);
    const flow = engineDemo === 'combustion' ? Math.min(1, Math.max(0, (p - 0.15) * 2.5)) : engineDemo === 'turbopump' || engineDemo === 'regen-cooling' || overlays.flow ? 1 : 0;
    const tvc = engineDemo === 'tvc' ? Math.sin(p * Math.PI * 2) * E1.gimbalRangeDeg : 0;
    const tvcY = engineDemo === 'tvc' ? Math.sin(p * Math.PI * 4) * E1.gimbalRangeDeg * 0.6 : 0;
    e.setOperating({ shaftAngle: shaft.current, flow, gg: flow > 0.1, pitch: tvc, yaw: tvcY, ignite: engineDemo === 'combustion' && p > 0.12 && p < 0.2 ? 1 : 0 });
    v.setOperating({ shaftAngle: shaft.current, flow: 0, gg: false, pitch: 0, yaw: 0, ignite: 0 });
    e.setFlowOverlay(overlays.flow || engineDemo === 'regen-cooling' || engineDemo === 'combustion');
    void E1V;
  });

  const onClick = (ev: ThreeEvent<MouseEvent>) => {
    if (ev.delta > 6) return;
    ev.stopPropagation();
    const id = partOf(ev.object);
    if (id) useApp.getState().selectPart(id);
  };
  const onMissed = () => {};

  return (
    <>
      <hemisphereLight args={['#fbfbf8', '#b7b2a8', 0.85]} />
      <directionalLight
        ref={key}
        position={[38, 110, 70]}
        intensity={2.4}
        color="#fffaf2"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-34}
        shadow-camera-right={34}
        shadow-camera-top={80}
        shadow-camera-bottom={-10}
        shadow-camera-near={10}
        shadow-camera-far={260}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />
      <directionalLight position={[-60, 40, -30]} intensity={0.55} color="#e8eef6" />
      <primitive object={arch.group} />
      <primitive object={vehicle.root} onClick={onClick} onPointerMissed={onMissed} />
      <primitive object={engines.e.root} onClick={onClick} />
      <primitive object={engines.v.root} onClick={onClick} />
      <HangarOverlays />
    </>
  );
}
