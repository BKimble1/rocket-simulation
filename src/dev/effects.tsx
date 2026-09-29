/**
 * Dev harness for the effects module: a synthetic EffectsSource (stand-in K-1 on the pad that
 * ignites at T-3 s, lifts off at T-0 and flies an illustrative gravity turn; or a single-subject
 * scenario) with <SpaceWorld/>, <LaunchSite/>, a stand-in vehicle and <Effects/>.
 *
 * URL parameters (besides the DevStage camera `cam=e,n,u,heading,pitch,fov`):
 *   t=<s>            mission time
 *   alt=<m>          vehicle at this altitude at time t, climbing through it (plume tests)
 *   throttle=<0..1>  override engine throttle (or plasma intensity)
 *   kind=<k>         scenario: kerolox-sl (default ascent), kerolox-vac, hypergolic, solid,
 *                    cold-gas, mono, entry, booster-entry
 *   vcam=d,az,el,fov[,look]  camera orbiting the stand-in (az from north toward east, deg;
 *                    el up from the horizon; look = metres along the vehicle axis to aim at)
 *   play=1&rate=<x>&until=<s>  play mission time from t (stops at `until`)
 *   decor=<s>        freeze the decorative clock (flicker) for pixel comparisons
 *   ground=0|1       stand-in ground (default: only while the launch site module draws nothing)
 *   hud=1            small text overlay (time, altitude, particle counts)
 *   only=core|column|gg|vac        draw only that kind of plume volume
 *   vdbg=1|2|3       volume debug: bounds, raw emission, opacity
 * At run time (tests, captures): window.__fxDev.vcam = [d, az, el, fov, look] moves the orbit
 * camera, window.__fxDev.set({ scenario, alt, throttle, tRef }) swaps the synthetic source, and
 * window.__rocketFrame.missionTime sets the time.
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { SpaceWorld } from '../scene/space';
import { LaunchSite } from '../scene/environment';
import { Effects } from '../scene/effects';
import { effects } from '../scene/effects/input';
import { SyntheticSource, scenarioFor, type VehiclePose } from '../scene/effects/synthetic';
import { frame } from '../scene/frame';
import { director } from '../director/director';
import { M } from '../scene/materials';
import { E1, E1V, S1_ENGINE_LAYOUT, STATIONS, BODY_RADIUS, FAIRING, CAPSULE } from '../vehicle/spec';
import { PAD } from '../world/site';
import { siteFrameQuaternion, sitePosition } from '../world/frames';
import { TRENCH_DIR } from '../scene/effects/pad';
import { plumeDebug } from '../scene/effects/plumes';
import { volumeDebug } from '../scene/effects/volume';

const q = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
const num = (k: string): number | null => (q.has(k) && q.get(k) !== '' ? Number(q.get(k)) : null);

const OPTS = {
  scenario: scenarioFor(q.get('kind')),
  alt: num('alt'),
  throttle: num('throttle'),
  // held scenarios pass their nominal point at the displayed time
  tRef: num('t') ?? 0,
};
const PLAY = q.get('play') === '1';
const RATE = num('rate') ?? 1;
const UNTIL = num('until');
const DECOR = num('decor');
/** Mutable at run time through window.__fxDev (hooks): { vcam, set(options) }. */
const devState = {
  vcam: q.get('vcam')?.split(',').map(Number) ?? (null as number[] | null),
  set: null as null | ((o: Partial<typeof OPTS>) => void),
  plume: plumeDebug,
  volume: volumeDebug,
};
if (typeof window !== 'undefined') (window as unknown as Record<string, unknown>).__fxDev = devState;
const GROUND = q.get('ground');
const HUD = q.get('hud') === '1';
plumeDebug.only = q.get('only');
volumeDebug.mode = Number(q.get('vdbg') ?? 0);

// ───────────────────────────── stand-in vehicle ─────────────────────────────

function lathe(profile: [number, number][], seg = 64): THREE.LatheGeometry {
  return new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    seg,
  );
}

