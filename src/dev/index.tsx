/**
 * Development harness: ?dev=<name> mounts one module on the stage for inspection and
 * screenshots, without the product interface. Each module owns its dev file.
 *
 * Camera parameters (all optional):
 *   hangar location:  ?az=35&el=6&dist=110&tx=0&ty=32&tz=0&fov=36
 *   flight location:  ?t=<mission time s>&cam=e,n,u,headingDeg,pitchDeg,fov   (pad-local ENU)
 */
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { Location } from '../scene/frame';

export interface DevEntry {
  location: Location;
  load: LazyExoticComponent<ComponentType>;
}

export const DEV: Record<string, DevEntry> = {
  vehicle: { location: 'hangar', load: lazy(() => import('./vehicle')) },
  engine: { location: 'hangar', load: lazy(() => import('./engine')) },
  spacecraft: { location: 'hangar', load: lazy(() => import('./spacecraft')) },
  site: { location: 'flight', load: lazy(() => import('./site')) },
  space: { location: 'flight', load: lazy(() => import('./space')) },
  effects: { location: 'flight', load: lazy(() => import('./effects')) },
  mission: { location: 'flight', load: lazy(() => import('./mission')) },
};

export const devName = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('dev') : null;
