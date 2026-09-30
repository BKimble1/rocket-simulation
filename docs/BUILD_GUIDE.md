# Build guide (for everyone adding a module)

KIMBLE Rocket Engineering is an **educational** real-time 3D simulator: learners identify a
launch vehicle's parts, see how they work, why they are used, which materials they need, and
what they do in each mission phase. It is not a piloting game. Graphics, smooth animation and
depth of explanation are the product. Read `src/vehicle/spec.ts`, `src/vehicle/parts.ts`,
`src/timeline/types.ts`, `src/timeline/missions/outline.ts`, `src/content/types.ts` and the
contracts in `src/scene/vehicle/types.ts`, `src/scene/vehicle/engine/types.ts`,
`src/scene/spacecraft/types.ts` before starting.

## Stack

React 19, TypeScript 5.9 (strict), three 0.186, @react-three/fiber 9, zustand 5, Vite 8,
Vitest 5, Playwright 1.56. No drei, no other 3D libraries: write the geometry. **Do not add npm
dependencies.** No runtime network fetches: every asset is served from `public/` via
`asset('textures/...')` from `src/config.ts` (respects the base path).

## Frames and units (metres, kilograms, seconds, radians unless named *Deg)

* **Frame I** (`src/world/frames.ts`): inertial, origin at Earth's centre; axes = the pad's
  east / up / south at T-0. Earth rotates inside it (`earthRotation(t)`); the Sun direction is
  fixed (`SUN_DIRECTION`). Double precision JS numbers.
* **Pad-local frame** (`src/world/site.ts`): x east, y up, z south, origin at ground level on
  the vehicle axis. `groundPoint(e, n, u, t)` in `src/director/shots.ts` converts to frame I.
  At time t the pad frame is rotated by `siteFrameQuaternion(t)` and translated to
  `sitePosition(t)`.
* **Vehicle model frame** (`src/scene/vehicle/types.ts`): +Y along the axis toward the nose,
  origin at the first-stage nozzle exit plane; every body authored at its stacked position.
  On the pad the model frame equals the pad frame translated up by `PAD.nozzleExitHeight`.
* **Engine frame**: origin at the gimbal pivot, nozzle toward -Y.

## Flight-world rendering rules

* **Floating origin.** The camera is at the render origin. In a flight-location component,
  every frame (in `useFrame(..., 0)`), set `object.position = absolute - frame.origin` (see
  `toRender` in `src/scene/frame.ts`). Never put raw frame-I coordinates (millions of metres)
  into vertex data; put them in the object's position, computed in double precision.
* **Logarithmic depth buffer** is on. Built-in materials handle it. A custom `ShaderMaterial`
  must include `#include <common>` and `#include <logdepthbuf_pars_vertex>` / after
  `gl_Position` `#include <logdepthbuf_vertex>` in the vertex shader, and
  `#include <logdepthbuf_pars_fragment>` / `#include <logdepthbuf_fragment>` in the fragment
  shader, or it will z-fight or vanish. Prefer `onBeforeCompile` on standard materials.
* Time: read `frame.missionTime` (mission seconds), `frame.decor` (stage-clock seconds for
  idle motion only), `frame.dt`. Anything that tells the mission story must be a pure function
  of mission time (seeking must reproduce it exactly). Never use `THREE.Clock` or `Date`.
* Budgets: read `tierSpec()` from `src/scene/quality.ts` (particles, samples, texture size,
  detail). Everything must still work on the `low` tier.
* No React state updates per frame. Build geometry once (`useMemo`), mutate transforms and
  uniforms in `useFrame`. Dispose what you create.

## Materials

Use the shared palette `M('paintWhite' | 'aluminum' | 'inconel' | 'copper' | ...)` from
`src/scene/materials.ts` so the whole picture has one material language. You may create
local variants (clone, then adjust) or special shaders in your own files; do not edit
`materials.ts`. Metals are metalness 1 with their own colour; paints/composites metalness 0.
Surfaces that are curved must be smooth at close range (hangar detail: at least 96 radial
segments on the main body, 64 on engine bells; flight detail may use fewer). Give real panel
thickness and bevelled edges where the camera can see an edge. Avoid uniformly shiny metal,
overexposed white, and z-fighting (offset decals by millimetres and use polygonOffset).

## Identity and branding

Only the original **KIMBLE** mark and wordmark and the **FAB / ONE** wordmark (the collection this simulation belongs to) appear
on hardware (`src/brand/logoPaths.ts`, `public/brand/*.svg`). No NASA, ESA, SpaceX or other
agency or company names, logos, flags or liveries. Do not copy any proprietary vehicle's
exact shape. Livery: white, graphite, one restrained violet accent (`ACCENT` in materials.ts).

## Ownership

Edit **only the files your brief assigns to you** (plus new files inside your own folder).
Everything else is read-only for you, including this guide, `App.tsx`, `Stage.tsx`, the
director, the store, `materials.ts`, `spec.ts`, `parts.ts`, the type contracts and other
modules. If a contract is missing something, work around it inside your own files and report
the gap in your final message.

## See your work

A dev server is normally running at `http://127.0.0.1:5173` (check with
`curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5173/`; if it is not, start your own
on a free port: `npx vite --port 51xx --strictPort &`). Your dev harness file
`src/dev/<module>.tsx` is mounted by `?dev=<module>` (see `src/dev/index.tsx` for camera URL
parameters). Screenshot (software WebGL, so slow; allow 8-15 s):

```
node scripts/shot.mjs "http://127.0.0.1:5173/?dev=vehicle&az=30&el=5&dist=40&ty=45" /tmp/claude-0/-home-user/27a32fdd-e1b7-5170-a6d8-816a0def8caa/scratchpad/<name>.png 1440 900 9000
```

Then look at the PNG with the Read tool. Look at your work from several distances and angles,
**at the actual resolution**, and fix what looks wrong (faceting, seams, missing faces,
inverted normals, z-fighting, floating parts, clipping, unreadable decals, plastic metal).
Type-check with `npx tsc -b` (fix errors in your own files). Run tests with `npx vitest run`.

## Interface copy

Plain, precise English; no em dashes; units with numbers; label illustrative values and
slowed or schematic animations as such.
