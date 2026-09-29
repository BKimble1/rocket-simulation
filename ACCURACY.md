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
- Mission design choices: the station mission expends its booster because the crew stack
  (capsule, service module and abort tower from the dataset) needs its whole propellant load;
  crew ascent is throttled to hold 4 g; the geostationary satellite reaches its orbit with three
  finite burns of a 450 N apogee engine centred on successive apogees (perigee raised and the
  28.5° inclination removed in steps); the lunar probe passes the Moon's trailing side, so the
  flyby adds energy (a gravity assist) and it leaves the Earth-Moon system; expended boosters
  are tracked ballistically to the sea.

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
- Parachute drag areas come from the canopy sizes in the dataset with representative drag
  coefficients; inflation and reefing timing are authored.
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

The tables below are produced from `buildMission(id).facts` by `node scripts/accuracy-facts.mjs` (all facts: `node scripts/mission-report.mjs`)
and are checked by the tests in `src/timeline` (the lesson numbers are checked against them in `src/content`).

<!-- FACTS:BEGIN -->
### Satellite to low Earth orbit

| Fact | Value | Unit | Meaning |
|---|---:|---|---|
| `liftoffMass` | 441,243 | kg | stack mass at liftoff (T-0) |
| `liftoffTW` | 1.204 | ratio | liftoff thrust-to-weight: 7 x E-1 sea-level rated thrust / liftoff weight |
| `maxQ.t` | 82.8 | s | time of maximum dynamic pressure |
| `maxQ.kPa` | 21.95 | kPa | maximum dynamic pressure |
| `maxQ.altKm` | 12.29 | km | altitude at maximum dynamic pressure |
| `meco.t` | 147.4 | s | first-stage main engine cutoff |
| `meco.altKm` | 53.53 | km | altitude at the end of the 0.8 s MECO shutdown transient (the stack climbs about 1 km more after the MECO event on orbital flights) |
| `meco.speed` | 1,956 | m/s | inertial speed at the end of the MECO shutdown transient |
| `meco.s1PropLeft` | 50,323 | kg | first-stage propellant left after the MECO shutdown transient (the landing reserve on recovery flights) |
| `stageSep.t` | 151.2 | s | stage separation |
| `fairingSep.t` | 224.7 | s | payload fairing separation command (the halves release 1.2 s later) |
| `seco.t` | 437.1 | s | upper-stage engine cutoff (SECO) into the insertion orbit |
| `insertion.periKm` | 200 | km | perigee altitude of the insertion orbit at SECO |
| `insertion.apoKm` | 400 | km | apogee altitude of the insertion orbit at SECO |
| `circ.dv` | 56.68 | m/s | velocity change of the circularization burn |
| `orbit.periKm` | 399.6 | km | final orbit perigee altitude |
| `orbit.apoKm` | 400.4 | km | final orbit apogee altitude |
| `orbit.incDeg` | 28.5 | deg | final orbit inclination |
| `orbit.periodMin` | 92.42 | min | final orbit period |
| `rtls.boostbackDv` | 1,789 | m/s | velocity change of the boostback burn |
| `rtls.entryDv` | 539.2 | m/s | velocity change of the entry burn |
| `rtls.landingDv` | 539.8 | m/s | velocity change of the landing burn |
| `rtls.landingErrorM` | 0.3788 | m | touchdown distance from the landing-zone centre |
| `rtls.touchdownSpeed` | 1.147 | m/s | booster speed at touchdown |
| `rtls.propLeftKg` | 711.6 | kg | booster propellant left after touchdown |

### Suborbital research flight

| Fact | Value | Unit | Meaning |
|---|---:|---|---|
| `s1LoadKg` | 54,097 | kg | first-stage propellant loaded (partial load, computed) |
| `liftoffMass` | 84,301 | kg | stack mass at liftoff (T-0) |
| `meco.t` | 60.4 | s | first-stage main engine cutoff |
| `meco.altKm` | 36.09 | km | altitude at the end of the 0.8 s MECO shutdown transient (the stack climbs about 1 km more after the MECO event on orbital flights) |
| `meco.speed` | 1,313 | m/s | inertial speed at the end of the MECO shutdown transient |
| `capsuleSep.t` | 96.4 | s | capsule separation (suborbital: from the booster; station: from the upper stage) |
| `apogee.km` | 116.7 | km | capsule apogee altitude |
| `karman.freeFallS` | 119 | s | time the capsule spends above 100 km |
| `entry.peakG` | 5.68 | g | peak sensed deceleration of the capsule during entry |
| `entry.peakHeating.kWm2` | 12.65 | kW/m^2 | peak stagnation-point heating rate (Sutton-Graves) |
| `drogue.t` | 413.4 | s | drogue parachute deployment |
| `main.t` | 513.4 | s | main parachute deployment (reefed) |
| `splash.speed` | 5.379 | m/s | capsule speed at splashdown (under the three mains) |
| `rtls.landingErrorM` | 0.5359 | m | touchdown distance from the landing-zone centre |
| `rtls.touchdownSpeed` | 1.188 | m/s | booster speed at touchdown |
| `rtls.propLeftKg` | 387.1 | kg | booster propellant left after touchdown |

