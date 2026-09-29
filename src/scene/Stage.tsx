/**
 * The 3D stage: one canvas, three locations (hangar, flight, map), each its own THREE.Scene
 * rendered by the director. Scene components are mounted into their location through portals
 * and stay mounted once loaded (so returning to a location never reloads it).
 *
 * Frame order (see frame.ts): player tick → body sampling → director → scene components →
 * render. The director renders; React never re-renders per frame.
 */
import { Canvas, createPortal, useFrame, useThree, advance } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { FLAGS } from '../config';
import { director, updateFlight, updateHangar } from '../director/director';
import { poseQuaternion, type CamPose } from '../director/pose';
import { bodyAt } from '../timeline/sample';
import { R_EARTH } from '../world/frames';
import { BODY_IDS, frame, type Location } from './frame';
import { perf, tierSpec, useQuality, initialTier } from './quality';
import { stageClock } from './clock';

export const scenes: Record<Location, THREE.Scene> = {
  hangar: new THREE.Scene(),
  flight: new THREE.Scene(),
  map: new THREE.Scene(),
};
scenes.hangar.name = 'hangar';
scenes.flight.name = 'flight';
scenes.map.name = 'map';

/** Called once per frame before sampling (the active player advances mission time here). */
export const stageHooks = {
  tick: null as null | ((dt: number) => void),
  afterRender: null as null | (() => void),
};

function Loop() {
  const { gl, camera, size } = useThree();
  const cam = camera as THREE.PerspectiveCamera;
  const overlay = useMemo(() => {
    const scene = new THREE.Scene();
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: null as THREE.Texture | null }, alpha: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D map; uniform float alpha; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(map, vUv).rgb, alpha); }',
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    mesh.frustumCulled = false;
    scene.add(mesh);
    return { scene, mat, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), tex: null as THREE.FramebufferTexture | null };
  }, []);

  useEffect(() => {
    director.aspect = size.width / Math.max(1, size.height);
  }, [size]);

  // 1. clocks and the player
  useFrame((_, delta) => {
    if (FLAGS.virtual) stageClock.step(1 / 30);
    const dt = FLAGS.virtual ? 1 / 30 : Math.min(0.1, Math.max(0, delta));
    frame.dt = dt;
    frame.decor = stageClock.seconds();
    frame.n++;
    stageHooks.tick?.(dt);
  }, -30);

  // 2. sample every body at the displayed mission time (pure functions)
  useFrame(() => {
    const tl = frame.tl;
    if (!tl) return;
    for (const id of BODY_IDS) {
      const tr = tl.bodies[id];
      const st = frame.bodies[id];
      if (tr) bodyAt(tr, frame.missionTime, st);
      else st.present = false;
    }
  }, -20);

  // 3. the director moves the camera for the location on screen
  useFrame(() => {
    const loc = frame.location;
    let pose: CamPose;
    if (loc === 'flight') {
      updateFlight(frame.dt, director.flightPose);
      pose = director.flightPose;
      frame.origin.copy(pose.pos);
      frame.camAbs.copy(pose.pos);
      frame.camUp.copy(pose.pos).normalize();
      frame.camAlt = pose.pos.length() - R_EARTH;
      cam.position.set(0, 0, 0);
      cam.near = 0.1;
      cam.far = 2e9;
    } else if (loc === 'hangar') {
      updateHangar(frame.dt, director.hangarPose);
      pose = director.hangarPose;
      frame.origin.set(0, 0, 0);
      cam.position.copy(pose.pos);
      cam.near = 0.05;
      cam.far = 4000;
    } else {
      pose = director.mapPose;
      frame.origin.set(0, 0, 0);
      cam.position.copy(pose.pos);
      cam.near = 0.001;
      cam.far = 1000;
    }
    director.input.dx = director.input.dy = director.input.zoom = 0;
    poseQuaternion(pose, cam.quaternion);
    frame.camQuat.copy(cam.quaternion);
    frame.camFov = pose.fov;
    if (cam.fov !== pose.fov || cam.aspect !== director.aspect) {
      cam.fov = pose.fov;
      cam.aspect = director.aspect;
    }
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }, -10);

  // 4. render (the director owns rendering: R3F's automatic render is off)
  useFrame(() => {
    const t0 = performance.now();
    gl.setRenderTarget(null);
    gl.autoClear = true;
    gl.render(scenes[frame.location], cam);
    // entering another location: capture this picture as displayed and dissolve from it
    const want = director.wantLocation;
    if (want !== frame.location) {
      if (director.ready[want]) {
        const w = gl.domElement.width;
        const h = gl.domElement.height;
        if (!overlay.tex || overlay.tex.image.width !== w || overlay.tex.image.height !== h) {
          overlay.tex?.dispose();
          overlay.tex = new THREE.FramebufferTexture(w, h);
        }
        gl.copyFramebufferToTexture(overlay.tex);
        director.dissolve = { from: frame.location, start: frame.decor, dur: director.reduced ? 0.3 : 0.55 };
        frame.location = want;
        director.waiting = null;
      } else director.waiting = want;
    }
    const d = director.dissolve;
    if (d && overlay.tex) {
      const u = (frame.decor - d.start) / d.dur;
      if (u >= 1) director.dissolve = null;
      else {
        overlay.mat.uniforms.map.value = overlay.tex;
        overlay.mat.uniforms.alpha.value = 1 - u * u * (3 - 2 * u);
        gl.autoClear = false;
        gl.render(overlay.scene, overlay.cam);
        gl.autoClear = true;
      }
    }
    stageHooks.afterRender?.();
    perf.push(performance.now() - t0 + 0, performance.now());
  }, 10);
  return null;
}

