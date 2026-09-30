/**
 * Activity channels (thrusters, engines, plasma) are off until they are switched on: on the pad
 * before ignition, no thruster, upper-stage engine or plasma channel may read as active.
 */
import { describe, expect, it } from 'vitest';
import { buildMission } from './build';
import { chan } from './sample';
import type { ChannelId, MissionId } from './types';

const PAD_MISSIONS: MissionId[] = ['leo', 'suborbital', 'gto', 'station', 'lunar'];

describe('activity channels are zero before they switch on', () => {
  for (const id of PAD_MISSIONS) {
    it(`${id}: nothing fires on the pad at T-10 s except what the countdown lights`, () => {
      const tl = buildMission(id);
      const active = (Object.keys(tl.channels) as ChannelId[])
        .filter((c) => /\.(rcs|plasma)$/.test(c) || c === 's2.throttle' || c === 'sat.apogee.throttle' || c === 'sm.throttle')
        .filter((c) => chan(tl, c, -10) !== 0);
      expect(active).toEqual([]);
    });
  }
});
