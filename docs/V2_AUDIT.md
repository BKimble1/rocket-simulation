# V2 audit: defects found in V1, and what was done about them

Baseline: `claude/kimble-rocket-engineering` at `ec43e1f` (the newest V1 commit; it descends from
`6ceb657`, the commit named in the V2 brief, by four documentation and telemetry commits).
Environment: 4 CPU cores, no GPU, Chromium with SwiftShader (see VALIDATION.md).

How the baseline was measured:

- **Camera trace** (`src/director/trace.ts`, added before any change, commit `a28b7bc`): the real
  director runs against the real mission timelines in Node, frame by frame, without rendering,
  and records the framing identity, transitions started, stack size, pose, altitude, per-frame
  turn and roll of the view, field-of-view steps and whether the subject is inside the frustum.
  `npx vitest run src/director/audit.report.test.ts --silent=false` prints the report; the V1
  report is reproduced below.
- **Browser reproduction** on the production build with the virtual clock (`?virt=1`), for
  defects that need rendering (dissolves), and the existing V1 virtual-clock recordings
  (`docs/recordings/virtual/`, rendered from V1) as the visual baseline.

## Confirmed at runtime

| # | Defect | Reproduction | Measured (V1) | Files |
|---|---|---|---|---|
| R1 | A manual camera mode restarts its transition every frame | Mission LEO, Chase (or Ground, Onboard), play T-5 to T+60 | 3,901 transitions in 3,901 frames; the four-slot blend list evicted every frame, so any change of framing became a snap after four frames | `director/director.ts` (`modeShot` sets `from: t`; the key includes `from`) |
| R2 | Ground mode snaps when the vehicle passes 1,500 m | Mission LEO, Ground, play through T+33 s | 59° turn of the view in one frame (pad camera to tracking camera) | `director/director.ts` |
| R3 | Free camera keeps orbiting the previous body | Mission LEO, Free on the upper stage at T+301 s, switch to the booster | booster 80° off the view axis 5 s later (never framed) | `director/director.ts` (`setFocus`, blend key `free`) |
| R4 | Heading flip of the travel frame during boostback | LEO, Chase on the booster, T+167 to T+223 | 137° turn in one frame | `director/shots.ts` (`basisOf` from the inertial horizontal velocity, which reverses) |
| R5 | Orbit shots jump within a shot | GTO and station missions, Auto | 62° and 117° turns, 83° roll in one frame | `director/shots.ts` (`sunSideAz` hard threshold); omitted intervals played at x5,000 to x10,000 with no dissolve |
| R6 | Camera below the Earth's surface | LEO, Auto, follow the booster (V1 focus logic) | 22 km below the surface | `director/director.ts` (linear blend of Earth-centred coordinates) |
| R7 | Subject out of frame in Auto | Staging, fairing, deployment, rendezvous shots in all orbital missions | 758 to 2,636 frames per mission (trace at x4) | `director/shots.ts` (point lerp toward a far secondary body; lens clamped at 70° while bodies separate) |
| R8 | Bursts of mode changes snap and roll the view | Auto, Chase, Onboard, Free, Auto at 0.3 s intervals | 136° turn and 126° roll in one frame | `director/director.ts` (eviction from the four-slot list) |
| R9 | Interrupted location dissolve shows black or wrong frames | Explore, request flight, then hangar again four frames later | the hangar picture is replaced by black for several frames (the snapshot was the raw new-location render, not the displayed composite; flight had no pose yet) | `scene/Stage.tsx` |
| R10 | Liftoff hidden and cropped | LEO, Auto, T-14 to T+5 (V1 recording `pad-ignition-liftoff`) | the pad-close shot crops the vehicle above the interstage; the ground cloud covers the whole frame and the vehicle is not seen leaving the mount | `timeline/missions/*.ts` shot lists, `scene/effects` |
| R11 | Tower shot passes through the tower lattice | LEO, Auto, T+5 (V1 recording `tower-clearance`) | two frames inside the lattice while the camera blends from the pad-close camera | `director/director.ts` (no clearance) |
| R12 | Station docking and lunar encounter nearly black | V1 recordings `station-docking`, `lunar-encounter` | the vehicle is a silhouette on black | shot lists, lighting |

## Confirmed in the source

