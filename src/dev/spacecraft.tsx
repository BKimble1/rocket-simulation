/**
 * Dev harness for the spacecraft module: ?dev=spacecraft
 *
 *   kind=leoSat|gtoSat|lunarProbe|capsule|researchCapsule|station   detail=hangar|flight
 *   arrays= antenna= smarrays= drogue= main= nose= char= (0..1)   cut=0..1
 *   demo=spacecraft-ops|capsule-return|heat-shield-stack   p=0..1 (omit to loop over 12 s)
 *   mount=<model-frame y of the payload interface> (default 0)   labels=1   floor=0
 *   rx=<deg> turns the model about X through its centre (rx=180 shows a heat shield or engine)
 * Camera: the usual hangar parameters (az, el, dist, tx, ty, tz, fov); sensible defaults per kind.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildSpacecraft } from '../scene/spacecraft/buildSpacecraft';
import type { SpacecraftKind } from '../scene/spacecraft/types';
import { scenes } from '../scene/Stage';
import { frame } from '../scene/frame';
import { director } from '../director/director';

const q = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
const num = (k: string, d: number) => (q.has(k) && q.get(k) !== '' && Number.isFinite(Number(q.get(k))) ? Number(q.get(k)) : d);
const KINDS: SpacecraftKind[] = ['leoSat', 'gtoSat', 'lunarProbe', 'capsule', 'researchCapsule', 'station'];

function labelSprite(text: string): THREE.Sprite {
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  const font = '600 30px Inter, Arial, sans-serif';
  g.font = font;
  const w = Math.ceil(g.measureText(text).width) + 28;
  c.width = w;
  c.height = 48;
  g.font = font;
  g.fillStyle = 'rgba(18,20,24,0.82)';
  g.fillRect(0, 0, w, 48);
  g.fillStyle = '#6a5af9';
  g.fillRect(0, 0, 5, 48);
  g.fillStyle = '#f3f2ee';
  g.textBaseline = 'middle';
  g.fillText(text, 16, 25);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.renderOrder = 10;
  s.userData.aspect = w / 48;
  return s;
}

export default function Dev() {
  const { gl } = useThree();
  const kind = (KINDS.includes(q.get('kind') as SpacecraftKind) ? q.get('kind') : 'leoSat') as SpacecraftKind;
  const detail = q.get('detail') === 'flight' ? 'flight' : 'hangar';
  const mount = num('mount', 0);
  const demo = q.get('demo');
  // one memo builds everything (StrictMode may call it twice: each call is self-contained)
  const { model, root, bounds } = useMemo(() => {
    const model = buildSpacecraft(kind, detail, mount);
    const root = new THREE.Group();
    for (const g of Object.values(model.bodies)) if (g) root.add(g);
    model.setState({});
    root.updateMatrixWorld(true);
    // framing bounds over what is visible (packed chutes, section caps and interiors are hidden)
    const bounds = new THREE.Box3();
    root.traverseVisible((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.computeBoundingBox();
      bounds.union(m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld));
    });
    // optional turn about X through the centre (the framing stays centred)
    const rx = num('rx', 0);
    if (rx) {
      const pivot = new THREE.Group();
      const c = bounds.getCenter(new THREE.Vector3());
      pivot.position.copy(c);
      pivot.rotation.x = rx * (Math.PI / 180);
      root.position.copy(c).negate();
      pivot.add(root);
      return { model, root: pivot, bounds };
    }
    return { model, root, bounds };
  }, [kind, detail, mount]);
  // published from an effect: StrictMode may build (and discard) a second model in the memo
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__spacecraft = { model, root, bounds };
  }, [model, root, bounds]);

  // studio lighting: neutral room environment, a warm key with shadows, cool fill from the sky
  const key = useMemo(() => {
    const l = new THREE.DirectionalLight('#fff6ea', 2.6);
    const c = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3()).length();
    l.position.copy(c).add(new THREE.Vector3(0.55, 0.75, 0.6).multiplyScalar(size + 10));
    l.target.position.copy(c);
    l.castShadow = true;
    l.shadow.mapSize.set(2048, 2048);
    const e = Math.max(4, size * 0.6);
    const cam = l.shadow.camera;
    cam.left = cam.bottom = -e;
    cam.right = cam.top = e;
    cam.near = 0.5;
    cam.far = size * 3 + 40;
    l.shadow.bias = -0.0004;
    l.shadow.normalBias = 0.02;
    return l;
  }, [bounds]);

  useEffect(() => {
    const scene = scenes.hangar;
    const pm = new THREE.PMREMGenerator(gl);
    const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    const prevEnv = scene.environment;
    const prevBg = scene.background;
    scene.environment = env;
    scene.environmentIntensity = 0.75;
    scene.background = new THREE.Color(kind === 'station' ? '#0e1116' : '#2c3037');
    return () => {
      scene.environment = prevEnv;
      scene.background = prevBg;
      env.dispose();
      pm.dispose();
    };
  }, [gl, kind]);

  useEffect(() => () => model.dispose(), [model]);

  // visual state from the URL
  useEffect(() => {
    model.setState({
      satArrays: num('arrays', 0),
      satAntenna: num('antenna', 0),
      smArrays: num('smarrays', num('arrays', 0)),
      capDrogue: num('drogue', 0),
      capMain: num('main', 0),
      capNoseCone: num('nose', 0),
      capChar: num('char', 0),
    });
    model.setCut(num('cut', 0));
  }, [model]);

  // labels for the heat-shield close-up
  const labels = useMemo(() => {
    const list = (model.bodies.capsule?.userData.labels ?? []) as { text: string; anchor: THREE.Object3D }[];
    const show = q.get('labels') === '1' || demo === 'heat-shield-stack';
    if (!show) return [];
    // each label has a leader line from its anchor on the layer's cut face to the label
    return list.map((l) => {
      const pos = new Float32Array(6);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const leader = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#f3f2ee', depthTest: false, transparent: true, opacity: 0.85 }));
      leader.renderOrder = 10;
      leader.frustumCulled = false;
      return { ...l, sprite: labelSprite(l.text), leader, pos };
    });
  }, [model, demo]);

  // the framing (URL or per-kind default) is held until the viewer orbits or zooms, so a later
  // hangar reset elsewhere in the app does not move the dev camera away
  const first = useRef(true);
  const userMoved = useRef(false);
  const right = useMemo(() => new THREE.Vector3(), []);
  const anchorPos = useMemo(() => new THREE.Vector3(), []);
  const shot = useMemo(() => {
    const c = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    return {
      dist: q.has('dist') ? num('dist', 10) : Math.max(4, Math.max(size.y, size.x, size.z) * (kind === 'station' ? 1.35 : 2.1)),
      target: new THREE.Vector3(num('tx', 0), q.has('ty') ? num('ty', 0) : c.y, num('tz', 0)),
      az: num('az', 35),
      el: num('el', kind === 'station' ? -18 : 10),
      fov: num('fov', 32),
    };
  }, [bounds, kind]);
  useFrame(() => {
    const inp = director.input;
    if (inp.dx || inp.dy || inp.zoom) userMoved.current = true;
    if (!userMoved.current) {
      const g = director.hangarGoal;
      Object.assign(g, { dist: shot.dist, az: shot.az, el: shot.el, fov: shot.fov });
      g.target.copy(shot.target);
      director.hangarMinDist = 0.5;
      if (first.current) Object.assign(director.hangarShown, { ...g, target: g.target.clone() });
    }
    first.current = false;
    if (demo) {
      const p = q.has('p') ? num('p', 0) : (frame.decor % 12) / 12;
      model.animate(frame.decor, demo, p);
    }
    if (labels.length) {
      const cam = frame.camQuat;
      right.set(1, 0, 0).applyQuaternion(cam);
      labels.forEach((l, i) => {
        l.anchor.getWorldPosition(anchorPos);
        const h = 0.07;
        const w = h * (l.sprite.userData.aspect as number);
        l.sprite.scale.set(w, h, 1);
        l.sprite.position.copy(anchorPos).addScaledVector(right, 0.55 + w / 2).y += (i - 1.5) * 0.02;
        // leader: anchor to the label's left edge
        anchorPos.toArray(l.pos, 0);
        l.pos[3] = l.sprite.position.x - right.x * (w / 2);
        l.pos[4] = l.sprite.position.y - right.y * (w / 2);
        l.pos[5] = l.sprite.position.z - right.z * (w / 2);
        l.leader.geometry.attributes.position.needsUpdate = true;
      });
    }
  });

  const floorY = bounds.min.y - 0.02;
  return (
    <>
      <hemisphereLight args={['#dfe7f2', '#5a554c', 0.55]} />
      <primitive object={key} />
      <primitive object={key.target} />
      <directionalLight position={[-30, 12, -25]} intensity={0.5} color="#b8c8ff" />
      <primitive object={root} />
      {labels.map((l) => (
        <primitive key={l.text} object={l.sprite} />
      ))}
      {labels.map((l) => (
        <primitive key={`leader:${l.text}`} object={l.leader} />
      ))}
      {kind !== 'station' && q.get('floor') !== '0' && (
        <mesh rotation-x={-Math.PI / 2} position-y={floorY} receiveShadow>
          <circleGeometry args={[200, 96]} />
          <meshStandardMaterial color="#5d6168" roughness={0.85} metalness={0} />
        </mesh>
      )}
    </>
  );
}
