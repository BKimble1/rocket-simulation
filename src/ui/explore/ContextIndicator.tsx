/**
 * A small side view of the vehicle that marks where the selected part sits (so a close-up of
 * an injector or a display engine never loses its context).
 */
import { PARTS, type PartId } from '../../vehicle/parts';
import { STATIONS } from '../../vehicle/spec';
import { ENGINE_DISPLAY_PARTS, VACUUM_DISPLAY_PARTS } from '../../scene/hangar/hangarState';

/** Axial extent (model y, m) of each part for the diagram. */
const SPAN: Partial<Record<PartId, [number, number]>> = {
  's1-engine-cluster': [0, STATIONS.s1ThrustSectionTop],
  'thrust-structure': [1.3, STATIONS.s1ThrustSectionTop],
  'base-heat-shield': [1.1, 1.6],
  's1-fuel-tank': [STATIONS.s1FuelAftApex, STATIONS.s1FuelFwdApex],
  'lox-downcomer': [STATIONS.s1FuelAftApex, STATIONS.s1LoxAftApex],
  's1-intertank': [STATIONS.s1FuelFwdEquator, STATIONS.s1LoxAftEquator],
  's1-lox-tank': [STATIONS.s1LoxAftApex, STATIONS.s1LoxFwdApex],
  pressurization: [STATIONS.s1LoxAftEquator, STATIONS.s1LoxFwdEquator],
  raceway: [4.3, STATIONS.s1ForwardSkirtTop],
  'grid-fins': [STATIONS.gridFins - 0.8, STATIONS.gridFins + 0.8],
  'cold-gas-rcs': [36.5, 37.9],
  'landing-legs': [1.5, 10.5],
  interstage: [STATIONS.s1ForwardSkirtTop, STATIONS.interstageTop],
  'stage-separation': [STATIONS.interstageTop - 0.6, STATIONS.interstageTop + 0.4],
  'vacuum-engine': [STATIONS.s2NozzleExit, STATIONS.s2AftSkirtTop],
  'nozzle-extension': [STATIONS.s2NozzleExit, 42],
  's2-tanks': [STATIONS.s2FuelAftApex, STATIONS.s2LoxFwdApex],
  'common-bulkhead': [STATIONS.s2CommonBulkheadApex, STATIONS.s2CommonBulkheadEquator],
  avionics: [52.6, STATIONS.s2ForwardSkirtTop],
  's2-rcs': [44.4, 46.2],
  'payload-adapter': [STATIONS.s2ForwardSkirtTop, STATIONS.payloadAdapterTop],
  fairing: [STATIONS.fairingBase, STATIONS.fairingTip],
  'satellite-bus': [54.8, 60.5],
  'solar-arrays': [55.5, 60],
  antenna: [58, 60.5],
  'attitude-thrusters': [55, 60],
  'mli-blankets': [55, 60.5],
  'service-module': [54.4, 57.6],
  capsule: [57.6, 60.9],
  'heat-shield': [57.5, 58.1],
  'backshell-tps': [58, 60.9],
  parachutes: [60, 60.9],
  'docking-system': [60.6, 61.1],
  'launch-abort-system': [60.9, 68.8],
};

export function ContextIndicator({ part, capsule }: { part: PartId; capsule: boolean }) {
  const engine = ENGINE_DISPLAY_PARTS.includes(part);
  const vac = VACUUM_DISPLAY_PARTS.includes(part);
  const span = engine ? [0, 2.6] : vac ? SPAN['vacuum-engine']! : SPAN[part];
  if (!span) return null;
  const H = 70;
  const y = (v: number) => 150 - (v / H) * 140;
  const top = capsule ? 68.8 : STATIONS.fairingTip;
  return (
    <figure className="context" aria-label={`Where the ${PARTS[part].label} is on the vehicle`}>
      <svg viewBox="0 0 60 160" width="44" height="118" aria-hidden>
        {/* body */}
        <path d={`M24 ${y(0.4)} H36 V${y(STATIONS.s2ForwardSkirtTop)} H24 Z`} fill="none" stroke="currentColor" strokeWidth="1.2" />
        <path d={`M24 ${y(STATIONS.s1ForwardSkirtTop)} H36 V${y(STATIONS.interstageTop)} H24 Z`} fill="currentColor" opacity="0.25" />
        {capsule ? (
          <path d={`M24 ${y(54.4)} H36 V${y(57.6)} L35 ${y(57.6)} L32.5 ${y(60.9)} H27.5 L25 ${y(57.6)} H24 Z M29.4 ${y(60.9)} H30.6 V${y(top)} H29.4 Z`} fill="none" stroke="currentColor" strokeWidth="1.2" />
        ) : (
          <path d={`M23.5 ${y(STATIONS.fairingBase)} L22.8 ${y(STATIONS.fairingBoatTailTop)} V${y(STATIONS.fairingCylinderTop)} Q 23 ${y(64.5)} 30 ${y(top)} Q 37 ${y(64.5)} 37.2 ${y(STATIONS.fairingCylinderTop)} V${y(STATIONS.fairingBoatTailTop)} L36.5 ${y(STATIONS.fairingBase)}`} fill="none" stroke="currentColor" strokeWidth="1.2" />
        )}
        <path d={`M25 ${y(0.4)} L23 ${y(0)} M35 ${y(0.4)} L37 ${y(0)} M30 ${y(0.4)} V${y(0)}`} stroke="currentColor" strokeWidth="1.2" />
        <rect x="18" y={y(span[1])} width="24" height={Math.max(2.5, y(span[0]) - y(span[1]))} rx="1.5" fill="var(--accent)" opacity="0.85" />
      </svg>
      <figcaption>{engine ? 'One of the seven E-1 engines at the base (shown on its display stand)' : vac ? 'Upper-stage engine inside the interstage (shown on its display stand)' : 'Location on the vehicle'}</figcaption>
    </figure>
  );
}
