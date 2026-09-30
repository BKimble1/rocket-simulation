# Validation report

What was tested, how, and what was measured, with the limits of each result stated. Dates:
29 to 30 September 2026. Commit: see `git log` on the working branch.

## The test machine (read this first)

All tests, measurements, screenshots and recordings were made in a cloud container with
**4 CPU cores, 15 GB RAM and no GPU**. Chromium (Playwright 1.56, Node 22) rendered WebGL 2
with **SwiftShader**, a CPU rasteriser (`ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device
(Subzero)))`). Consequences:

- Frame rates below are what a CPU rasteriser achieves (well under 1 fps for most scenes).
  They are **not** GPU frame rates and say nothing about a phone or a desktop GPU. No claim of
  60 fps, or of any frame rate on an iPhone or other device, is made anywhere in this project.
- Draw calls, triangle counts, download sizes, time to ready and behaviour (the end-to-end tests)
  are hardware-independent and are the numbers to rely on.
- The app's automatic tier detection correctly picks **low** for a software renderer.

## Static checks and unit tests

| Check | Result |
|---|---|
| `npx tsc -b` (strict TypeScript, whole tree) | clean |
| `npm run build` (base `/`) and `npm run build:rocket` (base `/rocket/`) | both succeed |
| `npm test` (Vitest) | **26 files, 387 tests, all pass** |

What the unit and model tests cover:

- **Dataset** (`vehicle/spec.test.ts`): nozzle exit and throat areas agree with the expansion
  ratios; rated thrust within 96 to 99 % of the ideal thrust coefficient; sea-level thrust equals
  vacuum thrust minus ambient pressure times exit area; the E-1V shares the E-1 core; the seven
  engines fit the 3.7 m base; tank volumes hold the propellant loads.
- **Frames** (`world/frames.test.ts`): site position, Earth rotation, Moon orbit.
- **Physics and missions** (`timeline/**`, 162 tests): every mission meets its targets (orbits,
  landing within 10 m below 2.5 m/s, docking, splashdown, lunar escape); bodies stay together
  until separation and separate without jumps; tank levels fall only while burning; throttles
  are zero when no propellant flows; g-loads within crew (4.0 g) and payload limits; the
  presentation map is contiguous, monotonic and 8 to 15 minutes per mission with honest notes;
  sampling at, before and after events; activity channels (thrusters, engines, plasma) are off
  on the pad; an independent recomputation of headline facts (below).
- **Content** (`content/**`, 121 tests): every principal part has the seven-question lesson at
  three depths; every number quoted in lessons, phase cards, checks, the glossary and the
  why-demonstrations matches `spec.ts` or the built mission facts; links resolve; no em dashes in
  interface text; materials link both ways with parts.
- **Models** (`scene/**`): vehicle and engine fit (clearances inside the interstage, nozzle
  spacing), no engine line passes through another or through a wall, tank liquids, thermal
  classes on every mesh, draw-call budgets per detail level, spacecraft material tags agree with
  the materials table, launch-site anchors and tags, atmosphere and lighting functions, effects
  determinism (the ground cloud is never tan; particles are pure functions of mission time).

### Independent recomputation of mission facts

A reviewer recomputed key numbers from scratch and compared them with the timelines (tests in
`timeline/missions/review.test.ts` and `consistency.test.ts`):

| Check | Timeline | Independent |
|---|---|---|
| Upper-stage burns: rocket equation on the tracked mass vs integrated acceleration | e.g. 6,450 m/s | 6,451 m/s (all within 0.1 %) |
| Maximum dynamic pressure | 21.5 to 22.3 kPa at 81 to 85 s, 12.3 km, Mach 1.3 | ½ρv² agrees |
| GTO injection / apogee change needed | 2,456.6 / 1,478 m/s | Hohmann 2,457 / 1,478 m/s |
| Capsule peak heating | 400.6 kW/m² at 58 km, 6.3 km/s | Sutton-Graves 400 kW/m² |
| Deorbit burn | 103.9 m/s | impulsive estimate 104.0 m/s |
| Lunar cruise (checked on the earlier far-side geometry) | 2.87 days | two-body estimate 2.90 days |

The per-mission facts are tabulated in [`ACCURACY.md`](../ACCURACY.md), generated from the
same code (`node scripts/accuracy-facts.mjs`).

## End-to-end tests (Playwright, production build)

Projects: `desktop` (1440 × 900), `phone-portrait` (390 × 844) and `phone-landscape` (844 × 390).
Every test fails on any page error, console error, failed request or HTTP status ≥ 400.

| Area | Tests |
|---|---|
| First screen | rocket scene, title, three actions, KIMBLE and ONE / FAB identity (desktop and phones); honest no-WebGL fallback; reduced motion respected |
| Explore | find a part, read its lesson at every depth, switch views, open the materials layer and follow a material back to a part; deep link to a part and view (phones); keyboard-only part selection |
| Learning | learning path, glossary search, a knowledge check answered, explored and checked progress kept apart, reset clears both |
| Missions | satellite walkthrough (start, jump to staging, inspect a part from the phase card, return to exactly the paused moment, switch through every camera mode, finish); seeking reconstructs body positions exactly and never grows the scene; booster storyline keeps the shared mission time; each other mission plays into its final chapter; mission playback on phones |
| Watch | captions follow the film, pause holds, chapters seek (desktop and phones) |

