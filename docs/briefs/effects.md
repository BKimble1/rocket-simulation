# Brief: exhaust plumes, smoke, steam, venting, RCS, entry plasma

## You own
`src/scene/effects/**` except `input.ts` (read-only contract), plus `src/dev/effects.tsx`.
Replace the stub `Effects` in `src/scene/effects/index.tsx` (keep the export name).

## Deliver `<Effects />` for the flight location
It reads `effects.source` (`src/scene/effects/input.ts`): emitters, plasma sources and pad state
as PURE FUNCTIONS OF MISSION TIME (`frame.missionTime`). Everything that tells the mission story
(the ground cloud after ignition, the exhaust trail left in the air) must be reconstructed from
mission time, so that seeking to T+40 s shows the same smoke that playing to T+40 s shows. The
technique: stateless particles. Each particle slot i has a spawn time (a fixed schedule in
mission time), a deterministic seed, and a lifetime; its state is a closed-form function of its
age (position from the emitter position at spawn time, obtained by calling
`source.emittersAt(spawnTime, ...)`, plus initial velocity, buoyancy, wind drift, spreading,
fade). Recompute spawn data for all live slots when `effects.seekEpoch` changes or time jumps
backward; otherwise only for slots that respawn. Use `frame.decor` only for flicker/turbulence
that tells nothing. Positions are absolute (frame I): subtract `frame.origin` when drawing
(keep particles in a group anchored near the camera to stay in float32 range).

## Looks (LOX/RP-1 gas-generator engines: adapt to the propellant; no generic cartoon flame)
* **First-stage plume at sea level**: bright yellow-white core with visible shock diamonds just
  behind each nozzle exit, merging into one turbulent, orange-yellow, sooty column (kerosene
  burns luminous with soot); flame length ~ 4-6 nozzle diameters of bright core, then a long
  darker orange-grey turbulent tail. Plus each engine's **gas-generator exhaust**: a dark, sooty
  jet from the duct beside the nozzle. As ambient pressure falls with altitude the plume
  **widens** (under-expansion): at 30-60 km it balloons into a large translucent plume and the
  engines' plumes merge; above ~70 km it is a wide faint glow. The shape is a function of
  `ambientPressure` and `throttle`.
* **Upper-stage (vacuum) plume**: faint, very wide, translucent pale orange/blue near the nozzle,
  fading fast; no dense smoke trail in vacuum. **Hypergolic** (service module, apogee engine):
  nearly transparent pale orange-pink. **Solid** (abort tower): bright, dense white-orange with
  a thick white smoke trail. **Cold-gas RCS**: brief white puffs visible in sunlight, dispersing
  in about a second. **Mono** (hydrazine): tiny faint puff.
* **Ignition**: engine start transient (flow ramps, flicker, a brief **green TEA-TEB flash** at
  the nozzle exit in the first ~0.5 s of `sinceIgnition` for kerolox engines).
* **Ground cloud**: at engine start and liftoff, the flame trench exhausts a huge billowing
  cloud of steam and smoke (mostly white/grey steam from the deluge water) that rolls out along
  the trench direction and rises, persists and drifts with a light wind for 1-3 minutes, lit by
  the Sun (bright tops, grey undersides), dispersing. It stays in the world (pad-local), never
  glued to the rocket. Use pad-local coordinates via `sitePosition`/`siteFrameQuaternion`.
  Trench exit position: pad-local ~ (PAD.trenchDir * 60 m) at ground level (`src/world/site.ts`).
* **Exhaust trail** in the lower atmosphere (below ~40 km): smoke/condensation left behind in
  world space along the past trajectory, widening and fading; thinning with altitude.
* **LOX venting** on the pad (`pad.venting`): white vapour wisps from vents that fall and drift
  (cold dense gas); **deluge** spray from nozzles when `pad.deluge` > 0.
* **Entry plasma** (`plasmaAt`): a glowing shock layer ahead of the heat shield (orange-pink,
  brightest at the stagnation point), a faint ionized wake, intensity-driven; for the booster's
  entry burn, heating glow around the base.

## Performance and quality
Pooled, bounded particle budgets scaled by `tierSpec().particles`; instanced quads or Points
with a custom shader (soft edges, lit by `skyState.sunDir`/colour, depth-aware fade near
geometry if you can do it cheaply, otherwise fade near the camera); restrained additive layers
for the hot core only; control overdraw (large overlapping transparent sprites are expensive:
fewer, better-shaped particles; use mesh-based volumes for the plume core). Transparent
materials: `depthWrite: false`. Custom shaders: log-depth chunks (see the build guide).

## Dev harness `src/dev/effects.tsx`
Build a synthetic `EffectsSource` (a stand-in vehicle on the pad that lifts off with a simple
profile: engines start at t=-3, liftoff t=0, acceleration ~3 m/s^2 then climbing; ambient
pressure from altitude) and render `<SpaceWorld/>` + `<LaunchSite/>` (stubs now) + a stand-in
cylinder + `<Effects/>`. URL: `?t=` (mission time), `alt=` (override altitude for plume tests),
`throttle=`, `kind=`, camera via `cam=`. Verify: T-2 (ignition, green flash), T+2, T+8 (ground
cloud from the pad camera `cam=-260,-330,18,38,10,40`), T+30, T+60 (trail), the plume at 1 km,
20 km, 45 km, 80 km (use `alt`), a vacuum upper-stage plume, RCS puffs, entry plasma.
Also verify determinism: the same `t` gives the same picture whether loaded directly or reached
by playing. Fix what looks wrong.
