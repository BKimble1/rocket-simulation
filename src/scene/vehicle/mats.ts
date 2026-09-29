/**
 * The vehicle's render materials: local variants of the shared palette (`M()` in
 * scene/materials.ts, never edited here), one set per vehicle instance so each model has its
 * own frost / soot state and cut planes.
 *
 * "Skin" materials (paints, the interstage composite, decals) run a small shader extension:
 *  - frost: LOX-tank frost on the pad (patchy white rime with vertical streaks, matte);
 *  - soot: booster entry soot, heavier toward the base, streaked along the flow;
 *  - seams: procedural panel-weld grooves (bump from screen-space derivatives, faded out with
 *    distance so they never alias).
 * They read the per-vertex model-frame position `aVeh.xyz` (baked at build time, so moving
 * parts keep their stowed-pose pattern) and a soot weight `aVeh.w`.
 *
 * Variants (cached): clip (wedge cutaway planes), highlight (emissive tint + rim), dim (ghosted),
 * the materials lens (colour per MaterialId) and the thermal lens (colour per thermal class, split
 * along the axis for meshes that span two classes).
 */
import * as THREE from 'three';
import { M, ACCENT, GRAPHITE, WHITE, roughnessNoise, brushedNormal, weaveNormal } from '../materials';
import type { MaterialId } from '../../content/materials/ids';
import { hatchTexture, honeycombSectionTexture, honeycombFaceTexture, woundTexture, fabricTexture } from './textures';
import { THERMAL_COLORS, type ThermalTag } from './thermal';

/** Materials-lens colours (legend for the Materials view). */
export const LENS_COLORS: Record<MaterialId, string> = {
  'al-li': '#4f8fd8',
  'al-2219': '#7fb6ee',
  stainless: '#b7c0c9',
  grcop: '#d9824a',
  'nickel-superalloy': '#b0503c',
  'niobium-c103': '#8a6fb8',
  titanium: '#3fb3a6',
  'cfrp-sandwich': '#3d8f4e',
  'cfrp-copv': '#8cc269',
  ablator: '#7a4a2c',
  'ceramic-tiles': '#e2d7bf',
  mli: '#e2b43d',
  'cryo-foam': '#e0873a',
  'honeycomb-core': '#c9b36b',
  textiles: '#d98bb3',
  'structural-steel': '#6b7a8c',
  'refractory-concrete': '#b9a58c',
};

export const HIGHLIGHT = new THREE.Color('#ffb54a');

export type Look =
  | 'paint'
  | 'paintSeam'
  | 'graphite'
  | 'interstage'
  | 'accent'
  | 'legCarbon'
  | 'legInner'
  | 'alu'
  | 'aluMilled'
  | 'aluDark'
  | 'aluBright'
  | 'stainless'
  | 'titanium'
  | 'finTi'
  | 'inconel'
  | 'heatShield'
  | 'blackAnod'
  | 'copv'
  | 'boot'
  | 'rubber'
  | 'fairingInner'
  | 'adapter'
  | 'radome'
  | 'gold'
  | 'hatch'
  | 'honeyCut'
  | 'honeycomb'
  | 'lox'
  | 'rp1'
  | 'glassDark'
  | 'foot';

export type SkinOpts = { seams?: boolean; soot?: boolean; frost?: boolean };

const SKIN_VERT_PARS = /* glsl */ `
attribute vec4 aVeh;
varying vec4 vVeh;
`;

const SKIN_FRAG_PARS = /* glsl */ `
varying vec4 vVeh;
uniform float uFrost;
uniform float uScorch;
uniform vec4 uFrostBands;
uniform vec4 uSeam;
float vhash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(vhash(i), vhash(i + vec3(1.0, 0.0, 0.0)), f.x), mix(vhash(i + vec3(0.0, 1.0, 0.0)), vhash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(vhash(i + vec3(0.0, 0.0, 1.0)), vhash(i + vec3(1.0, 0.0, 1.0)), f.x), mix(vhash(i + vec3(0.0, 1.0, 1.0)), vhash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
float vfbm(vec3 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
  return s;
}
float skinBand(float y, float y0, float y1) {
  return smoothstep(y0, y0 + 0.35, y) * (1.0 - smoothstep(y1 - 0.25, y1, y));
}
#ifdef SKIN_SEAMS
float skinSeamH(vec3 p) {
  float phi = atan(p.x, p.z);
  float u = phi * 1.85;
  float du = abs(fract(u / uSeam.x) - 0.5) * uSeam.x;
  float dv = abs(fract((p.y - uSeam.z) / uSeam.y + 0.5) - 0.5) * uSeam.y;
  float d = min(du, dv);
  return -uSeam.w * (1.0 - smoothstep(0.0, 0.0065, d));
}
vec3 skinPerturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDir) {
  vec3 vSigmaX = dFdx(surf_pos);
  vec3 vSigmaY = dFdy(surf_pos);
  vec3 R1 = cross(vSigmaY, surf_norm);
  vec3 R2 = cross(surf_norm, vSigmaX);
  float fDet = dot(vSigmaX, R1) * faceDir;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surf_norm - vGrad);
}
#endif
`;