### Geostationary transfer

| Fact | Value | Unit | Meaning |
|---|---:|---|---|
| `liftoffMass` | 436,543 | kg | stack mass at liftoff (T-0) |
| `meco.t` | 174 | s | first-stage main engine cutoff |
| `meco.s1PropLeft` | 1,500 | kg | first-stage propellant left after the MECO shutdown transient (the landing reserve on recovery flights) |
| `boosterImpact.downrangeKm` | 897.2 | km | ground distance from the pad to where the expended booster falls into the ocean |
| `parking.periKm` | 200 | km | parking orbit perigee altitude |
| `parking.apoKm` | 200 | km | parking orbit apogee altitude |
| `seco1.t` | 426.9 | s | first upper-stage cutoff, into the parking orbit |
| `ses2.t` | 1,558 | s | upper-stage restart for the GTO injection |
| `injection.burnS` | 51.48 | s | duration of the GTO injection burn |
| `gto.periKm` | 200.6 | km | transfer orbit perigee altitude |
| `gto.apoKm` | 35,788 | km | transfer orbit apogee altitude (target 35,786 km) |
| `apogee.climbH` | 5.224 | h | time from satellite separation to apogee |
| `apogeeBurn.count` | 3 | count | number of apogee-engine burns, each centred on a later apogee (the satellite coasts through the first for checkout) |
| `apogeeBurn.burn1Min` | 87.33 | min | duration of the first apogee burn |
| `apogeeBurn.burn2Min` | 58.37 | min | duration of the second apogee burn |
| `apogeeBurn.burn3Min` | 40.32 | min | duration of the third (last) apogee burn |
| `apogeeBurn.spanH` | 30.45 | h | time from the first ignition to the end of the last burn |
| `apogeeBurn.dvIdeal` | 1,836 | m/s | ideal impulsive velocity change at the first apogee to a geostationary orbit, the 28.5 deg plane change included |
| `apogeeBurn.dv` | 1,845 | m/s | velocity change the burns delivered together (rocket equation); a little above the ideal change: finite-burn loss |
| `apogeeBurn.propLeftKg` | 99.73 | kg | satellite propellant left after the last burn (for station keeping) |
| `final.periKm` | 35,786 | km | satellite orbit perigee altitude after the last burn |
| `final.apoKm` | 35,792 | km | satellite orbit apogee altitude after the last burn |
| `final.incDeg` | 0.0349 | deg | satellite orbit inclination after the last burn |
| `final.periodH` | 23.93 | h | satellite orbit period after the last burn (geostationary: one sidereal day, 23.93 h) |

### Station delivery

| Fact | Value | Unit | Meaning |
|---|---:|---|---|
| `crew.capsuleKg` | 8,300 | kg | crew capsule mass flown |
| `crew.serviceModuleKg` | 4,100 | kg | service module mass flown (dry + propellant) |
| `crew.abortTowerKg` | 5,400 | kg | abort tower mass flown |
| `liftoffMass` | 448,943 | kg | stack mass at liftoff (T-0) |
| `liftoffTW` | 1.183 | ratio | liftoff thrust-to-weight: 7 x E-1 sea-level rated thrust / liftoff weight |
| `maxQ.kPa` | 21.48 | kPa | maximum dynamic pressure |
| `meco.t` | 174 | s | first-stage main engine cutoff |
| `boosterImpact.downrangeKm` | 734.7 | km | ground distance from the pad to where the expended booster falls into the ocean |
| `les.t` | 196.8 | s | abort tower jettison |
| `seco.t` | 459.3 | s | upper-stage engine cutoff (SECO) into the insertion orbit |
| `insertion.periKm` | 200 | km | perigee altitude of the insertion orbit at SECO |
| `insertion.apoKm` | 250 | km | apogee altitude of the insertion orbit at SECO |
| `phasing.revs` | 4 | count | phasing revolutions before the first raise burn |
| `phasingBurn1.dv` | 42.43 | m/s | its velocity change |
| `phasingBurn2.dv` | 57.19 | m/s | its velocity change |
| `raise.periKm` | 397 | km | capsule orbit perigee altitude after the raise burns |
| `raise.apoKm` | 398.2 | km | capsule orbit apogee altitude after the raise burns |
| `docking.closingSpeed` | 0.08 | m/s | closing speed at contact |
| `docking.hoursAfterLaunch` | 8.369 | h | time from liftoff to soft capture |
| `sm.propLeftKg` | 1,108 | kg | service-module propellant left after docking |
| `station.altKm` | 400 | km | station orbit altitude (circular) |

