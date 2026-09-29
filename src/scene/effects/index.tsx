/**
 * Effects for the flight location: exhaust plumes (per nozzle, merged columns, gas-generator
 * exhaust, vacuum, hypergolic, solid and cold-gas jets), smoke tails and the exhaust trail left
 * in the air, the ground cloud from the flame trench, LOX venting, deluge water, RCS puffs and
 * entry plasma. Everything that tells the mission story is a pure function of mission time read
 * from `effects.source` (see input.ts); frame.decor drives flicker and turbulence only.
 *
 * Floating origin: all state is kept in frame I (double precision); objects are placed at
 * absolute - frame.origin every frame (priority 0).
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { frame } from '../frame';
import { FLAGS } from '../../config';
import { skyState } from '../space/skyState';
import { tierSpec } from '../quality';
import { siteFrameQuaternion, sitePosition } from '../../world/frames';
import { effects } from './input';
import type { PlasmaSource } from './input';
import { ParticleSystem } from './particles';
import { SpriteRenderer, type SpriteLighting } from './sprites';
import { PlumeSet } from './plumes';
import { PlasmaVolume, disposePlasmaShared } from './plasma';
import { disposeShared, type VolumeLight } from './volume';
import { SnapshotCache, type Snapshot } from './snapshot';
import { TRENCH_EXIT } from './pad';

export { effects } from './input';

/** Smooth 1-D value noise in [0, 1] (flicker). */
function noise1(x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const h = (n: number) => {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const u = f * f * (3 - 2 * f);
  return h(i) * (1 - u) + h(i + 1) * u;
}

const STEPS = { high: 18, medium: 13, low: 9 } as const;

export class EffectsSystem {
  readonly root = new THREE.Group();
  readonly particles: ParticleSystem;
  readonly sprites: SpriteRenderer;
  readonly plumes = new PlumeSet();
  private plasma: PlasmaVolume[] = [];
  private plasmaList: PlasmaSource[] = [];
  private now: Snapshot = { t: 0, emitters: [], clusters: [], pad: { venting: 0, deluge: 0, holddown: 0, arms: 0 } };
  private nowCache = new SnapshotCache(1);
  private budget: number;
  private flameLight = new THREE.PointLight(0xff9040, 0, 0, 2);
  private auxLight = new THREE.PointLight(0xff9040, 0, 0, 2);
  private vLight: VolumeLight = { sunDir: new THREE.Vector3(), sunCol: new THREE.Color(), amb: new THREE.Color() };
  private sLight: SpriteLighting = {
    sunDir: new THREE.Vector3(),
    sunCol: new THREE.Color(),
    sky: new THREE.Color(),
    ground: new THREE.Color(),
    up: new THREE.Vector3(),
    haze: new THREE.Color(),
    hazeDensity: 0,
    flames: [
      { pos: new THREE.Vector3(), col: new THREE.Color() },
      { pos: new THREE.Vector3(), col: new THREE.Color() },
    ],
  };
  private camFwd = new THREE.Vector3();
  private tv = new THREE.Vector3();
  private tq = new THREE.Quaternion();
  /** Diagnostics (sprites drawn, particles live, volumes). */
  stats = { particles: 0, sprites: 0, spawned: 0 };

  constructor() {
    this.budget = tierSpec().particles;
    this.particles = new ParticleSystem(this.budget);
    this.sprites = new SpriteRenderer(this.particles.capacity);
    this.root.name = 'effects';
    this.root.add(this.sprites.group, this.plumes.group, this.flameLight, this.auxLight);
    this.flameLight.castShadow = false;
    this.auxLight.castShadow = false;
    this.root.matrixAutoUpdate = true;
  }

  update(camera: THREE.Camera) {
    const src = effects.source;
    this.particles.setSource(src);
    this.nowCache.setSource(src);
    if (!src) {
      this.root.visible = false;
      return;
    }
    this.root.visible = true;
    const spec = tierSpec();
    if (spec.particles !== this.budget) {
      this.budget = spec.particles;
      this.particles.setBudget(this.budget);
      this.sprites.resize(this.particles.capacity);
    }
    const tier = spec.particles >= 1 ? 'high' : spec.particles >= 0.6 ? 'medium' : 'low';
    const t = frame.missionTime;
    const origin = frame.origin;
    const decor = frame.decor;
    camera.getWorldDirection(this.camFwd);

    // particles (stateless, from mission time)
    this.particles.update(t, effects.seekEpoch);

    // lighting shared by the volumes and the sprites
    const sunI = skyState.sunIntensity;
    const L = this.sLight;
    L.sunDir.copy(skyState.sunDir).normalize();
    L.sunCol.copy(skyState.sunColor).multiplyScalar(sunI);
    L.sky.copy(skyState.ambient).multiplyScalar(skyState.ambientIntensity);
    L.ground.copy(skyState.ground).multiplyScalar(skyState.ambientIntensity * 0.8);
    L.up.copy(frame.camUp);
    L.haze.copy(skyState.hazeColor).multiplyScalar(1.3);
    L.hazeDensity = skyState.hazeDensity;
    const V = this.vLight;
    V.sunDir.copy(L.sunDir);
    V.sunCol.copy(L.sunCol).multiplyScalar(1 / Math.PI);
    V.amb.copy(L.sky).lerp(L.ground, 0.35).multiplyScalar(1 / Math.PI);

    // plumes at the displayed time
    const now = this.nowCache.compute(t, this.now)!;
    const flick = (seed: number) => {
      const a = noise1(decor * 19 + seed * 131.7);
      const b = noise1(decor * 47 + seed * 57.3 + 9.1);
      let startAmp = 0;
      for (const e of now.emitters) if (e.sinceIgnition < 1.6 && e.throttle > 0.01) startAmp = Math.max(startAmp, 1 - Math.min(1, e.sinceIgnition / 1.6));
      const amp = 0.07 + 0.3 * startAmp;
      return Math.max(0.2, 1 + amp * ((a - 0.5) * 1.6 + (b - 0.5) * 0.8));
    };
    this.plumes.update(now.emitters, now.clusters, origin, V, decor, this.camFwd, STEPS[tier], flick);

    // flame lights: the dominant plume and the trench exit
    const f0 = this.plumes.lights[0];
    const f1 = this.plumes.lights[1];
    if (f1.intensity > 0) {
      siteFrameQuaternion(t, this.tq);
      sitePosition(t, 0, f1.pos).add(this.tv.set(TRENCH_EXIT.x, TRENCH_EXIT.y + 6, TRENCH_EXIT.z).applyQuaternion(this.tq));
    }
    this.flameLight.position.subVectors(f0.pos, origin);
    this.flameLight.color.copy(f0.col);
    this.flameLight.intensity = f0.intensity;
    const sf = L.flames;
    sf[0].pos.subVectors(f0.pos, origin);
    sf[0].col.copy(f0.col).multiplyScalar(f0.intensity);

    // entry plasma (the secondary light goes to the plasma when there is one)
    const pl = this.nowCache.plasmaAt(t, this.plasmaList);
    let auxI = f1.intensity;
    let auxPos = this.tv.subVectors(f1.pos, origin);
    let auxCol = f1.col;
    for (let i = 0; i < pl.length; i++) {
      const s = pl[i];
      let v = this.plasma[i];
      if (!v) {
        v = this.plasma[i] = new PlasmaVolume();
        this.root.add(v.mesh);
      }
      const rel = new THREE.Vector3().subVectors(s.pos, origin);
      v.place(s, rel, decor, this.camFwd);
      const I = Math.pow(Math.max(0, s.intensity), 1.3) * s.radius * s.radius * (v.booster ? 60 : 110);
      if (I > auxI) {
        auxI = I;
        auxPos = rel.addScaledVector(s.dir, s.radius * 0.4);
        auxCol = v.booster ? new THREE.Color(1.0, 0.55, 0.3) : new THREE.Color(1.0, 0.55, 0.45);
      }
    }
    for (let i = pl.length; i < this.plasma.length; i++) this.plasma[i].hide();
    this.auxLight.position.copy(auxPos);
    this.auxLight.color.copy(auxCol);
    this.auxLight.intensity = auxI;
    sf[1].pos.copy(auxPos);
    sf[1].col.copy(auxCol).multiplyScalar(auxI);

    // smoke, steam and spray sprites, layered around the plume
    const n = this.sprites.update(this.particles, origin, camera, this.plumes.splitDepth, L);
    this.stats.particles = this.particles.count;
    this.stats.sprites = n;
    this.stats.spawned = this.particles.spawned;
  }

  dispose() {
    this.sprites.dispose();
    this.plumes.dispose();
    for (const p of this.plasma) p.dispose();
    disposeShared();
    disposePlasmaShared();
  }
}

/** Plumes, smoke, steam, venting, RCS and entry plasma for the flight location. */
export function Effects() {
  const sys = useMemo(() => new EffectsSystem(), []);
  const camera = useThree((s) => s.camera);
  useEffect(() => () => sys.dispose(), [sys]);
  useFrame(() => {
    if (FLAGS.hooks) (window as unknown as Record<string, unknown>).__effects = sys;
    if (frame.location !== 'flight') return;
    sys.update(camera);
  }, 0);
  return <primitive object={sys.root} />;
}
