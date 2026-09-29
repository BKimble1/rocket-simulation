import { it } from 'vitest';
import * as THREE from 'three';
function stubCanvas() {
  const ctx: Record<string, unknown> = new Proxy({}, { get(t: Record<string, unknown>, k: string) { if (k in t) return t[k]; if (k === 'createImageData' || k === 'getImageData') return (w: number | { width: number; height: number }, h?: number) => { const ww = typeof w === 'number' ? w : w.width; const hh = typeof w === 'number' ? (h as number) : w.height; return { data: new Uint8ClampedArray(ww * hh * 4), width: ww, height: hh }; }; if (k === 'measureText') return () => ({ width: 10 }); if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} }); return () => undefined; }, set(t: Record<string, unknown>, k: string, v: unknown) { t[k] = v; return true; } });
  const g = globalThis as unknown as Record<string, unknown>;
  g.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  g.Path2D = class {};
}
it('list', async () => {
  stubCanvas();
  const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
  const { buildSpacecraft } = await import('./buildSpacecraft');
  const m = buildSpacecraft((env.K ?? 'capsule') as 'capsule', (env.D ?? 'flight') as 'flight', 53.9);
  m.setCut(Number(env.CUT ?? 0));
  const out: string[] = [];
  const path = (o: THREE.Object3D) => { const a: string[] = []; let p = o.parent; while (p) { a.push(p.name || p.type[0]); p = p.parent; } return a.reverse().join('/'); };
  for (const g of Object.values(m.bodies)) g?.traverse((o) => { const me = o as THREE.Mesh; if (!me.isMesh) return; let v = true; o.traverseAncestors((a) => (v = v && a.visible)); if (!v || !o.visible) return; const mt = me.material as THREE.Material; out.push(`${path(o)} :: ${o.userData.part}/${o.userData.material} ${mt.name || mt.type} ${mt.uuid.slice(0, 4)} tris ${(me.geometry.index?.count ?? 0) / 3} ${me.castShadow ? '' : 'noshadow'}`); });
  console.log(out.sort().join('\n'));
});
