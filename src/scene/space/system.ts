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
import { makeCloudMaterial, makeCloudCompositeMaterial, makeCloudUniforms, makeCloudProbeMaterial, makeCloudShadowMaterial } from './clouds';
import { generateCoverage, generateNoiseVolume } from './cloudGen';
import { makeMoonMaterial } from './moon';
import { I_TO_EQUATORIAL, moonQuaternion } from './celestial';
import { CLOUD_BASE, CLOUD_TOP } from './glsl';
import { spaceTextures, spaceAssets, loadSpaceTextures } from './assets';
import { NIGHT_FLOOR_SKY, earthshine, updateLighting } from './lighting';
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

  // ── clouds: one full-screen march at reduced resolution into two targets (the part of each
  // ray in front of the focus subject and the part beyond it), then full-resolution composites
  // with per-pixel depth: back, front, and the depth of the dense clouds (see clouds.ts)
  const cloudU = makeCloudUniforms(uniforms);
  const cloudMat = makeCloudMaterial(cloudU);
  const cloudScene = new THREE.Scene();
  const cloudMarch = new THREE.Mesh(skyGeo, cloudMat);
  cloudMarch.frustumCulled = false;
  cloudScene.add(cloudMarch);
  let cloudRT: THREE.WebGLRenderTarget | null = null;
  const clearColor = new THREE.Color();
  const cloudGeo = fullScreenGeometry();
  const cloudLayers = (['back', 'front', 'depth'] as const).map((mode, i) => {
    const mesh = new THREE.Mesh(cloudGeo, makeCloudCompositeMaterial(cloudU, mode));
    mesh.frustumCulled = false;
    // first among the transparent objects (steam and plumes in front of a cloud blend over it)
    mesh.renderOrder = -500 + i;
    mesh.name = `space.clouds.${mode}`;
    root.add(mesh);
    return mesh;
  });
  const cloudMats = cloudLayers.map((m) => m.material as THREE.ShaderMaterial);
  // cloud shadows over the local terrain (the globe shades its own beyond it): after the opaque
  // world and the terrain's fading ring (-600), before the cloud composites
  const cloudShadowMat = makeCloudShadowMaterial(cloudU, uniforms);
  const cloudShadow = new THREE.Mesh(cloudGeo, cloudShadowMat);
  cloudShadow.frustumCulled = false;
  cloudShadow.renderOrder = -550;
  cloudShadow.name = 'space.clouds.shadow';
  root.add(cloudShadow);

  // ── in-cloud probe: the cloud density at the camera, read back asynchronously (a few frames
  // late, never stalling the GPU) for skyState.inCloud
  const probeMat = makeCloudProbeMaterial(cloudU);
  const probeScene = new THREE.Scene();
  const probeMesh = new THREE.Mesh(skyGeo, probeMat);
  probeMesh.frustumCulled = false;
  probeScene.add(probeMesh);
  let probeRT: THREE.WebGLRenderTarget | null = null;
  const probeBuf = new Uint8Array(4);
  let probeBusy = false;
  let probeValue = 0;

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
  let coverDay: THREE.Texture | null = null;
  let coverWater: THREE.Texture | null = null;

  const padEF = new THREE.Vector3(Math.cos(deg(SITE.lat)) * Math.cos(deg(SITE.lon)), Math.sin(deg(SITE.lat)), -Math.cos(deg(SITE.lat)) * Math.sin(deg(SITE.lon)));
  uniforms.uPadEF.value.copy(padEF);
  {
    // where the pad's line of sight to the Sun at T-0 crosses the middle of the cloud layer
    // (Earth-fixed, so it is the same at every mission time): the cloud field keeps it clear
    const toEF0 = new THREE.Matrix3().setFromMatrix4(tmpM4.makeRotationFromQuaternion(earthMeshQuaternion(0, tmpQ).invert()));
    const sunEF = SUN_DIRECTION.clone().applyMatrix3(toEF0).normalize();
    const sinEl = Math.max(0.15, sunEF.dot(padEF));
    uniforms.uPadSunEF.value.copy(padEF).multiplyScalar(R_EARTH).addScaledVector(sunEF, (CLOUD_BASE + CLOUD_TOP) / 2 / sinEl).normalize();
  }
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
  const shadowY = new THREE.Vector3();
  const shadowRel = new THREE.Vector3();

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
      // rebuilt when a texture that failed to load arrives on a retry (deserts need the day map)
      if (key !== coverKey || coverDay !== spaceTextures.day || coverWater !== spaceTextures.water) {
        coverKey = key;
        coverDay = spaceTextures.day;
        coverWater = spaceTextures.water;
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
    // earthshine: the sunlit part of the Earth seen from the Moon (a full Earth at new Moon,
    // when the Moon's Earth-facing side is dark), the same model as the spacecraft fill light
    earthshine(moonAbs, tmpV2);
    moonMat.uniforms.uEarthshine.value = (tmpV2.x + tmpV2.y + tmpV2.z) / 3;

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
    cloudU.uLimbKeep.value = 1 - THREE.MathUtils.smoothstep(alt, 20_000, 60_000);
    cloudU.uSteps.value = spec.cloudOctaves >= 6 ? 64 : spec.cloudOctaves >= 5 ? 48 : 32;
    cloudU.uLightSteps.value = spec.atmoSamples[1] >= 6 ? 5 : spec.atmoSamples[1] >= 4 ? 4 : 3;
    subject.copy(director.flightPose.target);
    // a subject inside the Earth (a view aimed at its centre) has no light of its own: use the camera
    if (subject.lengthSq() < (0.5 * R_EARTH) ** 2) subject.copy(O);
    const subjDist = subject.distanceTo(O);
    // camera below, inside or above the layer (the field itself is continuous)
    const regime = alt < CLOUD_BASE ? 0 : alt > CLOUD_TOP ? 2 : 1;
    cloudU.uRegime.value = regime;
    // split the rays just beyond the subject (inside the layer a little further, so the cloud
    // right around the subject is drawn in front of it); far subjects: everything is 'back'
    cloudU.uSplit.value = subjDist < 5e5 ? Math.max(regime === 1 ? 60 : 0, subjDist * (regime === 1 ? 1.08 : 1.03) + 15) : 0;
    // with no subject nearby (uSplit 0) every cloud is in the back layer: skip the front pass
    cloudLayers[0].visible = haveClouds;
    cloudLayers[1].visible = haveClouds && cloudU.uSplit.value > 0;
    cloudLayers[2].visible = haveClouds;
    cloudShadow.visible = haveClouds;
    skyState.cloudBase = CLOUD_BASE;
    skyState.cloudTop = CLOUD_TOP;
    if (regime === 1 && haveClouds) {
      if (frame.location === 'flight' && !probeBusy && frame.n % 4 === 0) probeClouds(gl);
      skyState.inCloud = probeValue;
    } else {
      probeValue = 0;
      skyState.inCloud = 0;
    }

    // lighting
    const L = updateLighting(O, subject);
    // stars follow the exposure the camera is adapted to: none against the daytime sky (the
    // sky-luminance mask in the shader), faint in sunlit space, clear in Earth's shadow
    uniforms.uStarVis.value = 0.2 + 0.8 * THREE.MathUtils.smoothstep(skyState.exposure, 1.5, 3.1);
    uniforms.uStarGain.value = 0.06;
    uniforms.uAirglow.value = 1;
    uniforms.uNightFill.value = NIGHT_FLOOR_SKY;
    moonMat.uniforms.uSunE.value = SUN_IRRADIANCE;

    // directional light: follows the subject, texel-snapped against the pad
    const target = tmpV.copy(subject).sub(O);
    anchor.copy(padAbs).sub(O);
    const z = SUN_DIRECTION;
    const x = tmpV2.set(0, 1, 0).cross(z).normalize();
    const y = shadowY.crossVectors(z, x);
    const texel = (2 * SHADOW_HALF) / sun.shadow.mapSize.x;
    const rel = shadowRel.subVectors(target, anchor);
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
    if (haveClouds && frame.location === 'flight') renderClouds(gl, camera);
  }

  function probeClouds(gl: THREE.WebGLRenderer) {
    if (!probeRT) probeRT = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false, stencilBuffer: false });
    const prev = gl.getRenderTarget();
    const prevTone = gl.toneMapping;
    gl.toneMapping = THREE.NoToneMapping;
    gl.setRenderTarget(probeRT);
    gl.render(probeScene, orthoCam);
    gl.setRenderTarget(prev);
    gl.toneMapping = prevTone;
    probeBusy = true;
    const rt = probeRT;
    gl.readRenderTargetPixelsAsync(rt, 0, 0, 1, 1, probeBuf)
      .then(() => {
        if (rt === probeRT) probeValue = probeBuf[0] / 255;
      })
      .catch(() => undefined)
      .finally(() => {
        probeBusy = false;
      });
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
      cloudRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false, count: 2 });
      for (const tex of cloudRT.textures) {
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        tex.colorSpace = THREE.NoColorSpace;
      }
    }
    cloudMats[0].uniforms.uCloudTex.value = cloudRT.textures[1];
    cloudMats[1].uniforms.uCloudTex.value = cloudRT.textures[0];
    cloudMats[2].uniforms.uCloudTex.value = cloudRT.textures[0];
    cloudMats[2].uniforms.uCloudTexBack.value = cloudRT.textures[1];
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

  /**
   * Development timing (not used by the product): average milliseconds of each pass over n
   * runs at the current view, each run synchronised by a 1-pixel read-back of the canvas (GPU
   * commands complete in order). `sky` is the full-screen sky and globe pass, `skyView` the
   * sky-view table, `cloudMarch` the reduced-resolution cloud march, `cloudComposite` the three
   * full-resolution cloud composites, `env` one PMREM environment regeneration.
   */
  function bench(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, n = 3) {
    const ctx = gl.getContext();
    const px = new Uint8Array(4);
    const prev = gl.getRenderTarget();
    const sync = () => {
      gl.setRenderTarget(null);
      ctx.readPixels(0, 0, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, px);
    };
    const time = (fn: () => void) => {
      fn(); // warm-up (program compilation, target allocation)
      sync();
      const t0 = performance.now();
      for (let i = 0; i < n; i++) {
        fn();
        sync();
      }
      return (performance.now() - t0) / n;
    };
    const base = time(() => undefined);
    const clouds = opts.clouds && !!coverRT;
    const r = (x: number) => Math.round(Math.max(0, x - base) * 10) / 10;
    const out = {
      tier: useQuality.getState().tier,
      size: [gl.domElement.width, gl.domElement.height],
      atmoSteps: uniforms.uSteps.value as number,
      sky: r(time(() => gl.render(sky, camera))),
      skyView: r(time(() => renderSkyView(gl))),
      cloudMarch: clouds ? r(time(() => renderClouds(gl, camera))) : 0,
      cloudComposite: clouds ? r(time(() => cloudLayers.forEach((m) => gl.render(m, camera)))) : 0,
      env: 0,
    };
    out.env = r(time(() => ((env.key = ''), updateEnv(gl, scene, skyState.camAltitude, skyState.sunVisible))));
    gl.setRenderTarget(prev);
    return out;
  }

  /** Free GPU resources. The system stays usable (React StrictMode re-mounts it): generated
   *  textures are rebuilt on the next update. */
  function dispose(scene: THREE.Scene) {
    skyGeo.dispose();
    skyMat.dispose();
    envMat.dispose();
    moonGeo.dispose();
    moonMat.dispose();
    cloudMat.dispose();
    cloudGeo.dispose();
    for (const m of cloudMats) m.dispose();
    cloudShadowMat.dispose();
    probeMat.dispose();
    probeRT?.dispose();
    probeRT = null;
    coverDay = coverWater = null;
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

  root.userData.bench = bench;
  return { root, update, dispose, bench, uniforms, cloudU, sun, hemi, moon };
}

