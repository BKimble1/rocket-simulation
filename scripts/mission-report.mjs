/**
 * Mission report printer: builds every mission timeline (or the ones named on the command line)
 * with the same code the app uses and prints build time, key facts, events, phases and the
 * presentation length.
 *
 *   node scripts/mission-report.mjs            all six missions
 *   node scripts/mission-report.mjs leo gto    selected missions
 *   node scripts/mission-report.mjs leo --events --pres --json
 *
 * The TypeScript sources are loaded through Vite's SSR module loader (no extra dependency).
 */
import { createServer } from 'vite';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const ALL = ['leo', 'suborbital', 'gto', 'station', 'return', 'lunar'];
const ids = args.filter((a) => !a.startsWith('--'));
const missions = ids.length ? ids : ALL;

const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
try {
  const { buildMission } = await server.ssrLoadModule('/src/timeline/build.ts');
  const { presDuration } = await server.ssrLoadModule('/src/timeline/sample.ts');
  const json = {};
  for (const id of missions) {
    const t0 = performance.now();
    let tl;
    try {
      tl = buildMission(id);
    } catch (e) {
      console.log(`\n=== ${id}: BUILD FAILED: ${e?.stack ?? e}`);
      continue;
    }
    const ms = performance.now() - t0;
    const pres = presDuration(tl.pres);
    if (flags.has('--json')) {
      json[id] = { buildMs: ms, presMin: pres / 60, facts: tl.facts };
      continue;
    }
    const nSamples = Object.values(tl.bodies).reduce((s, b) => s + b.t.length, 0);
    console.log(`\n=== ${id}  build ${ms.toFixed(0)} ms  span ${tl.start.toFixed(0)}..${tl.end.toFixed(0)} s  presentation ${(pres / 60).toFixed(1)} min  bodies ${Object.keys(tl.bodies).join(',')}  samples ${nSamples}  channels ${Object.keys(tl.channels).length}`);
    const keys = Object.keys(tl.facts);
    const w = Math.max(...keys.map((k) => k.length));
    for (const k of keys) {
      const v = tl.facts[k];
      const s = Math.abs(v) >= 1e5 ? v.toExponential(4) : Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(3);
      console.log(`  ${k.padEnd(w)}  ${s}`);
    }
    if (flags.has('--events')) {
      console.log('  events:');
      for (const e of tl.events) console.log(`    ${e.t.toFixed(1).padStart(10)}  ${e.id.padEnd(20)} ${e.label}`);
      console.log('  phases:');
      for (const p of tl.phases) console.log(`    ${p.start.toFixed(1).padStart(10)} .. ${p.end.toFixed(1).padStart(10)}  ${p.id}`);
      for (const b of tl.branches) {
        console.log(`  branch ${b.id}:`);
        for (const p of b.phases) console.log(`    ${p.start.toFixed(1).padStart(10)} .. ${p.end.toFixed(1).padStart(10)}  ${p.id}`);
      }
    }
    if (flags.has('--pres')) {
      console.log('  presentation map:');
      for (const s of tl.pres) console.log(`    p ${s.p0.toFixed(0).padStart(5)}..${s.p1.toFixed(0).padStart(5)}  m ${s.m0.toFixed(0).padStart(7)}..${s.m1.toFixed(0).padStart(7)}  x${((s.m1 - s.m0) / Math.max(1e-9, s.p1 - s.p0)).toFixed(1)}  ${s.omitted ? '[omitted] ' : ''}${s.note ?? ''}`);
    }
    if (flags.has('--shots')) {
      console.log('  shots:');
      for (const s of tl.shots) console.log(`    ${s.from.toFixed(0).padStart(8)}..${s.to.toFixed(0).padStart(8)}  ${s.kind.padEnd(12)} ${s.subject}${s.also ? ' + ' + s.also : ''}`);
    }
  }
  if (flags.has('--json')) console.log(JSON.stringify(json, null, 1));
} finally {
  await server.close();
}