function bell(exitR: number, throatR: number, len: number, y0: number): THREE.LatheGeometry {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 16; i++) {
    const u = i / 16;
    pts.push([throatR + (exitR - throatR) * Math.pow(u, 0.6), y0 + len * (1 - u)]);
  }
  return lathe(pts.reverse(), 48);
}

function StandIn({ src }: { src: SyntheticSource }) {
  const ref = useRef<THREE.Group>(null);
  const pose = useMemo<VehiclePose>(() => ({ pos: new THREE.Vector3(), quat: new THREE.Quaternion(), shape: 'stack', altitude: 0 }), []);
  const shape = useMemo(() => src.vehicleAt(0, { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), shape: 'stack', altitude: 0 }).shape, [src]);
  const parts = useMemo(() => {
    const white = M('paintWhite');
    const graphite = M('paintGraphite');
    const metal = M('inconel');
    const dark = M('blackAnodized');
    const items: { geo: THREE.BufferGeometry; mat: THREE.Material }[] = [];
    const cyl = (r0: number, r1: number, y0: number, y1: number, mat: THREE.Material, seg = 96) => {
      const g = new THREE.CylinderGeometry(r1, r0, y1 - y0, seg, 1, false);
      g.translate(0, (y0 + y1) / 2, 0);
      items.push({ geo: g, mat });
    };
    const booster = () => {
      cyl(BODY_RADIUS, BODY_RADIUS, STATIONS.s1HeatShield, STATIONS.s1ForwardSkirtTop, white);
      cyl(BODY_RADIUS * 1.001, BODY_RADIUS * 1.001, STATIONS.s1ForwardSkirtTop, STATIONS.interstageTop, graphite);
      cyl(BODY_RADIUS * 0.98, BODY_RADIUS * 0.98, STATIONS.s1HeatShield - 0.05, STATIONS.s1HeatShield + 0.02, dark);
      for (const e of S1_ENGINE_LAYOUT) {
        const g = bell(E1.exitDiameter / 2, E1.throatDiameter / 2, STATIONS.s1HeatShield - 0.1, 0.1);
        g.translate(e.x, 0, e.z);
        items.push({ geo: g, mat: metal });
      }
    };
    const upper = () => {
      cyl(BODY_RADIUS, BODY_RADIUS, STATIONS.interstageTop, STATIONS.s2ForwardSkirtTop, white);
      cyl(FAIRING.diameter / 2, FAIRING.diameter / 2, STATIONS.fairingBoatTailTop, STATIONS.fairingCylinderTop, white);
      cyl(BODY_RADIUS, FAIRING.diameter / 2, STATIONS.fairingBase, STATIONS.fairingBoatTailTop, white);
      const ogive: [number, number][] = [];
      for (let i = 0; i <= 20; i++) {
        const u = i / 20;
        ogive.push([(FAIRING.diameter / 2) * Math.sqrt(Math.max(0, 1 - u * u)) * (1 - 0.02 * u), STATIONS.fairingCylinderTop + u * (STATIONS.fairingTip - STATIONS.fairingCylinderTop)]);
      }
      items.push({ geo: lathe(ogive, 96), mat: white });
    };
    /** Capsule with its heat-shield face (the most forward point) at model height faceY. */
    const capsule = (faceY: number) => {
      const R = CAPSULE.baseDiameter / 2;
      const Rn = CAPSULE.heatShieldRadius;
      const th = Math.asin(R / Rn);
      const cap = new THREE.SphereGeometry(Rn, 64, 10, 0, Math.PI * 2, Math.PI - th, th);
      cap.translate(0, faceY + Rn, 0);
      items.push({ geo: cap, mat: M('ablatorChar') });
      const rim = faceY + Rn - Math.sqrt(Rn * Rn - R * R);
      cyl(R, R * 0.36, rim, rim + 3.1, white, 64);
    };
    if (shape === 'stack') {
      booster();
      cyl(BODY_RADIUS, BODY_RADIUS, STATIONS.interstageTop, STATIONS.s2ForwardSkirtTop, white);
      upper();
    } else if (shape === 'booster') {
      booster();
    } else if (shape === 'upper') {
      upper();
      items.push({ geo: bell(E1V.exitDiameter / 2, E1V.throatDiameter / 2, STATIONS.s2Gimbal - STATIONS.s2NozzleExit - 0.8, STATIONS.s2NozzleExit), mat: M('niobium') });
    } else if (shape === 'service') {
      cyl(BODY_RADIUS, BODY_RADIUS, 53.9, 57.1, M('mliSilver'));
      items.push({ geo: bell(0.46, 0.12, 1.6, 52.3), mat: M('niobium') });
      capsule(57.2);
    } else if (shape === 'capsule') {
      capsule(56.54);
    } else if (shape === 'les') {
      capsule(57.2);
      cyl(0.35, 0.35, 60.2, 67, white, 32);
      cyl(0.5, 0.5, 62, 66, graphite, 32);
    } else if (shape === 'satellite') {
      const b = new THREE.BoxGeometry(2.2, 3, 2.2);
      b.translate(0, 56.5, 0);
      items.push({ geo: b, mat: M('mliGold') });
      const p = new THREE.BoxGeometry(9, 0.05, 2);
      p.translate(0, 57, 0);
      items.push({ geo: p, mat: M('solarCell') });
    }
    return items;
  }, [shape]);
  useEffect(() => () => parts.forEach((p) => p.geo.dispose()), [parts]);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    src.vehicleAt(frame.missionTime, pose);
    g.position.subVectors(pose.pos, frame.origin);
    g.quaternion.copy(pose.quat);
  }, 0);
  return (
    <group ref={ref}>
      {parts.map((p, i) => (
        <mesh key={i} geometry={p.geo} material={p.mat} castShadow receiveShadow />
      ))}
    </group>
  );
}

