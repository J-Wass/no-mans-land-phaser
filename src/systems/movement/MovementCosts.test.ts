import { describe, it, expect } from '@jest/globals';
import { stepCost, TERRAIN_BASE_COST } from './MovementCosts';
import { TerrainType } from '@/systems/grid/Territory';
import { UnitType } from '@/entities/units/Unit';
import type { UnitStats } from '@/entities/units/Unit';

const infantryStats: UnitStats = {
  maxHealth: 100, meleeDamage: 10, rangedDamage: 0,
  armorType: 'light', speed: 2, attackRange: 1, vision: 1,
};

const cavalryStats: UnitStats = {
  maxHealth: 250, meleeDamage: 40, rangedDamage: 0,
  armorType: 'heavy', speed: 3, attackRange: 1, vision: 1,
};

const scoutStats: UnitStats = {
  maxHealth: 100, meleeDamage: 2, rangedDamage: 0,
  armorType: 'light', speed: 3, attackRange: 1, vision: 2,
};

describe('stepCost', () => {
  it('infantry (speed=2) on PLAINS costs 5 ticks', () => {
    expect(stepCost(TerrainType.PLAINS, UnitType.INFANTRY, infantryStats)).toBe(5);
  });

  it('infantry on HILLS costs 8 ticks', () => {
    expect(stepCost(TerrainType.HILLS, UnitType.INFANTRY, infantryStats)).toBe(8);
  });

  it('infantry on FOREST costs 10 ticks', () => {
    expect(stepCost(TerrainType.FOREST, UnitType.INFANTRY, infantryStats)).toBe(10);
  });

  it('infantry on DESERT costs 8 ticks', () => {
    expect(stepCost(TerrainType.DESERT, UnitType.INFANTRY, infantryStats)).toBe(8);
  });

  it('MOUNTAIN is impassable (Infinity)', () => {
    expect(stepCost(TerrainType.MOUNTAIN, UnitType.INFANTRY, infantryStats)).toBe(Infinity);
  });

  it('WATER is impassable (Infinity)', () => {
    expect(stepCost(TerrainType.WATER, UnitType.INFANTRY, infantryStats)).toBe(Infinity);
  });

  it('scout (speed=3) on PLAINS costs 4 ticks', () => {
    expect(stepCost(TerrainType.PLAINS, UnitType.SCOUT, scoutStats)).toBe(4);
  });

  it('cavalry (speed=3) on PLAINS costs 4 ticks', () => {
    expect(stepCost(TerrainType.PLAINS, UnitType.CAVALRY, cavalryStats)).toBe(4);
  });

  it('cavalry has forest penalty — effective speed=1 in FOREST, costs 20 ticks', () => {
    expect(stepCost(TerrainType.FOREST, UnitType.CAVALRY, cavalryStats)).toBe(20);
  });

  it('infantry has no forest penalty', () => {
    // infantry (speed=2) in forest: ceil(20/2) = 10, NOT 20
    expect(stepCost(TerrainType.FOREST, UnitType.INFANTRY, infantryStats)).toBe(10);
  });

  it('all terrains have a base cost defined', () => {
    Object.values(TerrainType).forEach(terrain => {
      expect(TERRAIN_BASE_COST[terrain]).toBeDefined();
    });
  });
});
