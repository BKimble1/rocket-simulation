#!/usr/bin/env bash
# Documentation screenshots from the production preview (npm run build && npm run preview),
# rendered on the virtual clock (scripts/still.mjs) and stored as JPEG in docs/screenshots/.
#   scripts/screenshots.sh [baseUrl]      (ONLY=name1,name2 for a subset)
set -euo pipefail
cd "$(dirname "$0")/.."
BASE="${1:-http://127.0.0.1:4173/}"
OUT=docs/screenshots
TMP=$(mktemp -d)
mkdir -p "$OUT"

# name  url  width height frames [setup-js]
shot() {
  [[ -n "${ONLY:-}" && ",$ONLY," != *",$1,"* ]] && return 0
  if node scripts/still.mjs "$2" "$TMP/$1.png" "$3" "$4" "$5" "${6:-}" | head -1 && [[ -f "$TMP/$1.png" ]]; then
    python3 -c "from PIL import Image; Image.open('$TMP/$1.png').convert('RGB').save('$OUT/$1.jpg', quality=84, optimize=True)"
    echo "$OUT/$1.jpg"
  else
    echo "FAILED $1"
  fi
}
seek() { echo "window.__rocketSeekMission($1)"; }
click() { echo "[...document.querySelectorAll('button')].find(b=>b.textContent.includes('$1'))?.click()"; }

shot desktop-home                "${BASE}"                                                         1440 900 90
shot desktop-explore-turbopump   "${BASE}?v=explore&part=turbopump&view=cutaway"                  1440 900 120
shot desktop-explore-materials   "${BASE}?v=explore&lens=materials&mat=al-li"                      1440 900 90
shot desktop-explore-heat-shield "${BASE}?v=explore&cfg=capsule&part=heat-shield"                  1440 900 200 "$(click 'Heat-shield layers')"
shot desktop-mission-liftoff     "${BASE}?v=mission&m=leo&hooks=1"                                 1440 900 40 "$(seek 17)"
shot desktop-mission-staging     "${BASE}?v=mission&m=leo&hooks=1"                                 1440 900 40 "$(seek 152)"
shot desktop-mission-orbit       "${BASE}?v=mission&m=leo&hooks=1"                                 1440 900 40 "$(seek 1500)"
shot desktop-mission-landing     "${BASE}?v=mission&m=leo&focus=booster&hooks=1"                   1440 900 40 "$(seek 484)"
shot desktop-mission-docking     "${BASE}?v=mission&m=station&hooks=1"                             1440 900 40 "$(seek 30080)"
shot desktop-mission-entry       "${BASE}?v=mission&m=return&hooks=1"                              1440 900 40 "$(seek 84870)"
shot desktop-mission-lunar       "${BASE}?v=mission&m=lunar&hooks=1"                               1440 900 40 "$(seek 237600)"
shot desktop-map                 "${BASE}?v=mission&m=gto&cam=map&hooks=1"                         1440 900 40 "$(seek 15000)"
shot phone-home                  "${BASE}"                                                         390 844 90
shot phone-explore-lesson        "${BASE}?v=explore&part=injector&view=cutaway"                    390 844 120
shot phone-mission               "${BASE}?v=mission&m=leo&ch=maxq&hooks=1"                         390 844 40
shot phone-landscape-mission     "${BASE}?v=mission&m=leo&ch=staging&hooks=1"                      844 390 40
rm -rf "$TMP"
