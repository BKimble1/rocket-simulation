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
import { director, flightStats, updateFlight, updateHangar, viewInsetGoal } from '../director/director';
import { makePose, poseQuaternion, type CamPose } from '../director/pose';
import { bodyAt } from '../timeline/sample';
import { R_EARTH } from '../world/frames';
import { BODY_IDS, frame, type Location } from './frame';
import { perf, tierSpec, useQuality, initialTier } from './quality';
import { frameStep } from './clock';
import { afterDraw, dissolve, hasPendingDissolve, requestDissolve, setHold, snapshotAlpha } from './dissolve';

export const scenes: Record<Location, THREE.Scene> = {
  hangar: new THREE.Scene(),
  flight: new THREE.Scene(),
  map: new THREE.Scene(),
};
scenes.hangar.name = 'hangar';
scenes.flight.name = 'flight';
scenes.map.name = 'map';

/** Called once per frame before sampling (the active player advances mission time here). */
/** The stage camera and canvas, for the interface (projecting hotspots, measuring). */
export const stageRefs = {
  camera: null as THREE.PerspectiveCamera | null,
  canvas: null as HTMLCanvasElement | null,
  gl: null as THREE.WebGLRenderer | null,
};

export const stageHooks = {
  tick: null as null | ((dt: number) => void),
  afterRender: null as null | (() => void),
};

/** Bumped whenever the flight scene's models are rebuilt (a new mission): triggers a shader warm-up. */
export const flightEpoch = { value: 0 };

/** Set by the interface to show a notice while the WebGL context is lost. */
export let onContextChange: null | ((lost: boolean) => void) = null;
export function setContextListener(f: null | ((lost: boolean) => void)) {
  onContextChange = f;
}

/**
 * Optional GPU timing (EXT_disjoint_timer_query_webgl2), only with ?diag=1 or ?trace=1 and only
 * where the browser supports it; results arrive a few frames late and feed the overlay.
 */
function makeGpuTimer(gl: THREE.WebGLRenderer) {
  const c = gl.getContext() as WebGL2RenderingContext;
  const ext = FLAGS.diag || FLAGS.trace ? (c.getExtension('EXT_disjoint_timer_query_webgl2') as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null) : null;
  const pending: WebGLQuery[] = [];
  let active: WebGLQuery | null = null;
  return {
    supported: !!ext,
    begin() {
      if (!ext || active || pending.length > 4) return;
      active = c.createQuery();
      if (active) c.beginQuery(ext.TIME_ELAPSED_EXT, active);
    },
    end() {
      if (!ext || !active) return;
      c.endQuery(ext.TIME_ELAPSED_EXT);
      pending.push(active);
      active = null;
    },
    poll() {
      if (!ext) return;
      const disjoint = c.getParameter(ext.GPU_DISJOINT_EXT);
      while (pending.length) {
        const q = pending[0];
        if (!c.getQueryParameter(q, c.QUERY_RESULT_AVAILABLE)) break;
        const ns = c.getQueryParameter(q, c.QUERY_RESULT) as number;
        if (!disjoint) perf.pushGpu(ns / 1e6);
        c.deleteQuery(q);
        pending.shift();
      }
    },
  };
}

/** Diagnostic camera trace (?trace=1): one record per frame, kept out of normal use. */
export interface TraceRecord {
  n: number;
  clock: number;
  t: number;
  p: number;
  loc: string;
  mode: string;
  subject: string | null;
  key: string;
  blends: number;
  pushes: number;
  cuts: number;
  pos: [number, number, number];
  fov: number;
  intervalMs: number;
  dt: number;
  dissolve: number;
}
export const cameraTrace: TraceRecord[] = [];

/**
 * Compile every material of a location's scene, including objects that are hidden now and shown
 * later (plume and plasma volumes, parachutes, deployed legs, fins), so no shader compiles in the
 * middle of the action. Uses the browser's parallel compilation where available.
 */
export const warm = { flight: '' as string, hangar: false, pending: false, ms: 0 };
function prewarm(gl: THREE.WebGLRenderer, scene: THREE.Scene, cam: THREE.Camera): Promise<void> {
  const hidden: THREE.Object3D[] = [];
  scene.traverse((o) => {
    // lights keep their state: the number of lights is part of every lit material's program
    if (!o.visible && !(o as THREE.Light).isLight) {
      hidden.push(o);
      o.visible = true;
    }
  });
  const t0 = performance.now();
  let p: Promise<unknown>;
  try {
    p = typeof gl.compileAsync === 'function' ? gl.compileAsync(scene, cam) : Promise.resolve(gl.compile(scene, cam));
  } finally {
    for (const o of hidden) o.visible = false;
  }
  return p.then(
    () => {
      warm.ms = performance.now() - t0;
    },
    () => {},
  );
}

