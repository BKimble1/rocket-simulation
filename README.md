# KIMBLE · Rocket Engineering

An interactive, browser-based 3D learning simulator for launch-vehicle engineering. Open up a
two-stage rocket part by part, see how its systems work and why they are built that way, learn
which materials they need and how they are made, then watch six complete missions unfold, from
the pad to orbit, the Moon, a space station and back to the ocean.

It is an **educational simulator, not a piloting game**: you choose what to study, pause,
inspect, reveal cutaways and compare; nothing you do changes a mission's outcome.

- **Explore the rocket**: the K-1 in a hangar, with intact / cutaway / exploded views, a
  searchable part list, a seven-question lesson for every principal part at three depths
  (Quick explanation, Engineering detail, Materials & manufacturing), a Materials view linked
  both ways to the parts, subsystem demonstrations (tanks draining, feed routes, a slowed
  turbopump, combustion, regenerative cooling, gimbal steering, staging, fairing, recovery
  hardware, spacecraft, parachutes) and overlays for flow, forces, centres of mass and thrust,
  and thermal load.
- **Explore a mission**: satellite to low Earth orbit (with the booster landing as a parallel
  storyline), suborbital research flight, geostationary transfer, station delivery, capsule
  return and a lunar flyby, each a deterministic reference timeline with chapters, a phase card
  (what is happening, why now, which parts, which forces, what comes next), camera modes and
  "show the part" inspection that returns to the same moment.
- **Watch and learn**: narrated films with captions and chapters on the same timeline.
- A recommended learning path, a glossary linked to the scenes, and optional knowledge checks
  with explanations (explored and checked-understanding progress are tracked separately).

The vehicle is a generic, original design with illustrative values chosen to be physically
consistent (see [`ACCURACY.md`](ACCURACY.md)). **KIMBLE** and **ONE / FAB** are this project's
own marks; no agency or company endorses it.

## Run it

Requirements: Node.js 22 (npm 10). A browser with WebGL 2.

```sh
npm install
npm run dev            # http://127.0.0.1:5173
```

Production build and preview:

```sh
npm run build          # type-check + build to dist/ (base path /)
npm run preview        # http://127.0.0.1:4173

npm run build:rocket   # the same app for the /rocket/ path, in dist-rocket/
npm run preview:rocket # http://127.0.0.1:4173/rocket/
```

The base path can also be set with `ROCKET_BASE=/some/path/ npm run build`. A hub link
("Back to FAB / ONE") appears in the header when `VITE_HUB_URL` (and optionally
`VITE_HUB_LABEL`) is set at build time.

Package a static build as a ZIP for later upload (does not deploy anything):

```sh
npm run package            # release/kimble-rocket-<commit>.zip (base /)
npm run package -- rocket  # release/kimble-rocket-rocket-<commit>.zip (base /rocket/)
```

## Test

```sh
npm test                   # unit and model tests (Vitest): physics, missions, content integrity
npx playwright test        # end-to-end against the production build (run npm run build first)
npm run build:rocket && npm run e2e:rocket   # the same tests under /rocket/
```

Capture and measurement tools (Chromium; in this repository's build environment Chromium ran
with SwiftShader, a CPU rasteriser, so their frame rates are not GPU measurements):

```sh
node scripts/shot.mjs "<url>" out.png 1440 900 9000          # screenshot
node scripts/perf.mjs "<url>" 1440 900 10 1                    # frame times, draw calls, transfer
node scripts/record-realtime.mjs <name> "<url>" 12             # wall-clock video → docs/recordings/realtime/
node scripts/record-virtual.mjs <name> "<url>" 300             # frame-by-frame (virtual time) video
```

Useful URL parameters: `?quality=high|medium|low`, `?diag=1` (frame times, draw calls),
deep links such as `?v=explore&part=turbopump&view=cutaway`, `?v=mission&m=leo&ch=staging`,
`?v=explore&lens=materials&mat=grcop`, `?v=watch&m=lunar`, and for captures `?ui=0` (no
interface) or `?ui=brand` (only the KIMBLE identity).

Batch tools (run against `npm run build && npm run preview`):

```sh
scripts/record-all.sh virtual        # continuity clips on the virtual clock → docs/recordings/virtual
scripts/record-all.sh realtime       # wall-clock clips of this machine → docs/recordings/realtime
node scripts/hub-card.mjs            # public/og/poster.jpg and public/og/preview.mp4 (muted loop)
node scripts/accuracy-facts.mjs      # regenerate the computed-facts tables in ACCURACY.md
node scripts/mission-report.mjs      # every mission fact (add --about for units and meanings)
```

## Hub card

`public/og/poster.jpg` (1200 × 630) and `public/og/preview.mp4` (960 × 540, 8 s, no audio,
loops; `preview.jpg` is its first frame) are rendered from the app itself with only the
identity shown. They are served with the app, so a hub card can reference them relative to
the app's base path (for example `/rocket/og/poster.jpg`).

## Narration (optional, offline)

The narration audio in `public/narration/` is generated offline from
`src/content/narration.json` with the Kokoro-82M text-to-speech model; no service or key is
needed to use the app. To rebuild it: `tools/narration/setup.sh` once, then
`tools/narration/build.sh` (see `tools/narration/README.md`). Captions carry every word.

## Documents

- [`IMPLEMENTATION.md`](IMPLEMENTATION.md): architecture and the reasons for it
- [`ACCURACY.md`](ACCURACY.md): the reference vehicle and missions, what is modelled, what is
  illustrative, and the sources
- [`ASSET_LICENSES.md`](ASSET_LICENSES.md): provenance and licences of every asset
- [`docs/VALIDATION.md`](docs/VALIDATION.md): what was tested and measured, what is approximated,
  what is blocked
- [`docs/BUILD_GUIDE.md`](docs/BUILD_GUIDE.md): conventions for adding a module
