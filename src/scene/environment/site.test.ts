import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PAD, LANDING_ZONE } from '../../world/site';
import { siteState, SITE_ANCHORS } from './state';
import { Batch, Instances, box, materialTag, thermalClass } from './geom';
import { TOWER, TU } from './layout';

const named = (name: string) => {
  const m = new THREE.MeshStandardMaterial();
  m.name = name;
  return m;
};

describe('site public state', () => {
  it('starts clamped, arms attached, dry, satellite configuration', () => {
    expect(siteState).toMatchObject({ holddown: 0, arms: 0, deluge: 0, config: 'satellite' });
  });
});

describe('SITE_ANCHORS', () => {
  it('has deluge nozzles under and on the deck and in the trench, with unit spray directions', () => {
    const n = SITE_ANCHORS.delugeNozzles;
    expect(n.length).toBe(32);
    for (const z of n) {
      expect(z.dir.length()).toBeCloseTo(1, 6);
      expect(z.flow).toBeGreaterThan(0);
      expect(Math.hypot(z.pos.x, z.pos.z)).toBeLessThan(40);
    }
    // the rainbirds sit above the deck, the ring below it
    expect(n.filter((z) => z.pos.y > PAD.deckHeight).length).toBe(4);
    expect(n.filter((z) => z.pos.y < PAD.deckHeight && z.pos.y > 0).length).toBe(16);
  });

  it('places the trench exit down the trench direction and the fixed points where the layout has them', () => {
    const e = SITE_ANCHORS.trenchExit;
    const along = e.x * TU.x + e.z * TU.z;
    expect(along).toBeGreaterThan(50);
    expect(Math.abs(e.x * -TU.z + e.z * TU.x)).toBeLessThan(0.5);
    expect(SITE_ANCHORS.trenchDir.length()).toBeCloseTo(1, 6);
    expect(SITE_ANCHORS.mountDeck.y).toBe(PAD.deckHeight);
    expect(SITE_ANCHORS.towerTop.x).toBe(TOWER.x);
    expect(SITE_ANCHORS.towerTop.y).toBeGreaterThan(PAD.tower.height);
    expect(SITE_ANCHORS.lzCentre.x).toBe(LANDING_ZONE.x);
    expect(SITE_ANCHORS.lzCentre.z).toBe(LANDING_ZONE.z);
    // 8.6 km away the slab surface lies below the pad's tangent plane by d^2 / 2R
    const d = Math.hypot(LANDING_ZONE.x, LANDING_ZONE.z);
    expect(SITE_ANCHORS.lzCentre.y).toBeCloseTo((-d * d) / (2 * 6371000), 0);
    expect(SITE_ANCHORS.loxVents.length).toBeGreaterThan(0);
  });
});

describe('ground hardware tags (learning lenses)', () => {
  it('maps site materials to content material ids only where the part is taught with them', () => {
    expect(materialTag('service-tower', named('site.towerSteel'))).toBe('structural-steel');
    expect(materialTag('flame-deflector', named('site.refractory'))).toBe('refractory-concrete');
    expect(materialTag('launch-mount', named('site.hardstand'))).toBe('refractory-concrete');
    expect(materialTag('sound-suppression', named('site.white'))).toBe('structural-steel');
    expect(materialTag('service-tower', named('site.refractory'))).toBeUndefined();
    expect(materialTag(undefined, named('site.towerSteel'))).toBeUndefined();
  });

  it('gives the deflector and trench thermal class 3 and every other part 1', () => {
    expect(thermalClass('flame-deflector')).toBe(3);
    expect(thermalClass('launch-mount')).toBe(1);
    expect(thermalClass(undefined)).toBe(1);
  });

  it('merges batches per material and part and tags each merged mesh', () => {
    const B = new Batch({ cast: true, receive: true, part: 'service-tower' });
    const steel = named('site.towerSteel');
    const refr = named('site.refractory');
    B.add(box(1, 1, 1), steel);
    B.add(box(1, 1, 1), steel, new THREE.Matrix4().makeTranslation(3, 0, 0));
    B.add(box(1, 1, 1), refr, undefined, { part: 'flame-deflector' });
    B.add(box(1, 1, 1), refr, undefined, { part: 'flame-deflector', thermal: 2 });
    const g = new THREE.Group();
    const meshes = B.build(g, 't');
    expect(meshes.length).toBe(3);
    const tower = meshes.find((m) => m.userData.part === 'service-tower')!;
    expect(tower.userData).toMatchObject({ material: 'structural-steel', thermal: 1 });
    const hot = meshes.filter((m) => m.userData.part === 'flame-deflector').map((m) => m.userData.thermal);
    expect(hot.sort()).toEqual([2, 3]);
    for (const m of meshes) if (m.userData.part === 'flame-deflector') expect(m.userData.material).toBe('refractory-concrete');

    const I = new Instances(new THREE.BoxGeometry(1, 1, 1), steel);
    I.member(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 5, 0), 0.3);
    const im = I.build(g, 'members', { part: 'service-tower' })!;
    expect(im.userData).toMatchObject({ part: 'service-tower', material: 'structural-steel', thermal: 1 });
  });
});
