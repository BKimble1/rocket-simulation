/**
 * The local terrain: a polar grid on the spherical Earth around the pad, geometric in radius
 * (square cells whose size grows with distance: ~1 m near the hardstand, ~12 m at 1 km,
 * ~600 m at 50 km, no LOD seams), out to LOCAL_TERRAIN.outerKm. The inner disk (to innerKm)
 * is opaque; the outer ring fades out while its colours blend into the Earth day imagery
 * sampled by latitude and longitude, so it meets the globe without a seam.
 *
 * One shader draws land and water per fragment from the baked coast distance field: scrub,
 * pine flatwoods and marsh with procedural variation, towns, beaches with a dune line, the
 * complex's mowed grass and gravel, and animated normal-mapped water (open ocean swell, calm
 * lagoons, surf and foam at the beach, fresnel sky reflection and a sun glint from the Sun
 * light through the standard GGX lobe), then the site haze.
 */
import * as THREE from 'three';
import { asset } from '../../config';
import { LOCAL_TERRAIN, LANDING_ZONE } from '../../world/site';
import { SITE, deg } from '../../world/frames';
import { skyState } from '../space/skyState';
import { tierSpec } from '../quality';
import { frame } from '../frame';
import { SITE_MAP } from './generated/regionalMap';
import { groundH, sphereY, type SiteMaps } from './map';
import { hazeUniforms, HAZE_PARS_FRAGMENT, HAZE_PARS_VERTEX, HAZE_VERTEX, HAZE_FRAGMENT } from './haze';
import { NOISE_GLSL, COLOR_GLSL } from './glsl';
import { OVERLAY, type Overlay } from './overlay';
import { LZ } from './layout';

// ───────────────────────────── geometry ─────────────────────────────

function radii(r0: number, rEnd: number, nTheta: number): number[] {
  const g = 1 + (2 * Math.PI) / nTheta;
  const out: number[] = [];
  for (let r = r0; r < rEnd; r *= g) out.push(r);
  out.push(rEnd);
  return out;
}

/** A polar-grid annulus (or disk when rIn is 0) with vertices on the terrain surface. */
function annulus(maps: SiteMaps, rs: number[], nTheta: number, withCentre: boolean): THREE.BufferGeometry {
  const nr = rs.length;
  const nv = nr * nTheta + (withCentre ? 1 : 0);
  const pos = new Float32Array(nv * 3);
  const cosT = new Float64Array(nTheta);
  const sinT = new Float64Array(nTheta);
  for (let j = 0; j < nTheta; j++) {
    const a = (j / nTheta) * Math.PI * 2;
    cosT[j] = Math.cos(a);
    sinT[j] = Math.sin(a);
  }
  let k = 0;
  for (let i = 0; i < nr; i++) {
    const r = rs[i];
    // stagger alternate rings by half a cell: fewer long aligned edges, better triangles
    const off = i % 2 ? 0.5 : 0;
    for (let j = 0; j < nTheta; j++) {
      let x: number;
      let z: number;
      if (off) {
        const a = ((j + off) / nTheta) * Math.PI * 2;
        x = r * Math.cos(a);
        z = r * Math.sin(a);
      } else {
        x = r * cosT[j];
        z = r * sinT[j];
      }
      pos[k++] = x;
      pos[k++] = sphereY(x, z, groundH(maps, x, z));
      pos[k++] = z;
    }
  }
  if (withCentre) {
    pos[k++] = 0;
    pos[k++] = groundH(maps, 0, 0);
    pos[k++] = 0;
  }
  const quads = (nr - 1) * nTheta;
  const idx = new Uint32Array(quads * 6 + (withCentre ? nTheta * 3 : 0));
  let t = 0;
  for (let i = 0; i < nr - 1; i++) {
    const a0 = i * nTheta;
    const b0 = (i + 1) * nTheta;
    const odd = i % 2 === 1;
    for (let j = 0; j < nTheta; j++) {
      const j1 = (j + 1) % nTheta;
      const a = a0 + j;
      const b = a0 + j1;
      const c = b0 + j;
      const d = b0 + j1;
      if (odd) {
        // ring i is offset by +half: a sits between c and d
        idx[t++] = a;
        idx[t++] = d;
        idx[t++] = c;
        idx[t++] = a;
        idx[t++] = b;
        idx[t++] = d;
      } else {
        // ring i+1 is offset by +half: c sits between a and b
        idx[t++] = a;
        idx[t++] = b;
        idx[t++] = c;
        idx[t++] = b;
        idx[t++] = d;
        idx[t++] = c;
      }
    }
  }
  if (withCentre) {
    const cIdx = nr * nTheta;
    for (let j = 0; j < nTheta; j++) {
      idx[t++] = cIdx;
      idx[t++] = (j + 1) % nTheta;
      idx[t++] = j;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  const rMax = rs[nr - 1];
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, -rMax * rMax / (2 * 6371000), 0), rMax * 1.01);
  return geo;
}

