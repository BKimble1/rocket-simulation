# Brief: launch vehicle model (structure, livery, assembly, inspection views)

## You own
`src/scene/vehicle/**` EXCEPT `src/scene/vehicle/engine/**` and `src/scene/vehicle/types.ts`
(read-only contract), plus `src/dev/vehicle.tsx`. Replace the stub `src/scene/vehicle/buildVehicle.ts`.

## Deliver
`buildVehicle(config: VehicleConfig): VehicleModel` (contract: `src/scene/vehicle/types.ts`).
It assembles the KIMBLE K-1 from `src/vehicle/spec.ts` (use `STATIONS`, `S1_ENGINE_LAYOUT`,
`LEGS`, `GRID_FINS`, `FAIRING`, `BODY_RADIUS`, `DOME_HEIGHT`; every dimension from there),
calls `buildEngine()` from `src/scene/vehicle/engine/buildEngine.ts` (another agent is writing
it now: code against `engine/types.ts`; the stub works meanwhile) and `buildSpacecraft()` from
`src/scene/spacecraft/buildSpacecraft.ts` (also in progress; contract `spacecraft/types.ts`,
mount at `MOUNT_Y`). Merge the spacecraft's bodies/parts/anchors into the vehicle model.

## Geometry (model frame: +Y nose, origin at S1 nozzle exit plane)
First stage (body `booster`):
* Aft skirt / thrust section 1.3 to 4.3 m with the base heat shield plate at y 1.3 (cut-outs
  and flexible thermal boots around the 7 engines), four hold-down fittings on the skirt,
  internal thrust structure (radial beams, thrust ring, engine mounts) visible in cutaway.
* Seven E-1 engines at `S1_ENGINE_LAYOUT`, gimbal points at `STATIONS.s1Gimbal`; each engine
  in a pivot group that `setState({s1GimbalPitch, s1GimbalYaw})` rotates (outer engines may
  gimbal less; the centre engine is the landing engine).
* RP-1 tank (lower) and LOX tank (upper): ellipsoidal domes (height `DOME_HEIGHT`), barrel
  walls; in cutaway the wall shows real thickness (~5 mm skin + orthogrid ribs ~25 mm drawn on
  the inside), weld lands at dome/barrel joints, anti-slosh baffle rings, anti-vortex baffle at
  the outlets, the LOX **downcomer** pipe running down the centre of the RP-1 tank to the
  engine manifold, the fuel feed lines, and helium **COPV** bottles mounted inside the LOX tank
  (tag `pressurization`) with pressurant lines to the ullage (diffusers at the top).
* Intertank (skin with stringers, ring frames) between the fuel forward dome and LOX aft dome.
* Forward skirt to 37.9 m; **grid fins** (recovery: four titanium lattice fins, hinged, stowed
  folded against the skirt; `fins` deploys them to perpendicular; `finDeflect` rotates about
  their hinge axis) and **cold-gas RCS** pods (nitrogen thrusters) on the forward skirt.
* **Landing legs** (recovery): four carbon-fibre legs stowed flush along the aft section
  (hinge at `LEGS.hingeY`), each with a telescoping pneumatic/hydraulic deploy strut and a
  foot pad; `legs` 0..1 deploys to `LEGS.deployedAngleDeg` with the strut extending plausibly.
* External **raceway** (cable and pressurant conduit) along the tanks on one side (-X).
* **Interstage** 37.9 to 44.4 m: dark carbon-composite shell (graphite, satin), hollow, housing
  the upper-stage nozzle extension; the **stage separation system** at its top: pneumatic
  pusher rods and release collets (tag `stage-separation`).
Upper stage (body `upper`): thrust cone and aft skirt, E-1V engine (gimbal at `s2Gimbal`, its
nozzle extension reaching down to `s2NozzleExit` inside the interstage without touching it),
tanks with the **common bulkhead** (a dome bulging down into the RP-1, drawn as a sandwich:
two skins and a core), forward skirt with the **avionics** ring (flight computers, IMU, GNSS
antennas on the outside, batteries), upper-stage RCS/settling thrusters (tag `s2-rcs`), COPVs,
the **payload adapter** (cone from the stage diameter to a 1575 mm ring, clamp band).
Fairing (bodies `fairingA`, `fairingB`, satellite configurations only): two halves split along
the Z=0 plane (the seam runs up the +X and -X sides), `fairingA` is the +Z half (it carries the
KIMBLE livery, so the seam never cuts the logo) and `fairingB` the -Z half; boat-tail from 3.7 m to `FAIRING.diameter`, cylinder, tangent-ogive nose to
`fairingTip`; wall is a sandwich (face sheets + honeycomb core, real thickness in cutaway),
hinge points at the base, pneumatic pushers along the seam; `fairingOpen` rotates each half
outward about its base hinge (up to ~25 deg; after that the halves fly away as bodies).
Suborbital stack (`stack: 'boosterOnly'`): no interstage/upper stage; a short capsule adapter
from the forward skirt top to `MOUNT_Y.boosterCapsuleAdapter` carrying the research capsule.

