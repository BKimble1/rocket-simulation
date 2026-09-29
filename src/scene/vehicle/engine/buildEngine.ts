/** Engine builder (stub until the engine module lands): a plain chamber and bell. */
import * as THREE from 'three';
import { E1, E1V } from '../../../vehicle/spec';
import { M } from '../../materials';
import type { EngineDetail, EngineKind, EngineModel } from './types';
import type { PartId } from '../../../vehicle/parts';

export function buildEngine(kind: EngineKind, _detail: EngineDetail): EngineModel {
  const spec = kind === 'E-1' ? E1 : E1V;
  const root = new THREE.Group();
  const exitR = spec.exitDiameter / 2;
  const len = spec.length;
  const pts = [new THREE.Vector2(0.18, 0), new THREE.Vector2(0.21, -0.35), new THREE.Vector2(spec.throatDiameter / 2, -0.7), new THREE.Vector2(exitR, -len)];
  const bell = new THREE.Mesh(new THREE.LatheGeometry(pts, 48), M('inconel'));
  bell.userData.part = 'nozzle';
  root.add(bell);
  const parts = new Map<PartId, THREE.Object3D[]>([['nozzle', [bell]]]);
  return {
    kind,
    root,
    parts,
    exitY: -len,
    exitRadius: exitR,
    throatY: -0.7,
    throatRadius: spec.throatDiameter / 2,
    setOperating: () => {},
    setCut: () => {},
    setFlowOverlay: () => {},
    dispose: () => bell.geometry.dispose(),
  };
}