**Results.** The final full run (all three projects, one worker) passed **24 of 25** in
18.5 minutes; the one failure was a flaw in the seek test (below), fixed and re-run: **all 25
pass**. The `/rocket/` base-path build passed the home, explore and watch tests (7 of 7) with
no request errors, which checks that every asset, texture and narration file resolves under
the sub-path.

**Defects the end-to-end tests found in the application (fixed):**

1. Knowledge-check answer buttons rendered with the class `choicenull` (a template string
   interpolated `null`), so they were unstyled.
2. On phones the ONE / FAB wordmark appeared nowhere (the header subtitle that carries it is
   hidden below 720 px); it is now on the phone home card.

**Defects the documentation screenshots found (fixed):** each still was inspected, and these
were fixed before the final set was rendered:

1. The telemetry's felt acceleration read 0.0 g whenever the mission was paused (it was
   differentiated between interface ticks); it is now taken from the reference trajectory.
2. Deep links lost their camera and followed body on load (`?cam=map`, `?focus=booster`); an
   end-to-end test now covers both.
3. At the lunar closest approach the camera looked 64° away from the Moon (the probe passes over
   the night side, with the Sun 46° from the Moon); it now looks past the probe at the Moon, and
   near the Moon the telemetry reads height above the Moon and speed relative to it.
4. The station docking was nearly black: the docking lights sat on the docking axis, under a metre
   apart, and the final-approach framing left the capsule out of frame. Both fixed.
5. On a landscape phone the telemetry overlapped the mission title while the phase card was open.

**Test flaws fixed along the way** (not application defects): fixed waits that assumed a frame
rate the software renderer cannot reach were replaced by waits on rendered frames; an
ambiguous "Pause" locator; a walkthrough that compared a playing mission's time; a location
timeout too short for this machine under load; and the seek test's object count, which grew
from 464 to 471 because plume volumes are created as engines first light and are then pooled
(bounded): the test now checks that repeating the same seeks after a warm-up adds nothing.

## Performance (measured)

`node scripts/perf.mjs` on the production build, one scene at a time on the otherwise idle
machine, DPR 1, automatic tier (low, as detected) unless stated. Frame times are SwiftShader
CPU times, not GPU times (see the first section).

| Scene | Tier | Draw calls | Triangles | Median frame (ms) | p95 (ms) | Ready (s) |
|---|---|---:|---:|---:|---:|---:|
| Home (hangar), desktop 1440 × 900 | low | 169 | 410k | 1107 | 2114 | 21.5 |
| Home (hangar), phone 390 × 844 | low | 169 | 410k | 704 | 1426 | 19.5 |
| Explore: turbopump cutaway (close-up) | low | 320 | 943k | 2033 | 3065 | 37.4 |
| Explore: LOX tank cutaway | low | 271 | 825k | 1830 | 3534 | 34.7 |
| Mission LEO: liftoff, desktop | low | 265 | 768k | 7142 | 7142 | 34.2 |
| Mission LEO: liftoff, phone 390 × 844 | low | 265 | 768k | 3944 | 5147 | 33.7 |
| Mission LEO: maximum dynamic pressure | low | 201 | 482k | 2498 | 4706 | 34.7 |
| Mission LEO: orbital coast | low | 164 | 239k | 1534 | 2547 | 35.0 |
| Mission return: entry | low | 71 | 211k | 1201 | 4638 | 37.0 |
| Mission LEO: liftoff, forced high tier | high | 267 | 872k | 6249 | 6249 | 41.5 |

- **Draw calls.** The home screen fits the ~200-call phone budget (169). The busiest flight
  view (liftoff at the pad: site, vehicle, plumes, ground cloud) is 265; inspection close-ups in
  the hangar are 271 to 320 because they show internal detail on purpose. Two measures brought
  the hangar down from 438 calls / 1.13 M triangles to 169 / 0.41 M with no visible change: its
  shadow map is re-rendered only on frames where something moves, and the engine display stands
  show light models until the camera comes close.
- **Download.** Initial transfer to a ready home screen: **4.98 MB** (low tier). Earth and Moon
  maps now wait for tier detection, so a low-tier device no longer downloads the 4K maps as well
  (it was 8.93 MB before that fix). The high tier adds the 4K Earth and Moon maps (about 4 MB).
  Narration (5.5 MB in total, about 100 KB per segment) loads only in Watch mode, segment by
  segment.
- **Liftoff cost** is dominated by the ray-marched plume and ground-cloud volumes, which are
  cheap on a GPU and very expensive on a CPU rasteriser; this is why liftoff is the slowest
  scene here.
- **Quality scaling** (`src/scene/quality.ts`): three tiers chosen from the renderer and device,
  then adjusted from measured frame times with hysteresis (three slow 2 s windows to step down,
  eight fast windows and a 30 s cool-down to step up). On this machine it correctly settles on
  low. Its behaviour on real GPUs was not measured.