const SKIN_COLOR = /* glsl */ `
float skinFrostM = 0.0;
float skinSootM = 0.0;
float skinFade = 1.0 - smoothstep(0.01, 0.06, length(fwidth(vVeh.xyz)));
{
  vec3 sp = vVeh.xyz;
#ifdef SKIN_FROST
  float fb = max(skinBand(sp.y, uFrostBands.x, uFrostBands.y), skinBand(sp.y, uFrostBands.z, uFrostBands.w));
  float fm = uFrost * fb;
  if (fm > 0.001) {
    // patches of about 30 cm with fairly crisp edges, in vertical runs (condensate runs down),
    // a granular crust inside them; thin frost is a matte blue-grey, thick frost near white, so
    // it reads on the white paint and breaks up the livery instead of tinting it evenly
    float patchN = vfbm(sp * vec3(2.6, 0.9, 2.6));
    float streak = vnoise(vec3(sp.x * 9.0, sp.y * 0.8, sp.z * 9.0));
    float fine = vnoise(sp * 70.0) * skinFade;
    float cover = smoothstep(0.47, 0.6, patchN * 0.75 + streak * 0.4 + (fm - 1.0) * 0.7);
    skinFrostM = clamp(cover * (0.45 + 0.35 * fm) + fine * 0.08 * fm * cover, 0.0, 0.82);
    vec3 frostCol = mix(vec3(0.78, 0.84, 0.9), vec3(0.975, 0.985, 1.0), clamp(fine * 0.8 + (patchN - 0.45) * 1.6, 0.0, 1.0));
    diffuseColor.rgb = mix(diffuseColor.rgb, frostCol, skinFrostM);
  }
#endif
#ifdef SKIN_SOOT
  float sw = vVeh.w * uScorch;
  if (sw > 0.001) {
    // entry-burn soot: heavy on the lower two thirds, darkest toward the base, in vertical
    // streaks (broad and fine) with blotches; the forward skirt stays mostly clean
    float h = clamp(1.0 - (sp.y - 1.0) / 36.0, 0.0, 1.0);
    float streak = vnoise(vec3(sp.x * 4.5, sp.y * 0.16, sp.z * 4.5));
    float fineStreak = vnoise(vec3(sp.x * 14.0, sp.y * 0.35, sp.z * 14.0));
    float blot = vfbm(sp * vec3(0.9, 0.3, 0.9));
    float s = h * (0.5 + 0.6 * streak + 0.3 * (fineStreak - 0.5) * skinFade) + blot * 0.35 * h + 0.25 * h * h * h;
    skinSootM = clamp(sw * smoothstep(0.14, 0.78, s), 0.0, 1.0);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.042, 0.034), skinSootM * 0.96);
  }
#endif
#ifdef SKIN_SEAMS
  float skinSeam = skinSeamH(sp);
  diffuseColor.rgb *= 1.0 - 0.9 * (-skinSeam / max(uSeam.w, 1e-5)) * 0.12 * skinFade;
#endif
}
`;

const SKIN_ROUGH = /* glsl */ `
roughnessFactor = mix(roughnessFactor, 0.93, skinFrostM);
roughnessFactor = mix(roughnessFactor, 0.82, skinSootM);
`;

const SKIN_NORMAL = /* glsl */ `
#ifdef SKIN_SEAMS
{
  float hh = skinSeamH(vVeh.xyz) * skinFade;
  vec2 dH = vec2(dFdx(hh), dFdy(hh));
  normal = skinPerturb(-vViewPosition, normal, dH, faceDirection);
}
#endif
`;

