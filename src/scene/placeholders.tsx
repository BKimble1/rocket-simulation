/** Temporary stand-ins used until the real location modules are mounted. */
import { useEffect } from 'react';
import { director } from '../director/director';

export function HangarPlaceholder() {
  useEffect(() => {
    director.ready.hangar = true;
  }, []);
  return (
    <>
      <hemisphereLight args={['#ffffff', '#b9b4aa', 1.2]} />
      <directionalLight position={[40, 90, 60]} intensity={2.2} />
      <mesh rotation-x={-Math.PI / 2}>
        <circleGeometry args={[200, 64]} />
        <meshStandardMaterial color="#d8d6d0" roughness={0.9} />
      </mesh>
      <mesh position={[0, 33, 0]}>
        <cylinderGeometry args={[1.85, 1.85, 66, 64]} />
        <meshStandardMaterial color="#f3f2ee" roughness={0.5} />
      </mesh>
    </>
  );
}