// ───────────────────────────── shader ─────────────────────────────

const PARS_V = /* glsl */ `
varying vec2 vSite;
varying vec3 vUpV;
varying vec3 vTanE;
${HAZE_PARS_VERTEX}
`;

const MAIN_V = /* glsl */ `
vSite = position.xz;
vUpV = normalize( normalMatrix * normalize( vec3( position.x, position.y + 6371000.0, position.z ) ) );
vTanE = normalize( normalMatrix * vec3( 1.0, 0.0, 0.0 ) );
${HAZE_VERTEX}
`;

const PARS_F = /* glsl */ `
varying vec2 vSite;
varying vec3 vUpV;
varying vec3 vTanE;
uniform sampler2D uSdf;
uniform sampler2D uCover;
uniform sampler2D uDay;
uniform sampler2D uOverlay;
uniform vec4 uMap;          // ext, sdf size, sdf range, sdf step
uniform float uOverExt;
uniform float uTime;
uniform vec2 uLatLon0;
uniform vec2 uFadeR;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyZenith;
uniform vec3 uLz;           // x, z, apron radius
float siteWater;
float siteFoam;
vec3 siteWaterN;
${NOISE_GLSL}
${COLOR_GLSL}
${HAZE_PARS_FRAGMENT}

float decodeSdf( vec3 t ) {
  return ( floor( t.r * 255.0 + 0.5 ) * 256.0 + floor( t.g * 255.0 + 0.5 ) ) * uMap.w - uMap.z;
}
float coastSdf( vec2 p ) {
  vec2 t = ( p + uMap.x ) / ( 2.0 * uMap.x ) * uMap.y - 0.5;
  vec2 i = floor( t );
  vec2 f = t - i;
  int m = int( uMap.y ) - 1;
  ivec2 ii = clamp( ivec2( i ), ivec2( 0 ), ivec2( m - 1 ) );
  float a = decodeSdf( texelFetch( uSdf, ii, 0 ).rgb );
  float b = decodeSdf( texelFetch( uSdf, ii + ivec2( 1, 0 ), 0 ).rgb );
  float c = decodeSdf( texelFetch( uSdf, ii + ivec2( 0, 1 ), 0 ).rgb );
  float d = decodeSdf( texelFetch( uSdf, ii + ivec2( 1, 1 ), 0 ).rgb );
  f = clamp( f, 0.0, 1.0 );
  return mix( mix( a, b, f.x ), mix( c, d, f.x ), f.y );
}

// ── towns: blocks, streets, roofs and yard trees; a mottled average when sub-pixel ──
vec3 townColor( vec2 p, float px, vec3 land ) {
  float dens = 0.5 + 0.5 * fbmS( p, 420.0, 3, 47, px );
  vec3 avg = mix( land, srgbC( 86.0, 86.0, 82.0 ), 0.45 + 0.35 * dens );
  if ( px > 70.0 ) return avg;
  vec2 q = p / 118.0;
  vec2 cell = floor( q );
  vec2 f = fract( q );
  float jit = siteHash( ivec2( cell ), 41 );
  float aa = px / 118.0;
  float street = 1.0 - smoothstep( 0.09, 0.09 + aa + 0.01, min( f.x, f.y ) );
  vec2 lotQ = p / 24.0;
  float lot = siteHash( ivec2( floor( lotQ ) ), 43 );
  vec3 roof = lot < 0.35 ? srgbC( 128.0, 126.0, 120.0 ) : lot < 0.6 ? srgbC( 170.0, 166.0, 156.0 ) : lot < 0.75 ? srgbC( 118.0, 80.0, 64.0 ) : srgbC( 84.0, 86.0, 84.0 );
  vec2 lf = fract( lotQ );
  float inRoof = step( 0.2, lf.x ) * step( lf.x, 0.8 ) * step( 0.22, lf.y ) * step( lf.y, 0.75 ) * step( 0.3 - 0.3 * dens, lot );
  vec3 yard = mix( srgbC( 60.0, 72.0, 40.0 ), srgbC( 38.0, 50.0, 28.0 ), vnoise( p / 9.0, 45 ) );
  vec3 c = mix( yard, roof, inRoof * step( 0.12, jit ) );
  c = mix( c, srgbC( 70.0, 70.0, 68.0 ), street );
  return mix( c, avg, smoothstep( 10.0, 70.0, px ) );
}

vec3 landAlbedo( vec2 p, float sdf, vec3 cov, float px, out float rough ) {
  float n1 = fbmS( p, 1300.0, 3, 1, px );
  float n2 = fbmS( p, 280.0, 3, 2, px );
  float n3 = fbmS( p, 48.0, 3, 3, px );
  float n4 = fbmS( p, 7.0, 2, 4, px );
  vec3 scrub = srgbC( 60.0, 67.0, 36.0 );
  vec3 flatwoods = srgbC( 40.0, 50.0, 27.0 );
  vec3 dry = srgbC( 96.0, 90.0, 60.0 );
  vec3 c = mix( scrub, flatwoods, smoothstep( -0.15, 0.4, n1 ) );
  c = mix( c, dry, smoothstep( 0.2, 0.75, n2 ) * 0.45 );
  c *= 0.86 + 0.22 * n3 + 0.12 * n4;
  rough = 0.95;
  // marsh and wet prairie
  vec3 marsh = mix( srgbC( 88.0, 86.0, 56.0 ), srgbC( 64.0, 72.0, 44.0 ), 0.5 + 0.5 * n2 );
  float mw = clamp( cov.g * 1.2 + n3 * 0.25, 0.0, 1.0 );
  c = mix( c, marsh * ( 0.92 + 0.16 * n3 ), mw );
  float ocean = smoothstep( 0.25, 0.55, cov.r );
  // lagoon shores: mangrove and cabbage-palm hammock, a muddy edge
  float lagoonShore = ( 1.0 - ocean ) * ( 1.0 - smoothstep( 12.0, 40.0 + 30.0 * n2, sdf ) );
  c = mix( c, srgbC( 32.0, 45.0, 27.0 ), lagoonShore * 0.85 );
  c = mix( c, srgbC( 84.0, 78.0, 60.0 ), ( 1.0 - smoothstep( 0.0, 3.5, sdf ) ) * ( 1.0 - ocean ) * 0.7 );
  // towns, with ragged edges
  float town = smoothstep( 0.12, 0.55, cov.b + 0.22 * fbmS( p, 650.0, 3, 49, px ) );
  if ( town > 0.001 ) c = mix( c, townColor( p, px, c ), town );
  // Atlantic beach, dunes with sea oats
  if ( ocean > 0.01 ) {
    float beachW = 42.0 + 18.0 * vnoise( p / 260.0, 5 );
    float swash = 3.0 + 2.0 * sin( uTime * 0.55 + vnoise( p / 40.0, 6 ) * 6.0 );
    vec3 sand = srgbC( 206.0, 194.0, 166.0 ) * ( 0.94 + 0.08 * n4 + 0.05 * n3 );
    vec3 wetSand = srgbC( 128.0, 118.0, 96.0 );
    float wetW = 1.0 - smoothstep( swash, swash + 6.0 + px, sdf );
    sand = mix( sand, wetSand, wetW );
    vec3 dune = mix( srgbC( 138.0, 130.0, 90.0 ), srgbC( 92.0, 96.0, 56.0 ), smoothstep( -0.3, 0.5, n3 ) );
    dune = mix( dune, sand, smoothstep( 0.35, 0.8, n4 ) * 0.5 );
    float duneW = 1.0 - smoothstep( beachW + 55.0, beachW + 110.0 + 40.0 * n2, sdf );
    float beach = 1.0 - smoothstep( beachW - 3.0, beachW + 3.0 + px, sdf );
    c = mix( c, dune, duneW * ocean );
    c = mix( c, sand, beach * ocean );
    rough = mix( rough, mix( 0.9, 0.45, wetW ), beach * ocean );
  }
  return c;
}

// ── water: a sum of directional waves with deep-water dispersion, filtered by pixel size ──
vec2 waveSlope( vec2 p, float t, float px, float ocean, out float var ) {
  vec2 s = vec2( 0.0 );
  var = 0.0;
  float ampK = mix( 0.22, 1.0, ocean );
  float wl = mix( 16.0, 110.0, ocean );
  float base = atan( 0.38, -0.92 );
  for ( int i = 0; i < 12; i++ ) {
    float fi = float( i );
    float spread = mix( 0.35, 1.3, fi / 11.0 );
    float ang = base + ( siteHash( ivec2( i, 3 ), 61 ) - 0.5 ) * spread * 2.0;
    vec2 dir = vec2( cos( ang ), sin( ang ) );
    float k = 6.2831853 / wl;
    float w = sqrt( 9.81 * k );
    float steep = mix( 0.045, 0.12, fi / 11.0 ) * ampK;
    float fade = 1.0 - smoothstep( 0.35, 0.9, px * 2.0 / wl );
    if ( fade <= 0.0 ) {
      var += 0.5 * steep * steep * 0.55;
    } else {
      float md = 0.45 + 0.55 * vnoise( p / ( wl * 6.0 ) + fi * 3.7, 7 + i );
      float ph = k * dot( dir, p ) - w * t + fi * 1.9;
      s += dir * ( steep * md * cos( ph ) * fade );
      var += 0.5 * steep * steep * md * md * ( 1.0 - fade );
    }
    wl *= 0.69;
  }
  return s;
}

// surf: broken, patchy crests running in toward the beach, the swash line, streaks of foam
float surf( vec2 p, float sdf, float ocean, float t, float px ) {
  float d = -sdf;
  if ( ocean < 0.3 || d > 130.0 || d < -3.0 ) return 0.0;
  float n = fbmS( p, 90.0, 2, 3, px );
  float zone = smoothstep( 120.0, 50.0, d ) * smoothstep( -1.0, 3.0, d );
  float along = fbmS( p, 60.0, 3, 11, px );
  float band = fract( d / 31.0 + t / 10.0 + n * 0.9 + along * 0.35 );
  float crest = smoothstep( 0.0, 0.05, band ) * ( 1.0 - smoothstep( 0.05, 0.38, band ) );
  float patchy = smoothstep( -0.15, 0.45, fbmS( p + vec2( 0.0, t * 1.3 ), 38.0, 3, 13, px ) );
  float foam = crest * zone * patchy;
  float swashPos = 2.5 + 2.0 * sin( t * 0.55 + vnoise( p / 40.0, 6 ) * 6.0 );
  foam = max( foam, ( 1.0 - smoothstep( 0.0, 2.0 + px, abs( d - swashPos ) ) ) * 0.8 * ( 0.6 + 0.4 * patchy ) );
  foam = max( foam, zone * 0.22 * smoothstep( 0.1, 0.8, vnoise( p / 6.0 + t * 0.15, 9 ) ) );
  float filt = smoothstep( 4.0, 22.0, px );
  return clamp( mix( foam, zone * 0.2, filt ), 0.0, 1.0 );
}

// matches the globe's ocean albedo far out (dark navy), greener and brighter over the shelf
vec3 waterBody( float sdf, float ocean ) {
  float d = -sdf;
  vec3 deep = vec3( 0.0046, 0.0128, 0.039 );
  vec3 shelf = srgbC( 22.0, 60.0, 72.0 );
  vec3 shallow = srgbC( 52.0, 100.0, 92.0 );
  vec3 o = mix( shallow, shelf, smoothstep( 8.0, 180.0, d ) );
  o = mix( o, deep, smoothstep( 800.0, 6000.0, d ) );
  vec3 lagoon = mix( srgbC( 60.0, 76.0, 56.0 ), srgbC( 26.0, 44.0, 40.0 ), smoothstep( 4.0, 120.0, d ) );
  return mix( lagoon, o, ocean );
}

// the globe's albedo for the same place (Blue Marble day map, as the sky module shades it)
vec3 globeAlbedo( vec3 day, float water ) {
  float shallowK = clamp( ( day.g - 0.55 * day.b ) * 6.0, 0.0, 1.0 );
  vec3 ocean = mix( vec3( 0.0045, 0.0105, 0.030 ), day * 0.55, 0.12 + 0.55 * shallowK );
  return mix( day * 0.72, ocean, water );
}

vec3 dayImagery( vec2 p ) {
  float lat = uLatLon0.x - p.y / 6371000.0;
  float lon = uLatLon0.y + p.x / ( 6371000.0 * cos( uLatLon0.x ) );
  vec2 uv = vec2( ( lon + 3.14159265 ) / 6.2831853, ( lat + 1.5707963 ) / 3.14159265 );
  return texture2D( uDay, uv ).rgb;
}
`;

