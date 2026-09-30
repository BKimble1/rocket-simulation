/**
 * Flight location: sky/Earth/space, the launch site, the vehicle's bodies posed from the
 * mission timeline, the station (when present) and the effects. Everything is positioned
 * relative to the floating origin each frame; everything that tells the story is a pure
 * function of frame.missionTime.
 */
import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, type ReactNode } from 'react';
import * as THREE from 'three';
import { SpaceWorld } from '../space';
import { LaunchSite } from '../environment';
import * as env from '../environment';
import { Effects } from '../effects';
import { effects, type Emitter, type EffectsSource, type PadState, type PlasmaSource } from '../effects/input';
import { buildVehicle } from '../vehicle/buildVehicle';
import { buildSpacecraft } from '../spacecraft/buildSpacecraft';
import type { VehicleModel, VehicleVisualState } from '../vehicle/types';
import type { SpacecraftModel } from '../spacecraft/types';
import { frame, BODY_IDS } from '../frame';
import { director } from '../../director/director';
import { chan, bodyAt, makeBodyState, channelAt, type BodyState } from '../../timeline/sample';
import type { ChannelId, MissionTimeline } from '../../timeline/types';
import { OUTLINES } from '../../timeline/missions/outline';
import type { BodyId, PartId } from '../../vehicle/parts';
import { EARTH_AXIS, OMEGA_EARTH, R_EARTH } from '../../world/frames';
import { atmosphere } from './atmosphere';
import { usePlayback } from '../../state/playback';
import { skyState } from '../space';

/** Scene-wide handle to the vehicle shown in flight (for focus framing and inspection). */
export const flightModels = {
  vehicle: null as VehicleModel | null,
  station: null as SpacecraftModel | null,
};

function Ready({ onReady }: { onReady: () => void }) {
  useEffect(() => onReady(), [onReady]);
  return null;
}

function markFlightReady() {
  director.ready.flight = true;
}

const OMEGA = EARTH_AXIS.clone().multiplyScalar(OMEGA_EARTH);

/**
 * Spacecraft attitude control fires in short pulses, not continuously: while an attitude
 * channel is active, each thruster fires for about 0.4 s every 2.2 s, staggered between
 * thrusters (a pure function of mission time, so seeking reproduces it).
 */
function pulse(t: number, i: number): boolean {
  const x = (((t * 0.45 + i * 0.618) % 1) + 1) % 1;
  return x < 0.18;
}

/** Mission times at which a throttle channel lights (0 → >0), for start transients. */
function ignitions(tl: MissionTimeline, id: ChannelId): number[] {
  const ch = tl.channels[id];
  const out: number[] = [];
  if (!ch) return out;
  for (let i = 1; i < ch.t.length; i++) if (ch.v[i - 1] <= 1e-4 && ch.v[i] > 1e-4) out.push(ch.t[i - 1]);
  return out;
}

function sinceIgnition(times: number[], t: number): number {
  let best = Infinity;
  for (const s of times) if (s <= t) best = Math.min(best, t - s);
  return best;
}