const SKIN_CLEARCOAT = /* glsl */ `
#ifdef USE_CLEARCOAT
material.clearcoat *= (1.0 - skinFrostM) * (1.0 - skinSootM);
#endif
`;

const RIM = /* glsl */ `
{
  vec3 vdir = normalize(vViewPosition);
  float fr = 1.0 - abs(dot(normal, vdir));
  totalEmissiveRadiance += uHiColor * (uHiBase + uHiRim * pow(fr, 2.2));
}
`;

type Hook = (shader: THREE.WebGLProgramParametersWithUniforms) => void;

export function withHook(m: THREE.Material, key: string, hook: Hook) {
  const prev = (m as THREE.Material & { __hooks?: { key: string; hook: Hook }[] }).__hooks ?? [];
  const hooks = [...prev, { key, hook }];
  (m as THREE.Material & { __hooks?: { key: string; hook: Hook }[] }).__hooks = hooks;
  m.onBeforeCompile = (shader) => {
    for (const h of hooks) h.hook(shader);
  };
  const cacheKey = hooks.map((h) => h.key).join('|');
  m.customProgramCacheKey = () => cacheKey;
}

function hooksOf(m: THREE.Material): { key: string; hook: Hook }[] {
  return (m as THREE.Material & { __hooks?: { key: string; hook: Hook }[] }).__hooks ?? [];
}

/** Clone a material keeping its shader hooks and (shared) clipping planes. */
export function cloneMat<T extends THREE.Material>(m: T): T {
  const c = m.clone() as T;
  c.clippingPlanes = m.clippingPlanes;
  c.clipIntersection = m.clipIntersection;
  c.clipShadows = m.clipShadows;
  for (const h of hooksOf(m)) withHook(c, h.key, h.hook);
  c.name = m.name;
  c.userData = { ...m.userData };
  return c;
}

export class VehicleMats {
  readonly uniforms = {
    uFrost: { value: 0 },
    uScorch: { value: 0 },
    // booster LOX tank barrel, upper-stage LOX tank region (model y)
    uFrostBands: { value: new THREE.Vector4(17.6, 36.3, 49.0, 52.8) },
    // panel width (m of arc at R 1.85: 4 panels round), barrel section height, y offset, groove depth
    uSeam: { value: new THREE.Vector4((2 * Math.PI * 1.85) / 4, 2.34, 0.2, 0.0007) },
  };
  /** Shared wedge planes for every clipped material of this vehicle. */
  readonly planes = [new THREE.Plane(new THREE.Vector3(1, 0, 0), 1e6), new THREE.Plane(new THREE.Vector3(1, 0, 0), 1e6)];
  readonly hiUniforms = { uHiColor: { value: HIGHLIGHT.clone() }, uHiBase: { value: 0.16 }, uHiRim: { value: 0.75 } };
  private looks = new Map<string, THREE.Material>();
  private variants = new Map<string, THREE.Material>();
  private owned: THREE.Material[] = [];
  private ownedTex: THREE.Texture[] = [];

  constructor(public readonly hangar: boolean) {}

