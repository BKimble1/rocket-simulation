/** Vehicle builder (stub until the vehicle module lands). */
import * as THREE from 'three';
import { M } from '../materials';
import type { VehicleConfig, VehicleModel } from './types';
import type { PartId } from '../../vehicle/parts';

export function buildVehicle(config: VehicleConfig): VehicleModel {
  const root = new THREE.Group();
  const booster = new THREE.Group();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(1.85, 1.85, 44.4, 48), M('paintWhite'));
  m.position.y = 22.2;
  booster.add(m);
  root.add(booster);
  return {
    config,
    root,
    bodies: { booster },
    parts: new Map<PartId, THREE.Object3D[]>(),
    anchors: { s1Nozzles: [], s2Nozzle: { exit: new THREE.Vector3(0, 38.6, 0), exitRadius: 1.2 }, s1Rcs: [], s2Rcs: [], capsuleRcs: [], smEngine: null, lesNozzles: [], satApogee: null, vents: [], com: {} },
    setState: () => {},
    setView: () => {},
    animate: () => {},
    partBox: () => null,
    dispose: () => m.geometry.dispose(),
  };
}
