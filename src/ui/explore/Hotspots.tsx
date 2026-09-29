/**
 * Touch-friendly hotspots for the main assemblies, projected from the 3D model every frame
 * (positions written straight to the DOM, not through React). The list in the part finder is
 * the accessible alternative; these are a convenience.
 */
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { PARTS, type PartId } from '../../vehicle/parts';
import { useApp } from '../../state/store';
import { stageRefs } from '../../scene/Stage';
import { hangarPartBox } from '../../scene/hangar/hangarState';
import { frame } from '../../scene/frame';

const SAT: PartId[] = ['s1-engine-cluster', 's1-fuel-tank', 's1-lox-tank', 's1-intertank', 'landing-legs', 'grid-fins', 'interstage', 's2-tanks', 'avionics', 'fairing', 'engine', 'vacuum-engine'];
const CAP: PartId[] = ['s1-engine-cluster', 's1-fuel-tank', 's1-lox-tank', 's1-intertank', 'landing-legs', 'grid-fins', 'interstage', 's2-tanks', 'service-module', 'capsule', 'launch-abort-system', 'engine', 'vacuum-engine'];

export function Hotspots() {
  const cfg = useApp((s) => s.hangarConfig);
  const part = useApp((s) => s.part);
  const select = useApp((s) => s.selectPart);
  const ids = cfg === 'capsule' ? CAP : SAT;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    let raf = 0;
    const box = new THREE.Box3();
    const c = new THREE.Vector3();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const cam = stageRefs.camera;
      const canvas = stageRefs.canvas;
      if (!cam || !canvas || frame.location !== 'hangar') {
        refs.current.forEach((el) => el && (el.style.opacity = '0'));
        return;
      }
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ids.forEach((id, i) => {
        const el = refs.current[i];
        if (!el) return;
        const b = hangarPartBox(id, box);
        if (!b || b.isEmpty()) {
          el.style.opacity = '0';
          return;
        }
        b.getCenter(c);
        // tall parts: anchor on the near surface, a little right of the axis
        c.project(cam);
        const vis = c.z < 1 && c.x > -1.05 && c.x < 1.05 && c.y > -1.05 && c.y < 1.05;
        el.style.opacity = vis ? '1' : '0';
        el.style.pointerEvents = vis ? 'auto' : 'none';
        el.style.transform = `translate(${((c.x + 1) / 2) * w}px, ${((1 - c.y) / 2) * h}px)`;
      });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ids]);
  if (part) return null;
  return (
    <div className="hotspots" aria-hidden="true">
      {ids.map((id, i) => (
        <button key={id} ref={(el) => void (refs.current[i] = el)} className="hotspot" tabIndex={-1} onClick={() => select(id)}>
          <span className="hotspot__dot" />
          <span className="hotspot__label">{PARTS[id].label}</span>
        </button>
      ))}
    </div>
  );
}