/** A location can be entered: its scene is ready and, for flight, a mission is loaded. */
function canEnter(loc: Location): boolean {
  if (!director.ready[loc]) return false;
  if (loc === 'flight') return !!frame.tl;
  return true;
}

function Loop() {
  const { gl, camera, size } = useThree();
  const cam = camera as THREE.PerspectiveCamera;
  const overlay = useMemo(() => {
    const scene = new THREE.Scene();
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: null as THREE.Texture | null }, alpha: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      // the snapshot holds displayed (tone-mapped, encoded) values: written back unchanged
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
  const timer = useMemo(() => makeGpuTimer(gl), [gl]);
  const last = useMemo(() => ({ ms: 0 }), []);

  useEffect(() => {
    director.aspect = size.width / Math.max(1, size.height);
  }, [size]);
  useEffect(
    () => () => {
      overlay.tex?.dispose();
      overlay.mat.dispose();
    },
    [overlay],
  );

  // 1. clocks and the player: one capped frame step for everything (see clock.ts)
  useFrame(() => {
    const nowMs = performance.now();
    const interval = last.ms > 0 ? nowMs - last.ms : 1000 / 60;
    last.ms = nowMs;
    const dt = frameStep(interval / 1000);
    frame.intervalMs = interval;
    frame.dt = dt;
    frame.clock += dt;
    frame.decor = frame.clock;
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
    // orientation relative to the floating origin (flight) or the hangar/map origin
    if (loc === 'flight') {
      rel.pos.set(0, 0, 0);
      rel.target.subVectors(pose.target, pose.pos);
      rel.up.copy(pose.up);
      rel.upHint.copy(pose.upHint);
      rel.fov = pose.fov;
      poseQuaternion(rel, cam.quaternion);
    } else poseQuaternion(pose, cam.quaternion);
    frame.camQuat.copy(cam.quaternion);
    frame.camFov = pose.fov;
    if (cam.fov !== pose.fov || cam.aspect !== director.aspect) {
      cam.fov = pose.fov;
      cam.aspect = director.aspect;
    }
    // keep the subject in the part of the screen no panel covers (phone sheets, home card)
    const goal = viewInsetGoal();
    const shown = director.viewInsetShown;
    const k = director.reduced ? 1 : 1 - Math.exp(-frame.dt / 0.4);
    shown.top += (goal.top - shown.top) * k;
    shown.bottom += (goal.bottom - shown.bottom) * k;
    shown.left += (goal.left - shown.left) * k;
    shown.right += (goal.right - shown.right) * k;
    const W = size.width;
    const H = size.height;
    const vertical = shown.bottom > 1;
    if ((vertical || Math.abs(shown.left - shown.right) > 1) && H > 0) {
      // a bottom sheet also widens the view to fit the free height; a side panel only shifts it
      cam.zoom = vertical ? Math.max(H * 0.2, H - shown.top - shown.bottom) / H : 1;
      cam.setViewOffset(W, H, (shown.right - shown.left) / 2, vertical ? (shown.bottom - shown.top) / 2 : 0, W, H);
    } else if (cam.view?.enabled || cam.zoom !== 1) {
      cam.zoom = 1;
      cam.clearViewOffset();
    }
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }, -10);

  // 4. render (the director owns rendering: R3F's automatic render is off)
  useFrame(() => {
    // compile a newly built flight scene (a mission's vehicle) before it is shown or launched
    const key = frame.tl && director.ready.flight ? `${frame.tl.id}:${flightEpoch.value}` : '';
    if (key && warm.flight !== key && !warm.pending) {
      warm.pending = true;
      warm.flight = key;
      void prewarm(gl, scenes.flight, cam).finally(() => (warm.pending = false));
    }
    const t0 = performance.now();
    gl.setRenderTarget(null);
    gl.autoClear = true;
    // static hangar: re-render its shadows only on frames where something moved
    if (frame.location === 'hangar') {
      gl.shadowMap.autoUpdate = false;
      if (frame.shadowDirty) {
        gl.shadowMap.needsUpdate = true;
        frame.shadowDirty = false;
      }
    } else gl.shadowMap.autoUpdate = true;
    // exposure per location (flight sets its own from the sky: see space/system.ts): the hangar is
    // exposed a little down so the white vehicle and the mid-grey hall both sit in the range where
    // their contrast survives the tone mapping
    if (frame.location === 'hangar') gl.toneMappingExposure = HANGAR_EXPOSURE;
    else if (frame.location === 'map') gl.toneMappingExposure = 1;
    // an omitted interval: the picture captured before the gap stays up until it ends
    if (dissolve.hold && !frame.omitted) setHold(false, frame.clock);
    const a = snapshotAlpha(frame.clock);
    const covered = a >= 1 && dissolve.hold && !hasPendingDissolve();
    timer.begin();
    if (!covered) gl.render(scenes[frame.location], cam);
    timer.end();
    // a running dissolve: its snapshot over the live picture
    if (a > 0 && overlay.tex) {
      overlay.mat.uniforms.map.value = overlay.tex;
      overlay.mat.uniforms.alpha.value = a;
      gl.autoClear = false;
      gl.render(overlay.scene, overlay.cam);
      gl.autoClear = true;
    }
    // entering another location: capture the picture as displayed and dissolve from it
    const want = director.wantLocation;
    if (want !== frame.location) {
      if (canEnter(want)) {
        if (!hasPendingDissolve('location'))
          requestDissolve('location', director.reduced ? 0.3 : 0.55, () => {
            frame.location = director.wantLocation !== frame.location && canEnter(director.wantLocation) ? director.wantLocation : frame.location;
            frame.shadowDirty = true;
            director.waiting = null;
            perf.warmup(performance.now());
          });
      } else director.waiting = want;
    } else director.waiting = null;
    if (frame.enteredOmitted) {
      frame.enteredOmitted = false;
      if (frame.location === 'flight') requestDissolve('omit', director.reduced ? 0.3 : 0.8, () => setHold(true, frame.clock));
    }
    // the frame is complete (scene and any running dissolve): capture it if a change asks for it
    afterDraw(() => {
      if (contextLost.value) return false;
      const w = gl.domElement.width;
      const h = gl.domElement.height;
      if (!overlay.tex || overlay.tex.image.width !== w || overlay.tex.image.height !== h) {
        overlay.tex?.dispose();
        overlay.tex = new THREE.FramebufferTexture(w, h);
      }
      gl.setRenderTarget(null);
      gl.copyFramebufferToTexture(overlay.tex);
      return true;
    }, frame.clock);
    timer.poll();
    stageHooks.afterRender?.();
    const t1 = performance.now();
    perf.pushFrame(frame.intervalMs, t1 - t0, t1, typeof document !== 'undefined' && document.hidden);
    if (FLAGS.trace) {
      const p = director.flightPose.pos;
      cameraTrace.push({
        n: frame.n,
        clock: +frame.clock.toFixed(4),
        t: +frame.missionTime.toFixed(3),
        p: +frame.presTime.toFixed(3),
        loc: frame.location,
        mode: director.mode,
        subject: director.subject,
        key: director.autoKey,
        blends: director.blends.length,
        pushes: flightStats.pushes,
        cuts: flightStats.cuts,
        pos: [p.x, p.y, p.z],
        fov: +frame.camFov.toFixed(3),
        intervalMs: +frame.intervalMs.toFixed(2),
        dt: +frame.dt.toFixed(4),
        dissolve: +a.toFixed(3),
      });
      if (cameraTrace.length > 20000) cameraTrace.splice(0, 5000);
    }
  }, 10);
  return null;
}

const rel = makePose();
const HANGAR_EXPOSURE = 0.72;
/** The WebGL context was lost and not yet restored (the interface says so; nothing is drawn). */
export const contextLost = { value: false, since: 0 };

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
  const { gl, camera } = useThree();
  useEffect(() => {
    stageRefs.camera = camera as THREE.PerspectiveCamera;
    stageRefs.canvas = gl.domElement;
    stageRefs.gl = gl;
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
    gl.shadowMap.type = THREE.PCFShadowMap;
    // a lost context (driver reset, too many tabs, mobile memory pressure): keep the page, hold
    // playback, tell the viewer, and resume when the browser restores it (three.js rebuilds its
    // GPU resources from the scene); if it never comes back the interface offers a reload
    const canvas = gl.domElement;
    const lost = (e: Event) => {
      e.preventDefault();
      contextLost.value = true;
      contextLost.since = performance.now();
      onContextChange?.(true);
    };
    const restored = () => {
      contextLost.value = false;
      frame.shadowDirty = true;
      onContextChange?.(false);
    };
    canvas.addEventListener('webglcontextlost', lost);
    canvas.addEventListener('webglcontextrestored', restored);
    if (FLAGS.hooks) {
      const w = window as unknown as Record<string, unknown>;
      w.__rocketAdvance = (n = 1) => {
        for (let i = 0; i < n; i++) advance(performance.now());
      };
      w.__rocketFrame = frame;
      w.__rocketDirector = director;
      w.__rocketGL = gl;
      w.__rocketTrace = cameraTrace;
      w.__rocketPerf = perf;
      w.__rocketFlightStats = flightStats;
      w.__rocketDissolve = dissolve;
      w.__rocketLoseContext = () => (gl.getContext().getExtension('WEBGL_lose_context') as { loseContext(): void; restoreContext(): void } | null);
      w.__rocketSceneCount = () => {
        let n = 0;
        scenes.flight.traverse(() => n++);
        return n;
      };
    }
  }, [gl, camera]);
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
