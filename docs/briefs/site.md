# Brief: coastal launch site (pad, tower, terrain, ocean, landing zone)

## You own
`src/scene/environment/**` and `src/dev/site.tsx`. Replace the stub `LaunchSite` in
`src/scene/environment/index.tsx` (keep the export name). Layout constants are in
`src/world/site.ts` (`PAD`, `LANDING_ZONE`, `GROUND_CAMS`, `LOCAL_TERRAIN`): read-only, build to them.

## Placement (flight world, floating origin)
Author everything in pad-local metres (x east, y up, z south, origin on the ground under the
vehicle axis). Each frame (`useFrame(..., 0)`), set your root group's position to
`sitePosition(frame.missionTime) - frame.origin` and quaternion to
`siteFrameQuaternion(frame.missionTime)` (both from `src/world/frames.ts`). The site sits at
28.5 N on the Atlantic coast of Florida: the ocean is to the EAST (shoreline about
`PAD.shorelineEast` m east of the pad, running roughly NNW-SSE), with lagoons, a river and
barrier islands inland to the west, low flat scrubland, beaches. The Earth globe (another
module) does not draw within `LOCAL_TERRAIN.innerKm` of the pad; your terrain must cover that
disk and fade out between `innerKm` and `outerKm`. Put terrain vertices on the spherical Earth
(drop by d^2 / 2R at distance d: 125 m at 40 km) so the edge meets the globe. At the edge,
blend your colours toward the Earth imagery (`public/textures/earth/day_4096.jpg`: sample it
by latitude/longitude in your shader; the pad is at lat 28.5, lon -80.58, see `latLonOf`) so
there is no seam when climbing. Use `LOCAL_TERRAIN` and a land/water mask you derive: the
general coast orientation must agree with the globe imagery at 7 km/pixel. (Natural Earth
public-domain data is reachable at https://naturalearth.s3.amazonaws.com/ if you want real
coastline vectors, e.g. `10m_physical/ne_10m_land.zip`; pyshp/shapely can be pip-installed;
bake a mask PNG into `public/textures/site/` with a script in `tools/site/`. Or model the
coast procedurally in the right orientation.)

## The pad (detail where the cameras go: see `GROUND_CAMS` and `src/director/shots.ts`)
* Elevated concrete pad (hardstand with ramp), a **launch mount** whose deck top is at
  `PAD.deckHeight` with four **hold-down clamps** that grip the vehicle's aft skirt and swing
  away when `pad.holddown` goes 0 to 1 (expose a component prop or a module-level state the
  integration sets; see "Interfaces"), an opening under the vehicle into the **flame
  deflector** (steel-faced wedge) and a **flame trench** leading off along `PAD.trenchDir`.
* **Service tower** (`PAD.tower`): steel lattice (instanced members), platforms every ~6 m,
  stairs, elevator, lightning mast on top, umbilical arms to the upper stage and fairing, and a
  **crew access arm** at the capsule hatch height for the capsule configuration (hatch at about
  y = PAD.nozzleExitHeight + 58.3). Arms retract (swing ~70 deg) with `pad.arms` 0..1.
* **Sound-suppression** water tower (~90 m, spherical or cylindrical tank on legs) with pipes
  to deluge nozzles at the mount (expose nozzle positions for the effects module).
* Lightning protection masts (3-4) with catenary wires, LOX storage sphere(s) and RP-1 tanks
  with piping, pad lighting masts, perimeter fence, roads, a few service buildings, a large
  horizontal integration hangar with a KIMBLE mark on its door (paint from
  `src/brand/logoPaths.ts`; restrained), and a blockhouse/instrument bunker.
* **Landing zone** at `LANDING_ZONE`: a concrete circle with an original target marking
  (concentric rings, no copied designs), service road.
* Materials from `M()` in `src/scene/materials.ts` (concrete, galvanised and painted steel...).
  Use instancing for repeated members. Everything receives/casts shadows appropriately.

## Terrain, water, atmosphere
* Terrain disk out to `outerKm` with LOD rings (dense near the pad, sparse far), vegetation
  colour variation (procedural noise), beaches, lagoons with calmer water, roads.
* **Ocean**: animated normal-mapped waves (several octaves, time from `frame.decor` for idle
  motion), fresnel reflection of the sky colour, sun glint using `skyState.sunDir`, foam line at
  the beach; it must look like water from the pad cameras AND from 10-40 km altitude.
* **Haze** (aerial perspective): apply distance fog to your materials using `skyState`
  (`src/scene/space/skyState.ts`, updated by the space module) so distant terrain fades into
  the sky colour. Custom shaders need the log-depth chunks (see the build guide).
* Expose `SITE_ANCHORS` (deluge nozzles, trench exit, LOX vent stack positions, LZ centre) in
  pad-local coordinates for the effects module and cameras.

## Interfaces
Export `LaunchSite` (R3F component, flight location) and a module-level `siteState` object
(`{ holddown: 0, arms: 0, deluge: 0, config: 'satellite' | 'capsule' }`) that the integration
writes each frame; your component reads it.

## Dev harness `src/dev/site.tsx`
Renders `<SpaceWorld/>` from `src/scene/space` (a stub now, the real sky later) plus your
`<LaunchSite/>` and a simple stand-in vehicle cylinder (radius 1.85, 67 m) on the mount, with
URL params for `siteState` (`hold=`, `arms=`, `cfg=capsule`). The flight camera is set with
`?t=&cam=e,n,u,heading,pitch,fov` (see `src/dev/index.tsx`). Verify the pad from the pad-wide
camera (`cam=-260,-330,18,38,10,40`), close to the mount, from the tower, from 2 km, 10 km and
35 km altitude looking down and toward the horizon, and the landing zone. Fix what looks wrong.
