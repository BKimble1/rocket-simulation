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
import { LOCAL_TERRAIN, LANDING_ZONE, GROUND_CAMS } from '../../world/site';
import { SITE, deg } from '../../world/frames';
import { skyState } from '../space/skyState';
import { tierSpec } from '../quality';
import { spaceTextures } from '../space/assets';
import { frame } from '../frame';
import { SITE_MAP } from './generated/regionalMap';
import { groundH, sphereY, type SiteMaps } from './map';
import { hazeUniforms, HAZE_PARS_FRAGMENT, HAZE_PARS_VERTEX, HAZE_VERTEX, HAZE_FRAGMENT } from './haze';
import { NOISE_GLSL, COLOR_GLSL } from './glsl';
import { OVERLAY, type Overlay } from './overlay';
import { LZ, TRENCH, trenchXZ, underHardstand } from './layout';
import { Quadtree, triangulate, type Focus, type Leaf } from './lod';

// ───────────────────────────── geometry ─────────────────────────────

/**
 * Where the terrain needs detail: cell size cMin (m) at the point, growing by k per metre of
 * distance (plus d^2 / FAR): about 1.6 m on the pad, 0.8 m where the flame trench reaches the
 * grade, a few metres around the landing zone and the ground camera sites.
 */
function terrainFoci(detail: number): Focus[] {
  const s = detail >= 1 ? 1 : detail >= 0.75 ? 1.25 : 1.6;
  const mouth = trenchXZ(TRENCH.sMouth - 4, 0);
  const C = GROUND_CAMS;
  return [
    { x: 0, z: 0, cMin: 1.6, k: 0.06 * s },
    { x: mouth.x, z: mouth.z, cMin: 0.8, k: 0.2 },
    { x: LANDING_ZONE.x, z: LANDING_ZONE.z, cMin: 5, k: 0.1 * s },
    { x: C.landing.x, z: C.landing.z, cMin: 3, k: 0.12 * s },
    { x: C.tracking.x, z: C.tracking.z, cMin: 4, k: 0.12 * s },
    { x: C.padWide.x, z: C.padWide.z, cMin: 3, k: 0.12 * s },
  ];
}

