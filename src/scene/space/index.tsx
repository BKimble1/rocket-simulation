/**
 * SpaceWorld: sky, atmosphere, Earth, clouds, stars, Sun, Moon and the lighting of the flight
 * location, correct from 2 m above the pad to the Moon. See system.ts for the per-frame work,
 * skyPass.ts / clouds.ts / moon.ts for the shaders, atmosphere.ts for the physical model.
 *
 * Mount once inside the flight location, under a Suspense boundary: it suspends until the Earth,
 * Moon and star textures have arrived (at most 8 s; a texture that fails keeps a plain colour and
 * is retried in the background, it never throws). It sets the flight scene's background (black: the sky
 * pass draws everything behind the world), scene.environment, a shadow-casting DirectionalLight
 * along the Sun that follows the focus subject, and a HemisphereLight. It writes `skyState`
 * every frame for the other modules.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { use, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { createSpace } from './system';
import { loadSpaceTextures, spaceTexturesSettled } from './assets';

export { skyState } from './skyState';
export { spaceAssets } from './assets';

export interface SpaceWorldProps {
  /** Apply skyState.exposure to renderer.toneMappingExposure while the flight location is shown (default true). */
  applyExposure?: boolean;
  /** Draw the volumetric cloud layer (default true). */
  clouds?: boolean;
  /** Debug: tint the globe where the local terrain must draw. */
  holeDebug?: boolean;
}

export function SpaceWorld({ applyExposure = true, clouds = true, holeDebug = false }: SpaceWorldProps = {}) {
  const { scene, gl, camera } = useThree();
  use(spaceTexturesSettled(gl.capabilities.getMaxAnisotropy()));
  const sys = useMemo(() => createSpace({ applyExposure, clouds, holeDebug }), [applyExposure, clouds, holeDebug]);

  useEffect(() => {
    const prevBg = scene.background;
    scene.background = new THREE.Color(0, 0, 0);
    loadSpaceTextures(gl.capabilities.getMaxAnisotropy());
    return () => {
      scene.background = prevBg;
    };
  }, [scene, gl]);

  useEffect(() => () => sys.dispose(scene), [sys, scene]);

  useFrame(() => sys.update(gl, scene, camera), 0);

  return <primitive object={sys.root} />;
}
