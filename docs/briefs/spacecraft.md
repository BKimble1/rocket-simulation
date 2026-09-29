# Brief: spacecraft (satellites, crew capsule family, research capsule, lunar probe, station)

## You own
`src/scene/spacecraft/**` except `types.ts` (read-only contract), plus `src/dev/spacecraft.tsx`.
Replace the stub `buildSpacecraft.ts` (keep its signature `(kind, detail, mountY)`).

## Deliver `buildSpacecraft(kind, detail: 'hangar' | 'flight', mountY): SpacecraftModel`
Geometry in the vehicle MODEL FRAME stacked from `mountY` upward (+Y), except the station.
Masses and sizes from `src/vehicle/spec.ts` (`PAYLOADS`, `CAPSULE`, `SERVICE_MODULE`,
`ABORT_TOWER`). Original designs only: no agency/company marks or copied spacecraft shapes.

* `leoSat` (body `satellite`, ~6.2 t Earth-observation satellite): must fit inside the fairing
  (inner diameter ~3.85 m; payload adapter top at 54.8 m; keep the stack below ~63 m and inside
  a 1.7 m radius). Box/hex bus (~2.3 x 2.3 x 3.6 m) wrapped in **MLI blankets** (gold and silver
  crinkled foil with seams and tape lines), an optical instrument with a sun baffle on the
  nadir face, star trackers, two **solar array** wings stowed folded against the bus (3-4
  panels each, hinges, hold-down points) that `satArrays` 0..1 unfolds in sequence (yoke first,
  then panels) to a flat wing; a deployable **antenna** (X-band dish ~1 m on a boom, `satAntenna`),
  **attitude thrusters** (small hydrazine clusters at the corners) and reaction wheels inside
  (cutaway), separation ring at the base matching a 1575 mm adapter.
* `gtoSat` (body `satellite`, geostationary communications satellite): box bus, two large
  folded reflector antennas on the east/west faces, long multi-panel array wings, a **liquid
  apogee engine** nozzle at the base (tag `apogee-engine`), propellant tanks inside.
* `lunarProbe` (body `satellite`): compact probe, one array wing, high-gain dish, cameras.
* `capsule` (bodies `capsule`, `service`, `les`): crew capsule (base diameter 3.9 m, height
  3.3 m, 25 deg backshell half-angle): **heat shield** (spherical-section ablator on a carrier
  structure; in `setCut` a layered stack is visible: ablator in honeycomb, carrier, insulation,
  pressure vessel), **backshell** covered in reusable ceramic **tiles** (a real tile pattern,
  black/white), windows, hatch, RCS thrusters, **docking system** on the apex under a hinged
  nose cone (`capNoseCone` opens it), **parachutes** packed in the forward bay: two drogues and
  three mains that deploy with risers and canopies with gores (`capDrogue` 0..1; `capMain` 0
  stowed, 0.5 reefed narrow canopy, 1 fully open; canopies above the capsule along +Y). Put the
  **KIMBLE** mark and wordmark and a small **ONE / FAB** on the capsule side facing +Z
  (painted on a curved decal band from `src/brand/logoPaths.ts`, never mirrored, no z-fight).
  **Service module** below it (diameter 3.7 m, 3.2 m): radiator panels on the skin, two solar
  array wings (`smArrays`), the main engine (hypergolic) nozzle at the bottom inside an adapter
  ring, RCS quads, propellant tanks in the cutaway, MLI. **Launch abort tower** (`les`) on the
  capsule apex: truss legs, a solid abort motor with four canted nozzles near the tower base,
  a jettison motor and a nose/canard section; total length ~7.9 m.
* `researchCapsule` (body `capsule`): the same capsule uncrewed (no docking system, experiment
  racks in the cutaway), mounted at `mountY` on the booster's capsule adapter.
* `station` (body `station`): an original orbital station: pressurized modules in a row with a
  node, a truss carrying four large solar array wings and radiators, antennas; the capsule
  docking port faces nadir (-Y) at the node. Local-vertical frame (+Y zenith, +X velocity).
  About 60 m across. Set `anchors.dockPort`.

## Requirements
* Tag every mesh `userData.part` (satellite-bus, solar-arrays, antenna, attitude-thrusters,
  mli-blankets, apogee-engine, capsule, heat-shield, backshell-tps, parachutes, docking-system,
  service-module, launch-abort-system, station) and `userData.material` (see
  `src/content/materials/assignments.ts`). Fill `parts`, `anchors`.
* `setState` for arrays, antenna, chutes, nose cone, `capChar` (heat shield darkens/chars and
  the backshell gets streaks); `setCut(amount)` section views with capped hatched faces;
  `animate(t, demo, p)`: `spacecraft-ops` (arrays + antenna deploy, attitude slew),
  `capsule-return` (drogues then reefed then full mains), `heat-shield-stack` (layers of the
  shield separate slightly for a labelled close-up).
* Quality bar as in `docs/BUILD_GUIDE.md`: smooth curves, real thickness, readable detail,
  believable MLI and solar cells (cell grid pattern, busbars), no floating parts. 'flight'
  detail keeps the silhouette with far fewer triangles.

## Dev harness `src/dev/spacecraft.tsx`
Studio lighting (hemisphere + key light + PMREM `RoomEnvironment`); URL: `kind=`, `detail=`,
`arrays=`, `antenna=`, `drogue=`, `main=`, `nose=`, `char=`, `cut=`, `demo=`, `p=`. Mount at 0
for the dev view (or a `mount` param). Verify every kind closed, deployed and cut; fix issues.
