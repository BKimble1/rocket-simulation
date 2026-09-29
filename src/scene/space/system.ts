/**
 * Assembles the space module's objects and updates them each frame (floating origin: every
 * position is absolute - frame.origin, computed in double precision on the CPU).
 */
import * as THREE from 'three';
import { frame } from '../frame';
import { director } from '../../director/director';
import { tierSpec, useQuality } from '../quality';
import { R_EARTH, R_MOON, SITE, SUN_DIRECTION, deg, earthMeshQuaternion, moonPosition, sitePosition } from '../../world/frames';
import { LOCAL_TERRAIN } from '../../world/site';
import { ATMO, SUN_IRRADIANCE, SUN_RGB, integrateRay, makeRayResult } from './atmosphere';
import { makeSkyViewMaterial } from './skyView';
import { makeSkyMaterial, makeSkyUniforms, fullScreenGeometry } from './skyPass';
import { makeCloudMaterial, makeCloudCompositeMaterial, makeCloudOverlayMaterial, makeCloudUniforms, capGeometry } from './clouds';
import { generateCoverage, generateNoiseVolume } from './cloudGen';
import { makeMoonMaterial } from './moon';
import { I_TO_EQUATORIAL, moonQuaternion } from './celestial';
import { CLOUD_BASE, CLOUD_TOP } from './glsl';
import { spaceTextures, spaceAssets, loadSpaceTextures } from './assets';
import { updateLighting } from './lighting';
import { skyState } from './skyState';

export interface SpaceOptions {
  /** Apply skyState.exposure to the renderer while the flight location is shown. */
  applyExposure: boolean;
  /** Draw the cloud layer. */
  clouds: boolean;
  /** Tint the globe inside the terrain disk (to check the terrain hole). */
  holeDebug: boolean;
}

/** Share of the diffuse sky/ground fill carried by the HemisphereLight (the rest comes from scene.environment). */
const HEMI_SHARE = 0.35;
const CLOUD_BLEND_H = 60; // m: fade of the proxy regimes around the layer bounds

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpM4 = new THREE.Matrix4();

