# Brief: E-1 / E-1V engine models (the propulsion showpiece)

## You own
`src/scene/vehicle/engine/**` except `types.ts` (read-only contract), plus `src/dev/engine.tsx`.
Replace the stub `buildEngine.ts`.

## Deliver
`buildEngine(kind: 'E-1' | 'E-1V', detail: 'hangar' | 'flight' | 'cluster'): EngineModel`.
Data from `src/vehicle/spec.ts` (`E1`, `E1V`: throat/exit diameters, expansion ratio, length).
ENGINE FRAME: origin at the gimbal pivot, +Y up toward the stage, the nozzle toward -Y.

## One consistent architecture: LOX/RP-1 gas-generator cycle (do not mix in other cycles)
* **Gimbal** block at the top centre of the injector dome; two **TVC actuators** (hydraulic
  cylinders at 90 deg to each other) from the thrust structure attach points to the chamber;
  `setOperating({pitch, yaw})` swings the whole engine about the pivot (actuators extend or
  retract to match; keep them attached).
* **Thrust chamber assembly**: LOX dome on top feeding the **injector**; injector faceplate
  with concentric rings of unlike-impinging doublet orifices and radial + circumferential
  **baffles** (combustion stability), fuel manifold ring; **combustion chamber** (cylindrical,
  diameter ~1.7 x throat), converging section, **throat**, diverging **nozzle** (bell contour,
  e.g. Rao-like parabola from the throat to the exit). Regenerative cooling: the chamber liner
  is a copper alloy with milled coolant channels closed out by a nickel-alloy jacket; the bell
  is brazed coolant tubes (a fine tube pattern visible on the outside, hatbands). RP-1 enters
  the coolant inlet manifold (torus) low on the nozzle, flows UP through the channels toward
  the injector (counter-flow), then into the injector's fuel manifold.
* **Turbopump** mounted beside the chamber: one shaft carrying the LOX pump (inducer +
  impeller), the RP-1 pump (inducer + impeller) and the **turbine** wheel at the end, with
  bearings and an inter-propellant seal between the pumps. Pump inlets connect upward to the
  stage feed lines (flanged, with bellows), pump discharges to the **main valves** (main LOX
  valve and main fuel valve bodies with actuators) and on to the injector / coolant manifold.
* **Gas generator**: a small combustor fed by tapped LOX and RP-1, fuel-rich (dark, sooty,
  ~900 K) gas driving the turbine; the turbine exhaust leaves through an **exhaust duct** that
  ends beside the nozzle (its soot trail is part of the look of a GG engine). A small **heat
  exchanger** coil in the exhaust duct warms helium for tank pressurization.
* **Igniter**: TEA-TEB hypergolic ignition fluid cartridge and lines to the injector and GG
  (it makes the green ignition flash; enables restarts).
* **E-1V**: the same core with a large **radiatively cooled nozzle extension** (niobium alloy,
  matte dark grey with a slight bronze tint, thin wall, stiffener rings) bolted to the regen
  nozzle's exit flange, total length `E1V.length`, exit diameter `E1V.exitDiameter`. With
  `setOperating({flow})` > 0 in flight it glows (dull red at the joint to orange-yellow is
  wrong: it glows brightest near the joint and dims toward the exit, dark red-orange).

## Detail levels
* `hangar`: everything above, with internals for the cutaway: a half-section through the axis
  facing +Z revealing the injector orifices and baffles, the channel ribs of the liner in
  section (a comb pattern), throat, tube wall of the bell, the pump inducers/impellers (curved
  vanes), turbine blades, shaft, bearings and seals, the GG interior, valve internals (ball or
  butterfly), with cut faces capped and styled as hatched technical sections. Build section
  geometry explicitly (LatheGeometry with phiLength = PI plus cap faces from the profile), not
  just clipping planes that leave hollow shells.
* `flight`: exterior only, 32-48 segments, merged by material; `cluster`: very light exterior
  for seven engines on the booster (bell, chamber, powerhead block, main lines, TVC), <= 12
  draw calls per engine; merge aggressively.

## Mechanisms and overlays
* `setOperating({shaftAngle})` rotates the shaft, inducers, impellers and turbine (the caller
  advances it; in demonstrations it is slowed and labelled). `flow` drives valve positions,
  chamber interior glow (visible only in the cutaway), and E-1V extension glow. `gg` shows the
  GG running. `ignite` a brief green flash inside the chamber/at the exit.
* `setFlowOverlay(true)`: animated flow tubes along the real routes: LOX (tank inlet, LOX pump,
  main LOX valve, LOX dome, injector) #8fc6ff; RP-1 (fuel pump, main fuel valve, coolant inlet
  manifold, up the channels, fuel manifold, injector) #e0a24a; GG (taps, GG, turbine, exhaust
  duct) #ff7a3d; hot gas in the chamber and nozzle. Use scrolling dash textures on tube
  geometry following the pipes, not a blanket glow.
* `setCut(amount)` animates the section opening (the cut half slides/fades away smoothly).
* Tag meshes `userData.part` with: engine, turbopump, gas-generator, injector,
  combustion-chamber, nozzle, main-valves, tvc-actuators, igniter, (E-1V: vacuum-engine,
  nozzle-extension) and `userData.material` from `src/content/materials/assignments.ts`.

## Quality bar
This close-up is the first thing a reviewer inspects: it must read as a real liquid rocket
engine (think of a museum cutaway), not a cone with a sprite. Smooth bells (>= 96 segments in
hangar detail), plausible pipe routing with bends (TubeGeometry along curves), flanges and bolt
rings, bellows, brackets, wire harnesses, distinct materials (copper liner in section, tube-wall
bell, dark heat-tinted manifolds, bright stainless lines, niobium extension). The whole engine
must stay inside the silhouette of the E-1 exit diameter plus a small margin, so seven fit the
booster base (ring radius 1.2 m, exit diameter 1.06 m) without intersecting.

## Dev harness `src/dev/engine.tsx`
Studio lighting (hemisphere + key light with shadows + PMREM `RoomEnvironment`), both engines
side by side on simple stands, URL params: `kind=E-1|E-1V|both`, `detail=`, `cut=0..1`,
`flow=0|1`, `spin=<rpm shown>`, `pitch=`, `yaw=`, `gg=1`, `ignite=`. Verify close-ups of the
powerhead, the injector face, the cutaway, the cluster detail (seven in the booster layout),
and the E-1V extension. Fix everything that looks wrong.
