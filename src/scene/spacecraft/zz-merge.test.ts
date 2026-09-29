import { it } from 'vitest';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
function stubCanvas() {
  const ctx: Record<string, unknown> = new Proxy({}, { get(t: Record<string, unknown>, k: string) { if (k in t) return t[k]; if (k === 'createImageData' || k === 'getImageData') return (w: number | { width: number; height: number }, h?: number) => { const ww = typeof w === 'number' ? w : w.width; const hh = typeof w === 'number' ? (h as number) : w.height; return { data: new Uint8ClampedArray(ww * hh * 4), width: ww, height: hh }; }; if (k === 'measureText') return () => ({ width: 10 }); if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} }); return () => undefined; }, set(t: Record<string, unknown>, k: string, v: unknown) { t[k] = v; return true; } });
  const g = globalThis as unknown as Record<string, unknown>;
  g.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  g.Path2D = class {};
}
it('merge', async () => {
  stubCanvas();
  const { buildSpacecraft } = await import('./buildSpacecraft');
  const m = buildSpacecraft(((globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env.K ?? 'leoSat') as 'leoSat', 'flight', 53.9);
  const out: string[] = [];
  m.bodies.satellite?.traverse((g) => {
    const b = new Map<string, THREE.Mesh[]>();
    for (const c of g.children) { const me = c as THREE.Mesh; if (!me.isMesh) continue; const k = `${c.userData.part}|${(me.material as THREE.Material).name || (me.material as THREE.Material).type}|${(me.material as THREE.Material).uuid.slice(0,4)}`; if (!b.has(k)) b.set(k, []); b.get(k)!.push(me); }
    for (const [k, l] of b) if (l.length > 1) {
      const sigs = l.map((x) => Object.keys(x.geometry.attributes).sort().join(',') + ' ' + x.castShadow + x.receiveShadow + x.renderOrder + x.visible + ' keep=' + x.userData.keep + ' ch=' + x.children.length + ' idx=' + x.geometry.index?.array.constructor.name + ' ' + Object.values(x.geometry.attributes).map((a) => (a as THREE.BufferAttribute).array.constructor.name[0] + (a as THREE.BufferAttribute).itemSize + ((a as THREE.BufferAttribute).normalized ? 'n' : '') + ((a as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute ? 'I' : '')).join(''));
      const r = mergeGeometries(l.map((x) => x.geometry), false);
      out.push(`${g.name}: ${k} x${l.length} merge=${r ? 'ok' : 'NULL'} :: ${[...new Set(sigs)].join(' || ')}`);
    }
  });
  console.log(out.join('\n'));
});
