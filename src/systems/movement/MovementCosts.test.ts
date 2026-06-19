import { describe, it, expect } from '@jest/globals';
import { stepCost, TERRAIN_BASE_COST } from './MovementCosts';
import { TerrainType } from '@/systems/grid/Territory';
import { UnitType } from '@/entities/units/Unit';
import type { UnitStats } from '@/entities/units/Unit';
import { TerritoryResourceType } from '@/systems/resources/TerritoryResourceType';

const infantryStats: UnitStats = {
  maxHealth: 100, meleeDamage: 10, rangedDamage: 0,
  armorType: 'light', speed: 2, attackRange: 1, vision: 1, upkeep: {},
};

const cavalryStats: UnitStats = {
  maxHealth: 250, meleeDamage: 40, rangedDamage: 0,
  armorType: 'heavy', speed: 3, attackRange: 1, vision: 1, upkeep: {},
};

const scoutStats: UnitStats = {
  maxHealth: 100, meleeDamage: 2, rangedDamage: 0,
  armorType: 'light', speed: 3, attackRange: 1, vision: 2, upkeep: {},
};

describe('stepCost', () => {
  it('infantry (speed=2) on PLAINS costs 25 ticks', () => {
    expect(stepCost(TerrainType.PLAINS, UnitType.INFANTRY, infantryStats)).toBe(25);
  });

  it('infantry on SNOW_FOREST costs 38 ticks', () => {
    expect(stepCost(TerrainType.SNOW_FOREST, UnitType.INFANTRY, infantryStats)).toBe(38);
  });

  it('infantry on FOREST costs 50 ticks', () => {
    expect(stepCost(TerrainType.FOREST, UnitType.INFANTRY, infantryStats)).toBe(50);
  });

  it('infantry on DESERT costs 38 ticks', () => {
    expect(stepCost(TerrainType.DESERT, UnitType.INFANTRY, infantryStats)).toBe(38);
  });

  it('MOUNTAIN is impassable (Infinity)', () => {
    expect(stepCost(TerrainType.MOUNTAIN, UnitType.INFANTRY, infantryStats)).toBe(Infinity);
  });

  it('WATER is impassable (Infinity)', () => {
    expect(stepCost(TerrainType.WATER, UnitType.INFANTRY, infantryStats)).toBe(Infinity);
  });

  it('scout (speed=3) on PLAINS costs 17 ticks', () => {
    expect(stepCost(TerrainType.PLAINS, UnitType.SCOUT, scoutStats)).toBe(17);
  });

  it('cavalry (speed=3) on PLAINS costs 17 ticks', () => {
    expect(stepCost(TerrainType.PLAINS, UnitType.CAVALRY, cavalryStats)).toBe(17);
  });

  it('cavalry has forest penalty — effective speed=1 in FOREST, costs 20 ticks', () => {
    expect(stepCost(TerrainType.FOREST, UnitType.CAVALRY, cavalryStats)).toBe(100);
  });

  it('infantry has no forest penalty', () => {
    // infantry (speed=2) in forest: ceil(100/2) = 50, NOT 100
    expect(stepCost(TerrainType.FOREST, UnitType.INFANTRY, infantryStats)).toBe(50);
  });

  it('all terrains have a base cost defined', () => {
    Object.values(TerrainType).forEach(terrain => {
      expect(TERRAIN_BASE_COST[terrain]).toBeDefined();
    });
  });
});

describe('stepCost — The Wheel (+20% speed multiplier)', () => {
  it('infantry on PLAINS: ceil(50 / (2 * 1.2)) = 21', () => {
    expect(stepCost(TerrainType.PLAINS, UnitType.INFANTRY, infantryStats, undefined, undefined, 1.2)).toBe(21);
  });

  it('cavalry on PLAINS: ceil(50 / (3 * 1.2)) = 14', () => {
    expect(stepCost(TerrainType.PLAINS, UnitType.CAVALRY, cavalryStats, undefined, undefined, 1.2)).toBe(14);
  });

  it('stacks with Lightning mana — both feed the divisor', () => {
    const deposits = new Set([TerritoryResourceType.LIGHTNING_MANA]);
    // (speed 2 + 1 lightning) * 1.2 = 3.6 → ceil(50 / 3.6) = 14
    expect(stepCost(TerrainType.PLAINS, UnitType.INFANTRY, infantryStats, deposits, undefined, 1.2)).toBe(14);
  });

  it('a multiplier of 1 leaves cost unchanged', () => {
    expect(stepCost(TerrainType.PLAINS, UnitType.INFANTRY, infantryStats, undefined, undefined, 1)).toBe(25);
  });
});
