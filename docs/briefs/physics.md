# Brief: trajectory physics and the six mission timelines

## You own
`src/timeline/physics/**`, `src/timeline/missions/**` EXCEPT `outline.ts` (read-only: the
phase and event vocabulary you must produce exactly), `src/timeline/build.ts` (replace the
stub), tests `src/timeline/**/*.test.ts`, and `scripts/mission-report.mjs` (a report printer).
Read-only: `src/timeline/types.ts` (the output contract), `src/timeline/sample.ts`,
`src/world/frames.ts`, `src/world/site.ts`, `src/vehicle/spec.ts`, `src/director/shots.ts`
(how shots are evaluated), `src/scene/vehicle/types.ts` (model frame).

## Deliver `buildMission(id: MissionId): MissionTimeline` for leo, suborbital, gto, station, return, lunar
Deterministic (same input, bit-identical output), fast (< 400 ms per mission in Node), no
NaN, validated by tests. This is a **reference trajectory computed once from a simplified
point-mass model with authored guidance**, not a real-time flight solver; say so in comments
and in your report. Physical time vs presentation time mapping is explicit (`pres`).

### Frames and conventions
* Integrate in frame I (inertial, `src/world/frames.ts`): gravity mu/r^2 (spherical Earth,
  no J2), Earth rotation for the launch site and for the atmosphere (air co-rotates with the
  Earth: air velocity at r is omega x r about `EARTH_AXIS`), Sun fixed.
* **Body poses**: every body's track gives the pose of the shared vehicle MODEL FRAME origin
  (first-stage nozzle exit plane on the axis, +Y toward the nose), not its centre of mass.
  Integrate centres of mass, then convert: origin = com - R(q) * comLocal. Estimate each
  body's comLocal (model frame y) and mass properties from `spec.ts` stations and propellant
  levels (a simple sum of stage dry mass at its middle + propellant in each tank at the tank's
  current liquid centroid is fine). While attached, all bodies share the stack's pose; at
  separation each inherits the stack's position and velocity exactly (continuity) and then
  moves on its own (pushers: +0.5 to 1.0 m/s relative, fairing halves outward ~2 m/s plus a
  slow tumble, payload springs ~0.4 m/s).
* On the pad the model frame equals the pad frame (`siteFrameQuaternion(t)`) translated to
  pad-local (0, `PAD.nozzleExitHeight`, 0): position = `sitePosition(t, 0)` + that offset
  rotated. Before liftoff the stack moves with the rotating Earth.
* Attitude quaternions must be smooth (no instantaneous flips): rate-limit attitude changes
  (e.g. <= 5 deg/s for the ascent stack, RCS flips of the booster <= 12 deg/s with ramps).

### Models
* Atmosphere: US Standard Atmosphere 1976 (layers to 86 km; exponential fit above) for
  density, pressure, temperature, speed of sound. Export it (the UI and effects use it).
* Thrust: T = mdot * Isp_vac * g0 - p_amb * A_exit per engine (so sea-level thrust and Isp
  come out consistent with `E1.thrustSL`/`E1.ispSL`: check it in a test), mdot from
  `thrustVac / (ispVac g0)`, times throttle. Drag: 0.5 rho v_rel^2 Cd(Mach) A with a slender
  body Cd(M) table (about 0.3 subsonic, peak ~0.55 near M 1.1, ~0.25 at M 5), capsule
  Cd ~1.3 (blunt, heat shield first), booster tail-first with fins ~1.0 for the descent, A from
  the body diameter.
* Ascent guidance: vertical rise until tower clear (about 110 m), a short pitch kick (1-2 deg
  over a few seconds, eastward), then a gravity turn (attitude along the air-relative velocity,
  zero angle of attack) through the atmosphere; throttle-down to about 70 % around max-q and
  back up; S1 MECO when the propellant left equals the recovery reserve (RTLS needs a large
  reserve: size it so boostback + entry + landing burns fit; expendable missions burn almost
  everything); 3 s coast; separation; upper-stage ignition ~7 s after separation (clear of the
  interstage). Upper stage: linear-tangent steering (tan(theta) = a + b t) solved by a
  deterministic shooting/Newton iteration to reach the target orbit with zero flight-path angle
  at SECO. Fairing separation after upper-stage ignition when altitude > ~110 km and heating is
  low. Target LEO orbit: 400 x 400 km (+-15 km) inclination 28.5 deg, direct insertion; if that
  does not converge robustly, a 220 x 400 km insertion plus a short circularization burn is
  acceptable (report which you did).
