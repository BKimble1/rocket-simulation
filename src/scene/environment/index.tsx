/**
 * The coastal launch site (flight location): terrain and water out to LOCAL_TERRAIN.outerKm,
 * the launch complex (hardstand, mount and hold-downs, flame trench and deflector, service
 * tower with umbilical and access arms, sound-suppression water tower, lightning protection,
 * propellant storage, lighting, fence, roads, buildings, integration hangar, blockhouse) and
 * the landing zone. Authored in pad-local metres; the root group is placed each frame at
 * sitePosition(t) - frame.origin with siteFrameQuaternion(t) (floating origin).
 *
 * Public interface: <LaunchSite/>, `siteState` (written by the integration each frame) and
 * `SITE_ANCHORS` (pad-local points for the effects and cameras).
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { frame } from '../frame';
import { sitePosition, siteFrameQuaternion } from '../../world/frames';
import { useSiteMaps } from './map';
import { buildSite } from './site';

export { siteState, SITE_ANCHORS, type SiteConfig, type Nozzle } from './state';
export { groundY, groundH, seaLevel, siteMapsReady } from './map';

const _p = new THREE.Vector3();

export function LaunchSite() {
  const maps = useSiteMaps();
  const site = useMemo(() => buildSite(maps), [maps]);
  useEffect(() => () => site.dispose(), [site]);
  useFrame((state) => {
    const t = frame.missionTime;
    sitePosition(t, 0, _p);
    site.root.position.set(_p.x - frame.origin.x, _p.y - frame.origin.y, _p.z - frame.origin.z);
    siteFrameQuaternion(t, site.root.quaternion);
    const cam = state.camera as THREE.PerspectiveCamera;
    site.update(cam.isPerspectiveCamera ? cam.fov : 60);
  }, 0);
  return <primitive object={site.root} />;
}