// ───────────────────────────── stand-in ground ─────────────────────────────

function StandInGround({ siteRef }: { siteRef: React.RefObject<THREE.Group | null> }) {
  const ref = useRef<THREE.Group>(null);
  const q1 = useMemo(() => new THREE.Quaternion(), []);
  const geos = useMemo(() => {
    const ground = new THREE.CircleGeometry(6000, 96);
    ground.rotateX(-Math.PI / 2);
    const pad = new THREE.CylinderGeometry(70, 76, 2, 64);
    pad.translate(0, 1, 0);
    const mount = new THREE.BoxGeometry(16, PAD.deckHeight - 2, 16);
    mount.translate(0, 2 + (PAD.deckHeight - 2) / 2, 0);
    const trench = new THREE.BoxGeometry(12, 1.2, 62);
    trench.translate(0, 0.1, -31);
    trench.rotateY(-Math.atan2(TRENCH_DIR.x, -TRENCH_DIR.z));
    const tower = new THREE.BoxGeometry(8, PAD.tower.height, 8);
    tower.translate(PAD.tower.x - 1.5, PAD.tower.height / 2, PAD.tower.z);
    return { ground, pad, mount, trench, tower };
  }, []);
  const mats = useMemo(
    () => ({
      grass: new THREE.MeshStandardMaterial({ color: '#6f7a4e', roughness: 0.95 }),
      concrete: M('concrete'),
      steel: M('steelPainted'),
      dark: new THREE.MeshStandardMaterial({ color: '#2b2a28', roughness: 0.9 }),
    }),
    [],
  );
  useEffect(
    () => () => {
      Object.values(geos).forEach((g) => g.dispose());
      mats.grass.dispose();
      mats.dark.dispose();
    },
    [geos, mats],
  );
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const site = siteRef.current;
    const siteDraws = !!site && site.children.length > 0;
    g.visible = GROUND === '1' || (GROUND !== '0' && !siteDraws);
    const t = frame.missionTime;
    sitePosition(t, 0, g.position).sub(frame.origin);
    g.quaternion.copy(siteFrameQuaternion(t, q1));
  }, 0);
  return (
    <group ref={ref}>
      <mesh geometry={geos.ground} material={mats.grass} position-y={-0.3} receiveShadow />
      <mesh geometry={geos.pad} material={mats.concrete} position-y={-0.3} receiveShadow />
      <mesh geometry={geos.mount} material={mats.concrete} castShadow receiveShadow />
      <mesh geometry={geos.trench} material={mats.dark} />
      <mesh geometry={geos.tower} material={mats.steel} castShadow />
    </group>
  );
}

