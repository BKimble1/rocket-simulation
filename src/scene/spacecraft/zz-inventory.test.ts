import { it } from 'vitest';
import * as THREE from 'three';
import type { SpacecraftKind } from './types';
function stubCanvas() {
  const ctx: Record<string, unknown> = new Proxy({}, { get(t: Record<string, unknown>, k: string) { if (k in t) return t[k]; if (k === 'createImageData' || k === 'getImageData') return (w: number | { width: number; height: number }, h?: number) => { const ww = typeof w === 'number' ? w : w.width; const hh = typeof w === 'number' ? (h as number) : w.height; return { data: new Uint8ClampedArray(ww * hh * 4), width: ww, height: hh }; }; if (k === 'measureText') return () => ({ width: 10 }); if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} }); return () => undefined; }, set(t: Record<string, unknown>, k: string, v: unknown) { t[k] = v; return true; } });
  const g = globalThis as unknown as Record<string, unknown>;
  g.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  g.Path2D = class {};
}
it('inventory', async () => {
  stubCanvas();
  const { buildSpacecraft } = await import('./buildSpacecraft');
  const out: string[] = [];
  const count = (m: ReturnType<typeof buildSpacecraft>) => {
    let vis = 0, all = 0, tris = 0, shadow = 0;
    for (const g of Object.values(m.bodies)) { g?.updateMatrixWorld(true); g?.traverse((o) => { const me = o as THREE.Mesh; if (!me.isMesh) return; all++; let v = true; o.traverseAncestors((a) => (v = v && a.visible)); if (!v || !o.visible) return; vis++; if (me.castShadow) shadow++; tris += (me.geometry.index ? me.geometry.index.count : me.geometry.attributes.position.count) / 3; }); }
    const keys = new Set<string>(); const parents = new Map<string, number>();
    for (const g of Object.values(m.bodies)) g?.traverse((o) => { const me = o as THREE.Mesh; if (!me.isMesh) return; let v = true; o.traverseAncestors((a) => (v = v && a.visible)); if (!v || !o.visible) return; keys.add([o.userData.part, (me.material as THREE.Material).uuid].join('|')); const pn = (o.parent?.name || o.parent?.type || '?') + '<' + (o.parent?.parent?.name || o.parent?.parent?.type || ''); parents.set(pn, (parents.get(pn) ?? 0) + 1); });
    const top = [...parents.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${k}:${n}`).join(',');
    return `vis ${vis} (shadow ${shadow}) all ${all} tris ${Math.round(tris / 1000)}k keys ${keys.size} groups ${parents.size} [${top}]`;
  };
  for (const kind of ['leoSat', 'gtoSat', 'lunarProbe', 'capsule', 'researchCapsule', 'station'] as SpacecraftKind[])
    for (const d of ((globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env.D ? [(globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env.D] : ['hangar', 'flight']) as ('hangar'|'flight')[]) {
      const m = buildSpacecraft(kind, d, 53.9);
      let s = `${kind} ${d}: closed ${count(m)}`;
      if ((globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env.CLOSED) { out.push(s); m.dispose(); continue; }
      m.setState({ satArrays: 1, satAntenna: 1, smArrays: 1, capNoseCone: 1 }); s += ` | deployed ${count(m)}`;
      m.setState({ satArrays: 0, satAntenna: 0, smArrays: 0, capNoseCone: 0, capMain: 1 }); s += ` | mains ${count(m)}`;
      m.setState({ capMain: 0 }); m.setCut(1); s += ` | cut ${count(m)}`;
      out.push(s);
      if (kind === 'station') {
        const port = m.anchors.dockPort!; const v = new THREE.Vector3(); const bad = new Map<string, number>();
        m.setCut(0);
        m.bodies.station!.updateMatrixWorld(true);
        m.bodies.station!.traverse((o) => { const me = o as THREE.Mesh; if (!me.isMesh) return; const p = me.geometry.attributes.position; for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); if (v.y < port.pos.y - 0.01 && Math.hypot(v.x - port.pos.x, v.z - port.pos.z) < 3) bad.set(`${o.name}/${o.userData.part}/${o.userData.material} y=${v.y.toFixed(2)}`, (bad.get(o.name) ?? 0) + 1); } });
        out.push('intrusions: ' + [...bad.keys()].slice(0, 20).join('; '));
      }
      m.dispose();
    }
  console.log(out.join('\n'));
});