const CLASSIFY = /* glsl */ `
{
  vec2 sp = vSite;
  float px = max( length( fwidth( sp ) ), 0.02 );
  float dist = length( sp );
  float sdf = coastSdf( sp );
  vec3 cov = texture2D( uCover, ( sp + uMap.x ) / ( 2.0 * uMap.x ) ).rgb;
  float aaW = max( px * 0.7, 0.25 );
  float wet = 1.0 - smoothstep( -aaW, aaW, sdf );
  vec3 upV = normalize( vUpV );
  vec3 eV = normalize( vTanE - upV * dot( vTanE, upV ) );
  vec3 sV = normalize( cross( eV, upV ) );
  float rough = 0.95;
  vec3 albedo = vec3( 0.0 );
  if ( wet < 0.999 ) albedo = landAlbedo( sp, sdf, cov, px, rough );

  // complex ground treatment (mowed grass, gravel, scorch) and the landing-zone apron
  vec2 ouv = ( sp + uOverExt ) / ( 2.0 * uOverExt );
  if ( ouv.x > 0.0 && ouv.y > 0.0 && ouv.x < 1.0 && ouv.y < 1.0 ) {
    vec3 o = texture2D( uOverlay, ouv ).rgb;
    float n = fbmS( sp, 9.0, 3, 21, px );
    vec3 grass = mix( srgbC( 88.0, 104.0, 52.0 ), srgbC( 110.0, 116.0, 66.0 ), 0.5 + 0.5 * fbmS( sp, 60.0, 2, 22, px ) ) * ( 0.92 + 0.12 * n );
    vec3 gravel = srgbC( 176.0, 170.0, 154.0 ) * ( 0.9 + 0.12 * n );
    vec3 sand = srgbC( 196.0, 184.0, 156.0 ) * ( 0.92 + 0.1 * n );
    albedo = mix( albedo, grass, o.r );
    albedo = mix( albedo, mix( sand, gravel, smoothstep( 0.4, 0.8, o.g ) ), o.g );
    albedo = mix( albedo, srgbC( 66.0, 62.0, 56.0 ) * ( 0.85 + 0.2 * n ), o.b * 0.85 );
    rough = mix( rough, 0.88, o.g );
  }
  float lzD = length( sp - uLz.xy );
  if ( lzD < uLz.z + 40.0 ) {
    float n = fbmS( sp, 9.0, 3, 21, px );
    float ap = 1.0 - smoothstep( uLz.z - 6.0, uLz.z + 4.0, lzD );
    float gr = 1.0 - smoothstep( uLz.z + 4.0, uLz.z + 38.0, lzD );
    albedo = mix( albedo, srgbC( 92.0, 106.0, 54.0 ) * ( 0.92 + 0.12 * n ), gr );
    albedo = mix( albedo, srgbC( 176.0, 170.0, 154.0 ) * ( 0.9 + 0.12 * n ), ap );
  }

  // the Earth imagery toward the edge, so the disk meets the globe
  float edgeW = smoothstep( 22000.0, uFadeR.x + 1500.0, dist );
  vec3 img = edgeW > 0.0 ? dayImagery( sp ) : vec3( 0.0 );
  albedo = mix( albedo, globeAlbedo( img, 0.0 ), edgeW );

  float ocean = smoothstep( 0.3, 0.7, cov.r );
  float wvar = 0.0;
  vec3 wN = upV;
  float foam = 0.0;
  vec3 body = vec3( 0.0 );
  if ( wet > 0.001 ) {
    vec2 slope = waveSlope( sp, uTime, px, ocean, wvar );
    wN = normalize( upV - eV * slope.x - sV * slope.y );
    foam = surf( sp, sdf, ocean, uTime, px );
    body = mix( waterBody( sdf, ocean ), globeAlbedo( img, 1.0 ), edgeW * ocean );
  }
  siteWater = wet;
  siteFoam = foam * wet;
  siteWaterN = wN;
  diffuseColor.rgb = mix( albedo, mix( body, srgbC( 236.0, 240.0, 240.0 ), foam ), wet );
  roughnessFactor = mix( rough, mix( clamp( 0.04 + sqrt( wvar ) * 1.4, 0.04, 0.55 ), 0.85, foam ), wet );
  metalnessFactor = 0.0;
  normal = normalize( mix( normal, wN, wet ) );
}
`;

