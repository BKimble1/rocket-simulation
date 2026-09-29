/**
 * Spacecraft builder: the payloads carried by the K-1 and the orbital station.
 *
 *   leoSat, gtoSat, lunarProbe   body 'satellite' (see satellites.ts)
 *   capsule                      bodies 'capsule', 'service', 'les' (crew capsule, service
 *                                module, launch abort tower), stacked from mountY
 *   researchCapsule              body 'capsule' (uncrewed), its rim on the booster's adapter
 *   station                      body 'station', about its own centre (mountY ignored)
 *
 * Geometry is in the vehicle model frame (+Y toward the nose) at stacked positions. The model
 * is posed purely from its visual state, the section amount and the demonstration progress.
 */
import type { SpacecraftKind, SpacecraftModel } from './types';
import type { VehicleDetail } from './detail';
import { Kit } from './kit';
import { assemble, emptyAnchors, type Built, type SCState } from './model';
import { buildGtoSat, buildLeoSat, buildLunarProbe } from './satellites';
import { buildCapsule, SEAT_DROP } from './capsule';
import { buildServiceModule, SM_H } from './service';
import { buildLes } from './les';
import { buildStation } from './station';

export function buildSpacecraft(kind: SpacecraftKind, detail: VehicleDetail, mountY: number): SpacecraftModel {
  const kit = new Kit(detail);
  let built: Built;
  switch (kind) {
    case 'leoSat':
      built = buildLeoSat(kit, mountY);
      break;
    case 'gtoSat':
      built = buildGtoSat(kit, mountY);
      break;
    case 'lunarProbe':
      built = buildLunarProbe(kit, mountY);
      break;
    case 'capsule':
      built = capsuleStack(kit, mountY, true);
      break;
    case 'researchCapsule':
      built = capsuleStack(kit, mountY, false);
      break;
    case 'station':
      built = buildStation(kit);
      break;
  }
  const model = assemble(kind, kit, built);
  for (const g of Object.values(model.bodies)) if (g) g.userData.labels = kit.labels;
  return model;
}

/**
 * Crew stack: service module from mountY, the capsule's heat-shield rim on the service
 * module's adapter ring, the abort tower on the capsule. Research capsule: rim on mountY.
 */
function capsuleStack(kit: Kit, mountY: number, crewed: boolean): Built {
  const ringY = crewed ? mountY + SM_H : mountY;
  const nadir = ringY - SEAT_DROP;
  const cap = buildCapsule(kit, nadir, crewed);
  const anchors = emptyAnchors(cap.topY);
  anchors.capsuleRcs = cap.rcs;
  anchors.dockPort = cap.dock;
  anchors.chuteAttach = cap.chuteAttach;
  if (!crewed) {
    return {
      bodies: { capsule: cap.group },
      anchors,
      pose: (s: SCState) => cap.pose(s),
    };
  }
  const sm = buildServiceModule(kit, mountY);
  const les = buildLes(kit, nadir);
  anchors.smEngine = { exit: sm.engineExit, exitRadius: sm.exitRadius };
  anchors.smRcs = sm.rcs;
  anchors.lesNozzles = les.nozzles;
  anchors.topY = les.topY;
  const smContent = sm.group.children[0];
  return {
    bodies: { capsule: cap.group, service: sm.group, les: les.group },
    anchors,
    pose(s: SCState) {
      cap.pose(s);
      sm.pose(s);
      // companions leave before these states occur in a mission: the service module separates
      // before entry (chutes), the tower is jettisoned before the nose cone opens
      const chutes = s.capDrogue > 0.001 || s.capMain > 0.001;
      smContent.visible = !(s.capsuleOnly || chutes);
      les.content.visible = !(s.capsuleOnly || chutes || s.capNoseCone > 0.001);
    },
  };
}