  private skin(m: THREE.Material, o: SkinOpts) {
    const u = this.uniforms;
    const defs = [o.seams && this.hangar ? 'SKIN_SEAMS' : '', o.soot ? 'SKIN_SOOT' : '', o.frost ? 'SKIN_FROST' : ''].filter(Boolean);
    withHook(m, `skin:${defs.join(',')}`, (s) => {
      Object.assign(s.uniforms, u);
      const d = defs.map((x) => `#define ${x}\n`).join('');
      s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>\n${SKIN_VERT_PARS}`).replace('#include <begin_vertex>', '#include <begin_vertex>\nvVeh = aVeh;');
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', `${d}#include <common>\n${SKIN_FRAG_PARS}`)
        .replace('#include <map_fragment>', `#include <map_fragment>\n${SKIN_COLOR}`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${SKIN_ROUGH}`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${SKIN_NORMAL}`)
        .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>\n${SKIN_CLEARCOAT}`);
    });
    m.userData.skin = true;
  }

  private own<T extends THREE.Material>(m: T): T {
    this.owned.push(m);
    return m;
  }

  /** A render material by look key (created on first use). */
  get(look: Look | string): THREE.Material {
    const hit = this.looks.get(look);
    if (hit) return hit;
    const m = this.make(look);
    m.name = `vehicle:${look}`;
    this.looks.set(look, m);
    return m;
  }

  /** Register a custom material under a look key (decals). */
  register(look: string, m: THREE.Material, texs: THREE.Texture[] = []) {
    m.name = `vehicle:${look}`;
    this.looks.set(look, this.own(m));
    this.ownedTex.push(...texs);
    return m;
  }

  /** Apply the skin shader to a custom material. */
  makeSkin(m: THREE.Material, o: SkinOpts) {
    this.skin(m, o);
  }

  private make(look: string): THREE.Material {
    const phys = (key: Parameters<typeof M>[0]) => this.own(cloneMat(M(key) as THREE.MeshPhysicalMaterial));
    const std = (key: Parameters<typeof M>[0]) => this.own(cloneMat(M(key) as THREE.MeshStandardMaterial));
    switch (look) {
      case 'paint':
      case 'paintSeam': {
        const m = phys('paintWhite');
        m.color.set(WHITE);
        m.roughness = 0.5;
        m.clearcoat = 0.22;
        m.clearcoatRoughness = 0.45;
        this.skin(m, { seams: look === 'paintSeam', soot: true, frost: true });
        return m;
      }
      case 'graphite': {
        const m = phys('paintGraphite');
        this.skin(m, { soot: true, seams: false });
        return m;
      }
      case 'interstage': {
        // satin carbon composite: dark, low sheen, a hint of weave at close range
        const m = this.own(
          new THREE.MeshPhysicalMaterial({ color: '#27292e', roughness: 0.58, metalness: 0, clearcoat: 0.12, clearcoatRoughness: 0.55, normalMap: weaveNormal(), normalScale: new THREE.Vector2(0.08, 0.08) }),
        );
        const nm = m.normalMap!.clone();
        nm.repeat.set(24, 24);
        nm.needsUpdate = true;
        m.normalMap = nm;
        this.ownedTex.push(nm);
        this.skin(m, { soot: true });
        return m;
      }
      case 'accent': {
        const m = phys('accent');
        m.color.set(ACCENT);
        this.skin(m, { soot: true });
        return m;
      }
      case 'legCarbon': {
        const m = phys('carbon');
        m.color.set('#1b1c1f');
        m.clearcoat = 0.35;
        m.roughness = 0.42;
        // leg lofts carry u = 0..1 round the section (about 3 m of perimeter), v in metres: a fine
        // twill of about 8 mm cells, faint (it only reads at close range)
        if (m.normalMap) {
          const nm = m.normalMap.clone();
          nm.repeat.set(48, 16);
          nm.needsUpdate = true;
          m.normalMap = nm;
          m.normalScale.set(0.12, 0.12);
          this.ownedTex.push(nm);
        }
        this.skin(m, { soot: true });
        return m;
      }
      case 'legInner':
        return this.own(new THREE.MeshStandardMaterial({ color: '#202124', roughness: 0.7, metalness: 0 }));
      case 'alu': {
        const m = std('aluminum');
        m.color.set('#c3c7cc');
        m.roughness = 0.38;
        return m;
      }
      case 'aluMilled': {
        const m = std('aluminumMilled');
        m.color.set('#b4b9bf');
        return m;
      }
      case 'aluDark':
        return std('aluminumDark');
      case 'aluBright': {
        const m = std('aluminum');
        m.color.set('#d5d8dc');
        m.roughness = 0.24;
        return m;
      }
      case 'stainless':
        return std('stainless');
      case 'titanium':
        return std('titanium');
      case 'finTi': {
        const m = std('titanium');
        m.color.set('#8b8c90');
        m.roughness = 0.46;
        this.skin(m, { soot: true });
        return m;
      }
      case 'inconel':
        return std('inconel');
      case 'heatShield': {
        const m = std('inconelHot');
        m.color.set('#6d6760');
        m.roughness = 0.62;
        m.metalness = 0.75;
        this.skin(m, { soot: true });
        return m;
      }
      case 'blackAnod':
        return std('blackAnodized');
      case 'copv': {
        const t = woundTexture();
        const m = this.own(new THREE.MeshPhysicalMaterial({ color: '#ffffff', map: t, roughness: 0.4, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.3 }));
        return m;
      }
      case 'boot': {
        // double-sided: the boots are also seen from inside the engine bay (thrust-section cutaway)
        const t = fabricTexture();
        return this.own(new THREE.MeshStandardMaterial({ color: '#ffffff', map: t, roughness: 0.95, metalness: 0, side: THREE.DoubleSide, shadowSide: THREE.BackSide }));
      }
      case 'rubber':
        return std('rubber');
      case 'fairingInner':
        return this.own(new THREE.MeshStandardMaterial({ color: '#3a3c40', roughness: 0.75, metalness: 0, normalMap: weaveNormal(), normalScale: new THREE.Vector2(0.15, 0.15) }));
      case 'adapter':
        return this.own(new THREE.MeshPhysicalMaterial({ color: '#2d2f34', roughness: 0.5, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.4 }));
      case 'radome':
        return this.own(new THREE.MeshStandardMaterial({ color: '#e9e6de', roughness: 0.62, metalness: 0 }));
      case 'gold':
        return std('mliGold');
      case 'glassDark':
        return this.own(new THREE.MeshStandardMaterial({ color: '#15181c', roughness: 0.2, metalness: 0.5 }));
      case 'foot': {
        const m = std('aluminumMilled');
        m.color.set('#a9aeb4');
        m.roughnessMap = roughnessNoise(31, 0.3);
        return m;
      }
      case 'hatch': {
        const t = hatchTexture().clone();
        t.repeat.set(1 / 0.018, 1 / 0.018);
        t.needsUpdate = true;
        this.ownedTex.push(t);
        return this.own(new THREE.MeshStandardMaterial({ color: '#ffffff', map: t, roughness: 0.75, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
      }
      case 'honeyCut': {
        const t = honeycombSectionTexture().clone();
        t.repeat.set(1 / 0.02, 1);
        t.needsUpdate = true;
        this.ownedTex.push(t);
        return this.own(new THREE.MeshStandardMaterial({ color: '#ffffff', map: t, roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
      }
      case 'honeycomb': {
        const t = honeycombFaceTexture().clone();
        t.repeat.set(1 / 0.03, 1 / 0.03);
        t.needsUpdate = true;
        this.ownedTex.push(t);
        return this.own(new THREE.MeshStandardMaterial({ color: '#ffffff', map: t, roughness: 0.55, metalness: 0.5 }));
      }
      case 'loxCap':
      case 'rp1Cap': {
        // liquid cut faces: seen from either side of the wedge planes
        const m = this.own(cloneMat(this.get(look === 'loxCap' ? 'lox' : 'rp1')));
        m.side = THREE.DoubleSide;
        m.opacity = Math.min(1, m.opacity + 0.12);
        return m;
      }
      case 'lox':
        return this.own(
          new THREE.MeshStandardMaterial({ color: '#9fd0ff', emissive: '#16324f', roughness: 0.12, metalness: 0, transparent: true, opacity: 0.5, depthWrite: false }),
        );
      case 'rp1':
        return this.own(
          new THREE.MeshStandardMaterial({ color: '#e7a84a', emissive: '#3d2408', roughness: 0.12, metalness: 0, transparent: true, opacity: 0.55, depthWrite: false }),
        );
    }
    // unknown: neutral
    return this.own(new THREE.MeshStandardMaterial({ color: '#888888' }));
  }

  // ───────────── variants ─────────────

  /** The clipped (cutaway) version of a material. */
  clip(m: THREE.Material): THREE.Material {
    const k = `clip|${m.uuid}`;
    let v = this.variants.get(k);
    if (!v) {
      v = this.own(cloneMat(m));
      v.clippingPlanes = this.planes;
      v.clipIntersection = true;
      v.clipShadows = true;
      v.userData.clipped = true;
      this.variants.set(k, v);
    }
    return v;
  }

  /** Selected look: emissive warm tint and a fresnel rim. */
  highlight(m: THREE.Material): THREE.Material {
    const k = `hi|${m.uuid}`;
    let v = this.variants.get(k);
    if (!v) {
      v = this.own(cloneMat(m));
      const hu = this.hiUniforms;
      if ('emissive' in v) {
        withHook(v, 'rim', (s) => {
          Object.assign(s.uniforms, hu);
          s.fragmentShader = s.fragmentShader
            .replace('#include <common>', '#include <common>\nuniform vec3 uHiColor;\nuniform float uHiBase;\nuniform float uHiRim;')
            .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${RIM}`);
        });
      } else if ('color' in v) {
        (v as THREE.MeshBasicMaterial).color.lerp(HIGHLIGHT, 0.5);
      }
      if (v.transparent && v.opacity < 1) v.opacity = Math.min(1, v.opacity + 0.2);
      this.variants.set(k, v);
    }
    return v;
  }

  /** Ghosted look for everything that is not selected. */
  dim(m: THREE.Material): THREE.Material {
    const k = `dim|${m.uuid}`;
    let v = this.variants.get(k);
    if (!v) {
      v = this.own(cloneMat(m));
      const c = (v as THREE.MeshStandardMaterial).color;
      if (c) {
        const l = c.getHSL({ h: 0, s: 0, l: 0 }).l;
        c.setHSL(0.6, 0.05, 0.35 + l * 0.4);
      }
      if ('map' in v) (v as THREE.MeshStandardMaterial).map = null;
      v.transparent = true;
      v.opacity = Math.min(v.opacity, 0.14);
      v.depthWrite = false;
      if ('clearcoat' in v) (v as THREE.MeshPhysicalMaterial).clearcoat = 0;
      v.needsUpdate = true;
      this.variants.set(k, v);
    }
    return v;
  }

  /** Materials lens: flat family colour; `hi` adds the highlight; `dim` ghosts it. */
  lens(id: MaterialId | null, clipped: boolean, mode: 'plain' | 'hi' | 'dim'): THREE.Material {
    const k = `lens|${id}|${clipped}|${mode}`;
    let v = this.variants.get(k);
    if (!v) {
      const base = this.own(new THREE.MeshStandardMaterial({ color: id ? LENS_COLORS[id] : '#9aa0a8', roughness: 0.62, metalness: 0.05 }));
      if (clipped) {
        base.clippingPlanes = this.planes;
        base.clipIntersection = true;
        base.clipShadows = true;
      }
      v = mode === 'hi' ? this.highlight(base) : mode === 'dim' ? this.dim(base) : base;
      this.variants.set(k, v);
    }
    return v;
  }

  /** A copy of a material with another base colour (the liquids in the thermal lens). */
  tint(m: THREE.Material, color: string): THREE.Material {
    const k = `tint|${m.uuid}|${color}`;
    let v = this.variants.get(k);
    if (!v) {
      v = this.own(cloneMat(m));
      const sm = v as THREE.MeshStandardMaterial;
      if (sm.color) sm.color.set(color);
      if (sm.emissive) sm.emissive.set(color).multiplyScalar(0.15);
      this.variants.set(k, v);
    }
    return v;
  }

  /** Thermal lens: flat class colour (split at a model height when the tag says so). */
  thermal(tag: ThermalTag | null, clipped: boolean, mode: 'plain' | 'hi' | 'dim'): THREE.Material {
    const t = tag ?? { level: 1 };
    const k = `thermal|${t.level}|${t.split ? `${t.split.y}:${t.split.below}` : '-'}|${clipped}|${mode}`;
    let v = this.variants.get(k);
    if (!v) {
      const base = this.own(new THREE.MeshStandardMaterial({ color: THERMAL_COLORS[t.level], roughness: 0.62, metalness: 0.05 }));
      if (clipped) {
        base.clippingPlanes = this.planes;
        base.clipIntersection = true;
        base.clipShadows = true;
      }
      if (t.split) {
        // model-frame height from the skin attribute (baked at build time on every kit mesh)
        const u = { uTSplit: { value: t.split.y }, uTBelow: { value: new THREE.Color(THERMAL_COLORS[t.split.below]) } };
        withHook(base, 'thermal-split', (s) => {
          Object.assign(s.uniforms, u);
          s.vertexShader = s.vertexShader
            .replace('#include <common>', '#include <common>\nattribute vec4 aVeh;\nvarying float vTY;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTY = aVeh.y;');
          s.fragmentShader = s.fragmentShader
            .replace('#include <common>', '#include <common>\nuniform float uTSplit;\nuniform vec3 uTBelow;\nvarying float vTY;')
            .replace('#include <color_fragment>', '#include <color_fragment>\nif (vTY < uTSplit) diffuseColor.rgb = uTBelow;');
        });
      }
      v = mode === 'hi' ? this.highlight(base) : mode === 'dim' ? this.dim(base) : base;
      this.variants.set(k, v);
    }
    return v;
  }

  dispose() {
    for (const m of this.owned) m.dispose();
    for (const t of this.ownedTex) t.dispose();
    this.owned.length = 0;
    this.looks.clear();
    this.variants.clear();
  }
}

export { GRAPHITE, WHITE, brushedNormal };
