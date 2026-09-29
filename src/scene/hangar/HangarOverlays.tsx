/**
 * Optional teaching overlays in the hangar (clearly schematic): forces (thrust, weight, drag)
 * with their lines of action, the centre of mass and centre of thrust, and a thermal-load view.
 */
import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { useApp } from '../../state/store';
import { hangar } from './hangarState';
import { S1, S2, STATIONS } from '../../vehicle/spec';

function arrow(color: string, len: number, head = 2.2, radius = 0.22): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.92 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len - head, 16), mat);
  shaft.position.y = (len - head) / 2;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(radius * 3, head, 20), mat);
  tip.position.y = len - head / 2;
  g.add(shaft, tip);
  g.renderOrder = 999;
  g.traverse((o) => (o.renderOrder = 999));
  return g;
}

function marker(color: string): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.95 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.14, 8, 48), mat);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.45, 20, 12), mat);
  g.add(ring, dot);
  g.traverse((o) => (o.renderOrder = 1000));
  return g;
}

/** Centre of mass of the fuelled stack on the pad (model y), from the dataset. */
export function stackCom(): number {
  // stage dry masses at their middles; propellant at tank centroids (illustrative estimate)
  const s1Dry = S1.dry * ((STATIONS.s1FuelAftApex + STATIONS.interstageTop) / 2) * 0.6; // engines pull the dry mass aft
  const s1Rp = S1.rp1 * ((STATIONS.s1FuelAftEquator + STATIONS.s1FuelFwdEquator) / 2);
  const s1Lox = S1.lox * ((STATIONS.s1LoxAftEquator + STATIONS.s1LoxFwdEquator) / 2);
  const s2 = (S2.dry + S2.propellant) * ((STATIONS.interstageTop + STATIONS.s2ForwardSkirtTop) / 2);
  const pay = 8000 * 58;
  const m = S1.dry + S1.propellant + S2.dry + S2.propellant + 8000;
  return (s1Dry + s1Rp + s1Lox + s2 + pay) / m;
}

export function HangarOverlays() {
  const ov = useApp((s) => s.overlays);
  const objs = useMemo(() => {
    const thrust = arrow('#e0662f', 26);
    const weight = arrow('#2f7fe0', 20);
    weight.rotation.z = Math.PI;
    const drag = arrow('#7a8190', 9);
    drag.rotation.z = Math.PI;
    const com = marker('#2f7fe0');
    const cot = marker('#e0662f');
    return { thrust, weight, drag, com, cot };
  }, []);
  useFrame(() => {
    const y0 = hangar.vehicleY;
    const comY = y0 + stackCom();
    objs.thrust.visible = ov.forces;
    objs.weight.visible = ov.forces;
    objs.drag.visible = ov.forces;
    objs.com.visible = ov.mass;
    objs.cot.visible = ov.mass;
    // thrust acts along the axis at the gimbal plane; weight at the centre of mass; drag at the nose
    objs.thrust.position.set(0, y0 + STATIONS.s1Gimbal, 0);
    objs.weight.position.set(0, comY, 0);
    objs.drag.position.set(0, y0 + STATIONS.fairingTip + 9.5, 0);
    objs.com.position.set(0, comY, 0);
    objs.cot.position.set(0, y0 + STATIONS.s1Gimbal, 0);
    for (const m of [objs.com, objs.cot]) m.rotation.x = Math.PI / 2;
  });
  return (
    <>
      <primitive object={objs.thrust} />
      <primitive object={objs.weight} />
      <primitive object={objs.drag} />
      <primitive object={objs.com} />
      <primitive object={objs.cot} />
    </>
  );
}