/** The terrain meshes: the opaque inner disk and the fading ring, on the spherical Earth. */
function terrainGeometry(maps: SiteMaps, detail: number, rIn: number, rOut: number): { inner: THREE.BufferGeometry; ring: THREE.BufferGeometry } {
  const tree = new Quadtree({ ext: SITE_MAP.ext, q: 8, foci: terrainFoci(detail), far: 100000, rOuter: rOut, maxLevel: 15 });
  const maxDist = (t: Leaf) => Math.hypot(Math.max(Math.abs(t.x0), Math.abs(t.x0 + t.size)), Math.max(Math.abs(t.z0), Math.abs(t.z0 + t.size)));
  const surface = (x: number, z: number): [number, number, number] => [x, sphereY(x, z, groundH(maps, x, z)), z];
  const make = (use: (t: Leaf) => boolean) => {
    const m = triangulate(tree, use, surface, underHardstand);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(m.position, 3));
    geo.setIndex(new THREE.BufferAttribute(m.index, 1));
    geo.computeVertexNormals();
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, (-rOut * rOut) / (2 * 6371000), 0), rOut * 1.5);
    return geo;
  };
  return { inner: make((t) => maxDist(t) <= rIn), ring: make((t) => maxDist(t) > rIn) };
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
uniform sampler2D uGlobeWater;
uniform vec2 uGlobeBlend;   // distances (m) over which the shading becomes the globe's
float siteWater;
float siteWaterVar;
vec3 siteImg;
float siteGW;
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
  // seen from altitude a Florida town is mostly tree canopy and lawns with grey roofs and streets
  vec3 avg = mix( land, srgbC( 78.0, 80.0, 72.0 ), 0.22 + 0.3 * dens ) * ( 0.9 + 0.18 * fbmS( p, 260.0, 2, 48, px ) );
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
  // thickets and hammocks: the patch field the plant scatter grows in (vegetation.ts suit()), so
  // the ground under the plants and the ground where they are culled (from altitude) agree:
  // palmetto and oak thickets darker, tree hammocks darker and greener, open prairie paler between.
  // Thicket edges are ragged at ~10 m. Normalised by its mean (0.909, 0.934, 0.839) and faded out
  // once the 140 m patches are finer than a few pixels, so the average tone (matched to the globe
  // imagery) does not change.
  {
    float fA = 1.0 - smoothstep( 30.0, 90.0, px );
    float fB = 1.0 - smoothstep( 8.0, 22.0, px );
    float fC = 1.0 - smoothstep( 2.5, 7.0, px );
    if ( fA > 0.0 ) {
      float patchN = mix( 0.5, vnoise( p / 140.0, 23 ), fA ) * 0.7 + mix( 0.5, vnoise( p / 37.0, 29 ), fB ) * 0.3;
      patchN += ( vnoise( p / 9.0, 31 ) - 0.5 ) * 0.12 * fC;
      float thicket = smoothstep( 0.38, 0.52, patchN );
      float hammock = smoothstep( 0.56, 0.7, patchN );
      vec3 modT = mix( vec3( 1.22, 1.17, 1.08 ), vec3( 0.78, 0.82, 0.76 ), thicket ) * mix( vec3( 1.0 ), vec3( 0.76, 0.88, 0.74 ), hammock );
      c *= mix( vec3( 1.0 ), modT / vec3( 0.909, 0.934, 0.839 ), fA );
    }
  }
  // close up, the scrub breaks into clumps with shadowed cores and pale sandy gaps
  float fine = 1.0 - smoothstep( 0.8, 5.0, px );
  if ( fine > 0.0 ) {
    float clump = vnoise( p / 2.1, 51 ) * 0.6 + vnoise( p / 0.8, 52 ) * 0.4;
    float gap = smoothstep( 0.66, 0.86, vnoise( p / 4.5, 53 ) * 0.6 + vnoise( p / 1.3, 54 ) * 0.4 );
    c = mix( c, c * ( 0.55 + 0.75 * clump ), fine );
    // open sand between the clumps only in drier stretches, not as an even speckle
    float gapZone = smoothstep( -0.1, 0.5, fbmS( p, 120.0, 2, 55, px ) );
    c = mix( c, srgbC( 118.0, 110.0, 90.0 ) * ( 0.9 + 0.2 * clump ), gap * 0.24 * gapZone * fine * ( 1.0 - cov.g ) );
  }
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
  float ampK = mix( 0.32, 1.0, ocean );
  float wl = mix( 16.0, 110.0, ocean );
  float base = atan( 0.38, -0.92 );
  // wind slicks and cat's paws: streaks of calmer and rougher water drawn out along the wind,
  // strongest on the sheltered lagoons (they carry the water's texture where the waves themselves
  // are finer than a pixel: from the tracking camera's low angle and from altitude)
  vec2 wd = vec2( cos( base ), sin( base ) );
  vec2 sq = vec2( dot( p, wd ) / 3.5, dot( p, vec2( -wd.y, wd.x ) ) );
  float slick = smoothstep( -0.3, 0.35, fbmS( sq, 240.0, 3, 73, px ) );
  ampK *= mix( mix( 0.3, 0.8, ocean ), mix( 1.6, 1.15, ocean ), slick );
  for ( int i = 0; i < 12; i++ ) {
    float fi = float( i );
    float spread = mix( 0.8, 1.4, fi / 11.0 );
    float ang = base + ( siteHash( ivec2( i, 3 ), 61 ) - 0.5 ) * spread * 2.0;
    vec2 dir = vec2( cos( ang ), sin( ang ) );
    float k = 6.2831853 / wl;
    float w = sqrt( 9.81 * k );
    float steep = mix( 0.03, 0.12, fi / 11.0 ) * ampK;
    // a wave stays only while it spans several pixels: shorter ones would alias into regular
    // stripes in the glint, so they turn into surface roughness instead
    float fade = smoothstep( 4.0, 12.0, wl / px );
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

vec2 globeUv( vec2 p ) {
  float lat = uLatLon0.x - p.y / 6371000.0;
  float lon = uLatLon0.y + p.x / ( 6371000.0 * cos( uLatLon0.x ) );
  return vec2( ( lon + 3.14159265 ) / 6.2831853, ( lat + 1.5707963 ) / 3.14159265 );
}
vec3 dayImagery( vec2 p ) {
  return texture2D( uDay, globeUv( p ) ).rgb;
}

// the globe's surface shading (sky module, skyPass earthSurface) for albedo and water mask:
// sunlight through the atmosphere, sky irradiance, sun glint and sky reflection on water
vec3 globeShade( vec3 day, float water, vec3 n, vec3 v ) {
  vec3 albedo = globeAlbedo( day, water );
  float muS = dot( n, uSunW );
  vec3 Ts = transmittanceSun( A_RB + 2.0, muS );
  vec3 col = albedo / PI * ( SUN_E * Ts * max( muS, 0.0 ) + SUN_E * skyIrradiance( muS ) );
  if ( water > 0.01 ) {
    vec3 h = normalize( v + uSunW );
    float NdotL = max( muS, 0.0 );
    float NdotV = max( dot( n, v ), 1e-3 );
    float NdotH = max( dot( n, h ), 0.0 );
    float VdotH = max( dot( v, h ), 0.0 );
    float a = 0.22;
    float a2 = a * a;
    float dd = NdotH * NdotH * ( a2 - 1.0 ) + 1.0;
    float D = a2 / ( PI * dd * dd );
    float F = 0.02 + 0.98 * pow( 1.0 - VdotH, 5.0 );
    float k = a * 0.5;
    float G = NdotL / ( NdotL * ( 1.0 - k ) + k ) * NdotV / ( NdotV * ( 1.0 - k ) + k );
    vec3 spec = SUN_E * Ts * D * F * G / ( 4.0 * NdotV );
    float Fv = 0.02 + 0.98 * pow( 1.0 - NdotV, 5.0 );
    col += water * ( spec + Fv * SUN_E * skyIrradiance( muS ) / PI * 1.4 );
  }
  return col;
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
    // mowed bahia grass: olive, with drier and greener patches and faint mower stripes
    vec3 grass = mix( srgbC( 80.0, 94.0, 50.0 ), srgbC( 104.0, 106.0, 64.0 ), 0.5 + 0.5 * fbmS( sp, 60.0, 2, 22, px ) );
    grass = mix( grass, srgbC( 118.0, 112.0, 74.0 ), smoothstep( 0.2, 0.7, fbmS( sp, 170.0, 2, 24, px ) ) * 0.45 );
    float stripe = sin( dot( sp, vec2( 0.8, 0.6 ) ) * 3.14159 / 2.4 );
    grass *= ( 0.92 + 0.12 * n ) * ( 1.0 + 0.035 * stripe * ( 1.0 - smoothstep( 0.3, 1.2, px ) ) );
    vec3 gravel = srgbC( 176.0, 170.0, 154.0 ) * ( 0.9 + 0.12 * n );
    vec3 sand = srgbC( 196.0, 184.0, 156.0 ) * ( 0.92 + 0.1 * n );
    // close up, the painted (1 m, blurred) masks become crisp, ragged edges: grass meets gravel
    // along a broken line instead of a soft halo; from afar the painted gradient stays
    float nearK = 1.0 - smoothstep( 0.6, 3.0, px );
    float rag = fbmS( sp, 2.2, 2, 25, px ) * 0.16 + fbmS( sp, 0.5, 1, 26, px ) * 0.05;
    float gEdge = 0.02 + px * 0.03;
    float gMask = mix( o.g, smoothstep( 0.26 - gEdge, 0.26 + gEdge, o.g + rag ), nearK );
    float rMask = mix( o.r, smoothstep( 0.45 - gEdge, 0.45 + gEdge, o.r + rag ), nearK );
    albedo = mix( albedo, grass, rMask );
    albedo = mix( albedo, mix( sand, gravel, smoothstep( 0.4, 0.8, o.g ) ), gMask );
    albedo = mix( albedo, srgbC( 66.0, 62.0, 56.0 ) * ( 0.85 + 0.2 * n ), o.b * 0.85 );
    rough = mix( rough, 0.88, gMask );
  }
  float lzD = length( sp - uLz.xy );
  if ( lzD < uLz.z + 40.0 ) {
    float n = fbmS( sp, 9.0, 3, 21, px );
    float ap = 1.0 - smoothstep( uLz.z - 6.0, uLz.z + 4.0, lzD );
    float gr = 1.0 - smoothstep( uLz.z + 4.0, uLz.z + 38.0, lzD );
    albedo = mix( albedo, srgbC( 82.0, 94.0, 52.0 ) * ( 0.92 + 0.12 * n ), gr );
    albedo = mix( albedo, srgbC( 176.0, 170.0, 154.0 ) * ( 0.9 + 0.12 * n ), ap );
  }

  // the Earth imagery toward the edge, so the disk meets the globe
  float edgeW = smoothstep( uGlobeBlend.x - 2000.0, uGlobeBlend.y, dist );
  vec3 img = edgeW > 0.0 ? dayImagery( sp ) : vec3( 0.0 );
  siteImg = img;
  siteGW = edgeW > 0.0 ? texture2D( uGlobeWater, globeUv( sp ) ).r : 0.0;
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
  siteWaterVar = wvar;
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
  // sub-pixel roughness spreads the reflection toward the higher, darker sky: rough patches read
  // darker, calm slicks mirror the bright horizon
  float el = dot( R, upV ) + min( sqrt( siteWaterVar ) * 5.0, 0.35 );
  vec3 sky = mix( uSkyHorizon, uSkyZenith, smoothstep( 0.02, 0.7, el ) );
  sky = mix( uSkyHorizon * 0.85, sky, smoothstep( -0.2, 0.02, el ) );
  gl_FragColor.rgb += siteWater * ( 1.0 - siteFoam ) * F * sky;
  // toward the disk's edge the shading becomes the globe's own (same imagery, water mask,
  // lighting), so where the ring fades out the globe underneath shows the same colours
  float wG = smoothstep( uGlobeBlend.x, uGlobeBlend.y, length( vSite ) );
  if ( wG > 0.0 ) {
    vec3 nW = normalize( uHazeCam + vHazePos );
    vec3 vW = -normalize( vHazePos );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, globeShade( siteImg, siteGW, nW, vW ), wG );
  }
}
#ifdef SITE_RING
  gl_FragColor.a = 1.0 - smoothstep( uFadeR.x, uFadeR.y, length( vSite ) );
