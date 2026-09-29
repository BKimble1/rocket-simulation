/** GLSL helpers shared by the site shaders (noise mirrors map.ts so CPU and GPU agree). */

export const NOISE_GLSL = /* glsl */ `
float siteHash( ivec2 i, int seed ) {
  uint h = uint( i.x ) * 374761393u + uint( i.y ) * 668265263u + uint( seed ) * 1442695041u;
  h = ( h ^ ( h >> 13u ) ) * 1274126177u;
  h = h ^ ( h >> 16u );
  return float( h >> 8u ) / 16777216.0;
}
float vnoise( vec2 p, int seed ) {
  vec2 i = floor( p );
  vec2 f = p - i;
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  ivec2 ii = ivec2( i );
  float a = siteHash( ii, seed );
  float b = siteHash( ii + ivec2( 1, 0 ), seed );
  float c = siteHash( ii + ivec2( 0, 1 ), seed );
  float d = siteHash( ii + ivec2( 1, 1 ), seed );
  return mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y );
}
// signed fBm in [-1, 1]; octaves finer than ~2 pixels fade out (px = metres per pixel)
float fbmS( vec2 p, float wavelength, int octaves, int seed, float px ) {
  float s = 0.0;
  float amp = 0.5;
  float norm = 1.0 - exp2( -float( octaves ) );
  float f = 1.0 / wavelength;
  float wl = wavelength;
  for ( int o = 0; o < 6; o++ ) {
    if ( o >= octaves ) break;
    float fade = 1.0 - smoothstep( 1.5, 4.0, px / wl * 2.0 );
    if ( fade <= 0.0 ) break;
    s += amp * fade * ( vnoise( p * f, seed + o * 17 ) * 2.0 - 1.0 );
    amp *= 0.5;
    f *= 2.03;
    wl /= 2.03;
  }
  return s / norm;
}
`;

export const COLOR_GLSL = /* glsl */ `
vec3 srgbC( float r, float g, float b ) {
  vec3 c = vec3( r, g, b ) / 255.0;
  return pow( c, vec3( 2.2 ) );
}
`;