* Orbits: Kepler (universal variables or classical elements) for coasts; integrate burns with
  RK4 at small steps (<= 0.5 s in atmosphere, <= 2 s for burns in vacuum); sample coasts
  coarsely (the sampler interpolates with cubic Hermite from position and velocity, so 10-30 s
  in LEO is fine; check interpolation error in a test: < 5 m in LEO).
* **Booster RTLS branch** (leo, station): after separation, cold-gas flip (~15-20 s), boostback
  burn on three engines reversing the downrange velocity so the ballistic arc returns toward
  the landing zone (`LANDING_ZONE`, pad-local), grid fins deploy after boostback, coast over
  apogee, entry burn on three engines at ~60-70 km descending (~20 s), aerodynamic descent with
  grid-fin steering, landing burn on the centre engine only (single-engine thrust exceeds the
  near-empty booster's weight, so it cannot hover: time the ignition so velocity reaches ~0 at
  touchdown), legs deploy ~8 s before touchdown, touchdown within 10 m of the LZ centre at < 2
  m/s, upright. Shoot on boostback timing/heading; the terminal phase may use a smooth
  polynomial guidance law but must respect thrust limits. Propellant must never go negative.
* **Suborbital**: booster-only stack (`MOUNT_Y.boosterCapsuleAdapter`, research capsule mass
  from `PAYLOADS`), reduced propellant load (compute), nearly vertical ascent tilted slightly
  east, MECO when the capsule's coast apogee will be ~110-120 km, capsule separates, minutes
  of free fall above ~80 km, entry heat shield first, drogues ~6-7 km, mains ~2 km (reefed then
  full), splashdown offshore to the east at ~7-9 m/s. Booster: flip, fins, landing burn at the
  LZ (branch `booster-return`).
* **GTO**: parking orbit ~200 km, coast to the proper point (the transfer apogee must lie on
  the equatorial plane crossing: burn at a node), settling thrusters (`s2.rcs`) then restart,
  injection to ~200 x 35,786 km, SECO-2, satellite separation, accelerated coast to apogee
  (~5 h), a checkout orbit, then three apogee-engine burns by the satellite (450 N, centred on
  successive apogees) that raise perigee in steps and remove the 28.5 deg inclination, ending in
  a near-circular geostationary orbit; the coasts between burns are omitted with notes. No
  booster recovery (the booster is expended and tracked to the sea).
* **Station**: a station in a 400 km circular orbit in the launch plane (28.5 deg; the launch
  is timed so the pad is in the station's plane: state it). The crew stack (capsule, service
  module, abort tower from the dataset) needs the whole booster, which is expended. Capsule inserted ~200 x 250 km
  behind the station by a phase angle that makes phasing take several orbits; phasing burns
  (Hohmann-like) raise it to just below/behind the station; final approach along the radial
  line from below (R-bar) using Clohessy-Wiltshire relative motion with hold points (e.g. 400 m,
  150 m, 20 m) and a final closing speed <= 0.1 m/s; soft capture then hard capture
  (`cap.docked`). Abort tower jettison after staging (`les` body with its own motor burn).
  Service module solar arrays deploy after capsule separation. Omit long quiet intervals in the
  presentation (`omitted: true` segments with notes).
* **Return**: start docked at the station; undock, departure burns, coast, deorbit burn
  (retrograde, ~100 m/s, service module engine) timed so splashdown is in the Atlantic within
  a few hundred km east of the pad; service module separation before entry interface (~120 km)
  and SM breakup/end of its track; capsule entry (ballistic or low lift, peak ~4-5 g, peak
  heating ~60-70 km), `cap.plasma`, `cap.char`, drogues ~7 km, mains ~2 km (reefed, then
  full), splashdown ~8 m/s.
