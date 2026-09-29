/** GLSL shared by the effects shaders. */

/** Hash, value noise, fBm, dithering, erf. */
export const NOISE = /* glsl */ `
float fxHash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float fxNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = fxHash13(i);
  float n100 = fxHash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = fxHash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = fxHash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = fxHash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = fxHash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = fxHash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = fxHash13(i + vec3(1.0, 1.0, 1.0));
  return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y), mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
}
float fxFbm(vec3 p) {
  float a = 0.5 * fxNoise(p);
  a += 0.25 * fxNoise(p * 2.03 + vec3(17.1, 3.3, 9.7));
  a += 0.125 * fxNoise(p * 4.07 + vec3(31.7, 11.9, 5.1));
  return a / 0.875;
}
/** Per-pixel jitter for ray marching (white noise: grain instead of streaks). */
float fxIGN(vec2 px) {
  vec3 p3 = fract(vec3(px.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float fxErf(float x) {
  float s = sign(x);
  float a = abs(x);
  float t = 1.0 / (1.0 + 0.47047 * a);
  float y = 1.0 - (0.3480242 * t - 0.0958798 * t * t + 0.7478556 * t * t * t) * exp(-a * a);
  return s * y;
}
`;

/** Tone map and encode a linear colour exactly as three.js does for built-in materials. */
export const OUTPUT = /* glsl */ `
vec3 fxOut(vec3 c) {
#ifdef TONE_MAPPING
  c = toneMapping(c);
#endif
  return linearToOutputTexel(vec4(c, 1.0)).rgb;
}
`;