### Capsule return

| Fact | Value | Unit | Meaning |
|---|---:|---|---|
| `capsuleKg` | 8,300 | kg | crew capsule mass (spec.ts CAPSULE) |
| `serviceModuleKg` | 3,708 | kg | service module mass at undocking: dry mass plus the propellant the station mission arrives with |
| `undock.smPropKg` | 1,108 | kg | service-module propellant at undocking (the station mission's sm.propLeftKg, shared constant SM_PROP_AT_DOCKING) |
| `deorbit.dv` | 103.9 | m/s | deorbit burn velocity change (retrograde, service-module engine) |
| `deorbit.burnS` | 45.64 | s | deorbit burn duration |
| `deorbit.perigeeKm` | 45 | km | perigee altitude after the deorbit burn |
| `smSep.dvLeft` | 196 | m/s | velocity change that propellant could still give the capsule and service module (rocket equation): the deorbit margin |
| `entry.peakHeating.altKm` | 58.18 | km | altitude of peak heating |
| `entry.peakHeating.kWm2` | 400.6 | kW/m^2 | peak stagnation-point heating rate (Sutton-Graves) |
| `entry.peakHeating.speed` | 6,305 | m/s | air-relative speed at peak heating |
| `entry.peakG` | 4.181 | g | peak sensed deceleration of the capsule during entry |
| `entry.peakG.altKm` | 38.01 | km | altitude of the peak deceleration |
| `entry.blackoutS` | 382 | s | duration of the high-heating band (heating above a quarter of its peak; plasma blackout) |
| `drogue.t` | 85,148 | s | drogue parachute deployment |
| `main.t` | 85,224 | s | main parachute deployment (reefed) |
| `splash.speed` | 7.562 | m/s | capsule speed at splashdown (under the three mains) |
| `splash.eastOfPadKm` | 271.5 | km | splashdown distance east of the pad |

### Lunar flyby

| Fact | Value | Unit | Meaning |
|---|---:|---|---|
| `liftoffMass` | 434,343 | kg | stack mass at liftoff (T-0) |
| `parking.periKm` | 200 | km | parking orbit perigee altitude |
| `parking.apoKm` | 200.1 | km | parking orbit apogee altitude |
| `tli.t` | 1,920 | s | trans-lunar injection burn start |
| `tli.burnS` | 60.92 | s | TLI burn duration |
| `tli.speed` | 10,945 | m/s | inertial speed at TLI cutoff |
| `tli.c3km2s2` | -1.444 | km^2/s^2 | characteristic energy after TLI (negative: still bound to the Earth) |
| `cruise.days` | 2.744 | days | time from probe separation to closest approach |
| `closestApproach.altKm` | 1,500 | km | altitude above the lunar surface at closest approach |
| `closestApproach.angleFromEarthDeg` | 77.07 | deg | angle between the Earth direction and the probe, seen from the Moon |
| `closestApproach.speedRelMoon` | 2,078 | m/s | speed relative to the Moon at closest approach |
| `soiExit.speed` | 1,743 | m/s | speed relative to the Earth when the probe leaves the Moon's sphere of influence |
| `soiExit.escapeSpeed` | 1,331 | m/s | Earth escape speed at that distance (the probe leaves the Earth-Moon system when it is faster) |
| `outbound.vInf` | 1,114 | m/s | hyperbolic excess speed relative to the Earth after the flyby: the speed left far from the Earth (0 when still bound) |
| `outbound.ecc` | 1.861 | ratio | geocentric eccentricity after the flyby (above 1: hyperbolic, leaving the Earth-Moon system) |
<!-- FACTS:END -->

## Sources

The engineering sources are listed in the application (Sources and credits) and in
`src/content/sources/`. They are marked "identified by reference" where the page could not be
opened from the build environment (nasa.gov and NTRS were blocked by its network policy), so
statements were written from established engineering knowledge and checked for consistency
with the dataset; no numbers were copied from inaccessible documents. The SpaceX Falcon user's
guide was not accessed, and no Falcon-specific values are used.
