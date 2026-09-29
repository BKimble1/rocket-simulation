/**
 * Writes the "Computed facts per mission" tables in ACCURACY.md (between the FACTS markers) from
 * the same timeline builders the app uses, with each fact's unit and meaning from
 * src/timeline/missions/facts.ts.
 *
 *   node scripts/accuracy-facts.mjs          rewrite ACCURACY.md
 *   node scripts/accuracy-facts.mjs --print  print the tables only
 */
import { createServer } from 'vite';
import { readFileSync, writeFileSync } from 'node:fs';

const KEYS = {
  leo: ['liftoffMass', 'liftoffTW', 'maxQ.t', 'maxQ.kPa', 'maxQ.altKm', 'meco.t', 'meco.altKm', 'meco.speed', 'meco.s1PropLeft', 'stageSep.t', 'fairingSep.t', 'seco.t', 'insertion.periKm', 'insertion.apoKm', 'circ.dv', 'orbit.periKm', 'orbit.apoKm', 'orbit.incDeg', 'orbit.periodMin', 'rtls.boostbackDv', 'rtls.entryDv', 'rtls.landingDv', 'rtls.landingErrorM', 'rtls.touchdownSpeed', 'rtls.propLeftKg'],
  suborbital: ['s1LoadKg', 'liftoffMass', 'meco.t', 'meco.altKm', 'meco.speed', 'capsuleSep.t', 'apogee.km', 'karman.freeFallS', 'entry.peakG', 'entry.peakHeating.kWm2', 'drogue.t', 'main.t', 'splash.speed', 'rtls.landingErrorM', 'rtls.touchdownSpeed', 'rtls.propLeftKg'],
  gto: ['liftoffMass', 'meco.t', 'meco.s1PropLeft', 'boosterImpact.downrangeKm', 'parking.periKm', 'parking.apoKm', 'seco1.t', 'ses2.t', 'injection.burnS', 'gto.periKm', 'gto.apoKm', 'apogee.climbH', 'apogeeBurn.count', 'apogeeBurn.burn1Min', 'apogeeBurn.burn2Min', 'apogeeBurn.burn3Min', 'apogeeBurn.spanH', 'apogeeBurn.dvIdeal', 'apogeeBurn.dv', 'apogeeBurn.propLeftKg', 'final.periKm', 'final.apoKm', 'final.incDeg', 'final.periodH'],
  station: ['crew.capsuleKg', 'crew.serviceModuleKg', 'crew.abortTowerKg', 'liftoffMass', 'liftoffTW', 'maxQ.kPa', 'meco.t', 'boosterImpact.downrangeKm', 'les.t', 'seco.t', 'insertion.periKm', 'insertion.apoKm', 'phasing.revs', 'phasingBurn1.dv', 'phasingBurn2.dv', 'raise.periKm', 'raise.apoKm', 'docking.closingSpeed', 'docking.hoursAfterLaunch', 'sm.propLeftKg', 'station.altKm'],
  return: ['capsuleKg', 'serviceModuleKg', 'undock.smPropKg', 'deorbit.dv', 'deorbit.burnS', 'deorbit.perigeeKm', 'smSep.dvLeft', 'entry.peakHeating.altKm', 'entry.peakHeating.kWm2', 'entry.peakHeating.speed', 'entry.peakG', 'entry.peakG.altKm', 'entry.blackoutS', 'drogue.t', 'main.t', 'splash.speed', 'splash.eastOfPadKm'],
  lunar: ['liftoffMass', 'parking.periKm', 'parking.apoKm', 'tli.t', 'tli.burnS', 'tli.speed', 'tli.c3km2s2', 'cruise.days', 'closestApproach.altKm', 'closestApproach.angleFromEarthDeg', 'closestApproach.speedRelMoon', 'soiExit.speed', 'soiExit.escapeSpeed', 'outbound.vInf', 'outbound.ecc'],
};

const TITLES = { leo: 'Satellite to low Earth orbit', suborbital: 'Suborbital research flight', gto: 'Geostationary transfer', station: 'Station delivery', return: 'Capsule return', lunar: 'Lunar flyby' };

function fmt(v) {
  const a = Math.abs(v);
  const d = a >= 1000 ? 0 : a >= 100 ? 1 : a >= 10 ? 2 : a >= 1 ? 3 : 4;
  return v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: d });
}

const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
let md = '';
try {
  const { buildMission } = await server.ssrLoadModule('/src/timeline/build.ts');
  const { FACTS } = await server.ssrLoadModule('/src/timeline/missions/facts.ts');
  for (const [id, keys] of Object.entries(KEYS)) {
    const tl = buildMission(id);
    md += `### ${TITLES[id]}\n\n| Fact | Value | Unit | Meaning |\n|---|---:|---|---|\n`;
    for (const k of keys) {
      const v = tl.facts[k];
      if (typeof v !== 'number') throw new Error(`${id}: fact ${k} missing`);
      const doc = FACTS[k];
      md += `| \`${k}\` | ${fmt(v)} | ${doc?.unit ?? ''} | ${(doc?.about ?? '').replace(/\|/g, '/')} |\n`;
    }
    md += '\n';
  }
} finally {
  await server.close();
}
if (process.argv.includes('--print')) {
  console.log(md);
} else {
  const path = 'ACCURACY.md';
  const s = readFileSync(path, 'utf8');
  const a = s.indexOf('<!-- FACTS:BEGIN -->');
  const b = s.indexOf('<!-- FACTS:END -->');
  if (a < 0 || b < a) throw new Error('FACTS markers not found in ACCURACY.md');
  writeFileSync(path, s.slice(0, a) + '<!-- FACTS:BEGIN -->\n' + md.trimEnd() + '\n' + s.slice(b));
  console.log('ACCURACY.md facts updated');
}
