/**
 * What the hangar is showing, for the interface (hotspots, context indicator) and the director
 * (framing boxes). Written by the hangar scene; read elsewhere.
 */
import * as THREE from 'three';
import type { PartId } from '../../vehicle/parts';
import type { VehicleModel } from '../vehicle/types';
import type { EngineModel } from '../vehicle/engine/types';

/** Engine display stands beside the vehicle (hangar metres). */
export const ENGINE_STANDS = {
  'E-1': new THREE.Vector3(15, 0, 4),
  'E-1V': new THREE.Vector3(21.5, 0, -3),
};

/** Parts shown on the engine display stands rather than on the vehicle. */
export const ENGINE_DISPLAY_PARTS: PartId[] = ['engine', 'turbopump', 'gas-generator', 'injector', 'combustion-chamber', 'nozzle', 'main-valves', 'tvc-actuators', 'igniter'];
export const VACUUM_DISPLAY_PARTS: PartId[] = ['vacuum-engine', 'nozzle-extension'];

export const hangar = {
  vehicle: null as VehicleModel | null,
  engine: null as EngineModel | null,
  vacuum: null as EngineModel | null,
  /** Vehicle root offset (it stands on an integration stand). */
  vehicleY: 3.0,
  /** Bump when the model or view changes, so hotspots recompute. */
  epoch: 0,
};

const box = new THREE.Box3();
const tmp = new THREE.Box3();

/** World-space box of a part in the hangar (vehicle or engine displays). */
export function hangarPartBox(id: PartId, out = new THREE.Box3()): THREE.Box3 | null {
  const onStand = ENGINE_DISPLAY_PARTS.includes(id) ? hangar.engine : VACUUM_DISPLAY_PARTS.includes(id) ? hangar.vacuum : null;
  if (onStand) {
    const nodes = onStand.parts.get(id === 'vacuum-engine' ? ('vacuum-engine' as PartId) : id) ?? (id === 'engine' || id === 'vacuum-engine' ? [onStand.root] : null);
    if (!nodes || !nodes.length) {
      onStand.root.updateWorldMatrix(true, true);
      return out.setFromObject(onStand.root);
    }
    box.makeEmpty();
    for (const n of nodes) {
      n.updateWorldMatrix(true, true);
      box.union(tmp.setFromObject(n));
    }
    return out.copy(box);
  }
  if (!hangar.vehicle) return null;
  return hangar.vehicle.partBox(id, out);
}