Not measured, and not claimed: frame rates on any GPU, phone or tablet; battery and thermal
behaviour; memory on mobile browsers.

## Narration

88 cues in 77 segments, synthesized offline with Kokoro-82M (`tools/narration/`), 694 s of audio.
Each cue is transcribed back with an offline speech recognizer and compared with its caption;
the final build has **no QA flags**. Captions carry every word, and the film stretches the
picture (labelled slow motion) rather than letting speech run ahead of it.

## Visual review

Each 3D module (vehicle, engines, spacecraft, launch site, Earth and space, effects) was built,
then reviewed by a separate expert pass that took fresh screenshots of the viewpoints its brief
lists, listed defects and fixed them in the module (for example: hairlines through skins from
MSAA with the logarithmic depth buffer, floating pusher rods, a conical chamber cylinder, dotted
highlights along brazed tubes, intersecting lines, a tan ground cloud, a pink entry wake,
stretched honeycomb, overlapping tanks, unstyled or floating parts). The integrated app was then
reviewed at desktop and phone sizes, which led to the framing of subjects clear of panels, the
phone header and toolbar, the camera path between distant hangar subjects, sun-side coast
cameras, orbit framing that keeps the vehicle in view, demonstration framing and the heat-shield
layer labels.

## Screenshots and recordings

<!-- MEDIA:BEGIN -->
Two kinds of recording, both made from the production build on the machine described above:

- **Wall-clock recordings** (`docs/recordings/realtime/`, 1280 × 720, Playwright screen video
  re-encoded to MP4): what a viewer on this machine actually saw, in real time, including loading.
  Because SwiftShader renders well under 1 fps here, motion in them is visibly stepped; that is
  this machine, not the app's frame pacing on a GPU.
  `home.mp4` (34 s), `explore.mp4` (55 s: find the turbopump, open its cutaway),
  `mission-leo.mp4` (69 s: play the satellite mission from liftoff), `watch.mp4` (59 s: the
  overview film with captions and narration).
- **Virtual-clock recordings** (`docs/recordings/virtual/`, 960 × 540, 30 fps): the page's clock
  is advanced exactly 1/30 s per captured frame, so each clip shows motion and continuity at
  true speed regardless of how long a frame took to render. They say nothing about frame rate.
  Each clip has a `.txt` beside it with the URL and frame count.
  `pad-ignition-liftoff`, `tower-clearance`, `staging`, `fairing`, `orbital-earth`,
  `booster-landing`, `station-docking`, `capsule-entry`, `lunar-encounter`, `hangar-exterior`,
  `engine-cutaway`.

Screenshots (`docs/screenshots/`, JPEG, rendered on the virtual clock with `scripts/still.mjs`):
desktop (1440 × 900): `desktop-home`, `desktop-explore-turbopump`, `desktop-explore-materials`,
`desktop-explore-heat-shield`, `desktop-mission-liftoff`, `desktop-mission-staging`,
`desktop-mission-orbit`, `desktop-mission-landing`, `desktop-mission-docking`,
`desktop-mission-entry`, `desktop-mission-lunar`, `desktop-map`; phone portrait (390 × 844):
`phone-home`, `phone-explore-lesson`, `phone-mission`; phone landscape (844 × 390):
`phone-landscape-mission`.

The hub card (`public/og/poster.jpg`, `preview.mp4` muted 8 s loop, `preview.jpg`) is rendered
by `scripts/hub-card.mjs` in the brand-only capture mode (`?ui=brand`).

All of it can be regenerated: `scripts/record-all.sh`, `scripts/screenshots.sh`,
`node scripts/hub-card.mjs` (see the README).
<!-- MEDIA:END -->

## Approximations and known limitations

- **Physics** is a point-mass model with authored guidance: a spherical rotating Earth with a
  co-rotating standard atmosphere, no J2, winds or third-body perturbations on Earth orbits, and
  an Earth-Moon restricted three-body model for the lunar flyby (see ACCURACY.md).
- **Eclipse lighting.** The LEO satellite deployment happens in Earth's shadow, so the
  spacecraft read nearly black there (no artificial fill light is added). The station docking
  also happens in shadow; there the capsule and the station carry docking floodlights, as real
  vehicles do, and those light the final approach.
- **Thermal view.** The booster's simplified cluster engines show their pump casings as ambient;
  the hangar display engines, modelled in full, show the LOX side as cryogenic.
- **Hairlines.** MSAA with the logarithmic depth buffer can draw thin lines where an internal
  face sits just behind a skin; the known cases were removed, the cause is renderer-wide.
- **Hangar camera moves** to a distant subject take one to three seconds, by design (the
  camera pulls back to keep the destination in view).
- **Software rendering** made the flight scenes run at well under 1 fps here; behaviour was
  verified, smoothness on real hardware was not.
- **Sources** that could not be opened from the build environment (nasa.gov and NTRS were
  blocked by its network policy) are marked "identified by reference"; no numbers were copied
  from inaccessible documents.
