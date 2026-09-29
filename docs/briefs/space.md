# Brief: sky, atmosphere, Earth, clouds, stars, Sun, Moon, lighting (ground to deep space)

## You own
`src/scene/space/**` (including `skyState.ts`, keep its fields) and `src/dev/space.tsx`.
Replace the stub `SpaceWorld` in `src/scene/space/index.tsx` (keep the export name).

## Deliver `<SpaceWorld />` for the flight location, correct at every altitude
The camera goes from 2 m above the pad, through the clouds, to orbit (200-400 km), to GTO
(35,000 km) and to the Moon (384,400 km). Read `src/world/frames.ts` (frame I, Earth
rotation, `earthMeshQuaternion`, `SUN_DIRECTION`, `moonPosition`), `src/scene/frame.ts`
(floating origin: position every object at `absolute - frame.origin` each frame), and the
build guide (log-depth chunks in custom shaders).

* **Earth globe**: sphere of radius `R_EARTH` (high segment count), oriented with
  `earthMeshQuaternion(frame.missionTime)`, day texture `textures/earth/day_4096.jpg`
  (2048 on low tier), night lights `textures/earth/night_2048.jpg` on the dark side only
  (smooth terminator, lights fade in after sunset), ocean specular glint from
  `textures/earth/water_2048.png` (white = water), correct colour spaces (day and night maps
  sRGB, mask linear). Aerial perspective over the surface from orbit (the same scattering as
  the sky). Load via `asset('textures/...')` from `src/config.ts`. Do not draw the globe
  within `LOCAL_TERRAIN.innerKm` of the pad (`src/world/site.ts`): discard those fragments
  (the local terrain module draws there), with a clean edge. Check texture orientation: the
  pad must sit on the Florida Atlantic coast, north up, no seams at the dateline or poles.
* **Atmosphere** (the most important piece): single-scattering Rayleigh + Mie ray-marched in a
  shell shader (samples from `tierSpec().atmoSamples`), working from inside (blue sky, bright
  horizon haze, Sun aureole, sunrise/sunset colours when the Sun is low) and from outside (a
  thin blue limb that fades into black, not a neon shell; reddish at the terminator). Drawn as
  the background (no depth write). Update `skyState` each frame: haze colour and density at
  the camera altitude, sun colour/intensity after atmospheric transmittance, ambient, exposure.
* **Clouds**: one procedural cloud function evaluated in Earth-fixed coordinates (so clouds stay
  put on the rotating Earth and are continuous from ground to orbit): a global layer (shell at
  a few km, fBm with `tierSpec().cloudOctaves` octaves, lit by the Sun with soft self-shadowing,
  shadows darkening the globe below) and near the pad the same field at higher frequency
  giving scattered cumulus overhead and around (not overcast: the launch must be visible).
  The rocket climbs through the layer at about 2-3 km altitude; it must not pop.
* **Stars**: `textures/sky/tycho_2880.jpg` (NASA Tycho star map, equirectangular, galactic?
  check its orientation and document your assumption) on a background sphere, brightness
  scaled by exposure: invisible in the daytime sky, faint in sunlit orbit views, clearer in
  Earth's shadow. Never a bright star field behind a daylit rocket.
* **Sun**: disk + restrained glare (no lens-flare gimmicks), dimmed/reddened by the atmosphere.
* **Moon**: sphere radius `R_MOON` at `moonPosition(t, frame.tl?.moonPhase0 ?? 0)`, texture
  `textures/moon/lroc_4096.jpg` (grayscale LROC WAC mosaic; 2048 on low), lit by the Sun,
  tidally locked orientation (near side toward Earth: longitude 0 faces Earth).
* **Lighting for everything else**: a `DirectionalLight` along `SUN_DIRECTION` (colour and
  intensity from `skyState`, zero in Earth's shadow: compute the eclipse of the camera/subject
  by the Earth sphere), with a shadow camera that follows the focus subject (a box ~300 m
  around `director.flightPose.target` in render coordinates; map size `tierSpec().shadowMap`),
  a `HemisphereLight` for sky/ground fill (ground colour = Earth albedo seen from altitude),
  and `scene.environment` from a PMREM of a small procedural environment (sky gradient above,
  ground/Earth below, Sun spot) regenerated only when the camera altitude crosses thresholds
  (ground, high atmosphere, orbit, deep space): metals must have something to reflect.
* Honesty: no fake exaggeration of Earth size behind the rocket; the scale is physical.

## Performance
Budget the full-screen atmosphere carefully (it is the heaviest shader): early-out rays that
miss the shell, precompute what you can, scale samples by tier. On the low tier the sky must
still look right (maybe fewer samples and a cheaper approximation).

## Dev harness `src/dev/space.tsx`
Renders `<SpaceWorld/>` (and nothing else, or simple placeholder spheres to judge lighting).
Camera via `?t=&cam=e,n,u,heading,pitch,fov` in pad-local ENU (u = altitude, so
`cam=0,0,400000,90,-25,50` is 400 km above the pad looking east and down). Verify at least:
ground looking east at the horizon (sky gradient, Sun), ground looking up, 10 km, 40 km (dark
blue sky, curvature starting), 120 km, 400 km looking at the limb, 400 km on the night side
(add a `t` far enough for night: the Sun direction is fixed, the orbit moves; or position the
camera over the dark hemisphere with large e/n offsets), 36,000 km (whole Earth), near the Moon.
Fix what looks wrong: banding, seams, washed-out colours, neon limb, stars in daylight.