| # | Defect | Files |
|---|---|---|
| S1 | Body presence: `evalShot` and `evalFree` check that a state object exists, but states are preallocated; `present === false` was not rejected, secondary bodies were used whether present or not | `director/shots.ts` |
| S2 | Clocks: the stage and players clamped the frame delta at 0.1 s, while camera blends and dissolves ran on wall-clock time (`stageClock.seconds()`): under slow frames a 1.6 s camera move finished while the mission advanced a fraction of that | `scene/Stage.tsx`, `scene/clock.ts`, `timeline/player.ts`, `watch/player.ts` |
| S3 | Narration drift was corrected by re-seeking the audio beyond 120 ms; with frames slower than the clamp, that restarts the voice almost every frame | `watch/player.ts` |
| S4 | Quality adaptation: `perf.push()` received CPU render time (not the frame interval), and a window with fewer than 20 samples was skipped, so a device at a few frames per second was never judged | `scene/quality.ts`, `scene/Stage.tsx` |
| S5 | The low and medium tiers share the shadow map size; low differs from medium mainly in pixel ratio and particle budget | `scene/quality.ts` |
| S6 | Omitted (quiet) intervals are described as a dissolve in the timeline code but played at x5,000 to x10,000 with no dissolve | `timeline/missions/common.ts`, `state/playback.ts` |
| S7 | No handling of a lost WebGL context (the canvas stays blank) | `scene/Stage.tsx` |
| S8 | The hub build passes `VITE_FABONE_HOME`; the rocket read only `VITE_HUB_URL`, so the "Back to FAB / ONE" link would not appear | `config.ts` |

## Hypotheses checked

- **FOV pumping between shots**: V1 lerped the field of view linearly; with large ratios (60° to 8°)
  the apparent size changed unevenly. Now interpolated on log(tan(fov/2)); largest per-frame change
  in real-time playback is under 8 % (test).
- **Heading flips near landing and docking** (travel frame at low horizontal speed): in frame I the
  pad itself moves at ~408 m/s, so the V1 fallback was rarely reached; the flip that did happen was
  boostback (R4). Covered by tests for boostback and landing.
- **Colour-space mismatch of the dissolve snapshot**: the snapshot holds displayed (tone-mapped,
  encoded) values and the overlay writes them back unconverted: no mismatch. Kept.

## V2 results (same harness)

`src/director/director.test.ts` pins each of these down; the values are from the trace report.

| Check | V1 | V2 |
|---|---:|---:|
| Transitions started, Chase held T-5 to T+60 (3,901 frames) | 3,901 | 0 (one initial cut) |
| Largest per-frame turn, Ground mode through T+60 | 59.4° | 0.06° (the pad to tracking camera change is a dissolve) |
| Booster Chase through boostback, largest per-frame turn | 136.6° | < 2° at 60 fps |
| Free camera switched to the booster at T+301: booster off-axis after the switch | 80° | 0° |
| Rapid mode changes: largest turn / roll per frame; largest stack | 136° / 126° / 4 | < 3° / < 1° / 2 |
| Lowest camera altitude (all modes and missions) | -22 km | > 1.5 m |
| Frames with the subject out of frame (Auto, six missions) | 758 to 2,636 per mission | 0 |
| Interrupted dissolve | black frames | continues from the displayed composite (test) |
| Quality monitor at 4 fps | never judged | steps down after two 2 s windows (test) |
| Narration under slow frames | re-seeked almost every frame | 0 re-seeks; the voice waits (test) |

## Found while verifying V2, and fixed

| Defect | How it showed | Fix |
|---|---|---|
| A paused deep link (`focus=booster`), or any mission opened paused, framed the upper stage | e2e: the Follow switch said Booster while the director followed the upper stage; pressing Play then started a transition in a held Chase camera | the storyline sync gave up when the stage had not sampled the bodies yet and only retried on the next playback snapshot; it now waits for the frame that shows the body (`ui/mission/MissionView.tsx`) |
| With the hub link, the header did not fit a phone | FAB / ONE e2e and measurement: 454 px of header at 320 to 430 px wide (Settings off screen); 693 px at 481 px | below 960 px the link is a back button placed first (full label as its name), with the labelled link on the home card, in Settings and on the no-WebGL page; measured to fit from 320 to 1440 px |
| The no-WebGL page had no way back to FAB / ONE | review of the fallback page | the link is on it |
| The home card slid under the header on short screens | 320 x 640 and phone landscape stills | it scrolls inside the room below the header |
| The LEO booster landing passed at x40 (in V1 too: its "booster-landing" clip shows only the upper stage) | proof clip `v2-booster-landing`: from T+477 s the mission clock ran 4 s per 3 frames; touchdown (T+487.6 s) went by in a quarter of a second | LEO plays in real time until the booster storyline ends (touchdown + 15 s), and its coast to apogee runs at x50 instead of x40 to keep the mission under 15 minutes; a test now requires every booster landing to play in real time |
| The "Mission paused" chip covered the part's lesson title and its location inset (960 x 540) | proof clip `v2-inspect-and-return` | above 820 px wide it sits at the foot of the free area, above the toolbar |
| The favicon was linked relative to the page (`./brand/...`) | resolved to `/brand/...` at `/rocket` (no trailing slash) | linked from the base, which Vite rewrites to `/rocket/brand/...` |
