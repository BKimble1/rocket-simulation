/**
 * Lighting and haze shared by everything drawn in the flight world, updated each frame by the
 * space module from the camera altitude and the Sun direction.
 *
 * Units: colours are linear; "radiance" values are in scene light units (the same units as
 * three.js light intensities: a surface facing the Sun receives sunColor * sunIntensity), before
 * tone mapping and exposure.
 */
import * as THREE from 'three';

export const skyState = {
  /**
   * Colour of distant haze (aerial perspective) at the camera, as radiance: a fog that blends a
   * distant surface toward this colour by (1 - exp(-hazeDensity * distance)) matches the
   * atmosphere the globe and sky are drawn with.
   */
  hazeColor: new THREE.Color('#b8c6d6'),
  /**
   * Haze density scale (1/m): the extinction along a horizontal path at the camera near the
   * ground; higher up, the effective value along a slant path to the ground (so fog on distant
   * terrain seen from altitude stays right). Goes to 0 in space.
   */
  hazeDensity: 1 / 28000,
  /** Direct sunlight colour (max component 1) and intensity at the focus subject, after the
   *  atmosphere's transmittance; 0 in Earth's shadow. */
  sunColor: new THREE.Color('#fff4e6'),
  sunIntensity: 3,
  /** Sky irradiance on an upward-facing surface at the subject (colour, max 1) and magnitude. */
  ambient: new THREE.Color('#a9bdd6'),
  ambientIntensity: 0.6,
  /** Ground (or Earth, seen from altitude) bounce irradiance on a downward-facing surface. */
  ground: new THREE.Color('#6b6a60'),
  groundIntensity: 0.3,
  /** Suggested exposure multiplier (applied to the renderer by SpaceWorld unless disabled). */
  exposure: 1,
  /** Sun direction in frame I (unit). Render coordinates share frame I's axes. */
  sunDir: new THREE.Vector3(0.62, 0.66, 0.42).normalize(),
  /** Camera altitude above the spherical Earth (m). */
  camAltitude: 0,
  /** 1 when the camera is in full sunlight, 0 in Earth's shadow. */
  sunVisible: 1,
  /** Cloud layer bounds (m above the surface) and how deep the camera is inside a cloud (0..1). */
  cloudBase: 1500,
  cloudTop: 4600,
  inCloud: 0,
};
