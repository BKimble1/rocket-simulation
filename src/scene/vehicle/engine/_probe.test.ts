import { test } from 'vitest';
import * as THREE from 'three';
import { engineDesign } from './design';
import { buildShadowShells } from './shadow';
test('probe', () => {
  const d = engineDesign('E-1V');
  const s = buildShadowShells(d);
  for (const g of [s.back, s.front]) { g.computeBoundingBox(); console.log(JSON.stringify(g.boundingBox), g.attributes.position.count, g.index?.count); }
  console.log('yRegen', d.y(d.xRegenEnd), 'exitY', d.exitY, d.rIn(d.exitY + 0.1), d.rIn(-3));
});