// ───────────────────────────── camera, clock, HUD ─────────────────────────────

function Controls({ src, hud }: { src: SyntheticSource; hud: HTMLDivElement | null }) {
  const pose = useMemo<VehiclePose>(() => ({ pos: new THREE.Vector3(), quat: new THREE.Quaternion(), shape: 'stack', altitude: 0 }), []);
  const tmp = useMemo(() => ({ up: new THREE.Vector3(), east: new THREE.Vector3(), north: new THREE.Vector3(), q: new THREE.Quaternion(), axis: new THREE.Vector3() }), []);
  // advance mission time before the dev camera and the sampling
  useFrame(() => {
    if (!PLAY) return;
    const next = frame.missionTime + frame.dt * RATE;
    frame.missionTime = UNTIL !== null ? Math.min(UNTIL, next) : next;
  }, -35);
  useFrame(() => {
    if (DECOR !== null) frame.decor = DECOR;
    if (!devState.vcam) return;
    const [d, az, el, fov, look = 0] = devState.vcam;
    const t = frame.missionTime;
    src.vehicleAt(t, pose);
    const qs = siteFrameQuaternion(t, tmp.q);
    tmp.up.set(0, 1, 0).applyQuaternion(qs);
    tmp.east.set(1, 0, 0).applyQuaternion(qs);
    tmp.north.set(0, 0, -1).applyQuaternion(qs);
    tmp.axis.set(0, 1, 0).applyQuaternion(pose.quat);
    const p = director.flightPose;
    const a = (az * Math.PI) / 180;
    const e = (el * Math.PI) / 180;
    p.target.copy(pose.pos).addScaledVector(tmp.axis, look);
    p.pos
      .copy(p.target)
      .addScaledVector(tmp.north, -Math.cos(a) * Math.cos(e) * d)
      .addScaledVector(tmp.east, -Math.sin(a) * Math.cos(e) * d)
      .addScaledVector(tmp.up, Math.sin(e) * d);
    p.up.copy(tmp.up);
    p.fov = fov || 40;
  }, -29);
  useFrame(() => {
    if (!hud) return;
    if (frame.n % 10) return;
    src.vehicleAt(frame.missionTime, pose);
    const w = window as unknown as { __effects?: { stats: Record<string, number> } };
    const s = w.__effects?.stats;
    hud.textContent = `T${frame.missionTime >= 0 ? '+' : ''}${frame.missionTime.toFixed(2)} s   vehicle ${(pose.altitude / 1000).toFixed(2)} km   camera ${(frame.camAlt / 1000).toFixed(2)} km   particles ${s?.particles ?? 0}  sprites ${s?.sprites ?? 0}`;
  }, 1);
  return null;
}

export default function Dev() {
  const [src, setSrc] = useState(() => new SyntheticSource(OPTS));
  useEffect(() => {
    devState.set = (o) => setSrc(new SyntheticSource({ ...OPTS, ...o }));
    return () => {
      devState.set = null;
    };
  }, []);
  const siteRef = useRef<THREE.Group>(null);
  const [hud] = useState<HTMLDivElement | null>(() => {
    if (!HUD || typeof document === 'undefined') return null;
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:12px;bottom:10px;font:12px/1.4 Inter,system-ui,sans-serif;color:#fff;background:rgba(0,0,0,.45);padding:4px 8px;border-radius:4px;z-index:10;pointer-events:none';
    document.body.appendChild(el);
    return el;
  });
  useEffect(() => {
    effects.source = src;
    effects.seekEpoch++;
    return () => {
      if (effects.source === src) effects.source = null;
      hud?.remove();
    };
  }, [src, hud]);
  return (
    <>
      <SpaceWorld />
      <group ref={siteRef}>
        <LaunchSite />
      </group>
      <StandInGround siteRef={siteRef} />
      <StandIn src={src} />
      <Effects />
      <Controls src={src} hud={hud} />
    </>
  );
}