export function createSpace(opts: SpaceOptions) {
  const root = new THREE.Group();
  root.name = 'space';

  // ── sky + globe pass
  const uniforms = makeSkyUniforms();
  const skyMat = makeSkyMaterial(uniforms);
  const skyGeo = fullScreenGeometry();
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  sky.name = 'space.sky';
  root.add(sky);

  // ── sky-view table (rendered each frame, sampled by the sky pass and the environment)
  const skyViewMat = makeSkyViewMaterial(uniforms);
  const skyViewScene = new THREE.Scene();
  const skyViewMesh = new THREE.Mesh(skyGeo, skyViewMat);
  skyViewMesh.frustumCulled = false;
  skyViewScene.add(skyViewMesh);
  const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let skyViewRT: THREE.WebGLRenderTarget | null = null;
  const sunRay = makeRayResult();

  // ── Moon
  const moonMat = makeMoonMaterial();
  const moonGeo = new THREE.SphereGeometry(R_MOON, 160, 80);
  const moon = new THREE.Mesh(moonGeo, moonMat);
  moon.renderOrder = -1100;
  moon.frustumCulled = false;
  moon.name = 'space.moon';
  root.add(moon);

  // ── clouds
  const cloudU = makeCloudUniforms(uniforms);
  const cloudMat = makeCloudMaterial(cloudU);
  const compositeMat = makeCloudCompositeMaterial(cloudU);
  const capGeo = capGeometry(120, 160);
  // the march runs in its own scene at reduced resolution...
  const cloudScene = new THREE.Scene();
  const cloudMarch = new THREE.Mesh(capGeo, cloudMat);
  cloudMarch.frustumCulled = false;
  cloudScene.add(cloudMarch);
  let cloudRT: THREE.WebGLRenderTarget | null = null;
  const clearColor = new THREE.Color();
  // ...and a depth-tested proxy composites it into the flight scene
  const cloudDome = new THREE.Mesh(capGeo, compositeMat);
  cloudDome.frustumCulled = false;
  cloudDome.renderOrder = -10;
  cloudDome.name = 'space.clouds';
  root.add(cloudDome);
  const overlayMat = makeCloudOverlayMaterial(cloudU);
  const overlay = new THREE.Mesh(fullScreenGeometry(), overlayMat);
  overlay.frustumCulled = false;
  overlay.renderOrder = 9000;
  overlay.name = 'space.cloudOverlay';
  root.add(overlay);

  // ── lights
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.name = 'space.sun';
  sun.castShadow = true;
  const sc = sun.shadow.camera as THREE.OrthographicCamera;
  const SHADOW_HALF = 150;
  sc.left = -SHADOW_HALF;
  sc.right = SHADOW_HALF;
  sc.top = SHADOW_HALF;
  sc.bottom = -SHADOW_HALF;
  sc.near = 1;
  sc.far = 2400;
  sun.shadow.bias = -0.00015;
  sun.shadow.normalBias = 0.04;
  sun.shadow.mapSize.set(tierSpec().shadowMap, tierSpec().shadowMap);
  root.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.5);
  hemi.name = 'space.hemi';
  root.add(hemi);

  // ── environment map (PMREM of the sky from the camera position)
  const envScene = new THREE.Scene();
  const envMat = makeSkyMaterial(uniforms, true);
  const envMesh = new THREE.Mesh(skyGeo, envMat);
  envMesh.frustumCulled = false;
  envScene.add(envMesh);
  let pmrem: THREE.PMREMGenerator | null = null;
  let envRT: THREE.WebGLRenderTarget | null = null;
  const env = { key: '', up: new THREE.Vector3(0, 1, 0), texVersion: -1 };

  // ── generated cloud textures
  let noiseRT: THREE.WebGL3DRenderTarget | null = null;
  let coverRT: THREE.WebGLCubeRenderTarget | null = null;
  let coverKey = '';

  const padEF = new THREE.Vector3(Math.cos(deg(SITE.lat)) * Math.cos(deg(SITE.lon)), Math.sin(deg(SITE.lat)), -Math.cos(deg(SITE.lat)) * Math.sin(deg(SITE.lon)));
  uniforms.uPadEF.value.copy(padEF);
  uniforms.uToEq.value.copy(I_TO_EQUATORIAL);
  uniforms.uHole.value.set(LOCAL_TERRAIN.innerKm * 1000, LOCAL_TERRAIN.outerKm * 1000 + 6000);
  uniforms.uHoleDebug.value = opts.holeDebug ? 1 : 0;

  let prevExposure: number | null = null;
  let lastTier = '';
  const moonAbs = new THREE.Vector3();
  const padAbs = new THREE.Vector3();
  const qEarth = new THREE.Quaternion();
  const toEF = new THREE.Matrix3();
  const camUp = new THREE.Vector3();
  const subject = new THREE.Vector3();
  const anchor = new THREE.Vector3();

  function ensureGenerated(gl: THREE.WebGLRenderer) {
    const spec = tierSpec();
    const size = spec.maxTexture >= 4096 ? 128 : 64;
    if (!noiseRT || noiseRT.width !== size) {
      noiseRT?.dispose();
      noiseRT = generateNoiseVolume(gl, size);
      uniforms.uNoise.value = noiseRT.texture;
    }
    if (spaceAssets.ready) {
      const csize = spec.maxTexture >= 4096 ? 1024 : 512;
      const key = `${csize}:${spec.cloudOctaves}`;
      if (key !== coverKey) {
        coverKey = key;
        coverRT?.dispose();
        coverRT = generateCoverage(gl, csize, spec.cloudOctaves, spaceTextures.day, spaceTextures.water);
        uniforms.uCoverage.value = coverRT.texture;
        spaceAssets.cloudsReady = true;
      }
    }
  }

  function update(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    const spec = tierSpec();
    const tierKey = useQuality.getState().tier;
    if (tierKey !== lastTier) {
      lastTier = tierKey;
      loadSpaceTextures(gl.capabilities.getMaxAnisotropy());
      if (sun.shadow.mapSize.x !== spec.shadowMap) {
        sun.shadow.mapSize.set(spec.shadowMap, spec.shadowMap);
        sun.shadow.map?.dispose();
        sun.shadow.map = null;
      }
      env.key = '';
    }
    ensureGenerated(gl);

    const t = frame.missionTime;
    const O = frame.origin; // camera absolute position (Earth centre at the frame I origin)
    const camR = O.length();
    camUp.copy(O).divideScalar(camR);

    // textures
    uniforms.uDay.value = spaceTextures.day;
    uniforms.uNight.value = spaceTextures.night;
    uniforms.uWater.value = spaceTextures.water;
    uniforms.uStars.value = spaceTextures.stars;
    moonMat.uniforms.uMap.value = spaceTextures.moon;

    // camera and Earth
    uniforms.uCamPos.value.copy(O);
    uniforms.uCamR.value = camR;
    uniforms.uSun.value.copy(SUN_DIRECTION);
    const cOf = (R: number) => (camR - R) * (camR + R);
    earthMeshQuaternion(t, qEarth);
    toEF.setFromMatrix4(tmpM4.makeRotationFromQuaternion(tmpQ.copy(qEarth).invert()));
    uniforms.uToEF.value.copy(toEF);
    sitePosition(t, 0, padAbs);
    uniforms.uPadRel.value.copy(padAbs).sub(O);

    // Moon
    moonPosition(t, frame.tl?.moonPhase0 ?? 0, moonAbs);
    moon.position.copy(moonAbs).sub(O);
    moonQuaternion(moonAbs, moon.quaternion);
    tmpV.copy(O).sub(moonAbs);
    const dm = tmpV.length();
    const rm = R_MOON * 1.0015;
    uniforms.uMoonRel.value.copy(tmpV);
    uniforms.uC.value.set(cOf(ATMO.bottom), cOf(ATMO.top), cOf(ATMO.bottom + (CLOUD_BASE + CLOUD_TOP) / 2), (dm - rm) * (dm + rm));
    moonMat.uniforms.uSun.value.copy(SUN_DIRECTION);
    moonMat.uniforms.uEarthRel.value.copy(O).negate();
    moonMat.uniforms.uMoonRel.value.copy(moon.position);
    // earthshine: sunlit Earth seen from the Moon (phase from the Sun-Earth-Moon angle)
    const phaseCos = -tmpV2.copy(moonAbs).normalize().dot(SUN_DIRECTION);
    const litFrac = 0.5 * (1 + phaseCos);
    const solidAng = Math.PI * (R_EARTH / moonAbs.length()) ** 2;
    moonMat.uniforms.uEarthshine.value = SUN_IRRADIANCE * 0.3 * litFrac * solidAng / Math.PI * 1.0;

    // sun, white balanced; transmittance from the camera toward the Sun (for the disk)
    uniforms.uSunE.value.copy(SUN_RGB);
    integrateRay(O, SUN_DIRECTION, SUN_DIRECTION, 24, sunRay);
    if (sunRay.tGround < Infinity) uniforms.uSunViewT.value.set(0, 0, 0);
    else uniforms.uSunViewT.value.copy(sunRay.T);

    // sky-view table frame: local vertical, the Sun's azimuth, the horizon's zenith angle
    uniforms.uUp.value.copy(camUp);
    const sunH = uniforms.uSunH.value.copy(SUN_DIRECTION).addScaledVector(camUp, -SUN_DIRECTION.dot(camUp));
    if (sunH.lengthSq() < 1e-10) sunH.set(1, 0, 0).addScaledVector(camUp, -camUp.x);
    sunH.normalize();
    uniforms.uSideH.value.crossVectors(camUp, sunH).normalize();
    uniforms.uZh.value = Math.PI / 2 + Math.acos(Math.min(1, Math.sqrt(Math.max(0, camR * camR - ATMO.bottom * ATMO.bottom)) / camR));

    // per-pixel angle for LOD and the sun disk's edge
    const hPx = gl.domElement.height || 900;
    uniforms.uPixel.value = (2 * Math.tan(deg(frame.camFov) / 2)) / hPx;
    uniforms.uSteps.value = spec.atmoSamples[0];

    // clouds
    const alt = camR - R_EARTH;
    const Rb = R_EARTH + CLOUD_BASE;
    const Rt = R_EARTH + CLOUD_TOP;
    cloudU.uCs.value.set(cOf(Rb), cOf(Rt), cOf(ATMO.bottom), cOf(ATMO.top));
    tmpV.copy(O).applyMatrix3(toEF);
    cloudU.uCamEF.value.copy(tmpV);
    const haveClouds = opts.clouds && !!coverRT;
    uniforms.uCloudsOn.value = haveClouds ? 1 : 0;
    cloudU.uFade.value = haveClouds ? 1 : 0;
    cloudU.uSteps.value = spec.cloudOctaves >= 6 ? 64 : spec.cloudOctaves >= 5 ? 48 : 32;
    cloudU.uLightSteps.value = spec.atmoSamples[1] >= 6 ? 5 : spec.atmoSamples[1] >= 4 ? 4 : 3;
    // camera-local frame for the cap (+Y up)
    tmpQ.setFromUnitVectors(new THREE.Vector3(0, 1, 0), camUp);
    cloudU.uLocalToRender.value.setFromMatrix4(tmpM4.makeRotationFromQuaternion(tmpQ));
    const acosC = (x: number) => Math.acos(Math.min(1, Math.max(-1, x)));
    subject.copy(director.flightPose.target);
    const subjDist = subject.distanceTo(O);
    let regime = 0;
    if (alt < CLOUD_BASE - CLOUD_BLEND_H * 0) regime = 0;
    else if (alt > CLOUD_TOP) regime = 2;
    else regime = 1;
    cloudU.uRegime.value = regime;
    if (regime === 0) {
      cloudU.uShellR.value = Rb;
      cloudU.uDR.value = Rb - camR;
      cloudU.uThetaMax.value = acosC(R_EARTH / camR) + acosC(R_EARTH / Rb) + 0.002;
      cloudU.uNearR.value = 0;
    } else if (regime === 2) {
      cloudU.uShellR.value = Rt;
      cloudU.uDR.value = Rt - camR;
      cloudU.uThetaMax.value = acosC(Rt / camR) + 0.0005;
      cloudU.uNearR.value = 0;
    } else {
      const near = THREE.MathUtils.clamp(subjDist * 1.15 + 25, 60, 2000);
      cloudU.uNear.value = near;
      cloudU.uNearR.value = near;
    }
    overlay.visible = haveClouds && regime === 1;
    cloudU.uNear.value = regime === 1 ? cloudU.uNearR.value : 0;
    cloudDome.visible = haveClouds && (regime !== 2 || alt < 2.5e7);
    skyState.cloudBase = CLOUD_BASE;
    skyState.cloudTop = CLOUD_TOP;
    skyState.inCloud = regime === 1 ? 1 : 0;

    // lighting
    const L = updateLighting(O, subject);
    uniforms.uStarVis.value = 1;
    uniforms.uStarGain.value = 0.06;
    uniforms.uAirglow.value = 1;
    moonMat.uniforms.uSunE.value = SUN_IRRADIANCE;

    // directional light: follows the subject, texel-snapped against the pad
    const target = tmpV.copy(subject).sub(O);
    anchor.copy(padAbs).sub(O);
    const z = SUN_DIRECTION;
    const x = tmpV2.set(0, 1, 0).cross(z).normalize();
    const y = new THREE.Vector3().crossVectors(z, x);
    const texel = (2 * SHADOW_HALF) / sun.shadow.mapSize.x;
    const rel = new THREE.Vector3().subVectors(target, anchor);
    const a = rel.dot(x);
    const b2 = rel.dot(y);
    target.addScaledVector(x, Math.round(a / texel) * texel - a).addScaledVector(y, Math.round(b2 / texel) * texel - b2);
    sun.target.position.copy(target);
    sun.position.copy(target).addScaledVector(z, 1200);
    sun.target.updateMatrixWorld();
    sun.color.copy(skyState.sunColor);
    sun.intensity = skyState.sunIntensity;
    sun.visible = skyState.sunIntensity > 1e-4;
    sun.castShadow = sun.visible;

    hemi.position.copy(subject).normalize(); // hemisphere "up" = local vertical at the subject
    const hm = Math.max(L.sky.x, L.sky.y, L.sky.z, L.ground.x, L.ground.y, L.ground.z, 1e-6);
    hemi.color.setRGB(L.sky.x / hm, L.sky.y / hm, L.sky.z / hm, THREE.LinearSRGBColorSpace);
    hemi.groundColor.setRGB(L.ground.x / hm, L.ground.y / hm, L.ground.z / hm, THREE.LinearSRGBColorSpace);
    hemi.intensity = hm * HEMI_SHARE;

    // exposure (flight location only; restored when leaving)
    if (opts.applyExposure) {
      if (frame.location === 'flight') {
        if (prevExposure === null) prevExposure = gl.toneMappingExposure;
        gl.toneMappingExposure = skyState.exposure;
      } else if (prevExposure !== null) {
        gl.toneMappingExposure = prevExposure;
        prevExposure = null;
      }
    }

    if (frame.location === 'flight') renderSkyView(gl);

    // environment: regenerate on altitude band / daylight class / large moves
    if (frame.location === 'flight') updateEnv(gl, scene, alt, L.camLit);

    // clouds: march at reduced resolution
    if (cloudDome.visible && frame.location === 'flight') renderClouds(gl, camera);
  }

  function renderSkyView(gl: THREE.WebGLRenderer) {
    const big = tierSpec().maxTexture >= 4096;
    const w = big ? 256 : 192;
    const h = big ? 160 : 112;
    if (!skyViewRT || skyViewRT.width !== w) {
      skyViewRT?.dispose();
      skyViewRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false });
      skyViewRT.texture.minFilter = THREE.LinearFilter;
      skyViewRT.texture.magFilter = THREE.LinearFilter;
      skyViewRT.texture.wrapS = THREE.ClampToEdgeWrapping;
      skyViewRT.texture.wrapT = THREE.ClampToEdgeWrapping;
      skyViewRT.texture.generateMipmaps = false;
      skyViewRT.texture.colorSpace = THREE.NoColorSpace;
    }
    uniforms.uSkyViewSize.value.set(w, h);
    skyViewMat.uniforms.uViewSteps.value = big ? 40 : 30;
    uniforms.uSkyView.value = skyViewRT.texture;
    const prev = gl.getRenderTarget();
    const prevTone = gl.toneMapping;
    gl.toneMapping = THREE.NoToneMapping;
    gl.setRenderTarget(skyViewRT);
    gl.render(skyViewScene, orthoCam);
    gl.setRenderTarget(prev);
    gl.toneMapping = prevTone;
  }

  function renderClouds(gl: THREE.WebGLRenderer, camera: THREE.Camera) {
    const scale = tierSpec().dprMax >= 2 ? 0.5 : tierSpec().dprMax >= 1.5 ? 0.45 : 0.34;
    const W = gl.domElement.width;
    const Hh = gl.domElement.height;
    const w = Math.max(16, Math.round(W * scale));
    const h = Math.max(16, Math.round(Hh * scale));
    if (!cloudRT || cloudRT.width !== w || cloudRT.height !== h) {
      cloudRT?.dispose();
      cloudRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false });
      cloudRT.texture.minFilter = THREE.LinearFilter;
      cloudRT.texture.magFilter = THREE.LinearFilter;
      cloudRT.texture.generateMipmaps = false;
      cloudRT.texture.colorSpace = THREE.NoColorSpace;
    }
    cloudU.uCloudTex.value = cloudRT.texture;
    cloudU.uFullRes.value.set(W, Hh);
    cloudU.uLowRes.value.set(w, h);
    cloudU.uPixel.value = uniforms.uPixel.value / scale;
    const prev = gl.getRenderTarget();
    gl.getClearColor(clearColor);
    const prevAlpha = gl.getClearAlpha();
    const prevAuto = gl.autoClear;
    gl.setRenderTarget(cloudRT);
    gl.setClearColor(0x000000, 0);
    gl.clear(true, false, false);
    gl.autoClear = false;
    gl.render(cloudScene, camera);
    gl.autoClear = prevAuto;
    gl.setRenderTarget(prev);
    gl.setClearColor(clearColor, prevAlpha);
  }

  function updateEnv(gl: THREE.WebGLRenderer, scene: THREE.Scene, alt: number, lit: number) {
    const band = alt < 12_000 ? 0 : alt < 80_000 ? 1 : alt < 3_000_000 ? 2 : 3;
    const litK = lit > 0.6 ? 2 : lit > 0.05 ? 1 : 0;
    const drift = env.up.angleTo(camUp);
    const key = `${band}:${litK}:${spaceAssets.ready ? 1 : 0}`;
    if (key !== env.key || drift > deg(12)) {
      env.key = key;
      env.up.copy(camUp);
      if (!pmrem) pmrem = new THREE.PMREMGenerator(gl);
      const steps = uniforms.uSteps.value;
      uniforms.uSteps.value = Math.min(steps, 8);
      const rt = pmrem.fromScene(envScene, 0, 0.1, 100, { size: 128 });
      uniforms.uSteps.value = steps;
      envRT?.dispose();
      envRT = rt;
      scene.environment = rt.texture;
      spaceAssets.envReady = spaceAssets.ready;
    }
    // keep the env's horizon aligned between regenerations
    tmpQ.setFromUnitVectors(env.up, camUp);
    scene.environmentRotation.setFromQuaternion(tmpQ);
    scene.environmentIntensity = 1 - HEMI_SHARE;
  }

  /** Free GPU resources. The system stays usable (React StrictMode re-mounts it): generated
   *  textures are rebuilt on the next update. */
  function dispose(scene: THREE.Scene) {
    skyGeo.dispose();
    skyMat.dispose();
    envMat.dispose();
    moonGeo.dispose();
    moonMat.dispose();
    capGeo.dispose();
    cloudMat.dispose();
    compositeMat.dispose();
    overlayMat.dispose();
    (overlay.geometry as THREE.BufferGeometry).dispose();
    if (envRT && scene.environment === envRT.texture) scene.environment = null;
    noiseRT?.dispose();
    coverRT?.dispose();
    envRT?.dispose();
    cloudRT?.dispose();
    skyViewRT?.dispose();
    skyViewMat.dispose();
    skyViewRT = null;
    pmrem?.dispose();
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
    noiseRT = null;
    coverRT = null;
    envRT = null;
    cloudRT = null;
    pmrem = null;
    coverKey = '';
    env.key = '';
    lastTier = '';
    uniforms.uNoise.value = null;
    uniforms.uCoverage.value = null;
    spaceAssets.cloudsReady = false;
    spaceAssets.envReady = false;
    if (prevExposure !== null) prevExposure = null;
  }

  return { root, update, dispose, uniforms, cloudU, sun, hemi, moon };
}

