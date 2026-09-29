/** Separation-system lessons: stage separation and the payload adapter with its clamp band. */
import type { PartLesson, PartNote } from '../types';
import { at, lesson, mats } from './util';
import { F } from './derived';

export const SEPARATION: (PartLesson | PartNote)[] = [
  lesson({
    id: 'stage-separation',
    summary: 'The stage separation system holds the upper stage firmly on the booster through the climb, then releases it and pushes the two apart with pneumatic pushers instead of explosives.',
    where: `At the separation plane on top of the interstage (${F.st.interstageTop}). Look for the ring of release collets (mechanical latches) joining the interstage to the upper stage's aft skirt, and the pneumatic pusher rods around the rim.`,
    connections: ['interstage', 'vacuum-engine', 's2-tanks', 'avionics', 'cold-gas-rcs', 'pressurization'],
    function: 'Carry all loads across the joint during ascent, release on command after booster cutoff, and give the stages a clean relative velocity without tumbling either one.',
    how: 'Each collet is a ring of fingers gripping a fitting, held closed by a sleeve. At separation, gas pressure drives the sleeves back and the fingers spring open, all at once. The pushers then extend, pushing the upper stage away at a relative speed of the order of 1 m/s (illustrative; the timeline sets the value). Because the stage is coasting, the upper stage slides straight out of the interstage.',
    why: `Staging throws away the booster's empty structure (${F.s1Dry}) so the upper stage does not have to accelerate it. Separation waits a few seconds after cutoff so the engines' thrust has fully decayed; otherwise the booster could run into the upper stage. The E-1V then waits until its nozzle, which reaches ${F.nozzleInsideInterstage} down into the interstage, is clear.`,
    phases: [
      at('leo', 'staging', 'Collets release and pushers separate the stages.'),
      at('gto', 'staging', 'The same sequence on the transfer mission.'),
      at('station', 'staging', 'Separation with the crew capsule on top.'),
      at('suborbital', 'capsule-sep', 'A joint of the same kind releases the research capsule from its adapter.'),
    ],
    environment: 'Compression and bending through the joint during ascent, a sudden unloading at booster cutoff that makes the structure spring back, near vacuum at separation, and the need for every latch to release within milliseconds of the others.',
    figures: [
      { label: 'Separation plane', value: F.st.interstageTop, note: 'Height above the first-stage nozzle exits' },
      { label: 'Nozzle length to clear', value: F.nozzleInsideInterstage },
      { label: 'Ideal velocity lost if the booster were never dropped', value: F.leoS2CarryingBoosterLoss, note: `Upper stage carrying the booster's ${F.s1Dry} dry mass, LEO mission, computed` },
    ],
    materials: mats('stage-separation'),
    materialsWhy: 'Collets and pusher housings are aluminium 2219, machined and light, matching the adjoining structure so they expand and shrink together. Pusher rods are stainless steel: hard, smooth and strong where they slide and take impact.',
    manufacturing: 'Machined collet fingers and sleeves, precision pusher cylinders, assembled and tested for release force and timing. Pneumatic separation can be fired and reset many times, so the actual flight hardware can be tested before flight.',
    inspection: 'Release-timing and force tests, leak tests of the pneumatic system, and inspection of fingers and rods for wear and cracks between flights.',
    misconception: '"Stages are always blown apart with explosives." Many documented vehicles use pyrotechnic bolts or cutting cords; this one uses gas-driven pushers and mechanical latches, which can be tested before flight and reused. Either way, the push is gentle: about walking pace.',
    ifAbsent: `Carrying the empty booster to orbit would cost the upper stage about ${F.leoS2CarryingBoosterLoss} of ideal velocity change on the LEO mission: the rocket could not reach orbit.`,
    depth: {
      quick: 'Latches let go and air-driven rods push the stages apart, gently, a few seconds after the booster\'s engines stop.',
      engineering: `The rocket equation rewards dropping mass: with the booster's dry mass gone, the upper stage's mass ratio rises and its ideal Δv reaches ${F.leoS2} on the LEO mission. At a relative speed of about 1 m/s, clearing ${F.nozzleInsideInterstage} of nozzle takes several seconds, which sets the ignition delay.`,
      materials: 'Aluminium for light fittings, stainless steel for sliding, impact-loaded rods. The real design driver is reliability: all latches must release together.',
    },
    demo: 'staging-sequence',
    closeup: 'separation-joint',
    sources: ['nasa-grc-rocket-eq', 'nasa-bsf-14', 'sutton-rpe'],
  }),

  lesson({
    id: 'payload-adapter',
    summary: 'The payload adapter is the cone that carries the payload on top of the upper stage, with a clamp band that releases it in orbit and springs that push it gently away.',
    where: `On the upper stage's forward end: a ${F.adapterHeight} tall cone from the payload interface at ${F.st.s2ForwardSkirtTop}, narrowing from the stage diameter to a standard-size ring (1,575 mm in this model) at ${F.st.payloadAdapterTop}. The clamp band is the V-shaped band around the joint ring at its top.`,
    connections: ['s2-tanks', 'avionics', 'satellite-bus', 'fairing', 'capsule', 'service-module'],
    function: 'Carry the payload\'s launch loads into the stage, provide the electrical connections, then release the payload on command and push it away without spinning it.',
    how: 'Two machined rings (one on the adapter, one on the payload) are held together by a tensioned band whose V-section shoes clamp their flanges all the way round. At separation a release device cuts or opens the band\'s bolt; the band springs outward into catchers. Compressed springs around the ring then push the payload away at a few tenths of a metre per second.',
    why: 'A continuous clamp spreads the load evenly around the ring (no point loads into the payload structure) and releases the whole circumference at once with low shock, which matters for sensitive instruments.',
    phases: [
      at('leo', 'deploy', 'Clamp band releases; springs push the satellite away.'),
      at('gto', 'deploy', 'Releases the geostationary satellite on its transfer orbit.'),
      at('lunar', 'probe-sep', 'Releases the probe after trans-lunar injection.'),
      at('station', 'capsule-sep', 'Releases the capsule and service module.'),
    ],
    environment: 'Launch loads of several g along the axis plus lateral vibration, the payload\'s full mass bearing on one ring, and at separation a short shock that must stay below what the payload can take.',
    figures: [
      { label: 'Adapter height', value: F.adapterHeight, note: 'Payload interface to the separation ring' },
      { label: 'Separation ring diameter', value: '1,575 mm', note: 'A common standard size, used in this model' },
      { label: 'Payload masses carried', value: `${F.leoSatMass} (LEO), ${F.gtoSatMass} (GTO), ${F.lunarProbeMass} (lunar)` },
    ],
    materials: mats('payload-adapter'),
    materialsWhy: 'The cone is carbon-fibre sandwich: stiff and light, which keeps the payload\'s wobble on the stage at a frequency that stays clear of the rocket\'s own vibrations. The clamp-band rings are aluminium 2219, machined precisely so the band grips evenly.',
    manufacturing: 'Composite cone laid up and cured, precision rings machined and bonded or bolted on; the clamp band is assembled with calibrated tension, measured with strain gauges.',
    inspection: 'Ultrasonic scans of the composite, measurement of band tension, and separation tests with a dummy mass to verify speed, direction and tip-off rate.',
    misconception: '"The satellite is shot away from the rocket." The springs push it off at a few tenths of a metre per second, slower than walking; afterward the stage moves itself further away.',
    ifAbsent: 'Without a proper adapter the payload\'s loads would reach the stage through a few points; without a clean release the payload could be damaged or collide with the stage.',
    depth: {
      quick: 'The payload sits on a cone held by a metal band. In orbit the band opens and springs push the payload gently away.',
      engineering: 'Separation speed and tip-off rate (unwanted rotation) are set by spring force, the payload\'s centre-of-mass offset and the simultaneity of release. Momentum is conserved: the stage recoils too, in proportion to the mass ratio.',
      materials: 'Composite for stiffness per kilogram, aluminium where precise, repeatable clamping surfaces are needed.',
    },
    closeup: 'separation-joint',
    sources: ['nasa-bsf-14', 'nasa-sst-soa'],
  }),
];
