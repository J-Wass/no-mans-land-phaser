import { describe, it, expect } from '@jest/globals';
import {
  weaponTierDamageBonus,
  fireManaDamageFactor,
  earthManaHPFactor,
  waterManaRegenBonus,
  mineralGoldBonus,
  hasAirMana,
  hasShadowMana,
  lightningManaFactor,
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

  it('returns 1.10 with fire mana', () => {
    expect(fireManaDamageFactor(new Set([T.FIRE_MANA]))).toBe(1.10);
  });
});

describe('earthManaHPFactor', () => {
  it('returns 1.0 with no earth mana', () => {
    expect(earthManaHPFactor(new Set())).toBe(1.0);
  });

  it('returns 1.15 with earth mana', () => {
    expect(earthManaHPFactor(new Set([T.EARTH_MANA]))).toBe(1.15);
  });
});

describe('waterManaRegenBonus', () => {
  it('returns 0 with no water mana', () => {
    expect(waterManaRegenBonus(new Set())).toBe(0);
  });

  it('returns 0.05 with water mana', () => {
    expect(waterManaRegenBonus(new Set([T.WATER_MANA]))).toBe(0.05);
  });
});

describe('mineralGoldBonus', () => {
  it('returns 0 with no precious metal deposits', () => {
    expect(mineralGoldBonus(new Set())).toBe(0);
  });

  it('returns 2 for silver', () => {
    expect(mineralGoldBonus(new Set([T.SILVER]))).toBe(2);
  });

  it('returns 4 for gold deposit', () => {
    expect(mineralGoldBonus(new Set([T.GOLD_DEPOSIT]))).toBe(4);
  });

  it('returns 6 for both silver and gold deposit', () => {
    expect(mineralGoldBonus(new Set([T.SILVER, T.GOLD_DEPOSIT]))).toBe(6);
  });
});

describe('hasAirMana', () => {
  it('returns false with no air mana', () => {
    expect(hasAirMana(new Set())).toBe(false);
  });

  it('returns true with air mana', () => {
    expect(hasAirMana(new Set([T.AIR_MANA]))).toBe(true);
  });
});

describe('hasShadowMana', () => {
  it('returns false with no shadow mana', () => {
    expect(hasShadowMana(new Set())).toBe(false);
  });

  it('returns true with shadow mana', () => {
    expect(hasShadowMana(new Set([T.SHADOW_MANA]))).toBe(true);
  });
});

describe('lightningManaFactor', () => {
  it('returns 1.0 with no lightning mana', () => {
    expect(lightningManaFactor(new Set())).toBe(1.0);
  });

  it('returns 1.10 with lightning mana', () => {
    expect(lightningManaFactor(new Set([T.LIGHTNING_MANA]))).toBe(1.10);
  });
});
