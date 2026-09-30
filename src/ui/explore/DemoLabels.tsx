/**
 * Layer labels for demonstrations whose model provides them (the heat-shield section view). The
 * layers are only millimetres thick, so the labels form a spaced column beside them, in layer
 * order, with leader lines fanning back to each layer's anchor on the cut face. Positions are
 * projected from the 3D anchors every frame and written straight to the DOM (like the hotspots).
 * The lesson text carries the same information for screen readers.
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { stageRefs } from '../../scene/Stage';
import { frame } from '../../scene/frame';
import { demoClock } from '../../scene/demos';
import { hangar } from '../../scene/hangar/hangarState';

type Label = { text: string; anchor: THREE.Object3D };
const LABELLED = new Set(['heat-shield-stack']);
const GAP = 30; // px between labels
const OFFSET = 90; // px from the rightmost anchor to the label column

function findLabels(): Label[] {
  let out: Label[] = [];
  hangar.vehicle?.root.traverse((o) => {
    const l = o.userData?.labels as Label[] | undefined;
    if (!out.length && Array.isArray(l) && l.length) out = l;
  });
  return out;
}

export function DemoLabels() {
  const [labels, setLabels] = useState<Label[]>([]);
  const boxes = useRef<(HTMLDivElement | null)[]>([]);
  const lines = useRef<(SVGLineElement | null)[]>([]);

  // follow the running demonstration (a module-level clock, polled lightly)
  useEffect(() => {
    let last: string | null = null;
    const h = window.setInterval(() => {
      const id = demoClock.id && LABELLED.has(demoClock.id) ? demoClock.id : null;
      if (id === last) return;
      last = id;
      setLabels(id ? findLabels() : []);
    }, 250);
    return () => window.clearInterval(h);
  }, []);

  useEffect(() => {
    if (!labels.length) return;
    let raf = 0;
    const p = new THREE.Vector3();
    const ax = new Float32Array(labels.length);
    const ay = new Float32Array(labels.length);
    const order = labels.map((_, i) => i);
    const slot = new Int32Array(labels.length);
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const cam = stageRefs.camera;
      const canvas = stageRefs.canvas;
      let on = !!cam && !!canvas && frame.location === 'hangar';
      let maxX = -Infinity;
      let meanY = 0;
      if (on) {
        labels.forEach((l, i) => {
          l.anchor.getWorldPosition(p).project(cam!);
          if (!(p.z < 1 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1)) on = false;
          ax[i] = ((p.x + 1) / 2) * canvas!.clientWidth;
          ay[i] = ((1 - p.y) / 2) * canvas!.clientHeight;
          maxX = Math.max(maxX, ax[i]);
          meanY += ay[i] / labels.length;
        });
      }
      // slots follow the anchors' order on screen, so leader lines never cross
      for (let i = 0; i < order.length; i++) order[i] = i;
      if (on) order.sort((a, b) => ay[a] - ay[b]);
      for (let k = 0; k < order.length; k++) slot[order[k]] = k;
      labels.forEach((_, i) => {
        const box = boxes.current[i];
        const line = lines.current[i];
        if (!box || !line) return;
        box.style.opacity = on ? '1' : '0';
        line.style.opacity = on ? '0.85' : '0';
        if (!on) return;
        const lx = maxX + OFFSET;
        const ly = meanY + (slot[i] - (labels.length - 1) / 2) * GAP;
        box.style.transform = `translate(${lx}px, ${ly}px) translateY(-50%)`;
        line.setAttribute('x1', String(ax[i]));
        line.setAttribute('y1', String(ay[i]));
        line.setAttribute('x2', String(lx));
        line.setAttribute('y2', String(ly));
      });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [labels]);

  if (!labels.length) return null;
  return (
    <div className="demo-labels" aria-hidden="true">
      <svg className="demo-labels__lines">
        {labels.map((l, i) => (
          <line key={l.text} ref={(el) => void (lines.current[i] = el)} />
        ))}
      </svg>
      {labels.map((l, i) => (
        <div key={l.text} className="demo-labels__box" ref={(el) => void (boxes.current[i] = el)}>
          {l.text}
        </div>
      ))}
    </div>
  );
}
