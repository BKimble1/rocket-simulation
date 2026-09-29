/**
 * Dev harness for the space module: ?dev=space
 *
 *   t=<s>                  mission time (DevStage)
 *   cam=e,n,u,hdg,pitch,fov camera in pad-local ENU metres (DevStage)
 *   moon=d,az,el           put the camera d metres from the Moon's centre (az/el in degrees,
 *                          around the Earth-Moon line) looking at the Moon
 *   earth=1                look at the Earth's centre from the camera position, north up
 *   ll=lat,lon,alt         put the camera above a geographic point (deg, deg, m) at time t,
 *                          looking at the Earth's centre, north up (seam and orientation checks)
 *   subj=<m>               put the focus subject this far along the view (default 100 m)
 *   rocket=1               a 3.7 m x 60 m white stand-in cylinder, upright at the subject (to judge
 *                          cloud occlusion as it climbs through the layer)
 *   probe=1                lighting probes 100 m ahead: white and grey diffuse spheres, a mirror
 *                          sphere, brushed metal, and a 1:10 stand-in vehicle cylinder
 *   hole=1                 tint the globe inside the local-terrain disk
 *   clouds=0               hide the cloud layer
 *   exp=<x>                force the exposure (disables automatic exposure)
 *   debug=textures         show the generated cloud noise slices and the weather coverage map
 *
 * window.__spaceBench(n) returns the average cost (ms) of each space pass at the current view.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { SpaceWorld } from '../scene/space';
import { skyState } from '../scene/space/skyState';
import { frame } from '../scene/frame';
import { director } from '../director/director';
import { stageHooks } from '../scene/Stage';
import { EARTH_AXIS, moonPosition, R_MOON, surfacePoint } from '../world/frames';
import { perf } from '../scene/quality';
import { spaceAssets } from '../scene/space/assets';

const q = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');

function CameraOverrides() {
  useEffect(() => {
    const moonArg = q.get('moon');
    const llArg = q.get('ll');
    const lookEarth = q.get('earth') === '1' || !!llArg;
    const subj = q.has('subj') ? Number(q.get('subj')) : 0;
    if (!moonArg && !lookEarth && !subj) return;
    const base = stageHooks.tick;
    const m = new THREE.Vector3();
    const toEarth = new THREE.Vector3();
    const side = new THREE.Vector3();
    const up = new THREE.Vector3();
    stageHooks.tick = (dt) => {
      base?.(dt);
      const p = director.flightPose;
      if (subj > 0) p.target.sub(p.pos).setLength(subj).add(p.pos);
      if (moonArg) {
        const [d, az, el] = moonArg.split(',').map(Number);
        moonPosition(frame.missionTime, frame.tl?.moonPhase0 ?? 0, m);
        toEarth.copy(m).negate().normalize();
        up.set(0, 0, -1); // lunar orbit normal
        side.crossVectors(toEarth, up).normalize();
        const a = THREE.MathUtils.degToRad(az || 0);
        const e = THREE.MathUtils.degToRad(el || 0);
        const dir = toEarth.clone().multiplyScalar(Math.cos(a) * Math.cos(e)).addScaledVector(side, Math.sin(a) * Math.cos(e)).addScaledVector(up, Math.sin(e));
        p.pos.copy(m).addScaledVector(dir, d || R_MOON * 4);
        p.target.copy(m);
        p.up.copy(up);
      } else if (lookEarth) {
        if (llArg) {
          const [lat, lon, alt] = llArg.split(',').map(Number);
          surfacePoint(lat || 0, lon || 0, alt || 2e7, frame.missionTime, p.pos);
        }
        // north up: the Earth's axis (or the pad's north when looking straight along the axis)
        p.target.set(0, 0, 0);
        p.up.copy(EARTH_AXIS);
        if (Math.abs(p.pos.clone().normalize().dot(EARTH_AXIS)) > 0.999) p.up.set(0, 0, -1);
      }
    };
    return () => {
      stageHooks.tick = base;
    };
  }, []);
  return null;
}

function Probes() {
  const { gl } = useThree();
  const group = useMemo(() => {
    const g = new THREE.Group();
    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, 0);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);
      return mesh;
    };
    const s = new THREE.SphereGeometry(3, 64, 32);
    mk(s, new THREE.MeshStandardMaterial({ color: 0xf3f2ee, roughness: 0.55 }), -12, 0);
    mk(s, new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.8 }), -5, 0);
    mk(s, new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.05 }), 2, 0);
    mk(s, new THREE.MeshStandardMaterial({ color: 0xd8d8dc, metalness: 1, roughness: 0.35 }), 9, 0);
    const cyl = mk(new THREE.CylinderGeometry(1.85, 1.85, 30, 96), new THREE.MeshStandardMaterial({ color: 0xf3f2ee, roughness: 0.45 }), 17, 5);
    cyl.position.y = 5;
    const floor = mk(new THREE.BoxGeometry(46, 0.5, 20), new THREE.MeshStandardMaterial({ color: 0x9a978f, roughness: 0.9 }), 2, -10.3);
    floor.castShadow = false;
    return g;
  }, []);
  useEffect(() => () => group.traverse((o) => o instanceof THREE.Mesh && (o.geometry.dispose(), (o.material as THREE.Material).dispose())), [group]);
  useFrame(() => {
    const t = director.flightPose.target;
    group.position.set(t.x - frame.origin.x, t.y - frame.origin.y, t.z - frame.origin.z);
    // stand upright on the local vertical, facing the camera
    const up = t.clone().normalize();
    const toCam = frame.origin.clone().sub(t);
    toCam.addScaledVector(up, -toCam.dot(up)).normalize();
    const xAxis = new THREE.Vector3().crossVectors(up, toCam).normalize();
    group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, up, toCam));
    if (q.has('exp')) {
      gl.toneMappingExposure = Number(q.get('exp'));
      skyState.exposure = Number(q.get('exp'));
    }
  }, 1);
  return <primitive object={group} />;
}

function StandIn() {
  const mesh = useMemo(() => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(1.85, 1.85, 60, 48), new THREE.MeshStandardMaterial({ color: 0xf3f2ee, roughness: 0.45 }));
    m.castShadow = m.receiveShadow = true;
    return m;
  }, []);
  useEffect(() => () => (mesh.geometry.dispose(), (mesh.material as THREE.Material).dispose()), [mesh]);
  useFrame(() => {
    const t = director.flightPose.target;
    mesh.position.set(t.x - frame.origin.x, t.y - frame.origin.y, t.z - frame.origin.z);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), t.clone().normalize());
  }, 1);
  return <primitive object={mesh} />;
}

function TextureDebug() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uNoise: { value: null }, uCov: { value: null }, uDay: { value: null } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = position.xy*0.5+0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: `
          precision highp sampler3D;
          uniform sampler3D uNoise; uniform samplerCube uCov; uniform sampler2D uDay; varying vec2 vUv;
          void main(){
            vec3 c;
            if (vUv.y > 0.5) {
              // top: coverage map (lat/lon), day map faint underneath
              vec2 uv = vec2(vUv.x, (vUv.y - 0.5) * 2.0);
              float lon = (uv.x - 0.5) * 6.2831853; float lat = (uv.y - 0.5) * 3.14159265;
              vec3 n = vec3(cos(lat)*cos(lon), sin(lat), -cos(lat)*sin(lon));
              vec4 cv = textureCube(uCov, n);
              vec3 day = texture2D(uDay, uv).rgb;
              c = mix(day * 0.8, vec3(1.0), cv.r);
              if (vUv.x > 0.999) c = vec3(1,0,0);
            } else {
              vec2 uv = vec2(fract(vUv.x * 4.0), vUv.y * 2.0);
              int k = int(vUv.x * 4.0);
              vec4 nz = texture(uNoise, vec3(uv, 0.5));
              float v = k == 0 ? nz.r : k == 1 ? nz.g : k == 2 ? nz.b : nz.a;
              c = vec3(v);
            }
            gl_FragColor = vec4(c, 1.0);
          }`,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );
  const mesh = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const m = new THREE.Mesh(g, mat);
    m.frustumCulled = false;
    m.renderOrder = 100000;
    return m;
  }, [mat]);
  useFrame((state) => {
    const space = state.scene.getObjectByName('space.sky') as THREE.Mesh | undefined;
    const u = (space?.material as THREE.ShaderMaterial | undefined)?.uniforms;
    if (u) {
      mat.uniforms.uNoise.value = u.uNoise.value;
      mat.uniforms.uCov.value = u.uCoverage.value;
      mat.uniforms.uDay.value = u.uDay.value;
    }
  });
  return <primitive object={mesh} />;
}

function Debug() {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    // timing of the space passes at the current view: window.__spaceBench(n) (see system.ts)
    const w = window as unknown as Record<string, unknown>;
    w.__spaceBench = (n = 3) => {
      const root = scene.getObjectByName('space');
      const fn = root?.userData.bench as ((g: THREE.WebGLRenderer, s: THREE.Scene, c: THREE.Camera, n: number) => unknown) | undefined;
      return fn ? fn(gl, scene, camera, n) : null;
    };
    return () => {
      delete w.__spaceBench;
    };
  }, [gl, scene, camera]);
  useFrame(() => {
    (window as unknown as Record<string, unknown>).__spaceDebug = { ready: spaceAssets.ready && spaceAssets.cloudsReady && spaceAssets.envReady, n: frame.n, ms: perf.recent.slice(-4).map((x) => Math.round(x)), exposure: +skyState.exposure.toFixed(2), sun: +skyState.sunIntensity.toFixed(2), amb: +skyState.ambientIntensity.toFixed(3), gnd: +skyState.groundIntensity.toFixed(3), haze: skyState.hazeDensity.toExponential(2), hazeC: skyState.hazeColor.toArray().map((x) => +x.toFixed(3)) };
  }, 2);
  return null;
}

export default function Dev() {
  const hole = q.get('hole') === '1';
  const clouds = q.get('clouds') !== '0';
  return (
    <>
      <SpaceWorld holeDebug={hole} clouds={clouds} applyExposure={!q.has('exp')} />
      <CameraOverrides />
      <Debug />
      {q.get('probe') === '1' ? <Probes /> : null}
      {q.get('rocket') === '1' ? <StandIn /> : null}
      {q.get('debug') === 'textures' ? <TextureDebug /> : null}
    </>
  );
}