const AFTER_LIGHTS = /* glsl */ `
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
  radiance *= ( 1.0 - siteWater );
#endif
`;

const AFTER_OPAQUE = /* glsl */ `
{
  vec3 V = normalize( vViewPosition );
  vec3 N = siteWaterN;
  vec3 upV = normalize( vUpV );
  float NV = max( dot( N, V ), 0.0 );
  float F = 0.02 + 0.98 * pow( 1.0 - NV, 5.0 );
  vec3 R = reflect( -V, N );
  float el = dot( R, upV );
  vec3 sky = mix( uSkyHorizon, uSkyZenith, smoothstep( 0.02, 0.7, el ) );
  sky = mix( uSkyHorizon * 0.85, sky, smoothstep( -0.2, 0.02, el ) );
  gl_FragColor.rgb += siteWater * ( 1.0 - siteFoam ) * F * sky;
}
#ifdef SITE_RING
  gl_FragColor.a = 1.0 - smoothstep( uFadeR.x, uFadeR.y, length( vSite ) );
#endif
${HAZE_FRAGMENT}
`;

export interface TerrainUniforms {
  uTime: { value: number };
  uSkyHorizon: { value: THREE.Color };
  uSkyZenith: { value: THREE.Color };
}

let dayTex: THREE.Texture | null = null;
function dayTexture(): THREE.Texture {
  if (dayTex) return dayTex;
  const big = tierSpec().maxTexture >= 4096;
  dayTex = new THREE.TextureLoader().load(asset(big ? 'textures/earth/day_4096.jpg' : 'textures/earth/day_2048.jpg'));
  dayTex.colorSpace = THREE.SRGBColorSpace;
  dayTex.anisotropy = 4;
  return dayTex;
}

