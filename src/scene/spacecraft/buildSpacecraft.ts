/** Spacecraft builder (stub until the spacecraft module lands). */
import * as THREE from 'three';
import { M } from '../materials';
import type { SpacecraftKind, SpacecraftModel } from './types';
import type { PartId } from '../../vehicle/parts';
import type { VehicleDetail } from './detail';

export function buildSpacecraft(kind: SpacecraftKind, _detail: VehicleDetail, mountY: number): SpacecraftModel {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.4, 2.2), M('mliGold'));
  box.position.y = mountY + 2.6;
  g.add(box);
  const body = kind === 'capsule' || kind === 'researchCapsule' ? 'capsule' : kind === 'station' ? 'station' : 'satellite';
  return {
    kind,
    bodies: { [body]: g },
    parts: new Map<PartId, THREE.Object3D[]>(),
    anchors: { satRcs: [], satApogee: null, capsuleRcs: [], smEngine: null, smRcs: [], lesNozzles: [], dockPort: null, chuteAttach: null, topY: mountY + 4.3 },
    setState: () => {},
    setCut: () => {},
    animate: () => {},
    dispose: () => box.geometry.dispose(),
  };
}
