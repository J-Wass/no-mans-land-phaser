import { describe, it, expect } from '@jest/globals';
import {
  weaponTierDamageBonus,
  fireManaDamageFactor,
  earthManaHPFactor,
  waterManaRegenBonus,
  mineralGoldBonus,
  airManaVisionBonus,
  shadowManaVisionReduction,
  lightningManaSpeedBonus,
} from './ResourceBonuses';
import { TerritoryResourceType } from './TerritoryResourceType';

const T = TerritoryResourceType;

describe('weaponTierDamageBonus', () => {
  it('returns 0 with no deposits', () => {
    expect(weaponTierDamageBonus(new Set())).toBe(0);
  });

  it('returns 2 for copper', () => {
    expect(weaponTierDamageBonus(new Set([T.COPPER]))).toBe(2);
  });

  it('returns 4 for iron', () => {
    expect(weaponTierDamageBonus(new Set([T.IRON]))).toBe(4);
  });

  it('returns 6 for fire glass', () => {
    expect(weaponTierDamageBonus(new Set([T.FIRE_GLASS]))).toBe(6);
  });

  it('returns the highest tier when multiple weapon deposits are active', () => {
    expect(weaponTierDamageBonus(new Set([T.COPPER, T.IRON, T.FIRE_GLASS]))).toBe(6);
    expect(weaponTierDamageBonus(new Set([T.COPPER, T.IRON]))).toBe(4);
  });
});

describe('fireManaDamageFactor', () => {
  it('returns 1.0 with no fire mana', () => {
    expect(fireManaDamageFactor(new Set())).toBe(1.0);
  });

  it('returns 1.10 with 1 fire mana mine', () => {
    expect(fireManaDamageFactor(new Set([T.FIRE_MANA]))).toBeCloseTo(1.10);
  });

  it('scales linearly up to 3 mines', () => {
    const counts2 = new Map([[T.FIRE_MANA, 2]]);
    const counts3 = new Map([[T.FIRE_MANA, 3]]);
    expect(fireManaDamageFactor(new Set([T.FIRE_MANA]), counts2)).toBeCloseTo(1.20);
    expect(fireManaDamageFactor(new Set([T.FIRE_MANA]), counts3)).toBeCloseTo(1.30);
  });
});

describe('earthManaHPFactor', () => {
  it('returns 1.0 with no earth mana', () => {
    expect(earthManaHPFactor(new Set())).toBe(1.0);
  });

  it('returns 1.10 with 1 earth mana mine', () => {
    expect(earthManaHPFactor(new Set([T.EARTH_MANA]))).toBeCloseTo(1.10);
  });

  it('scales linearly up to 3 mines', () => {
    const counts3 = new Map([[T.EARTH_MANA, 3]]);
    expect(earthManaHPFactor(new Set([T.EARTH_MANA]), counts3)).toBeCloseTo(1.30);
  });
});

describe('waterManaRegenBonus', () => {
  it('returns 0 with no water mana', () => {
    expect(waterManaRegenBonus(new Set())).toBe(0);
  });

  it('returns 0.05 with 1 water mana mine', () => {
    expect(waterManaRegenBonus(new Set([T.WATER_MANA]))).toBeCloseTo(0.05);
  });

  it('scales linearly up to 3 mines', () => {
    const counts3 = new Map([[T.WATER_MANA, 3]]);
    expect(waterManaRegenBonus(new Set([T.WATER_MANA]), counts3)).toBeCloseTo(0.15);
  });
});

describe('mineralGoldBonus', () => {
  it('returns 0 with no precious metal deposits', () => {
    expect(mineralGoldBonus(new Set())).toBe(0);
  });

  it('returns 2 for 1 silver mine', () => {
    expect(mineralGoldBonus(new Set([T.SILVER]))).toBe(2);
  });

  it('returns 4 for 1 gold deposit mine', () => {
    expect(mineralGoldBonus(new Set([T.GOLD_DEPOSIT]))).toBe(4);
  });

  it('returns 6 for 1 silver and 1 gold deposit', () => {
    expect(mineralGoldBonus(new Set([T.SILVER, T.GOLD_DEPOSIT]))).toBe(6);
  });
});

describe('airManaVisionBonus', () => {
  it('returns 0 with no air mana', () => {
    expect(airManaVisionBonus(new Set())).toBe(0);
  });

  it('returns 1 with 1 air mana mine', () => {
    expect(airManaVisionBonus(new Set([T.AIR_MANA]))).toBe(1);
  });

  it('scales up to +3 at 3 mines', () => {
    const counts3 = new Map([[T.AIR_MANA, 3]]);
    expect(airManaVisionBonus(new Set([T.AIR_MANA]), counts3)).toBe(3);
  });
});

describe('shadowManaVisionReduction', () => {
  it('returns 0 with no shadow mana', () => {
    expect(shadowManaVisionReduction(new Set())).toBe(0);
  });

  it('returns 1 with 1 shadow mana mine', () => {
    expect(shadowManaVisionReduction(new Set([T.SHADOW_MANA]))).toBe(1);
  });

  it('scales up to -3 at 3 mines', () => {
    const counts3 = new Map([[T.SHADOW_MANA, 3]]);
    expect(shadowManaVisionReduction(new Set([T.SHADOW_MANA]), counts3)).toBe(3);
  });
});

describe('lightningManaSpeedBonus', () => {
  it('returns 0 with no lightning mana', () => {
    expect(lightningManaSpeedBonus(new Set())).toBe(0);
  });

  it('returns 1 with 1 lightning mana mine', () => {
    expect(lightningManaSpeedBonus(new Set([T.LIGHTNING_MANA]))).toBe(1);
  });

  it('scales up to +3 at 3 mines', () => {
    const counts3 = new Map([[T.LIGHTNING_MANA, 3]]);
    expect(lightningManaSpeedBonus(new Set([T.LIGHTNING_MANA]), counts3)).toBe(3);
  });
});
