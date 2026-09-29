/** Sky, Earth, clouds, stars, Sun and Moon (stub until the space module lands). */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import * as THREE from 'three';
import { skyState } from './skyState';

export function SpaceWorld() {
  const { scene } = useThree();
  useEffect(() => {
    scene.background = new THREE.Color('#9fbad6');
  }, [scene]);
  useFrame(() => {});
  return (
    <>
      <hemisphereLight args={[skyState.ambient, skyState.ground, 0.8]} />
      <directionalLight position={skyState.sunDir.clone().multiplyScalar(100)} intensity={3} />
    </>
  );
}