/** Build the effects source for a mission: pure functions of mission time. */
function makeEffectsSource(tl: MissionTimeline, v: VehicleModel): EffectsSource {
  const scratch: Partial<Record<BodyId, BodyState>> = {};
  const st = (id: BodyId, t: number): BodyState | null => {
    const tr = tl.bodies[id];
    if (!tr) return null;
    const s = (scratch[id] ??= makeBodyState());
    bodyAt(tr, t, s);
    return s.present ? s : null;
  };
  const ign: Partial<Record<ChannelId, number[]>> = {};
  const ignOf = (id: ChannelId) => (ign[id] ??= ignitions(tl, id));
  const sepT = tl.events.find((e) => e.id === 'stage-sep')?.t ?? Infinity;
  const tmp = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const atmo = { pressure: 0, density: 0, temperature: 0, soundSpeed: 0 };
  const pool: Emitter[] = [];
  let used = 0;
  const next = (): Emitter => {
    let e = pool[used];
    if (!e) {
      e = { id: '', kind: 'kerolox-sl', pos: new THREE.Vector3(), dir: new THREE.Vector3(), exitRadius: 0.5, throttle: 0, ambientPressure: 0, altitude: 0, airVel: new THREE.Vector3(), sinceIgnition: Infinity };
      pool[used] = e;
    }
    used++;
    e.ggExhaust = undefined;
    return e;
  };
  const fill = (e: Emitter, s: BodyState, local: THREE.Vector3, kind: Emitter['kind'], exitRadius: number, throttle: number, since: number, id: string, dirLocal = new THREE.Vector3(0, -1, 0)) => {
    e.id = id;
    e.kind = kind;
    e.pos.copy(local).applyQuaternion(s.quat).add(s.pos);
    e.dir.copy(dirLocal).applyQuaternion(s.quat).normalize();
    e.exitRadius = exitRadius;
    e.throttle = throttle;
    e.altitude = e.pos.length() - R_EARTH;
    e.ambientPressure = atmosphere(e.altitude, atmo).pressure;
    e.airVel.copy(s.vel).sub(tmp.crossVectors(OMEGA, s.pos));
    e.sinceIgnition = since;
  };
  const gg = new THREE.Vector3();
  return {
    emittersAt(t, out) {
      used = 0;
      out.length = 0;
      const b = st('booster', t);
      if (b) {
        const c = chan(tl, 's1.center.throttle', t);
        const o = chan(tl, 's1.outer.throttle', t);
        for (const n of v.anchors.s1Nozzles) {
          const th = n.centre ? c : o;
          if (th <= 1e-3) continue;
          // after separation the booster relights the centre plus two opposite outer engines
          if (!n.centre && t > sepT && !(n.id === 'e1' || n.id === 'e4')) continue;
          const e = next();
          fill(e, b, n.exit, 'kerolox-sl', n.exitRadius, th, sinceIgnition(ignOf(n.centre ? 's1.center.throttle' : 's1.outer.throttle'), t), `booster:${n.id}`);
          axis.set(n.exit.x, 0, n.exit.z);
          if (axis.lengthSq() < 1e-4) axis.set(1, 0, 0);
          axis.normalize();
          gg.copy(n.exit).addScaledVector(axis, n.exitRadius + 0.22).setY(n.exit.y + 0.45);
          e.ggExhaust = { pos: gg.clone().applyQuaternion(b.quat).add(b.pos), dir: e.dir.clone() };
          out.push(e);
        }
        const rcs = chan(tl, 's1.rcs', t);
        if (rcs > 0.05)
          for (const [i, p] of v.anchors.s1Rcs.entries()) {
            const e = next();
            fill(e, b, p, 'cold-gas', 0.05, rcs, 0, `booster:rcs${i}`, tmp.set(p.x, 0, p.z).normalize().clone());
            out.push(e);
          }
      }
      const u = st('upper', t);
      if (u) {
        const th = chan(tl, 's2.throttle', t);
        if (th > 1e-3) {
          const e = next();
          fill(e, u, v.anchors.s2Nozzle.exit, 'kerolox-vac', v.anchors.s2Nozzle.exitRadius, th, sinceIgnition(ignOf('s2.throttle'), t), 'upper:main');
          out.push(e);
        }
        const rcs = chan(tl, 's2.rcs', t);
        if (rcs > 0.05)
          for (const [i, p] of v.anchors.s2Rcs.entries()) {
            const e = next();
            fill(e, u, p, 'cold-gas', 0.04, rcs, 0, `upper:rcs${i}`);
            out.push(e);
          }
      }
      const sat = st('satellite', t);
      if (sat && v.anchors.satApogee) {
        const th = chan(tl, 'sat.apogee.throttle', t);
        if (th > 1e-3) {
          const e = next();
          fill(e, sat, v.anchors.satApogee.exit, 'hypergolic', v.anchors.satApogee.exitRadius, th, sinceIgnition(ignOf('sat.apogee.throttle'), t), 'sat:apogee');
          out.push(e);
        }
      }
      // attitude thrusters of the satellite (hydrazine: a faint, quick puff) and the service module
      if (sat) {
        const rcs = chan(tl, 'sat.rcs', t);
        if (rcs > 0.05)
          for (const [i, p] of v.anchors.satRcs.entries()) {
            if (!pulse(t, i)) continue;
            const e = next();
            fill(e, sat, p, 'cold-gas', 0.02, rcs, 0, `sat:rcs${i}`, tmp.set(p.x, 0, p.z).normalize().clone());
            out.push(e);
          }
      }
      const smR = st('service', t);
      if (smR) {
        const rcs = chan(tl, 'sm.rcs', t);
        if (rcs > 0.05)
          for (const [i, p] of v.anchors.smRcs.entries()) {
            if (!pulse(t, i)) continue;
            const e = next();
            fill(e, smR, p, 'hypergolic', 0.025, rcs, 0, `sm:rcs${i}`, tmp.set(p.x, 0, p.z).normalize().clone());
            out.push(e);
          }
      }
      const sm = st('service', t);
      if (sm && v.anchors.smEngine) {
        const th = chan(tl, 'sm.throttle', t);
        if (th > 1e-3) {
          const e = next();
          fill(e, sm, v.anchors.smEngine.exit, 'hypergolic', v.anchors.smEngine.exitRadius, th, sinceIgnition(ignOf('sm.throttle'), t), 'sm:main');
          out.push(e);
        }
      }
      const cap = st('capsule', t);
      if (cap) {
        const rcs = chan(tl, 'cap.rcs', t);
        if (rcs > 0.05)
          for (const [i, p] of v.anchors.capsuleRcs.entries()) {
            if (!pulse(t, i)) continue;
            const e = next();
            fill(e, cap, p, 'hypergolic', 0.03, rcs, 0, `cap:rcs${i}`, tmp.set(p.x, 0, p.z).normalize().clone());
            out.push(e);
          }
      }
      const les = st('les', t);
      if (les) {
        const th = chan(tl, 'les.motor', t);
        if (th > 1e-3)
          for (const [i, p] of v.anchors.lesNozzles.entries()) {
            const e = next();
            const outward = tmp.set(p.x, 0, p.z).normalize().multiplyScalar(0.42);
            fill(e, les, p, 'solid', 0.16, th, sinceIgnition(ignOf('les.motor'), t), `les:${i}`, new THREE.Vector3(outward.x, -1, outward.z).normalize());
            out.push(e);
          }
      }
      return out;
    },
    plasmaAt(t, out: PlasmaSource[]) {
      out.length = 0;
      const cap = st('capsule', t);
      const pl = chan(tl, 'cap.plasma', t);
      if (cap && pl > 0.01) {
        const dir = new THREE.Vector3().copy(cap.vel).sub(tmp.crossVectors(OMEGA, cap.pos)).normalize();
        const base = heatShieldCentre(v, cap);
        out.push({ id: 'capsule', pos: base, dir, radius: 1.95, intensity: pl });
      }
      const b = st('booster', t);
      const bg = chan(tl, 's1.entryGlow', t);
      if (b && bg > 0.01) {
        const dir = new THREE.Vector3().copy(b.vel).sub(tmp.crossVectors(OMEGA, b.pos)).normalize();
        out.push({ id: 'booster', pos: new THREE.Vector3(0, 0.5, 0).applyQuaternion(b.quat).add(b.pos), dir, radius: 1.85, intensity: bg });
      }
      return out;
    },
    padAt(t, out: PadState) {
      out.venting = chan(tl, 'pad.venting', t);
      out.deluge = chan(tl, 'pad.deluge', t);
      out.holddown = chan(tl, 'pad.holddown', t);
      out.arms = chan(tl, 'pad.arms', t);
      return out;
    },
    groundBlastStart: tl.events.find((e) => e.id === 'engine-start')?.t ?? null,
    groundBlastEnd: (tl.events.find((e) => e.id === 'tower-clear')?.t ?? 12) + 8,
  };
}

