/**
 * Thin cables (lightning-protection catenaries, guy wires, overhead lines) drawn as camera-facing
 * ribbons with a minimum on-screen width of one pixel: a 3 cm cable 400 m away would otherwise
 * shimmer as broken dots. Below a pixel the ribbon fades by its true coverage instead of
 * vanishing. Logarithmic depth and the site haze are applied like everywhere else.
 */
import * as THREE from 'three';
import { hazeUniforms, HAZE_PARS_FRAGMENT } from './haze';
import { skyState } from '../space/skyState';

const VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
uniform vec2 uResolution;
uniform float uWidth;
attribute vec3 aNext;
attribute float aSide;
attribute float aDir;
varying float vAlpha;
varying vec3 vHazePos;
void main() {
  vec4 mv = modelViewMatrix * vec4( position, 1.0 );
  vec4 mvN = modelViewMatrix * vec4( aNext, 1.0 );
  vec4 c = projectionMatrix * mv;
  vec4 cN = projectionMatrix * mvN;
  vec2 s = c.xy / max( c.w, 1e-4 ) * uResolution * 0.5;
  vec2 sN = cN.xy / max( cN.w, 1e-4 ) * uResolution * 0.5;
  vec2 d = ( sN - s ) * aDir;
  d = length( d ) > 1e-5 ? normalize( d ) : vec2( 1.0, 0.0 );
  vec2 n = vec2( -d.y, d.x );
  float pxPerM = uResolution.y * 0.5 * projectionMatrix[ 1 ][ 1 ] / max( -mv.z, 1e-3 );
  float wPx = uWidth * pxPerM;
  float drawPx = max( wPx, 1.2 );
  vAlpha = clamp( wPx / 1.2, 0.0, 1.0 );
  c.xy += n * aSide * drawPx * 0.5 / ( uResolution * 0.5 ) * c.w;
  gl_Position = c;
  vHazePos = ( modelMatrix * vec4( position, 1.0 ) ).xyz;
  #include <logdepthbuf_vertex>
}
`;

const FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uColor;
uniform vec3 uLight;
varying float vAlpha;
${HAZE_PARS_FRAGMENT}
void main() {
  #include <logdepthbuf_fragment>
  vec3 col = siteHaze( uColor * uLight, vHazePos );
  gl_FragColor = vec4( col, vAlpha );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export interface WireSet {
  mesh: THREE.Mesh;
  update(): void;
}

/** Build one mesh for many polylines (pad-local points). */
export function buildWires(lines: THREE.Vector3[][], widthM: number, color: THREE.ColorRepresentation): WireSet {
  const pos: number[] = [];
  const next: number[] = [];
  const side: number[] = [];
  const dir: number[] = [];
  const idx: number[] = [];
  let base = 0;
  for (const pts of lines) {
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const last = i === pts.length - 1;
      const q = last ? pts[i - 1] : pts[i + 1];
      for (const sd of [-1, 1]) {
        pos.push(p.x, p.y, p.z);
        next.push(q.x, q.y, q.z);
        side.push(sd);
        dir.push(last ? -1 : 1);
      }
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const a = base + i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    base += pts.length * 2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aNext', new THREE.Float32BufferAttribute(next, 3));
  g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
  g.setAttribute('aDir', new THREE.Float32BufferAttribute(dir, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const uniforms = {
    ...hazeUniforms,
    uResolution: { value: new THREE.Vector2(1440, 900) },
    uWidth: { value: widthM },
    uColor: { value: new THREE.Color(color) },
    uLight: { value: new THREE.Color(1, 1, 1) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  const size = new THREE.Vector2();
  mesh.onBeforeRender = (renderer) => {
    renderer.getDrawingBufferSize(size);
    uniforms.uResolution.value.copy(size);
  };
  return {
    mesh,
    update() {
      // a thin cable: lit mostly by the sky with a little direct sun
      const l = uniforms.uLight.value;
      l.copy(skyState.ambient).multiplyScalar(skyState.ambientIntensity * 0.3);
      l.add(new THREE.Color().copy(skyState.sunColor).multiplyScalar(skyState.sunIntensity * 0.18));
    },
  };
}

/** Points along a hanging cable between a and b with a sag (m) at mid-span (parabolic approximation). */
export function catenary(a: THREE.Vector3, b: THREE.Vector3, sag: number, n = 24): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = a.clone().lerp(b, t);
    p.y -= 4 * sag * t * (1 - t);
    out.push(p);
  }
  return out;
}
