# Accuracy notes

What in KIMBLE Rocket Engineering is physical, what is a selected educational assumption, and
what is purely illustrative. The aim is **coherent engineering and internally consistent cause
and effect**, not the reproduction of any real vehicle. Numbers quoted in the interface are
computed from the dataset or the reference trajectory wherever possible (tests recompute them).

## The reference vehicle: KIMBLE K-1 (generic, original, illustrative)

One dataset, `src/vehicle/spec.ts`, drives the geometry, the trajectories, the telemetry and
the lesson figures.

| Item | Value | Status |
|---|---|---|
| Architecture | Two stages, LOX/RP-1, gas-generator cycle on both stages, reusable first stage (grid fins, legs, cold-gas RCS) | Selected; a common, well-documented class of design |
| Diameter | 3.7 m (both stages) | Selected (a road-transportable diameter) |
| Height | 67.0 m with the satellite fairing; 68.8 m with the crew capsule and abort tower | Derived from the stations |
| First stage | 7 × E-1; 25.5 t dry; 330 t propellant (O/F 2.3: 230 t LOX, 100 t RP-1); separate tanks with an intertank; LOX on top, downcomer through the RP-1 tank; helium COPVs in the LOX tank | Selected |
| E-1 engine | 835 kN vacuum, 285 / 312 s Isp (sea level / vacuum), 8.5 MPa chamber, expansion ratio 18, 1.06 m exit, ±5° gimbal, 55 % minimum throttle, TEA-TEB ignition, RP-1 regenerative cooling | Selected, within the range of documented kerolox GG engines. The listed sea-level thrust (760 kN) is about 2 % above what the ideal pressure term gives from the vacuum thrust and exit area (746 kN); the trajectory uses the physical formula, the lessons say so |
| Upper stage | 1 × E-1V; 4.6 t dry; 75 t propellant; common insulated bulkhead | Selected |
| E-1V engine | 700 kN vacuum, 342 s, expansion ratio 110, 2.41 m exit, radiatively cooled niobium extension, restartable | Selected |
| Tank volumes | LOX 207.6 m³ / RP-1 127.2 m³ (booster), 47.2 / 28.9 m³ (upper), 3 % ullage, ellipsoidal domes h = R/√2 | Derived from masses and densities (1,141 and 810 kg/m³); a unit test checks that the drawn tanks hold exactly this |
| Payloads | 6.2 t Earth-observation satellite (LEO), 3.6 t communications satellite (GTO), 1.4 t lunar probe, 12.4 t crew capsule + service module, 4.2 t research capsule | Selected |

Materials assignments (`src/content/materials/assignments.ts`) are the single table used by the
3D model, the lessons and the materials index. "In this illustrative vehicle" and "another
documented design" are always distinguished.

## What the trajectories are

`src/timeline/physics` computes a **reference trajectory once per mission** with a simplified
point-mass model and authored guidance. It is not a real-time flight simulator and it is not
the flight software of any vehicle.

Modelled physically:
- Two-body gravity μ/r² about a spherical Earth (R = 6,371 km); Earth rotation (the pad moves,
  and the atmosphere co-rotates, so drag uses the air-relative velocity).
- US Standard Atmosphere 1976 (density, pressure, temperature, speed of sound).
- Thrust per engine F = ṁ·Isp_vac·g0 − p_amb·A_exit, so thrust and Isp rise with altitude as
  the ambient pressure term falls; mass flow from the rated vacuum thrust and Isp; throttle.
- Drag with Mach-dependent coefficients (slender stack, tail-first booster, blunt capsule).
- Kepler propagation for coasts; Clohessy-Wiltshire relative motion for the final rendezvous;
  a restricted three-body integration (Earth + Moon) for the lunar flyby.
- Propellant is integrated from the mass flow, so tank levels shown in the cutaway agree with
  the burns.

Authored (guidance and choices a real mission would make):
- Vertical rise to tower clearance, a small pitch kick, a zero-angle-of-attack gravity turn,
  throttle-down around maximum dynamic pressure; linear-tangent upper-stage steering found by
  a deterministic shooting search for the target orbit; attitude changes rate-limited.
- Burn timing for boostback, entry and landing burns, orbit changes, deorbit and trans-lunar
  injection, found by deterministic searches against targets (landing point, splashdown
  region, closest lunar approach).

Simplifications (stated so they are not mistaken for physics):
- No J2 (Earth oblateness), no winds, no solar or lunar perturbations on Earth orbits.
- The Sun direction is fixed during a lesson; the Moon moves on a circular orbit **coplanar
  with a due-east parking orbit** (a real lunar launch waits for a window that makes this
  geometry work).
- The station orbits in the launch plane at 28.5° (a real station has its own inclination;
  launches are timed to reach its plane).
- Entry heating and the plasma glow are driven by a qualitative heating proxy
  (proportional to ρ^0.5·v³), not a solved thermal or material-response model; heat-shield
  charring is illustrative.
- Parachute inflation, reefing and splashdown are authored from representative speeds.
- Capsule attitude during entry is heat-shield first by construction.

## Presentation time

Mission time is physical; presentation time is what the scrubber shows. Their mapping is a
piecewise-linear, monotonic table per mission (`MissionTimeline.pres`): powered flight at 1×,
coasts accelerated with an on-screen note ("Coast accelerated ×60"), long quiet intervals
omitted with a note, and, in Watch mode only, intervals slowed so narration never runs ahead of
the picture ("Slow motion ×0.6"). Playback speed changes never desynchronize them.

## Visual conventions (illustrative by design)

- Cutaways, exploded views and section hatching are inspection tools; a flying engine or tank
  is never open. Views are labelled.
- Turbopump rotation in demonstrations is shown about 1,000 times slower than 32,000 rpm.
- Flow colours (LOX blue, RP-1 amber, hot gas orange) show routes, not real colours; invisible
  flows never glow in normal views.
- Plumes, smoke and plasma are artistic interpretations of documented behaviour: kerosene
  plumes are luminous and sooty with shock diamonds at sea level, widen as ambient pressure
  falls, and a vacuum plume is faint; the gas-generator exhaust is a dark sooty jet; ignition
  shows the TEA-TEB green flash. Their exact shapes are not computed.
- Clouds are procedural (a noise field fixed to the rotating Earth), not weather data.
- Earth imagery is NASA Blue Marble NG (cloud-free composite); night lights are NASA Black
  Marble 2012; the Moon is the LROC WAC mosaic.
- The orbital map is at true distance scale with enlarged vehicle icons, and says so.

## Computed facts per mission

The table below is produced from `buildMission(id).facts` (see `scripts/mission-report.mjs`)
and is checked by the tests in `src/timeline`.

<!-- FACTS:BEGIN -->
(Filled in from the reference trajectories.)
<!-- FACTS:END -->

## Sources

The engineering sources are listed in the application (Sources and credits) and in
`src/content/sources/`. They are marked "identified by reference" where the page could not be
opened from the build environment (nasa.gov and NTRS were blocked by its network policy), so
statements were written from established engineering knowledge and checked for consistency
with the dataset; no numbers were copied from inaccessible documents. The SpaceX Falcon user's
guide was not accessed, and no Falcon-specific values are used.
