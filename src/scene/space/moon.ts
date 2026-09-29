/**
 * The Moon: a sphere of radius R_MOON with the LROC WAC mosaic, lit by the Sun with the
 * Lommel-Seeliger law (the lunar regolith's flat, limb-bright look: a full Moon shows no
 * darkening toward its edge), faint earthshine on the night side, and the Earth's shadow
 * during an eclipse. Drawn before the sky pass, which blends the air in front of it.
 */
import * as THREE from 'three';

const VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vN;
varying vec3 vP;
varying vec2 vUv;
void main() {
  vUv = uv;
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vP = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}
`;

const FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D uMap;
uniform vec3 uSun;
uniform float uSunE;
uniform vec3 uEarthRel;     // Earth's centre relative to the camera
uniform float uEarthR;
uniform vec3 uMoonRel;      // Moon's centre relative to the camera
uniform float uEarthshine;  // earthshine irradiance (scene units)
varying vec3 vN;
varying vec3 vP;
varying vec2 vUv;
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(-vP);
  float a = texture2D(uMap, vUv).r;
  // mosaic grey levels to normal albedo (mean lunar albedo about 0.12)
  float albedo = a * 0.24 + 0.01;
  float mu0 = max(dot(n, uSun), 0.0);
  float mu = max(dot(n, v), 0.0);
  float ls = mu0 / max(mu0 + mu, 1e-4);
  // phase darkening: the opposition surge makes the full Moon brighter than a Lambert sphere
  float g = acos(clamp(dot(v, uSun), -1.0, 1.0));
  float phaseK = 1.0 - 0.35 * smoothstep(0.0, 2.2, g);
  // Earth's shadow (umbra, softened), with a copper tint from sunlight refracted by the air
  vec3 toSun = uSun;
  vec3 q = vP - uEarthRel;
  float along = dot(q, toSun);
  float perp = length(q - toSun * along);
  float umbra = along < 0.0 ? smoothstep(uEarthR * 0.72, uEarthR * 1.02, perp) : 1.0;
  vec3 eclipse = mix(vec3(0.05, 0.018, 0.008), vec3(1.0), umbra);
  vec3 col = vec3(albedo) * uSunE * 2.0 * ls * phaseK / PI * eclipse;
  // earthshine on the night side
  vec3 toEarth = normalize(uEarthRel - vP);
  col += vec3(0.8, 0.9, 1.1) * albedo * uEarthshine * max(dot(n, toEarth), 0.0) / PI;
  gl_FragColor = vec4(col, 1.0);
  #include <logdepthbuf_fragment>
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function makeMoonMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'space.moon',
    uniforms: {
      uMap: { value: null },
      uSun: { value: new THREE.Vector3(0, 1, 0) },
      uSunE: { value: 4 },
      uEarthRel: { value: new THREE.Vector3() },
      uEarthR: { value: 6371000 },
      uMoonRel: { value: new THREE.Vector3() },
      uEarthshine: { value: 0 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
  });
}