export function makeTerrainMaterial(maps: SiteMaps, overlay: Overlay, ring: boolean, shared: TerrainUniforms): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, color: 0xffffff });
  const uniforms = {
    ...hazeUniforms,
    ...shared,
    uSdf: { value: maps.sdfTex },
    uCover: { value: maps.coverTex },
    uDay: { value: dayTexture() },
    uOverlay: { value: overlay.tex },
    uMap: { value: new THREE.Vector4(SITE_MAP.ext, SITE_MAP.sdfSize, SITE_MAP.sdfRange, SITE_MAP.sdfStep) },
    uOverExt: { value: OVERLAY.ext },
    uLatLon0: { value: new THREE.Vector2(deg(SITE.lat), deg(SITE.lon)) },
    uFadeR: { value: new THREE.Vector2(LOCAL_TERRAIN.innerKm * 1000, LOCAL_TERRAIN.outerKm * 1000) },
    uLz: { value: new THREE.Vector3(LANDING_ZONE.x, LANDING_ZONE.z, LZ.apron) },
  };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    if (ring) shader.defines = { ...(shader.defines ?? {}), SITE_RING: '' };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${PARS_V}`).replace('#include <project_vertex>', `#include <project_vertex>\n${MAIN_V}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${PARS_F}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${CLASSIFY}`)
      .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>\n${AFTER_LIGHTS}`)
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>\n${AFTER_OPAQUE}`);
  };
  m.customProgramCacheKey = () => (ring ? 'site-terrain-ring' : 'site-terrain');
  if (ring) {
    m.transparent = true;
    m.depthWrite = true;
  }
  return m;
}

