import { describe, expect, it } from 'vitest';
import { classifyThermal, THERMAL_LENS, THERMAL_COLORS } from './thermal';
import { STATIONS as S } from '../../vehicle/spec';

const lvl = (part: string, section: string, mat: Parameters<typeof classifyThermal>[1] = null, look = '', kind = 'solid', fluid?: string) =>
  classifyThermal(part, mat, section, look, kind, fluid).level;

describe('thermal lens', () => {
  it('has five classes, coldest first, with the agreed colours', () => {
    expect(THERMAL_LENS.map((c) => c.level)).toEqual([0, 1, 2, 3, 4]);
    expect(THERMAL_COLORS[0]).toBe('#4f8fe0');
    expect(THERMAL_COLORS[2]).toBe('#e0b44a');
    expect(THERMAL_COLORS[3]).toBe('#e0662f');
    expect(THERMAL_COLORS[4]).toBe('#c33d2c');
    for (const c of THERMAL_LENS) expect(c.detail).not.toMatch(/\u2014/);
  });

  it('classifies the cryogenic hardware', () => {
    expect(lvl('s1-lox-tank', 'lox')).toBe(0);
    expect(lvl('lox-downcomer', 'rp1')).toBe(0);
    expect(lvl('pressurization', 'lox', 'cfrp-copv')).toBe(0);
    expect(lvl('s1-lox-tank', 'lox', null, '', 'liquid', 'lox')).toBe(0);
  });

  it('classifies ambient, warm, hot and very hot hardware', () => {
    expect(lvl('s1-fuel-tank', 'rp1')).toBe(1);
    expect(lvl('s1-intertank', 'intertank')).toBe(1);
    expect(lvl('booster-avionics', 'fwdskirt')).toBe(1);
    expect(lvl('s1-lox-tank', 'fwdskirt')).toBe(2); // the forward skirt shares the tank's id
    expect(lvl('interstage', 'interstage')).toBe(2);
    expect(lvl('grid-fins', 'fwdskirt')).toBe(2);
    expect(lvl('fairing', 'fairingA')).toBe(2);
    expect(lvl('thrust-structure', 'thrust')).toBe(3);
    expect(lvl('base-heat-shield', 'heatshield')).toBe(3);
    expect(lvl('nozzle', 'engines', 'nickel-superalloy')).toBe(3);
    expect(lvl('turbopump', 'engines', 'nickel-superalloy')).toBe(3);
    expect(lvl('turbopump', 'engines', 'al-2219')).toBe(1);
    expect(lvl('combustion-chamber', 's2engine')).toBe(4);
    expect(lvl('gas-generator', 's2engine')).toBe(4);
    expect(lvl('nozzle-extension', 's2engine', 'niobium-c103')).toBe(4);
    expect(lvl('heat-shield', 'payload:capsule', 'ablator')).toBe(4);
  });

  it('splits the upper-stage tank barrel at the common bulkhead (LOX above, RP-1 below)', () => {
    const t = classifyThermal('s2-tanks', 'al-li', 's2tanks', 'paintSeam', 'solid');
    expect(t.level).toBe(0);
    expect(t.split).toEqual({ y: S.s2CommonBulkheadEquator, below: 1 });
  });
});