const hsBox = new THREE.Box3();
function heatShieldCentre(v: VehicleModel, cap: BodyState): THREE.Vector3 {
  const nodes = v.parts.get('heat-shield' as PartId);
  let y = 57.6;
  if (nodes?.length) {
    const cached = (v as unknown as { _hsY?: number })._hsY;
    if (cached !== undefined) y = cached;
    else {
      const body = v.bodies.capsule;
      hsBox.makeEmpty();
      if (body) {
        const saveP = body.position.clone();
        const saveQ = body.quaternion.clone();
        body.position.set(0, 0, 0);
        body.quaternion.identity();
        body.updateMatrixWorld(true);
        for (const n of nodes) hsBox.union(new THREE.Box3().setFromObject(n));
        body.position.copy(saveP);
        body.quaternion.copy(saveQ);
        body.updateMatrixWorld(true);
        if (!hsBox.isEmpty()) y = hsBox.min.y + 0.15;
      }
      (v as unknown as { _hsY?: number })._hsY = y;
    }
  }
  return new THREE.Vector3(0, y, 0).applyQuaternion(cap.quat).add(cap.pos);
}

const VS: VehicleVisualState = {
  legs: 0, fins: 0, finDeflect: 0, fairingOpen: 0, satArrays: 0, satAntenna: 0, smArrays: 0, capDrogue: 0, capMain: 0, capNoseCone: 0, capChar: 0,
  s1Lox: 1, s1Rp1: 1, s2Lox: 1, s2Rp1: 1, s1GimbalPitch: 0, s1GimbalYaw: 0, s2GimbalPitch: 0, frost: 0, entryScorch: 0,
};

