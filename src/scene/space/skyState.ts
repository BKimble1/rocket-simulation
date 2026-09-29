/**
 * Lighting and haze shared by everything drawn in the flight world, updated each frame by the
 * space module from the camera altitude and the Sun direction.
 */
import * as THREE from 'three';

export const skyState = {
  /** Colour of distant haze (aerial perspective) at the camera. */
  hazeColor: new THREE.Color('#b8c6d6'),
  /** Haze density scale (1/m) near the ground; goes to 0 in space. */
  hazeDensity: 1 / 28000,
  /** Direct sunlight colour and intensity at the camera. */
  sunColor: new THREE.Color('#fff4e6'),
  sunIntensity: 3,
  /** Sky ambient (fills shadows). */
  ambient: new THREE.Color('#a9bdd6'),
  ambientIntensity: 0.6,
  /** Ground bounce colour. */
  ground: new THREE.Color('#6b6a60'),
  /** Suggested exposure multiplier (space scenes are brighter-contrast). */
  exposure: 1,
  /** Sun direction in frame I (unit). */
  sunDir: new THREE.Vector3(0.62, 0.66, 0.42).normalize(),
};