function Input({ el }: { el: HTMLElement | null }) {
  useEffect(() => {
    if (!el) return;
    const pts = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    const down = (e: PointerEvent) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
      director.input.active = true;
    };
    const move = (e: PointerEvent) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      if (pts.size === 1) {
        const dx = e.clientX - p.x;
        const dy = e.clientY - p.y;
        if (Math.abs(dx) + Math.abs(dy) > 0) {
          director.input.dx += dx;
          director.input.dy += dy;
        }
      } else if (pts.size === 2) {
        p.x = e.clientX;
        p.y = e.clientY;
        const [a, b] = [...pts.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 0) director.input.zoom += (pinch - dist) * 4;
        pinch = dist;
        return;
      }
      p.x = e.clientX;
      p.y = e.clientY;
    };
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = 0;
      if (!pts.size) director.input.active = false;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      director.input.zoom += e.deltaY * (e.deltaMode === 1 ? 30 : 1);
    };
    const key = (e: KeyboardEvent) => {
      if (document.activeElement !== el) return;
      const step = e.shiftKey ? 40 : 14;
      if (e.key === 'ArrowLeft') director.input.dx -= step;
      else if (e.key === 'ArrowRight') director.input.dx += step;
      else if (e.key === 'ArrowUp') director.input.dy -= step;
      else if (e.key === 'ArrowDown') director.input.dy += step;
      else if (e.key === '+' || e.key === '=') director.input.zoom -= 120;
      else if (e.key === '-') director.input.zoom += 120;
      else return;
      e.preventDefault();
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('keydown', key);
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
      window.removeEventListener('keydown', key);
    };
  }, [el]);
  return null;
}

function Setup() {
  const { gl } = useThree();
  useEffect(() => {
    const ctx = gl.getContext() as WebGL2RenderingContext;
    const dbg = ctx.getExtension('WEBGL_debug_renderer_info');
    const renderer = dbg ? String(ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : String(ctx.getParameter(ctx.RENDERER));
    const nav = navigator as Navigator & { deviceMemory?: number };
    const tier = initialTier(renderer, nav.hardwareConcurrency ?? 4, nav.deviceMemory, matchMedia('(pointer: coarse)').matches, devicePixelRatio);
    const q = useQuality.getState();
    useQuality.setState({ renderer, tier: q.manual ?? tier, reason: q.manual ? 'set in settings' : `initial: ${renderer.slice(0, 48)}` });
    gl.toneMapping = THREE.AgXToneMapping;
    gl.toneMappingExposure = 1;
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
    if (FLAGS.hooks) {
      const w = window as unknown as Record<string, unknown>;
      w.__rocketAdvance = (n = 1) => {
        for (let i = 0; i < n; i++) advance(performance.now());
      };
      w.__rocketFrame = frame;
      w.__rocketDirector = director;
      w.__rocketGL = gl;
    }
  }, [gl]);
  return null;
}

function DprFollower() {
  const tier = useQuality((s) => s.tier);
  const { setDpr } = useThree();
  useEffect(() => {
    setDpr(Math.min(window.devicePixelRatio || 1, tierSpec().dprMax));
  }, [tier, setDpr]);
  return null;
}

export function Stage({ children }: { children: Record<Location, ReactNode> }) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  return (
    <div ref={setEl} className="stage" tabIndex={0} aria-label="3D view. Drag to rotate, scroll or pinch to zoom, arrow keys to orbit.">
      <Canvas
        frameloop={FLAGS.virtual ? 'never' : 'always'}
        dpr={1}
        gl={{ antialias: true, logarithmicDepthBuffer: true, preserveDrawingBuffer: FLAGS.capture, powerPreference: 'high-performance', alpha: false }}
        camera={{ fov: 40, near: 0.1, far: 2e9, position: [0, 30, 110] }}
        onCreated={({ gl }) => gl.setClearColor('#dfe3e6')}
      >
        <Setup />
        <DprFollower />
        <Loop />
        <Input el={el} />
        {(Object.keys(scenes) as Location[]).map((loc) => (
          <group key={loc}>{createPortal(<Suspense fallback={null}>{children[loc]}</Suspense>, scenes[loc])}</group>
        ))}
      </Canvas>
    </div>
  );
}