## Quality bar
The first things a reviewer checks are the whole vehicle and an engine close-up at display
resolution. Faceted cylinders, featureless white tubes and uniformly shiny metal are blockouts,
not finished work. Hangar detail: >= 128 radial segments on the main body, bevelled rims,
panel seams (subtle normal-mapped grooves or thin geometry), restrained fasteners/bolt rings
at joints, cable/pipe routing, real thickness at every cut. Distinguish materials (paint white
body, graphite interstage and aft section soot-free, bare aluminium domes only in cutaway,
dark composite, titanium fins, engine alloys). 'flight' detail must keep the same silhouette
and livery with fewer triangles (target < 150 draw calls for the whole stack: merge geometry
per part+material with `mergeGeometries` from `three/examples/jsm/utils/BufferGeometryUtils.js`).

## Livery and branding (required)
Paint decals from `src/brand/logoPaths.ts` onto canvases (Path2D accepts the SVG path data)
and map them onto thin curved "decal bands" (a cylinder segment 2-3 mm outside the skin, with
polygonOffset) so lettering follows the curve without stretching, z-fighting or mirroring:
* **KIMBLE** wordmark, large, running vertically (reading bottom-to-top) on the upper first
  stage (LOX tank region) facing +Z, with the K mark above it. It must be readable from the
  pad cameras (south-west of the pad) and in close-ups.
* **ONE / FAB**: restrained secondary marking (small, graphite on white or white on graphite),
  e.g. on the interstage or upper-stage skirt, and near the base of the fairing.
* Fairing: the K mark + KIMBLE wordmark facing +Z, visible in the pad establishing shot.
* Livery: white body, graphite interstage and a graphite band at the aft skirt, one thin
  violet (`ACCENT`) pinstripe ring (e.g. at the interstage top). Do not plaster logos everywhere.
No NASA/SpaceX or other marks. Check at close range and at pad-shot distance that nothing is
reversed or distorted.

## Views (setView) and state (setState)
* `intact`, `cutaway` (a 90-120 degree wedge removed on the +Z/+X side through tanks,
  intertank, interstage, fairing, thrust section; cut faces with thickness and a hatched
  "section" material; show liquids: LOX pale blue, RP-1 amber, with levels from s1Lox/s1Rp1/
  s2Lox/s2Rp1 and flat free surfaces), `exploded` (assemblies separate along Y, fairing halves
  outward, engines slightly down; same objects, smoothly animated by `amount`).
* `highlight`: make the part's meshes clearly selected (emissive tint or rim) and optionally
  `dimOthers` (others semi-transparent/desaturated). `lens: 'materials'`: recolour meshes by
  material family and highlight `material`'s meshes.
* Tag EVERY mesh with `userData.part: PartId` and `userData.material: MaterialId` (from
  `src/content/materials/assignments.ts`), build `parts` from that, implement `partBox`.
* `setState`: legs, fins, finDeflect, fairingOpen, tank levels, gimbals, `frost` (LOX tank
  frost/white fuzz on the pad), `entryScorch` (soot on the booster after entry, darker toward
  the base). Forward spacecraft states to the spacecraft model.
* `animate(t, demo, progress)`: `tank-drain` (levels fall), `feed-flow` (flow along downcomer and
  feed lines, labelled overlay colours LOX #8fc6ff, RP-1 #e0a24a), `tank-pressure` (helium from
  COPVs to the ullage), `staging-sequence` (collets release, pushers extend, upper stage moves
  up a little in the hangar view), `fairing-sep` (halves rotate on hinges), `booster-recovery`
  (fins and legs deploy). Engine demos are the engine module's.
* `anchors`: nozzle exits and radii from the engine models at their mounted positions, RCS
  points, vents (LOX vent at the forward skirt/intertank), `com` per body at full load.

## Dev harness `src/dev/vehicle.tsx`
Neutral studio lighting (hemisphere + key directional with shadows + a PMREM environment from
`RoomEnvironment` in three/examples) and the vehicle, controlled by URL: `cfg=leoSat|gtoSat|
lunarProbe|capsule|researchCapsule`, `stack=boosterOnly`, `recovery=0|1`, `detail=flight|hangar`,
`view=intact|cutaway|exploded`, `amt=0..1`, `part=<PartId>`, `lens=materials`, `mat=<MaterialId>`,
`legs=`, `fins=`, `open=`, `frost=`, `demo=`, `p=`. Camera URL params are in `src/dev/index.tsx`.
Verify: whole vehicle (dist ~120, ty ~33), upper stage + fairing, engine section close-up
(ty ~2, dist ~12), cutaway of tanks, exploded view, decals close up and far, legs/fins
deployed, capsule stack, suborbital stack. Fix everything you see wrong.