#endif
${HAZE_FRAGMENT}
`;

export interface TerrainUniforms {
  uTime: { value: number };
  /** The globe's day imagery and water mask (the sky module's textures, swapped in when loaded). */
  uDay: { value: THREE.Texture };
  uGlobeWater: { value: THREE.Texture };
  uSkyHorizon: { value: THREE.Color };
  uSkyZenith: { value: THREE.Color };
}

export function makeTerrainMaterial(maps: SiteMaps, overlay: Overlay, ring: boolean, shared: TerrainUniforms): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, color: 0xffffff });
  const uniforms = {
    ...hazeUniforms,
    ...shared,
    uSdf: { value: maps.sdfTex },
    uCover: { value: maps.coverTex },
    uDay: shared.uDay,
    uGlobeWater: shared.uGlobeWater,
    // from 20 km out the shading eases into the globe's own (fully by the inner radius), so the
    // site's brighter near-shore water does not leave a band ahead of the disk's edge
    uGlobeBlend: { value: new THREE.Vector2(20000, LOCAL_TERRAIN.innerKm * 1000 - 500) },
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
  const rIn = LOCAL_TERRAIN.innerKm * 1000;
  const rOut = LOCAL_TERRAIN.outerKm * 1000;
  const uniforms: TerrainUniforms = {
    uTime: { value: 0 },
    uDay: { value: spaceTextures.day },
    uGlobeWater: { value: spaceTextures.water },
    uSkyHorizon: { value: new THREE.Color() },
    uSkyZenith: { value: new THREE.Color() },
  };
  const { inner: gIn, ring: gOut } = terrainGeometry(maps, spec.detail, rIn, rOut);
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
  // first among the transparent objects: after the sky and globe pass (-1000), before the cloud
  // composites (-500) so the clouds lie over the fading edge exactly as over the opaque disk
  // (drawn after them it would thin the clouds out in a ring), and before smoke and plumes
  ringMesh.renderOrder = -600;
  const group = new THREE.Group();
  group.add(inside, ringMesh);
  return {
    group,
    uniforms,
    update() {
      uniforms.uTime.value = frame.decor;
      uniforms.uDay.value = spaceTextures.day;
      uniforms.uGlobeWater.value = spaceTextures.water;
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
