#!/bin/bash
# V2 (this checkout) and V1 side by side. Serve V2 on 4173 (npm run build && npx vite preview)
# and V1 on 4175 (git worktree add ../v1 ec43e1f, build it, npx vite preview --outDir <its dist>
# --port 4175), then: OUT=<dir> bash docs/v2/perf/run.sh. SwiftShader unless perf.mjs gets --gpu.
cd "$(dirname "$0")/../../.."
B=http://127.0.0.1:4173
V1=http://127.0.0.1:4175
O=${OUT:-/tmp/perf-v2}
rm -rf $O; mkdir -p $O
run() { name=$1; shift; node scripts/perf.mjs "$@" > $O/$name.json 2>$O/$name.err; echo "$name done $(date +%T)" >> $O/log.txt; }
W="960 540 40 1"
for q in low medium high; do
  run v2-ignition-$q "$B/?v=mission&m=leo&quality=$q" $W --seek=-1 --settle=15
  PERF_COMMIT=ec43e1f run v1-ignition-$q "$V1/?v=mission&m=leo&quality=$q" $W --seek=-1 --settle=15
done
run v2-home-low "$B/?quality=low" $W --settle=15
run v2-home-high "$B/?quality=high" $W --settle=15
run v2-orbit-low "$B/?v=mission&m=leo&quality=low" $W --seek=3330 --settle=15
run v2-orbit-high "$B/?v=mission&m=leo&quality=high" $W --seek=3330 --settle=15
PERF_COMMIT=ec43e1f run v1-orbit-high "$V1/?v=mission&m=leo&quality=high" $W --seek=3330 --settle=15
run v2-phone-ignition-auto "$B/?v=mission&m=leo" 390 844 40 2 --seek=-1 --settle=15
echo ALLDONE >> $O/log.txt
