/**
 * Thermal-load view for objects without a built-in lens (the engine display stands): swaps each
 * mesh's material for a flat colour by its userData.thermal class and restores it afterwards.
 * The classes and colours are the vehicle's thermal lens (qualitative: what the part sees in
 * operation), so one legend serves both.
 */
import * as THREE from 'three';
import { THERMAL_LENS } from '../vehicle/buildVehicle';

export const THERMAL_CLASSES = THERMAL_LENS.map((c) => ({ label: c.label, detail: c.detail, color: c.color }));

const mats = THERMAL_CLASSES.map((c) => new THREE.MeshStandardMaterial({ color: c.color, roughness: 0.7, metalness: 0 }));

export function applyThermal(root: THREE.Object3D, on: boolean) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.userData.lensExempt) return;
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