* **Lunar**: parking orbit ~200 km, coast, settle, restart for trans-lunar injection (TLI),
  probe separation, integrate Earth + Moon gravity (restricted three-body with the Moon on
  `moonPosition(t, moonPhase0)`; RK4 or RK45 with adaptive/limited steps) ~3 days, closest
  approach ~1,000-3,000 km above the lunar surface, passing the Moon's trailing side so the
  flyby adds energy (a gravity assist) and the probe leaves the Earth-Moon system on a
  hyperbolic path (no capture, no return). Choose `moonPhase0` and TLI parameters by a deterministic search.
  Events `soi-enter`/`soi-exit` at the Moon's sphere of influence (~66,000 km).
* **Presentation maps (`pres`)**: 1x through powered flight; coasts accelerated with notes
  ("Coast accelerated x20"); multi-hour waits compressed hard or `omitted` with a note
  ("5 h climb to apogee shown at x600"); ~8-15 minutes of presentation per mission at 1x.
  Staging and deployments stay at 1x (or 0.5x slow motion, labelled). Monotonic, contiguous.
* **Channels** (`ChannelId`): throttles with realistic start/stop transients (0.5-2 s),
  gimbal angles consistent with steering, propellant fractions integrated from mass flow (so
  tank visuals agree with burns), deploy states, pad states (venting before, arms retract at
  ~T-45 s... choose; hold-down release at T-0 after thrust is verified ~T-2 s; deluge from
  T-5 s), RCS activity during flips/settling.
* **Phases** exactly as in `OUTLINES` (ids, order, titles), with start/end times from events;
  `activeParts` from `src/vehicle/parts.ts` ids. Branch phases for the booster.
* **Shots**: author an Auto-director shot list per mission and per branch (kinds and params
  as evaluated by `src/director/shots.ts`: read it). Cinematic and calm: establish on the pad
  (pad-wide), ignition (pad-close), liftoff (tower), tower clearance and pitch-over (pad-wide
  then ground-track), max-q (chase), staging held readable (`staging` with `also` = the other
  body), fairing separation (`staging` also fairingA), orbit coast (`orbit`), deployments
  (`deploy`), rendezvous (`approach` also station), entry (`entry`), parachutes/splashdown
  (`splash`), booster landing (`landing`), lunar encounter (`lunar`). Shots ~6-40 s long,
  never frantic.
* **facts**: key numbers (MECO t/alt/speed, max-q t/value, SECO t, orbit apo/peri,
  reserves, landing error/speed, entry peak g/heating time, lunar closest approach, GTO apogee,
  docking closing speed...). Also export `telemetryAt(tl, body, t): TelemetrySample`.

## Tests (must pass: `npx vitest run src/timeline`)
Every mission: builds < 1 s; deterministic; sample times strictly increasing; quaternions unit;
no NaN; event and phase order as outlined; all outline events present; channels in range;
pres map contiguous and monotonic; attached bodies coincide until separation and separate with
the expected relative speed (no teleport: position continuity at every separation); orbit
targets met (LEO perigee > 380 km, GTO apogee 35,786 +- 300 km, station docking closing speed
<= 0.12 m/s), booster lands within 10 m at < 2.5 m/s with propellant >= 0, capsule splashes
down in water (use `public/textures/earth/water_2048.png` or a coarse ocean check) at < 10 m/s,
lunar closest approach within the target band, sea-level thrust and Isp consistent with spec.
Validate the rocket equation example: first-stage ideal delta-v from spec numbers.

Print a report with `node scripts/mission-report.mjs` (or a vitest that logs) and include the
key facts in your final message. Keep the numbers physically coherent with `spec.ts`; if the
spec makes a target impossible, tell me which value you changed in your own files instead
(e.g. payload mass per mission) and why. Do not edit spec.ts.