/**
 * Docking floodlights, as real crew vehicles and stations carry for night-side approaches. Each
 * is mounted off the docking axis (on the axis they sit almost on top of each other at contact and
 * light only a few centimetres): one on the station a few metres beside the port, aimed down the
 * approach corridor at the arriving capsule, and one on the capsule's nose beside the docking
 * system, aimed up at the port. Intensities are in the scene's light units (candela, inverse-square
 * falloff), so at the working distances of the final approach they give about the irradiance of
 * sunlight. They fade in only when the two are within a few kilometres and out of sunlight (and are
 * only mounted on missions with a station, so other scenes pay nothing).
 */
function DockingLights({ vehicle, station }: { vehicle: VehicleModel; station: SpacecraftModel }) {
  const lights = useMemo(() => {
    const make = (angle: number) => {
      const l = new THREE.SpotLight('#fff3e2', 0, 60, angle, 0.5, 2);
      l.castShadow = false;
      return l;
    };
    return { cap: make(0.75), st: make(0.6) };
  }, []);
  useEffect(() => {
    const cap = vehicle.bodies.capsule;
    const cd = vehicle.anchors.capsuleDock;
    const st = station.bodies.station;
    const sd = station.anchors.dockPort;
    const added: THREE.Object3D[] = [];
    const side = (axis: THREE.Vector3) => {
      const v = new THREE.Vector3().crossVectors(axis, new THREE.Vector3(0, 0, 1));
      if (v.lengthSq() < 1e-6) v.set(1, 0, 0);
      return v.normalize();
    };
    if (cap && cd) {
      lights.cap.position.copy(cd.pos).addScaledVector(cd.axis, -0.4).addScaledVector(side(cd.axis), 1.1);
      lights.cap.target.position.copy(cd.pos).addScaledVector(cd.axis, 8);
      cap.add(lights.cap, lights.cap.target);
      added.push(lights.cap, lights.cap.target);
    }
    if (st && sd) {
      lights.st.position.copy(sd.pos).addScaledVector(sd.axis, 1).addScaledVector(side(sd.axis), 3.5);
      lights.st.target.position.copy(sd.pos).addScaledVector(sd.axis, 9);
      st.add(lights.st, lights.st.target);
      added.push(lights.st, lights.st.target);
    }
    return () => added.forEach((o) => o.removeFromParent());
  }, [vehicle, station, lights]);
  useFrame(() => {
    const a = frame.bodies.capsule;
    const b = frame.bodies.station;
    const near = a.present && b.present ? a.pos.distanceTo(b.pos) < 3000 : false;
    const dark = 1 - Math.min(1, Math.max(0, skyState.sunIntensity / 0.6));
    const k = near ? dark : 0;
    lights.cap.intensity = 45 * k;
    lights.st.intensity = 160 * k;
  }, 0);
  return null;
}

