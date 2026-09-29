import { describe, expect, it } from 'vitest';
import { spaceAssets, spaceTextures, spaceTexturesSettled } from './assets';

describe('space textures', () => {
  it('settle without throwing when images cannot load, keeping plain-colour placeholders', async () => {
    // no DOM image loading here: every load fails, which must never reject or throw
    await expect(spaceTexturesSettled(1, 2000)).resolves.toBeUndefined();
    expect(spaceAssets.loaded).toBe(spaceAssets.total);
    expect(spaceAssets.ready).toBe(true);
    for (const t of Object.values(spaceTextures)) expect(t).toBeTruthy();
  });
});