export interface Terrain {
  group: THREE.Group;
  uniforms: TerrainUniforms;
  update(): void;
  dispose(): void;
}

const SKY_ZENITH_TINT = new THREE.Color(0.42, 0.6, 1.0);

export function buildTerrain(maps: SiteMaps, overlay: Overlay): Terrain {
  const spec = tierSpec();
  const nTheta = spec.detail >= 1 ? 512 : spec.detail >= 0.75 ? 384 : 256;
  const r0 = 16;
  const rIn = LOCAL_TERRAIN.innerKm * 1000;
  const rOut = LOCAL_TERRAIN.outerKm * 1000;
  const all = radii(r0, rOut, nTheta);
  const split = all.findIndex((r) => r >= rIn);
  const inner = [...all.slice(0, split), rIn];
  const outer = [rIn, ...all.slice(split).filter((r) => r > rIn + 1)];
  const uniforms: TerrainUniforms = {
    uTime: { value: 0 },
    uSkyHorizon: { value: new THREE.Color() },
    uSkyZenith: { value: new THREE.Color() },
  };
  const gIn = annulus(maps, inner, nTheta, true);
  const gOut = annulus(maps, outer, nTheta, false);
  const mIn = makeTerrainMaterial(maps, overlay, false, uniforms);
  const mOut = makeTerrainMaterial(maps, overlay, true, uniforms);
  const inside = new THREE.Mesh(gIn, mIn);
  inside.name = 'terrain';
  inside.receiveShadow = true;
  inside.frustumCulled = false;
  inside.renderOrder = 2; // after structures: early depth rejects the terrain behind them
  const ringMesh = new THREE.Mesh(gOut, mOut);
  ringMesh.name = 'terrain-fade-ring';
  ringMesh.receiveShadow = false;
  ringMesh.frustumCulled = false;
  ringMesh.renderOrder = -20; // first among transparent objects (before smoke and plumes)
  const group = new THREE.Group();
  group.add(inside, ringMesh);
  return {
    group,
    uniforms,
    update() {
      uniforms.uTime.value = frame.decor;
      const k = Math.max(0.05, skyState.sunIntensity / 3);
      uniforms.uSkyHorizon.value.copy(skyState.hazeColor).multiplyScalar(0.95);
      uniforms.uSkyZenith.value.copy(skyState.hazeColor).multiply(SKY_ZENITH_TINT).multiplyScalar(0.8 * k);
    },
    dispose() {
      gIn.dispose();
      gOut.dispose();
      mIn.dispose();
      mOut.dispose();
    },
  };
}
