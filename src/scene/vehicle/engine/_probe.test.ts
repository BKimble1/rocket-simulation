import { test } from 'vitest';
import { engineDesign } from './design';
import { routes, TP } from './layout';
test('probe', () => {
  const d = engineDesign('E-1');
  const R = routes(d);
  const f = (a: { x: number; y: number; z: number }[]) => a.map((p) => `(${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)})`).join(' ');
  console.log('lox', f(R.loxDischarge));
  console.log('fuel', f(R.fuelDischarge));
  console.log('fuelTap', f(R.fuelTap));
  console.log('loxTap', f(R.loxTap));
  console.log('exh', f(R.exhaust));
  console.log('rc', d.rc, 'rOut(-0.4)', d.rOut(-0.4), d.rOut(-0.7), 'TP', JSON.stringify(TP));
});