export function FlightWorld({ children }: { children?: ReactNode }) {
  // re-render when the mission changes (frame.tl is not React state)
  const missionId = usePlayback((s) => s.mission);
  const tl = missionId ? frame.tl : null;
  const outline = tl ? OUTLINES[tl.id] : null;
  const vehicle = useMemo(() => (outline ? buildVehicle({ payload: outline.payload, recovery: outline.recovery, stack: outline.stack, detail: 'flight' }) : null), [outline]);
  const station = useMemo(() => (tl?.bodies.station ? buildSpacecraft('station', 'flight', 0) : null), [tl]);
  useEffect(() => {
    flightModels.vehicle = vehicle;
    if (vehicle) {
      // the modules decide which meshes cast shadows (small or hidden parts do not); receive on all
      vehicle.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.receiveShadow = true;
      });
    }
    if (tl && vehicle) effects.source = makeEffectsSource(tl, vehicle);
    effects.seekEpoch++;
    return () => {
      vehicle?.dispose();
      if (effects.source) effects.source = null;
    };
  }, [vehicle, tl]);
  useEffect(() => {
    flightModels.station = station;
    return () => station?.dispose();
  }, [station]);

  const liftoff = tl?.events.find((e) => e.id === 'liftoff')?.t ?? 0;
  const entryStart = tl?.events.find((e) => e.id === 'entry-start')?.t ?? Infinity;
  useFrame(() => {
    const t = frame.missionTime;
    const siteState = (env as unknown as { siteState?: Record<string, number | string> }).siteState;
    if (tl && siteState) {
      siteState.holddown = chan(tl, 'pad.holddown', t);
      siteState.arms = chan(tl, 'pad.arms', t);
      siteState.deluge = chan(tl, 'pad.deluge', t);
      siteState.config = outline?.payload === 'capsule' ? 'capsule' : 'satellite';
    }
    if (!tl || !vehicle) return;
    for (const id of BODY_IDS) {
      const g = id === 'station' ? station?.bodies.station : vehicle.bodies[id];
      if (!g) continue;
      const s = frame.bodies[id];
      g.visible = s.present;
      if (!s.present) continue;
      g.position.set(s.pos.x - frame.origin.x, s.pos.y - frame.origin.y, s.pos.z - frame.origin.z);
      g.quaternion.copy(s.quat);
    }
    const c = (id: ChannelId, d = 0) => channelAt(tl.channels[id], t, d);
    VS.legs = c('s1.legs');
    VS.fins = c('s1.fins');
    VS.finDeflect = c('s1.finDeflect');
    VS.fairingOpen = c('fairing.open');
    VS.satArrays = c('sat.arrays');
    VS.satAntenna = c('sat.antenna');
    VS.smArrays = c('sm.arrays');
    VS.capDrogue = c('cap.drogue');
    VS.capMain = c('cap.main');
    VS.capNoseCone = c('cap.noseCone');
    VS.capChar = c('cap.char');
    VS.s1Lox = c('s1.lox', 1);
    VS.s1Rp1 = c('s1.rp1', 1);
    VS.s2Lox = c('s2.lox', 1);
    VS.s2Rp1 = c('s2.rp1', 1);
    VS.s1GimbalPitch = c('s1.gimbalPitch');
    VS.s1GimbalYaw = c('s1.gimbalYaw');
    VS.s2GimbalPitch = c('s2.gimbalPitch');
    VS.s1Throttle = Math.max(c('s1.center.throttle'), c('s1.outer.throttle'));
    VS.s2Throttle = c('s2.throttle');
    VS.frost = t < liftoff ? 1 : Math.max(0, 1 - (t - liftoff) / 70);
    VS.entryScorch = t < entryStart ? 0 : Math.min(1, (t - entryStart) / 25);
    vehicle.setState(VS);
    vehicle.animate(frame.decor, null, 0);
  }, 0);

  return (
    <>
      <Suspense fallback={null}>
        <SpaceWorld />
        <LaunchSite />
        <Effects />
        <Ready onReady={markFlightReady} />
        {vehicle && station && <DockingLights vehicle={vehicle} station={station} />}
      </Suspense>
      {vehicle && <primitive object={vehicle.root} />}
      {station && <primitive object={station.bodies.station!} />}
      {children}
    </>
  );
}
