/**
 * Thermal-load view for objects without a built-in lens (the engine display stands): swaps each
 * mesh's material for a flat colour by its userData.thermal class and restores it afterwards.
 * The classes are qualitative (what the part sees in operation), shown with a legend.
 */
import * as THREE from 'three';

export const THERMAL_CLASSES = [
  { label: 'Cryogenic (LOX, 90 K)', color: '#4f8fe0' },
  { label: 'Ambient', color: '#9aa1ab' },
  { label: 'Warm (aerodynamic heating)', color: '#e0b44a' },
  { label: 'Hot (engine bay, bells)', color: '#e0662f' },
  { label: 'Very hot (chamber, throat, gas generator, extension, heat shield)', color: '#c33d2c' },
];

const mats = THERMAL_CLASSES.map((c) => new THREE.MeshStandardMaterial({ color: c.color, roughness: 0.7, metalness: 0 }));

export function applyThermal(root: THREE.Object3D, on: boolean) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (on) {
      if (m.userData.__mat === undefined) m.userData.__mat = m.material;
      const k = typeof m.userData.thermal === 'number' ? m.userData.thermal : 1;
      m.material = mats[Math.max(0, Math.min(4, k))];
    } else if (m.userData.__mat !== undefined) {
      m.material = m.userData.__mat;
      delete m.userData.__mat;
    }
  });
}
