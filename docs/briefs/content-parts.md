# Brief: part lessons and mission phase cards (the engineering explanations)

## You own
`src/content/parts/**`, `src/content/phaseCards/**`, `src/content/sources/parts.ts`, and tests
`src/content/parts/*.test.ts`. Read-only: `src/content/types.ts` (schema and writing rules),
`src/vehicle/parts.ts` (ids), `src/vehicle/spec.ts` (the numbers), `src/content/materials/
assignments.ts` (canonical materials per part: your `materials` fields must match it exactly),
`src/content/materials/ids.ts`, `src/timeline/missions/outline.ts` (missions and phase ids),
`src/content/sources/core.ts` (reuse these source ids).

## Deliver
1. `LESSONS` in `src/content/parts/index.ts`: a `PartLesson` (all seven contract questions)
   for every principal part in `PARTS` and a `PartNote` for each non-principal part. Split
   into files by system (propulsion.ts, fluids.ts, structures.ts, ...), re-exported by index.ts.
2. `PHASE_CARDS` in `src/content/phaseCards/index.ts`: one `PhaseCard` for every phase of every
   mission and branch in `OUTLINES` (key `${mission}:${phase}`, branch phases keyed with the
   mission id too), answering What is happening? Why now? Which parts are active? What forces or
   environment matter? What enables the next phase?
3. `PART_SOURCES`: sources you cite beyond the core list (NASA, ESA, manufacturer technical
   documentation, textbooks such as Sutton & Biblarz "Rocket Propulsion Elements", Huzel & Huang
   "Modern Engineering for Design of Liquid-Propellant Rocket Engines" (NASA SP-125), NASA
   technical reports). Mark `accessed: 'reference'` unless you actually opened it (you have no
   web access to nasa.gov from this environment, so say reference).
4. A test that checks: every PartId has a lesson; principal parts have non-empty text for all
   seven questions and all three depths; `materials` equals `ASSIGNMENTS[id]` (same materials,
   same inThisVehicle flags); every `connections` id and every phase link (mission+phase) exists;
   every cited source id exists; no em dashes (U+2014) anywhere; every phase card exists.

## The vehicle you are explaining (be consistent with it)
KIMBLE K-1, generic educational two-stage LOX/RP-1 vehicle (read spec.ts): 7 x E-1
gas-generator engines on the booster (sea-level, 760 kN each, Isp 285/312 s, regeneratively
cooled with RP-1, TEA-TEB hypergolic ignition, hydraulic TVC gimbal +-5 deg), one E-1V on the
upper stage (same core, niobium radiatively cooled nozzle extension, expansion ratio 110, Isp
342 s, restartable). Booster: separate RP-1 (lower) and LOX (upper) tanks with an intertank,
LOX downcomer through the RP-1 tank, helium in carbon-overwrapped bottles (COPVs) submerged in
the LOX tank, Al-Li barrels and Al 2219 domes, thrust structure, base heat shield, raceway,
carbon-composite interstage, titanium grid fins, carbon-fibre landing legs, nitrogen cold-gas
RCS; pneumatic pushers and collets for stage separation. Upper stage: common bulkhead
(insulated sandwich) between RP-1 and LOX, avionics ring (flight computers, IMU, GNSS),
settling thrusters. Payload adapter with clamp band; fairing of carbon/aluminium-honeycomb
sandwich halves. Spacecraft: satellites (bus, arrays, antenna, attitude control, MLI, apogee
engine), crew capsule (ablative heat shield, reusable ceramic backshell tiles, drogue and main
parachutes, docking system), service module, abort tower, station. Launch site: mount and
hold-downs, service tower, flame deflector, water deluge.

## Quality
Each answer tied to something the learner can see (point to the geometry: "the ring of
orifices on the injector face", "the comb of channels in the liner section"). Explain
mechanisms causally (pressure, flow, heat, load paths). Correct engineering: e.g. why pumps
(tank pressure vs chamber pressure and tank mass), why regenerative cooling works (fuel as a
heat sink, conductive liner, thin wall), why a gas generator costs efficiency (dumped turbine
gas), why the nozzle differs at sea level and in vacuum (exit pressure vs ambient, flow
separation), why grid fins (effective at high Mach, compact stowage), why legs must be light,
why LOX on top (centre of mass forward, stability; downcomer as the cost), why helium COPVs in
LOX (cold helium is dense), common bulkhead tradeoffs, fairing sandwich (stiffness to weight,
acoustic loads), heat shield ablation vs reusable tiles, parachute reefing (limits opening
shock). Misconceptions: e.g. "the flame pushes on the air", "turbopumps are slow", "cooling
channels insulate", "rockets go straight up", "the fairing protects from vacuum". State what
is illustrative. Figures: use spec.ts numbers with units; other numbers only with a source and
the condition. No em dashes. Aim for depth, precision and clarity rather than length.
