#!/usr/bin/env bash
# Records the verification clips against a production preview (npm run build && npm run preview).
#   scripts/record-all.sh [virtual|realtime|all] [baseUrl]      (ONLY=name1,name2 to record a subset)
# Virtual clips render frame by frame on the virtual clock (1/30 s per frame): they show motion
# and continuity at true speed whatever the machine, but say nothing about frame rate.
# Real-time clips are ordinary wall-clock screen recordings of THIS machine, which renders with
# SwiftShader (a CPU rasteriser): they show what a viewer here would see, at its frame rate.
set -euo pipefail
cd "$(dirname "$0")/.."
MODE="${1:-all}"
BASE="${2:-http://127.0.0.1:4173/}"
W=960
H=540

seek() { # mission time, then play at 1x
  printf '[{"eval":"window.__rocketSeekMission(%s); window.__rocketPlayback.player.setRate(1); window.__rocketPlayback.player.play()"},{"advance":10}]' "$1"
}
focus_booster='{"click":"role=radio[name=/Booster/]"}'

if [[ "$MODE" == virtual || "$MODE" == all ]]; then
  v() { [[ -n "${ONLY:-}" && ",$ONLY," != *",$1,"* ]] && return 0; node scripts/record-virtual.mjs "$1" "$2" "$3" "$W" "$H" "$4" || echo "FAILED $1"; }
  v pad-ignition-liftoff "${BASE}?v=mission&m=leo&ui=0" 240 "$(seek -4)"
  v tower-clearance      "${BASE}?v=mission&m=leo&ui=0" 180 "$(seek 5)"
  v staging              "${BASE}?v=mission&m=leo&ui=0" 210 "$(seek 145)"
  v fairing              "${BASE}?v=mission&m=leo&ui=0" 180 "$(seek 222)"
  v orbital-earth        "${BASE}?v=mission&m=leo&ui=0" 150 "$(seek 1500)"
  v booster-landing      "${BASE}?v=mission&m=leo&focus=booster&ui=0" 240 "$(seek 479)"
  v station-docking      "${BASE}?v=mission&m=station&ui=0" 180 "$(seek 30110)"
  v capsule-entry        "${BASE}?v=mission&m=return&ui=0" 180 "$(seek 84840)"
  v lunar-encounter      "${BASE}?v=mission&m=lunar&ui=0" 180 "$(seek 237600)"
  v hangar-exterior      "${BASE}?ui=0" 180 '[]'
  v engine-cutaway       "${BASE}?v=explore&part=turbopump&view=cutaway&ui=0" 180 '[{"advance":60}]'
fi

if [[ "$MODE" == realtime || "$MODE" == all ]]; then
  r() { [[ -n "${ONLY:-}" && ",$ONLY," != *",$1,"* ]] && return 0; node scripts/record-realtime.mjs "$1" "$2" "$3" 1280 720 "$4" || echo "FAILED $1"; }
  r home          "${BASE}" 12 '[]'
  r explore       "${BASE}?v=explore" 16 '[{"click":"role=button[name=\"Find a part\"]"},{"wait":1500},{"click":"role=button[name=/^Turbopump/]"},{"wait":4000},{"click":"role=radio[name=\"Cutaway\"]"}]'
  r mission-leo   "${BASE}?v=mission&m=leo&ch=liftoff" 20 '[{"click":"role=button[name=\"Play mission\"]"}]'
  r watch         "${BASE}?v=watch" 20 '[{"click":"role=button[name=/Overview: Satellite to low Earth orbit/]"}]'
fi
